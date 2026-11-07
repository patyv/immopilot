/* Map, comparables, lot studies and private portable backups. */
const opt={reference:null,map:null,markers:null,referenceLayer:null,filtered:[],fitKey:'',lots:[],pendingEnvelope:null,verifiedBackup:null};
function resetReference(refresh=true){opt.reference=null;$('#addressquery').value='';$('#addressmatches').innerHTML='';$('#referenceinfo').textContent='Aucun point de référence : toutes les ventes filtrées de la commune sont comparées.';if(refresh)renderSales()}
function setReference(row,label){const point=ImmoCore.coordinates(row);if(!point)return;opt.reference={...point,mutation:row.id_mutation||null,label:label||'Point choisi sur la carte'};$('#referenceinfo').textContent=`Référence : ${opt.reference.label} · ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}. Le rayon est limité à la commune chargée.`;renderSales()}
function currentComparisonOptions(){return {reference:opt.reference,radius:Number($('#radius').value),area:Number($('#targetarea').value),tolerance:Number($('#tolerance').value),city:$('#city').value.trim(),type:$('#type').value,min:$('#min').value,max:$('#max').value,from:$('#fromdate').value,to:$('#todate').value}}
function addressOf(row){return [row.adresse_numero,row.adresse_suffixe,row.adresse_nom_voie,row.nom_commune].filter(Boolean).join(' ')}
function advancedRenderSales(){
  const rows=ImmoCore.comparableSales(sales,currentComparisonOptions());opt.filtered=rows;
  const values=rows.map(r=>r.sqm),n=rows.length,median=ImmoCore.quantile(values,.5);
  $('#n').textContent=n.toLocaleString('fr-FR');$('#median').textContent=n?money(median):'—';
  const dates=rows.map(r=>r.date_mutation).sort();$('#period').textContent=n?`${dates[0]} → ${dates.at(-1)}`:'—';
  $('#tablecount').textContent=n?`${Math.min(200,n)} ventes affichées sur ${n.toLocaleString('fr-FR')} retenues. ${n<10?'Échantillon faible : médiane fragile.':''} ${opt.reference?'Tri par distance croissante.':'Tri par date décroissante.'} Fourchette observée (quartiles) : ${money(ImmoCore.quantile(values,.25))} à ${money(ImmoCore.quantile(values,.75))}/m².`:'Aucune vente ne correspond à ces critères. Élargissez le rayon, la période ou la tolérance de surface.';
  $('#rows').innerHTML=rows.slice(0,200).map(r=>`<tr><td>${esc(r.date_mutation)}</td><td>${esc(r.nom_commune)}<br><span class="sub">${esc([r.adresse_numero,r.adresse_suffixe,r.adresse_nom_voie].filter(Boolean).join(' '))}</span></td><td>${esc(r.type_local)}</td><td>${r.area} m²</td><td>${money(r.price)}</td><td>${money(r.sqm)}</td><td>${r.distance!==null?Math.round(r.distance)+' m<br>':''}${ImmoCore.coordinates(r)?`<button class="refbutton" data-reference="${esc(r.id_mutation)}">Référence</button>`:'<span class="sub">Sans coordonnées</span>'}</td></tr>`).join('')||'<tr><td colspan="7">Aucune vente à afficher avec ces critères.</td></tr>';
  drawMap();if(typeof updateProfitability==='function')updateProfitability();
}
function initMap(){
  if(opt.map)return true;
  if(typeof L==='undefined'){$('#mapinfo').textContent='Le fond cartographique est indisponible. Le tableau et les filtres restent utilisables.';return false}
  if($('#market').classList.contains('hidden'))return false;
  opt.map=L.map('salesmap',{preferCanvas:true,scrollWheelZoom:false}).setView([46.7,2.4],6);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(opt.map);
  let errors=0;tiles.on('tileerror',()=>{if(++errors>3)$('#mapinfo').textContent='Le fond de carte est momentanément indisponible ; les points DVF et le tableau restent utilisables.'});
  opt.markers=L.layerGroup().addTo(opt.map);opt.referenceLayer=L.layerGroup().addTo(opt.map);
  opt.map.on('click',event=>{
    if(event.originalEvent?.target?.closest?.('.leaflet-popup'))return;
    if(!sales.length){$('#referenceinfo').textContent='Chargez d’abord une commune, puis choisissez votre point de référence.';return}
    setReference({latitude:event.latlng.lat,longitude:event.latlng.lng},'Point choisi sur la carte');
  });
  return true;
}
function fitSalesMap(){
  if(!opt.map)return;const points=opt.filtered.map(ImmoCore.coordinates).filter(Boolean).map(p=>[p.lat,p.lng]);
  if(opt.reference){opt.map.fitBounds(L.latLng(opt.reference.lat,opt.reference.lng).toBounds(Number($('#radius').value)*2),{padding:[20,20],maxZoom:17,animate:false})}
  else if(points.length)opt.map.fitBounds(points,{padding:[25,25],maxZoom:17,animate:false});
}
function drawMap(){
  const located=opt.filtered.filter(r=>ImmoCore.coordinates(r)),missing=opt.filtered.length-located.length;
  $('#mapinfo').textContent=`${Math.min(3000,located.length).toLocaleString('fr-FR')} ventes géolocalisées affichées${located.length>3000?' (limite 3 000, affinez les filtres)':''} · ${missing} sans coordonnées parmi les ventes filtrées.${opt.reference?' Les ventes sans coordonnées sont exclues du rayon.':''} Cliquez sur la carte pour choisir une référence.`;
  if(!initMap())return;
  opt.markers.clearLayers();opt.referenceLayer.clearLayers();
  const q1=ImmoCore.quantile(opt.filtered.map(r=>r.sqm),.25),q3=ImmoCore.quantile(opt.filtered.map(r=>r.sqm),.75);
  located.slice(0,3000).forEach(r=>{
    const p=ImmoCore.coordinates(r),color=r.sqm<q1?'#267657':r.sqm>q3?'#ae5353':'#b48339';
    L.circleMarker([p.lat,p.lng],{radius:5,color,weight:1,fillColor:color,fillOpacity:.65}).bindPopup(`<b>${esc(addressOf(r))}</b><p>${esc(r.date_mutation)} · ${esc(r.type_local)} · ${r.area} m²<br><b>${money(r.price)}</b> · ${money(r.sqm)}/m²</p><button data-reference="${esc(r.id_mutation)}">Prendre comme référence</button>`).addTo(opt.markers);
  });
  if(opt.reference){const p=opt.reference;L.circle([p.lat,p.lng],{radius:Number($('#radius').value),color:'#3452a1',weight:1,fillOpacity:.04,interactive:false}).addTo(opt.referenceLayer);L.circleMarker([p.lat,p.lng],{radius:9,color:'#fff',weight:3,fillColor:'#3452a1',fillOpacity:1}).bindTooltip(esc(p.label)).addTo(opt.referenceLayer)}
  const key=opt.reference?opt.reference.lat+','+opt.reference.lng: sales[0]?.code_commune||'';
  if(opt.fitKey!==key){opt.fitKey=key;fitSalesMap()}
}
function optimizePage(id){if(id==='market')setTimeout(()=>{drawMap();opt.map?.invalidateSize()},0);if(id==='backup')$('#backupcount').textContent=`${projects.length} projet(s), avec les études enregistrées, seront inclus.`}
$('#addressform').onsubmit=event=>{
  event.preventDefault();const query=$('#addressquery').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!sales.length){$('#addressmatches').textContent='Chargez une commune avant de rechercher une adresse.';return}
  if(query.length<2)return;
  const seen=new Set(),matches=[];
  for(const r of sales){const address=addressOf(r),key=address.toLowerCase();if(!ImmoCore.coordinates(r)||seen.has(key)||!key.normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query))continue;seen.add(key);matches.push(r)}
  $('#addressmatches').innerHTML=matches.length?matches.slice(0,20).map(r=>`<button type="button" data-reference="${esc(r.id_mutation)}">${esc(addressOf(r))}</button>`).join('')+(matches.length>20?'<span class="sub">20 adresses affichées : précisez votre recherche.</span>':''):'Aucune adresse géolocalisée correspondante dans les ventes retenues. Précisez la rue ou choisissez un point sur la carte.';
};
$('#market').addEventListener('click',event=>{const button=event.target.closest('[data-reference]');if(!button)return;const row=sales.find(r=>r.id_mutation===button.dataset.reference);if(row){setReference(row,addressOf(row));$('#addressmatches').innerHTML=''}});
$('#clearreference').onclick=()=>{resetReference();$('#targetarea').value='';renderSales()};
$('#fitmap').onclick=fitSalesMap;
['radius','targetarea','tolerance'].forEach(id=>$('#'+id).oninput=renderSales);

function studyValues(){const values=Object.fromEntries(fields.map(([id])=>{const n=Number($('#'+id).value);return [id,Number.isFinite(n)?Math.max(0,n):0]}));values.division=Math.max(0,Number($('#division').value)||0);return values}
function readLots(){return Array.from(document.querySelectorAll('.lotrow')).map(row=>({name:row.querySelector('[data-lot=name]').value.slice(0,120),area:Math.max(0,Number(row.querySelector('[data-lot=area]').value)||0),price:Math.max(0,Number(row.querySelector('[data-lot=price]').value)||0)}))}
function renderLots(){
  $('#lotrows').innerHTML=opt.lots.map((l,i)=>`<div class="lotrow"><div class="lothead"><label>Nom du lot ${i+1}<input data-lot="name" maxlength="120" value="${esc(l.name)}"></label><button class="secondary" data-removelot="${i}" type="button" aria-label="Supprimer le lot ${i+1}">×</button></div><div class="form"><label>Surface vendue (m²)<input data-lot="area" type="number" min="0" step="any" value="${l.area}"></label><label>Prix de revente (€)<input data-lot="price" type="number" min="0" step="any" value="${l.price}"></label></div></div>`).join('');
}
function advancedCalc(){
  const byLots=$('#resalemode').value==='lots';$('#lotpanel').classList.toggle('hidden',!byLots);$('#resale').readOnly=byLots;
  const values=studyValues(),r=ImmoCore.operation(values,opt.lots,byLots);
  if(byLots)$('#resale').value=r.resale;
  $('#profit').textContent=money(r.profit);
  $('#details').innerHTML=[['Prix de revente total',r.resale],['Coût total de l’opération',r.cost],['Dont travaux',r.works],['Dont frais de division',r.extra],['Dont intérêts estimés',r.interest],['Seuil de revente à marge nulle',r.breakeven]].map(([label,value])=>`<div class="line"><span>${label}</span><b>${value===null?'Non calculable':money(value)}</b></div>`).join('');
  $('#ratio').textContent=`${r.margin.toLocaleString('fr-FR',{maximumFractionDigits:1})} % de marge sur coût total · avant fiscalité`;
  $('#scenarios').innerHTML=[-10,-5,0].map(d=>{const resale=r.resale*(1+d/100),scenario=ImmoCore.operation({...values,resale},[],false);const profit=scenario.profit-(byLots?values.division:0);return `<div class="line"><span>Revente ${d===0?'prévue':d+' %'}</span><b>${money(profit)}</b></div>`}).join('');
  const area=opt.lots.reduce((sum,l)=>sum+l.area,0);$('#lotsummary').textContent=`${opt.lots.length} lot(s) · ${area.toLocaleString('fr-FR')} m² vendus · ${money(r.resale)} de revente.${byLots&&Math.abs(area-values.surface)>.5?' La surface vendue diffère de la surface à rénover : vérifiez vos hypothèses.':''}${byLots&&opt.lots.some(l=>l.area<=0||l.price<=0)?' Certains lots ont une surface ou un prix nul : étude incomplète.':''}`;
}
$('#resalemode').onchange=()=>{if($('#resalemode').value==='lots'&&!opt.lots.length){opt.lots=[{name:'Lot 1',area:Number($('#surface').value)||0,price:Number($('#resale').value)||0}];renderLots()}calc()};
$('#division').oninput=calc;
$('#lotrows').oninput=()=>{opt.lots=readLots();calc()};
$('#lotrows').onclick=event=>{const button=event.target.closest('[data-removelot]');if(button){opt.lots=readLots();opt.lots.splice(Number(button.dataset.removelot),1);renderLots();calc()}};
$('#addlot').onclick=()=>{if(opt.lots.length>=50){$('#studystatus').textContent='50 lots maximum.';return}opt.lots=readLots();opt.lots.push({name:'Lot '+(opt.lots.length+1),area:0,price:0});renderLots();calc()};
function updateProjectSelectors(){const selected=$('#studyproject').value;$('#studyproject').innerHTML='<option value="">Choisir un projet</option>'+projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.study?' · étude enregistrée':''}</option>`).join('');if(projects.some(p=>p.id===selected))$('#studyproject').value=selected;$('#backupcount').textContent=`${projects.length} projet(s), avec les études enregistrées, seront inclus.`}
function openStudy(project){
  // Reset every field so an unsaved project's study cannot inherit another study.
  for(const [id,,value] of fields)$('#'+id).value=value;
  $('#purchase').value=project.price;$('#surface').value=project.area;$('#division').value=0;opt.lots=[];$('#resalemode').value='whole';
  if(project.study){try{const study=ImmoCore.validateStudy(project.study);for(const [id,value] of Object.entries(study.values))if($('#'+id))$('#'+id).value=value;opt.lots=study.lots;$('#resalemode').value=study.byLots?'lots':'whole'}catch{$('#studystatus').textContent='L’ancienne étude est invalide ; les valeurs par défaut sont utilisées.'}}
  renderLots();updateProjectSelectors();$('#studyproject').value=project.id;$('#studystatus').textContent=`Étude de « ${project.name} ». Enregistrez après vos modifications.`;calc();go('sim');
}
$('#savestudy').onclick=()=>{
  const project=projects.find(p=>p.id===$('#studyproject').value);if(!project){$('#studystatus').textContent='Choisissez un projet, ou ajoutez d’abord un bien.';return}
  try{project.study=ImmoCore.validateStudy({values:studyValues(),byLots:$('#resalemode').value==='lots',lots:opt.lots});persist();$('#studystatus').textContent=`Étude enregistrée dans « ${project.name} » sur cet appareil.`}catch(error){$('#studystatus').textContent=error.message}
};

function portableSnapshot(){return ImmoCore.validateBackup({version:2,createdAt:new Date().toISOString(),projects})}
function backupButtons(busy){$('#encryptfile').disabled=busy;$('#encryptlink').disabled=busy;$('#backuppassword').disabled=busy}
async function createPrivateBackup(asLink){
  $('#backupstatus').textContent='Chiffrement de la copie…';$('#transferoutput').classList.add('hidden');backupButtons(true);
  try{
    const envelope=await ImmoBackup.encrypt(portableSnapshot(),$('#backuppassword').value);
    if(asLink){$('#transferlink').value=ImmoBackup.toLink(envelope,location.href.split('#')[0]);$('#transferoutput').classList.remove('hidden');$('#backupstatus').textContent='Lien créé. Transférez-le à votre autre appareil et communiquez la phrase secrète séparément.'}
    else{download(envelope,'immopilot-chiffre-'+new Date().toISOString().slice(0,10)+'.json');$('#backupstatus').textContent='Fichier chiffré préparé pour téléchargement. Conservez votre phrase secrète séparément.'}
  }catch(error){$('#backupstatus').textContent=error.message}
  finally{$('#backuppassword').value='';backupButtons(false)}
}
$('#encryptfile').onclick=()=>createPrivateBackup(false);$('#encryptlink').onclick=()=>createPrivateBackup(true);
$('#copytransfer').onclick=async()=>{try{await navigator.clipboard.writeText($('#transferlink').value);$('#backupstatus').textContent='Lien copié. La phrase secrète n’est pas incluse.'}catch{$('#transferlink').focus();$('#transferlink').select();$('#backupstatus').textContent='Copiez manuellement le lien sélectionné.'}};
function clearVerifiedBackup(){opt.verifiedBackup=null;$('#restorepreview').classList.add('hidden')}
$('#encryptedinput').onchange=async event=>{
  clearVerifiedBackup();opt.pendingEnvelope=null;const file=event.target.files[0];if(!file)return;
  try{if(file.size>2*1024*1024)throw Error('Fichier trop volumineux (2 Mo maximum).');opt.pendingEnvelope=JSON.parse(await file.text());$('#incominglabel').textContent='Fichier sélectionné : '+file.name;$('#restorestatus').textContent='Saisissez la phrase secrète puis vérifiez la sauvegarde.'}catch(error){$('#restorestatus').textContent=error.message}
};
$('#decryptbackup').onclick=async()=>{
  clearVerifiedBackup();$('#decryptbackup').disabled=true;
  try{if(!opt.pendingEnvelope)throw Error('Choisissez un fichier chiffré ou ouvrez un lien de transfert.');$('#restorestatus').textContent='Déchiffrement et vérification…';const data=await ImmoBackup.decrypt(opt.pendingEnvelope,$('#restorepassword').value);opt.verifiedBackup=ImmoCore.validateBackup(data);$('#restorecounts').textContent=`${opt.verifiedBackup.projects.length} projet(s) et ${opt.verifiedBackup.projects.filter(p=>p.study).length} étude(s) de simulation. Copie créée le ${opt.verifiedBackup.createdAt||'date inconnue'}.`;$('#restorepreview').classList.remove('hidden');$('#restorestatus').textContent='Copie vérifiée. Choisissez comment l’appliquer.'}catch(error){$('#restorestatus').textContent=error.message}
  finally{$('#restorepassword').value='';$('#decryptbackup').disabled=false}
};
function applyPortable(data,replace){const copy=data.projects.map(p=>({...p,id:newId()}));const next=replace?copy:projects.concat(copy);if(next.length>500)throw Error('Le total dépasserait 500 projets.');projects=next;persist()}
$('#applybackup').onclick=()=>{
  if(!opt.verifiedBackup)return;
  const replace=$('#restorestrategy').value==='replace';
  if(replace&&!confirm('Remplacer tous les projets de cet appareil par cette sauvegarde ? Exportez vos projets actuels si nécessaire.'))return;
  try{applyPortable(opt.verifiedBackup,replace);clearVerifiedBackup();opt.pendingEnvelope=null;$('#encryptedinput').value='';$('#restorestatus').textContent='Projets restaurés sur cet appareil. Les copies présentes sur les autres appareils ne sont pas modifiées.';go('projects')}catch(error){$('#restorestatus').textContent=error.message}
};
// Keep legacy plain files usable while retaining and validating saved lot studies.
$('#export').onclick=()=>{try{download(portableSnapshot(),'immopilot-sauvegarde.json')}catch(error){alert(error.message)}};
$('#restore').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>1024*1024)throw Error('Choisissez un fichier de moins de 1 Mo.');const data=ImmoCore.validateBackup(JSON.parse(await file.text()));if(confirm(`Remplacer les projets actuels par ${data.projects.length} projet(s) de ce fichier en clair ?`))applyPortable(data,true)}catch(error){alert(error.message)}event.target.value='';
};
updateProjectSelectors();renderLots();calc();renderSales();
// Read both a first visit and a same-document link navigation, then remove the fragment.
function receiveTransfer(){
  if(!location.hash.startsWith('#transfer='))return;
  const fragment=location.hash;history.replaceState(null,'',location.pathname+location.search);
  clearVerifiedBackup();opt.pendingEnvelope=null;$('#restorepassword').value='';go('backup');
  try{opt.pendingEnvelope=ImmoBackup.fromFragment(fragment);$('#incominglabel').textContent='Lien de transfert reçu. Saisissez la phrase secrète sur cet appareil.';$('#restorestatus').textContent='La copie attend votre vérification.'}catch(error){$('#restorestatus').textContent=error.message}
}
window.addEventListener('hashchange',receiveTransfer);receiveTransfer();

