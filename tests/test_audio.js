'use strict';
// Engine voice (src/assets/engine-voice.js): the sound is built from the combustion events, so it has
// to obey the same physics as the engine it represents. Rendered offline, deterministically.
const assert = require('assert');
const V = require('../src/assets/engine-voice.js');

const SR = 32000;
function render(voice, params, seconds) {
  voice.set(params);
  const n = Math.round(seconds * SR);
  const exh = new Float32Array(n), bay = new Float32Array(n), pop = new Float32Array(n);
  for (let i = 0; i < n; i += 128) {
    const m = Math.min(128, n - i);
    voice.render(exh.subarray(i, i + m), bay.subarray(i, i + m), pop.subarray(i, i + m), m);
  }
  return { exh, bay, pop };
}
// Settle on the operating point, then measure one second: returns the signals and the event counts.
function measure(params, { seed = 5, settle = 0.6, seconds = 1 } = {}) {
  const v = new V.EngineVoice(SR, seed);
  render(v, params, settle);
  const s0 = { ...v.stats };
  const out = render(v, params, seconds);
  const d = {};
  for (const k of ['cycles', 'fired', 'late', 'sparkCut', 'fuelCut', 'pops', 'knocks']) d[k] = (v.stats[k] - s0[k]) / seconds;
  return { v, ...out, d };
}
const rms = x => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
function tone(x, f) { // Goertzel magnitude at f
  const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / x.length;
}
function band(x, f0, f1, step = 25) { let e = 0; for (let f = f0; f <= f1; f += step) e += tone(x, f) ** 2; return Math.sqrt(e); }
const finite = x => x.every(Number.isFinite);

// 1. Four-stroke inline four: one combustion event per 180 degrees of crank, rpm/30 per second.
for (const rpm of [900, 3000, 6000, 8500]) {
  const m = measure({ rpm, load: 0.8 });
  assert(Math.abs(m.d.cycles - rpm / 30) <= 1.5, `${rpm} rpm: ${m.d.cycles} events/s, expected ${rpm / 30}`);
  assert(finite(m.exh) && finite(m.bay) && finite(m.pop), `${rpm} rpm: non-finite samples`);
}
assert.deepStrictEqual(V.FIRING, [1, 3, 4, 2], 'EA888 firing order');

// 2. Even firing: the firing frequency dominates the half and quarter orders of the cycle.
{
  const rpm = 4500, f = rpm / 30, m = measure({ rpm, load: 1, boostBar: 1.1, egtC: 900 });
  const F = tone(m.exh, f);
  assert(F > 6 * tone(m.exh, f / 2) && F > 6 * tone(m.exh, f / 4), 'firing order must dominate the cam orders');
}

// 3. Load: at full load and boost the exhaust is much louder than at idle; on the overrun the fuel is
//    cut (no combustion events) and the note collapses.
{
  const idle = measure({ rpm: 850, load: 0.12 });
  const wot = measure({ rpm: 5000, load: 1, boostBar: 1.2, egtC: 950 });
  const over = measure({ rpm: 5000, load: 0, boostBar: 0, egtC: 700 });
  assert(rms(wot.exh) > 5 * rms(idle.exh), `WOT ${rms(wot.exh)} vs idle ${rms(idle.exh)}`);
  assert(over.d.fired === 0 && over.d.fuelCut >= 160, `overrun must cut fuel: ${JSON.stringify(over.d)}`);
  assert(rms(over.exh) < 0.35 * rms(wot.exh), 'overrun must be much quieter than full load');
  assert(over.d.pops === 0, 'a fuel cut has nothing to ignite in the exhaust');
}

// 4. Limiter cuts: a fuel cut never pops; a spark cut into a hot exhaust pops on (nearly) every cut
//    charge; the same spark cut into a cold exhaust cannot ignite. Cutting every other event puts energy
//    into the half order.
{
  const base = { rpm: 6800, load: 1, boostBar: 1.1, cutFraction: 0.5 };
  const fuel = measure({ ...base, cutKind: 'fuel', egtC: 950 });
  const spark = measure({ ...base, cutKind: 'spark', egtC: 950 });
  const cold = measure({ ...base, cutKind: 'spark', egtC: 420 });
  const none = measure({ rpm: 6800, load: 1, boostBar: 1.1, egtC: 950 });
  assert(Math.abs(fuel.d.fuelCut - 6800 / 60) <= 2, `50 % cut: ${fuel.d.fuelCut} cut events/s`);
  assert.strictEqual(fuel.d.pops, 0, 'fuel-cut limiter must not pop');
  assert(spark.d.pops > 0.6 * spark.d.sparkCut && spark.d.pops <= spark.d.sparkCut + 2, `hot spark cut: ${spark.d.pops} pops / ${spark.d.sparkCut} cuts`);
  assert(cold.d.pops <= 1, `cold exhaust cannot ignite the charge: ${cold.d.pops} pops`);
  assert(rms(spark.pop) > 0.02 && rms(fuel.pop) === 0, 'pops appear on the afterfire channel only when they happen');
  const f = 6800 / 30;
  assert(tone(fuel.exh, f / 2) > 3 * tone(none.exh, f / 2), 'alternating cut must add the half order');
}

// 5. Anti-lag: retarded (late) combustion on every fired event, bangs from the cut ones.
{
  const als = measure({ rpm: 4200, load: 0.6, boostBar: 1, egtC: 1020, alsActive: true, retardDeg: 32, lambda: 0.82, cutFraction: 0.14, cutKind: 'spark' });
  assert(als.d.late > 100 && als.d.fired === 0, `ALS burns late: ${JSON.stringify(als.d)}`);
  assert(Math.abs(als.d.sparkCut - 0.14 * 140) <= 2, `ALS cut share ${als.d.sparkCut}`);
  assert(als.d.pops > 10 && als.d.pops <= als.d.sparkCut + 1, `ALS bangs ${als.d.pops}`);
}

// 6. Knock: rings at the first circumferential chamber mode f = 1.841 c / (pi B); a larger bore rings lower.
{
  const knockHz = bore => { const v = new V.EngineVoice(SR, 1); v.set({ boreMm: bore }); return v.knockHz; };
  const f825 = knockHz(82.5), f83 = knockHz(83), f86 = knockHz(86);
  assert(f825 > 6500 && f825 < 7600, `knock mode ${f825} Hz for 82.5 mm`);
  assert(f83 < f825 && f86 < f83, 'a larger bore must ring lower');
  const clean = measure({ rpm: 3500, load: 1, boostBar: 1, boreMm: 82.5, knock: 0 });
  const knock = measure({ rpm: 3500, load: 1, boostBar: 1, boreMm: 82.5, knock: 0.6 });
  assert(knock.d.knocks > 0.4 * knock.d.cycles && clean.d.knocks === 0, 'knock events follow the knock intensity');
  const around = x => band(x, f825 - 300, f825 + 300);
  assert(around(knock.bay) > 4 * around(clean.bay), 'knock energy at the chamber mode');
}

// 7. Exhaust gas temperature sets the sound speed in the pipe: its delay scales with 1/sqrt(T).
{
  const pipeDelay = egtC => measure({ rpm: 4000, load: 1, boostBar: 1, egtC }, { settle: 0.1, seconds: 0.1 }).v.pipe.delay;
  const cold = pipeDelay(500), hot = pipeDelay(1000);
  const T = c => 300 + 0.55 * (c + 273.15 - 300);
  assert(hot < cold, 'hotter gas must travel faster');
  assert(Math.abs(cold / hot - Math.sqrt(T(1000) / T(500))) < 0.02, `delay ratio ${cold / hot}`);
}

// 8. Exhaust hardware: an open 4-inch hood dump is louder and brighter than the OEM system with its box.
{
  const p = { rpm: 5500, load: 1, boostBar: 1.2, egtC: 950 };
  const oem = measure({ ...p, exhaust: 'oem_exhaust' }), dump = measure({ ...p, exhaust: 'hood_4' });
  assert(rms(dump.exh) > 1.2 * rms(oem.exh), 'open dump must be louder');
  const bright = x => band(x, 2000, 5000, 100) / band(x, 100, 1000, 25);
  assert(bright(dump.exh) > 1.5 * bright(oem.exh), 'the muffler must take out the high frequencies');
  assert(Object.keys(V.EXHAUSTS).length === 5, 'one acoustic model per exhaust part');
}

// 9. Deterministic: the same seed and inputs give the same signal (tests and replays can rely on it).
{
  const a = measure({ rpm: 3000, load: 0.5 }, { seed: 9 }), b = measure({ rpm: 3000, load: 0.5 }, { seed: 9 });
  assert.strictEqual(rms(a.exh), rms(b.exh), 'engine voice must be deterministic per seed');
}

// 10. The AudioWorklet module source registers the processor and renders into its three outputs.
{
  let registered = null;
  const scope = {
    sampleRate: SR,
    AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null, postMessage() {} }; } },
    registerProcessor: (name, cls) => { registered = { name, cls }; }
  };
  new Function('globalThis', V.moduleSource().replace(/\)\(globalThis\);$/, ')(globalThis);'))(scope);
  assert(registered && registered.name === 'ea888-engine', 'processor must register as ea888-engine');
  const proc = new registered.cls({ processorOptions: { seed: 3, params: { rpm: 3000, load: 0.6 } } });
  const outs = [[new Float32Array(128)], [new Float32Array(128)], [new Float32Array(128)]];
  for (let i = 0; i < 200; i++) assert.strictEqual(proc.process([], outs), true);
  assert(outs[0][0].some(x => x !== 0), 'processor produces exhaust sound');
  proc.port.onmessage({ data: { type: 'stop' } });
  assert.strictEqual(proc.process([], outs), false, 'a stopped processor ends (the node can be collected)');
}

module.exports = { exhausts: Object.keys(V.EXHAUSTS).length };
console.log('PASS audio tests');
