#!/usr/bin/env node
'use strict';
// Dev tool: puzzle out the highest-power build the catalogue allows for a given engine, parts and tune.
//
// The point is not the number. It is that assembling a maximum by hand walks every part category and every
// tune axis, so anything that is mis-scaled, unreachable, or a trap shows up as a build the search refuses to
// pick. What the search finds is then the yardstick the in-game map optimiser has to come within 98 % of
// (tests/test_max_builds.js); where it cannot, the tuner is what is wrong.
//
//   node tools/max_builds.js                 every engine
//   node tools/max_builds.js smx_540 rb26    just these
//   node tools/max_builds.js --json out.json
//
// Rules of the search: a pull that aborts does not count, however much it showed before it stopped.

const C = require('../src/assets/sim.js');

// engine id -> the block and head it must run, and a starting point
const ENGINES = {
  ea888_20:  { block: 'compound_billet',  head: 'compound_billet_head',  from: 'compound2500', label: 'EA888 2.0 (billet compound)' },
  vr6_32:    { block: 'swap_vr6_32',      head: 'head_vr6_32',           from: 'vr6_swap',     label: 'VW VR6 3.2' },
  daza_25:   { block: 'swap_daza_25',     head: 'head_daza_25',          from: 'daza_swap',    label: '2.5 TFSI DAZA' },
  rb25_neo:  { block: 'swap_rb25_neo',    head: 'head_rb25_neo',         from: 'rb25_swap',    label: 'RB25DET Neo' },
  rb26:      { block: 'swap_rb26',        head: 'head_rb26',             from: 'rb26_swap',    label: 'RB26DETT' },
  jz_vvti:   { block: 'swap_2jz_vvti',    head: 'head_2jz_vvti',         from: 'jz_swap',      label: '2JZ-GTE VVTi' },
  rotary_13b:{ block: 'swap_13b_rew',     head: 'head_13b_rew',          from: 'rotary_swap',  label: '13B-REW bridgeport' },
  smx_540:   { block: 'swap_smx_540',     head: 'head_smx_540',          from: 'smx4000',      label: 'Steve Morris SMX 540' }
};

// Categories the search is allowed to change. block and head are the engine; fuel and service come with it.
const PART_CATS = ['crank', 'oiling', 'crankcase', 'valvetrain', 'boostControl', 'air', 'manifold',
  'fuelSystem', 'fuel', 'exhaust', 'ecu', 'sensors', 'ignition', 'sealing', 'transmission', 'spool', 'mounts'];

let pulls = 0;
const clone = s => JSON.parse(JSON.stringify(s));
// The yardstick has to be the one the game uses, or the comparison is rigged. The in-game race map is the
// most power that stays inside the margins the game will sell a map at, so the hand-built maximum is judged
// by exactly those margins. Maximising power with them switched off makes 98 % of it unreachable by
// construction, and produces "builds" that are grenades: an early run of this search, before this check was
// in, came back with an RB26 making 1764 pk at zero reliability.
// A shade inside the race margins, not exactly on them. A search that optimises right up to a limit
// produces a reference that the smallest model change tips over: four of the eight did exactly that between
// one run and the next. One per cent of headroom costs almost nothing and makes the reference stable.
const RACE = (() => {
  const g = { ...C.MAP_TUNES.race };
  for (const k of ['hpFrac', 'torqueFrac', 'clampFrac']) if (g[k]) g[k] *= 0.99;
  for (const k of ['knockMax', 'egtMaxC', 'fuelDutyMax', 'turboLoadMax']) if (g[k]) g[k] *= 0.99;
  if (g.reliabilityFloor) g.reliabilityFloor += 2;
  return g;
})();
function score(state) {
  pulls++;
  const r = C.simulateEngine(state, { noise: false });
  // An aborted pull is not a result: the figure it shows is the highest seen before it stopped.
  if (r.status !== 'completed') return { hp: -1, r };
  const sc = C.mapScore(r, RACE, C.mapLimits(state));
  if (!sc.ok) return { hp: -1, r, over: sc.over };
  return { hp: r.peakHp, r };
}

// Wind the boost down until the margins are met, the way a tuner does and the way the in-game optimiser
// does. Without this a search that starts outside the margins scores -1 everywhere and never moves.
function intoMargins(state) {
  if (score(state).hp > 0) return state;
  for (const f of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.12]) {
    const s = clone(state);
    for (const k of ['boostLowBar', 'boostMidBar', 'boostHighBar']) s.tune[k] = Math.max(0, state.tune[k] * f);
    if (score(s).hp > 0) return s;
  }
  return state;
}

function best(state, tries) {
  let top = score(state), bestState = state;
  for (const t of tries) {
    const s = clone(state);
    t(s);
    const got = score(s);
    if (got.hp > top.hp) { top = got; bestState = s; }
  }
  return { state: bestState, ...top };
}

// ---- parts ------------------------------------------------------------------------------------------
function sweepParts(state) {
  let cur = intoMargins(state), curHp = score(cur).hp;
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const cat of PART_CATS) {
      const items = C.CATEGORY_MAP[cat].items;
      const got = best(cur, items.map(i => s => { s.selections[cat] = i.id; }));
      if (got.hp > curHp + 0.5) { cur = got.state; curHp = got.hp; moved = true; }
    }
    if (!moved) break;
  }
  return cur;
}

// ---- turbos: the LP turbo and the optional HP stage, searched as a pair -----------------------------
function sweepTurbos(state) {
  const turbos = C.CATEGORY_MAP.turbo.items.map(i => i.id);
  // Every single, scored after being brought inside the margins: a turbo that is right for the engine but
  // wants a different boost curve must not lose to one that merely suits the curve it starts with.
  const singles = turbos.map(id => {
    const s = clone(state); s.selections.turbo = id; s.selections.turboHp = '';
    const fixed = intoMargins(s);
    return { id, hp: score(fixed).hp, state: fixed };
  }).sort((a, b) => b.hp - a.hp);
  // The configuration that came in is a candidate too: it may already be a pair, and the best single is not
  // allowed to throw a working compound away.
  const incoming = intoMargins(clone(state));
  let cur = incoming, curHp = score(incoming).hp;
  if (singles[0].hp > curHp + 0.5) { cur = singles[0].state; curHp = singles[0].hp; }
  // then the HP stage, against the best few LP turbos only (the pair space is 18 x 18)
  for (const lp of singles.slice(0, 4)) {
    for (const hp of turbos) {
      if (hp === lp.id) continue;
      const s = clone(lp.state); s.selections.turboHp = hp;
      const fixed = intoMargins(s);
      const got = score(fixed);
      if (got.hp > curHp + 0.5) { cur = fixed; curHp = got.hp; }
    }
  }
  return cur;
}

// ---- tune -------------------------------------------------------------------------------------------
const TUNE_AXES = [
  { key: 'boostHighBar', steps: [-1.0, -0.5, -0.2, 0.2, 0.5, 1.0, 2.0], min: 0, max: 12 },
  { key: 'boostMidBar', steps: [-0.8, -0.3, 0.3, 0.8, 1.5], min: 0, max: 12 },
  { key: 'boostLowBar', steps: [-0.4, -0.2, 0.2, 0.4], min: 0, max: 8 },
  { key: 'revLimitRpm', steps: [-600, -300, 300, 600], min: 5000, max: 11500 },
  { key: 'lambda', steps: [-0.06, -0.03, 0.03, 0.06], min: 0.58, max: 1.0 },
  { key: 'railTargetBar', steps: [-20, -10, 10, 20], min: 100, max: 260 },
  { key: 'intakeCamAdvanceDeg', steps: [-6, -3, 3, 6], min: -20, max: 25 },
  { key: 'ignitionTrimDeg', steps: [-1.5, -0.5, 0.5, 1.5], min: -8, max: 6 },
  { key: 'exhaustTdcLiftMm', steps: [-0.2, -0.1, 0.1, 0.2], min: 0, max: 3 },
  { key: 'intakeTdcLiftMm', steps: [-0.2, -0.1, 0.1, 0.2], min: 0, max: 3 },
  { key: 'ethanolPct', steps: [-15, -5, 5, 15], min: 0, max: 100 }
];

function sweepTune(state, rounds = 3) {
  let cur = intoMargins(clone(state)), curHp = score(cur).hp;
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (const ax of TUNE_AXES) {
      const base = Number(cur.tune[ax.key]);
      if (!Number.isFinite(base)) continue;
      const scale = round === 0 ? 1 : round === 1 ? 0.5 : 0.25;
      const got = best(cur, ax.steps.map(d => s => {
        s.tune[ax.key] = Math.min(ax.max, Math.max(ax.min, base + d * scale));
      }));
      if (got.hp > curHp + 0.3) { cur = got.state; curHp = got.hp; moved = true; }
    }
    if (!moved) break;
  }
  return cur;
}

function perfectAssembly(state) {
  const a = C.assemblyHealth(state).targets;
  const r = v => Math.round(v * 1000) / 1000;
  Object.assign(state.assembly, {
    topRingGapMm: r(a.topRingGapMm), secondRingGapMm: r(a.secondRingGapMm),
    rodClearanceMm: r(a.rodClearanceMm), mainClearanceMm: r(a.mainClearanceMm),
    sparkGapMm: r(a.sparkGapMm), balanceQualityPct: 100, deckSealQualityPct: 100,
    fastenerProcedurePct: 100, oilPrimed: true
  });
  const cam = C.camTimingHealth(state);
  if (cam.applicable) {
    state.tune.exhaustTdcLiftMm = cam.targetExhaustTdcMm;
    state.tune.intakeTdcLiftMm = cam.targetIntakeTdcMm;
  }
  return state;
}

function maxBuild(id) {
  const e = ENGINES[id];
  let s = C.applyPreset(C.blankState(), e.from);
  s.selections.block = e.block;
  s.selections.head = e.head;
  s.tune.ecu = null;
  s.service = { ...s.service, oilId: '10w60_race', liters: 5.0, filterId: 'motorsport', oilAgeKm: 0, oilRuns: 0 };
  s.wear = { engine: 0, turbo: 0, clutch: 0, tyres: 0 };
  s.damage = { engine: 0, turbo: 0 };
  perfectAssembly(s);
  // parts, turbos, tune - then round again, because a bigger turbo changes which parts are worth having
  const tick = phase => { if (process.env.EA888_QUIET !== '1') process.stderr.write(`    ${id} ${phase}: ${Math.round(score(s).hp)} pk (${pulls} pulls)\n`); };
  s = intoMargins(s); tick('start');
  for (let i = 0; i < 2; i++) {
    s = sweepParts(s); tick('parts');
    s = sweepTurbos(s); tick('turbos');
    s = sweepTune(s); tick('tune');
    perfectAssembly(s);
  }
  s = sweepTune(s, 4); tick('final');
  const got = score(s);
  return { id, label: e.label, state: s, hp: got.hp, r: got.r };
}

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const wanted = args.filter(a => ENGINES[a]);
const list = wanted.length ? wanted : Object.keys(ENGINES);

const out = {};
for (const id of list) {
  const t0 = Date.now();
  const b = maxBuild(id);
  const g = C.engineGeometry(b.state);
  out[id] = {
    label: b.label,
    hp: Math.round(b.hp),
    torqueNm: Math.round(b.r.peakTorqueNm),
    hpRpm: b.r.peakHpRpm,
    reliability: b.r.reliabilityScore,
    displacementCc: Math.round(g.realDisplacementCc),
    cylinders: g.cylinders,
    priceEur: C.totalPartsPrice(b.state),
    selections: b.state.selections,
    tune: (({ ecu, als, ...rest }) => rest)(b.state.tune)
  };
  console.log(`${b.label.padEnd(28)} ${String(Math.round(b.hp)).padStart(5)} pk  ${String(Math.round(b.r.peakTorqueNm)).padStart(4)} Nm  @${b.r.peakHpRpm}  betr ${String(b.r.reliabilityScore).padStart(3)}  ${b.state.selections.turbo}${b.state.selections.turboHp ? ' + ' + b.state.selections.turboHp : ''}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
}
console.log(`\n${pulls} pulls`);
if (jsonOut) { require('fs').writeFileSync(jsonOut, JSON.stringify(out, null, 2)); console.log('geschreven naar', jsonOut); }
