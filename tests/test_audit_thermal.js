'use strict';
const C=require('../src/assets/sim'),assert=require('node:assert/strict'),fs=require('node:fs');
const report=[];
for(const compound of ['drag_radial','promod_slick']){
 assert(C.TYRE[compound],compound);
 for(const pressure of [1.35]){
 let s=C.switchGarageCar(C.createVehicleQA(),'crc12_jackstand_240');s.vehicle.tireCompound=compound;s.vehicle.pressureBar=pressure;
 const b=C.createBurnoutRuntime(s);let previous=0;
 for(let i=0;i<1500;i++){
  const p=b.step(.02,{throttle:true});assert(p.energyKj>=previous);previous=p.energyKj;
  if(![49,299,1499].includes(i))continue;
  const before={...b.tyreThermal},after=C.tyreThermalAfter(before,20,{ambientC:s.vehicle.ambientTempC,trackC:s.vehicle.trackTempC,speedMs:1});
  assert.deepEqual(b.tyreThermal,before);assert(after.surfaceC<before.surfaceC);
  const rt=C.createRaceRuntime(s,{tyreThermal:after});assert.deepEqual(rt.tyreThermal,after);
  report.push({compound,pressure,seconds:p.t,surfaceC:p.tyreSurfaceC,coreC:p.tyreBulkC,energyKj:p.energyKj,currentGrip:C.tyreTempFactor(C.TYRE[compound],p.tyreGripC),predicted20sC:C.tyreGripTempC(after),predictedGrip:C.tyreTempFactor(C.TYRE[compound],C.tyreGripTempC(after))});
 }
 }
}
fs.mkdirSync('reports/audit-repair',{recursive:true});fs.writeFileSync('reports/audit-repair/thermal.json',JSON.stringify(report,null,2));console.log('PASS thermal continuity, prediction is non-mutating, short/medium/long burns',report);
