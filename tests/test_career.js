'use strict';
// Career events and bracket racing rules (sim.js).
const assert = require('assert');
const C = require('../src/assets/sim.js');

const p = (rt, et, dialIn, valid = true) => ({ reactionTime: rt, et, dialIn, valid });

// 1. Bracket: the slower dial starts first by the dial difference; with no breakouts the better package
//    (reaction + ET over dial) is first to the finish.
for (let i = 0; i < 200; i++) {
  const r = () => Math.random();
  const pd = 11 + r() * 3, od = 11 + r() * 3;
  const a = p(0.01 + r() * 0.2, pd + r() * 0.2, pd), b = p(0.01 + r() * 0.2, od + r() * 0.2, od);
  const out = C.raceOutcome('bracket', a, b);
  const pa = a.reactionTime + a.et - a.dialIn, pb = b.reactionTime + b.et - b.dialIn;
  assert.strictEqual(out.won, pa < pb, 'without breakouts the better package must win');
}
// 2. Breakout: quicker than your dial loses, even if first to the finish; both out: the smaller breakout wins.
assert.strictEqual(C.raceOutcome('bracket', p(0.02, 12.40, 12.45), p(0.2, 13.1, 13.0)).won, false, 'a breakout must lose');
assert.strictEqual(C.raceOutcome('bracket', p(0.02, 12.44, 12.45), p(0.02, 12.90, 13.0)).won, true, 'both break out: the smaller breakout wins');
// 3. Red light loses, whatever happens after.
assert.strictEqual(C.raceOutcome('bracket', p(-0.01, 12.5, 12.5), p(0.3, 14, 13)).won, false, 'red light must lose');
assert.strictEqual(C.raceOutcome('heads_up', p(-0.001, 10, null), p(0.2, 13, null)).won, false, 'red light must lose heads-up');
assert.strictEqual(C.raceOutcome('heads_up', p(0.2, 12.9, null), p(0.05, 12.8, null)).won, false, 'heads-up: later total loses');
assert.strictEqual(C.raceOutcome('heads_up', p(0.05, 12.8, null), p(0.2, 12.7, null)).won, true, 'heads-up: reaction counts');

// 4. Class rules.
const s = C.normalizeState(C.blankState());
s.vehicle.tireCompound = 'drag_radial';
assert(C.careerEligibility(s, 'bracket_friday').some(t => /Banden/.test(t)), 'street bracket must refuse drag radials');
s.vehicle.tireCompound = 'uhp'; s.vehicle.drivetrain = 'AWD';
assert(C.careerEligibility(s, 'fwd_challenge').some(t => /Aandrijving|Reputatie/.test(t)), 'FWD challenge must refuse AWD');
assert(C.careerEligibility(s, 'outlaw_20').some(t => /Reputatie/.test(t)), 'outlaw needs reputation');
s.vehicle.drivetrain = 'FWD';
assert.deepStrictEqual(C.careerEligibility(s, 'bracket_friday'), [], 'the default build may enter the street bracket');

// 5. Event flow: entry fee, rounds, prize and reputation; a loss eliminates.
let st = C.startCareerEvent(s, 'bracket_friday');
assert.strictEqual(st.bank, s.bank - 200, 'entry fee paid');
assert.strictEqual(st.career.active.round, 0);
for (let r = 0; r < 3; r++) st = C.applyCareerRound(st, { won: true, reason: 'test', marginS: 0.01 }, {});
assert.strictEqual(st.career.active, null, 'event finished');
assert.strictEqual(st.career.eventWins, 1);
assert.strictEqual(st.bank, s.bank - 200 + 1600, 'prize paid');
assert(st.career.rep >= 20, 'reputation earned');
let lost = C.startCareerEvent(s, 'street_night');
lost = C.applyCareerRound(lost, { won: false, reason: 'test', marginS: -0.1 }, {});
assert.strictEqual(lost.career.active, null, 'a loss eliminates');
assert.strictEqual(lost.career.eventWins, 0);
assert.strictEqual(lost.bank, s.bank - 150, 'no prize after elimination');
assert.throws(() => C.startCareerEvent(s, 'outlaw_20'), /Reputatie/, 'cannot enter above your reputation');

// 6. Rival rounds: deterministic, and a rival dials slower than its own typical ET (to avoid breaking out).
const a1 = C.planCareerRound('bracket_friday', 1, 7, { street: { quarter: 13.02 } });
const a2 = C.planCareerRound('bracket_friday', 1, 7, { street: { quarter: 13.02 } });
assert.deepStrictEqual(a1, a2, 'round plan must be deterministic');
assert(a1.dialIn > 13.02 && a1.dialIn < 13.12, `rival dial ${a1.dialIn}`);

module.exports = { events: C.CAREER_EVENTS.length };
console.log('PASS career tests');
