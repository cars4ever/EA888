'use strict';
// Roster cars as opponents: they wear by the player's own per-pass rule, service where the research gives an
// interval, are rebuilt once worn through, race in their own career event, and their records live in the save
// without touching the player's car.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const opponents = C.rosterOpponents();

// Opponents wear by the player's own rule; services where the research gives an interval.
{
  const r = { quarter: 12.3, limiterTimeS: 0.2, wheelspinPct: 12, missedShifts: 1, drivelineStress: 20, maxGearboxTempC: 130, hopWearPct: 0, knockDamagePct: 0 };
  const w = C.raceWearFromResult(r);
  assert(Math.abs(w.wear.engine - (0.05 + 0.2 * 0.025)) < 1e-12, 'engine wear rule');
  assert(Math.abs(w.wear.transmission - (0.1 + 12 * 0.002 + 0.025 + 20 * 0.003 + 15 * 0.001)) < 1e-12, 'gearbox wear rule');
  let save = { rosterOpponents: {}, bank: 123 };
  const events = [];
  for (let i = 0; i < 30; i++) {
    const done = C.applyRosterRun(save, 'eagle', { quarter: 7.5, wheelspinPct: 20 });
    save = { ...save, rosterOpponents: done.rosterOpponents };
    events.push(...done.events.map(e => [done.record.runs, e]));
  }
  const svc = C.rosterServiceInterval('eagle');
  assert(svc && svc.runs >= 25 && svc.runs <= 30, 'Eagle rod interval from the research');
  assert(events.some(([run, e]) => run === svc.runs && /onderhoud/.test(e)), 'service at the interval');
  assert.strictEqual(save.bank, 123, 'the player\'s save is not touched');
  // worn through: out, rebuilt before its next race
  const worn = { rosterOpponents: { lumberjack: { runs: 5, wear: { engine: 99.99, transmission: 1 } } } };
  const out = C.applyRosterRun(worn, 'lumberjack', { quarter: 9.5 });
  assert(out.record.out, 'worn through is out');
  const back = C.applyRosterRun({ rosterOpponents: out.rosterOpponents }, 'lumberjack', { quarter: 9.5 });
  assert(!back.record.out && back.events[0] === 'gereviseerd na schade', 'rebuilt before the next race');
}

// The career event with real builds: its rivals are roster cars that can race, and a round plans on their pass.
{
  const ev = C.CAREER_EVENT_MAP.real_builds;
  assert(ev && ev.format === 'bracket', 'real builds event');
  for (const id of ev.rivals) assert(opponents.some(o => `roster:${o.id}` === id), `${id} is not a usable roster car`);
  const id = ev.rivals[0].slice('roster:'.length), spec = C.rosterSpec(id);
  const pass = C.simulateRaceRun(C.rosterState(id), { reactionTime: 0, tyreTempC: C.TYRE[spec.tire.compound].optC });
  const plan = C.planCareerRound('real_builds', 0, 1, { [ev.rivals[0]]: pass });
  assert(Number.isFinite(plan.dialIn) && plan.dialIn > pass.quarter, 'dial-in from its own pass');
}

// A fresh save has no opponent records; normalising keeps them.
assert.deepStrictEqual(C.blankState().rosterOpponents, {}, 'roster records default');
assert.strictEqual(C.normalizeState({ rosterOpponents: { eagle: { runs: 3 } } }).rosterOpponents.eagle.runs, 3, 'records survive a load');

console.log('PASS roster opponent tests');
module.exports = { opponents: opponents.length, serviceRuns: C.rosterServiceInterval('eagle').runs };
