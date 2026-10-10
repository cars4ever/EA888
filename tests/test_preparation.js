const assert=require('assert'),fs=require('fs'),C=require('../src/assets/sim');
const account=C.createVehicleQA(),results={};
for(const id of ['eagle','mullet','mcflurry','lumberjack','crc12_jackstand_240','scirocco']){
 const s=C.switchGarageCar(account,id),before=JSON.stringify(s),r=C.createPreparationRuntime(s);let p;
 for(let i=0;i<12000;i++){p=r.step(1/60,{pedal:1,rollout:r.rt.state.x>-6,creep:r.rt.state.x>-.8});if(p.ready)break;}
 assert(p.ready,id+' cannot stage');assert(p.rollingValid,id+' lacks rolling burnout');assert(r.state.trace.some(x=>x.contact.some(Boolean)),id+' no water');
 assert(r.state.trace.every(x=>x.worldM>=C.PREPARATION.startM&&Number.isFinite(x.rpm)),id);
 assert(r.state.trace.some(x=>x.wetness[0]!==x.wetness[2]),'individual axle contacts');assert.equal(JSON.stringify(s),before,'mutated build');
 results[id]={at:p.worldM,rollingS:p.rollingS,surfaceC:p.tyreSurfaceC,coreC:p.tyreBulkC,converter:p.converter,trace:r.state.trace};
 console.log('PASS preparation',id,p.rollingS,p.tyreTempC);
}
const r=C.createPreparationRuntime(C.switchGarageCar(account,'eagle'));for(let i=0;i<120;i++)r.step(1/60,{pedal:0,brake:1});assert.equal(r.state.rollingS,0);assert(r.state.wetness.every(x=>x===0));
fs.writeFileSync('reports/audit2/preparation-core.json',JSON.stringify(results,null,2));

for(const dt of [0,NaN,-1]){const r=C.createPreparationRuntime(C.switchGarageCar(account,'scirocco'));const p=r.step(dt);assert(Number.isFinite(p.rpm)&&Number.isFinite(p.tyreSurfaceC)&&Number.isFinite(p.worldM),'zero first frame must remain finite');}
