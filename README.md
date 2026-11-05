# Apex Rush — Racing Club

Een browser-based racing game met een donker motorsport-dashboard, bestuurbare top-down circuitraces, auto-afstelling en een Node/WebSocket-raceserver. De lokale game-save wordt in `localStorage` bewaard.

## Installatiehandleiding

Voor de volledige klik-voor-klik installatie: open [HANDLEIDING-NL.md](HANDLEIDING-NL.md).

## Wat zit erin?

- **Top-down circuits:** drie volledige gesloten circuits (Coastal Run, Mountain Pass en Dust Valley) met start/finish, rood-witte kerbs, pitstraat, tribune, baanmarkeringen en tegenstanders die zichtbaar over dezelfde route rijden. De trackselectie gebruikt dezelfde circuitgeometrie als de race.
- **Driving mode:** bestuur de auto live met W/A/S/D of pijltjestoetsen. Op mobiel staan stuur-, gas- en remknoppen in beeld. Drie ronden, snelheid, afstand, rondeteller en rijtijd worden tijdens de race bijgehouden.
- **Garage:** vijf auto's met eigen eigenschappen en lokale SVG-afbeeldingen.
- **Werkplaats:** motor, versnellingsbak, remmen, ophanging en aerodynamica. Upgrades worden per auto opgeslagen. De motor kost bijvoorbeeld 2.000 credits voor stage 1 en 7.000 voor stage 2.
- **Race setup:** downforce, versnellingsverhouding en ophangingsstijfheid zijn instelbare sliders. Downforce verhoogt bochtengrip maar verlaagt topsnelheid; korte gearing verhoogt acceleratie maar kost topsnelheid.
- **Physics:** upgrades, gekozen banden en track type beïnvloeden de rijphysics, grip, acceleratie, remmen, topsnelheid en off-road verlies.
- **Multiplayer:** Node/WebSocket-server met private roomcodes, maximaal vier spelers, server-side race-state, stuurinput, afstand, finishvolgorde en race-resultaten.
- **Banden:** Street Basic, Sport Medium (Rare), Racing Soft (Epic) en All-Terrain X (Legendary). Een shop-pack geeft drie racesets.
- **Hourly shop:** drie aanbiedingen met een voorraad die ieder heel uur opnieuw wordt gegenereerd.
- **Crates:** verdien crates met races en open ze voor credits of banden. De crate heeft nu een eigen lokale, gedetailleerde SVG-render.
- **Marktplaats-scherm:** de gebruikersinterface en database-migratie voor speler-naar-speler-handel zijn voorbereid. De live handel is nog niet geactiveerd.

## Lokaal starten

Vereist Node.js 20.19+ of 22.12+.

```bash
npm install
npm run dev
```

Start daarnaast in een tweede terminal de lokale raceserver:

```bash
npm run server:dev
```

Open daarna de lokale URL die Vite toont. De client praat voor multiplayer met `ws://localhost:3001/ws`. Productie-build:

```bash
npm run build
npm run preview
```

De game werkt zonder Supabase-configuratie. Voortgang wordt lokaal in de browser opgeslagen. Gebruik in de browserconsole `localStorage.removeItem('apex-rush-save')` om de lokale save te resetten.

## Afbeeldingen

Alle game-afbeeldingen zijn lokale SVG-bestanden in de repository. Auto-assets staan onder `public/assets/cars/`; de Apex loot crate staat onder `src/assets/` en wordt door Vite in de build opgenomen. Er worden geen externe image-URL’s of image-CDN’s gebruikt.

## GitHub → Render

1. Push deze projectmap naar een GitHub-repository.
2. Maak in Render een **Web Service** vanuit die repository.
3. `render.yaml` bouwt de Vite frontend en start `node server/index.js`. De Node-service serveert `dist/`, health-checkt via `/health` en verwerkt WebSocket-races via `/ws`.
4. De lokale SVG-afbeeldingen worden meegenomen in `dist/assets/`; er is geen externe image-CDN nodig. Render host de assets als statische bestanden binnen dezelfde webservice.

## Supabase voorbereiden

1. Maak een Supabase-project.
2. Voer `supabase/migrations/202611050001_init_apex_rush.sql` uit in de SQL Editor.
3. Kopieer `.env.example` naar `.env.local` en vul `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` in.
4. Voeg dezelfde variabelen toe aan Render als environment variables en deploy opnieuw.

De bestaande migratie maakt spelersprofielen, wallets, auto's, bandenvoorraad en marktplaatsaanbiedingen aan. Markttransacties gebruiken beveiligde SQL RPC-functies en RLS.

**Multiplayer-prototype:** de raceserver is autoriteit voor de race-tick, de afgelegde afstand en de finishvolgorde. De browser stuurt alleen gas/rem/stuurinput. De server begrenst de aangeleverde voertuigstats, maar verifieert de auto, upgrades en bandenvoorraad nog niet tegen een ingelogde Supabase-speler. Rooms worden voorlopig in het geheugen van het Node-proces bijgehouden; een herstart of redeploy beëindigt actieve rooms. Racebeloningen en inventaris worden ook nog lokaal bewaard. Verbind vóór publieke lancering Supabase Auth, laad speler-builds en bandenvoorraad server-side en schrijf resultaten atomair terug naar de database. Gebruik de WebSocket-server nog niet als volledig cheat-bestendig competitief systeem.

## Update 0.2.2 — top-down circuits en crate-art

- Vervangt het pseudo-3D wegbeeld door een volledig bovenaanzicht van een gesloten circuit.
- Drie afzonderlijke circuitlayouts worden gedeeld door de raceweergave en de circuitkeuzekaarten.
- Auto’s en tegenstanders bewegen langs de volledige baan; de start/finish, kerbs, pitstraat en baanmarkeringen zijn zichtbaar.
- De bochtbelasting in de physics wordt uit de echte circuitgeometrie berekend.
- De crate-showcase gebruikt een eigen lokale SVG-art asset.

## Tests

```bash
npm test
```

De tests controleren onder meer dat downforce en gearing de verwachte trade-offs geven, banden race-statistieken veranderen en de racephysics de finish kan bereiken.


## GitHub Pages (frontend preview)

GitHub Pages can host the built static frontend, but it cannot run the Node.js/WebSocket multiplayer server. The repository includes `.github/workflows/deploy-pages.yml`: push to `main`, then open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The workflow runs `npm install`, `npm run build`, and publishes `dist/`. Vite uses relative asset paths so project-repository URLs work.

For multiplayer from the Pages frontend, first deploy the Node service on Render and add a repository Actions variable named `VITE_RACE_SERVER_URL` with the Render service URL (for example `https://apex-rush.onrender.com`, without a trailing slash). Without that variable, single-player works but multiplayer has no server endpoint.
