export const RACE_DISTANCE = 2400;
export const LAP_DISTANCE = 800;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function roadCurve(distance, trackKey = 'coast') {
  const trackScale = trackKey === 'mountain' ? 1.28 : trackKey === 'desert' ? 1.08 : 0.86;
  return (Math.sin(distance * 0.00225) * 0.58 + Math.sin(distance * 0.0051 + 1.2) * 0.29) * trackScale;
}

export function createRaceState() {
  return {
    distance: 0,
    speed: 0,
    lane: 0,
    lateralVelocity: 0,
    elapsed: 0,
    maxSpeed: 0,
    speedIntegral: 0,
    speedSamples: 0,
    offroadSeconds: 0,
    finished: false,
    damage: 0,
  };
}

export function stepRacePhysics(previous, controls, performance, trackKey = 'coast', delta = 1 / 60) {
  if (previous.finished) return previous;
  const dt = clamp(delta, 0.001, 0.05);
  const state = { ...previous };
  const throttle = clamp(Number(controls.throttle) || 0, 0, 1);
  const brake = clamp(Number(controls.brake) || 0, 0, 1);
  const steering = clamp(Number(controls.steering) || 0, -1, 1);
  const maxSpeedMs = Math.max(32, performance.topSpeed / 3.6);
  const accelerationForce = 2.25 + performance.acceleration * 0.037;
  const brakeForce = 7.4 + performance.braking * 0.055;
  const drag = 0.006 + (state.speed / maxSpeedMs) ** 2 * 0.075;
  let longitudinal = throttle * accelerationForce - brake * brakeForce - drag * state.speed;
  const curve = roadCurve(state.distance, trackKey);
  const severity = Math.min(1, Math.abs(curve));
  const cornerCapacity = 98 + performance.handling * 1.05 + performance.grip * 0.34 + performance.downforce * 0.18;
  const cornerDemand = state.speed * 3.6 * (0.55 + severity * 0.78);
  const slip = Math.max(0, cornerDemand - cornerCapacity);
  longitudinal -= slip * 0.012;
  state.speed = clamp(state.speed + longitudinal * dt, 0, maxSpeedMs);

  const gripFactor = clamp(performance.grip / 95, 0.55, 1.55);
  const steeringForce = steering * (0.92 + performance.handling * 0.003) * gripFactor;
  const curveForce = curve * (state.speed / 45) * 0.11;
  const laneAssist = state.lane * 1.15;
  state.lateralVelocity += (steeringForce - curveForce - laneAssist - state.lateralVelocity * (1.55 + gripFactor * 0.6)) * dt;
  state.lane = clamp(state.lane + state.lateralVelocity * dt, -1.42, 1.42);

  if (Math.abs(state.lane) > 0.78) {
    state.offroadSeconds += dt;
    state.speed = Math.max(7, state.speed - (4.2 + Math.abs(state.lane) * 2.2) * dt);
    state.lateralVelocity -= Math.sign(state.lane) * dt * 0.22;
  }
  if (Math.abs(state.lane) > 1.15) {
    state.damage = Math.min(100, state.damage + dt * 8);
    state.speed = Math.max(0, state.speed - 10 * dt);
  }

  state.elapsed += dt;
  state.distance = Math.min(RACE_DISTANCE, state.distance + state.speed * dt);
  const speedKph = state.speed * 3.6;
  state.maxSpeed = Math.max(state.maxSpeed, speedKph);
  state.speedIntegral += speedKph;
  state.speedSamples += 1;
  state.finished = state.distance >= RACE_DISTANCE;
  return state;
}

export function getRaceProgress(state) {
  return clamp(state.distance / RACE_DISTANCE, 0, 1);
}
