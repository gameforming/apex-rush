import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createRaceState, RACE_DISTANCE, stepRacePhysics } from '../src/racing/physics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 3001);
const rooms = new Map();
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function roomCode() {
  let code;
  do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
  return code;
}
function boundedStats(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const number = (key, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(source[key])) ? Number(source[key]) : fallback));
  return {
    topSpeed: number('topSpeed', 182, 80, 400),
    acceleration: number('acceleration', 55, 20, 120),
    handling: number('handling', 57, 20, 120),
    braking: number('braking', 58, 40, 130),
    grip: number('grip', 80, 25, 160),
    downforce: number('downforce', 50, 0, 150),
  };
}
function safePlayerName(value) {
  const normalized = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18);
  return normalized || 'Racer';
}
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    trackKey: room.trackKey,
    hostId: room.hostId,
    players: [...room.players.values()].map((player) => ({
      id: player.id, name: player.name, ready: true,
      distance: Math.round(player.state.distance), speed: Math.round(player.state.speed * 3.6),
      finished: Boolean(player.finishTime), place: player.place || null,
    })),
  };
}
function broadcast(room, payload) {
  for (const player of room.players.values()) send(player.ws, payload);
}
function updateRoom(room) {
  broadcast(room, { type: 'room_update', room: publicRoom(room) });
}
function cleanupRoom(room) {
  if (room.timer) clearInterval(room.timer);
  if (room.countdownTimer) clearTimeout(room.countdownTimer);
  rooms.delete(room.code);
}
function finishRoomIfDone(room) {
  const players = [...room.players.values()];
  if (!players.length || players.some((p) => !p.finishTime && !p.disconnected)) return;
  const ranking = players.filter((p) => p.finishTime).sort((a, b) => a.finishTime - b.finishTime);
  ranking.forEach((p, i) => { p.place = i + 1; });
  room.status = 'finished';
  if (room.timer) clearInterval(room.timer);
  broadcast(room, {
    type: 'race_finished',
    ranking: ranking.map((p) => ({ id: p.id, name: p.name, time: Number(p.finishTime.toFixed(2)), place: p.place })),
    room: publicRoom(room),
  });
  updateRoom(room);
  setTimeout(() => cleanupRoom(room), 60000).unref?.();
}
function startRace(room, player) {
  if (room.hostId !== player.id || room.status !== 'lobby') return send(player.ws, { type: 'error', message: 'Alleen de host kan de race starten.' });
  if (room.players.size < 2) return send(player.ws, { type: 'error', message: 'Je hebt minstens twee racers nodig om online te starten.' });
  room.status = 'countdown';
  broadcast(room, { type: 'race_countdown', seconds: 3, room: publicRoom(room) });
  room.countdownTimer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.status = 'racing';
    room.startedAt = Date.now();
    for (const racer of room.players.values()) {
      racer.state = createRaceState();
      racer.controls = { throttle: 0, brake: 0, steering: 0 };
      racer.finishTime = null;
      racer.place = null;
    }
    broadcast(room, { type: 'race_started', room: publicRoom(room), distance: RACE_DISTANCE });
    let last = Date.now();
    room.timer = setInterval(() => {
      if (room.status !== 'racing') return;
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      for (const racer of room.players.values()) {
        if (racer.finishTime || racer.disconnected) continue;
        racer.state = stepRacePhysics(racer.state, racer.controls, racer.stats, room.trackKey, dt);
        if (racer.state.finished) racer.finishTime = (now - room.startedAt) / 1000;
      }
      const snapshot = {
        type: 'race_state',
        players: [...room.players.values()].map((racer) => ({
          id: racer.id, name: racer.name, distance: Math.round(racer.state.distance),
          speed: Math.round(racer.state.speed * 3.6), lane: Number(racer.state.lane.toFixed(3)),
          elapsed: Number(racer.state.elapsed.toFixed(2)), finished: Boolean(racer.finishTime),
        })),
      };
      broadcast(room, snapshot);
      finishRoomIfDone(room);
    }, 50);
    updateRoom(room);
  }, 3000);
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, multiplayer: true }));
  }
  if (req.url?.startsWith('/ws')) return res.writeHead(426).end('WebSocket upgrade required');
  try {
    const requested = decodeURIComponent((req.url || '/').split('?')[0]);
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    let target = path.resolve(dist, relative);
    if (target !== dist && !target.startsWith(dist + path.sep)) throw new Error('Invalid path');
    try { await stat(target); } catch {
      if (!path.extname(relative)) target = path.join(dist, 'index.html');
      else throw new Error('Not found');
    }
    const content = await readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream', 'cache-control': path.basename(target) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const player = {
    id: randomBytes(8).toString('hex'), name: 'Racer', ws, roomCode: null,
    stats: boundedStats(), state: createRaceState(), controls: { throttle: 0, brake: 0, steering: 0 },
    finishTime: null, place: null, disconnected: false, lastInputAt: 0,
  };
  send(ws, { type: 'connected', playerId: player.id, mode: 'server-authoritative-physics' });

  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', message: 'Ongeldig bericht.' }); }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return send(ws, { type: 'error', message: 'Ongeldig bericht.' });
    if (message.type === 'room_create') {
      if (player.roomCode) return send(ws, { type: 'error', message: 'Je zit al in een room.' });
      const code = roomCode();
      const room = { code, hostId: player.id, trackKey: ['coast', 'mountain', 'desert'].includes(message.trackKey) ? message.trackKey : 'coast', status: 'lobby', players: new Map(), timer: null, countdownTimer: null };
      player.name = safePlayerName(message.playerName);
      player.stats = boundedStats(message.stats);
      player.roomCode = code;
      room.players.set(player.id, player);
      rooms.set(code, room);
      send(ws, { type: 'room_created', room: publicRoom(room), playerId: player.id });
      updateRoom(room);
      return;
    }
    if (message.type === 'room_join') {
      const code = String(message.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.status !== 'lobby') return send(ws, { type: 'error', message: 'Deze room bestaat niet of de race is al gestart.' });
      if (room.players.size >= 4) return send(ws, { type: 'error', message: 'Deze race zit vol (maximaal vier racers).' });
      if (message.trackKey && message.trackKey !== room.trackKey) return send(ws, { type: 'error', message: `Deze room rijdt op ${room.trackKey}. Kies hetzelfde circuit en join opnieuw.` });
      if (player.roomCode) return send(ws, { type: 'error', message: 'Je zit al in een room.' });
      player.name = safePlayerName(message.playerName);
      player.stats = boundedStats(message.stats);
      player.roomCode = code;
      room.players.set(player.id, player);
      send(ws, { type: 'room_joined', room: publicRoom(room), playerId: player.id });
      updateRoom(room);
      return;
    }
    const room = player.roomCode ? rooms.get(player.roomCode) : null;
    if (message.type === 'room_leave') {
      if (room) {
        room.players.delete(player.id);
        player.roomCode = null;
        if (!room.players.size) cleanupRoom(room);
        else {
          if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
          updateRoom(room);
        }
      }
      return send(ws, { type: 'room_left' });
    }
    if (!room) return send(ws, { type: 'error', message: 'Je zit niet in een race-room.' });
    if (message.type === 'race_start') return startRace(room, player);
    if (message.type === 'race_input' && room.status === 'racing' && !player.finishTime) {
      const now = Date.now();
      if (now - player.lastInputAt < 20) return;
      player.lastInputAt = now;
      player.controls = {
        throttle: Math.max(0, Math.min(1, Number(message.controls?.throttle) || 0)),
        brake: Math.max(0, Math.min(1, Number(message.controls?.brake) || 0)),
        steering: Math.max(-1, Math.min(1, Number(message.controls?.steering) || 0)),
      };
    }
  });

  ws.on('close', () => {
    const room = player.roomCode ? rooms.get(player.roomCode) : null;
    if (!room) return;
    player.disconnected = true;
    player.finishTime = null;
    room.players.delete(player.id);
    if (!room.players.size) cleanupRoom(room);
    else {
      if (room.hostId === player.id && room.status === 'lobby') room.hostId = room.players.keys().next().value;
      updateRoom(room);
      if (room.status === 'racing') finishRoomIfDone(room);
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Apex Rush server listening on ${port}`);
});
