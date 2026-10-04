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


// ---- 7. traction control is a strategy, and only where the ECU can run one --------------------------
// Reported from play: no traction control settings at all, though the pro ECUs support it. It was a bare
// switch that always aimed at 125 % of peak slip, on every ECU including an OEM MED17.
{
  const car = ecu => build('compound2500', st => {
    st.vehicle.tireCompound = 'pro_radial';
    st.vehicle.preparedTrack = true;
    st.vehicle.drivetrain = 'FWD';
    if (ecu) st.selections.ecu = ecu;
  });
  const tc = (slip, agg, on = true) => {
    const s = car();
    Object.assign(s.tune, { tractionControl: on, tcSlipPct: slip, tcAggressionPct: agg });
    return race(s);
  };
  const off = tc(125, 60, false), tight = tc(90, 70), loose = tc(180, 40);
  assert(off.wheelspinPct > tight.wheelspinPct + 30,
    `traction control must cut the wheelspin (${Math.round(off.wheelspinPct)} % vs ${Math.round(tight.wheelspinPct)} %)`);
  assert(tight.quarter < off.quarter - 0.3, 'and win real time where the car cannot hook up');
  assert(Math.abs(tight.quarter - loose.quarter) > 0.05,
    `the settings must matter, not just the switch (${tight.quarter.toFixed(3)} vs ${loose.quarter.toFixed(3)})`);

  // An ECU without wheel-speed inputs cannot do it, and the switch must be inert rather than pretending.
  const capable = C.CATEGORY_MAP.ecu.items.filter(i => i.tractionControl).map(i => i.id);
  assert(capable.includes('promod_ecu') && !capable.includes('med17'),
    'the pro ECUs run traction control, the OEM one does not');
  const dumb = s => { const st = car('med17'); Object.assign(st.tune, { tractionControl: s }); return race(st); };
  assert.strictEqual(dumb(true).quarter, dumb(false).quarter,
    'on an ECU that cannot run it, the switch must change nothing at all');
}


// ---- 8. gearing is a tune setting, and the tuner masters it -------------------------------------------
// Reported as missing: gear ratios and final drive. They came straight off the gearbox part with no way to
// change them, and the tuner could not touch the biggest lever on elapsed time after grip.
{
  const car = f => build('compound2500', st => {
    st.vehicle.tireCompound = 'promod_slick';
    st.vehicle.preparedTrack = true;
    st.vehicle.drivetrain = 'AWD_DRAG';
    if (f) f(st);
  });
  const stock = C.effectiveGearing(car());
  assert(stock.stock, 'an untouched build runs what the gearbox came with');

  // The final drive must actually reach the road.
  const fd = v => race(car(st => { st.tune.finalDrive = v; })).quarter;
  assert(Math.abs(fd(3.2) - fd(5.2)) > 0.1, `the final drive must change the run (${fd(3.2).toFixed(3)} vs ${fd(5.2).toFixed(3)})`);

  // The spread pivots on first gear and pulls the rest in or out.
  const close = C.effectiveGearing(car(st => { st.tune.gearSpreadPct = 85 })).gears;
  const wide = C.effectiveGearing(car(st => { st.tune.gearSpreadPct = 115 })).gears;
  assert.strictEqual(close[0], wide[0], 'first gear is chosen for grip, so the spread leaves it alone');
  assert(close[close.length - 1] > wide[wide.length - 1], 'a closer set keeps the top gear shorter');

  // Individual ratios win outright - and only a set that matches the gearbox counts, so a six-speed list
  // cannot be smuggled into a five-speed box.
  const mine = stock.base.slice(); mine[2] = 1.7;
  const own = car(st => { st.tune.gearRatios = mine; });
  assert.strictEqual(C.effectiveGearing(own).gears[2], 1.7, 'a ratio the player sets is what the car runs');
  const wrongCount = car(st => { st.tune.gearRatios = [3.1, 2.2, 1.7]; });
  assert.deepStrictEqual(C.effectiveGearing(wrongCount).gears, stock.base,
    'a set that does not fit the gearbox is ignored, not half-applied');

  // And the tuner reaches for it.
  const opt = C.createGripOptimizer(car(), { budget: 60 });
  let n = 0; while (!opt.step() && n < 100) n++;
  const m = opt.summary();
  assert(m.touched.includes('eindoverbrenging') && m.touched.includes('tandwielspreiding'),
    `the tuner must be allowed to set the gearing (it lists: ${m.touched.join(', ')})`);
  assert(m.after.quarter < m.before.quarter, 'and it must find time with it');
}

// ---- 9. the timeslip is read back as advice ----------------------------------------------------------
{
  const spun = build('compound2500', st => {
    st.vehicle.tireCompound = 'pro_radial'; st.vehicle.preparedTrack = true; st.vehicle.drivetrain = 'FWD';
    st.tune.tractionControl = false;
  });
  const r = race(spun);
  const a = C.raceAdvice(spun, r);
  assert(a.ok && a.findings.length, 'a run with 60 % wheelspin must produce findings');
  const spin = a.findings.find(f => /Wielspin/.test(f.title));
  assert(spin, `the wheelspin must be named: ${a.findings.map(f => f.title).join(', ')}`);
  assert(spin.severity === 'bad' && /tractiecontrole/i.test(spin.fix),
    'and with traction control switched off, that is the fix it points at');
  for (const f of a.findings) {
    assert(f.title && f.detail && f.fix, `finding ${f.title} must say what, why and what to change`);
  }
  // A clean run says so rather than inventing something.
  const clean = build('randy', st => { st.vehicle.tireCompound = 'drag_radial'; st.vehicle.preparedTrack = true; });
  const ca = C.raceAdvice(clean, race(clean));
  assert(ca.ok, 'a clean run still reads back');
}


// ---- 10. the dyno is not an obligation after every tweak ---------------------------------------------
// Reported from play: "de dyno moet niet een verplichting zijn na elke wijziging. Wel als je een nieuw blok
// neemt of nieuwe turbo etc. Tijdens de race is dyno sowieso geen optie." What a pull measures is what the
// engine makes at wide-open throttle in one gear. Settings that only shape how that power reaches the road
// cannot change that measurement, so they must not send the player back to the rollers.
{
  const base = build('randy');
  const sig = C.engineSignature(base);
  const after = (patch) => { const s = build('randy'); Object.assign(s.tune, patch); return s; };

  const raceOnly = [
    ['finalDrive', 4.6], ['gearSpreadPct', 88], ['launchRpm', 5200],
    ['tcSlipPct', 95], ['tcAggressionPct', 80], ['tractionControl', false]
  ];
  const hp = C.simulateEngine(base, { noise: false }).peakHp;
  for (const [key, value] of raceOnly) {
    const s = after({ [key]: value });
    assert.strictEqual(C.engineSignature(s), sig, `${key} does not change a dyno pull, so it must not invalidate one`);
    // and the claim has to be true, not just asserted
    assert.strictEqual(C.simulateEngine(s, { noise: false }).peakHp, hp,
      `${key} is excluded from the signature, so it must genuinely leave the measurement alone`);
  }
  {
    const s = build('randy');
    s.tune.gearRatios = [3.1, 2.2, 1.7, 1.3, 1.0, 0.8];
    assert.strictEqual(C.engineSignature(s), sig, 'gear ratios do not change a dyno pull either');
  }

  // What does change the measurement still invalidates it - hardware first of all.
  for (const [key, value] of [['boostHighBar', 2.6], ['lambda', 0.72], ['revLimitRpm', 8600], ['railTargetBar', 210]]) {
    assert.notStrictEqual(C.engineSignature(after({ [key]: value })), sig,
      `${key} changes what the engine makes, so the pull becomes historical`);
  }
  for (const [cat, id] of [['turbo', 'hx52'], ['block', 'closed_deck'], ['fuel', 'e85']]) {
    const s = build('randy'); s.selections[cat] = id;
    assert.notStrictEqual(C.engineSignature(s), sig, `a new ${cat} means the old pull no longer describes this engine`);
  }
}


// ---- 11. a compound is sold in the sizes it is sold in ------------------------------------------------
// Reported: "Als we bepaalde banden kiezen hebben ze vaste maten en moet die andere wielmaat niks doen."
// Street, UHP and semi-slick cover the whole catalogue; the drag compounds come in a handful of real sizes
// and a 34x17 Pro Mod slick in exactly one.
{
  for (const id of ['street', 'uhp', 'semislick']) {
    assert(C.tireSizing(id).free, `${id} must stay freely adjustable`);
    assert.strictEqual(C.tireSizeRange(id, 'rimDiameterIn'), null, `${id} has no size restriction`);
  }
  for (const id of ['drag_radial', 'slick', 'pro_radial', 'big_radial', 'promod_slick']) {
    assert(!C.tireSizing(id).free, `${id} is not sold in every size`);
    const r = C.tireSizeRange(id, 'rimDiameterIn');
    assert(r && r.hi <= 18, `${id} does not come on a 22 inch rim (${r && r.hi})`);
  }
  // The one-size tyres report themselves as fixed, and the width really is one number.
  const w = C.tireSizeRange('promod_slick', 'tireWidthMm');
  assert(w.fixed, 'a 34x17 Pro Mod slick comes in one size');
  assert.strictEqual(C.tireSizeRange('big_radial', 'tireWidthMm').lo, 315, 'a 315 drag radial is 315 wide');

  // Whatever is stored, normalising snaps it into what the fitted compound allows - so the size shown is
  // always a size that exists, and switching compound cannot leave a 195/65 R15 Pro Mod slick behind.
  const silly = C.blankState();
  Object.assign(silly.vehicle, { tireCompound: 'promod_slick', rimDiameterIn: 22, rimWidthIn: 7, tireWidthMm: 195, aspectRatio: 25 });
  const v = C.normalizeState(silly).vehicle;
  assert.strictEqual(v.rimDiameterIn, 16, 'the rim snaps to what the slick is made for');
  assert.strictEqual(v.tireWidthMm, 430, 'and so does the section');
  const dia = C.tireGeometry(v).diameterMm;
  assert(dia > 840 && dia < 890, `a 34 inch slick is about 864 mm over the tread (${dia.toFixed(0)})`);

  // A free compound is left alone.
  const street = C.blankState();
  Object.assign(street.vehicle, { tireCompound: 'uhp', rimDiameterIn: 19, tireWidthMm: 245, aspectRatio: 35 });
  const sv = C.normalizeState(street).vehicle;
  assert.strictEqual(sv.rimDiameterIn, 19, 'a UHP tyre takes the size you give it');
  assert.strictEqual(sv.tireWidthMm, 245, 'including the section');
}

// ---- 12. anti-lag at maximum ---------------------------------------------------------------------------
{
  const modes = C.ANTI_LAG_MODES || [];
  assert(modes.includes('max'), 'there must be a maximum anti-lag setting');
  const on = preset => { const s = build(preset); s.tune.als = { mode: 'max' }; return C.resolveAntiLag(s); };
  const street = on('randy'), dome = on('compound2500');
  assert(dome.params.targetBoostBar > street.params.targetBoostBar,
    'anti-lag cannot hold more boost than the wastegates control, so dome control must allow more');
  assert(dome.params.retardDeg >= 40 && dome.params.extraFuelPct >= 30, 'max means max');
  const drag = (() => { const s = build('compound2500'); s.tune.als = { mode: 'drag' }; return C.resolveAntiLag(s); })();
  assert(dome.params.targetBoostBar > drag.params.targetBoostBar, 'and more than the drag setting');
  assert(dome.params.maxEgtC > drag.params.maxEgtC, 'which it pays for in exhaust temperature');
}

module.exports = { tyres: C.TIRE_COMPOUNDS.length, drivetrains: Object.keys(C.DRIVETRAINS).length };
