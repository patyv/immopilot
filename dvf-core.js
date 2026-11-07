/* DVF parsing and conservative mutation selection; no remote dependencies. */
function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/,1)[0],sep=first.includes(';')?';':',';
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}
    else if(c===sep&&!quote){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}
    else cell+=c;
  }
  if(quote)throw Error('CSV invalide : guillemets non fermés.');
  row.push(cell);if(row.some(Boolean))rows.push(row);
  if(!rows.length)throw Error('Le service a renvoyé un fichier vide.');
  const head=rows.shift().map(x=>x.trim());
  for(const k of ['id_mutation','nature_mutation','valeur_fonciere','surface_reelle_bati','type_local','nom_commune','date_mutation'])if(!head.includes(k))throw Error('Format DVF non reconnu : colonne '+k+' absente.');
  if(rows.some(r=>r.length!==head.length))throw Error('CSV incomplet ou mal formé : chargement refusé.');
  return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]||''])));
}
function analyzeSales(rows){
  const groups=new Map(),seen=new Set();let duplicates=0;
  for(const r of rows){
    if(!r.id_mutation||r.id_mutation==='id_mutation')continue;
    const signature=JSON.stringify(Object.keys(r).filter(k=>k!=='__id').sort().map(k=>[k,r[k]]));
    if(seen.has(signature)){duplicates++;continue}seen.add(signature);
    if(!groups.has(r.id_mutation))groups.set(r.id_mutation,[]);
    groups.get(r.id_mutation).push(r);
  }
  const sales=[];
  for(const g of groups.values()){
    const homes=g.filter(r=>['Maison','Appartement'].includes(r.type_local));
    if(homes.length!==1)continue;
    const r=homes[0],price=Number(r.valeur_fonciere),area=Number(r.surface_reelle_bati);
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(area)||area<=0||!/^\d{4}-\d{2}-\d{2}$/.test(r.date_mutation))continue;
    if(g.some(x=>x.nature_mutation!=='Vente'||Number(x.valeur_fonciere)!==price||x.date_mutation!==r.date_mutation||!['Maison','Appartement','Dépendance'].includes(x.type_local)))continue;
    // Different dispositions or parcels can include multiple properties in the price.
    if(g.some(x=>x.numero_disposition!==r.numero_disposition||x.id_parcelle!==r.id_parcelle))continue;
    sales.push({...r,price,area,sqm:price/area});
  }
  return {sales,duplicates,mutations:groups.size,excluded:groups.size-sales.length};
}
function prepareSales(rows){return analyzeSales(rows).sales}
if(typeof module!=='undefined')module.exports={parseCSV,analyzeSales,prepareSales};

