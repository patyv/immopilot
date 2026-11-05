/* Direct connection to the same public services as the official DVF explorer. */
const DVF_API='https://dvf-api.data.gouv.fr';
const GEO_API='https://geo.api.gouv.fr';
let communeSearch=null,dataRequest=null,communes=[],dataTicket=0;
const dvfCache=new Map();
function clearMarket(){sales=[];$('#salescount').textContent='0';$('#city').value='';$('#fromdate').value='';$('#todate').value='';$('#sourceinfo').textContent='';$('#markettitle').textContent='Ventes à comparer';renderSales()}
function onlineBusy(busy){$('#loadsales').disabled=busy;$('#quickpoissy').disabled=busy;$('#canceldata').classList.toggle('hidden',!busy)}
async function findCommunes(event){
  event.preventDefault();const query=$('#communequery').value.trim();if(query.length<2)return;
  communeSearch?.abort();const controller=new AbortController();communeSearch=controller;
  $('#communechoices').classList.add('hidden');$('#communehelp').textContent='Recherche des communes…';
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const params=new URLSearchParams({fields:'nom,code,codesPostaux',limit:'12'});
    if(/^\d{5}$/.test(query))params.set('codePostal',query);else{params.set('nom',query);params.set('boost','population')}
    const response=await fetch(`${GEO_API}/communes?${params}`,{signal:controller.signal});
    if(!response.ok)throw Error('La recherche de communes est momentanément indisponible.');
    const list=await response.json();if(!Array.isArray(list))throw Error('Réponse des communes non reconnue.');
    if(communeSearch!==controller)return;
    communes=list.filter(c=>/^[0-9A-Z]{5}$/.test(c.code)&&typeof c.nom==='string');
    $('#communechoice').innerHTML=communes.map((c,i)=>`<option value="${i}">${esc(c.nom)} · ${esc((c.codesPostaux||[]).join(', '))} · INSEE ${esc(c.code)}</option>`).join('');
    $('#communechoices').classList.toggle('hidden',!communes.length);
    $('#communehelp').textContent=communes.length?`${communes.length} commune(s) trouvée(s). Choisissez la commune puis chargez ses ventes.`:'Aucune commune trouvée. Essayez un autre nom ou vérifiez le code postal.';
  }catch(error){if(communeSearch===controller)$('#communehelp').textContent=error.name==='AbortError'?'Recherche interrompue. Vous pouvez réessayer.':error.message}
  finally{clearTimeout(timer)}
}
async function readLimitedCSV(response,signal,onProgress){
  const max=35*1024*1024;
  if(Number(response.headers.get('content-length'))>max)throw Error('Commune trop volumineuse pour ce navigateur (limite 35 Mo). Utilisez un extrait CSV plus ciblé.');
  if(!response.body)throw Error('Votre navigateur ne permet pas de lire ce téléchargement. Essayez un navigateur récent.');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0;const parts=[];
  try{
    while(true){
      if(signal.aborted)throw new DOMException('Annulé','AbortError');
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>max)throw Error('Commune trop volumineuse (limite 35 Mo). Aucun résultat partiel n’est utilisé.');
      parts.push(decoder.decode(value,{stream:true}));onProgress(size);
    }
    parts.push(decoder.decode());return parts.join('');
  }catch(error){await reader.cancel().catch(()=>{});throw error}
  finally{reader.releaseLock()}
}
function applyDataset(raw,commune,origin,loadedAt){
  const result=analyzeSales(raw);sales=result.sales;
  $('#salescount').textContent=sales.length.toLocaleString('fr-FR');
  $('#markettitle').textContent=commune?`Ventes à ${commune.nom}`:'Extrait DVF importé';
  $('#status').textContent=`${raw.length.toLocaleString('fr-FR')} lignes reçues · ${result.duplicates.toLocaleString('fr-FR')} doublons exacts retirés · ${result.mutations.toLocaleString('fr-FR')} mutations distinctes · ${sales.length.toLocaleString('fr-FR')} ventes comparables retenues (${result.excluded.toLocaleString('fr-FR')} mutations exclues).`;
  const dates=raw.map(r=>r.date_mutation).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  $('#sourceinfo').textContent=`${origin} · ${commune?'INSEE '+commune.code+' · ':''}Chargé le ${new Date(loadedAt).toLocaleString('fr-FR')} · Période reçue : ${dates.length?dates[0]+' au '+dates.at(-1):'aucune vente'}.`;
  if(!raw.length)$('#status').textContent='Aucune vente renvoyée par le service pour cette commune. Certains territoires ne sont pas couverts par DVF.';
  else if(!sales.length)$('#status').textContent+=' Aucune mutation ne satisfait les critères de comparaison ; cela ne signifie pas qu’il n’y a aucune vente.';
  renderSales();
}
async function loadCommune(commune){
  if(!commune||!/^[0-9A-Z]{5}$/.test(commune.code))return;
  dataRequest?.abort();const controller=new AbortController();dataRequest=controller;const ticket=++dataTicket;
  clearMarket();onlineBusy(true);$('#status').textContent=`Connexion à DVF pour ${commune.nom}…`;
  const timer=setTimeout(()=>controller.abort(),90000);
  try{
    const cached=dvfCache.get(commune.code);
    if(cached&&Date.now()-cached.loadedAt<10*60*1000){applyDataset(cached.raw,commune,'API officielle data.gouv.fr (cache de moins de 10 min)',cached.loadedAt);return}
    const url=`${DVF_API}/dvf/csv/?${new URLSearchParams({com:commune.code})}`;
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw Error(`Le service DVF est indisponible (HTTP ${response.status}). Réessayez dans quelques instants.`);
    const text=await readLimitedCSV(response,controller.signal,bytes=>{if(ticket===dataTicket)$('#status').textContent=`Réception des ventes de ${commune.nom} : ${(bytes/1024/1024).toFixed(1)} Mo…`});
    if(ticket!==dataTicket)return;
    $('#status').textContent='Vérification des mutations et calcul des indicateurs…';
    const raw=parseCSV(text);
    // A geographic response must never silently populate the wrong commune.
    const codes=commune.code==='75056'?Array.from({length:20},(_,i)=>`751${String(i+1).padStart(2,'0')}`):commune.code==='69123'?Array.from({length:9},(_,i)=>'6938'+(i+1)):commune.code==='13055'?Array.from({length:16},(_,i)=>`132${String(i+1).padStart(2,'0')}`):[commune.code];
    if(raw.some(r=>r.id_mutation!=='id_mutation'&&!codes.includes(r.code_commune)))throw Error('Le service a renvoyé des données hors de la commune demandée. Chargement refusé.');
    const loadedAt=Date.now();applyDataset(raw,commune,'Source : DGFiP / Etalab, API officielle data.gouv.fr',loadedAt);
    dvfCache.set(commune.code,{raw,loadedAt});if(dvfCache.size>2)dvfCache.delete(dvfCache.keys().next().value);
  }catch(error){
    if(ticket!==dataTicket)return;
    $('#status').textContent=error.name==='AbortError'?'Chargement annulé ou délai dépassé. Cliquez à nouveau sur « Charger les ventes DVF » pour réessayer.':error.message;
    $('#sourceinfo').textContent='Aucun résultat partiel ou fictif n’est affiché.';
  }finally{clearTimeout(timer);if(ticket===dataTicket)onlineBusy(false)}
}
$('#communeform').onsubmit=findCommunes;
$('#loadsales').onclick=()=>loadCommune(communes[Number($('#communechoice').value)]);
$('#quickpoissy').onclick=()=>loadCommune({nom:'Poissy',code:'78498'});
$('#canceldata').onclick=()=>dataRequest?.abort();
$('#csv').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  dataRequest?.abort();const ticket=++dataTicket;onlineBusy(false);clearMarket();
  try{
    if(file.size>20*1024*1024)throw Error('Choisissez un extrait de moins de 20 Mo.');
    const text=await file.text();if(ticket!==dataTicket)return;
    applyDataset(parseCSV(text),null,`Import personnel : ${file.name} (la complétude de l’extrait n’est pas vérifiable)`,Date.now());
  }catch(error){if(ticket===dataTicket)$('#status').textContent=error.message}
  event.target.value='';
};
