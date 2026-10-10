const assert=require('assert'),fs=require('fs'),C=require('../src/assets/sim');
const account=C.createVehicleQA(),s=C.switchGarageCar(account,'eagle');s.bank=9249898;
const before=JSON.stringify(C.persistGarageState(s)),out=[];
for(const goal of ['street','spool','lowgrip']){
 const candidates=C.drivelineCandidates(s,goal);assert.equal(candidates.length,3);
 const baseline=C.evaluateDriveline(s);const c=candidates[0],prediction=C.evaluateDriveline(s,c);out.push({goal,baseline,candidate:c,prediction});
 assert.equal(JSON.stringify(C.persistGarageState(s)),before,'virtual trials mutated real data');
 const r=C.applyDrivelineCandidate(s,c);assert(r.ok);assert.equal(r.state.bank,s.bank-c.cost);assert.equal(C.engineSignature(r.state),C.engineSignature(s));assert.equal(C.applyDrivelineCandidate(r.state,c).ok,false,'double charge');
 const round=C.restoreGarageState(JSON.parse(JSON.stringify(C.persistGarageState(r.state))));assert.equal(round.tune.converterId,c.tune.converterId);assert.equal(round.bank,r.state.bank);
}
const manual=C.switchGarageCar(account,'scirocco');assert.equal(C.converterOptions(manual).length,0);
fs.writeFileSync('reports/audit2/converter-scenarios.json',JSON.stringify(out,null,2));console.log('PASS converter goals, budgets, repeat purchase, complete save');
