#!/usr/bin/env node
'use strict';
// Builds src/assets/turbo-data.js from the source datasets in data/turbo/.
//   node tools/build_turbo_data.js          write the runtime bundle
//   node tools/build_turbo_data.js --check  exit 1 when the bundle is out of date
// Vendor maps are copied as digitized. Modeled maps are the G25-660 template
// rescaled to each part's parameters and are always tagged mapType "modeled".
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'turbo');
const OUT = path.join(ROOT, 'src', 'assets', 'turbo-data.js');
const K = 0.2857; // (gamma - 1) / gamma for air
const VENDOR_FILES = ['garrett-g25-660.json', 'garrett-g30-770.json'];

const read = name => JSON.parse(fs.readFileSync(path.join(SRC, name), 'utf8'));
const r3 = v => Math.round(v * 1000) / 1000;
const pts = list => list.map(([a, b]) => [r3(a), r3(b)]);

function vendorEntry(v, inertia) {
  const s = v.vendorSpecs;
  const ar = String(v.turbine.selectedAr.toFixed(2));
  return {
    id: v.id,
    name: v.name,
    mapType: v.mapType,
    mapSource: v.mapSource,
    digitization: v.digitization,
    notes: v.notes || '',
    compressorInducerMm: s.compressorInducerMm,
    compressorExducerMm: s.compressorExducerMm,
    turbineInducerMm: s.turbineInducerMm,
    turbineExducerMm: s.turbineExducerMm,
    maxShaftRpm: s.maxShaftRpm,
    peakEfficiency: s.maxCompressorEfficiency,
    surgeLine: pts(v.compressor.surgeLine),
    chokeLine: pts(v.compressor.chokeLine),
    speedLines: v.compressor.speedLines.map(l => ({ rpm: l.rpm, points: pts(l.points) })),
    efficiencyIslands: v.compressor.efficiencyIslands.map(i => ({ efficiency: i.efficiency, polygon: pts(i.polygon) })),
    boundaryEfficiency: { surge: v.compressor.boundaryEfficiency.surge, choke: v.compressor.boundaryEfficiency.choke },
    turbine: {
      ar: Number(ar),
      twinScroll: false,
      maxEfficiency: v.turbine.maxEfficiency,
      flowCurve: pts(v.turbine.flowCurves[ar])
    },
    rotorInertiaKgM2: inertia(s.turbineInducerMm)
  };
}

function modeledEntry(id, m, template, method, inertia) {
  const t = template;
  const tplChoke = Math.max(...t.chokeLine.map(p => p[0]));
  const tplPrTop = Math.max(...t.surgeLine.map(p => p[1]), ...t.chokeLine.map(p => p[1]));
  const sW = m.chokeFlowLbMin / tplChoke;
  const work = pr => (Math.pow(pr, K) - 1) / (Math.pow(tplPrTop, K) - 1);
  const pr = p => Math.pow(1 + work(p) * (Math.pow(m.prTop, K) - 1), 1 / K);
  const map = list => list.map(([w, p]) => [r3(w * sW), r3(pr(p))]);
  const dEff = t.peakEfficiency - m.peakEfficiency;
  const tplTurbMax = Math.max(...t.turbine.flowCurve.map(p => p[1]));
  return {
    id,
    name: m.name,
    mapType: 'modeled',
    mapSource: `Modeled approximation: Garrett G25-660 map shape rescaled (no trustworthy public map for this part). ${method}`,
    digitization: 'n/a (modeled)',
    notes: m.basis,
    compressorInducerMm: m.compressorInducerMm,
    compressorExducerMm: r3(m.compressorInducerMm / 0.806),
    turbineInducerMm: m.turbineMm,
    turbineExducerMm: r3(m.turbineMm * 0.907),
    maxShaftRpm: m.maxShaftRpm,
    peakEfficiency: m.peakEfficiency,
    surgeLine: map(t.surgeLine),
    chokeLine: map(t.chokeLine),
    speedLines: t.speedLines.map(l => ({ rpm: Math.round((l.rpm * m.maxShaftRpm) / t.maxShaftRpm), points: map(l.points) })),
    efficiencyIslands: t.efficiencyIslands.map(i => ({ efficiency: r3(i.efficiency - dEff), polygon: map(i.polygon) })),
    boundaryEfficiency: { surge: r3(t.boundaryEfficiency.surge - dEff), choke: r3(t.boundaryEfficiency.choke - dEff) },
    turbine: {
      ar: null,
      twinScroll: !!m.twinScroll,
      maxEfficiency: m.turbineEfficiency,
      flowCurve: t.turbine.flowCurve.map(([er, w]) => [er, r3((w * m.turbineChokeFlowLbMin) / tplTurbMax)])
    },
    rotorInertiaKgM2: inertia(m.turbineMm)
  };
}

function buildTurboData() {
  const charge = read('charge-system.json');
  const modeled = read('modeled-turbos.json');
  const ri = charge.rotorInertia;
  const inertia = mm => Number((ri.refKgM2 * Math.pow(mm / ri.refTurbineMm, ri.exponent)).toPrecision(4));
  const turbos = {};
  for (const file of VENDOR_FILES) {
    const v = read(file);
    turbos[v.id] = vendorEntry(v, inertia);
  }
  const template = turbos[modeled.templateMap];
  if (!template) throw new Error(`template map ${modeled.templateMap} missing`);
  for (const [id, m] of Object.entries(modeled.turbos)) {
    if (turbos[id]) throw new Error(`${id} is both vendor and modeled`);
    turbos[id] = modeledEntry(id, m, template, modeled.method, inertia);
  }
  const strip = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));
  return {
    schemaVersion: 1,
    generatedBy: 'tools/build_turbo_data.js',
    units: {
      compressorFlow: 'lb/min corrected to 545 R (302.6 K) and 13.95 psia (0.9618 bar)',
      turbineFlow: 'lb/min corrected to 519 R (288.3 K) and 14.696 psia (1.01325 bar)',
      pressureRatio: 'total-to-total, absolute',
      shaftSpeed: 'rpm'
    },
    turbos,
    chargeAir: strip(charge.chargeAir),
    exhaust: strip(charge.exhaust),
    wastegate: strip(charge.wastegate),
    fuelStoichAfr: charge.fuelStoichAfr
  };
}

function render(data) {
  return `/* GENERATED by tools/build_turbo_data.js from data/turbo/*.json - do not edit by hand.
 * Turbo compressor/turbine maps with provenance. mapType "vendor" = digitized from the
 * manufacturer's published map; "modeled" = engineering approximation, not a vendor map.
 */
(function (root) {
  'use strict';
  const DATA = ${JSON.stringify(data)};
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  root.EA888_TURBO_DATA = DATA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

if (require.main === module) {
  const text = render(buildTurboData());
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) {
      console.error('src/assets/turbo-data.js is out of date: run node tools/build_turbo_data.js');
      process.exit(1);
    }
    console.log('turbo-data.js is up to date');
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote ${path.relative(ROOT, OUT)} (${text.length} bytes)`);
  }
}

module.exports = { buildTurboData, render };
