const fs=require('fs'),C=require('../src/assets/sim'),V=require('../src/assets/engine-voice');
const s=C.switchGarageCar(C.createVehicleQA(),'eagle');
const trans=C.compatibleParts(s,'transmission');s.selections.transmission=trans.find(p=>/billet/i.test(p.name))?.id||s.selections.transmission;
s.vehicle.tireCompound='promod_slick';s.tune.boostLowBar=3.2;s.tune.boostMidBar=3.4;s.tune.boostHighBar=3.4;s.tune.launchRpm=3800;s.tune.revLimitRpm=8100;
const n=C.normalizeState(s),em=C.buildEngineMap(n),rt=C.createRaceRuntime(n,{engineMap:em,tyreTempC:62});
for(let i=0;i<3000;i++)rt.step(.01,{launchAls:true});rt.state.t=0;rt.launch();
const trace=[],shift=C.optimalShiftRpms(n,em);
for(let i=0;i<400;i++){const p=rt.step(.005,{pedal:1});if(!p.shifting&&p.gearIndex<rt.gears.length-1&&p.rpm>=shift[p.gearIndex]){if(rt.shouldAutoShift?rt.shouldAutoShift(shift[p.gearIndex]):true)rt.requestShift();}if(i%4===0)trace.push({...p,pumpRpm:p.rpm,turbineRpm:rt.state.ww*rt.gears[p.gearIndex]*rt.finalDrive*30/Math.PI,wheelRpm:rt.state.ww*30/Math.PI});}
const voice=new V.EngineVoice(32000,5);voice.set({rpm:8000,load:1,cylinders:8,boostBar:3.2,egtC:1100,exhaust:'hood_4'});const a=new Float32Array(160000),b=new Float32Array(160000),c=new Float32Array(160000);voice.render(a,b,c,a.length);
const stats=x=>({mean:x.reduce((a,b)=>a+b,0)/x.length,rms:Math.sqrt(x.reduce((a,b)=>a+b*b,0)/x.length),peak:Math.max(...x.slice(0,20000).map(Math.abs))});
const result={assumptions:'QA Eagle base, billet TH400, estimated boost3.2/3.4/3.4 launch3800 limit8100 tyre62. Not exact unknown video build.',selections:n.selections,tune:n.tune,shifts:rt.state.shiftLog,trace,audio:{exhaust:stats(a),bay:stats(b),pop:stats(c)}};
fs.writeFileSync(process.argv[2]||'reports/audit2/startup-before.json',JSON.stringify(result,null,2));console.log(result.shifts,result.audio);
