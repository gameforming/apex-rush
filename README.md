# Apex Rush — Racing Club

Een browser-based racing game prototype met een donkere motorsport-interface. De eerste versie speelt volledig lokaal en bewaart de voortgang in `localStorage`.

## Wat zit erin?

- **Race Hub:** kies uit Coastal Run (asfalt), Mountain Pass (gemengd) en Dust Valley (off-road). Een race verbruikt exact één bandenset.
- **Garage:** vijf auto's met eigen eigenschappen en lokale SVG-afbeeldingen.
- **Werkplaats:** motor, versnellingsbak, remmen en ophanging. Upgrades worden per auto opgeslagen. De motor kost bijvoorbeeld 2.000 credits voor stage 1 en 7.000 voor stage 2.
- **Banden:** Street Basic, Sport Medium (Rare), Racing Soft (Epic) en All-Terrain X (Legendary). Een shop-pack geeft drie racesets.
- **Hourly shop:** drie aanbiedingen met een voorraad die ieder heel uur opnieuw wordt gegenereerd.
- **Crates:** verdien crates met races en open ze voor credits of banden.
- **Marktplaats-scherm:** de gebruikersinterface en database-migratie voor speler-naar-speler-handel zijn voorbereid. De live handel is nog niet geactiveerd.

## Lokaal starten

Vereist Node.js 20.19+ of 22.12+.

```bash
npm install
npm run dev
```

Open daarna de lokale URL die Vite toont. Productie-build:

```bash
npm run build
npm run preview
```

De game werkt zonder Supabase-configuratie. Voortgang wordt lokaal in de browser opgeslagen. Gebruik in de browserconsole `localStorage.removeItem('apex-rush-save')` om de lokale save te resetten.

## Afbeeldingen

Alle game-afbeeldingen zijn lokale SVG-bestanden in `public/assets/`. Ze worden door de app geladen vanaf `/assets/...`; er wordt geen externe image-CDN gebruikt. De productiebuild kopieert deze bestanden naar `dist/assets/`.

## GitHub → Render

1. Maak een lege GitHub-repository en push deze projectmap.
2. Maak in Render een **Static Site** vanuit die repository.
3. Render gebruikt `render.yaml`: build command `npm install && npm run build`, publish directory `dist`.
4. De frontend kan zonder backend worden gedeployed; de online marktplaats blijft dan in de preview-modus.

## Supabase voorbereiden

1. Maak een Supabase-project.
2. Voer `supabase/migrations/202611050001_init_apex_rush.sql` uit in de SQL Editor.
3. Kopieer `.env.example` naar `.env.local` en vul `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` in.
4. Voeg dezelfde variabelen toe aan Render als environment variables en deploy opnieuw.

De migratie maakt spelersprofielen, wallets, auto's, bandenvoorraad en marktplaatsaanbiedingen aan. Nieuwe spelers krijgen een starterauto, 12.000 credits en drie Basic-bandensets. Markttransacties gebruiken server-side SQL RPC-functies (`apex_create_listing`, `apex_buy_listing`, `apex_cancel_listing`) en RLS. De browser krijgt geen directe schrijfrechten op wallet- of inventaristabellen.

**Belangrijk:** de huidige race-economie en save draaien nog lokaal; het invullen van Supabase-keys activeert dus niet automatisch accounts, cloud saves of live trading. Koppel de race- en inventory-acties eerst aan de beveiligde database/RPC-laag voordat de marktplaats publiek wordt geopend. Dit voorkomt dat spelers via aangepaste browsercode credits of items kunnen vervalsen.

## Tests

```bash
npm test
```
