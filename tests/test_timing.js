'use strict';
// What the strip's beams measure (sim.js createTimingSystem, used by the headless run and the live race): the
// clock starts when the tyre rolls out of the stage beam, splits and ET count from there, the speed at the 1/8 and
// the finish is the average over the 66 ft before the line, and green-to-finish keeps the rollout time.
const assert = require('assert');
const C = require('../src/assets/sim.js');

// The strip's beams: constant 10 m/s^2 from rest, timed in 1 ms steps.
{
  const ts = C.createTimingSystem(), a = 10;
  for (let t = 0; t <= 12; t += 0.001) ts.observe(t, 0.5 * a * t * t);
  const slip = ts.slip(), at = x => Math.sqrt((2 * x) / a), ro = C.TIMING.rolloutM;
  assert(Math.abs(slip.rolloutS - at(ro)) < 1e-4, 'rollout time');
  assert(Math.abs(slip.sixtyFt - (at(18.288) - at(ro))) < 1e-4, 'the 60 ft counts from the rollout');
  assert(Math.abs(slip.quarter - (at(402.336) - at(ro))) < 1e-4, 'the ET counts from the rollout');
  const trap = C.TIMING.trapM / (at(402.336) - at(402.336 - C.TIMING.trapM)) * 3.6;
  assert(Math.abs(slip.trapKmh - trap) < 0.01, 'the trap is the average over the last 66 ft');
  assert(slip.trapKmh < a * at(402.336) * 3.6, 'average trap speed below the speed on the line');
  assert(Math.abs(slip.launchToFinishS - at(402.336)) < 1e-4, 'green-to-finish keeps the rollout');
}

// A whole pass: the timeslip and the total from the launch agree.
{
  const r = C.simulateRaceRun(C.applyPreset(C.blankState(), 'randy'), { reactionTime: 0.1 });
  assert(r.rolloutS > 0 && r.rolloutS < 0.6, `rollout ${r.rolloutS}`);
  assert(Math.abs(r.finishTotalTime - (0.1 + r.rolloutS + r.quarter)) < 1e-6, 'total = reaction + rollout + ET');
}

console.log('PASS timing tests');
module.exports = { rolloutM: C.TIMING.rolloutM, trapM: C.TIMING.trapM };
