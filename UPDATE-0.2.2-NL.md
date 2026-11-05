# Apex Rush 0.2.2 — update naar top-down circuits

Deze versie vervangt het oude pseudo-3D wegbeeld door drie echte, gesloten circuits die je van bovenaf ziet. De circuits hebben meerdere bochten, rood-witte kerbstones, start/finish, pitstraat, tribune en tegenstanders op dezelfde baan. De racephysics haalt de bochtbelasting uit de gekozen circuitgeometrie. De crates-showcase gebruikt nieuw lokaal SVG-artwork.

## Bestaande GitHub-repository bijwerken met GitHub Desktop

1. Download `apex-rush-v0.2.2-github-update.zip` en pak het uit.
2. Open **GitHub Desktop** en kies jouw bestaande Apex Rush-repository linksboven.
3. Klik op **Repository → Show in Explorer** (Windows) of **Repository → Show in Finder** (macOS).
4. Open de uitgepakte ZIP-map in een tweede venster.
5. Selecteer alle bestanden en mappen in de ZIP-map en kopieer ze naar de bestaande repositorymap. Kies **Replace / Overschrijven** als daarom wordt gevraagd.
6. Ga terug naar GitHub Desktop. Controleer dat de gewijzigde bestanden in **Changes** staan.
7. Vul bij Summary in: `Upgrade race visuals to top-down circuits`.
8. Klik **Commit to main**.
9. Klik **Push origin**.

> Kopieer de inhoud van de ZIP-map naar de repository-root. Zet de hele projectmap niet als extra submap in je repository en upload de ZIP niet zelf als websitebestand.

## GitHub Pages laten publiceren

1. Open jouw repository op GitHub.com.
2. Klik op **Actions**.
3. Open de nieuwste uitvoering van **Deploy Apex Rush to GitHub Pages**.
4. Wacht tot de stappen **Run game tests**, **Build app** en **Deploy to GitHub Pages** groen zijn.
5. Open de Pages-URL opnieuw en doe een harde refresh: `Ctrl + Shift + R` op Windows/Linux of `Cmd + Shift + R` op macOS.

Je hoeft de Pages Source-instelling niet opnieuw aan te passen als je bestaande Apex Rush-site al via de GitHub Actions-workflow wordt gepubliceerd.

## Wat is gewijzigd?

- `src/racing/track-layouts.js`: één bronbestand met drie gesloten circuitvormen.
- `src/racing/DrivingRace.jsx`: de raceweergave is nu volledig top-down.
- `src/racing/TrackMiniMap.jsx`: dezelfde circuits worden op de selectiekaarten getoond.
- `src/racing/physics.js`: bochtbelasting wordt uit de echte baanvorm berekend.
- `src/assets/apex-loot-crate.svg`: nieuw lokaal crate-artwork.
- `src/App.jsx` en `src/styles.css`: nieuwe circuitkaarten, crate-showcase en buildnummer.

## Controle

Voer lokaal `npm test` uit. De suite bevat nu 12 tests, waaronder controles op de gesloten circuits en de koppeling tussen baanvorm en physics. De GitHub Actions-workflow voert ook `npm run build` uit vóór publicatie.
