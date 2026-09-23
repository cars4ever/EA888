'use strict';
const assert = require('assert');
const C = require('../src/assets/sim.js');

function approxBetween(value, min, max, label) {
  assert(Number.isFinite(value) && value > min && value < max, `${label}: ${value} not in (${min}, ${max})`);
}

function presetResult(id, mutate) {
  const state = C.applyPreset(C.blankState(), id);
  if (mutate) mutate(state);
  return { state, result: C.simulateEngine(state, { noise: false }) };
}

// Catalogue depth and explicit big-turbo support.
assert.strictEqual(C.CATEGORIES.length, 19, 'expected 19 component categories');
assert.strictEqual(C.CATEGORY_MAP.turbo.items.length, 17, 'expected 17 turbo choices');
assert.strictEqual(Math.max(...C.CATEGORY_MAP.turbo.items.map(x => x.compressorMm || 0)), 106, 'largest Precision (106 mm) missing');
assert(C.CATEGORY_MAP.turbo.items.some(x => x.id === 'pt9803' && x.compressorMm === 98), '98-mm turbo missing');
assert(C.CATEGORY_MAP.turbo.items.some(x => x.id === 'pt10603' && x.compressorMm === 106), '106-mm turbo missing');
// Aftermarket turbos are the Precision catalogue, ordered small to large by compressor inducer.
const ptSizes = C.CATEGORY_MAP.turbo.items.filter(x => /^pt/.test(x.id)).map(x => x.compressorMm);
assert.deepStrictEqual(ptSizes, [...ptSizes].sort((a, b) => a - b), 'Precision turbos must be ordered small to large');

// Plausible deterministic reference bands.
const stock = presetResult('stock');
approxBetween(stock.result.peakHp, 165, 250, 'OEM horsepower');
approxBetween(stock.result.peakTorqueNm, 215, 335, 'OEM torque');

const randy = presetResult('randy');
approxBetween(randy.result.peakHp, 450, 590, 'Randy K04 horsepower');
approxBetween(randy.result.peakTorqueNm, 620, 780, 'Randy K04 torque');
assert.strictEqual(randy.result.failureRpm, 0, randy.result.failureReason || 'Randy preset failed');
approxBetween(C.engineGeometry(randy.state).displacementCc, 2005, 2012, 'JE83 displacement');

const hx52 = presetResult('hx52');
approxBetween(hx52.result.peakHp, 690, 850, 'HX52 horsepower');
assert.strictEqual(hx52.result.failureRpm, 0, hx52.result.failureReason || 'HX52 preset failed');

const bigRanges = {
  pro98: [1250, 1750, 98],
  outlaw106: [1250, 1750, 106],
  unlimited: [1850, 2400, 106]
};
for (const [id, [minHp, maxHp, compressorMm]] of Object.entries(bigRanges)) {
  const entry = presetResult(id);
  approxBetween(entry.result.peakHp, minHp, maxHp, `${id} horsepower`);
  assert.strictEqual(entry.result.failureRpm, 0, entry.result.failureReason || `${id} failed`);
  assert.strictEqual(C.getPart(entry.state, 'turbo').compressorMm, compressorMm, `${id} compressor size`);
}

// No free preview: changing a component invalidates the prior measurement but does not overwrite it.
const measured = C.createInitialState();
assert(C.isDynoCurrent(measured), 'initial reference dyno should be current');
const oldHp = measured.lastDyno.peakHp;
const oldSignature = measured.lastDynoSignature;
measured.selections.turbo = 'hx52';
assert.strictEqual(measured.lastDyno.peakHp, oldHp, 'part switch must not invent a new dyno value');
assert.strictEqual(measured.lastDynoSignature, oldSignature, 'stored measurement signature must remain historical');
assert(!C.isDynoCurrent(measured), 'part switch must mark the dyno result stale');
const measuredAgain = C.simulateEngine(measured, { noise: false });
assert.notStrictEqual(Math.round(measuredAgain.peakHp), Math.round(oldHp), 'a real pull should expose a changed result');

// Big turbo spool strategy must have a physically meaningful effect without changing hardware:
// where boost is turbine-power (spool) limited, extra exhaust energy must raise achieved boost.
const noAssistState = C.applyPreset(C.blankState(), 'pro98');
noAssistState.selections.spool = 'none';
noAssistState.tune.boostLowBar = 1.6;
noAssistState.tune.boostMidBar = 2.6;
const noAssist = C.simulateEngine(noAssistState, { noise: false });
const assistedState = C.normalizeState(noAssistState);
assistedState.selections.spool = 'n2o_150';
const assisted = C.simulateEngine(assistedState, { noise: false });
const sampleAt = (r, rpm) => r.samples.find(p => p.rpm === rpm);
const boostAt = (r, rpm) => sampleAt(r, rpm)?.boostBar ?? 0;
assert(/spool/.test(sampleAt(noAssist, 5500).boostLimitedBy), '98-mm turbo should be spool limited at 5500 rpm with this target');
assert(boostAt(assisted, 5500) > boostAt(noAssist, 5500) * 2 + 0.3, 'nitrous spool assistance is too weak');

// Assembly and lubrication are actual constraints, not cosmetic fields.
const healthyAssembly = C.assemblyHealth(C.blankState());
approxBetween(healthyAssembly.score, 0.85, 1.01, 'healthy assembly score');
const tightRingState = C.blankState();
tightRingState.assembly.topRingGapMm = 0.28;
const tightRing = C.assemblyHealth(tightRingState);
assert(tightRing.ringTightRisk > healthyAssembly.ringTightRisk, 'tight ring-gap risk did not rise');
assert(C.simulateEngine(tightRingState, { noise: false }).reliabilityScore < randy.result.reliabilityScore, 'bad assembly should reduce reliability');

const lowOilState = C.applyPreset(C.blankState(), 'randy');
lowOilState.service.liters = 3.7;
const lowOil = C.simulateEngine(lowOilState, { noise: false });
assert(lowOil.reliabilityScore < randy.result.reliabilityScore, 'low oil level should reduce reliability');
assert(lowOil.warnings.some(w => /laag|olie/i.test(w.text)), 'low-oil warning missing');

// All six pre-dyno bench tests work and remain tied to the current build signature.
const benchState = C.blankState();
for (const test of C.BENCH_TESTS) {
  const result = C.runBenchTest(benchState, test.id);
  assert(result && result.id === test.id, `${test.id}: no result`);
  assert(Array.isArray(result.values) && result.values.length > 0, `${test.id}: no measured values`);
  assert(['pass', 'warn', 'fail'].includes(result.status), `${test.id}: invalid status`);
  benchState.bench.results[test.id] = result;
}
const confidence = C.benchConfidence(benchState);
assert.strictEqual(confidence.current, 6, 'bench result count');
assert.strictEqual(confidence.total, 6, 'bench total count');
assert(confidence.complete, 'bench suite should be complete');
assert(confidence.score >= 70, `bench confidence too low: ${confidence.score}`);
const benchSignature = C.benchSignature(benchState);
benchState.tune.railTargetBar += 5;
assert.notStrictEqual(C.benchSignature(benchState), benchSignature, 'bench signature did not react to a relevant tune change');
assert(C.benchConfidence(benchState).current < 6, 'stale bench tests should no longer count as current');

// Dyno diagnostic channels report actionable findings.
const diagnostics = C.diagnoseDyno(randy.result);
assert(Array.isArray(diagnostics) && diagnostics.length > 0, 'dyno diagnostics missing');
for (const item of diagnostics) {
  assert(item.system && item.observation && item.action, `incomplete diagnostic: ${JSON.stringify(item)}`);
}

// Wheel geometry, fitment, atmosphere, drivetrain and reaction-time logic.
const defaultState = C.blankState();
const tire = C.tireGeometry(defaultState.vehicle);
approxBetween(tire.diameterMm, 640, 680, 'default tire diameter');
approxBetween(tire.circumferenceM, 2.0, 2.2, 'default tire circumference');
assert.strictEqual(C.wheelFitment(defaultState.vehicle).warnings.length, 0, 'default wheel fitment should be clean');
approxBetween(C.airDensity(defaultState.vehicle), 1.05, 1.35, 'air density');
assert(Number.isFinite(C.densityAltitude(defaultState.vehicle)), 'density altitude missing');

for (const drivetrain of ['FWD', 'RWD', 'AWD']) {
  const state = C.applyPreset(C.blankState(), 'randy');
  state.vehicle.drivetrain = drivetrain;
  state.vehicle.preparedTrack = true;
  state.vehicle.tireCompound = drivetrain === 'FWD' ? 'drag_radial' : 'slick';
  const dyno = C.simulateEngine(state, { noise: false });
  const pass = C.simulateDrag(state, dyno, { reactionTime: 0.075 });
  approxBetween(pass.quarter, 6.5, 19, `${drivetrain} quarter-mile`);
  approxBetween(pass.trapKmh, 130, 330, `${drivetrain} trap speed`);
  approxBetween(pass.sixtyFt, 0.9, 4.2, `${drivetrain} 60-foot`);
  assert.strictEqual(pass.valid, true, `${drivetrain} run should be valid`);
  assert.strictEqual(pass.drivetrain.includes(drivetrain), true, `${drivetrain} label missing`);
  assert(Number.isFinite(pass.setup.densityAltitudeM), `${drivetrain} density-altitude telemetry missing`);
}
const red = C.simulateDrag(randy.state, randy.result, { reactionTime: -0.031 });
assert.strictEqual(red.redLight, true, 'red-light not detected');
assert.strictEqual(red.valid, false, 'red-light pass should be invalid');

// Normalization protects import/migration flows and preserves supported values.
const migrated = C.normalizeState({ version: 2, selections: { turbo: '106mm' }, vehicle: { drivetrain: 'AWD', rimDiameterIn: 18 } });
assert.strictEqual(migrated.version, 12, 'state schema was not upgraded');
assert.strictEqual(migrated.selections.turbo, 'pt10603', 'retired 106-mm turbo must migrate to the Precision PT10603');
assert.strictEqual(C.normalizeState({ selections: { turbo: 'pt6466' } }).selections.turbo, 'pt6466', 'valid imported turbo lost');
assert.strictEqual(C.normalizeState({ selections: { turbo: '127mm' } }).selections.turbo, 'pt10603', '127-mm (no longer offered) must migrate');
assert.strictEqual(migrated.vehicle.drivetrain, 'AWD', 'valid imported drivetrain lost');
assert(Array.isArray(migrated.buildSlots) && migrated.buildSlots.length === 3, 'build slots missing after normalization');
assert.strictEqual(migrated.vehicle.raceMode, 'heads_up', 'race mode default missing');
assert.strictEqual(migrated.vehicle.rivalLevel, 'street', 'rival default missing');
assert.strictEqual(migrated.vehicle.steeringSensitivityPct, 100, 'steering sensitivity default missing');

// Strict dyno result model (abort consistency) regression suite.
const dynoResultSuite = require('./test_dyno_result.js');
// Compressor-map turbo model: provenance, map fidelity, physical invariants.
const turboSuite = require('./test_turbo_map.js');
// Anti-lag, realtime turbo runtime and exhaust flames.
const antiLagSuite = require('./test_antilag.js');

const self = C.selfTest();
assert(self.ok, JSON.stringify(self.checks, null, 2));

const report = {
  categories: C.CATEGORIES.length,
  turboChoices: C.CATEGORY_MAP.turbo.items.length,
  maxTurboMm: Math.max(...C.CATEGORY_MAP.turbo.items.map(x => x.compressorMm || 0)),
  reference: {
    stock: { hp: Math.round(stock.result.peakHp), nm: Math.round(stock.result.peakTorqueNm) },
    randy: { hp: Math.round(randy.result.peakHp), nm: Math.round(randy.result.peakTorqueNm), reliability: randy.result.reliabilityScore },
    hx52: { hp: Math.round(hx52.result.peakHp), nm: Math.round(hx52.result.peakTorqueNm), reliability: hx52.result.reliabilityScore }
  },
  benchConfidence: confidence,
  selfTestChecks: self.checks.length,
  dynoAbortSweepCases: dynoResultSuite.abortedSweepCount,
  turboMaps: turboSuite,
  antiLag: antiLagSuite
};
console.log('PASS EA888 Lab v1.2 simulation tests');
console.log(JSON.stringify(report, null, 2));
