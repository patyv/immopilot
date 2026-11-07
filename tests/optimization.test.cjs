const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../optimization-core.js'),backup=require('../backup-crypto.js');
const home={id_mutation:'a',date_mutation:'2025-02-01',nom_commune:'Poissy',type_local:'Maison',latitude:'48.93',longitude:'2.04',area:100,sqm:4000,price:400000};
test('distance and coordinates reject empty fields',()=>{assert.equal(core.coordinates({latitude:'',longitude:''}),null);assert.equal(core.coordinates({latitude:'95',longitude:'2'}),null);assert.equal(core.distanceMeters({lat:48.93,lng:2.04},{lat:48.93,lng:2.04}),0);assert(Math.abs(core.distanceMeters({lat:0,lng:0},{lat:0,lng:1})-111195)<2)});
test('comparables combine type, date, area and real distance, missing positions excluded from radius',()=>{const rows=[home,{...home,id_mutation:'b',latitude:'48.94'},{...home,id_mutation:'c',latitude:''},{...home,id_mutation:'d',area:130},{...home,id_mutation:'e',type_local:'Appartement'}];const r=core.comparableSales(rows,{reference:{lat:48.93,lng:2.04},radius:500,area:100,tolerance:20,type:'Maison',from:'2025-01-01'});assert.deepEqual(r.map(x=>x.id_mutation),['a']);assert.equal(core.comparableSales(rows,{from:'2026-01-01'}).length,0)});
test('median and quartiles interpolate, sorting does not mutate inputs',()=>{const x=[4,1,3,2];assert.equal(core.quantile(x,.5),2.5);assert.equal(core.quantile(x,.25),1.75);assert.deepEqual(x,[4,1,3,2]);assert.equal(core.quantile([],.5),null)});
const values={purchase:250000,surface:90,work:700,fees:8,other:6000,reserve:10,loan:200000,rate:4,months:12,holding:200,resale:390000,agency:3,division:12000};
test('whole resale preserves the original verified margin',()=>{const r=core.operation(values,[],false);assert.equal(r.profit,22600);assert.equal(r.cost,367400)});
test('lot resale counts division once, aggregates lots, and breakeven equals zero margin',()=>{const lots=[{name:'A',area:50,price:230000},{name:'B',area:40,price:200000}],r=core.operation(values,lots,true);assert.equal(r.resale,430000);assert.equal(r.extra,12000);assert.equal(r.cost,380600);assert.equal(r.profit,49400);const zero=core.operation({...values,resale:r.breakeven,other:values.other+12000},[],false);assert(Math.abs(zero.profit)<1e-8);assert.equal(core.operation({...values,agency:100}).breakeven,null)});
const project={id:'p',name:'Projet fictif de test',price:250000,area:90,notes:'Exemple',stage:'À étudier',study:{values,byLots:true,lots:[{name:'Lot 1',price:430000,area:90}]}};
test('backup validation keeps studies and supports version 1',()=>{const r=core.validateBackup({version:2,projects:[project]});assert.equal(r.projects[0].study.values.division,12000);assert.equal(r.projects[0].study.lots[0].price,430000);assert.equal(core.validateBackup({version:1,projects:[{...project,study:undefined}]}).version,2);assert.throws(()=>core.validateBackup({version:2,projects:[{...project,price:-1}]}));assert.throws(()=>core.validateBackup({version:2,projects:[{...project,study:{values:{work:Infinity}}}]}))});
test('encrypted backup round trips, wrong password/tampering fail, salt and IV are random',async()=>{const data=core.validateBackup({version:2,projects:[project]}),pass='Phrase fictive pour les tests 2026',one=await backup.encrypt(data,pass),two=await backup.encrypt(data,pass);assert.notEqual(one.salt,two.salt);assert.notEqual(one.iv,two.iv);assert.deepEqual(await backup.decrypt(one,pass),data);await assert.rejects(()=>backup.decrypt(one,'Mauvaise phrase'));const changed={...one,ciphertext:(one.ciphertext[0]==='A'?'B':'A')+one.ciphertext.slice(1)};await assert.rejects(()=>backup.decrypt(changed,pass));const link=backup.toLink(one,'https://patyv.github.io/immopilot/');assert(!link.includes(pass));assert.deepEqual(backup.fromFragment(new URL(link).hash),one);assert.equal(new URL(link).pathname,'/immopilot/');await assert.rejects(()=>backup.encrypt(data,'court'));await assert.rejects(()=>backup.decrypt({...one,iterations:1},pass))});


test('deal margin includes acquisition fees and is not just a market discount',()=>{
 const base={purchase:200000,surface:100,priceM2:2200,fees:8,acqAgency:0,work:0,reserve:10,other:0,loan:0,rate:4,months:12,holding:0,agency:3,haircut:0,goal:10};
 const r=core.assessDeal(base);assert.equal(r.resale,220000);assert.equal(r.acquisition,16000);assert.equal(r.selling,6600);assert.equal(r.cost,222600);assert.equal(r.profit,-2600);assert.equal(r.meetsTarget,false);
});
test('deal target uses unrounded margin at and immediately below 10 percent',()=>{
 const x={purchase:100000,surface:100,priceM2:1100,goal:10};assert.equal(core.assessDeal(x).margin,10);assert.equal(core.assessDeal(x).meetsTarget,true);assert.equal(core.assessDeal({...x,priceM2:1099.99}).meetsTarget,false);
});
test('acquisition agency is counted once and survives the ordinary simulator study format',()=>{
 const x={purchase:200000,surface:70,priceM2:4000,fees:8,acqAgency:5000,other:2000,work:300,reserve:10,loan:150000,rate:4,months:12,holding:100,agency:3,haircut:5,goal:10};
 const r=core.assessDeal(x);assert.equal(r.resale,266000);assert.equal(r.acquisition,21000);assert.equal(r.works,21000);assert.equal(r.workReserve,2100);assert.equal(r.interest,6000);assert.equal(r.holdingTotal,1200);assert.equal(r.selling,7980);assert.equal(r.cost,261280);assert.equal(r.profit,4720);
 const saved=core.validateStudy({values:r.values,byLots:false,lots:[]});assert.equal(core.operation(saved.values).profit,r.profit);
});
test('maximum purchase price reaches target; one euro more no longer does, financing held fixed',()=>{
 const x={purchase:200000,surface:70,priceM2:4000,fees:8,acqAgency:3000,other:1000,work:250,reserve:10,loan:150000,rate:4,months:12,holding:100,agency:3,haircut:5,goal:10};
 const r=core.assessDeal(x),at=core.assessDeal({...x,purchase:r.maxPurchase});assert(Math.abs(at.margin-10)<1e-8);assert.equal(core.assessDeal({...x,purchase:r.maxPurchase+1}).meetsTarget,false);assert.equal(core.assessDeal({...x,purchase:Math.floor(r.maxPurchase)}).meetsTarget,true);
});
test('unattainable target and invalid estimates have no misleading acquisition ceiling',()=>{
 assert.equal(core.assessDeal({purchase:1000,surface:1,priceM2:100,other:200,goal:10}).maxPurchase,null);
 for(const input of [{purchase:0,surface:1,priceM2:100},{purchase:1,surface:1,priceM2:Infinity},{purchase:1,surface:1,priceM2:100,haircut:100},{purchase:1,surface:1,priceM2:100,agency:100}])assert.throws(()=>core.assessDeal(input));
});
