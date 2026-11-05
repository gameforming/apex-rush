import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LAP_DISTANCE, RACE_DISTANCE, createRaceState, roadCurve, stepRacePhysics } from './physics.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function drawCar(ctx, x, y, scale, color, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(0, 9, 24, 39, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#080d12';
  ctx.fillRect(-22, -24, 7, 17); ctx.fillRect(15, -24, 7, 17);
  ctx.fillRect(-22, 10, 7, 17); ctx.fillRect(15, 10, 7, 17);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-15, 33); ctx.lineTo(-19, 16); ctx.lineTo(-17, -19); ctx.lineTo(-11, -34);
  ctx.quadraticCurveTo(0, -41, 11, -34); ctx.lineTo(17, -19); ctx.lineTo(19, 16); ctx.lineTo(15, 33); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#182631';
  ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-9, -27); ctx.quadraticCurveTo(0, -32, 9, -27); ctx.lineTo(12, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9baab4'; ctx.fillRect(-12, 19, 24, 3);
  ctx.fillStyle = '#ffe2a0'; ctx.fillRect(-14, -34, 7, 3); ctx.fillRect(7, -34, 7, 3);
  ctx.restore();
}

function drawScene(canvas, state, trackKey, speed, elapsed, otherPlayers = [], playerId = null) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width; const h = rect.height;
  const horizon = h * 0.31;
  const palette = trackKey === 'desert'
    ? { sky: '#bd8a61', far: '#745c48', near: '#454238', road: '#353a3d', curb: '#e0b989' }
    : trackKey === 'mountain'
      ? { sky: '#657e82', far: '#344c4c', near: '#253936', road: '#343b40', curb: '#d0d5cb' }
      : { sky: '#63818c', far: '#39565b', near: '#294449', road: '#353d43', curb: '#d9d9ce' };
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, palette.sky); sky.addColorStop(1, '#1e3036');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = palette.far;
  ctx.beginPath(); ctx.moveTo(0, horizon + 25); ctx.lineTo(w * .12, horizon - 20); ctx.lineTo(w * .25, horizon + 12); ctx.lineTo(w * .42, horizon - 42); ctx.lineTo(w * .56, horizon + 8); ctx.lineTo(w * .76, horizon - 25); ctx.lineTo(w, horizon + 12); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  ctx.fillStyle = palette.near; ctx.fillRect(0, horizon + 22, w, h - horizon);

  const segments = 70;
  const road = [];
  for (let i = 0; i <= segments; i += 1) {
    const depth = i / segments;
    const perspective = depth ** 1.55;
    const worldAhead = state.distance + (1 - depth) * 310;
    const curve = roadCurve(worldAhead, trackKey);
    const center = w / 2 + curve * (1 - depth) * w * .48 - state.lane * w * .05 * depth;
    const half = 7 + perspective * w * .43;
    const y = horizon + depth * (h - horizon + 25);
    road.push({ center, half, y, depth, perspective });
  }
  for (let i = 0; i < segments; i += 1) {
    const a = road[i]; const b = road[i + 1];
    ctx.fillStyle = (Math.floor((state.distance / 22) + i / 3) % 2) ? '#3d4647' : '#35403f';
    ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(w, a.y); ctx.lineTo(w, b.y); ctx.lineTo(0, b.y); ctx.fill();
    ctx.fillStyle = '#b6b5a4';
    ctx.beginPath(); ctx.moveTo(a.center - a.half - 7 * a.perspective, a.y); ctx.lineTo(a.center - a.half, a.y); ctx.lineTo(b.center - b.half, b.y); ctx.lineTo(b.center - b.half - 7 * b.perspective, b.y); ctx.fill();
    ctx.beginPath(); ctx.moveTo(a.center + a.half, a.y); ctx.lineTo(a.center + a.half + 7 * a.perspective, a.y); ctx.lineTo(b.center + b.half + 7 * b.perspective, b.y); ctx.lineTo(b.center + b.half, b.y); ctx.fill();
    ctx.fillStyle = palette.road;
    ctx.beginPath(); ctx.moveTo(a.center - a.half, a.y); ctx.lineTo(a.center + a.half, a.y); ctx.lineTo(b.center + b.half, b.y); ctx.lineTo(b.center - b.half, b.y); ctx.fill();
    if (Math.floor((state.distance / 34) + i / 4) % 2 === 0) {
      const markWidth = 2 + b.perspective * 5;
      ctx.fillStyle = 'rgba(232,235,222,.58)';
      ctx.beginPath(); ctx.moveTo(a.center - markWidth / 2, a.y); ctx.lineTo(a.center + markWidth / 2, a.y); ctx.lineTo(b.center + markWidth / 2, b.y); ctx.lineTo(b.center - markWidth / 2, b.y); ctx.fill();
    }
  }
  // Track-side boards and approaching traffic give the driver useful visual depth.
  for (let i = 0; i < 7; i += 1) {
    const depth = ((i / 7 + (state.distance % 120) / 120) % 1);
    const point = road[Math.min(segments, Math.floor(depth * segments))];
    if (!point) continue;
    const side = i % 2 ? -1 : 1;
    const x = point.center + side * (point.half + 18 * point.perspective + 6);
    const y = point.y;
    const size = 3 + point.perspective * 14;
    ctx.fillStyle = '#d8ddd7'; ctx.fillRect(x - size / 2, y - size * 2, size, size * 2);
    ctx.fillStyle = '#ff713d'; ctx.fillRect(x - size / 2, y - size * 2, size, size * .55);
  }
  const playerCurve = roadCurve(state.distance, trackKey);
  const rivals = otherPlayers.length ? otherPlayers.filter((player) => player.id !== playerId) : [
    { id: 'ai-1', distance: state.distance + 210 + Math.sin(elapsed * .42) * 38, lane: -.34 },
    { id: 'ai-2', distance: state.distance - 115 + Math.sin(elapsed * .31 + 1) * 24, lane: .32 },
  ];
  rivals.forEach((rival, index) => {
    const delta = (rival.distance || 0) - state.distance;
    if (delta < -300 || delta > 460) return;
    const perspective = clamp(1 - Math.max(0, delta) / 480, .15, 1);
    const y = h * .79 - delta * .47;
    const curveAhead = roadCurve(state.distance + delta, trackKey);
    const x = w / 2 + curveAhead * w * .23 + (rival.lane || 0) * w * .16;
    drawCar(ctx, x, clamp(y, horizon + 22, h * .78), clamp(w / 560, .72, 1.22) * (.28 + perspective * .38), index % 2 ? '#4e9acb' : '#aeb9bf');
  });
  const playerX = w / 2 + state.lane * w * .19;
  drawCar(ctx, playerX, h * .79, clamp(w / 560, .72, 1.22), '#f36b3d', clamp(-playerCurve * .22 - state.lateralVelocity * .1, -.22, .22));
  const speedLines = clamp(speed / 235, 0, 1);
  if (speedLines > .68) {
    ctx.strokeStyle = `rgba(255,255,255,${(speedLines - .68) * .18})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i += 1) {
      const x = (i / 9) * w;
      ctx.beginPath(); ctx.moveTo(x, h * .48); ctx.lineTo(x + (i - 4) * 8, h * .69); ctx.stroke();
    }
  }
  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * .1, w / 2, h / 2, h * .75);
  vignette.addColorStop(.55, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
}

export default function DrivingRace({ car, performance, trackKey, trackName, onFinish, onExit, multiplayer = false, multiplayerSnapshot = [], playerId, onControls }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(createRaceState());
  const controlsRef = useRef({ throttle: 0, brake: 0, steering: 0 });
  const finishRef = useRef(onFinish);
  const controlsCallbackRef = useRef(onControls);
  const snapshotRef = useRef(multiplayerSnapshot);
  const playerIdRef = useRef(playerId);
  snapshotRef.current = multiplayerSnapshot;
  playerIdRef.current = playerId;
  const [telemetry, setTelemetry] = useState({ speed: 0, distance: 0, elapsed: 0, lane: 0 });
  const [keyHelp, setKeyHelp] = useState(true);
  finishRef.current = onFinish;
  controlsCallbackRef.current = onControls;

  const setControl = useCallback((key, value) => {
    controlsRef.current = { ...controlsRef.current, [key]: value };
  }, []);

  useEffect(() => {
    if (!multiplayer) return;
    const local = multiplayerSnapshot.find((item) => item.id === playerId);
    if (local) {
      stateRef.current = {
        ...stateRef.current,
        distance: local.distance || 0,
        speed: (local.speed || 0) / 3.6,
        lane: local.lane || 0,
        elapsed: local.elapsed || 0,
        finished: Boolean(local.finished),
      };
    }
  }, [multiplayer, multiplayerSnapshot, playerId]);

  useEffect(() => {
    if (!multiplayer) return undefined;
    const id = window.setInterval(() => controlsCallbackRef.current?.({ ...controlsRef.current }), 50);
    return () => window.clearInterval(id);
  }, [multiplayer]);

  useEffect(() => {
    const keys = new Set();
    const sync = () => {
      setControl('throttle', keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
      setControl('brake', keys.has('ArrowDown') || keys.has('s') || keys.has(' ') ? 1 : 0);
      setControl('steering', (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0));
    };
    const down = (event) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
      keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key); sync(); setKeyHelp(false);
    };
    const up = (event) => { keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key); sync(); };
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    const blur = () => { keys.clear(); sync(); };
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [setControl]);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    let hudFrame = 0;
    let ended = false;
    const tick = (now) => {
      if (ended) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let next = stateRef.current;
      if (!multiplayer) {
        next = stepRacePhysics(next, controlsRef.current, performance, trackKey, dt);
        stateRef.current = next;
      }
      const speed = next.speed * 3.6;
      drawScene(canvasRef.current, next, trackKey, speed, next.elapsed, snapshotRef.current, playerIdRef.current);
      hudFrame += 1;
      if (hudFrame % 6 === 0) setTelemetry({ speed: Math.round(speed), distance: next.distance, elapsed: next.elapsed, lane: next.lane });
      if (!multiplayer && next.finished) {
        ended = true;
        finishRef.current?.({
          duration: next.elapsed,
          maxSpeed: next.maxSpeed,
          averageSpeed: next.speedSamples ? next.speedIntegral / next.speedSamples : 0,
          offroadSeconds: next.offroadSeconds,
        });
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => { ended = true; window.cancelAnimationFrame(frame); };
  }, [performance, trackKey, multiplayer]);

  const currentLap = Math.min(3, Math.floor(telemetry.distance / LAP_DISTANCE) + 1);
  const percent = Math.min(100, (telemetry.distance / RACE_DISTANCE) * 100);
  const press = (key, value) => (event) => { event.preventDefault(); setControl(key, value); setKeyHelp(false); };
  const release = (key) => (event) => { event.preventDefault(); setControl(key, 0); };

  return (
    <div className="drive-overlay">
      <section className="drive-panel" aria-label="Actieve race">
        <header className="drive-header">
          <div><span className="drive-live-dot" /> LIVE DRIVER / {trackName.toUpperCase()}</div>
          <div className="drive-header-right"><span>APEX RUSH • {multiplayer ? 'SERVER MULTIPLAYER' : 'SOLO'}</span><button onClick={onExit}>RACE VERLATEN ×</button></div>
        </header>
        <div className="drive-hud">
          <div><small>SPEED</small><strong>{telemetry.speed}<i>KM/H</i></strong></div>
          <div><small>LAP</small><strong>{currentLap}<i>/ 3</i></strong></div>
          <div><small>TIME</small><strong>{telemetry.elapsed.toFixed(1)}<i>SEC</i></strong></div>
          <div><small>TOP SPEED SETUP</small><strong>{performance.topSpeed}<i>KM/H</i></strong></div>
        </div>
        <div className="drive-canvas-wrap"><canvas ref={canvasRef} className="drive-canvas" /><div className="drive-speed-ring"><span>GEAR</span><strong>{telemetry.speed < 35 ? 1 : telemetry.speed < 75 ? 2 : telemetry.speed < 115 ? 3 : telemetry.speed < 160 ? 4 : telemetry.speed < 210 ? 5 : 6}</strong></div><div className="drive-distance"><span>RACE DISTANCE</span><b>{Math.round(telemetry.distance).toLocaleString('nl-NL')} / 2.400 M</b><div><i style={{ width: `${percent}%` }} /></div></div></div>
        {keyHelp && <div className="drive-help"><b>BESTURING</b><span>W / ↑ Gas</span><span>S / ↓ Rem</span><span>A / ← Links</span><span>D / → Rechts</span><span>Houd gas vast en stuur door de bochten.</span></div>}
        <div className="drive-controls">
          <div className="drive-steering"><button onPointerDown={press('steering', -1)} onPointerUp={release('steering')} onPointerLeave={release('steering')} onContextMenu={(e) => e.preventDefault()}>←</button><button onPointerDown={press('steering', 1)} onPointerUp={release('steering')} onPointerLeave={release('steering')} onContextMenu={(e) => e.preventDefault()}>→</button><small>STUREN</small></div>
          <div className="drive-pedals"><button className="brake-pedal" onPointerDown={press('brake', 1)} onPointerUp={release('brake')} onPointerLeave={release('brake')}>REM</button><button className="gas-pedal" onPointerDown={press('throttle', 1)} onPointerUp={release('throttle')} onPointerLeave={release('throttle')}>GAS</button></div>
        </div>
        <footer className="drive-footer"><span>CAR / {car.name.toUpperCase()}</span><span>GRIP {performance.grip} • DOWNFORCE {performance.downforce}</span><span>{multiplayer ? `${multiplayerSnapshot.length} ONLINE RACERS / SERVER SYNC` : '3 LAPS / FINISH AT 2.400 M'}</span></footer>
      </section>
    </div>
  );
}
