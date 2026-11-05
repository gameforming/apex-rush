import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_LAYOUTS, getTrackPose, getTrackSamples } from '../src/racing/track-layouts.js';

test('all selectable circuits are closed top-down loops with usable geometry', () => {
  for (const key of Object.keys(TRACK_LAYOUTS)) {
    const geometry = getTrackSamples(key);
    assert.ok(geometry.samples.length > 300);
    assert.ok(geometry.totalLength > 1000);
    const start = getTrackPose(key, 0);
    const finish = getTrackPose(key, 1);
    assert.ok(Math.hypot(start.x - finish.x, start.y - finish.y) < 0.01);
    assert.ok(Math.abs(Math.hypot(start.tangent.x, start.tangent.y) - 1) < 0.001);
  }
});

test('race position wraps around the circuit on every lap', () => {
  const start = getTrackPose('coast', 0);
  const nextLap = getTrackPose('coast', 1);
  assert.ok(Math.hypot(start.x - nextLap.x, start.y - nextLap.y) < 0.01);
});
