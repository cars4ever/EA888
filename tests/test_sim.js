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
assert.strictEqual(C.CATEGORIES.length, 21, 'expected 21 component categories (compound = a second turbo from the turbo list, not a category)');
assert.strictEqual(C.CATEGORY_MAP.turbo.items.length, 17, 'expected 17 turbo choices');
assert.strictEqual(Math.max(...C.CATEGORY_MAP.turbo.items.map(x => x.compressorMm || 0)), 106, 'largest Precision (106 mm) missing');
assert(C.CATEGORY_MAP.turbo.items.some(x => x.id === 'pt9803' && x.compressorMm === 98), '98-mm turbo missing');
assert(C.CATEGORY_MAP.turbo.items.some(x => x.id === 'pt10603' && x.compressorMm === 106), '106-mm turbo missing');
// Aftermarket turbos are the Precision catalogue, ordered small to large by compressor inducer.
const ptSizes = C.CATEGORY_MAP.turbo.items.filter(x => /^pt/.test(x.id)).map(x => x.compressorMm);
assert.deepStrictEqual(ptSizes, [...ptSizes].sort((a, b) => a - b), 'Precision turbos must be ordered small to large');

// Reference bands (pk = PS). Stock: VW quotes 147 kW / 200 PS and 280 Nm for the CAWB; a chassis-dyno pull on
// the physical model must land within ~7 % of that. The K04-064 hybrid is rated ~500 hp; on its 1.9 bar map
// with E20 + WMI it lands a little below the rating. BMEP stays in the range a 2.0 TSI actually runs (< 36 bar).
const stock = presetResult('stock');
approxBetween(stock.result.peakHp, 186, 214, 'OEM power (200 PS +/- 7 %)');
approxBetween(stock.result.peakTorqueNm, 260, 300, 'OEM torque (280 Nm +/- 7 %)');

const randy = presetResult('randy');
approxBetween(randy.result.peakHp, 430, 540, 'Randy K04 hybrid power');
approxBetween(randy.result.peakTorqueNm, 470, 600, 'Randy K04 hybrid torque');
approxBetween(randy.result.maxBmepBar, 25, 36, 'Randy K04 hybrid BMEP');
assert.strictEqual(randy.result.failureRpm, 0, randy.result.failureReason || 'Randy preset failed');
approxBetween(C.engineGeometry(randy.state).displacementCc, 2005, 2012, 'JE83 displacement');

const hx52 = presetResult('hx52');
approxBetween(hx52.result.peakHp, 540, 720, 'HX52 power (~2.1 bar E85 on 2.0 L)');
assert.strictEqual(hx52.result.failureRpm, 0, hx52.result.failureReason || 'HX52 preset failed');

// Pro builds: 80-86 mm compressors (a 98/106 mm wheel surges on 2.0 L at any rpm it can reach).
const bigRanges = {
  pro98: [850, 1150, 86],
  outlaw106: [950, 1250, 80],
  unlimited: [1300, 1750, 86]
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

// Part masses count in the race: the drag model uses the whole build's mass, not only the gearbox.
{
  const light = C.blankState();
  const heavy = C.normalizeState(light);
  heavy.selections.oiling = 'dry_sump';
  heavy.selections.air = 'ice_tank';
  const delta = C.buildMassKg(heavy) - C.buildMassKg(light);
  const expected = C.CATEGORY_MAP.oiling.items.find(x => x.id === 'dry_sump').massDeltaKg - C.getPart(light, 'oiling').massDeltaKg
    + C.CATEGORY_MAP.air.items.find(x => x.id === 'ice_tank').massDeltaKg - C.getPart(light, 'air').massDeltaKg;
  assert(Math.abs(delta - expected) < 1e-9 && delta > 0, `part masses ignored: +${delta} kg vs +${expected} kg`);
  assert.strictEqual(C.simulateDrag(randy.state, randy.result, { reactionTime: 0.1 }).totalMassKg, C.buildMassKg(randy.state), 'drag must use the build mass');
}

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
// Physical engine model: combustion, breathing, knock, fuel system, ECU tables.
const engineSuite = require('./test_engine.js');
// Vehicle model: tyres, clutch, load transfer, gearboxes, shared by player and rivals.
const vehicleSuite = require('./test_vehicle.js');
// Career events and bracket (dial-in) racing rules.
const careerSuite = require('./test_career.js');
// Engine voice: sound synthesized from the combustion events (firing order, cuts, afterfire, knock).
const audioSuite = require('./test_audio.js');
// Tyre temperatures, the physical burnout and knock events in the race.
const tyreSuite = require('./test_tyres.js');
// Tuner advice: recommendations that are solved on the same simulation the dyno measures.
const adviceSuite = require('./test_advice.js');
// Stroker/destroker, welded head, compound boost, driver nitrous.
const phase8Suite = require('./test_phase8.js');
const phase9Suite = require('./test_phase9.js');
const phase10Suite = require('./test_phase10.js');

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
  antiLag: antiLagSuite,
  engine: engineSuite,
  vehicle: vehicleSuite,
  career: careerSuite,
  audio: audioSuite,
  tyres: tyreSuite,
  advice: adviceSuite,
  phase8: phase8Suite,
  phase9: phase9Suite,
  phase10: phase10Suite
};
console.log('PASS EA888 Lab v1.2 simulation tests');
console.log(JSON.stringify(report, null, 2));
