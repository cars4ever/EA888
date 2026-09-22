'use strict';
// Anti-lag, realtime turbo runtime and exhaust-flame invariants.
const assert = require('assert');
const C = require('../src/assets/sim.js');

const base = C.createInitialState(); // Randy build: Syvecs ECU, K04 hybrid, completed reference pull
const withAls = (mode, patch = {}) => {
  const s = C.normalizeState(JSON.parse(JSON.stringify(base)));
  s.tune.als = { ...s.tune.als, ...patch, mode };
  return s;
};
const hold = (s, opts = {}) => C.simulateAntiLagHold(s, { seconds: 4, rpm: 4300, ...opts });
const at = (h, t) => h.trace.find(p => Math.abs(p.t - t) < 0.051);

// 1. Off: only the two-step, no ALS energy, no flames.
const off = hold(withAls('off'));
assert.strictEqual(off.alsSeconds, 0);
assert(off.trace.every(p => !p.alsActive && p.flameIntensity === 0), 'ALS off must not fire or flame');
assert(off.finalBoostBar < 0.6, `two-step alone should build little boost (${off.finalBoostBar})`);

// 2. More aggressive presets hold more boost and cost more heat, fuel and wear.
const modes = ['mild', 'street', 'rally', 'drag'].map(m => [m, hold(withAls(m))]);
for (let i = 1; i < modes.length; i++) {
  const [pm, prev] = modes[i - 1], [m, cur] = modes[i];
  assert(at(cur, 1).boostBar > at(prev, 1).boostBar, `${m} should build more boost than ${pm}`);
  assert(cur.fuelUsedG > prev.fuelUsedG, `${m} should use more fuel than ${pm}`);
}
const drag = modes[3][1];
assert(drag.maxEgtC > off.maxEgtC + 150, 'aggressive ALS must raise EGT sharply');
assert(drag.maxEmpBar > off.maxEmpBar * 2, 'ALS must raise exhaust manifold pressure');
assert(drag.fuelUsedG > off.fuelUsedG * 1.5, 'ALS must cost fuel');
assert(drag.wear.turbo > 0 && drag.wear.valves > 0, 'ALS must wear the turbo and valves');
assert(drag.maxShaftPct > off.maxShaftPct + 30, 'ALS must spin the turbo up');
assert(drag.trace.some(p => p.flameIntensity > 0.3), 'drag ALS should produce clear flames');
assert(modes[0][1].trace.every(p => p.flameIntensity < drag.trace.reduce((m, q) => Math.max(m, q.flameIntensity), 0)), 'mild ALS flames must be smaller');

// 3. Protection: EGT limit, shaft limit and timeout/cooldown are honoured.
const egtLimited = hold(withAls('custom', { ...C.ANTI_LAG_PRESETS.drag, maxEgtC: 900 }));
assert(egtLimited.maxEgtC < 945, `EGT limit exceeded: ${egtLimited.maxEgtC}`);
const mild = modes[0][1];
const lockedOut = mild.trace.filter(p => p.t > 2.7);
assert(lockedOut.length && lockedOut.every(p => !p.alsActive && p.alsLimitedBy === 'cooldown'), 'timeout must lock ALS out for the cooldown');
assert(at(mild, 3.9).boostBar < at(mild, 2.0).boostBar, 'boost must fall once ALS times out');

// 4. Overly aggressive ALS is not free: it damages the turbo and manifold.
const abusive = hold(withAls('custom', { aggressiveness: 100, retardDeg: 45, extraFuelPct: 40, bypassPct: 40, maxEgtC: 1250, maxShaftPct: 110, timeoutS: 15, targetBoostBar: 3 }), { seconds: 8 });
assert(abusive.damage.turbo > 1, 'abusive ALS must damage the turbo');
assert(abusive.wear.manifold > drag.wear.manifold * 10, 'abusive ALS must wear the manifold much faster');

// 5. Hardware/ECU limits.
const oem = withAls('drag');
oem.selections.ecu = 'med17';
assert.strictEqual(C.resolveAntiLag(oem).enabled, false, 'OEM MED17 has no anti-lag');
const oemRun = C.createTurboRuntime(oem);
for (let i = 0; i < 40; i++) oemRun.step(0.05, { rpm: 4300, throttle: 0, twoStep: true, alsRequest: true });
assert.strictEqual(oemRun.state.alsSeconds, 0, 'ALS must not run on an ECU without support');
const limited = withAls('drag');
limited.selections.ecu = 'custom_med17';
assert(C.resolveAntiLag(limited).params.aggressiveness <= 45, 'custom MED17 limits aggressiveness');
assert(C.resolveAntiLag(withAls('drag')).params.bypassPct <= C.antiLagCapability(base).bypassMaxPct, 'bypass limited by hardware');
const hw = withAls('drag');
hw.selections.spool = 'hard_als';
assert(C.resolveAntiLag(hw).params.bypassPct > C.resolveAntiLag(withAls('drag')).params.bypassPct, 'ALS bypass hardware allows more bypass air');

// 6. ALS is not part of a WOT dyno pull: changing it keeps the measurement current.
const sig = C.engineSignature(base);
assert.strictEqual(C.engineSignature(withAls('drag')), sig, 'ALS settings must not invalidate the dyno');

// 7. Launch benefit: after an ALS hold the turbo reaches boost sooner at WOT.
const launch = s => {
  const rt = C.createTurboRuntime(s);
  for (let i = 0; i < 40; i++) rt.step(0.05, { rpm: 4300, throttle: 0, twoStep: true, alsRequest: true });
  let b = 0;
  for (let i = 0; i < 6; i++) b = rt.step(0.05, { rpm: 4300 + i * 60, throttle: 1 }).boostBar;
  return b;
};
assert(launch(withAls('drag')) > launch(withAls('off')) + 0.4, 'ALS must give more boost right after launch');

// 8. Exhaust flames follow combustion conditions.
const good = C.exhaustFlameEvent({ kind: 'shift', egtC: 900, fuelGps: 30, cutS: 0.06, unburntFraction: 0.5, severity: 0.2 });
const late = C.exhaustFlameEvent({ kind: 'limiter', egtC: 1000, fuelGps: 36, cutS: 0.14, unburntFraction: 0.75, severity: 0.8 });
const cold = C.exhaustFlameEvent({ kind: 'shift', egtC: 600, fuelGps: 30, cutS: 0.06, unburntFraction: 0.5, severity: 0.2 });
const noFuel = C.exhaustFlameEvent({ kind: 'shift', egtC: 1000, fuelGps: 30, cutS: 0.06, unburntFraction: 0, severity: 0.5 });
assert(good.visible && late.visible, 'hot shifts with unburnt fuel should flame');
assert(late.intensity > good.intensity * 1.8 && late.durationMs > good.durationMs, 'late/limiter flame must be larger and longer');
assert(!cold.visible, 'no flame when the exhaust is too cold');
assert(!noFuel.visible, 'no flame without unburnt fuel');

// 9. Wear from a runtime is applied to the canonical state.
const applied = C.applyRuntimeWear(base, { wear: { turbo: 0.5, manifold: 0.2, valves: 0.1, engine: 0.05 }, damage: { turbo: 1 } });
assert(Math.abs(applied.wear.turbo - base.wear.turbo - 0.5) < 1e-9 && applied.wear.manifold === 0.2 && applied.damage.turbo === 1);

module.exports = { dragAlsBoost: +drag.finalBoostBar.toFixed(2), dragAlsEgtC: Math.round(drag.maxEgtC) };
