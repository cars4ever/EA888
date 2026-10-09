'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const C=require('../src/assets/sim'), Codec=require('../src/assets/save-codec');
assert.equal(fs.readFileSync('src/assets/vendor/lz-string.min.js','utf8'),fs.readFileSync('node_modules/lz-string/libs/lz-string.min.js','utf8'),'packaged codec matches the pinned dependency');
let s=C.restoreGarageState(C.createVehicleQA());
for(const id of ['scirocco','eagle','mullet','mcflurry','lumberjack','crc12_jackstand_240']){
 s=C.switchGarageCar(s,id);
 const d=C.simulateEngine(s,{noise:false}),pass=C.simulateRaceRun(s);
 s.lastDyno=d;s.dynoRuns=Array.from({length:20},(_,i)=>({...d,label:'Pull '+i}));
 s.lastDrag=pass;s.dragRuns=Array.from({length:30},(_,i)=>({...pass,measuredAt:'2026-10-10T00:'+String(i).padStart(2,'0')+':00Z'}));
}
const saved=C.persistGarageState(s),raw=JSON.stringify(saved),encoded=Codec.stringify(saved);
if(process.env.EA888_SAVE_STRESS_OUT)fs.writeFileSync(process.env.EA888_SAVE_STRESS_OUT,encoded);
console.log('SAVE SIZES',JSON.stringify({rawBytes:raw.length*2,encodedUtf16Bytes:encoded.length*2,storageCharacters:encoded.length}));
assert(raw.length>5000000,'stress fixture exceeds ordinary localStorage capacity');
assert(encoded.length<3500000,'all six full histories fit alongside a migration backup');
assert.deepEqual(Codec.parse(encoded),JSON.parse(raw),'all telemetry survives, including old records');
assert.deepEqual(Codec.parse(raw),JSON.parse(raw),'legacy uncompressed saves still work');
assert.equal(C.restoreGarageState(Codec.parse(encoded)).activeBuildId,'crc12_jackstand_240');
assert.equal(Codec.stringify(saved),encoded,'repeated serialization is deterministic');
assert.throws(()=>Codec.parse('{"lastDyno":{"__ea888Lz16":1,"data":"broken"}}'));
console.log('PASS save codec',JSON.stringify({rawBytes:raw.length*2,encodedUtf16Bytes:encoded.length*2,storageCharacters:encoded.length}));
module.exports={rawBytes:raw.length*2,encodedUtf16Bytes:encoded.length*2,storageCharacters:encoded.length};
