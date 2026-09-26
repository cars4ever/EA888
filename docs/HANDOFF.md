# EA888 LAB — handoff (stand na v1.23.0)

Lees dit eerst bij een nieuwe sessie (ook op een eigen server). Daarna `CLAUDE.md` (productdoel en regels) en
`docs/DEVLOG.md` (per versie wat en waarom, secties 1–28).

## Stand van zaken

- Repo `cars4ever/EA888`, werkbranch **`claude-dev`** (nooit direct op `main` werken of mergen).
- Laatste release: **1.23.0 (versionCode 330)**, `version.json`. Package `nl.randy.ea888lab.stabl`.
- Tests: `node tests/test_sim.js` (alle suites, ~15 min), browser-smoke groen.
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
| `src/web/scirocco.js` | de 3D-Scirocco: gescande carrosserie (`src/assets/models/scirocco-body.glb`) plus de procedurele loft als ghost/fallback, wielen, lampen, uitlaatankers |
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

## Volgende stap

In 1.23.0 stapelt compound eindelijk drukverhouding (DEVLOG 28): de HP-trap werd uitgeschakeld zodra de
LP-turbo niet spooling-gelimiteerd was, surge werd als bovengrens op laaddruk behandeld en de eerste trap had
geen wastegateregeling. Daarmee haalt `compound2500` 2533 pk uit twee liter. Er zijn zeven motorswaps, elk een
blok met eigen cilinderaantal, boring, slag en kop; `swapEngine: true` laat het blok zijn eigen slag houden.

Open in de simulatie, op volgorde van hoe erg:

1. **EGT reageert niet op verrijking.** Op de tweeliter-compound staat hij op 1523 °C en beweegt nauwelijks
   tussen lambda 0,85 en 0,60. Het cyclusmodel heeft daar een reden voor (bij 11 bar tegendruk kan het gas
   niet uitzetten) en de V8 met open headers zit gezond op 800-860 °C, maar verrijking hoort de belangrijkste
   EGT-knop te zijn, en niets in het model zegt dat een turbinewiel bij 1050 °C smelt.
2. **Een standaardmotor scoort ~47 betrouwbaarheid.**
3. **De swaps gebruiken de EA888-ladders voor krukas, kleppentrein en afdichting** als "voorbereidingsniveau",
   niet als onderdelen die er echt op passen. De presets kiezen verstandig; een speler kan nog iets bouwen dat
   niet kan bestaan.
4. `tools/risk_breakdown.js` print waar een betrouwbaarheidsscore vandaan komt, en `tests/test_parts_data.js`
   vangt onderdelen die stilzwijgend op OEM-fysica terugvallen. Gebruik beide bij elke verdere wijziging.
5. Onderdelen toevoegen gaat via `tools/parts_edit.py`, niet met tekstvervanging in de JSON-regel van
   `sim.js`. Vier categorieën (head, air, exhaust, boostControl) hebben óók een entry nodig in
   `data/engine/heads.json` of `data/turbo/charge-system.json`, plus `node tools/build_engine_data.js` /
   `node tools/build_turbo_data.js`.

## Eerder: de simulatiebijstelling van 1.22.0

De simulatie is in 1.22.0 herijkt naar wat de eigenaar na een uur spelen meldde (DEVLOG 27): de tuner zet
elf instellingen in plaats van zes en noemt ze bij naam, er is een doel "zoveel mogelijk pk bij 80
betrouwbaarheid" (haalt 507 pk op de eigen build), de betrouwbaarheidsscore straft een werkende klopregelaar
en toegestane toeren niet meer af, en compound geeft de HP-trap over via de asbalans in plaats van via een
schema.

Open in de simulatie:

1. **K04-hybride en 3 bar.** Het wiel haalt op de motor 2,44 bar overdruk (3,44 bar absoluut); de
   gemodelleerde map zelf stopt bij `prTop` 3,75 (= 2,75 bar overdruk), zie `data/turbo/modeled-turbos.json`.
   3 bar absoluut zit er dus ruim in, 3 bar overdruk (PR 4,0) ligt boven deze map. Vraag de eigenaar welke
   van de twee hij bedoelt voordat `prTop` omhoog gaat — het is een gemodelleerde map, geen fabrikantsmap.
2. **Een standaardmotor scoort ~47 betrouwbaarheid** en standaard-EGT blijft rond 980 °C zonder te reageren
   op verrijking via lambda. Modelgaten, geen balans.
3. `tools/risk_breakdown.js` print waar een score vandaan komt; gebruik dat bij elke verdere herijking in
   plaats van op gevoel te schuiven.

## Volgende stap (auto)


De auto is sinds 1.18.0 een scan die de eigenaar zelf maakte (DEVLOG 23), inclusief zijn eigen wielen, die
via `tools/car3d/split_car.py` op de aslijn van het spel worden afgesneden zodat ze blijven draaien.

Wat nog open staat:

1. **Geen panelnaden** (deuren, motorkap, tankklep). In Blender in te snijden, of laten zitten.
2. **De voorspoiler heeft een gerafelde onderlip** waar `split_car.py` hem op 0,075 m afsnijdt.
3. **Framekosten op een echt toestel zijn nooit gemeten.** 38k driehoeken per frame op de hoogste stand
   tegen 14,6k op de laagste (die rijdt het procedurele model). De kwaliteitsstand staat in de instellingen.
4. ~~Textuur~~ — gedaan in 1.19.0. De carrosserie draagt nu de fototextuur (`tools/car3d/textured_car.py`).
   Kentekens worden dáár geblankt, via de mesh (de vlakken op de bumpers) en niet op kleur — in de atlas is
   de plaat niet geel. Wat nog blijft: bleke plekken op de voorbumper die de ontglans-stap niet haalt.
5. **De wielen komen nog uit de ongetextureerde scan** (die is 360k tegen 40k, dus scherper). Een
   getextureerde run op hogere octree zou ze in één model kunnen brengen.

**Wat een goede scan oplevert** (gemeten, DEVLOG 25): egale middengrijze achtergrond, gelijkmatig licht of
schaduw, droge auto, vier haakse aanzichten uit één sessie. Octree 512, ~50 stappen, guidance 5, vaste seed,
Simplify Mesh uit. Twee runs: `Gen Textured Shape` voor de lak én `Gen Shape` voor de wielen — de
textuurstap hermesht altijd naar 40k, en daarin zijn de wielen een paar honderd vlakken.

Na elke nieuwe scan opnieuw opmeten (niet overnemen): de achterlichtband met `probe_tail.py` en de
uitlaatmonden die `split_car.py` print.

De multi-view UI staat op **http://192.168.2.72:7870/** (container `hunyuan3d-2mv`, herstart automatisch).
Tik links de tab **MultiView Prompt** aan, anders blijven de vier invoervakken verborgen. Wat werkte:
vier views die elkaar niet tegenspreken — één sessie, egale achtergrond — belangrijker dan hoge instellingen.

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
- De gescande carrosserie heeft geen scherpe koplampen/grille en geen panelnaden (DEVLOG 21); de voorkant
  is de zwakke kant. Op de laagste kwaliteitsstand rijdt het procedurele model (36k driehoeken per auto
  tegen ~7k).
- De foto's van de eigenaar staan **niet** in de repo. Wordt er ooit textuur gebakken, dan eerst de
  kentekens eraf met `tools/erase_plates.py` (vakken met het oog controleren; de automatische detectie
  vond ze in deze set niet betrouwbaar).

## Afspraken en regels

- Antwoorden aan de eigenaar in het Nederlands.
- Nooit geheimen (keystore, wachtwoorden, tokens) committen of in chat vragen.
- Geen auteursrechtelijk beschermd materiaal (YouTube-audio, boekteksten) in de app; alleen als inspiratie.
- Het kenteken van de eigenaar nooit tonen (3D-plaat is blanco; foto's zijn bewerkt met `tools/erase_plates.py`).
- Het is een engineering-geïnspireerde simulator, geen gecertificeerde tuningsoftware.
