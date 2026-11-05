export const TIRE_TYPES = {
  basic: {
    name: 'Street Basic',
    rarity: 'COMMON',
    color: 'silver',
    price: 250,
    grip: 2,
    speed: 0,
    wear: 1,
    description: 'Betrouwbare allround straatband.',
    terrain: 'Asfalt',
  },
  medium: {
    name: 'Sport Medium',
    rarity: 'RARE',
    color: 'blue',
    price: 900,
    grip: 7,
    speed: 3,
    wear: 1,
    description: 'Meer grip zonder veel topsnelheid te verliezen.',
    terrain: 'Asfalt',
  },
  soft: {
    name: 'Racing Soft',
    rarity: 'EPIC',
    color: 'purple',
    price: 1450,
    grip: 12,
    speed: 9,
    wear: 2,
    description: 'Superveel snelheid en grip. Slijt extra hard.',
    terrain: 'Asfalt',
  },
  allterrain: {
    name: 'All-Terrain X',
    rarity: 'LEGENDARY',
    color: 'gold',
    price: 1900,
    grip: 10,
    speed: 2,
    wear: 1,
    description: 'Legendarische grip op ieder terrein.',
    terrain: 'Elk terrein',
  },
};

export const UPGRADE_PARTS = {
  engine: {
    name: 'Motor',
    icon: '⚡',
    costs: [2000, 7000, 18000, 42000],
    descriptions: ['Betere acceleratie', 'High-flow turbo', 'Race-engine internals', 'Forged competition block'],
    detail: 'Meer vermogen en hogere topsnelheid.',
  },
  gearbox: {
    name: 'Versnellingsbak',
    icon: '⚙',
    costs: [1500, 5200, 14000],
    descriptions: ['Snellere schakels', 'Close-ratio gearing', 'Sequential race box'],
    detail: 'Sneller uit bochten en betere acceleratie.',
  },
  brakes: {
    name: 'Remmen',
    icon: '◉',
    costs: [1200, 4500, 11000],
    descriptions: ['Sport remblokken', 'Geventileerde schijven', 'Carbon ceramic kit'],
    detail: 'Meer controle bij het insturen.',
  },
  suspension: {
    name: 'Ophanging',
    icon: '↕',
    costs: [1000, 3800, 10000],
    descriptions: ['Sportveren', 'Coilover set', 'Adaptive race suspension'],
    detail: 'Meer grip en stabiliteit in bochten.',
  },
};

export const CAR_CATALOG = [
  { key: 'starter', name: 'Nova R1', class: 'STREET', price: 0, power: 54, handling: 57, topSpeed: 182, image: '/assets/cars/nova-r1.svg', color: 'orange', tagline: 'Jouw eerste stap naar de grid.' },
  { key: 'coupe', name: 'Vortex S', class: 'SPORT', price: 18000, power: 68, handling: 65, topSpeed: 226, image: '/assets/cars/vortex-s.svg', color: 'blue', tagline: 'Licht, scherp en gebouwd voor bochten.' },
  { key: 'rally', name: 'Rally XR', class: 'RALLY', price: 32000, power: 64, handling: 78, topSpeed: 205, image: '/assets/cars/rally-xr.svg', color: 'green', tagline: 'Grip waar het asfalt ophoudt.' },
  { key: 'gt', name: 'Apex GT-R', class: 'SUPER', price: 54000, power: 82, handling: 72, topSpeed: 286, image: '/assets/cars/apex-gtr.svg', color: 'red', tagline: 'Pure snelheid. Geen excuses.' },
  { key: 'hyper', name: 'Zenith X', class: 'HYPER', price: 89000, power: 96, handling: 84, topSpeed: 338, image: '/assets/cars/zenith-x.svg', color: 'purple', tagline: 'Het absolute topsegment.' },
];

export const TRACKS = [
  { key: 'coast', name: 'Coastal Run', type: 'asphalt', label: 'Asfalt', length: '4.2 km', difficulty: 'NORMAAL', description: 'Lange rechte stukken langs de kust.', icon: '🌅' },
  { key: 'mountain', name: 'Mountain Pass', type: 'mixed', label: 'Gemengd', length: '6.8 km', difficulty: 'MOEILIJK', description: 'Technische bochten en wisselend wegdek.', icon: '⛰️' },
  { key: 'desert', name: 'Dust Valley', type: 'offroad', label: 'Off-road', length: '5.1 km', difficulty: 'EXPERT', description: 'Los zand, sprongen en ruige ondergrond.', icon: '🏜️' },
];

export function createCar(key = 'starter', id = globalThis.crypto?.randomUUID?.() || `car-${Date.now()}`) {
  const model = CAR_CATALOG.find((car) => car.key === key) || CAR_CATALOG[0];
  return {
    id,
    key,
    name: model.name,
    upgrades: { engine: 0, gearbox: 0, brakes: 0, suspension: 0 },
    acquiredAt: Date.now(),
  };
}

export function initialState() {
  const car = createCar('starter', 'car-starter');
  return {
    version: 1,
    credits: 12000,
    xp: 0,
    races: 0,
    wins: 0,
    crates: 1,
    cars: [car],
    activeCarId: car.id,
    tires: { basic: 3, medium: 0, soft: 0, allterrain: 0 },
    selectedTire: 'basic',
    raceLog: [],
    shopPurchases: {},
  };
}

export function loadLocalState() {
  try {
    const raw = localStorage.getItem('apex-rush-save');
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) return initialState();
    const fallback = initialState();
    return {
      ...fallback,
      ...parsed,
      tires: { ...fallback.tires, ...(parsed.tires || {}) },
      shopPurchases: parsed.shopPurchases || {},
      cars: Array.isArray(parsed.cars) && parsed.cars.length ? parsed.cars : fallback.cars,
    };
  } catch {
    return initialState();
  }
}

export function saveLocalState(state) {
  try {
    localStorage.setItem('apex-rush-save', JSON.stringify(state));
  } catch (error) {
    console.warn('Opslaan van de lokale game-save is niet gelukt.', error);
  }
}

function seededRandom(seed) {
  let value = Math.sin(seed * 9301 + 49297) * 49297;
  value -= Math.floor(value);
  return value;
}

export function createShopOffers(hourKey = Math.floor(Date.now() / 3600000)) {
  const offers = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const roll = seededRandom(hourKey * 17 + slot * 97 + 13);
    let type = 'basic';
    if (roll > 0.985) type = 'allterrain';
    else if (roll > 0.95) type = 'soft';
    else if (roll > 0.88) type = 'medium';
    const data = TIRE_TYPES[type];
    offers.push({
      id: `${hourKey}-${slot}`,
      slot,
      type,
      price: data.price,
      packSize: 3,
    });
  }
  return offers;
}

export function getCarModel(car) {
  return CAR_CATALOG.find((model) => model.key === car?.key) || CAR_CATALOG[0];
}

export function getCarStats(car) {
  const model = getCarModel(car);
  const upgrades = car?.upgrades || {};
  const engine = upgrades.engine || 0;
  const gearbox = upgrades.gearbox || 0;
  const brakes = upgrades.brakes || 0;
  const suspension = upgrades.suspension || 0;
  return {
    power: model.power + engine * 9 + gearbox * 2,
    handling: model.handling + brakes * 2 + suspension * 5,
    topSpeed: model.topSpeed + engine * 11 + gearbox * 8,
    acceleration: Math.min(99, Math.round(38 + engine * 10 + gearbox * 7 + model.power * 0.25)),
  };
}

export function runRace(car, tireType, trackKey = 'coast') {
  const stats = getCarStats(car);
  const tire = TIRE_TYPES[tireType] || TIRE_TYPES.basic;
  const track = TRACKS.find((item) => item.key === trackKey) || TRACKS[0];
  let tireBonus = tire.grip * 1.35 + tire.speed * 1.2;
  if (track.type === 'offroad') tireBonus += tireType === 'allterrain' ? 18 : tireType === 'basic' ? -7 : -12;
  if (track.type === 'mixed') tireBonus += tireType === 'allterrain' ? 10 : 0;
  if (track.type === 'asphalt' && tireType === 'soft') tireBonus += 8;
  const score = stats.power * 0.28 + stats.handling * 0.28 + stats.acceleration * 0.18 + tireBonus + Math.random() * 32;
  let place = 4;
  if (score >= 88) place = 1;
  else if (score >= 76) place = 2;
  else if (score >= 64) place = 3;
  const rewards = { 1: 2600, 2: 1750, 3: 1150, 4: 750 };
  const prize = rewards[place] + Math.round(Math.random() * 260);
  const crateChance = place === 1 ? 0.48 : place === 2 ? 0.3 : 0.18;
  return {
    id: globalThis.crypto?.randomUUID?.() || `race-${Date.now()}`,
    place,
    prize,
    xp: [0, 150, 105, 70, 40][place],
    crate: Math.random() < crateChance,
    tireType,
    track: track.name,
    time: new Date().toISOString(),
    score: Math.round(score),
  };
}

export function formatCredits(value) {
  return new Intl.NumberFormat('nl-NL').format(value || 0);
}

export function getShopCountdown(now = Date.now()) {
  const nextHour = (Math.floor(now / 3600000) + 1) * 3600000;
  const remaining = Math.max(0, nextHour - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getLevel(xp) {
  const level = Math.floor((xp || 0) / 500) + 1;
  return { level, current: (xp || 0) % 500, required: 500, progress: ((xp || 0) % 500) / 5 };
}
