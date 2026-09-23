'use strict';
// Tyre temperatures, the physical burnout and race knock events (sim.js).
const assert = require('assert');
const C = require('../src/assets/sim.js');
const build = (preset, mutate) => { const s = C.applyPreset(C.blankState(), preset); if (mutate) mutate(s); return C.normalizeState(s); };
const T = C.TYRE_THERMAL;

// 1. Heating: at the first instant the skin warms at (share into the tyre x slip power / tyres) / its heat capacity.
{
  const th = C.makeTyreThermal(30), P = 80000, h = 0.001;
  C.tyreThermalStep(th, h, { slipPowerW: P, tyres: 2, speedMs: 0, ambientC: 30, trackC: 30 });
  const rate = (th.surfaceC - 30) / h, expected = (T.intoTyre * P / 2) / T.surfaceJK;
  assert(Math.abs(rate - expected) / expected < 0.01, `skin heating rate ${rate} vs ${expected} K/s`);
}
// 2. Cooling: the thin skin falls back to the bulk within seconds; the bulk holds its heat far longer.
{
  const th = { surfaceC: 160, bulkC: 50 };
  const after5 = C.tyreThermalAfter(th, 5, { ambientC: 20, trackC: 28 });
  assert(after5.surfaceC < 70 && after5.surfaceC > after5.bulkC - 1, `skin after 5 s: ${after5.surfaceC}`);
  assert(after5.bulkC > 50 && after5.bulkC < 60, `bulk after 5 s: ${after5.bulkC}`);
  const after120 = C.tyreThermalAfter(th, 120, { ambientC: 20, trackC: 28 });
  assert(after120.bulkC > 35, 'the bulk must stay warm for minutes');
  // more air speed, more convection
  const still = C.tyreThermalAfter({ surfaceC: 80, bulkC: 80 }, 10, { speedMs: 0, ambientC: 20, trackC: 20 });
  const moving = C.tyreThermalAfter({ surfaceC: 80, bulkC: 80 }, 10, { speedMs: 30, ambientC: 20, trackC: 20 });
  assert(moving.surfaceC < still.surfaceC - 3, 'a rolling tyre cools faster than a standing one');
}
// 3. One temperature window for all grip: full at the optimum, less cold and hot, floor 62 %.
for (const [id, t] of Object.entries(C.TYRE)) {
  assert.strictEqual(C.tyreTempFactor(t, t.optC), 1, `${id}: full grip at the optimum`);
  assert(C.tyreTempFactor(t, t.optC - 25) < 1 && C.tyreTempFactor(t, t.optC + 25) < 1, `${id}: less grip off the optimum`);
  assert(C.tyreTempFactor(t, t.optC + 300) === 0.62, `${id}: floor`);
  const grip = C.gripFactor({ ...C.blankState().vehicle, tireCompound: id, burnoutLevel: 0, trackTempC: t.optC });
  assert.strictEqual(grip.tempFactor, 1, `${id}: the setup grip uses the same window`);
}

// 4. Burnout: engine, clutch dump and spinning tyres on the brakes.
function burnout(preset, seconds, mutate) {
  const st = build(preset, s => { s.vehicle.tireCompound = 'drag_radial'; if (mutate) mutate(s); });
  const b = C.createBurnoutRuntime(st, { targetRpm: 5000, startC: 28 });
  let p, maxSmoke = 0, smokeBelow110 = false, maxRpm = 0;
  for (let t = 0; t < seconds; t += 0.01) {
    p = b.step(0.01, { throttle: true });
    maxSmoke = Math.max(maxSmoke, p.smoke);
    if (p.smoke > 0.01 && p.tyreSurfaceC < 110) smokeBelow110 = true;
    if (t > 1.5) maxRpm = Math.max(maxRpm, p.rpm);
  }
  return { b, p, maxSmoke, smokeBelow110, maxRpm, st };
}
{
  const { b, p, maxSmoke, smokeBelow110, maxRpm, st } = burnout('randy', 5);
  // tyre surface speed = engine speed through first gear and the final drive (clutch locked, car held)
  const tr = C.getPart(st, 'transmission');
  const expectKmh = p.rpm / (tr.gearRatios[0] * tr.finalDrive) / 60 * 2 * Math.PI * b.tyre.geometry.radiusM * 3.6;
  assert(Math.abs(p.tyreSurfaceKmh - expectKmh) / expectKmh < 0.03, `tyre surface ${p.tyreSurfaceKmh} vs ${expectKmh} km/h`);
  assert(Math.abs(p.rpm - 5000) < 300 && maxRpm < 5600, `the driver holds the burnout rpm: ${p.rpm} (max ${maxRpm})`);
  assert(p.slipPowerKw > 30 && p.slipPowerKw < 200, `slip power ${p.slipPowerKw} kW`);
  assert(p.tyreSurfaceC > 120 && p.tyreBulkC > 35 && p.tyreBulkC < p.tyreSurfaceC, `after 5 s: skin ${p.tyreSurfaceC}, bulk ${p.tyreBulkC}`);
  assert(maxSmoke > 0.05 && !smokeBelow110, 'smoke only from a hot skin');
  assert(p.boostBar >= 0 && Number.isFinite(p.boostBar), 'boost from the turbo runtime');
}
{
  const short = burnout('randy', 2), long = burnout('randy', 7);
  assert(long.p.tyreBulkC > short.p.tyreBulkC + 5, 'a longer burnout heats the bulk more');
  const cool = th => C.tyreGripTempC(C.tyreThermalAfter(th, 20, { ambientC: 20, trackC: 28, speedMs: 1 }));
  assert(cool(long.b.tyreThermal) > cool(short.b.tyreThermal), 'and leaves more heat for the launch');
  // no throttle, no burnout: nothing spins, nothing heats
  const st = build('randy');
  const idle = C.createBurnoutRuntime(st, { startC: 28 });
  for (let i = 0; i < 200; i++) idle.step(0.01, { throttle: false });
  assert(idle.point().tyreSurfaceKmh === 0 && Math.abs(idle.point().tyreSurfaceC - 28) < 0.5, 'released: no slip, no heat');
}

// 5. The race starts from the tyre state the burnout and staging left, and grip follows it.
{
  const st = build('randy', s => { s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; });
  const rt = C.createRaceRuntime(st, { tyreThermal: { surfaceC: 61, bulkC: 47 } });
  const p0 = rt.point();
  assert(p0.tyreSurfaceC === 61 && p0.tyreBulkC === 47 && Math.abs(p0.tyreTempC - C.tyreGripTempC({ surfaceC: 61, bulkC: 47 })) < 1e-9, 'race continues the tyre state');
  const opt = C.TYRE.drag_radial.optC;
  const run = th => C.simulateRaceRun(st, { reactionTime: 0, tyreTempC: th });
  const cold = run(22), right = run(opt), greasy = run(opt + 70);
  assert(right.sixtyFt < cold.sixtyFt && right.sixtyFt < greasy.sixtyFt, `60 ft: cold ${cold.sixtyFt}, optimum ${right.sixtyFt}, overheated ${greasy.sixtyFt}`);
}

// 6. Knock in the race: none where the ECU map keeps its margin; knock control trades timing (and time)
//    for safety; without it the knocking cycles damage the engine.
{
  for (const preset of ['stock', 'k04', 'hx52']) {
    const r = C.simulateRaceRun(build(preset), { reactionTime: 0 });
    assert.strictEqual(r.knockDamagePct, 0, `${preset}: no knock damage on its own map`);
    assert(r.knockEvents <= 10, `${preset}: at most borderline knock (${r.knockEvents} events)`);
  }
  const bad = kc => build('hx52', s => { s.selections.fuel = 'ron95'; s.tune.ignitionTrimDeg = 4; s.tune.knockControl = kc; });
  const off = C.simulateRaceRun(bad(false), { reactionTime: 0 }), on = C.simulateRaceRun(bad(true), { reactionTime: 0 });
  assert(off.knockEvents > 100 && off.knockDamagePct > 0.5, `knock control off: ${off.knockEvents} events, ${off.knockDamagePct} % damage`);
  assert(on.knockDamagePct === 0 && on.kcMaxRetardDeg > 1, `knock control on: retard ${on.kcMaxRetardDeg} deg, no damage`);
  assert(on.knockEvents < off.knockEvents, 'the retard itself lowers the knock');
}

module.exports = { compounds: Object.keys(C.TYRE).length };
console.log('PASS tyre, burnout and knock tests');

// 7. Wheel hop: the driveline's torsional mode against a tyre past its peak. OEM mounts let a clutch dump on
//    a stock ECU hop; stiffer, better damped mounts raise the mode and stop it, step by step.
{
  const oem = C.hopMode(build('stock'), 'oem_mounts'), solid = C.hopMode(build('stock'), 'solid_race');
  assert(oem.hz > 5 && oem.hz < 12, `OEM hop mode ${oem.hz} Hz`);
  assert(solid.hz > oem.hz && solid.zeta > oem.zeta, 'stiffer mounts: higher and better damped mode');
  const hopFor = (preset, mutate, mounts, cfg = {}) => C.simulateRaceRun(build(preset, s => { mutate(s); s.selections.mounts = mounts; }), { reactionTime: 0, tyreTempC: C.TYRE[build(preset, mutate).vehicle.tireCompound].optC, ...cfg });
  const order = ['oem_mounts', 'dogbone_insert', 'poly_mounts', 'solid_race'];
  const cases = [
    ['stock', s => { s.vehicle.tireCompound = 'uhp'; }, {}],
    ['randy', s => { s.vehicle.tireCompound = 'uhp'; }, { tractionControl: false }],
    ['randy', s => { s.vehicle.tireCompound = 'semislick'; }, { tractionControl: false }]
  ];
  for (const [preset, mutate, cfg] of cases) {
    const runs = order.map(m => hopFor(preset, mutate, m, cfg));
    assert(runs[0].hopS > 0.3, `${preset}: OEM mounts must hop (${runs[0].hopS} s)`);
    for (let i = 1; i < runs.length; i++) assert(runs[i].hopS <= runs[i - 1].hopS + 0.02, `${preset}: ${order[i]} must not hop more than ${order[i - 1]}`);
    assert(runs[2].hopS < 0.05, `${preset}: poly mounts stop the hop (${runs[2].hopS} s)`);
    assert(runs[0].hopWearPct > runs[2].hopWearPct, 'hopping wears the driveline');
  }
  // traction control keeps the tyre at its peak: less hop than without
  const tcOn = hopFor('randy', s => { s.vehicle.tireCompound = 'uhp'; }, 'oem_mounts', { tractionControl: true });
  const tcOff = hopFor('randy', s => { s.vehicle.tireCompound = 'uhp'; }, 'oem_mounts', { tractionControl: false });
  assert(tcOn.hopS <= tcOff.hopS, `TC must not add hop (${tcOn.hopS} vs ${tcOff.hopS})`);
  // a solid mount passes vibration into the driveline on every pass
  assert(C.hopWearPct({ hopS: 0, hopMaxI: 0 }, C.CATEGORY_MAP.mounts.items.find(m => m.id === 'solid_race')) > 0, 'solid mounts: NVH wear');
}
