'use strict';
const assert=require('node:assert/strict');
const C=require('../src/assets/sim'), E=require('../src/assets/engine'), T=require('../src/assets/turbo');
const W=require('../data/roster/workshop.json'), V=require('../src/assets/vehicle-assets');
const fixture=require('./fixtures/workshop-physics-baseline.json');
const ids=V.ids.filter(x=>x!=='scirocco'), clone=x=>JSON.parse(JSON.stringify(x));
const close=(a,b,tol,label)=>assert(Math.abs(a-b)<=tol,`${label}: ${a} != ${b}`);
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('PASS workshop:',name);};
let account=C.restoreGarageState(C.createCareerSelection());account.starterSelection='complete';account.bank=10000000;
const original=C.captureBuild(account), initialMoney=account.bank;
test('all five priced, purchasable exactly once, and research prices untouched',()=>{
 for(const id of ids){
  const price=C.rosterCarPrice(id), before=account.bank;
  assert(price.eur>0);assert.equal(C.buyRosterCar({...account,bank:price.eur-1},id).ok,false);
  const result=C.buyRosterCar(account,id);assert(result.ok);account={...account,bank:result.bank,garage:result.garage};
  assert.equal(account.bank,before-price.eur);assert.equal(C.buyRosterCar(account,id).ok,false);
  if(['eagle','mullet','mcflurry'].includes(id)){assert(price.gamePrice);assert.equal(price.usd,null);assert(!C.rosterCarData(id).price);}
 }
 assert.equal(account.bank,initialMoney-ids.reduce((n,id)=>n+C.rosterCarPrice(id).eur,0));
 assert.equal(C.rosterCarPrice('lumberjack').eur,6602);assert.equal(C.rosterCarPrice('crc12_jackstand_240').eur,12231);
});
const dynos={}, runs={};
for(const id of ids){
 test(`${id}: complete compatible V8 build and real physical data`,()=>{
  account=C.switchGarageCar(account,id); const s=account;
  assert.equal(s.workshopCarId,id);assert.equal(s.rosterCar.id,id);assert(!s.rosterCar.engine,'player must use fitted hardware, not fixed reference curve');
  assert.equal(C.engineGeometry(s).cylinders,8);assert.equal(C.selectionCompatibility(s,s.selections).ok,true);
  assert.equal(C.categoriesFor(s).length,C.CATEGORIES.length);
  assert(!C.compatibleParts(s,'block').some(p=>p.id==='randy_je83'));
  assert(!C.compatibleParts(s,'head').some(p=>p.id==='oem_head'));
  assert(E.DATA.heads[s.selections.head]);assert(E.DATA.fuelSystems[s.selections.fuelSystem]);assert(T.getMap(s.selections.turbo));
  assert.equal(C.drivelineFor(s).type,'converter');assert(C.drivelineFor(s).converter.k>0);
  assert.equal(C.buildMassKg(s),C.rosterSpec(id).massKg);assert.equal(C.oilCapacity(s),s.service.liters);
  for(const bench of ['compression','leakdown']) assert.equal(C.runBenchTest(s,bench).values.length,8);
  assert.equal(C.purchaseBuild(s,{...s.selections,block:'randy_je83'}).ok,false);
  assert.throws(()=>C.applyPreset(s,'randy'),/past/);
  assert.equal(C.purchaseBuild(s,{...s.selections,turboHp:'g25'}).ok,false);
  const d=dynos[id]=C.simulateEngine(s,{noise:false});assert.equal(d.status,'completed',d.abortReason);assert(d.peakHp>300);
  assert(d.samples.every(p=>Number.isFinite(p.hp)&&Number.isFinite(p.torqueNm)&&Number.isFinite(p.oilPressureBar)));
  s.lastDyno=d;s.lastDynoSignature=C.engineSignature(s);
  const newhead=C.compatibleParts(s,'head').find(p=>p.id.endsWith('_race'));
  const buy=C.purchaseBuild(s,{...s.selections,head:newhead.id});assert(buy.ok && buy.cost.total===newhead.price);
  s.bank=buy.bank;s.owned=buy.owned;s.selections.head=newhead.id;
  assert(!C.isDynoCurrent(s));
  assert.equal(C.purchaseBuild(s,s.selections).cost.total,0,'fitting owned parts twice costs zero');
  const upgraded=C.simulateEngine({...s,tune:{...s.tune,ecu:null}},{noise:false});
  assert(Math.abs(upgraded.peakHp-d.peakHp)>1,'heads must change the simulated result');
  s.tune.lambda=.77; s.wear.engine=12+ids.indexOf(id);s.damage.transmission=3;
  s.nitrous={kitId:s.selections.nitrous,kg:1.2};s.buildSlots[0]={workshopCarId:id,selections:clone(s.selections),tune:clone(s.tune)};
  account=C.restoreGarageState(clone(C.persistGarageState(s)));
  assert.equal(account.selections.head,newhead.id);assert.equal(account.tune.lambda,.77);assert.equal(account.damage.transmission,3);assert.equal(account.nitrous.kg,1.2);
  assert.deepEqual(C.persistGarageState(C.restoreGarageState(C.persistGarageState(account))),C.persistGarageState(account),'save migration idempotent');
 });
 test(`${id}: full run responds to selected motor and converter`,()=>{
  const s=C.normalizeState({...C.blankState(),...C.createWorkshopBuild(id)});
  const r=runs[id]=C.simulateRaceRun(s,{tyreTempC:55});assert(r.quarter>4&&r.quarter<20);assert(r.trapKmh>150);
  assert(r.trace.every(p=>Number.isFinite(p.rpm)&&Number.isFinite(p.speedKmh)));
  const cv=C.drivelineFor({...s,tune:{...s.tune,converterStallRpm:4500}}).converter;assert.equal(cv.stallRpm,4500);
  const sig=C.engineSignature(s);s.tune.converterStallRpm=4500;assert.equal(C.engineSignature(s),sig,'converter is race setup, not engine dyno');
 });
}
test('lazy ECU tables materialize without changing the selected build signature',()=>{
 for(const id of ['eagle','mullet','mcflurry','lumberjack','crc12_jackstand_240']){
  const s=C.switchGarageCar(C.createVehicleQA(),id),before=C.engineSignature(s);
  s.tune.ecu=C.buildEcu(s,{previous:s.tune.ecu});assert(C.validEcu(s.tune.ecu));
  assert.equal(C.engineSignature(s),before,id+' opening tables must not change calibration');
 }
});

test('switching, records and wear never mutate another build or duplicate money',()=>{
 const bank=account.bank;
 for(let n=0;n<3;n++)for(const id of ids){account=C.switchGarageCar(account,id);assert.equal(account.workshopCarId,id);assert.equal(account.wear.engine,12+ids.indexOf(id));}
 assert.equal(account.bank,bank);account=C.switchGarageCar(account,'scirocco');assert.deepEqual(C.captureBuild(account),original);
 account=C.switchGarageCar(account,'crc12_jackstand_240');const before=clone(account.garage.cars.eagle);
 account.garage=C.recordWorkshopPass(account,{...runs.crc12_jackstand_240,valid:true});assert.equal(account.garage.cars.crc12_jackstand_240.record.runs,1);assert.deepEqual(account.garage.cars.eagle,before);
});
test('v1 migration preserves purchased cars, money, wear, records and backup-compatible Scirocco root',()=>{
 const old=C.createInitialState();old.bank=98765;old.wear.engine=23;old.garage={active:'lumberjack',cars:{lumberjack:{paidEur:6602,record:{runs:7,wear:{engine:36,transmission:19},damage:{engine:5}},best:{quarter:9.4}}}};
 const migrated=C.restoreGarageState(old);assert.equal(migrated.wear.engine,36);assert.equal(migrated.damage.engine,5);assert.equal(migrated.bank,98765);
 const disk=C.persistGarageState(migrated);assert.equal(disk.wear.engine,23);assert.equal(disk.garage.cars.lumberjack.record.runs,7);assert.equal(disk.garage.cars.lumberjack.best.quarter,9.4);
 disk.garage.active='removed';disk.garage.cars.removed={paidEur:10};const safe=C.restoreGarageState(disk);assert.equal(safe.activeBuildId,'scirocco');assert(safe.garage.cars.removed);
 const broken=clone(old);broken.garage.cars.lumberjack.record.out=true;assert.equal(C.restoreGarageState(broken).damage.engine,100);
});
test('saved identity cannot override the selected car or borrow another family',()=>{
 const s=C.persistGarageState(account),id='crc12_jackstand_240';s.garage.active=id;
 s.garage.cars[id].build.workshopCarId='eagle';s.garage.cars[id].build.rosterCar={id:'eagle',engine:C.rosterSpec('eagle').engine};
 s.garage.cars[id].build.selections.head='ws_hemi_head_base';
 const loaded=C.restoreGarageState(s);assert.equal(loaded.workshopCarId,id);assert.equal(loaded.rosterCar.id,id);assert(!loaded.rosterCar.engine);assert.equal(loaded.selections.head,'ws_ls_head_base');
});
test('carburetor, port pressure and C16 behave as installed hardware',()=>{
 const s=C.normalizeState({...C.blankState(),...C.createWorkshopBuild('crc12_jackstand_240')});
 assert.equal(C.selectionCompatibility(s,{...s.selections,turbo:'pt7675'}).ok,false);
 assert.equal(C.selectionCompatibility(s,{...s.selections,fuel:'methanol'}).ok,false);
 assert(!C.resolveAntiLag({...s,tune:{...s.tune,als:{mode:'drag'}}}).enabled);
 const d=dynos.crc12_jackstand_240;assert.equal(d.wear.turbo,0,'no turbine wear without a turbine');assert(Number.isFinite(d.safePowerLimitHp));assert(d.samples.every(p=>p.boostBar===0&&p.turboShaftRpm===0));
 const hw=C.engineHardware(s);close(hw.fuel.afrSt,14.7,1e-10,'C16 stoich');assert(!hw.fuelSys.di);assert(hw.fuelSys.carburetor);
 const q={rpm:6000,demandKgS:.5,fuel:hw.fuel,railTargetBar:.45,mapBarAbs:1};const fd=E.fuelDelivery(hw.fuelSys,q);assert.equal(fd.limitedBy,'carburetor');assert.equal(fd.diDutyPct,0);assert.equal(fd.railBar,null);
 const fi=E.DATA.fuelSystems.ws_ls_fuel_base;
 assert(E.fuelDelivery(fi,{...q,railTargetBar:6}).capacityCcS>E.fuelDelivery(fi,{...q,railTargetBar:2}).capacityCcS);
 const s2={...s,tune:{...s.tune,lambda:.72,ecu:null}},d2=C.simulateEngine(s2,{noise:false});assert(Math.abs(d2.peakHp-d.peakHp)>1,'NA lambda control must work');
});
test('tuner proposes only compatible hardware and usable parameter ranges',()=>{
 for(const id of ids){const s=C.normalizeState({...C.blankState(),...C.createWorkshopBuild(id)});
  for(const key of ['fuel','turbo','oil','cam','abort:torque'])for(const a of C.adviceCandidates(s,key))assert(C.selectionCompatibility(s,{...s.selections,...a.patch.selections}).ok);
  const opt=C.createMapOptimizer(s,'street'); assert(opt.total>0); // exercises bounded PSI/MPI/carb and fixed cams
 }
});
test('baseline Scirocco and research opponents retain identical physics',()=>{
 for(const [preset,b] of Object.entries(fixture.scirocco)){
  const s=C.applyPreset(C.blankState(),preset),d=C.simulateEngine(s,{noise:false}),r=C.simulateRaceRun(s);
  assert.equal(C.engineSignature(s),b.signature,'existing dynos retain their signature');
  close(d.peakHp,b.hp,1e-6,preset+' hp');close(d.peakTorqueNm,b.nm,1e-6,preset+' torque');close(r.quarter,b.quarter,1e-9,preset+' ET');close(r.trapKmh,b.trap,1e-9,preset+' trap');
 }
 for(const [id,b] of Object.entries(fixture.roster)){const r=C.simulateRaceRun(C.rosterState(id));close(r.quarter,b.quarter,1e-9,id+' reference ET');close(r.trapKmh,b.trap,1e-9,id+' reference trap');}
});
test('paid tuner finishes usable maps for carburetor and port-injected V8',()=>{
 for(const id of ['crc12_jackstand_240','mcflurry']){
  const s=C.normalizeState({...C.blankState(),...C.createWorkshopBuild(id)}),opt=C.createMapOptimizer(s,'street');
  let done=false,steps=0;while(!done && steps++<400)done=opt.step();assert(done,'optimizer must terminate');
  const result=opt.summary(),tuned=C.applyAdvicePatch(s,result.patch);
  assert(C.selectionCompatibility(tuned,tuned.selections).ok);
  assert.equal(tuned.workshopCarId,id);assert.equal(C.simulateEngine(tuned,{noise:false}).status,'completed');
  const fs=C.engineHardware(tuned).fuelSys;
  assert(tuned.tune.railTargetBar<=C.getPart(tuned,'fuelSystem').maxRailBar);
  if(fs.carburetor){assert.equal(tuned.tune.boostMidBar,0);assert(!result.touched.includes('inlaatnok'));}
 }
});
console.log(JSON.stringify({checks,dynos:Object.fromEntries(ids.map(id=>[id,{status:dynos[id].status,hp:dynos[id].peakHp,nm:dynos[id].peakTorqueNm}])),runs:Object.fromEntries(ids.map(id=>[id,{quarter:runs[id].quarter,trap:runs[id].trapKmh}]))},null,2));
module.exports={checks};
