import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAR_CATALOG,
  TIRE_TYPES,
  TRACKS,
  UPGRADE_PARTS,
  createCar,
  createShopOffers,
  formatCredits,
  getCarModel,
  getCarStats,
  getRacePerformance,
  finishDrivenRace,
  getLevel,
  getShopCountdown,
  loadLocalState,
  saveLocalState,
} from './game.js';
import { isSupabaseConfigured } from './supabase.js';
import DrivingRace from './racing/DrivingRace.jsx';
import { getRaceSocketUrl } from './racing/network.js';

const NAV_ITEMS = [
  { id: 'race', label: 'Race hub', icon: '◈' },
  { id: 'garage', label: 'Mijn garage', icon: '▰' },
  { id: 'workshop', label: 'Werkplaats', icon: '⚙' },
  { id: 'tires', label: 'Banden shop', icon: '◉' },
  { id: 'crates', label: 'Crates', icon: '▦' },
  { id: 'market', label: 'Marktplaats', icon: '⇄' },
];

const RARITY_LABELS = {
  basic: 'COMMON',
  medium: 'RARE',
  soft: 'EPIC',
  allterrain: 'LEGENDARY',
};

function Icon({ children, className = '' }) {
  return <span className={`icon ${className}`} aria-hidden="true">{children}</span>;
}

function Button({ children, onClick, variant = 'primary', disabled = false, className = '', type = 'button' }) {
  return (
    <button type={type} className={`btn btn-${variant} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}


function TireVisual({ type, small = false }) {
  return (
    <div className={`tire-visual tire-${type} ${small ? 'tire-small' : ''}`}>
      <div className="tire-ring"><div className="tire-hub"><span /></div></div>
    </div>
  );
}

function CarImage({ car, className = '' }) {
  const model = getCarModel(car);
  return <img className={`car-art car-${model.color} ${className}`} src={model.image} alt={model.name} />;
}

function App() {
  const [game, setGame] = useState(loadLocalState);
  const [tab, setTab] = useState('race');
  const [selectedTrack, setSelectedTrack] = useState('coast');
  const [raceResult, setRaceResult] = useState(null);
  const [raceInProgress, setRaceInProgress] = useState(false);
  const [raceSession, setRaceSession] = useState(null);
  const raceSessionRef = useRef(null);
  const socketRef = useRef(null);
  const onlinePlayerIdRef = useRef(null);
  const onlinePreparedRef = useRef(null);
  const [playerName, setPlayerName] = useState('Racer');
  const [joinCode, setJoinCode] = useState('');
  const [onlineRoom, setOnlineRoom] = useState(null);
  const [onlineSnapshot, setOnlineSnapshot] = useState([]);
  const [onlinePlayerId, setOnlinePlayerId] = useState(null);
  const [onlineMessage, setOnlineMessage] = useState('Maak een room of join met een code. Maximaal vier racers.');
  const [crateResult, setCrateResult] = useState(null);
  const [countdown, setCountdown] = useState(getShopCountdown());
  const [hourKey, setHourKey] = useState(Math.floor(Date.now() / 3600000));
  const [toast, setToast] = useState('');

  const activeCar = game.cars.find((car) => car.id === game.activeCarId) || game.cars[0];
  const activeModel = getCarModel(activeCar);
  const activeStats = getCarStats(activeCar);
  const level = getLevel(game.xp);
  const shopOffers = useMemo(() => createShopOffers(hourKey), [hourKey]);
  const selectedTireInfo = TIRE_TYPES[game.selectedTire] || TIRE_TYPES.basic;
  const selectedTrackData = TRACKS.find((track) => track.key === selectedTrack) || TRACKS[0];
  const raceSessionPerformance = useMemo(() => raceSession ? getRacePerformance(raceSession.car, raceSession.tireType, raceSession.trackKey) : null, [raceSession]);

  useEffect(() => saveLocalState(game), [game]);

  useEffect(() => () => { if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) socketRef.current.close(); }, []);

  useEffect(() => {
    const tick = () => {
      setCountdown(getShopCountdown());
      const nextHourKey = Math.floor(Date.now() / 3600000);
      setHourKey((current) => current === nextHourKey ? current : nextHourKey);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const notify = (message) => setToast(message);

  const applyRaceRewards = (result) => {
    setGame((current) => ({
      ...current,
      credits: current.credits + result.prize,
      xp: current.xp + result.xp,
      races: current.races + 1,
      wins: current.wins + (result.place === 1 ? 1 : 0),
      crates: current.crates + (result.crate ? 1 : 0),
      raceLog: [result, ...current.raceLog].slice(0, 8),
    }));
    setRaceInProgress(false);
    setRaceSession(null);
    raceSessionRef.current = null;
    setRaceResult(result);
  };

  const finishRace = (telemetry, serverPlace = null, serverTime = null) => {
    const session = raceSessionRef.current;
    if (!session) return;
    const result = finishDrivenRace(session.car, session.tireType, session.trackKey, serverTime ?? telemetry.duration, telemetry);
    if (serverPlace) {
      const rewards = { 1: 2600, 2: 1750, 3: 1150, 4: 750 };
      const sessionStats = getRacePerformance(session.car, session.tireType, session.trackKey);
      result.place = serverPlace;
      result.prize = rewards[serverPlace] + Math.round((sessionStats.handling + sessionStats.acceleration) * 0.8);
      result.xp = [0, 150, 105, 70, 40][serverPlace] || 40;
      result.score = Math.round(Math.max(0, 1000 - result.duration * 3 + sessionStats.handling));
    }
    applyRaceRewards(result);
  };

  const startRace = () => {
    if (raceInProgress) return;
    if ((game.tires[game.selectedTire] || 0) < 1) {
      notify('Je hebt geen sets van deze band meer. Kies een andere band of bezoek de shop.');
      setTab('tires');
      return;
    }
    const session = { car: activeCar, tireType: game.selectedTire, trackKey: selectedTrack, multiplayer: false };
    raceSessionRef.current = session;
    setRaceSession(session);
    setGame((current) => ({ ...current, tires: { ...current.tires, [current.selectedTire]: Math.max(0, (current.tires[current.selectedTire] || 0) - 1) } }));
    setRaceResult(null);
    setRaceInProgress(true);
  };

  const handleOnlineMessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'connected') { onlinePlayerIdRef.current = message.playerId; setOnlinePlayerId(message.playerId); }
    if (message.type === 'room_created' || message.type === 'room_joined') {
      setOnlineRoom(message.room);
      onlinePlayerIdRef.current = message.playerId;
      setOnlinePlayerId(message.playerId);
      setOnlineMessage(`Room ${message.room.code} is klaar. Deel de code met je vrienden.`);
      setOnlineSnapshot([]);
    }
    if (message.type === 'room_update') setOnlineRoom(message.room);
    if (message.type === 'race_countdown') {
      setOnlineRoom(message.room);
      setOnlineMessage('Race start over 3 seconden. Maak je klaar!');
    }
    if (message.type === 'race_started') {
      const prepared = onlinePreparedRef.current || { car: activeCar, tireType: game.selectedTire, trackKey: message.room.trackKey || selectedTrack };
      const session = { ...prepared, trackKey: message.room.trackKey || prepared.trackKey, multiplayer: true };
      raceSessionRef.current = session;
      setRaceSession(session);
      setGame((current) => ({ ...current, tires: { ...current.tires, [session.tireType]: Math.max(0, (current.tires[session.tireType] || 0) - 1) } }));
      setRaceInProgress(true);
      setOnlineMessage('Je rijdt live op de multiplayer-server.');
    }
    if (message.type === 'race_state') setOnlineSnapshot(message.players || []);
    if (message.type === 'race_finished') {
      setOnlineRoom(message.room);
      const me = (message.ranking || []).find((racer) => racer.id === onlinePlayerIdRef.current);
      if (me) finishRace({ duration: me.time, maxSpeed: 0, averageSpeed: 0, offroadSeconds: 0 }, me.place, me.time);
      setOnlineMessage(me ? `Finish! Je eindigde op plek ${me.place}.` : 'De multiplayer-race is afgelopen.');
      setOnlineSnapshot([]);
    }
    if (message.type === 'error') {
      setOnlineMessage(message.message || 'Multiplayer-fout.');
      notify(message.message || 'Multiplayer-fout.');
    }
    if (message.type === 'room_left') setOnlineRoom(null);
  };

  const connectOnline = (payload) => {
    const existing = socketRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      existing.send(JSON.stringify(payload));
      return;
    }
    if (existing && existing.readyState === WebSocket.CONNECTING) {
      setOnlineMessage('Verbinding wordt opgezet… probeer zo nog een keer.');
      return;
    }
    const socket = new WebSocket(getRaceSocketUrl());
    socketRef.current = socket;
    socket.onopen = () => socket.send(JSON.stringify(payload));
    socket.onmessage = handleOnlineMessage;
    socket.onerror = () => setOnlineMessage('Server niet bereikbaar. Start de Render race-server of controleer de verbinding.');
    socket.onclose = () => { if (socketRef.current === socket) socketRef.current = null; };
    setOnlineMessage('Verbinden met de race-server…');
  };

  const hostOnlineRace = () => {
    if ((game.tires[game.selectedTire] || 0) < 1) return notify('Je hebt minstens één bandenset nodig.');
    onlinePreparedRef.current = { car: activeCar, tireType: game.selectedTire, trackKey: selectedTrack };
    connectOnline({ type: 'room_create', playerName, trackKey: selectedTrack, stats: getRacePerformance(activeCar, game.selectedTire, selectedTrack) });
  };

  const joinOnlineRace = () => {
    if (!joinCode.trim()) return notify('Vul eerst een roomcode in.');
    if ((game.tires[game.selectedTire] || 0) < 1) return notify('Je hebt minstens één bandenset nodig.');
    onlinePreparedRef.current = { car: activeCar, tireType: game.selectedTire, trackKey: selectedTrack };
    connectOnline({ type: 'room_join', code: joinCode, playerName, trackKey: selectedTrack, stats: getRacePerformance(activeCar, game.selectedTire, selectedTrack) });
  };

  const startOnlineRace = () => {
    if (!onlineRoom || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: 'race_start' }));
  };

  const sendOnlineControls = (controls) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'race_input', controls }));
  };

  const leaveOnlineRoom = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'room_leave' }));
      socketRef.current.close();
    }
    setOnlineRoom(null);
    onlinePreparedRef.current = null;
    setOnlineSnapshot([]);
    setOnlineMessage('Je hebt de race-room verlaten.');
  };

  const tuneCar = (key, value) => {
    setGame((current) => ({
      ...current,
      cars: current.cars.map((car) => car.id === activeCar.id
        ? { ...car, tuning: { downforce: 50, gearRatio: 50, suspension: 50, ...(car.tuning || {}), [key]: value } }
        : car),
    }));
  };

  const buyOffer = (offer) => {
    if (game.shopPurchases[offer.id]) return;
    if (game.credits < offer.price) {
      notify('Niet genoeg credits voor deze bandenset.');
      return;
    }
    setGame((current) => ({
      ...current,
      credits: current.credits - offer.price,
      tires: { ...current.tires, [offer.type]: (current.tires[offer.type] || 0) + offer.packSize },
      shopPurchases: { ...current.shopPurchases, [offer.id]: true },
    }));
    notify(`${offer.packSize} sets ${TIRE_TYPES[offer.type].name} toegevoegd aan je voorraad.`);
  };

  const buyCar = (model) => {
    if (game.cars.some((car) => car.key === model.key)) {
      notify('Deze auto staat al in je garage.');
      return;
    }
    if (game.credits < model.price) {
      notify('Je hebt nog niet genoeg credits voor deze auto.');
      return;
    }
    const newCar = createCar(model.key);
    setGame((current) => ({ ...current, credits: current.credits - model.price, cars: [...current.cars, newCar], activeCarId: newCar.id }));
    notify(`${model.name} gekocht en geselecteerd!`);
    setTab('garage');
  };

  const upgradePart = (partKey) => {
    const part = UPGRADE_PARTS[partKey];
    const currentLevel = activeCar.upgrades[partKey] || 0;
    const cost = part.costs[currentLevel];
    if (cost == null) return;
    if (game.credits < cost) {
      notify('Niet genoeg credits voor deze upgrade.');
      return;
    }
    setGame((current) => ({
      ...current,
      credits: current.credits - cost,
      cars: current.cars.map((car) => car.id === activeCar.id
        ? { ...car, upgrades: { ...car.upgrades, [partKey]: currentLevel + 1 } }
        : car),
    }));
    notify(`${part.name} stage ${currentLevel + 1} geïnstalleerd op ${activeCar.name}.`);
  };

  const openCrate = () => {
    if (game.crates < 1) return;
    const roll = Math.random();
    let reward;
    let updated = {};
    if (roll > 0.96) {
      reward = { type: 'allterrain', amount: 3, title: 'LEGENDARY DROP', description: '3 sets All-Terrain X banden!' };
      updated.tires = { ...game.tires, allterrain: game.tires.allterrain + 3 };
    } else if (roll > 0.78) {
      reward = { type: 'soft', amount: 3, title: 'EPIC DROP', description: '3 sets Racing Soft banden!' };
      updated.tires = { ...game.tires, soft: game.tires.soft + 3 };
    } else if (roll > 0.52) {
      reward = { type: 'medium', amount: 3, title: 'RARE DROP', description: '3 sets Sport Medium banden!' };
      updated.tires = { ...game.tires, medium: game.tires.medium + 3 };
    } else {
      const credits = 1000 + Math.floor(Math.random() * 2501);
      reward = { type: 'credits', amount: credits, title: 'CREDITS GEVONDEN', description: `${formatCredits(credits)} credits toegevoegd aan je saldo.` };
      updated.credits = game.credits + credits;
    }
    setGame((current) => ({ ...current, crates: Math.max(0, current.crates - 1), ...updated }));
    setCrateResult(reward);
  };

  const setActiveCar = (carId) => {
    setGame((current) => ({ ...current, activeCarId: carId }));
    notify('Auto geselecteerd. Upgrades blijven bij deze auto.');
  };

  const setTire = (type) => {
    setGame((current) => ({ ...current, selectedTire: type }));
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>A</span><i /></div>
          <div><div className="brand-name">APEX<span>RUSH</span></div><div className="brand-sub">RACING CLUB</div></div>
        </div>

        <div className="club-label">COMMAND CENTER</div>
        <nav className="side-nav" aria-label="Hoofdnavigatie">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>
              <Icon>{item.icon}</Icon><span>{item.label}</span>
              {item.id === 'crates' && game.crates > 0 && <b className="nav-count">{game.crates}</b>}
              {item.id === 'market' && <span className="nav-soon">NEW</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="club-status"><span className="status-dot" /><span>LOCAL SAVE ACTIVE</span></div>
          <div className="sidebar-mini-card">
            <div className="mini-card-top"><span>SEIZOEN 01</span><span>#{String(Math.max(1, game.wins + 18)).padStart(3, '0')}</span></div>
            <div className="mini-card-title">Road to Apex</div>
            <div className="mini-progress"><span style={{ width: `${Math.min(100, level.progress)}%` }} /></div>
            <div className="mini-card-foot"><span>LEVEL {level.level}</span><span>{level.current}/500 XP</span></div>
          </div>
          <div className="sidebar-footer">APEX RUSH <span>BUILD 0.2.0</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark small"><span>A</span><i /></span><b>APEX<span>RUSH</span></b></div>
          <div className="breadcrumb"><span>GARAGE</span><i>/</i><strong>{NAV_ITEMS.find((item) => item.id === tab)?.label.toUpperCase()}</strong></div>
          <div className="topbar-right">
            <div className="wallet-chip"><span className="wallet-icon">◈</span><div><small>CREDITS</small><strong>{formatCredits(game.credits)}</strong></div><span className="plus-chip">+</span></div>
            <div className="profile-chip"><div className="avatar">DR</div><div><strong>DRIVER</strong><small>LEVEL {level.level}</small></div><span className="profile-caret">⌄</span></div>
          </div>
        </header>

        <div className="mobile-nav">
          {NAV_ITEMS.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} title={item.label}>{item.icon}</button>)}
        </div>

        {tab === 'race' && (
          <>
            <section className="page-heading heading-with-tag">
              <div><div className="eyebrow"><span className="eyebrow-line" />THE GRID IS YOURS</div><h1>RACE <em>HUB</em></h1><p>Kies je circuit, check je banden en pak de winst.</p></div>
              <div className="season-tag"><span className="season-pulse" />SEIZOEN 01 <b>LIVE</b></div>
            </section>

            <section className="feature-car-panel">
              <div className="feature-copy">
                <div className="feature-kicker"><span className="tiny-square" /> JOUW HOOFDAUTO <span className="feature-class">{activeModel.class}</span></div>
                <h2>{activeModel.name}<span className="model-dot">.</span></h2>
                <p>{activeModel.tagline}</p>
                <div className="feature-stats">
                  <div><strong>{activeStats.power}</strong><span>PK INDEX</span></div>
                  <div><strong>{activeStats.topSpeed}</strong><span>KM/H</span></div>
                  <div><strong>{activeStats.handling}</strong><span>HANDLING</span></div>
                </div>
                <Button variant="ghost-light" onClick={() => setTab('garage')}>BEKIJK GARAGE <span>↗</span></Button>
              </div>
              <div className="feature-visual">
                <div className="feature-glow" />
                <div className="car-shadow" />
                <CarImage car={activeCar} className="feature-car-image" />
                <div className="visual-grid" />
                <div className="visual-coordinate">APX / 01 — {activeModel.key.toUpperCase()}</div>
                <div className="visual-speed"><span>TOP SPEED</span><strong>{activeStats.topSpeed}<small>KM/H</small></strong></div>
              </div>
              <div className="feature-index">01 <span>/</span> 05</div>
            </section>

            <div className="section-title-row"><div><div className="eyebrow">SELECT YOUR BATTLE</div><h2>KIES JE <em>CIRCUIT</em></h2></div><span className="muted-label">3 TRACKS BESCHIKBAAR</span></div>
            <section className="track-grid">
              {TRACKS.map((track, index) => (
                <button key={track.key} className={`track-card track-${track.key} ${selectedTrack === track.key ? 'selected' : ''}`} onClick={() => setSelectedTrack(track.key)}>
                  <div className="track-art"><div className="track-sun" /><div className="track-horizon" /><div className="track-road" /><span className="track-number">0{index + 1}</span><span className="track-symbol">{track.icon}</span></div>
                  <div className="track-info"><div><h3>{track.name}</h3><p>{track.description}</p></div><span className="track-radio">{selectedTrack === track.key ? '✓' : ''}</span></div>
                  <div className="track-meta"><span>{track.length}</span><span>{track.label}</span><b>{track.difficulty}</b></div>
                </button>
              ))}
            </section>

            <section className="race-prep-panel">
              <div className="prep-left"><div className="eyebrow">RACE LOADOUT</div><h3>READY <em>TO RUN?</em></h3><p>Elke race verbruikt precies één bandenset.</p></div>
              <div className="prep-tire-select">
                <div className="prep-label">GEKOZEN BAND</div>
                <div className="prep-tire-content"><TireVisual type={game.selectedTire} small /><div><strong>{selectedTireInfo.name}</strong><span className={`rarity-text rarity-${game.selectedTire}`}>{RARITY_LABELS[game.selectedTire]}</span></div><b>×{game.tires[game.selectedTire] || 0}</b></div>
                <button className="text-action" onClick={() => setTab('tires')}>WIJZIG LOADOUT ↗</button>
              </div>
              <div className="prep-action"><Button onClick={startRace} disabled={raceInProgress || (game.tires[game.selectedTire] || 0) < 1}>{raceInProgress ? 'RACE BEZIG…' : 'START RACE'} <span>→</span></Button><small>{selectedTrackData.name} · {selectedTrackData.label}</small></div>
            </section>
            <section className="multiplayer-panel">
              <div className="multiplayer-heading"><div><div className="eyebrow">ONLINE GRID / UP TO 4 DRIVERS</div><h2>RACE <em>TOGETHER.</em></h2><p>De server verwerkt stuurinput en raceposities; deel een roomcode om samen te starten.</p></div><span className="server-status"><i /> RACE SERVER</span></div>
              <div className="multiplayer-actions"><label>JOUW RACERNAAM<input value={playerName} maxLength={18} onChange={(event) => setPlayerName(event.target.value)} /></label><button className="btn btn-primary" onClick={hostOnlineRace} disabled={raceInProgress || Boolean(onlineRoom)}>HOST RACE ↗</button><label>ROOM CODE<input value={joinCode} maxLength={6} placeholder="ABC123" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label><button className="btn btn-outline" onClick={joinOnlineRace} disabled={raceInProgress || Boolean(onlineRoom)}>JOIN RACE ↗</button></div>
              <div className="multiplayer-status"><span>{onlineMessage}</span>{onlineRoom && <><strong>ROOM {onlineRoom.code}</strong><b>{onlineRoom.players?.length || 1}/4 PLAYERS</b><b>TRACK {onlineRoom.trackKey?.toUpperCase()}</b></>}</div>
              {onlineRoom && <div className="multiplayer-room"><div className="room-player-list">{onlineRoom.players?.map((player) => <div key={player.id}><span className="room-player-dot" />{player.name}{player.id === onlineRoom.hostId && <small>HOST</small>}</div>)}</div><div className="room-controls">{onlineRoom.hostId === onlinePlayerId && <button className="btn btn-primary" onClick={startOnlineRace} disabled={onlineRoom.players?.length < 2 || onlineRoom.status !== 'lobby'}>START ONLINE RACE →</button>}<button className="btn btn-outline" onClick={leaveOnlineRoom}>LEAVE ROOM</button></div></div>}
            </section>
          </>
        )}

        {tab === 'garage' && (
          <>
            <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />YOUR COLLECTION</div><h1>MY <em>GARAGE</em></h1><p>Elke auto heeft zijn eigen upgrades. Bouw je collectie op.</p></div><div className="heading-stat"><strong>{game.cars.length}<span>/{CAR_CATALOG.length}</span></strong><small>AUTO'S VERZAMELD</small></div></section>
            <div className="garage-grid">
              {CAR_CATALOG.map((model) => {
                const owned = game.cars.find((car) => car.key === model.key);
                const selected = owned?.id === game.activeCarId;
                const stats = owned ? getCarStats(owned) : model;
                return (
                  <article key={model.key} className={`garage-car-card ${owned ? 'owned' : 'locked'} ${selected ? 'selected' : ''}`}>
                    <div className="garage-car-art"><span className="car-class-label">{model.class}</span><CarImage car={{ key: model.key }} /><span className="garage-car-number">0{CAR_CATALOG.indexOf(model) + 1}</span></div>
                    <div className="garage-car-body"><div className="garage-car-title"><div><h3>{model.name}</h3><p>{model.tagline}</p></div>{selected && <span className="selected-pill">ACTIVE</span>}</div>
                      <div className="garage-stats"><span><b>{stats.power}</b> PWR</span><span><b>{stats.topSpeed}</b> KM/H</span><span><b>{stats.handling}</b> GRIP</span></div>
                      {owned ? <Button variant={selected ? 'selected' : 'outline'} onClick={() => setActiveCar(owned.id)}>{selected ? 'GEBRUIKSKLAAR ✓' : 'SELECTEER AUTO'}</Button> : <Button onClick={() => buyCar(model)} disabled={game.credits < model.price}>{formatCredits(model.price)} CREDITS <span>↗</span></Button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {tab === 'workshop' && (
          <>
            <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />TUNE YOUR MACHINE</div><h1>THE <em>WORKSHOP</em></h1><p>Installeer onderdelen. Iedere auto heeft zijn eigen upgrade-levels.</p></div><div className="workshop-car-chip"><CarImage car={activeCar} /><div><small>NU GESELECTEERD</small><strong>{activeCar.name}</strong></div></div></section>
            <section className="workshop-hero"><div className="workshop-hero-art"><CarImage car={activeCar} /><div className="workshop-orbit orbit-one" /><div className="workshop-orbit orbit-two" /></div><div className="workshop-hero-copy"><span className="feature-class">{activeModel.class} / ACTIVE BUILD</span><h2>{activeCar.name}</h2><p>Alle onderdelen hieronder worden alleen op deze auto geïnstalleerd.</p><div className="workshop-summary"><span><b>{activeStats.power}</b> POWER</span><span><b>{activeStats.acceleration}</b> ACCEL.</span><span><b>{activeStats.handling}</b> HANDLING</span></div></div></section>
            <section className="setup-tuning-panel">
              <div className="setup-tuning-heading"><div><div className="eyebrow">LIVE VEHICLE DYNAMICS</div><h2>RACE <em>SETUP</em></h2><p>Schuif de balans. Iedere instelling verandert hoe je auto rijdt.</p></div><span>BUILD / {activeModel.key.toUpperCase()}</span></div>
              <div className="setup-stat-grid"><div><small>MAXIMALE SNELHEID</small><strong>{activeStats.topSpeed}<i>KM/H</i></strong><span>↓ bij meer downforce</span></div><div><small>BOCHTENGRIP</small><strong>{activeStats.handling}<i>/ 120</i></strong><span>↑ met downforce en ophanging</span></div><div><small>ACCELERATIE</small><strong>{activeStats.acceleration}<i>/ 120</i></strong><span>↑ met kortere gearing</span></div></div>
              <div className="setup-slider-grid">
                <label className="setup-slider"><span><b>DOWNFORCE</b><strong>{activeCar.tuning?.downforce ?? 50}%</strong></span><input type="range" min="0" max="100" value={activeCar.tuning?.downforce ?? 50} onChange={(event) => tuneCar('downforce', Number(event.target.value))} /><small>Meer downforce = betere bochten, minder rechte-stuk snelheid.</small></label>
                <label className="setup-slider"><span><b>VERSNELLINGSVERHOUDING</b><strong>{activeCar.tuning?.gearRatio ?? 50}%</strong></span><input type="range" min="0" max="100" value={activeCar.tuning?.gearRatio ?? 50} onChange={(event) => tuneCar('gearRatio', Number(event.target.value))} /><small>Lang = hogere topsnelheid. Kort = sneller accelereren.</small></label>
                <label className="setup-slider"><span><b>OPHANGING STIJFHEID</b><strong>{activeCar.tuning?.suspension ?? 50}%</strong></span><input type="range" min="0" max="100" value={activeCar.tuning?.suspension ?? 50} onChange={(event) => tuneCar('suspension', Number(event.target.value))} /><small>Stijver reageert directer en geeft meer stabiliteit in snelle bochten.</small></label>
              </div>
            </section>
            <div className="section-title-row"><div><div className="eyebrow">PERFORMANCE PARTS</div><h2>UPGRADE <em>STATIONS</em></h2></div><span className="muted-label">{Object.values(activeCar.upgrades).reduce((sum, value) => sum + value, 0)} UPGRADES GEÏNSTALLEERD</span></div>
            <section className="upgrade-grid">
              {Object.entries(UPGRADE_PARTS).map(([key, part]) => {
                const current = activeCar.upgrades[key] || 0;
                const cost = part.costs[current];
                const maxed = cost == null;
                return (
                  <article className="upgrade-card" key={key}>
                    <div className="upgrade-card-top"><div className="upgrade-icon">{part.icon}</div><span>STAGE {current}/{part.costs.length}</span></div>
                    <h3>{part.name}</h3><p>{part.detail}</p>
                    <div className="stage-track">{part.costs.map((_, index) => <span key={index} className={index < current ? 'filled' : ''} />)}</div>
                    <div className="upgrade-next"><small>{maxed ? 'MAXIMAAL BEREIKT' : `VOLGENDE: STAGE ${current + 1}`}</small><strong>{maxed ? 'MAX' : `${formatCredits(cost)} CR`}</strong></div>
                    <div className="upgrade-desc">{maxed ? 'Dit onderdeel is volledig geoptimaliseerd.' : part.descriptions[current]}</div>
                    <Button variant={maxed ? 'selected' : 'outline'} disabled={maxed || game.credits < cost} onClick={() => upgradePart(key)}>{maxed ? 'VOLLEDIG GEÜPGRADE' : 'INSTALLEREN ↗'}</Button>
                  </article>
                );
              })}
            </section>
          </>
        )}

        {tab === 'tires' && (
          <>
            <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />GRIP IS EVERYTHING</div><h1>TIRE <em>DEPOT</em></h1><p>Verzamel banden, kies je loadout en bewaar zeldzame sets voor de juiste race.</p></div><div className="shop-refresh"><span className="refresh-dot" /><small>SHOP REFRESH IN</small><strong>{countdown}</strong></div></section>
            <section className="tire-inventory-grid">
              {Object.entries(TIRE_TYPES).map(([key, tire]) => (
                <article key={key} className={`tire-inventory-card ${game.selectedTire === key ? 'selected' : ''} rarity-border-${key}`}>
                  <div className="tire-card-head"><span className={`rarity-badge rarity-${key}`}>{RARITY_LABELS[key]}</span><span className="tire-quantity">×{game.tires[key] || 0} SETS</span></div>
                  <TireVisual type={key} />
                  <h3>{tire.name}</h3><p>{tire.description}</p>
                  <div className="tire-attributes"><span><b>+{tire.grip}</b> GRIP</span><span><b>+{tire.speed}</b> SPEED</span><span><b>{tire.wear}×</b> WEAR</span></div>
                  <Button variant={game.selectedTire === key ? 'selected' : 'outline'} disabled={(game.tires[key] || 0) < 1} onClick={() => setTire(key)}>{game.selectedTire === key ? 'ACTIEVE LOADOUT ✓' : 'SELECTEER BAND'}</Button>
                </article>
              ))}
            </section>
            <div className="section-title-row shop-section-title"><div><div className="eyebrow">ROTATING STOCK</div><h2>HOURLY <em>DROP SHOP</em></h2></div><div className="shop-rotation"><span className="refresh-dot" /> VERNIEUWT ELK UUR</div></div>
            <section className="shop-offers-grid">
              {shopOffers.map((offer, index) => {
                const tire = TIRE_TYPES[offer.type];
                const bought = Boolean(game.shopPurchases[offer.id]);
                return <article key={offer.id} className={`shop-offer offer-${offer.type}`}>
                  <div className="offer-topline"><span>DAILY DROP / 0{index + 1}</span><span className={`rarity-text rarity-${offer.type}`}>{RARITY_LABELS[offer.type]}</span></div>
                  <div className="offer-content"><TireVisual type={offer.type} small /><div><h3>{tire.name}</h3><p>{tire.description}</p></div></div>
                  <div className="offer-bottom"><div><strong>{formatCredits(offer.price)}</strong><small>3 RACE SETS</small></div><Button variant={bought ? 'selected' : 'primary'} disabled={bought || game.credits < offer.price} onClick={() => buyOffer(offer)}>{bought ? 'GEKOCHT ✓' : 'KOOP PACK'}</Button></div>
                </article>;
              })}
            </section>
            <div className="shop-note"><span>i</span><p>Elke aankoop bevat <b>3 bandensets</b>. Eén set is goed voor één race. De shop wisselt automatisch ieder heel uur.</p></div>
          </>
        )}

        {tab === 'crates' && (
          <>
            <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />MYSTERY REWARDS</div><h1>LOOT <em>CRATES</em></h1><p>Race voor crates en ontdek credits of zeldzame banden.</p></div><div className="crate-count"><strong>{String(game.crates).padStart(2, '0')}</strong><small>CRATES BESCHIKBAAR</small></div></section>
            <section className="crate-showcase"><div className="crate-glow" /><div className="crate-box"><div className="crate-top" /><div className="crate-front"><span>APX</span><i>✦</i></div><div className="crate-side" /></div><div className="crate-spark spark-a">✦</div><div className="crate-spark spark-b">✧</div><div className="crate-showcase-copy"><div className="eyebrow">RACE. EARN. UNLOCK.</div><h2>WHAT'S <em>INSIDE?</em></h2><p>Elke crate bevat een verrassingsbeloning. Hoe beter je racet, hoe groter de kans dat je er eentje wint.</p><Button onClick={openCrate} disabled={game.crates < 1}>OPEN EEN CRATE <span>→</span></Button><small>{game.crates > 0 ? `${game.crates} crate${game.crates === 1 ? '' : 's'} klaar om te openen` : 'VERDIEN CRATES DOOR TE RACEN'}</small></div></section>
            <div className="section-title-row"><div><div className="eyebrow">POSSIBLE DROPS</div><h2>CRATE <em>POOL</em></h2></div><span className="muted-label">WILLEKEURIGE BELONING</span></div>
            <section className="crate-reward-grid">
              {[
                { type: 'credits', title: 'Credit stack', desc: '1.000 – 3.500 credits', icon: '◈', className: 'reward-credits' },
                { type: 'medium', title: 'Sport Medium', desc: '3 rare bandensets', icon: '◉', className: 'reward-medium' },
                { type: 'soft', title: 'Racing Soft', desc: '3 epic bandensets', icon: '◉', className: 'reward-soft' },
                { type: 'allterrain', title: 'All-Terrain X', desc: '3 legendary bandensets', icon: '◉', className: 'reward-gold' },
              ].map((reward) => <div className={`crate-reward-card ${reward.className}`} key={reward.type}><div>{reward.icon}</div><span>{reward.type === 'credits' ? 'CREDITS' : RARITY_LABELS[reward.type]}</span><h3>{reward.title}</h3><p>{reward.desc}</p></div>)}
            </section>
          </>
        )}

        {tab === 'market' && (
          <>
            <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />PLAYER TO PLAYER</div><h1>THE <em>MARKET</em></h1><p>Koop en verkoop auto's en bandensets met andere racers.</p></div><span className="market-status"><i /> IN OPBOUW</span></section>
            <section className="market-hero"><div className="market-orbit" /><div className="market-symbol">⇄</div><div className="market-hero-copy"><span className="feature-class">TRADER NETWORK / 01</span><h2>YOUR GARAGE.<br /><em>YOUR ECONOMY.</em></h2><p>De marktplaats wordt gekoppeld aan spelersaccounts. Auto's en bandensets worden straks veilig overgedragen via een transactie op de server.</p><div className="market-pills"><span>PLAYER TRADING</span><span>SECURE TRANSFERS</span><span>LIVE LISTINGS</span></div></div><div className="market-lock"><span>01</span><strong>MARKETPLACE</strong><small>DATABASE CONNECTION REQUIRED</small></div></section>
            <div className="market-preview-grid"><div className="market-preview-card"><span>01 / VEHICLES</span><h3>Auto's verhandelen</h3><p>Zet een auto uit je garage te koop of koop een nieuwe build van een andere speler.</p><b>COMING SOON</b></div><div className="market-preview-card"><span>02 / TIRE SETS</span><h3>Rare banden traden</h3><p>Verkoop je extra sets en zoek naar die ene Soft of Legendary All-Terrain drop.</p><b>COMING SOON</b></div><div className="market-preview-card"><span>03 / PLAYER PROFILE</span><h3>Racers & reputatie</h3><p>Een eigen profiel met collectie, races, prestaties en handelsgeschiedenis.</p><b>COMING SOON</b></div></div>
            <div className="connection-note"><span className={`connection-indicator ${isSupabaseConfigured ? 'connected' : ''}`} /><div><strong>{isSupabaseConfigured ? 'Supabase-configuratie gevonden' : 'Nog geen database gekoppeld'}</strong><p>{isSupabaseConfigured ? 'De projectinstellingen zijn ingevuld. De online handelsfuncties moeten nog worden aangesloten.' : 'De game draait nu volledig lokaal. De database-migratie staat klaar in supabase/migrations.'}</p></div></div>
          </>
        )}

        <footer className="main-footer"><span>APEX RUSH © 2026</span><span>BUILT FOR THE GRID <b>✦</b></span><span>LOCAL ASSETS / NO IMAGE CDN</span></footer>
      </main>

      <aside className="right-rail">
        <div className="rail-profile"><div className="rail-profile-top"><div className="avatar large">DR</div><div><span>WELCOME BACK</span><strong>DRIVER</strong><small>ROOKIE RACER</small></div><button aria-label="Profielmenu">•••</button></div><div className="xp-row"><span>LEVEL {level.level}</span><span>{game.xp} XP</span></div><div className="xp-track"><span style={{ width: `${level.progress}%` }} /></div><div className="xp-caption"><span>{level.current} / {level.required} XP</span><b>{Math.max(0, level.required - level.current)} XP TO LEVEL UP</b></div></div>
        <div className="rail-section"><div className="rail-section-title"><span>CAREER STATS</span><i>↗</i></div><div className="career-stats"><div><span>RACES</span><strong>{game.races}</strong></div><div><span>WINS</span><strong>{game.wins}</strong></div><div><span>WIN RATE</span><strong>{game.races ? Math.round((game.wins / game.races) * 100) : 0}<small>%</small></strong></div></div></div>
        <div className="rail-section"><div className="rail-section-title"><span>QUICK LOADOUT</span><button onClick={() => setTab('tires')}>EDIT ↗</button></div><div className="quick-loadout">{Object.entries(TIRE_TYPES).map(([key, tire]) => <button className={game.selectedTire === key ? 'active' : ''} key={key} onClick={() => setTire(key)} disabled={(game.tires[key] || 0) < 1}><TireVisual type={key} small /><span><b>{tire.name}</b><small className={`rarity-text rarity-${key}`}>{RARITY_LABELS[key]}</small></span><strong>×{game.tires[key] || 0}</strong></button>)}</div></div>
        <div className="rail-section race-history-section"><div className="rail-section-title"><span>RECENT RACES</span><span className="live-count">{game.raceLog.length} RECENT</span></div>
          {game.raceLog.length ? <div className="race-history">{game.raceLog.slice(0, 4).map((race) => <div className="history-item" key={race.id}><div className={`history-place place-${race.place}`}>{race.place === 1 ? '1ST' : `${race.place}TH`}</div><div><strong>{race.track}</strong><small>{new Date(race.time).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })} · {TIRE_TYPES[race.tireType]?.name || 'Band'}</small></div><b>+{formatCredits(race.prize)}</b></div>)}</div> : <div className="empty-history"><span>⌁</span><p>Nog geen races gereden.</p><small>Jouw racegeschiedenis verschijnt hier.</small></div>}
        </div>
        <div className="rail-tip"><span>✦ DRIVER TIP</span><p>Soft-banden zijn razendsnel op asfalt, maar probeer All-Terrain op Dust Valley.</p></div>
      </aside>

      {toast && <div className="toast"><span>✓</span>{toast}</div>}

      {raceInProgress && raceSession && <DrivingRace key={`${raceSession.multiplayer ? 'online' : 'solo'}-${raceSession.trackKey}`} car={raceSession.car} performance={raceSessionPerformance} trackKey={raceSession.trackKey} trackName={TRACKS.find((track) => track.key === raceSession.trackKey)?.name || 'Circuit'} multiplayer={raceSession.multiplayer} multiplayerSnapshot={onlineSnapshot} playerId={onlinePlayerId} onControls={sendOnlineControls} onFinish={finishRace} onExit={() => { if (raceSession.multiplayer) leaveOnlineRoom(); setRaceInProgress(false); setRaceSession(null); raceSessionRef.current = null; setOnlineMessage('Je hebt de race verlaten.'); }} />}

      {raceResult && <div className="modal-backdrop" onClick={() => setRaceResult(null)}><section className="result-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setRaceResult(null)}>×</button><div className="result-kicker">RACE COMPLETED / {raceResult.track}</div><div className={`result-place place-${raceResult.place}`}>{raceResult.place === 1 ? '1ST' : `${raceResult.place}TH`}</div><h2>{raceResult.place === 1 ? 'ABSOLUTE PODIUM.' : raceResult.place === 2 ? 'GREAT DRIVE.' : raceResult.place === 3 ? 'KEEP PUSHING.' : 'THE NEXT ONE IS YOURS.'}</h2><p>Je finishte op plek {raceResult.place} in {raceResult.duration ? `${raceResult.duration.toFixed(1)} seconden` : `met een race score van ${raceResult.score}`}.</p><div className="race-result-telemetry"><span>TOP SPEED <b>{raceResult.telemetry?.maxSpeed || '—'} KM/H</b></span><span>AVG SPEED <b>{raceResult.telemetry?.averageSpeed || '—'} KM/H</b></span><span>OFFROAD <b>{raceResult.telemetry?.offroadSeconds ?? '—'} SEC</b></span></div><div className="result-rewards"><div><span>PRIZE MONEY</span><strong>+{formatCredits(raceResult.prize)}</strong></div><div><span>EXPERIENCE</span><strong>+{raceResult.xp} XP</strong></div><div><span>CRATE DROP</span><strong>{raceResult.crate ? 'YES ✦' : 'NO'}</strong></div></div>{raceResult.crate && <div className="crate-earned">✦ Je hebt een crate verdiend. Check je crate inventory.</div>}<Button onClick={() => setRaceResult(null)}>TERUG NAAR DE GRID <span>→</span></Button></section></div>}

      {crateResult && <div className="modal-backdrop" onClick={() => setCrateResult(null)}><section className="result-modal crate-result-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setCrateResult(null)}>×</button><div className="result-kicker">APEX CRATE / REWARD UNLOCKED</div><div className={`crate-result-icon reward-${crateResult.type}`}>{crateResult.type === 'credits' ? '◈' : '◉'}</div><div className={`rarity-badge rarity-${crateResult.type === 'credits' ? 'basic' : crateResult.type}`}>{crateResult.title}</div><h2>{crateResult.description}</h2><p>Je beloning is direct toegevoegd aan je lokale account.</p><Button onClick={() => setCrateResult(null)}>NICE. TERUG NAAR CRATES <span>→</span></Button></section></div>}
    </div>
  );
}

export default App;
