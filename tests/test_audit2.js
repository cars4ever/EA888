'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../src/assets/sim');
const app=fs.readFileSync(require.resolve('../src/assets/app.js'),'utf8');
const tests={
 'automatic converter shift rejects pump flare but explicit short shift works':()=>{const r=C.createRaceRuntime(C.switchGarageCar(C.createVehicleQA(),'eagle'));r.launch();r.state.we=8100*Math.PI/30;r.state.ww=0;r.state.kappa=2;assert.equal(r.shouldAutoShift(7800),false);assert.equal(r.requestShift('deliberate short shift'),true);assert.equal(r.state.shiftLog[0].cause,'deliberate short shift');},
 'preparation first frame at dt zero has complete telemetry':()=>{const r=C.createPreparationRuntime(C.switchGarageCar(C.createVehicleQA(),'scirocco')),p=r.step(0);assert(Number.isFinite(p.rpm));assert(Number.isFinite(p.tyreSurfaceC));assert.equal(p.worldM,-30);},
 'Gear dispatch must not fall through to Failsafes':()=>assert(app.includes("} else if (tunePanel === 'boost' && turbo.naturallyAspirated)")),
 'TH400 saved dynogear 5 is validated against fitted gearbox':()=>{const s=C.switchGarageCar(C.createVehicleQA(),'eagle');s.dynoConfig.gear=5;const n=C.normalizeState(s);assert(n.dynoConfig.gear<=C.effectiveGearing(n).gears.length);assert(n.gearboxNotice);},
 'Powerglide saved dynogear 6 resolves to actual gear count':()=>{const s=C.switchGarageCar(C.createVehicleQA(),'crc12_jackstand_240');s.dynoConfig.gear=6;assert.equal(C.normalizeState(s).dynoConfig.gear,2);},
 'converter forward power is passive':()=>{const cv=C.converterSpec({stallRpm:5000,torqueNm:1500,torqueRatio:2.5});for(let sr=0;sr<=1;sr+=.005){const t=C.converterTorques(cv,500,500*sr);assert(t.turbineNm*sr<=t.pumpNm+1e-9,`active converter SR ${sr}`);}}
};let failed=0;for(const [name,test]of Object.entries(tests)){try{test();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}process.exitCode=failed?1:0;
