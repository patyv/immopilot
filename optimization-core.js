/* Pure calculation and validation routines shared by the UI and tests. */
(function(root){
  const finite=(v)=>Number.isFinite(Number(v));
  function coordinates(row){
    if(row.latitude==null||row.longitude==null||String(row.latitude).trim()===''||String(row.longitude).trim()==='')return null;
    const lat=Number(row.latitude),lng=Number(row.longitude);
    return finite(lat)&&finite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
  }
  function distanceMeters(a,b){
    const rad=x=>x*Math.PI/180,dy=rad(b.lat-a.lat),dx=rad(b.lng-a.lng);
    const h=Math.sin(dy/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dx/2)**2;
    return 6371008.8*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
  }
  function comparableSales(rows,opts={}){
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const target=Number(opts.area)||0,tolerance=(Number(opts.tolerance)||20)/100;
    return rows.flatMap(r=>{
      if(opts.city&&!norm(r.nom_commune).includes(norm(opts.city)))return [];
      if(opts.type&&r.type_local!==opts.type)return [];
      if(r.area<(Number(opts.min)||0)||r.area>(Number(opts.max)||Infinity))return [];
      if(opts.from&&r.date_mutation<opts.from||opts.to&&r.date_mutation>opts.to)return [];
      if(target>0&&(r.area<target*(1-tolerance)||r.area>target*(1+tolerance)))return [];
      const pos=coordinates(r),distance=opts.reference&&pos?distanceMeters(opts.reference,pos):null;
      if(opts.reference&&(distance===null||distance>(Number(opts.radius)||1000)))return [];
      return [{...r,distance}];
    }).sort((a,b)=>opts.reference?(a.distance-b.distance||b.date_mutation.localeCompare(a.date_mutation)):b.date_mutation.localeCompare(a.date_mutation));
  }
  function quantile(values,q){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),n=(s.length-1)*q,i=Math.floor(n);return s[i]+(s[Math.ceil(n)]-s[i])*(n-i)}
  function operation(values,lots=[],byLots=false){
    const v=Object.fromEntries(Object.entries(values).map(([k,n])=>[k,Number(n)||0]));
    const resale=byLots?lots.reduce((s,l)=>s+Math.max(0,Number(l.price)||0),0):v.resale;
    const extra=byLots?Math.max(0,v.division||0):0;
    const works=v.surface*v.work,interest=v.loan*v.rate/100*v.months/12;
    const cost=v.purchase+v.purchase*v.fees/100+works+works*v.reserve/100+v.other+interest+v.holding*v.months+extra+resale*v.agency/100;
    const costBeforeSelling=cost-resale*v.agency/100;
    const breakeven=v.agency<100?costBeforeSelling/(1-v.agency/100):null;
    return {resale,cost,profit:resale-cost,works,interest,extra,breakeven,margin:cost>0?(resale-cost)/cost*100:0};
  }
  const fields=['purchase','surface','work','fees','other','reserve','loan','rate','months','holding','resale','agency','division'];
  function validateStudy(study){
    if(!study||typeof study!=='object')return undefined;
    const values={};for(const key of fields){const n=study.values?.[key];if(n!==undefined){if(!finite(n)||Number(n)<0||Number(n)>1e12)throw Error('Hypothèse de simulation invalide.');values[key]=Number(n)}}
    const lots=(study.lots||[]);if(!Array.isArray(lots)||lots.length>50)throw Error('Liste de lots invalide.');
    return {values,byLots:study.byLots===true,lots:lots.map(l=>{if(!finite(l.price)||Number(l.price)<0||Number(l.price)>1e12||!finite(l.area)||Number(l.area)<0||Number(l.area)>1e8)throw Error('Lot invalide.');return {name:String(l.name||'Lot').slice(0,120),price:Number(l.price),area:Number(l.area)}})};
  }
  function validateBackup(data){
    if(!data||![1,2].includes(data.version)||!Array.isArray(data.projects)||data.projects.length>500)throw Error('Sauvegarde non reconnue (500 projets maximum).');
    const stages=['À étudier','À visiter','Offre','Compromis','Travaux','Revente'];
    const projects=data.projects.map(p=>{
      if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>200||!finite(p.price)||Number(p.price)<0||Number(p.price)>1e12||!finite(p.area)||Number(p.area)<=0||Number(p.area)>1e8||!stages.includes(p.stage))throw Error('Un projet de la sauvegarde est invalide.');
      if(String(p.notes||'').length>5000)throw Error('Notes trop longues.');
      return {id:typeof p.id==='string'?p.id.slice(0,100):'',name:p.name,price:Number(p.price),area:Number(p.area),notes:String(p.notes||''),stage:p.stage,study:validateStudy(p.study)};
    });
    return {version:2,createdAt:String(data.createdAt||''),projects};
  }
  function assessDeal(input){
    const keys=['purchase','surface','work','fees','other','reserve','loan','rate','months','holding','agency','acqAgency','priceM2','haircut','goal'];
    const v={};for(const k of keys){v[k]=Number(input[k]??0);if(!Number.isFinite(v[k])||v[k]<0||v[k]>1e12)throw Error('Renseignez des montants et taux positifs et finis.');}
    if(v.surface<=0||v.purchase<=0||v.priceM2<=0)throw Error('Renseignez le prix d’achat, la surface et un prix de référence au m² positifs.');
    if(v.agency>=100||v.haircut>=100||v.goal>1000||v.fees>100||v.rate>100||v.reserve>1000)throw Error('Vérifiez les taux : revente et décote doivent rester inférieurs à 100 %.');
    const resale=v.priceM2*v.surface*(1-v.haircut/100),values={...v,other:v.other+v.acqAgency,resale};
    const r=operation(values,[],false),fixedCosts=r.cost-v.purchase*(1+v.fees/100);
    const ceiling=(resale/(1+v.goal/100)-fixedCosts)/(1+v.fees/100);
    return {...r,values,acquisition:v.purchase*v.fees/100+v.acqAgency,workReserve:r.works*v.reserve/100,holdingTotal:v.holding*v.months,selling:resale*v.agency/100,maxPurchase:ceiling>=0?ceiling:null,target:v.goal,meetsTarget:r.margin+1e-9>=v.goal,gap:r.profit-r.cost*v.goal/100};
  }
  const api={coordinates,distanceMeters,comparableSales,quantile,operation,validateBackup,validateStudy,assessDeal};
  root.ImmoCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

