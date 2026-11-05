# GitHub Pages — Apex Rush 404 oplossen

Deze reparatie zorgt dat GitHub Pages de Vite-build publiceert, relatieve bestandslocaties gebruikt en een lokale favicon heeft.

## 1. Werk de bestanden in je repository bij

1. Download `apex-rush-github-pages-fix.zip` en pak het uit.
2. Open GitHub Desktop.
3. Kies **File → Clone Repository…** en selecteer jouw bestaande Apex Rush-repository (als die nog niet lokaal staat).
4. Open via **Repository → Show in Explorer** (Windows) of **Show in Finder** (Mac) de lokale repositorymap.
5. Kopieer de inhoud van de uitgepakte ZIP naar deze lokale repositorymap. Kies **Replace/Overwrite** wanneer daarom wordt gevraagd. Laat de bestaande verborgen map `.git` ongemoeid.
6. Ga terug naar GitHub Desktop. Bij **Changes** moeten de bijgewerkte bestanden staan.
7. Vul als Summary in: `Fix GitHub Pages build and asset paths`.
8. Klik **Commit to main** (of **Commit to master** als jouw repository die branch gebruikt).
9. Klik **Push origin**.

## 2. Zet GitHub Pages op GitHub Actions

1. Open jouw repository op GitHub.com.
2. Klik bovenaan op **Settings**.
3. Klik links op **Pages**.
4. Zoek **Build and deployment**.
5. Zet bij **Source** de keuze op **GitHub Actions**.
6. Je hoeft geen branch en geen `/docs`-map te selecteren. De workflow bouwt de app en publiceert automatisch de map `dist`.

## 3. Controleer de build

1. Klik bovenaan in de repository op **Actions**.
2. Open de workflow **Deploy Apex Rush to GitHub Pages**.
3. Open de nieuwste run. De onderdelen **build** (inclusief tests) en **deploy** moeten groen zijn.
4. Klik op de Pages-link bij de deployment of open de URL die onder **Settings → Pages** staat.
5. Doe een harde refresh: `Ctrl + Shift + R` op Windows of `Cmd + Shift + R` op Mac.

## Belangrijk over multiplayer

GitHub Pages kan alleen de statische websitebestanden hosten. Het draait geen Node.js-server en geen WebSocket-server. Singleplayer kan hier werken. Voor multiplayer moet je de Node-service ook op Render deployen. Daarna kun je in GitHub bij **Settings → Secrets and variables → Actions → Variables → New repository variable** een variabele toevoegen:

- **Name:** `VITE_RACE_SERVER_URL`
- **Value:** de Render-service-URL, bijvoorbeeld `https://jouw-service.onrender.com` (zonder `/ws` en zonder slash achteraan)

Sla de variabele op en push een nieuwe commit of start de workflow via **Actions → Deploy Apex Rush to GitHub Pages → Run workflow**. De Pages-build verbindt dan de multiplayerclient met Render.

## Als je nog 404 ziet

Open de website, druk op `F12`, kies **Console** en klik op de rode fout. Kijk naar de volledige URL van de resource die 404 geeft. Na een geslaagde Pages Actions-deploy hoort de app de gebouwde bestanden uit `assets/` te laden, niet rechtstreeks `/src/main.jsx`. De favicon wordt geladen uit `favicon.svg`.
