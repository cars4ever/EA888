'use strict';
// Regression tests for the strict dyno result model.
// Invariant: a dyno result never contains, summarises or charges wear for
// data from an rpm the simulated pull did not actually reach.
const assert = require('assert');
const C = require('../src/assets/sim.js');

const { COMPLETED, ABORTED, FAILED_TO_START } = C.DYNO_STATUS;
const SUMMARY_KEYS = [
  'peakHp', 'peakHpRpm', 'peakTorqueNm', 'peakTorqueRpm', 'maxBmepBar', 'maxMeanPistonSpeed', 'maxFuelDuty', 'maxTurboLoad',
  'maxTurboShaftRpm', 'maxEmpBar', 'maxIatC', 'maxEgtC', 'maxOilTempC', 'maxKnockRisk', 'maxOilAerationPct', 'minOilPressureBar'
];

// Reproduces the reported bug: v1.2.0 aborted this pull at 5900 rpm for severe
// knock but still displayed a "peak" of 845 hp @ 7900 rpm.
function knockAbortState() {
  const s = C.applyPreset(C.blankState(), 'hx52');
  s.tune.ignitionTrimDeg = 2;
  s.tune.knockControl = false;
  s.tune.boostHighBar += 0.6;
  s.selections.fuel = 'ron95';
  return s;
}

function assertNoFutureData(r, label) {
  assert.notStrictEqual(r.status, COMPLETED, `${label}: expected an aborted run`);
  assert.strictEqual(r.partial, true, `${label}: aborted run must be flagged partial`);
  assert.strictEqual(r.reliabilityScore, null, `${label}: aborted run must not carry a reliability score`);
  assert.strictEqual(r.rating, 'AFGEBROKEN', `${label}: aborted run must not carry a completed-run rating`);
  assert(!('curve' in r), `${label}: legacy full-sweep curve must not be exposed`);
  if (r.status === FAILED_TO_START) return;
  const abortRpm = r.abortRpm;
  assert(Number.isFinite(abortRpm) && abortRpm <= r.targetRpm, `${label}: abort rpm ${abortRpm} must not exceed target ${r.targetRpm}`);
  assert(r.abortReason, `${label}: abort reason missing`);
  assert(r.samples.length > 0, `${label}: partial telemetry missing`);
  for (const p of r.samples) assert(p.rpm <= abortRpm, `${label}: sample at ${p.rpm} rpm lies beyond abort at ${abortRpm} rpm`);
  assert.strictEqual(r.samples[r.samples.length - 1].rpm, abortRpm, `${label}: telemetry must end exactly at the abort point`);
  assert.strictEqual(r.rpmReached, abortRpm, `${label}: rpmReached must equal abort rpm`);
  for (const key of ['peakHpRpm', 'peakTorqueRpm'])
    if (r[key] !== null) assert(r[key] <= abortRpm, `${label}: ${key} ${r[key]} references an rpm above the abort point ${abortRpm}`);
  // Every summary value must be reproducible from the reached samples alone.
  const fromSamples = C.summarizeDynoSamples(r.samples);
  for (const key of SUMMARY_KEYS) {
    if (r[key] === null && ['peakHp', 'peakHpRpm', 'peakTorqueNm', 'peakTorqueRpm'].includes(key)) continue;
    assert.strictEqual(r[key], fromSamples[key], `${label}: ${key}=${r[key]} is not derived from observed samples (${fromSamples[key]})`);
  }
  // Wear covers only the simulated duration of the pull.
  const dt = 100 / r.dynoConfig.rampRpmPerSec;
  assert(Math.abs(r.wear.durationS - r.samples.length * dt) < 1e-9, `${label}: wear duration does not match reached samples`);
}

// 1. The reported case.
const knockState = knockAbortState();
const knock = C.simulateEngine(knockState, { noise: false });
assert.strictEqual(knock.status, ABORTED, 'knock fixture should abort');
assert.strictEqual(knock.abortRpm, 5900, 'knock fixture abort rpm');
assert.strictEqual(knock.abortKind, 'engine-failure');
assert.strictEqual(knock.abortCode, 'knock');
assert(/knock/i.test(knock.abortReason), 'abort reason should name knock');
assertNoFutureData(knock, 'knock fixture');
assert(knock.peakHp !== null && knock.peakHpRpm <= 5900, 'observed partial peak should be quoted, at or below 5900 rpm');
assert(knock.peakHp < 845 * 0.8, `partial peak ${knock.peakHp} still resembles the unreached 7900 rpm value`);
assert(knock.damage.engine >= 18, 'engine failure must record damage');

// With noise enabled (as in the app) the invariant holds as well.
assertNoFutureData(C.simulateEngine(knockState), 'knock fixture with measurement noise');

// 2. Wear/damage of a failed pull equals the wear of the same pull stopped one
// sample earlier plus only the failing sample: nothing after it is charged.
const justBefore = C.simulateEngine(knockState, { noise: false, stopAtRpm: 5800 });
assert.strictEqual(justBefore.status, ABORTED);
assert.strictEqual(justBefore.abortKind, 'operator');
assert.deepStrictEqual(knock.samples.slice(0, -1), justBefore.samples, 'samples before the abort must be identical to a shorter pull');
const oneSampleWear = knock.wear.engine - justBefore.wear.engine;
assert(oneSampleWear >= 0 && oneSampleWear < 0.05, `abort wear should add at most one sample (${oneSampleWear})`);

// 3. Operator abort at any rpm: exact prefix of the full pull, no damage.
const full = C.simulateEngine(C.blankState());
assert.strictEqual(full.status, COMPLETED);
assert.strictEqual(full.abortRpm, null);
assert.strictEqual(full.rpmReached, full.targetRpm);
assert(Number.isFinite(full.reliabilityScore));
let prevWear = 0;
for (const stopAt of [2500, 3900, 4700, 6100, 7300]) {
  const partial = C.simulateEngine(C.blankState(), { stopAtRpm: stopAt });
  const label = `operator stop @ ${stopAt}`;
  assert.strictEqual(partial.status, ABORTED, label);
  assert.strictEqual(partial.abortKind, 'operator', label);
  assert.strictEqual(partial.failureRpm, 0, `${label}: operator stop is not an engine failure`);
  assert.deepStrictEqual(partial.damage, { engine: 0, turbo: 0 }, `${label}: operator stop must not add damage`);
  assertNoFutureData(partial, label);
  assert.deepStrictEqual(partial.samples, full.samples.filter(p => p.rpm <= stopAt), `${label}: telemetry is not a prefix of the pull`);
  assert(partial.wear.engine > prevWear && partial.wear.engine < full.wear.engine, `${label}: wear must grow with the distance pulled`);
  prevWear = partial.wear.engine;
  assert.throws(() => C.simulateDrag(C.blankState(), partial), /niet voltooid/, `${label}: drag must require a completed pull`);
}

// 4. Too little data: no partial peak is quoted at all.
const tiny = C.simulateEngine(C.blankState(), { stopAtRpm: 1800 });
assert(tiny.samples.length < C.DYNO_MIN_PARTIAL_SAMPLES);
for (const key of ['peakHp', 'peakHpRpm', 'peakTorqueNm', 'peakTorqueRpm', 'estimatedAirflowLbMin'])
  assert.strictEqual(tiny[key], null, `insufficient data must show no ${key}`);
assertNoFutureData(tiny, 'tiny pull');

// 5. Failed to start: no samples, no wear, no score.
const deadState = C.blankState();
deadState.damage.engine = 100;
const dead = C.simulateEngine(deadState);
assert.strictEqual(dead.status, FAILED_TO_START);
assert.strictEqual(dead.samples.length, 0);
assert.strictEqual(dead.peakHp, null);
assert.strictEqual(dead.wear.engine, 0);
assertNoFutureData(dead, 'failed to start');

// 6. Committing results: state is canonical and consistent.
let st = C.commitDynoResult(knockState, knock);
assert.strictEqual(st.lastDyno.status, ABORTED);
assert(C.isDynoCurrent(st), 'aborted measurement is still the current measurement of this build');
assert(!C.isCompletedDyno(st.lastDyno), 'but it is not a completed one');
assert.strictEqual(st.dynoRuns[0].label, 'Afgebroken @ 5900 rpm');
assert(Math.abs(st.wear.engine - (knockState.wear.engine + knock.wear.engine)) < 1e-9, 'engine wear must come from the reached samples');
assert(Math.abs(st.damage.engine - (knockState.damage.engine + knock.damage.engine)) < 1e-9, 'engine damage must come from the failure event');
assert.strictEqual(st.history[0].partial, true);
assert.throws(() => C.simulateDrag(st, st.lastDyno), /motorschade/, 'drag must be blocked after an engine-failure abort');
assert.strictEqual(C.evaluateChallenges(st).first_pull, false, 'an aborted pull cannot complete the first-pull challenge');
const completedState = C.commitDynoResult(C.blankState(), full);
assert(C.isCompletedDyno(completedState.lastDyno));
assert(C.simulateDrag(completedState, completedState.lastDyno, { reactionTime: 0.1 }).quarter > 0);

// 7. Diagnosis presents aborted data as partial.
assert(/partieel/.test(C.diagnoseDyno(knock)[0].observation), 'diagnosis must label aborted values as partial');

// 8. Results stored by v1.2.0 (full sweep kept after a failure) are repaired.
const legacy = {
  curve: [1500, 3000, 4500, 5900, 7000, 7800].map((rpm, i) => ({ rpm, hp: 100 + i * 120, torqueNm: 300 + i * 60, egtC: 700 + i * 50, oilPressureBar: 4 })),
  failureRpm: 5900,
  failureReason: 'Zware knock/detonatie.',
  peakHp: 700,
  peakHpRpm: 7800,
  peakTorqueNm: 600,
  peakTorqueRpm: 7800,
  maxEgtC: 950,
  reliabilityScore: 12,
  status: 'AFGEBROKEN',
  warnings: [{ text: 'Hoge EGT 950°C' }],
  dynoConfig: { rampRpmPerSec: 550 }
};
const migrated = C.normalizeState({ lastDyno: legacy, dynoRuns: [legacy] });
for (const r of [migrated.lastDyno, migrated.dynoRuns[0]]) {
  assert.strictEqual(r.status, ABORTED);
  assert.strictEqual(r.legacyMigrated, true);
  assert.deepStrictEqual(r.samples.map(p => p.rpm), [1500, 3000, 4500, 5900]);
  assert.strictEqual(r.reliabilityScore, null);
  assert.strictEqual(r.maxEgtC, 850, 'legacy maxima must be recomputed from reached samples');
  assert.deepStrictEqual(r.warnings, [], 'legacy warnings derived from unreached data must be dropped');
  assert.strictEqual(r.peakHp, null, 'legacy run with too few samples must not quote a peak');
}
const legacyOk = C.normalizeState({ lastDyno: { curve: full.samples, failureRpm: 0, status: 'STRAKKE MARGE', reliabilityScore: 65 } }).lastDyno;
assert.strictEqual(legacyOk.status, COMPLETED);
assert.strictEqual(legacyOk.rating, 'STRAKKE MARGE');
assert.strictEqual(legacyOk.reliabilityScore, 65);

// 9. Property sweep: every aborting configuration obeys the invariant.
let aborted = 0;
for (const preset of Object.keys(C.PRESETS))
  for (const trim of [0, 3, 6])
    for (const knockControl of [true, false])
      for (const extraBoost of [0, 0.5])
        for (const fuel of ['ron95', 'ron98', 'e85']) {
          const s = C.applyPreset(C.blankState(), preset);
          s.tune.ignitionTrimDeg = trim;
          s.tune.knockControl = knockControl;
          s.tune.boostHighBar += extraBoost;
          s.tune.boostMidBar += extraBoost;
          if (C.CATEGORY_MAP.fuel.items.some(f => f.id === fuel)) s.selections.fuel = fuel;
          const r = C.simulateEngine(s);
          if (r.status === COMPLETED) {
            assert.strictEqual(r.rpmReached, r.targetRpm, `${preset}: completed run must reach target`);
            continue;
          }
          aborted++;
          assertNoFutureData(r, `${preset} trim ${trim} kc ${knockControl} +${extraBoost} ${fuel}`);
        }
assert(aborted > 50, `property sweep exercised too few aborts (${aborted})`);

module.exports = { abortedSweepCount: aborted };
