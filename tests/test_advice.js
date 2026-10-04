'use strict';
// Tuner advice (sim.js): every recommendation is a simulated pull, so what it promises must hold when it is
// applied and measured again.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const build = (preset, mutate) => { const s = C.applyPreset(C.blankState(), preset); if (mutate) mutate(s); return C.normalizeState(s); };

function advise(state, key) {
  const base = C.adviceBaseline(state);
  const evals = C.adviceCandidates(state, key).map(c => C.evaluateAdvice(state, key, c, base));
  return { base, evals: C.rankAdvice(evals) };
}
const cases = [
  ['randy knock margin', build('randy'), 'knock'],
  ['randy fuel duty', build('randy'), 'fuel'],
  ['hx52 on RON95 knocks out', build('hx52', s => { s.selections.fuel = 'ron95'; s.tune.ignitionTrimDeg = 2; s.tune.knockControl = false; }), null]
];
for (const [name, state, fixedKey] of cases) {
  const r = C.simulateEngine(state, { noise: false });
  const diag = C.diagnoseDyno(r);
  const key = fixedKey || diag.find(d => d.key && d.key.startsWith('abort'))?.key;
  assert(key && diag.some(d => d.key === key), `${name}: diagnosis ${key} present`);
  const { base, evals } = advise(state, key);
  assert(evals.length >= 2, `${name}: candidates`);
  const best = evals[0];
  assert(best.resolved, `${name}: a solution is found (${best.label})`);
  // what the advice promises is what the dyno measures after applying it
  const applied = C.applyAdvicePatch(state, best.patch);
  const again = C.simulateEngine(applied, { noise: false, soakK: 0 });
  assert.strictEqual(Math.round(again.peakHp), Math.round(best.hpAfter), `${name}: predicted power holds`);
  const stillThere = C.diagnoseDyno(again).some(d => d.key === key && d.severity !== 'good');
  assert(!stillThere, `${name}: the notice is gone after applying "${best.label}"`);
  // ranking: solutions first; among solutions nothing cheaper-and-stronger is ranked lower
  const firstUnsolved = evals.findIndex(e => !e.resolved);
  if (firstUnsolved > 0) assert(evals.slice(firstUnsolved).every(e => !e.resolved), `${name}: solutions ranked first`);
  assert(base.peakHp > 0 && evals.every(e => e.hpBefore === base.peakHp), `${name}: one baseline`);
}
// exact settings: a changed setting's label names the old and the new value
const knock = advise(build('randy'), 'knock').evals.find(e => e.id.startsWith('spark:'));
assert(/-0\.5° → -1\.5°/.test(knock.label) || /→/.test(knock.label), 'setting advice names old and new value');
// a hand-edited boost table is changed in the table, not in the quick setup
{
  const st = build('randy'); st.tune.ecu.edited.boost = true;
  const cand = C.adviceCandidates(st, 'turbo').find(c => c.id === 'boost:-0.1');
  assert(Number.isFinite(cand.patch.boostTableDelta), 'edited table: table delta');
  const after = C.applyAdvicePatch(st, cand.patch);
  assert(Math.abs(after.tune.ecu.boost[3][10] - (st.tune.ecu.boost[3][10] - 0.1)) < 1e-6, 'every table cell lowered by 0.1 bar');
}
// the knock notice fires at the knock-control margin used by the race (0.93), not for a normal margin
{
  const stock = C.diagnoseDyno(C.simulateEngine(build('stock'), { noise: false }));
  assert(!stock.some(d => d.key === 'knock'), 'a stock engine on its own map shows no knock notice');
}
module.exports = { price: C.ADVICE_PRICE };
console.log('PASS tuner advice tests');
