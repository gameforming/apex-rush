import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, getCarStats, getRacePerformance, TIRE_TYPES } from '../src/game.js';
import { createRaceState, RACE_DISTANCE, stepRacePhysics } from '../src/racing/physics.js';

const controls = { throttle: 1, brake: 0, steering: 0 };

test('downforce setup trades straight-line speed for cornering', () => {
  const car = createCar('starter', 'setup-test');
  const baseline = getCarStats(car);
  const highDownforce = getCarStats({ ...car, tuning: { ...car.tuning, downforce: 100 } });
  const lowDownforce = getCarStats({ ...car, tuning: { ...car.tuning, downforce: 0 } });
  assert.ok(highDownforce.handling > baseline.handling);
  assert.ok(highDownforce.topSpeed < baseline.topSpeed);
  assert.ok(lowDownforce.topSpeed > baseline.topSpeed);
  assert.ok(lowDownforce.handling < baseline.handling);
});

test('short gearing improves acceleration at the expense of top speed', () => {
  const car = createCar('starter', 'gear-test');
  const long = getCarStats({ ...car, tuning: { ...car.tuning, gearRatio: 0 } });
  const short = getCarStats({ ...car, tuning: { ...car.tuning, gearRatio: 100 } });
  assert.ok(short.acceleration > long.acceleration);
  assert.ok(short.topSpeed < long.topSpeed);
});

test('soft tires add speed and grip while terrain selection changes grip', () => {
  const car = createCar('starter', 'tire-test');
  const basic = getRacePerformance(car, 'basic', 'coast');
  const soft = getRacePerformance(car, 'soft', 'coast');
  const allTerrain = getRacePerformance(car, 'allterrain', 'desert');
  const softOffroad = getRacePerformance(car, 'soft', 'desert');
  assert.ok(soft.topSpeed > basic.topSpeed);
  assert.ok(soft.grip > basic.grip);
  assert.ok(allTerrain.grip > softOffroad.grip);
  assert.ok(TIRE_TYPES.soft);
});

test('race physics responds to throttle, braking and steering and ends at the finish line', () => {
  const stats = getRacePerformance(createCar('starter'), 'basic', 'coast');
  let state = createRaceState();
  for (let i = 0; i < 60; i += 1) state = stepRacePhysics(state, controls, stats, 'coast', 1 / 60);
  assert.ok(state.speed > 0);
  const straight = state;
  for (let i = 0; i < 60; i += 1) state = stepRacePhysics(state, { throttle: 0, brake: 1, steering: -1 }, stats, 'coast', 1 / 60);
  assert.ok(state.speed < straight.speed);
  assert.notEqual(state.lane, straight.lane);
  let finish = createRaceState();
  for (let i = 0; i < 6000 && !finish.finished; i += 1) finish = stepRacePhysics(finish, controls, stats, 'coast', 1 / 60);
  assert.equal(finish.finished, true);
  assert.equal(finish.distance, RACE_DISTANCE);
});

test('track curvature comes from the closed top-down circuit, not a scrolling road wave', async () => {
  const { roadCurve } = await import('../src/racing/physics.js');
  const coastStart = roadCurve(0, 'coast');
  const coastCorner = roadCurve(215, 'coast');
  const mountainCorner = roadCurve(215, 'mountain');
  assert.ok(Number.isFinite(coastStart));
  assert.ok(Math.abs(coastCorner) > 0.01);
  assert.notEqual(coastCorner, mountainCorner);
});
