/**
 * Top-down circuit centerlines. Every course is a closed loop in a 1400 × 600
 * design space. The same geometry drives the race renderer and the track cards.
 */
export const TRACK_WIDTH = 1400;
export const TRACK_HEIGHT = 600;

export const TRACK_LAYOUTS = {
  coast: {
    name: 'Coastal Run',
    points: [
      [105, 150], [335, 150], [425, 173], [485, 238], [600, 245],
      [675, 205], [720, 135], [895, 125], [1080, 130], [1190, 185],
      [1235, 275], [1200, 360], [1115, 395], [1000, 385], [940, 430],
      [930, 500], [840, 535], [690, 535], [610, 495], [495, 495],
      [430, 545], [270, 545], [160, 505], [115, 420], [155, 340],
      [220, 300], [225, 235], [160, 210],
    ],
    surface: 'asphalt',
  },
  mountain: {
    name: 'Mountain Pass',
    points: [
      [110, 135], [330, 135], [420, 165], [475, 235], [570, 275],
      [690, 255], [760, 185], [880, 130], [1040, 145], [1160, 210],
      [1205, 295], [1150, 365], [1050, 400], [985, 470], [930, 535],
      [800, 550], [680, 520], [585, 475], [475, 465], [385, 510],
      [250, 520], [145, 465], [105, 375], [145, 300], [220, 250],
      [190, 190],
    ],
    surface: 'mixed',
  },
  desert: {
    name: 'Dust Valley',
    points: [
      [105, 160], [325, 160], [420, 135], [535, 185], [665, 185],
      [760, 135], [930, 130], [1070, 175], [1170, 250], [1210, 335],
      [1150, 400], [1045, 420], [965, 375], [875, 385], [820, 455],
      [830, 520], [735, 555], [590, 545], [485, 495], [380, 520],
      [265, 570], [160, 520], [110, 430], [150, 350], [105, 275],
    ],
    surface: 'dirt',
  },
};

const sampleCache = new Map();
const clamp01 = (value) => Math.max(0, Math.min(1, value));

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  };
}

export function getTrackSamples(trackKey = 'coast') {
  if (sampleCache.has(trackKey)) return sampleCache.get(trackKey);
  const layout = TRACK_LAYOUTS[trackKey] || TRACK_LAYOUTS.coast;
  const points = layout.points;
  const samples = [];
  const steps = 22;

  for (let index = 0; index < points.length; index += 1) {
    const p0 = points[(index - 1 + points.length) % points.length];
    const p1 = points[index];
    const p2 = points[(index + 1) % points.length];
    const p3 = points[(index + 2) % points.length];
    for (let step = 0; step < steps; step += 1) {
      samples.push(catmullRom(p0, p1, p2, p3, step / steps));
    }
  }

  let totalLength = 0;
  const cumulative = [0];
  for (let index = 0; index < samples.length; index += 1) {
    const next = samples[(index + 1) % samples.length];
    const current = samples[index];
    totalLength += Math.hypot(next.x - current.x, next.y - current.y);
    cumulative.push(totalLength);
  }
  const geometry = { samples, cumulative, totalLength };
  sampleCache.set(trackKey, geometry);
  return geometry;
}

/** Get a point and its tangent/normal at a normalized position on the loop. */
export function getTrackPose(trackKey = 'coast', progress = 0, lateralOffset = 0) {
  const { samples, cumulative, totalLength } = getTrackSamples(trackKey);
  const target = clamp01(((progress % 1) + 1) % 1) * totalLength;
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid + 1] < target) low = mid + 1;
    else high = mid;
  }
  const index = Math.min(samples.length - 1, low);
  const a = samples[index];
  const b = samples[(index + 1) % samples.length];
  const segmentLength = Math.max(0.0001, cumulative[index + 1] - cumulative[index]);
  const blend = clamp01((target - cumulative[index]) / segmentLength);
  const tangentLength = Math.max(0.0001, Math.hypot(b.x - a.x, b.y - a.y));
  const tangent = { x: (b.x - a.x) / tangentLength, y: (b.y - a.y) / tangentLength };
  const normal = { x: -tangent.y, y: tangent.x };
  return {
    x: a.x + (b.x - a.x) * blend + normal.x * lateralOffset,
    y: a.y + (b.y - a.y) * blend + normal.y * lateralOffset,
    tangent,
    normal,
    angle: Math.atan2(tangent.y, tangent.x) + Math.PI / 2,
  };
}

export function getTrackPolyline(trackKey = 'coast') {
  return getTrackSamples(trackKey).samples.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}
