#!/usr/bin/env node
'use strict';
// Turn the reference builds from tools/max_builds.js into presets the player can load, and into the fixture
// tests/test_max_builds.js measures the in-game tuner against.
//
//   node tools/import_max_builds.js /tmp/max_builds.json
//
// Presets are named `max_<engine>`; re-running replaces them rather than adding duplicates.

const fs = require('fs');
const path = require('path');
const C = require('../src/assets/sim.js');

const src = process.argv[2] || '/tmp/max_builds.json';
const builds = JSON.parse(fs.readFileSync(src, 'utf8'));
const ROOT = path.resolve(__dirname, '..');
const SIM = path.join(ROOT, 'src/assets/sim.js');
const PRE = '  const PRESETS = ';

const lines = fs.readFileSync(SIM, 'utf8').split(/\n/).map(l => l + '\n');
lines[lines.length - 1] = lines[lines.length - 1].replace(/\n$/, '');
const i = lines.findIndex(l => l.startsWith(PRE));
if (i < 0) throw new Error('PRESETS niet gevonden in sim.js');
const body = lines[i].slice(PRE.length).trim();
if (!body.endsWith(';')) throw new Error('onverwacht einde van de PRESETS-regel');
const presets = JSON.parse(body.slice(0, -1));

// the assembly and service a reference build assumes: the best the game allows
const SERVICE = { oilId: '10w60_race', liters: 5.0, filterId: 'motorsport', oilAgeKm: 0, oilRuns: 0 };

// Re-check every build under the code as it stands now. The search runs for over an hour, the model can
// move underneath it, and a reference that does not itself meet the margins it was searched under is worse
// than no reference at all.
const SERVICE_FOR_CHECK = { oilId: '10w60_race', liters: 5.0, filterId: 'motorsport', oilAgeKm: 0, oilRuns: 0 };
const bad = [];
for (const [id, b] of Object.entries(builds)) {
  const st = C.blankState();
  Object.assign(st.selections, b.selections);
  Object.assign(st.tune, b.tune, { ecu: null });
  st.service = { ...st.service, ...SERVICE_FOR_CHECK };
  st.wear = { engine: 0, turbo: 0, clutch: 0, tyres: 0 };
  st.damage = { engine: 0, turbo: 0 };
  const a = C.assemblyHealth(st).targets, r2 = v => Math.round(v * 1000) / 1000;
  Object.assign(st.assembly, {
    topRingGapMm: r2(a.topRingGapMm), secondRingGapMm: r2(a.secondRingGapMm),
    rodClearanceMm: r2(a.rodClearanceMm), mainClearanceMm: r2(a.mainClearanceMm),
    sparkGapMm: r2(a.sparkGapMm), balanceQualityPct: 100, deckSealQualityPct: 100,
    fastenerProcedurePct: 100, oilPrimed: true
  });
  const r = C.simulateEngine(st, { noise: false });
  const sc = C.mapScore(r, C.MAP_TUNES.race, C.mapLimits(st));
  const drift = Math.abs(r.peakHp - b.hp) / Math.max(1, b.hp);
  if (r.status !== 'completed' || !sc.ok || drift > 0.02) {
    bad.push(`${id}: ${Math.round(r.peakHp)} pk (fixture ${b.hp}), betr ${r.reliabilityScore}, ${r.status}` +
      (sc.ok ? '' : `, buiten de marges: ${sc.over.map(o => o.key + ' ' + Math.round(o.value) + '/' + Math.round(o.limit)).join(', ')}`));
  } else {
    b.hp = Math.round(r.peakHp);
    b.torqueNm = Math.round(r.peakTorqueNm);
    b.reliability = r.reliabilityScore;
  }
}
if (bad.length) {
  console.error('Deze builds halen de racemarges niet onder de huidige code en worden NIET overgenomen:');
  for (const line of bad) console.error('  ' + line);
  console.error('\nDraai die motoren opnieuw: node tools/max_builds.js ' + bad.map(l => l.split(':')[0]).join(' '));
  process.exit(1);
}

let n = 0;
for (const [id, b] of Object.entries(builds)) {
  const key = `max_${id}`;
  presets[key] = {
    name: `Max: ${b.label} · ${b.hp} pk`,
    selections: b.selections,
    tune: b.tune,
    service: SERVICE,
    assembly: b.assembly || undefined
  };
  if (!presets[key].assembly) delete presets[key].assembly;
  n++;
}
lines[i] = PRE + JSON.stringify(presets) + ';\n';
fs.writeFileSync(SIM, lines.join(''));

const fixture = path.join(ROOT, 'tests/fixtures/max_builds.json');
fs.mkdirSync(path.dirname(fixture), { recursive: true });
fs.writeFileSync(fixture, JSON.stringify(builds, null, 2) + '\n');
console.log(`${n} presets geschreven (max_*) en de fixture bijgewerkt`);
