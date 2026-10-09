#!/usr/bin/env node
'use strict';
// Real runs from the research roster against the simulation: a markdown table (ET, mph, 60 ft).
//   node tools/roster_calibration.js            the current physics
//   node tools/roster_calibration.js --before   the physics of v1.28 (before the calibration), same car data
//   node tools/roster_calibration.js --json     machine-readable
// "--before" runs a copy of sim.js with the calibration steps reversed (listed in BEFORE below), so the two
// tables differ only by those steps.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'src', 'assets');
const TOL = { et: 0.04, mph: 0.04, sixtyFt: 0.10 };

// The calibration steps, reversed. Each is [what it was, what it is now] in sim.js.
const BEFORE = [
  ['timing: clock from t = 0, trap = speed on the line', 'rolloutM: 0.2921, trapM: 20.1168', 'rolloutM: 0, trapM: 0.001'],
  ['no anti-squat load', "const antiSquat = state.vehicle.drivetrain === 'RWD' ? clamp(Number(state.vehicle.antiSquatPct || 0) / 100, 0, 1) : 0;", 'const antiSquat = 0;'],
  ['converter capacity knee at SR 0.6, cubic', 'knee = cv.capacityKneeSr ?? cv.couplingSr;', 'knee = 0.6;'],
  ['', 'const f = 1 - x * x;', 'const f = 1 - x * x * x;'],
  ['prepared-strip grip of v1.28', 'drag_radial: { mu: 1.25, muPrep: 2.5', 'drag_radial: { mu: 1.25, muPrep: 1.95'],
  ['', 'slick: { mu: 1.2, muPrep: 2.88', 'slick: { mu: 1.2, muPrep: 2.25'],
  ['', 'pro_radial: { mu: 1.3, muPrep: 2.69', 'pro_radial: { mu: 1.3, muPrep: 2.1'],
  ['', 'big_radial: { mu: 1.38, muPrep: 3.35', 'big_radial: { mu: 1.38, muPrep: 2.62'],
  ['', 'promod_slick: { mu: 1.32, muPrep: 4.03', 'promod_slick: { mu: 1.32, muPrep: 3.15'],
  ['all slip heat into the tyre skin', 'surfaceShare: clamp(0.35 + 0.325 * (Math.abs(s.kappa) / ty.peakSlip - 1), 0.35, 1), ', ''],
  ['reactive traction control instead of torque management', 'const torqueManaged = !!(state.rosterCar && state.rosterCar.tractionControl)', 'const torqueManaged = false && !!(state.rosterCar && state.rosterCar.tractionControl)'],
  ['', "const tcCapable = state.rosterCar?.engine ? false : !!getPart(state, 'ecu').tractionControl;", "const tcCapable = state.rosterCar ? !!state.rosterCar.tractionControl : !!getPart(state, 'ecu').tractionControl;"],
  ['launch at the converter stall', 'while (launchRpm > 1800 && hitG(launchRpm) > capacityG * R.launch.capacityMargin) launchRpm -= 25;', ''],
  ['full boost from the launch', 'const launchBar = lb ? lb.value * PSI_BAR : Math.max(0, bc.launchTorqueFraction * (1.013 + fullBar) - 1.013);', 'const launchBar = fullBar;']
];
const BEFORE_RULES = rules => { rules.converters.race.torqueRatio = 1.8; return rules; };

function loadSim(before) {
  if (!before) return require(path.join(ASSETS, 'sim.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ea888-before-'));
  for (const f of ['turbo.js', 'engine.js', 'turbo-data.js', 'engine-data.js']) fs.copyFileSync(path.join(ASSETS, f), path.join(dir, f));
  const roster = require(path.join(ASSETS, 'roster-data.js'));
  const data = JSON.parse(JSON.stringify(roster));
  data.rules = BEFORE_RULES(data.rules);
  fs.writeFileSync(path.join(dir, 'roster-data.js'), `module.exports = ${JSON.stringify(data)};`);
  let sim = fs.readFileSync(path.join(ASSETS, 'sim.js'), 'utf8');
  for (const [, now, was] of BEFORE) {
    if (!sim.includes(now)) throw new Error(`calibration step not found in sim.js: ${now}`);
    sim = sim.split(now).join(was);
  }
  fs.writeFileSync(path.join(dir, 'sim.js'), sim);
  return require(path.join(dir, 'sim.js'));
}

// One pass the way the car ran it: its own launch temperature, driver and a documented lift.
function run(C, id) {
  const spec = C.rosterSpec(id), st = C.rosterState(id);
  const liftAtM = spec.driverLiftFt ? spec.driverLiftFt * 0.3048 : undefined;
  const r = C.simulateRaceRun(st, { reactionTime: 0, tyreTempC: (C.TYRE[spec.tire.compound] || {}).optC, driverSkill: spec.driverSkill, liftAtM });
  return { et: r.quarter, mph: r.trapKmh / 1.609344, sixtyFt: r.sixtyFt, spin: r.wheelspinPct, liftAtM };
}

function table(C) {
  const R = C.ROSTER, points = R.calibration.points, rows = [];
  for (const c of R.cars.filter(x => x.opponent.usable)) {
    const pt = points.find(p => p.carId === c.id);
    const real = pt ? pt.pass : c.bestPass;
    const sim = run(C, c.id);
    const metrics = pt ? pt.metrics : [];
    const cell = k => {
      const rv = real && real[k] ? real[k].value : null, sv = sim[k];
      if (rv == null) return { real: null, sim: sv, delta: null, ok: null };
      const delta = k === 'sixtyFt' ? sv - rv : (sv - rv) / rv;
      return { real: rv, sim: sv, delta, ok: metrics.includes(k) ? Math.abs(delta) <= TOL[k] : null };
    };
    rows.push({ id: c.id, name: c.displayName, calibration: !!pt, metrics, et: cell('et'), mph: cell('mph'), sixtyFt: cell('sixtyFt'), spin: sim.spin,
      note: pt ? (pt.notes || []).join('; ') : (c.opponent.notes || []).join('; '), lift: sim.liftAtM != null });
  }
  return rows;
}

function markdown(rows, title) {
  const f = (v, d) => (v == null ? '—' : v.toFixed(d));
  const d = (c, k) => (c.delta == null ? '' : k === 'sixtyFt' ? ` (${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(3)} s)` : ` (${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(1)} %)`);
  const mark = c => (c.ok === true ? ' ✓' : c.ok === false ? ' ✗' : '');
  const out = [`### ${title}`, '', '| Auto | echt ET | sim ET | echt mph | sim mph | echt 60ft | sim 60ft | getoetst |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    out.push(`| ${r.name}${r.lift ? ' ¹' : ''} | ${f(r.et.real, 2)} | ${f(r.et.sim, 2)}${d(r.et, 'et')}${mark(r.et)} | ${f(r.mph.real, 0)} | ${f(r.mph.sim, 1)}${d(r.mph, 'mph')}${mark(r.mph)} | ${f(r.sixtyFt.real, 3)} | ${f(r.sixtyFt.sim, 3)}${d(r.sixtyFt, 'sixtyFt')}${mark(r.sixtyFt)} | ${r.calibration ? r.metrics.join(', ') : 'nee (alleen tegenstander)'} |`);
  }
  return out.join('\n');
}

if (require.main === module) {
  const before = process.argv.includes('--before');
  const rows = table(loadSim(before));
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else console.log(markdown(rows, before ? 'Vóór de kalibratie (fysica van v1.28)' : 'Na de kalibratie'));
}
module.exports = { table, run, loadSim, TOL, BEFORE };
