import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAR_CATALOG,
  TIRE_TYPES,
  createCar,
  createShopOffers,
  getCarStats,
  getLevel,
  initialState,
  runRace,
} from '../src/game.js';

test('new game starts with starter car, credits and three basic race sets', () => {
  const state = initialState();
  assert.equal(state.credits, 12000);
  assert.equal(state.cars.length, 1);
  assert.equal(state.cars[0].key, 'starter');
  assert.equal(state.tires.basic, 3);
});

test('shop has three stable offers for a given hour and every pack contains three sets', () => {
  const first = createShopOffers(490000);
  const second = createShopOffers(490000);
  assert.equal(first.length, 3);
  assert.deepEqual(first, second);
  assert.ok(first.every((offer) => offer.packSize === 3 && TIRE_TYPES[offer.type]));
});

test('car upgrades are stored per car and affect calculated stats', () => {
  const first = createCar('starter', 'test-car-a');
  const second = createCar('starter', 'test-car-b');
  first.upgrades.engine = 1;
  first.upgrades.gearbox = 2;
  const firstStats = getCarStats(first);
  const secondStats = getCarStats(second);
  assert.ok(firstStats.power > secondStats.power);
  assert.ok(firstStats.topSpeed > secondStats.topSpeed);
  assert.equal(second.upgrades.engine, 0);
  assert.equal(CAR_CATALOG.length, 5);
});

test('every race returns a valid placement, prize and XP award', () => {
  const result = runRace(createCar('starter', 'race-car'), 'basic', 'coast');
  assert.ok([1, 2, 3, 4].includes(result.place));
  assert.ok(result.prize >= 750);
  assert.ok(result.xp > 0);
  assert.equal(result.tireType, 'basic');
  assert.equal(result.track, 'Coastal Run');
});

test('level progression is calculated from XP', () => {
  assert.deepEqual(getLevel(0), { level: 1, current: 0, required: 500, progress: 0 });
  assert.equal(getLevel(1200).level, 3);
  assert.equal(getLevel(1200).current, 200);
});
