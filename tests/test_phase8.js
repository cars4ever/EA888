'use strict';
// Stroker/destroker kits, the welded head, compound boost and driver nitrous (sim.js, turbo.js).
const assert = require('assert');
const C = require('../src/assets/sim.js');
const build = (preset, mutate) => { const s = C.applyPreset(C.blankState(), preset); if (mutate) mutate(s); return C.normalizeState(s); };
const at = (r, rpm) => r.samples.find(p => p.rpm === rpm) || {};

// 1. Stroke sets displacement and (with the same chamber) the compression ratio; the rods keep the deck.
{
  const g = id => C.engineGeometry(build('randy', s => { s.selections.crank = id; }));
  const oem = g('oem_crank'), s96 = g('stroker_96'), s100 = g('stroker_100'), d86 = g('destroke_86');
  const cc = (b, st) => Math.PI / 4 * b * b * st * 4 / 1000;
  assert(Math.abs(s96.displacementCc - cc(s96.boreMm, 96)) < 0.5 && s100.displacementCc > s96.displacementCc && d86.displacementCc < oem.displacementCc, 'displacement follows the stroke');
  assert(s96.compressionRatio > oem.compressionRatio && d86.compressionRatio < oem.compressionRatio, 'same chamber: CR follows the swept volume');
  assert(Math.abs((s96.strokeMm / 2 + s96.rodMm) - (oem.strokeMm / 2 + oem.rodMm)) < 1e-9, 'deck height kept by the rods');
  // more stroke: more torque low down; the destroker revs further (crank rpm limit)
  const dyno = id => C.simulateEngine(build('randy', s => { s.selections.crank = id; }), { noise: false });
  const rOem = dyno('oem_crank'), rStroke = dyno('stroker_100');
  assert(at(rStroke, 3000).torqueNm > at(rOem, 3000).torqueNm, `stroker: more torque at 3000 rpm (${at(rStroke, 3000).torqueNm} vs ${at(rOem, 3000).torqueNm})`);
  const crank = id => C.CATEGORY_MAP.crank.items.find(i => i.id === id);
  assert(crank('destroke_82').rpmLimit > crank('oem_crank').rpmLimit && crank('stroker_100').rpmLimit < crank('oem_crank').rpmLimit, 'piston speed decides the safe rpm');
}

// 2. Welded head: no head gasket to lift. Extreme boost lifts a bolted OEM head, not a welded one.
{
  const pull = seal => C.simulateEngine(build('hx52', s => { s.selections.sealing = seal; s.tune.boostHighBar += 0.8; s.tune.boostMidBar += 0.8; }), { noise: false });
  assert.strictEqual(pull('oem_bolts').abortCode, 'head_lift', 'OEM bolts lift the head');
  assert.notStrictEqual(pull('welded_head').abortCode, 'head_lift', 'a welded head cannot lift');
  assert(C.CATEGORY_MAP.sealing.items.find(i => i.id === 'welded_head').rebuildExtra > 0, 'a welded engine costs more to rebuild');
}

// 3. Compound boost (a second turbo from the turbo list as the HP stage): spools a big turbo that
//    cannot spool on 2.0 L by itself; more EMP while it works. Series physics: tests/test_phase9.js.
{
  const pull = hp => C.simulateEngine(build('hx52', s => { s.selections.turbo = 'pt7675'; s.selections.turboHp = hp; }), { noise: false });
  const single = pull(''), comp = pull('g25');
  assert(at(comp, 4000).boostBar > at(single, 4000).boostBar + 0.3, `compound spools earlier (${at(comp, 4000).boostBar} vs ${at(single, 4000).boostBar} bar at 4000)`);
  assert(comp.peakHp > single.peakHp, 'and makes more power in a dyno pull');
  assert(at(comp, 4000).empBar > at(single, 4000).empBar, 'two turbines in the exhaust: more back pressure');
  // where the main turbo is not spool-limited the HP stage is bypassed
  const k04 = C.simulateEngine(build('k04'), { noise: false }), k04c = C.simulateEngine(build('k04', s => { s.selections.turbo = 'pt6870'; s.selections.turboHp = 'k04'; }), { noise: false });
  const top = k04c.samples[k04c.samples.length - 1];
  assert(top.compoundStage === 'lp' || top.hpBypassPct > 60, `at the top the HP stage is (being) bypassed: ${top.compoundStage} ${top.hpBypassPct}`);
  assert(k04.samples.length > 0);
}

// 4. Driver nitrous: only with the button, ramps in, costs bottle, faster pass; head lift on weak sealing.
{
  const st = kit => build('randy', s => { s.selections.nitrous = kit; s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; });
  const base = C.simulateRaceRun(st('no_n2o'), { reactionTime: 0, tyreTempC: 55 });
  const wet = C.simulateRaceRun(st('wet_100'), { reactionTime: 0, tyreTempC: 55 });
  const off = C.simulateRaceRun(st('wet_100'), { reactionTime: 0, tyreTempC: 55, nitrous: false });
  assert(wet.quarter < base.quarter - 0.15 && wet.trapKmh > base.trapKmh + 4, `100 hp shot: ${base.quarter} -> ${wet.quarter} s`);
  assert.strictEqual(off.n2oShotS, 0, 'no button, no nitrous');
  assert(Math.abs(wet.n2oUsedKg - 100 * 0.00085 * wet.n2oShotS) < 0.05, 'bottle use ~0.85 g/s per hp');
  const rt = C.createRaceRuntime(st('wet_150_prog'), {}); rt.launch();
  for (let i = 0; i < 500; i++) rt.step(0.002, { nitrous: true, pedal: 1 });
  const p = rt.point();
  assert(p.n2oHp > 50 && p.n2oHp < 150, `progressive: the shot is still ramping after 1 s (${p.n2oHp} hp)`);
  const bolts = C.simulateRaceRun(build('randy', s => { s.selections.nitrous = 'port_400'; s.selections.sealing = 'oem_bolts'; s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; }), { reactionTime: 0, tyreTempC: 55 });
  const welded = C.simulateRaceRun(build('randy', s => { s.selections.nitrous = 'port_400'; s.selections.sealing = 'welded_head'; s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; }), { reactionTime: 0, tyreTempC: 55 });
  assert(bolts.headLiftS > 0.5 && bolts.knockDamagePct > 1, `400 hp on OEM head bolts lifts the head (${bolts.headLiftS} s)`);
  assert.strictEqual(welded.headLiftS, 0, 'the welded head holds the 400 hp shot');
  // a dry kit on a fuel system without headroom runs lean
  const dry = C.simulateRaceRun(build('stock', s => { s.selections.nitrous = 'dry_75'; }), { reactionTime: 0 });
  assert(dry.n2oLeanS > 0, `dry kit on the OEM fuel system goes lean (${dry.n2oLeanS} s)`);
}
module.exports = { ok: true };
console.log('PASS phase 8 tests');
