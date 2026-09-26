'use strict';
// Traction, the driver's pedal and grip tuning (v1.25).
//
// Reported from play: the best tyres on a prepared track gave nothing but wheelspin, and the timeslip said
// 2 % where it plainly was not. Both were true, and the cause was neither the tyres nor the meter.
const assert = require('assert');
const C = require('../src/assets/sim.js');

const build = (preset, mutate) => {
  const s = C.applyPreset(C.blankState(), preset);
  if (mutate) mutate(s);
  s.tune.ecu = null;
  return s;
};
const race = (s, cfg = {}) => C.simulateRaceRun(s, { reactionTime: 0, tyreTempC: 60, ...cfg });

// ---- 1. every gearbox has driveline data ------------------------------------------------------------
// The compound and Lenco gearboxes had none, so the lookup fell back to the OEM clutch at 430 Nm: a 2500 pk
// build slipped its clutch to 1228 C for the whole quarter. The car never left first gear's worth of road
// speed, which read as an 18-second run at 110 km/h with the wheelspin meter showing 0.7 % - the tyres were
// not the thing slipping. tests/test_parts_data.js guards the table; this guards what it does.
{
  const s = build('compound2500', st => {
    st.vehicle.tireCompound = 'promod_slick';
    st.vehicle.preparedTrack = true;
    st.vehicle.drivetrain = 'AWD_DRAG';
  });
  const r = race(s);
  assert(r.maxClutchTempC < 400, `the clutch must not cook itself (${Math.round(r.maxClutchTempC)} °C)`);
  assert(r.quarter < 9, `2500 pk on slicks must run the quarter in under 9 s (${r.quarter.toFixed(2)})`);
  assert(r.trapKmh > 280, `and trap over 280 km/h (${Math.round(r.trapKmh)})`);
}

// ---- 2. the wheelspin meter tells the truth ---------------------------------------------------------
// Front-wheel drive cannot put 2500 pk down, and the meter has to say so.
{
  const fwd = race(build('compound2500', st => { st.vehicle.tireCompound = 'promod_slick'; st.vehicle.preparedTrack = true; st.vehicle.drivetrain = 'FWD'; }));
  const awd = race(build('compound2500', st => { st.vehicle.tireCompound = 'promod_slick'; st.vehicle.preparedTrack = true; st.vehicle.drivetrain = 'AWD_DRAG'; }));
  assert(fwd.wheelspinPct > 50, `2500 pk through the front wheels must read as real wheelspin (${Math.round(fwd.wheelspinPct)} %)`);
  assert(fwd.wheelspinPct > awd.wheelspinPct + 15, 'and clearly more of it than four-wheel drive');
  assert(fwd.quarter > awd.quarter + 1.5, 'which costs real time');
}

// ---- 3. bigger rubber is worth having, and prep is most of it ----------------------------------------
{
  const on = (tyre, prep) => race(build('compound2500', st => {
    st.vehicle.tireCompound = tyre; st.vehicle.preparedTrack = prep; st.vehicle.drivetrain = 'FWD';
  }));
  assert(on('promod_slick', true).quarter < on('pro_radial', true).quarter,
    'the Pro Mod slick must beat the radial on a prepared track');
  assert(on('promod_slick', true).quarter < on('promod_slick', false).quarter - 0.5,
    'and a big soft tyre must lose most of its advantage without the prep');
}

// ---- 4. the drag four-wheel-drive is actually better --------------------------------------------------
// tractionUse sat in the drivetrain table unread, so a purpose-built drag AWD was a heavier street one.
{
  const s = st => build('compound2500', b => { b.vehicle.tireCompound = 'promod_slick'; b.vehicle.preparedTrack = true; b.vehicle.drivetrain = st; });
  const street = race(s('AWD')), drag = race(s('AWD_DRAG'));
  assert(drag.sixtyFt < street.sixtyFt, `the drag case must leave harder (${drag.sixtyFt.toFixed(3)} vs ${street.sixtyFt.toFixed(3)})`);
  assert(C.DRIVETRAINS.AWD_DRAG.tractionUse > C.DRIVETRAINS.AWD.tractionUse, 'and put more of it through the tyres');
}

// ---- 5. the pedal is the driver's, and it does something ---------------------------------------------
{
  const s = build('compound2500', st => { st.vehicle.tireCompound = 'pro_radial'; st.vehicle.preparedTrack = true; st.vehicle.drivetrain = 'FWD'; });
  const rt = C.createRaceRuntime(s, {});
  rt.launch();
  const drive = pedal => { const r = C.createRaceRuntime(s, {}); r.launch(); for (let i = 0; i < 1200; i++) r.step(0.001, { pedal }); return r.state; };
  const full = drive(1), half = drive(0.45);
  assert(half.v < full.v, `half throttle must accelerate less (${half.v.toFixed(1)} vs ${full.v.toFixed(1)} m/s)`);
  assert(half.kappa < full.kappa, 'and spin the tyres less');
}

// ---- 6. grip tuning: virtual runs, real gain, no wear -------------------------------------------------
{
  const s = build('randy', st => { st.vehicle.tireCompound = 'drag_radial'; st.vehicle.preparedTrack = true; });
  const wearBefore = JSON.stringify({ w: s.wear, d: s.damage });
  const opt = C.createGripOptimizer(s, { budget: 40 });
  let n = 0; while (!opt.step() && n < 80) n++;
  const m = opt.summary();
  assert(m.ok, 'the grip optimiser must produce a map');
  assert(m.after.quarter <= m.before.quarter,
    `it must never hand back a slower car (${m.before.quarter} -> ${m.after.quarter})`);
  assert(m.changes.length > 0, 'and it must actually change something');
  for (const c of m.changes) {
    assert(c.label && c.fromText && c.toText, `change ${c.key} must be readable`);
  }
  assert(m.touched.includes('laaddruk 1e versnelling'), 'first-gear boost is the main grip knob');
  // Virtual runs cost the engine nothing: simulateRaceRun is a pure function of the state.
  assert.strictEqual(JSON.stringify({ w: s.wear, d: s.damage }), wearBefore,
    'tuning on virtual runs must not wear or damage the engine');
}

module.exports = { tyres: C.TIRE_COMPOUNDS.length, drivetrains: Object.keys(C.DRIVETRAINS).length };
