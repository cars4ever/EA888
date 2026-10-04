'use strict';
// The garage: a roster car is for sale only when the research gives what it cost, buying it takes the price
// from the budget, the car you race can be the Scirocco or a car you own, and a roster car you own keeps its own
// record by the same wear rule as every car (out = no racing until you pay the rebuild).
const assert = require('assert');
const C = require('../src/assets/sim.js');

const fresh = C.normalizeState(C.blankState());
assert.deepStrictEqual(C.garageOf(fresh), { active: 'scirocco', cars: {} }, 'a new save races the Scirocco');

// prices: from the research or not at all
for (const o of C.rosterOpponents()) {
  const car = C.rosterCarData(o.id), price = C.rosterCarPrice(o.id);
  if (!car.price) { assert.strictEqual(price, null, `${o.id}: no price in the research, not for sale`); continue; }
  assert(price.usd > 0 && price.eur === Math.round(C.usdToEur(price.usd)), `${o.id}: euros at the game rate`);
  assert(['stated', 'modeled'].includes(price.value.kind), `${o.id}: price kind`);
  if (price.value.kind === 'modeled') {
    const sum = price.value.derivedFrom.purchaseUsd + price.items.reduce((a, i) => a + i.priceUsd, 0);
    assert.strictEqual(price.usd, Math.round(sum), `${o.id}: purchase plus the listed spending`);
    assert(price.items.every(i => !/installed by seller|came with car|spare, not installed/i.test(i.item)), `${o.id}: lines already in the purchase are not counted`);
  }
}
assert.strictEqual(C.rosterCarPrice('crc3_240sx_hatch').usd, 10374, 'the hatch: its budget board');
assert.strictEqual(C.rosterCarPrice('eagle'), null, 'Eagle: no price, not for sale');

// buying
const id = 'crc12_jackstand_240', price = C.rosterCarPrice(id);
assert(!C.buyRosterCar({ ...fresh, bank: 10 }, id).ok, 'not without the money');
assert(!C.buyRosterCar(fresh, 'eagle').ok, 'not a car without a price');
const bought = C.buyRosterCar(fresh, id);
assert(bought.ok && bought.bank === fresh.bank - price.eur, 'paid from the budget');
let save = { ...fresh, bank: bought.bank, garage: bought.garage };
assert(!C.buyRosterCar(save, id).ok, 'not twice');
// racing it
assert.strictEqual(C.setActiveCar(save, 'eagle').active, 'scirocco', 'only a car you own can be the race car');
save.garage = C.setActiveCar(save, id);
assert.strictEqual(save.garage.active, id);
const pass = C.simulateRaceRun(C.rosterState(id), { reactionTime: 0, tyreTempC: 55 });
const after = C.applyOwnedCarRun(save, id, pass);
const rec = after.garage.cars[id].record, w = C.raceWearFromResult(pass);
assert(Math.abs(rec.wear.engine - w.wear.engine) < 1e-12 && Math.abs(rec.wear.transmission - w.wear.transmission) < 1e-12, 'same wear rule as every car');
assert.strictEqual(after.garage.cars[id].best.quarter, pass.quarter, 'its own best');
assert.deepStrictEqual(save.wear, fresh.wear, "the Scirocco's wear is not touched");
// out: the player pays the rebuild (the game's rule), the team does not do it for you
const worn = { ...save, garage: { ...save.garage, cars: { [id]: { ...save.garage.cars[id], record: { runs: 9, wear: { engine: 99.99, transmission: 0 } } } } } };
const broke = C.applyOwnedCarRun(worn, id, pass);
assert(broke.garage.cars[id].record.out, 'worn through is out');
const again = C.applyOwnedCarRun({ ...worn, garage: broke.garage }, id, pass);
assert(again.garage.cars[id].record.out, 'and stays out: no free rebuild for the player');
const fixed = C.rebuildOwnedCar({ ...worn, garage: broke.garage, bank: 10000 }, id);
assert(fixed.ok && fixed.bank === 10000 - C.REBUILD_BASE_EUR && !fixed.garage.cars[id].record.out, 'rebuilt for the game\'s rebuild cost');

// the burnout runs on the roster car's own curve and converter
const b = C.createBurnoutRuntime(C.rosterState(id), { targetRpm: 5000, startC: 30 });
for (let i = 0; i < 200; i++) b.step(0.01, { throttle: true });
const bp = b.point();
assert(Number.isFinite(bp.rpm) && bp.rpm > 3000 && bp.tyreSurfaceC > 30, 'roster burnout');

// Career rules judge the car that races: a roster V8 on drag radials is not a pump-fuel, street-tyre, 2.0-litre car.
{
  const car = { ...C.rosterState(id), bank: 50000, career: { ...C.defaultCareer(), rep: 500 } };
  assert(C.careerEligibility(car, 'outlaw_20').some(w => /Cilinderinhoud/.test(w)), 'a V8 is not a 2.0-litre car');
  assert(C.careerEligibility(car, 'street_night').some(w => /Banden/.test(w)), 'drag radials are not street tyres');
  assert.deepStrictEqual(C.careerEligibility(car, 'real_builds'), [], 'open bracket: allowed');
  const entered = C.startCareerEvent({ ...fresh, bank: 50000, career: { ...C.defaultCareer(), rep: 500 } }, 'real_builds', undefined, { raceCar: C.rosterState(id) });
  assert.strictEqual(entered.career.active.eventId, 'real_builds');
  assert.throws(() => C.startCareerEvent({ ...fresh, career: { ...C.defaultCareer(), rep: 500 } }, 'outlaw_20', undefined, { raceCar: C.rosterState(id) }), /Cilinderinhoud/);
}

console.log('PASS garage tests');
module.exports = { forSale: C.rosterOpponents().filter(o => C.rosterCarPrice(o.id)).length, coupeEur: price.eur };
