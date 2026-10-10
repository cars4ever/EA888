/* Visual identity only. Technical facts and prices remain in roster-data/sim.js. */
(function (root) {
  'use strict';
  const rows = [
    ['scirocco', 'Randy’s Volkswagen Scirocco', null, 2.578, 1.57, .323, .323, 4.256, 'ea888', 'EA888 project'],
    ['eagle', 'Eagle · 1969 Camaro', '01_Eagle_1969_Camaro', 2.74, 1.55, .30, .3795, 5.15, 'v8-turbo', 'roster opponent: race weight estimate / Hale power'],
    ['mullet', 'Mullet · El Camino', '02_Mullet_El_Camino', 2.95, 1.58, .30, .3795, 6.15, 'v8-turbo', 'roster opponent: big-block World Cup trim'],
    ['mcflurry', 'McFlurry · Foxbody coupé #3', '03_McFlurry_Foxbody_Mustang', 2.55, 1.49, .30, .3795, 4.75, 'v8-turbo', 'roster opponent: Coyote single 76 mm / 31 psi dyno'],
    ['lumberjack', 'Lumberjack · 1973 El Camino', '04_Lumberjack_1973_El_Camino', 2.95, 1.59, .325, .3795, 5.6, 'v8-turbo', 'roster opponent: 900 hp dyno at 26 psi'],
    ['crc12_jackstand_240', 'Jackstand · 1990 240SX coupé', '05_Jackstand_1990_240SX_Coupe', 2.47, 1.47, .305, .3795, 4.55, 'v8-nitrous', 'roster opponent: CRC12 520 hp + nitrous / 2605 lb with driver']
  ];
  const vehicles = Object.fromEntries(rows.map(([id, name, reference, wheelbase, track, frontRadius, rearRadius, length, sound, buildVariant]) => [id, {
    id, name, reference, buildVariant, model: reference ? `models/${id}.glb` : 'models/scirocco-body.glb',
    lowModel: reference ? `models/${id}-low.glb` : null,
    image: reference ? `images/vehicles/${id}.webp` : 'images/randy-scirocco-cutout.png',
    dimensions: { wheelbase, track, length, kind: reference ? 'estimate; wheelbase follows existing roster model; rear radius follows roster tyre size' : 'existing Scirocco' },
    wheels: { names: ['wheel_fl','wheel_fr','wheel_rl','wheel_rr'], radii: [frontRadius,frontRadius,rearRadius,rearRadius] },
    anchors: { exhaust: [[-.78,.38,-.6]], parachute: [0,.85,length/2], lights: [[-.6,.65,-length/2],[.6,.65,-length/2]] },
    sound: { id: sound, cylinders: reference ? 8 : 4, turbo: sound !== 'v8-nitrous', exhaust: reference ? 'side_35' : null },
    workshop: id === 'scirocco'
  }]));
  vehicles.eagle.anchors.exhaust=[[-1.04,.34,-.75]]; // visual estimate from supplied side/rear reference
  const api = { version: 2026101002, vehicles, ids: rows.map(r => r[0]), get: id => vehicles[id] || null };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EA888Vehicles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
