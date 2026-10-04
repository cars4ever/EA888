'use strict';
// Cross-check of the engine/turbo model against the rules of thumb in A. Graham Bell, "Forced Induction
// Performance Tuning" (and the Garrett/Precision matching practice it follows). The model is physical; these
// are the textbook ranges a tuner would check a dyno sheet against.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const RANGES = {
  // horsepower per lb/min of air at the power peak (gasoline ~9.5-10.5; alcohol fuels a little more)
  hpPerLb: { ron98: [8.8, 11], blend_wmi: [9.2, 11.2], e85: [9.8, 12], methanol: [10.5, 12.5] },
  // brake specific fuel consumption, lb/hp/h, rich turbo mixture
  bsfc: { ron98: [0.48, 0.68], blend_wmi: [0.48, 0.7], e85: [0.65, 0.95], methanol: [0.95, 1.35] },
  // turbine inlet temperature at full load, deg C
  egt: { ron98: [780, 1000], blend_wmi: [760, 980], e85: [650, 900], methanol: [600, 850] }
};
const rows = [];
for (const preset of ['stock', 'k04', 'randy', 'hx52', 'pro98', 'outlaw106', 'unlimited']) {
  const st = C.normalizeState(C.applyPreset(C.blankState(), preset));
  const r = C.simulateEngine(st, { noise: false });
  const p = r.samples.reduce((a, b) => (b.hp > a.hp ? b : a));
  const fuel = C.getPart(st, 'fuel').id;
  const hpPerLb = p.hp / p.airflowLbMin, bsfc = p.bsfcGkWh / 608.3;
  const inRange = (v, [lo, hi], what) => assert(v >= lo && v <= hi, `${preset} (${fuel}): ${what} ${v.toFixed(2)} outside ${lo}-${hi}`);
  inRange(hpPerLb, RANGES.hpPerLb[fuel], 'hp per lb/min');
  inRange(bsfc, RANGES.bsfc[fuel], 'BSFC lb/hp/h');
  inRange(p.egtC, RANGES.egt[fuel], 'EGT');
  // compressor outlet temperature = adiabatic rise / efficiency (T2 = T1 (1 + (PR^0.286 - 1) / eta))
  const t2 = (st.dynoConfig.ambientTempC + 273.15) * (1 + (Math.pow(p.compressorPr, 0.2857) - 1) / p.compressorEff) - 273.15;
  assert(Math.abs(t2 - p.compressorOutC) < 8, `${preset}: T2 ${p.compressorOutC} vs ${t2.toFixed(0)} C`);
  // intercooler effectiveness 60-97 % (air-to-air to ice tank)
  const eff = (p.compressorOutC - p.iatC) / Math.max(1, p.compressorOutC - st.dynoConfig.ambientTempC);
  assert(eff > 0.55 && eff < 0.98, `${preset}: intercooler ${eff}`);
  // exhaust back pressure vs boost (absolute): ~0.8-2.0 : 1 for a working turbo system
  const empRatio = (p.empBar + 1.013) / (p.boostBar + 1.013);
  assert(empRatio > 0.75 && empRatio < 2.0, `${preset}: EMP/MAP ${empRatio}`);
  // volumetric efficiency of a four-valve head at the power peak
  assert(p.volumetricEff > 0.75 && p.volumetricEff < 1.15, `${preset}: VE ${p.volumetricEff}`);
  rows.push([preset, Math.round(r.peakHp), hpPerLb.toFixed(1), bsfc.toFixed(2), Math.round(p.egtC), empRatio.toFixed(2)]);
}
// Boost threshold and lag: a matched street turbo (K04 on the 2.0 L) makes most of its boost by ~3500 rpm in a
// load-controlled pull, a few hundred rpm behind its steady-state threshold.
{
  const r = C.simulateEngine(C.normalizeState(C.applyPreset(C.blankState(), 'k04')), { noise: false });
  const at = rpm => r.samples.find(p => p.rpm === rpm);
  assert(at(3500).boostBar > 0.6 * at(3500).boostTargetBar, `K04 at 3500 rpm: ${at(3500).boostBar} of ${at(3500).boostTargetBar} bar`);
  assert(at(4000).boostBar > 0.95 * at(4000).boostTargetBar, 'K04 on target by 4000 rpm');
}
module.exports = { presets: rows.length };
console.log('PASS physics audit (Bell rules of thumb)');
