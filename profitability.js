/* A cost-based estimated margin, not a promise of resale or a listing feed. */
const dealState={result:null,source:null,priceM2:null,fingerprint:null,savedFingerprint:null,savedId:null};
const dealNumbers=['purchase','surface','fees','acqAgency','work','reserve','other','loan','rate','months','holding','agency','haircut','goal'];
function dealPercent(value){
  let digits=2;const goal=Number($('#deal-goal').value)||0;
  if(value<goal&&Number(value.toFixed(2))>=goal)digits=6;
  return value.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:digits})+' %';
}
function dealReference(){
  const mode=$('#deal-reference').value,area=Number($('#deal-surface').value)||0;
  $('#deal-pricem2').readOnly=mode!=='manual';$('#deal-tolerance').disabled=mode==='manual';
  if(mode==='manual')return {price:Number($('#deal-pricem2').value)||null,count:0,manual:true,description:'Prix au m² saisi manuellement : aucune validation par les ventes DVF.'};
  if(!sales.length||area<=0)return {price:null,count:0,manual:false,description:!sales.length?'Chargez une commune pour calculer un prix de référence, ou choisissez une saisie manuelle.':'Indiquez la surface du bien pour sélectionner des comparables de même type et de surface proche.'};
  const options={...currentComparisonOptions(),area,tolerance:Number($('#deal-tolerance').value),type:$('#deal-type').value};
  const rows=ImmoCore.comparableSales(sales,options).filter(r=>!opt.reference?.mutation||r.id_mutation!==opt.reference.mutation);
  const prices=rows.map(r=>r.sqm),mean=prices.length?prices.reduce((sum,p)=>sum+p,0)/prices.length:null;
  const price=mode==='mean'?mean:ImmoCore.quantile(prices,.5),name=mode==='mean'?'Moyenne arithmétique des prix au m²':'Médiane des prix au m²';
  const locations=[...new Set(rows.map(r=>r.nom_commune))].slice(0,3).join(', ');
  const period=rows.map(r=>r.date_mutation).sort();
  return {price,count:rows.length,manual:false,description:`${name} · ${rows.length} ventes de type ${$('#deal-type').value.toLowerCase()} · surface ${area} m² ± ${options.tolerance} %${locations?' · '+locations:''}${opt.reference?' · rayon de '+Number($('#radius').value)+' m':' · commune chargée sans rayon de proximité'}${period.length?' · ventes du '+period[0]+' au '+period.at(-1):''}. ${rows.length<10?'Échantillon insuffisant pour conclure : moins de 10 comparables.':''}${opt.reference?.mutation?' La vente utilisée comme référence est exclue du calcul.':''}`};
}
function resetDealOutput(message){
  dealState.result=null;dealState.fingerprint=null;
  for(const id of ['resale','total','profit','margin','ceiling'])$('#deal-'+id).textContent='—';
  $('#deal-badge').className='profit-badge neutral';$('#deal-badge').textContent='Estimation incomplète';$('#deal-message').textContent=message;
  $('#deal-breakdown').innerHTML='';$('#deal-save').disabled=true;$('#deal-simulate').disabled=true;
}
function updateProfitability(){
  const source=dealReference();dealState.source=source;dealState.priceM2=source.price;
  $('#deal-source').textContent=source.description;$('#deal-source').classList.toggle('deal-source-weak',source.manual||source.count<10);
  if(!source.manual)$('#deal-pricem2').value=source.price?Number(source.price.toFixed(2)):'';
  let input={priceM2:source.price};
  for(const id of dealNumbers)input[id]=Number($('#deal-'+id).value);
  if(!source.price){resetDealOutput(source.manual?'Renseignez un prix au m² positif pour votre scénario.':'Aucun prix de référence exploitable. Chargez une commune, indiquez la surface ou élargissez les filtres.');return}
  try{
    if(source.manual&&!$('#deal-pricem2').validity.valid)throw Error('Vérifiez le prix de référence au m² saisi.');
    for(const id of dealNumbers){const control=$('#deal-'+id);if(!control.validity.valid)throw Error('Vérifiez le champ « '+control.parentElement.textContent.trim()+' ».')}
    const r=ImmoCore.assessDeal(input);dealState.result=r;dealState.fingerprint=JSON.stringify({name:$('#deal-name').value,type:$('#deal-type').value,input,source:source.description});
    $('#deal-resale').textContent=money(r.resale);$('#deal-total').textContent=money(r.cost);$('#deal-profit').textContent=money(r.profit);$('#deal-margin').textContent=dealPercent(r.margin);
    $('#deal-ceiling').textContent=r.maxPurchase===null?'Aucun prix compatible':money(Math.floor(r.maxPurchase));
    const reliable=!source.manual&&source.count>=10,badge=$('#deal-badge');
    badge.className='profit-badge '+(r.meetsTarget?(reliable?'good':'warn'):(r.profit<0?'bad':'warn'));
    badge.textContent=r.meetsTarget?(reliable?'Objectif de '+dealPercent(r.target)+' estimé atteint':'Objectif atteint sous hypothèses à confirmer'):(r.profit<0?'Marge estimée négative':'Objectif de '+dealPercent(r.target)+' non atteint');
    const qualifier=source.manual?'Le prix de revente repose sur votre saisie manuelle.':source.count<10?'Moins de 10 comparables : cette estimation est fragile.':'La revente reste estimative, sans correction de l’état du bien.';
    $('#deal-message').textContent=`${r.meetsTarget?'La marge calculée atteint':'La marge calculée reste sous'} votre seuil de ${dealPercent(r.target)} sur le coût total. ${qualifier} ${r.maxPurchase===null?'Même un prix d’achat nul ne permettrait pas l’objectif avec ces autres coûts.':'Le plafond d’achat affiché est arrondi à l’euro inférieur, à frais fixes et montant emprunté inchangés.'}`;
    const items=[['Prix d’achat hors frais',input.purchase],['Frais d’acquisition / notaire',input.purchase*input.fees/100],['Honoraires d’agence supplémentaires à l’achat',input.acqAgency],['Travaux',r.works],['Aléas sur travaux',r.workReserve],['Intérêts estimés',r.interest],['Charges de portage',r.holdingTotal],['Autres frais fixes',input.other],['Frais de revente',r.selling],['Coût total estimé',r.cost]];
    $('#deal-breakdown').innerHTML=items.map(([label,value])=>`<div class="line"><span>${label}</span><b>${money(value)}</b></div>`).join('');
    $('#deal-save').disabled=false;$('#deal-simulate').disabled=false;
  }catch(error){resetDealOutput(error.message)}
}
function saveAssessedDeal(open=false){
  if(!dealState.result)return;
  try{
    let project=dealState.savedFingerprint===dealState.fingerprint?projects.find(p=>p.id===dealState.savedId):null;
    if(!project){
      if(projects.length>=500)throw Error('500 projets maximum. Exportez une sauvegarde avant de supprimer des projets.');
      const r=dealState.result,values=r.values,source=dealState.source;
      project={id:newId(),name:$('#deal-name').value.trim()||`${$('#deal-type').value} · ${sales[0]?.nom_commune||'scénario manuel'}`,price:values.purchase,area:values.surface,stage:'À étudier',notes:`Étude de marge au m² avant fiscalité. ${source.description}\nRevente estimée : ${money(r.resale)}. Marge estimée : ${dealPercent(r.margin)}. Objectif : ${dealPercent(r.target)}.\nHonoraires supplémentaires à l’achat : ${money(values.acqAgency)} (inclus dans « autres frais » du simulateur).`,study:ImmoCore.validateStudy({values,byLots:false,lots:[]})};
      const validated=ImmoCore.validateBackup({version:2,projects:[project]}).projects[0];project={...validated,id:project.id};projects.push(project);persist();dealState.savedId=project.id;dealState.savedFingerprint=dealState.fingerprint;
    }
    $('#deal-save-status').textContent=`Opération enregistrée dans « ${project.name} », avec toutes les hypothèses. Les frais d’agence à l’achat sont inclus dans les autres frais du simulateur.`;
    if(open)openStudy(project);
  }catch(error){$('#deal-save-status').textContent=error.message}
}
$('#profitability').addEventListener('input',event=>{if(event.target.matches('input,select')){$('#deal-save-status').textContent='';updateProfitability()}});
$('#profitability').addEventListener('change',event=>{if(event.target.matches('select'))updateProfitability()});
$('#deal-save').onclick=()=>saveAssessedDeal(false);$('#deal-simulate').onclick=()=>saveAssessedDeal(true);
$('#deal-simulate').textContent='Enregistrer et ouvrir le simulateur';
updateProfitability();
