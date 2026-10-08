'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const C=require('../src/assets/sim.js'), V=require('../src/assets/vehicle-assets.js');
const cars=V.ids.filter(id=>id!=='scirocco');
const qa=C.createVehicleQA();
assert.equal(qa.bank,10000000);
assert.equal(C.normalizeState(qa).qaCashVersion,1);
assert.equal(C.createCareerSelection().bank,50000);
for(const id of cars){
  const v=V.get(id), spec=C.rosterSpec(id), s=C.rosterState(id);
  assert.equal(s.rosterCar.id,id);
  assert.equal(v.dimensions.wheelbase,spec.values.wheelbaseM.value);
  assert.equal(v.sound.cylinders,8);
  qa.garage=C.setActiveCar(qa,id);
  const persisted=C.normalizeState(JSON.parse(JSON.stringify(qa)));
  assert.equal(persisted.garage.active,id);
  assert.equal(C.workshopAvailable(persisted),false);
  assert.equal(persisted.bank,10000000);
  const file=path.join(__dirname,'../src/assets',v.model);
  const bytes=fs.readFileSync(file);
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  const doc=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  for(const name of v.wheels.names) assert.equal(doc.nodes.filter(n=>n.name===name).length,1,`${id}: exactly one ${name}`);
  assert(doc.meshes.length>=5,`${id}: body and independent wheels`);
  assert(!doc.images.some(i=>i.uri),`${id}: embedded textures`);
  assert(bytes.length<2500000,`${id}: runtime budget`);
  for(const node of doc.nodes.filter(n=>v.wheels.names.includes(n.name))){
    const i=v.wheels.names.indexOf(node.name);
    assert(Math.abs(node.translation[1]-v.wheels.radii[i])<.00001,'wheel bottom at ground');
    assert(Math.abs(Math.abs(node.translation[2])-v.dimensions.wheelbase/2)<.00001,'axle at sim wheelbase');
  }
}
for(const id of V.ids){
  const fresh=C.createCareerSelection(), price=C.rosterCarPrice(id);
  const result=C.confirmStarter(fresh,id);
  assert.equal(result.ok,id==='scirocco'||!!price);
  if(!result.ok)continue;
  assert.equal(result.state.bank,50000-(price?.eur||0));
  assert.equal(result.state.garage.active,id);
  assert.equal(C.confirmStarter(result.state,id).ok,false,'cannot pay twice');
  assert.equal(C.confirmStarter(C.normalizeState(result.state),id).ok,false,'restart cannot pay twice');
}
const legacy=C.normalizeState(C.createInitialState());delete legacy.vehicleSaveVersion;delete legacy.starterSelection;
legacy.bank=123456;legacy.wear.engine=19;legacy.records.RWD={quarter:8.1};
legacy.garage={active:'removed',cars:{removed:{paidEur:900,record:{runs:7}}}};
const migrated=C.normalizeState(legacy);
assert.equal(migrated.starterSelection,'complete');assert.equal(migrated.garage.active,'scirocco');
for(const key of ['bank','wear','records','selections','tune'])assert.deepEqual(migrated[key],legacy[key]);
assert.deepEqual(migrated.garage.cars,legacy.garage.cars);
assert.deepEqual(C.normalizeState(migrated),migrated,'idempotent migration');
assert.equal(C.setActiveCar(migrated,'eagle').active,'scirocco','unowned car unavailable');
console.log('PASS vehicle identity, embedded GLB nodes/budget, QA cash, career prices, one-time purchase, save migration, workshop guards');
