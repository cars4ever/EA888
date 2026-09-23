'use strict';
// Compressor-map turbo model: data provenance, map fidelity and physical invariants.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const T = require('../src/assets/turbo.js');
const { buildTurboData, render } = require('../tools/build_turbo_data.js');
const fs = require('fs');
const path = require('path');

// 1. Data: every catalogue turbo has a map with honest provenance, and the
// runtime bundle is generated from data/turbo/ (no hand edits).
const bundlePath = path.join(__dirname, '..', 'src', 'assets', 'turbo-data.js');
assert.strictEqual(fs.readFileSync(bundlePath, 'utf8'), render(buildTurboData()), 'turbo-data.js is stale: run node tools/build_turbo_data.js');
const REQUIRED = ['id', 'name', 'compressorInducerMm', 'turbineExducerMm', 'maxShaftRpm', 'mapSource', 'mapType', 'surgeLine', 'speedLines', 'efficiencyIslands', 'chokeLine'];
for (const part of C.CATEGORY_MAP.turbo.items) {
  const d = T.DATA.turbos[part.id];
  assert(d, `turbo ${part.id} has no map`);
  for (const key of REQUIRED) assert(d[key] !== undefined && d[key] !== null, `${part.id}: ${key} missing`);
  assert(['vendor', 'measured', 'modeled'].includes(d.mapType), `${part.id}: bad mapType`);
  if (d.mapType === 'modeled') assert(/modeled/i.test(d.mapSource), `${part.id}: modeled map must say so in mapSource`);
  else assert(/https?:\/\//.test(d.mapSource) && d.digitization, `${part.id}: vendor map needs a source URL and digitization note`);
  assert(d.speedLines.length >= 5 && d.surgeLine.length >= 5 && d.chokeLine.length >= 5, `${part.id}: map too sparse`);
}
const VENDOR = ['g25', 'g30', 'pt6062', 'pt6466', 'pt6870', 'pt7675'];
assert.deepStrictEqual(Object.values(T.DATA.turbos).filter(d => d.mapType === 'vendor').map(d => d.id).sort(), VENDOR);
// Precision ratings (their own hp numbers) must agree with the map flow at ~10 hp per lb/min (gasoline rule of
// thumb), for the digitized vendor maps and the scaled (modeled) ones alike.
for (const d of Object.values(T.DATA.turbos).filter(x => x.ratedHp)) {
  const maxFlow = Math.max(...d.chokeLine.map(p => p[0]));
  assert(Math.abs((maxFlow * 10) / d.ratedHp - 1) < 0.2, `${d.id}: ${maxFlow} lb/min map vs ${d.ratedHp} hp rating`);
  if (d.mapType === 'vendor') assert(/precisionturbo\.com/.test(d.mapSource), `${d.id}: Precision map URL missing`);
}

// 2. Fidelity: the interpolated map reproduces the digitized vendor speed lines.
for (const id of VENDOR) {
  const m = T.getMap(id);
  for (const line of T.DATA.turbos[id].speedLines)
    for (const [w, pr] of line.points) {
      const n = m.shaftRpm(w, pr);
      // lowest lines are nearly flat in PR, so rpm-from-PR is ill-conditioned there
      assert(Math.abs(n - line.rpm) / line.rpm < (pr < 1.3 ? 0.05 : 0.04), `${id}: ${Math.round(n)} rpm at (${w}, ${pr}) vs speed line ${line.rpm}`);
    }
  const src = T.DATA.turbos[id];
  const inner = src.efficiencyIslands.slice().sort((a, b) => b.efficiency - a.efficiency)[0];
  const cx = inner.polygon.reduce((s, p) => s + p[0], 0) / inner.polygon.length;
  const cy = inner.polygon.reduce((s, p) => s + p[1], 0) / inner.polygon.length;
  assert(Math.abs(m.efficiency(cx, cy) - src.peakEfficiency) < 0.005, `${id}: peak island efficiency`);
  // efficiency falls toward surge and toward choke along a mid speed line
  const mid = src.speedLines[Math.floor(src.speedLines.length / 2)].points;
  const effs = mid.map(([w, pr]) => m.efficiency(w, pr));
  const peakIdx = effs.indexOf(Math.max(...effs));
  assert(peakIdx > 0 && peakIdx < effs.length - 1, `${id}: efficiency peak should be inside the speed line`);
  assert(effs[effs.length - 1] < effs[peakIdx] - 0.08, `${id}: efficiency must collapse near choke`);
  // surge/choke boundaries are ordered
  for (const pr of [1.5, 2, 2.5, 3]) assert(m.surgeFlow(pr) < m.chokeFlow(pr), `${id}: surge left of choke at PR ${pr}`);
}
// Digitized G25 contour labels (vendor map) are reproduced within a few points.
const g25 = T.getMap('g25');
for (const [w, pr, eff, tol] of [[38, 2.3, 0.79, 0.01], [30, 1.8, 0.775, 0.015], [45, 2.9, 0.77, 0.015], [55.7, 2.8, 0.65, 0.04]])
  assert(Math.abs(g25.efficiency(w, pr) - eff) <= tol, `G25 efficiency at (${w}, ${pr}) = ${g25.efficiency(w, pr).toFixed(3)} vs vendor ${eff}`);

// 3. Physical invariants of the matched engine/turbo in a dyno pull.
const run = (preset, mutate) => {
  const s = C.applyPreset(C.blankState(), preset);
  if (mutate) mutate(s);
  return C.simulateEngine(s, { noise: false });
};
const at = (r, rpm) => r.samples.find(p => p.rpm === rpm);
const randy = run('randy');
for (const p of randy.samples) {
  const t1 = 20 + 273.15;
  const t2 = t1 * (1 + (Math.pow(p.compressorPr, 0.2857) - 1) / p.compressorEff) - 273.15;
  assert(Math.abs(t2 - p.compressorOutC) < 1.5, `compressor outlet ${p.compressorOutC.toFixed(1)} vs isentropic ${t2.toFixed(1)} @ ${p.rpm}`);
  if (p.boostLimitedBy !== 'wastegate-creep') assert(p.boostBar <= p.boostTargetBar + 1e-6, `boost above target without creep @ ${p.rpm}`);
  assert(p.turboShaftRpm <= p.shaftLimitRpm * 0.985, `shaft-speed protection failed @ ${p.rpm}`);
  assert(p.iatC < p.compressorOutC, 'intercooler must cool the charge');
  assert(Number.isFinite(p.surgeMarginPct) && Number.isFinite(p.chokeMarginPct));
}
// Randy's K04 hybrid (rated ~500 hp) holds its 1.9 bar target with margin. Asked for 2.6 bar it runs into the
// edge of its map: shaft speed near the limit and efficiency falling, then the fuel system caps the boost.
const pushed = run('randy', s => { s.tune.boostMidBar = 2.6; s.tune.boostHighBar = 2.6; });
assert(at(randy, 7500).chokeMarginPct > 10, 'K04 hybrid should not be choked at its own 1.9 bar target');
assert(at(pushed, 6000).shaftSpeedPct > 93, 'a 2.6 bar request must drive the K04 hybrid close to its shaft limit');
assert(at(pushed, 6000).compressorEff < at(randy, 6000).compressorEff - 0.05, 'efficiency must fall toward the edge of the map');
assert(pushed.samples.some(p => p.boostLimitedBy === 'fuel-protection'), 'the saturated fuel system must cap boost (lambda protection)');
assert(pushed.peakHp > randy.peakHp, 'more boost within the map must still make more power');

// A bigger turbo on the same build spools later but flows more at the top end.
const bigger = run('randy', s => { s.selections.turbo = 'hx52'; s.selections.boostControl = 'dual_44'; });
assert(at(bigger, 3000).boostBar < at(randy, 3000).boostBar, 'HX52 should build less boost than the K04 hybrid at 3000 rpm');
const biggerPushed = run('randy', s => { s.selections.turbo = 'hx52'; s.selections.boostControl = 'dual_44'; s.tune.boostMidBar = 2.4; s.tune.boostHighBar = 2.4; });
const pushed24 = run('randy', s => { s.tune.boostMidBar = 2.4; s.tune.boostHighBar = 2.4; });
assert(at(biggerPushed, 7500).shaftSpeedPct < at(pushed24, 7500).shaftSpeedPct - 5, 'HX52 should run far from its shaft limit where the K04 hybrid is near it');
assert(bigger.samples.some(p => /spool/.test(p.boostLimitedBy)), 'HX52 on 2.0 L should be spool limited somewhere');

// Rotor inertia: a faster dyno ramp leaves less time to spool.
const slowRamp = run('hx52', s => { s.dynoConfig.rampRpmPerSec = 300; });
const fastRamp = run('hx52', s => { s.dynoConfig.rampRpmPerSec = 1000; });
const spoolSum = r => r.samples.filter(p => p.rpm >= 3500 && p.rpm <= 6000).reduce((a, p) => a + p.boostBar, 0);
assert(spoolSum(fastRamp) < spoolSum(slowRamp), 'fast ramp should show more turbo lag (rotor inertia)');

// Wastegate flow limit: the small OEM internal port cannot bypass enough exhaust to hold a low boost target at
// high rpm (creep); a 44 mm external valve can. At the factory target the OEM gate holds boost.
const lowBoost = s => { s.tune.boostLowBar = 0.3; s.tune.boostMidBar = 0.35; s.tune.boostHighBar = 0.3; };
const stock = run('stock');
assert(!stock.samples.some(p => p.boostLimitedBy === 'wastegate-creep'), 'OEM gate must hold the factory boost target');
const stockLow = run('stock', lowBoost);
assert(stockLow.samples.some(p => p.boostLimitedBy === 'wastegate-creep'), 'OEM internal wastegate should creep at a low target');
const stockGate = run('stock', s => { lowBoost(s); s.selections.boostControl = 'single_44'; });
assert(!stockGate.samples.some(p => p.boostLimitedBy === 'wastegate-creep'), '44 mm external gate should control boost');

// Altitude: lower inlet pressure raises PR and corrected flow for the same boost, costing power on a choked compressor.
const altitude = run('randy', s => { s.dynoConfig.baroKpa = 85; });
const observedPeak = r => Math.max(...r.samples.map(p => p.hpObserved));
assert(observedPeak(altitude) < observedPeak(randy) - 15, 'thin air must cost (observed, uncorrected) power');
// A correction standard converts back to reference air: DIN 70020 raises the thin-air figure.
assert(altitude.correction.factor > 1.1 && altitude.peakHp > observedPeak(altitude), 'DIN correction must scale thin-air power up');

// Exhaust manifold pressure follows turbine size: a small hybrid needs far more drive pressure.
assert(at(randy, 6000).empBar > at(bigger, 6000).empBar, 'smaller turbine should raise EMP');

module.exports = { vendorMaps: VENDOR.length, modeledMaps: Object.values(T.DATA.turbos).filter(d => d.mapType === 'modeled').length };

// 4. A pull measured with the previous physics model must not be presented as current.
const legacyState = C.createInitialState();
assert(C.isDynoCurrent(legacyState), 'fresh reference pull is current');
legacyState.lastDynoSignature = legacyState.lastDynoSignature.replace(/"model":"[^"]*",/, '');
assert(!C.isDynoCurrent(legacyState), 'a v1.2.0 measurement (no model version in its signature) must be stale');
