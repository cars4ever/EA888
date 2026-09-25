#!/usr/bin/env node
'use strict';
// Dev tool: prints what a dyno pull's reliability score is actually made of.
//
// The score is 100 minus a sum of penalties, and a build can sit at 60 without any single thing being
// wrong - a dozen bands each taking five points. This prints the terms so a rebalance can be argued from
// numbers instead of impressions.
//
//   node tools/risk_breakdown.js [preset] [key=value ...]
//   node tools/risk_breakdown.js randy turbo=pt5558 boostMidBar=1.8 boostHighBar=1.8

const C = require('../src/assets/sim.js');

const [, , presetArg, ...rest] = process.argv;
const preset = presetArg && !presetArg.includes('=') ? presetArg : 'randy';
const args = (presetArg && presetArg.includes('=') ? [presetArg] : []).concat(rest);

const state = C.applyPreset(C.blankState(), preset);
for (const a of args) {
  const [k, v] = a.split('=');
  const num = Number(v);
  if (k in state.selections) state.selections[k] = v;
  else if (k in state.service) state.service[k] = Number.isFinite(num) ? num : v;
  else state.tune[k] = Number.isFinite(num) ? num : v;
}
state.tune.ecu = null;

const part = cat => (C.CATEGORY_MAP[cat].items.find(i => i.id === state.selections[cat]) || {});
const positive = xs => xs.filter(x => Number(x) > 0);
const core = ['block', 'crank', 'oiling', 'head', 'valvetrain', 'ecu'].map(part);
const hpLimit = Math.min(...positive(core.map(p => p.hpLimit)));
const tqLimit = Math.min(...positive([...core.map(p => p.torqueLimit), part('transmission').transTorque]));
const rpmLimit = Math.min(...positive(core.map(p => p.rpmLimit)));
const clampBmep = Number(part('sealing').headClampBmep) || 60;

const r = C.simulateEngine(state, { noise: false });
const riskOver = (v, a, b) => Math.max(0, Math.min((v - a) / (b - a), 1.35));
// Both of these are per-build, not constants: the oil's own tolerance and the turbo's own shaft limit.
// Hard-coding them made a stock K03 look like it was 24 % over its shaft limit when it was under it.
const oilTol = (C.OIL_MAP && C.OIL_MAP[state.service.oilId] || {}).tempTolerance || 138;
const shaftLimit = (r.samples || []).reduce((a, p) => a || p.shaftLimitRpm, 0) || 150000;
const strokeM = (r.strokeMm || 92.8) / 1000;
const mpsLimit = Math.max(18, Math.min(30, 2 * strokeM * rpmLimit / 60));

const terms = [
  ['vermogen', riskOver(r.peakHp / hpLimit, 0.78, 1.18) * 22, `${Math.round(r.peakHp)}/${hpLimit} pk`],
  ['koppel', riskOver(r.peakTorqueNm / tqLimit, 0.78, 1.18) * 24, `${Math.round(r.peakTorqueNm)}/${tqLimit} Nm`],
  ['toerental', riskOver(state.tune.revLimitRpm / rpmLimit, 0.95, 1.10) * 19, `${state.tune.revLimitRpm}/${rpmLimit} rpm`],
  ['cilinderdruk', riskOver(r.maxBmepBar / clampBmep, 0.75, 1.2) * 18, `${r.maxBmepBar.toFixed(1)}/${clampBmep} bar`],
  ['brandstofduty', riskOver(r.maxFuelDuty / 100, 0.78, 1.12) * 20, `${Math.round(r.maxFuelDuty)}%`],
  ['turbo-load', riskOver(r.maxTurboLoad / 100, 0.72, 1.08) * 20, `${Math.round(r.maxTurboLoad)}%`],
  ['turbo-as', riskOver(r.maxTurboShaftRpm / shaftLimit, 0.78, 1.10) * 18,
    `${Math.round(r.maxTurboShaftRpm / 1000)}k/${Math.round(shaftLimit / 1000)}k rpm`],
  ['inlaattemp', riskOver(r.maxIatC / 70, 0.62, 1.2) * 10, `${Math.round(r.maxIatC)} °C`],
  ['EGT', riskOver(r.maxEgtC / 980, 0.75, 1.12) * 12, `${Math.round(r.maxEgtC)} °C`],
  ['olietemp', riskOver(r.maxOilTempC / oilTol, 0.90, 1.15) * 14, `${Math.round(r.maxOilTempC)}/${oilTol} °C`],
  ['zuigersnelheid', riskOver(r.maxMeanPistonSpeed / mpsLimit, 0.92, 1.12) * 10,
    `${r.maxMeanPistonSpeed.toFixed(1)}/${mpsLimit.toFixed(1)} m/s`],
  ['klop: ontsteking in', riskOver(r.sparkDeficitFrac || 0, 0.30, 0.70) * 24,
    `${((r.sparkDeficitFrac || 0) * 100).toFixed(0)} % van MBT ingeleverd`],
  ['klop: regelaar', riskOver((r.maxKnockRetardDeg || 0) / 10, 0.35, 1.0) * 12,
    `${(r.maxKnockRetardDeg || 0).toFixed(1)}\u00b0 retard`],
  ['klop: overschreden', riskOver(r.maxKnockRisk, 0.99, 1.2) * 30, r.maxKnockRisk.toFixed(2)],
  ['oliedruk', Math.max(0, Math.min((2.8 - r.minOilPressureBar) / 1.8, 1.5)) * 18, `${r.minOilPressureBar.toFixed(2)} bar`],
  ['oliefilm', riskOver((0.5 + 0.6 * Math.min(1.25, r.maxBmepBar / Math.max(20, clampBmep))) / Math.max(0.35, r.oilFilm), 1.0, 1.6) * 15,
    `${r.oilFilm.toFixed(2)} bij ${r.maxBmepBar.toFixed(0)} bar BMEP`],
  ['slijtage/schade', state.wear.engine * 0.22 + state.wear.turbo * 0.08 + state.damage.engine * 0.7,
    `motor ${state.wear.engine}% turbo ${state.wear.turbo}%`]
];

console.log(`${preset}${args.length ? ' (' + args.join(' ') + ')' : ''}`);
console.log(`  ${Math.round(r.peakHp)} pk  ${Math.round(r.peakTorqueNm)} Nm  betrouwbaarheid ${r.reliabilityScore}\n`);
let sum = 0;
for (const [name, points, detail] of terms.sort((a, b) => b[1] - a[1])) {
  sum += points;
  if (points > 0.05) console.log(`  ${name.padEnd(16)} ${points.toFixed(1).padStart(5)}   ${detail}`);
}
console.log(`  ${'-'.repeat(16)} ${'-'.repeat(5)}`);
console.log(`  ${'benoemd totaal'.padEnd(16)} ${sum.toFixed(1).padStart(5)}   (bonussen van onderdelen trekken hier weer vanaf)`);
