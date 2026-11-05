import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LAP_DISTANCE, RACE_DISTANCE, createRaceState, stepRacePhysics } from './physics.js';
import { TRACK_HEIGHT, TRACK_WIDTH, getTrackPose, getTrackSamples } from './track-layouts.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const lapProgress = (distance) => ((distance % LAP_DISTANCE) + LAP_DISTANCE) % LAP_DISTANCE / LAP_DISTANCE;

function traceCircuit(ctx, samples) {
  ctx.beginPath();
  samples.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function drawCar(ctx, x, y, angle, color, accent = '#f4f0e7', scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // Soft shadow, slick tyres and a compact top-down touring-car silhouette.
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.beginPath(); ctx.ellipse(2, 5, 19, 31, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#080c10';
  [[-15, -20], [9, -20], [-15, 10], [9, 10]].forEach(([wx, wy]) => {
    ctx.beginPath(); ctx.roundRect(wx, wy, 7, 15, 2); ctx.fill();
    ctx.fillStyle = '#59636a'; ctx.fillRect(wx + 2, wy + 3, 3, 8);
    ctx.fillStyle = '#080c10';
  });

  ctx.fillStyle = '#111920';
  ctx.beginPath();
  ctx.moveTo(-11, 28); ctx.lineTo(-15, 17); ctx.lineTo(-15, -17);
  ctx.lineTo(-10, -28); ctx.quadraticCurveTo(0, -33, 10, -28);
  ctx.lineTo(15, -17); ctx.lineTo(15, 17); ctx.lineTo(11, 28);
  ctx.quadraticCurveTo(0, 33, -11, 28); ctx.fill();

  const body = ctx.createLinearGradient(-15, 0, 15, 0);
  body.addColorStop(0, '#222b32'); body.addColorStop(.25, color); body.addColorStop(.78, color); body.addColorStop(1, '#1d252b');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-10, 27); ctx.lineTo(-13, 17); ctx.lineTo(-12, -17);
  ctx.lineTo(-8, -26); ctx.quadraticCurveTo(0, -30, 8, -26);
  ctx.lineTo(12, -17); ctx.lineTo(13, 17); ctx.lineTo(10, 27);
  ctx.quadraticCurveTo(0, 31, -10, 27); ctx.fill();

  // Roof, windshield, rear glass and racing stripe.
  ctx.fillStyle = '#101d29';
  ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-7, -20); ctx.quadraticCurveTo(0, -24, 7, -20); ctx.lineTo(9, -6); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(150,190,208,.58)';
  ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(-6, -18); ctx.quadraticCurveTo(0, -21, 6, -18); ctx.lineTo(7, -9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(9,18,26,.82)';
  ctx.beginPath(); ctx.moveTo(-6, 11); ctx.lineTo(6, 11); ctx.lineTo(5, 19); ctx.lineTo(-5, 19); ctx.closePath(); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(-2, -24, 4, 42);
  ctx.fillStyle = '#fff4c9'; ctx.fillRect(-10, -28, 5, 2); ctx.fillRect(5, -28, 5, 2);
  ctx.fillStyle = '#ff443e'; ctx.fillRect(-10, 26, 5, 2); ctx.fillRect(5, 26, 5, 2);
  ctx.restore();
}

function drawGrass(ctx, trackKey) {
  const colors = trackKey === 'desert'
    ? ['#8b704d', '#977952', '#806743']
    : trackKey === 'mountain'
      ? ['#52634b', '#5d704f', '#455942']
      : ['#31583f', '#386346', '#2d513a'];
  ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, TRACK_WIDTH, TRACK_HEIGHT);
  const band = ctx.createLinearGradient(0, 0, TRACK_WIDTH, TRACK_HEIGHT);
  band.addColorStop(0, 'rgba(255,255,255,.045)'); band.addColorStop(.5, 'rgba(0,0,0,.04)'); band.addColorStop(1, 'rgba(255,255,255,.025)');
  ctx.fillStyle = band; ctx.fillRect(0, 0, TRACK_WIDTH, TRACK_HEIGHT);
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 28; col += 1) {
      const seed = (row * 73 + col * 37 + (row * col * 13)) % 101;
      const x = col * 52 + (row % 2) * 19 + seed * .17;
      const y = row * 48 + (seed % 17);
      ctx.fillStyle = seed % 3 === 0 ? 'rgba(255,255,255,.045)' : 'rgba(9,22,15,.075)';
      ctx.beginPath(); ctx.arc(x, y, 1 + (seed % 3) * .45, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(225,235,204,.06)'; ctx.lineWidth = 1;
  for (let x = 20; x < TRACK_WIDTH; x += 110) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 55, TRACK_HEIGHT); ctx.stroke();
  }
}

function drawTrackside(ctx, trackKey) {
  const treePositions = trackKey === 'desert'
    ? [[45, 75], [55, 360], [300, 75], [570, 70], [1300, 90], [1335, 470], [730, 585], [60, 550]]
    : trackKey === 'mountain'
      ? [[45, 65], [45, 300], [320, 65], [620, 80], [1300, 90], [1340, 320], [1280, 540], [500, 580]]
      : [[45, 70], [55, 300], [360, 65], [620, 65], [1295, 75], [1345, 300], [1300, 520], [520, 585]];
  treePositions.forEach(([x, y], index) => {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 7, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = trackKey === 'desert' ? '#5d4b32' : '#1c3929';
    ctx.beginPath(); ctx.arc(x, y, 12 + (index % 3) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = trackKey === 'desert' ? '#a08b62' : '#52764a';
    ctx.beginPath(); ctx.arc(x - 4, y - 4, 7 + (index % 2) * 2, 0, Math.PI * 2); ctx.fill();
  });

  // Pit building and pit boxes alongside the start/finish straight.
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(190, 30, 325, 78);
  ctx.fillStyle = '#c8c8bf'; ctx.fillRect(190, 25, 325, 70);
  ctx.fillStyle = '#65727a'; ctx.fillRect(190, 25, 325, 12);
  for (let i = 0; i < 8; i += 1) {
    const x = 202 + i * 38;
    ctx.fillStyle = '#26343d'; ctx.fillRect(x, 48, 30, 31);
    ctx.fillStyle = i % 2 ? '#d7ddd9' : '#e16a45'; ctx.fillRect(x + 4, 53, 22, 3);
    ctx.fillStyle = '#0e151b'; ctx.fillRect(x + 4, 62, 22, 16);
  }
  ctx.fillStyle = '#1b252c'; ctx.fillRect(190, 91, 325, 6);
  ctx.fillStyle = 'rgba(242,246,232,.7)'; ctx.font = 'bold 9px Arial'; ctx.fillText('APEX RUSH / PIT LANE', 202, 18);

  // Grandstand opposite the infield.
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(785, 28, 190, 45);
  ctx.fillStyle = '#333e46'; ctx.fillRect(785, 23, 190, 40);
  for (let row = 0; row < 3; row += 1) {
    ctx.fillStyle = row % 2 ? '#87939a' : '#b5b9b2';
    ctx.fillRect(794, 29 + row * 9, 171, 5);
  }
  ctx.fillStyle = '#202a31'; ctx.fillRect(780, 62, 200, 8);
}

function drawStartFinish(ctx, pose) {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  const stripeCount = 14;
  const stripeWidth = 84 / stripeCount;
  for (let index = 0; index < stripeCount; index += 1) {
    ctx.fillStyle = index % 2 ? '#f1eee3' : '#151d23';
    ctx.fillRect(-42 + index * stripeWidth, -6, stripeWidth, 12);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
  ctx.strokeRect(-42, -6, 84, 12);
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
  const theme = trackKey === 'desert' ? '#806746' : trackKey === 'mountain' ? '#4e604b' : '#31583f';
  ctx.fillStyle = theme; ctx.fillRect(0, 0, w, h);

  const scale = Math.min((w - 24) / TRACK_WIDTH, (h - 20) / TRACK_HEIGHT);
  const offsetX = (w - TRACK_WIDTH * scale) / 2;
  const offsetY = (h - TRACK_HEIGHT * scale) / 2;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  drawGrass(ctx, trackKey);
  drawTrackside(ctx, trackKey);
  const { samples } = getTrackSamples(trackKey);

  traceCircuit(ctx, samples);
  ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 118; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  traceCircuit(ctx, samples);
  ctx.strokeStyle = '#d8d9d0'; ctx.lineWidth = 104; ctx.lineCap = 'butt'; ctx.stroke();
  traceCircuit(ctx, samples);
  ctx.strokeStyle = '#d84f43'; ctx.lineWidth = 104; ctx.setLineDash([25, 25]); ctx.lineDashOffset = elapsed * -11; ctx.stroke();
  ctx.setLineDash([]);
  traceCircuit(ctx, samples);
  ctx.strokeStyle = '#30383d'; ctx.lineWidth = 84; ctx.lineCap = 'round'; ctx.stroke();
  traceCircuit(ctx, samples);
  ctx.strokeStyle = 'rgba(15,22,27,.82)'; ctx.lineWidth = 2; ctx.stroke();
  traceCircuit(ctx, samples);
  ctx.strokeStyle = 'rgba(225,230,222,.42)'; ctx.lineWidth = 2; ctx.setLineDash([4, 21]); ctx.stroke(); ctx.setLineDash([]);

  // Corner boards and small marshal posts give the circuit scale and identity.
  const boardPositions = [[500, 325, '03'], [875, 105, '05'], [1095, 445, '07'], [650, 555, '09'], [190, 365, '11']];
  boardPositions.forEach(([x, y, label]) => {
    ctx.fillStyle = 'rgba(11,18,22,.78)'; ctx.fillRect(x - 13, y - 11, 26, 22);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.strokeRect(x - 13, y - 11, 26, 22);
    ctx.fillStyle = '#f5eee1'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y);
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  const startPose = getTrackPose(trackKey, 0);
  drawStartFinish(ctx, startPose);

  const rivals = otherPlayers.length
    ? otherPlayers.filter((player) => player.id !== playerId)
    : [
      { id: 'ai-1', name: 'RIVAL 01', distance: state.distance + 175, lane: -.28 },
      { id: 'ai-2', name: 'RIVAL 02', distance: state.distance - 115, lane: .3 },
      { id: 'ai-3', name: 'RIVAL 03', distance: state.distance + 355, lane: .12 },
    ];
  const rivalColors = ['#4b9dd2', '#d6d9dd', '#b18ad9', '#e6b64f'];
  rivals.forEach((rival, index) => {
    const progress = lapProgress(rival.distance || 0);
    const pose = getTrackPose(trackKey, progress, (rival.lane || 0) * 38);
    drawCar(ctx, pose.x, pose.y, pose.angle, rivalColors[index % rivalColors.length], '#e7edf0', .93);
  });

  const playerPose = getTrackPose(trackKey, lapProgress(state.distance), state.lane * 52);
  drawCar(ctx, playerPose.x, playerPose.y, playerPose.angle, '#ff713f', '#ffe5a6', 1.08);
  ctx.restore();

  // A small map legend is intentionally outside the transformed world.
  ctx.fillStyle = 'rgba(8,14,18,.72)'; ctx.fillRect(w - 126, 12, 112, 28);
  ctx.fillStyle = '#ff7548'; ctx.beginPath(); ctx.arc(w - 114, 26, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d6dde0'; ctx.font = 'bold 8px Arial'; ctx.fillText('YOU', w - 104, 29);
  ctx.fillStyle = '#7daed0'; ctx.beginPath(); ctx.arc(w - 69, 26, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d6dde0'; ctx.fillText('RIVALS', w - 59, 29);
  if (speed > 190) {
    ctx.fillStyle = `rgba(255,255,255,${clamp((speed - 190) / 700, .03, .12)})`;
    ctx.fillRect(0, 0, w, h);
  }
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
