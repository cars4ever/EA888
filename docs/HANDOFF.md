# EA888 LAB — handoff (stand na v1.16.0)

Lees dit eerst bij een nieuwe sessie (ook op een eigen server). Daarna `CLAUDE.md` (productdoel en regels) en
`docs/DEVLOG.md` (per versie wat en waarom, secties 1–20).

## Stand van zaken

- Repo `cars4ever/EA888`, werkbranch **`claude-dev`** (nooit direct op `main` werken of mergen).
- Laatste release: **1.16.0 (versionCode 260)**, `version.json`. Package `nl.randy.ea888lab.stabl`.
- Tests: `node tests/test_sim.js` (alle suites, ~15 min), browser-smoke 136/136.
- Commits klein en logisch, elke stap gepusht; iedere bugfix krijgt een regressietest die het fysische of
  toestands-invariant uitdrukt (niet alleen "groen maken").

## Architectuur (kort)

| Bestand | Rol |
|---|---|
| `src/assets/sim.js` | canonieke state, onderdelen, dyno (`simulateEngine`), race-/burnout-runtime, advies, map-optimizer |
| `src/assets/turbo.js` | compressormaps, turbomatching (`matchEngine`), compound in serie (`matchCompound`) |
| `src/assets/engine.js` | cyclusmodel (VE, verbranding, klop, frictie) |
| `src/assets/app.js` | UI, spelverloop, audio, dyno-/race-schermen |
| `src/assets/engine-voice.js` | realtime motorgeluid (AudioWorklet) |
| `src/web/race3d.js` | three.js-racebaan, camera's, rook/vlammen, replay |
| `src/web/scirocco.js` | **procedurele 3D-Scirocco Mk3** (loft van doorsneden) — hier komt het Hunyuan3D-model |
| `data/turbo/*.json`, `data/engine/*` | turbo- en motordata met herkomst (`mapType`) |
| `tools/` | builds, smoke-test, `car_preview.py` (3D-auto), `track_preview.py` (baan, per kwaliteitstier), `browser_env.py` (headless Chromium), `car3d/` (foto's → Hunyuan3D → Blender → GLB), `erase_plates.py` (kenteken weg) |

## Commando's

```bash
npm install                                   # esbuild, three, morphdom
node tests/test_sim.js                        # alle simulatietests
python3 tools/build_web.py --no-images        # build/web
python3 tools/browser_smoke.py --assets build/web --dpr 1 --screenshots /tmp/shots --report /tmp/smoke.json
python3 tools/car_preview.py --out /tmp/car   # 3D-auto van 6 kanten (rear, chase, side, front34, rear34, top)
```

- De smoke-test duurt ~25 min. `--dpr 1` op trage software-GL-hosts (headless 3D ~1 fps); met een echte GPU kan
  de standaard `--dpr 2`.
- Headless Chromium: `tools/browser_env.py` zoekt hem via `$EA888_CHROMIUM`, dan de eigen build van
  Playwright (`python3 -m playwright install chromium`), dan de systeempaden. Niets meer aan te passen.
- Baan bekijken zonder de hele app: `python3 tools/track_preview.py --out /tmp/track --quality high`
  (acht vaste punten op de baan; `--quality high|medium|low`).

## Release bouwen (getekend)

```bash
EA888_KEYSTORE=/pad/naar/ea888-lab-release.jks EA888_KEY_ALIAS=ea888lab EA888_KEY_PASSWORD='…' \
ANDROID_HOME=/pad/naar/android-sdk python3 tools/build_android.py
# -> dist/EA888-Lab-<versie>.apk en .aab
```

- Het certificaat moet SHA-256 `74a2076d8d964584dadcb233eb5cd832de144a92173a1c74e4092fa0b3f1affb` zijn, anders
  installeert de update niet over de bestaande app.
- Keystore en wachtwoord staan **niet** in de repo (en mogen er nooit in). De eigenaar heeft
  `ea888-lab-release.jks` + `ea888-lab-release-key.txt`; zet ze op de server buiten de repo.
- Android SDK: `tools/setup_android_sdk.sh`.

## Volgende stap: vier nieuwe foto's, dan de auto opnieuw met multi-view

De pipeline staat (`tools/car3d/`, zie de README daar) en is gemeten; DEVLOG 20 zegt wat er uit kwam.
Kort: uit één schone zijfoto komt een goede Scirocco-silhouet, maar voor- en achterkant zijn verzonnen, en
multi-view werd **slechter** omdat er geen recht-van-voren foto is. Afgesproken met de eigenaar:

1. Vier foto's in **één sessie**: recht van voren, recht van achteren, links haaks, rechts haaks. Zelfde
   rijhoogte, egale achtergrond (muur/garagedeur), droog, van een afstand met een lange brandpuntsafstand.
   In `src/assets/images/` zetten en eerst door `tools/erase_plates.py`.
2. `docker start hunyuan3d-2mv` (staat klaar op poort 7870 met het gepatchte multi-view model; laden duurt
   een paar minuten, `docker logs` zegt "Models Loaded"). Let op het geheugen: met beide Hunyuan-containers
   tegelijk zit 64 GB RAM vol — stop `hunyuan3d-21` als je hem niet nodig hebt.
   Dan `python3 tools/car3d/prep_inputs.py` en `gen_shape.py mv --port 7870 --octree 384`.
3. `postprocess.py` (let op `--yaw`, zie `probe.py`), `render_views.py`, vergelijken met de foto's.
4. Pas daarna integreren in `buildScirocco()`; het procedurele model blijft fallback en ghost-auto.

Valt het opnieuw tegen: een gekocht Scirocco Mk3-model (Sketchfab/CGTrader, €30–150, licentie moet
app/game-gebruik toestaan) door dezelfde stappen 3–5 hieronder.

## Achtergrond: de oorspronkelijke Hunyuan3D-2-opzet (stappen 3–5 gelden nog)

Doel: het procedurele model in `src/web/scirocco.js` vervangen door een echt 3D-model van Randy's blauwe
Scirocco, zonder de physics-koppeling te breken.

1. **Hunyuan3D-2 installeren** (github.com/Tencent/Hunyuan3D-2). Vorm (DiT) past ruim in 24 GB VRAM; de
   texture-stap (Paint) ook. De Gradio-app of de Python-API gebruiken; image-to-3D.
2. **Invoerbeelden**: gebruik de al kenteken-vrije foto's in `src/assets/images/`:
   `randy-scirocco-side.png`, `randy-scirocco-cutout.png` (zij, al vrijstaand), `randy-scirocco-hero.jpg`
   (3/4 voor), `randy-scirocco-rear-photo.png` (achter). Achtergrond verwijderen (rembg) vóór invoer. Multi-view
   (voor/zij/achter) geeft een beter resultaat dan één foto.
3. **Nabewerken in Blender (headless, `blender -b -P script.py`)**:
   - schalen naar de echte maten: lengte 4.256 m, breedte 1.810 m, wielbasis 2.578 m, spoor 1.57 m,
     wielstraal 0.323 m; auto kijkt naar **−Z**, y omhoog, x = 0 middenlijn, grond op y = 0;
   - wielen wegknippen (we houden de procedurele wielen, die draaien los en veren);
   - symmetrisch maken, gaten dichten, decimeren naar ~40–60k driehoeken, textuur 2048² bakken;
   - lak op Randy's blauw (`0x1f4fd8`), glas donker, achterlichten als apart materiaal (worden de remlichten);
   - export GLB; daarna `gltf-transform optimize` (meshopt/Draco + KTX2/webp) naar < 3 MB.
4. **Integratie** in `buildScirocco()` (`src/web/scirocco.js`): GLB laden met `GLTFLoader` (three/addons),
   in `body` hangen; behouden: `wheels` (4 groepen), `tips` (uitlaatankers voor vlammen, zet ze op de
   uitlaatmonden van het model), `tailMat` (achterlicht-materiaal, emissive voor remlicht), geen kenteken of een
   blanco plaat. Het procedurele model blijft als fallback als het laden faalt of voor de ghost-auto.
5. **Controleren** met `tools/car_preview.py` (vergelijk met de foto's) en de smoke-test; let op de framekosten
   op de telefoon (het oude model ~240 ms/frame in software-GL als referentie; zie `perf`-meting in DEVLOG 17).
6. Eerlijke verwachting: Hunyuan3D is goed voor objecten; een auto met strakke lijnen kan zachte randen en
   rommelige panelen krijgen. Valt het tegen: een gekocht Scirocco Mk3-model (Sketchfab/CGTrader, €30–150,
   licentie moet app/game-gebruik toestaan) door dezelfde stappen 3–5.

## Daarna (afgesproken volgorde)

1. ~~Licht en sfeer in `race3d.js`~~ — gedaan in 1.16.0: bloom, foto-asfalt/beton (Poly Haven CC0),
   belichte rook, spiegeling in de waterbak, kwaliteitstiers per onderdeel. Nog open: een echte nacht-HDRI
   (de procedurele omgeving is op de lichtmasten getekend en geeft de strepen over de lak, een generieke
   HDRI verliest die) en licht bakken met Cycles.
2. Baan: tribunes/publiek, lichtmasten, borden en startboom staan er procedureel; als model met gebakken
   licht (Blender Cycles op de GPU) kan het scherper.
3. Gameplay: online ghosts/tijdlijst, broadcast-replay, weer/baanconditie per raceweekend, carrièrediepte,
   turbinehuis-A/R als onderdeel.

## Bekende beperkingen (zie DEVLOG 19 en 20)

- Alle Precision-turbines hebben één middelgroot turbinehuis (geschaald naar wielmaat): grote turbo's
  (PT7675+) komen op 2.0 L laat op druk. A/R-keuze is de oplossing.
- Compound: geen interstage-intercooler; HP-compressor volledig in of uit de stroom.
- Headless smoke-test draait 3D in software-GL; echte telefoonprestaties op een toestel meten. De
  kwaliteitstier schakelt zichzelf terug bij >22 ms per frame (`opts.onQuality` meldt dat); dat is nog niet
  op een echt toestel gemeten.
- De 3D-auto is nog het procedurele model; de gegenereerde carrosserie haalde het niet (DEVLOG 20).

## Afspraken en regels

- Antwoorden aan de eigenaar in het Nederlands.
- Nooit geheimen (keystore, wachtwoorden, tokens) committen of in chat vragen.
- Geen auteursrechtelijk beschermd materiaal (YouTube-audio, boekteksten) in de app; alleen als inspiratie.
- Het kenteken van de eigenaar nooit tonen (3D-plaat is blanco; foto's zijn bewerkt met `tools/erase_plates.py`).
- Het is een engineering-geïnspireerde simulator, geen gecertificeerde tuningsoftware.
