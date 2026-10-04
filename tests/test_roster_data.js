'use strict';
// The roster data module: real cars from the YouTube research. Rules this suite holds the data to:
// every value says where it came from (video + timestamp, or the rule/derivation that made it), a value the
// research does not have is never filled in silently, and the pairs a calibration may not use stay out.
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('../src/assets/roster-data.js');

const ROOT = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build_roster_data.js'), '--check'], { stdio: 'pipe' });

const KINDS = ['measured', 'stated', 'estimate', 'modeled'];
// A value object is anything with both 'value' and 'kind'.
function values(node, at, out = []) {
  if (Array.isArray(node)) node.forEach((x, i) => values(x, `${at}[${i}]`, out));
  else if (node && typeof node === 'object') {
    if ('value' in node && 'kind' in node) out.push([at, node]);
    for (const [k, v] of Object.entries(node)) if (k !== 'source') values(v, `${at}.${k}`, out);
  }
  return out;
}

const problems = [];
const all = values(R.cars, 'cars').concat(values(R.calibration, 'calibration'));
for (const [at, v] of all) {
  if (v.value === null || v.value === undefined) {
    if (v.kind) problems.push(`${at}: kind ${v.kind} without a value`);
    continue;
  }
  if (!KINDS.includes(v.kind)) problems.push(`${at}: kind '${v.kind}' is not one of ${KINDS.join('/')}`);
  if (v.kind === 'modeled') {
    if (!v.reason) problems.push(`${at}: modeled without a reason`);
  } else if (!v.source || !v.source.video) problems.push(`${at}: ${v.kind} value without a source video`);
}
assert.deepStrictEqual(problems, [], `roster values without provenance:\n  ${problems.join('\n  ')}`);
assert(all.length > 150, `expected the full roster, found ${all.length} values`);

// Source and names: the bundle names the research commit; what the game shows is the neutral display name.
assert.match(R.source.commit, /^[0-9a-f]{7,40}$/, 'research commit missing');
for (const c of R.cars) {
  assert(c.displayName && c.displayName !== c.id, `${c.id}: no display name`);
  assert.notStrictEqual(c.displayName, c.sourceName, `${c.id}: the display name is the research name`);
}

// Opponents: both numbers known or derived, and a derived number says it is.
const usable = R.cars.filter(c => c.opponent.usable);
assert(usable.length >= 6, `only ${usable.length} usable opponents`);
for (const c of usable) {
  for (const k of ['weightLb', 'powerHp']) {
    const v = c.opponent[k];
    assert(Number.isFinite(v.value) && v.value > 0, `${c.id}: opponent ${k} missing`);
    if (v.kind === 'modeled') assert(v.derivedFrom && v.reason, `${c.id}: modeled ${k} without its derivation`);
  }
  assert(R.rules.carBody[c.id] && R.rules.bodies[R.rules.carBody[c.id]], `${c.id}: no body class`);
  assert(R.rules.engines.carEngine[c.id] && R.rules.engines.families[R.rules.engines.carEngine[c.id]], `${c.id}: no engine family`);
}

// Calibration: excluded pairs stay out, and a trap speed that was used to derive a number is not a test.
const cal = R.calibration;
const excludedIds = new Set(cal.excluded.map(e => e.carId));
for (const p of cal.points) {
  const derived = p.weight.kind === 'modeled' || p.power.kind === 'modeled';
  assert.strictEqual(p.metrics.includes('mph'), !derived, `${p.carId}: mph test while a number was derived from the trap`);
  assert(!(excludedIds.has(p.carId) && cal.excluded.some(e => e.carId === p.carId && e.build === p.build)), `${p.carId}: excluded and used`);
}
for (const id of ['mullet', 'mcflurry', 'lumberjack']) assert(excludedIds.has(id), `${id} must be excluded (see the extracts)`);
// roster.json pairs Mullet's World Cup pass with the weight of a later build
const mullet = R.cars.find(c => c.id === 'mullet');
assert.strictEqual(mullet.opponent.weightLb.value, 3330, 'Mullet races at its World Cup weight');
// the one fully known car keeps every test and its documented lift
const j = cal.points.find(p => p.carId === 'crc12_jackstand_240');
assert.deepStrictEqual(j.metrics.slice().sort(), ['et', 'mph', 'sixtyFt'], 'Jackstand 240 is the independent check');
assert.strictEqual(R.cars.find(c => c.id === 'crc12_jackstand_240').facts.driverLiftFt.value, 1000, 'documented lift at ~1000 ft');

// Every rule says why: an object that holds numbers (or a ratio list) carries a reason.
const ruleReasons = [];
(function walk(n, at) {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return;
  const own = Object.entries(n).filter(([k]) => k !== 'schemaVersion');
  if (own.some(([, v]) => typeof v === 'number' || Array.isArray(v)) && !n.reason) ruleReasons.push(at);
  for (const [k, v] of own) walk(v, `${at}.${k}`);
})(R.rules, 'rules');
assert.deepStrictEqual(ruleReasons, [], `rules without a reason:\n  ${ruleReasons.join('\n  ')}`);

console.log('PASS roster data tests');
module.exports = { cars: R.cars.length, opponents: usable.length, calibrationPoints: cal.points.length, excluded: cal.excluded.length, values: all.length };
