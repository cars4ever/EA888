# Voertuigintegratie 1.29.0 — audit

Uitgangspunt: `540c0fbc7f331405f40600fca2b7c763eb738313`, branch `claude-dev`, werkboom aanvankelijk schoon. De actuele repository is `/home/scirockoe/projects/ea888/EA888`; de bovenliggende map is geen tweede projectkopie. Bestaande brondata en calibratie zijn behouden. Geen force/reset/clean/push of dependency-/driverupdates uitgevoerd.

Herstelpunt: `../work/cleetus/backups/20261008T180255Z/` bevat uitgangsstatus, patch en configuratiearchief. Er waren geen bereikbare gebruikersbrowser- of toestelsaves op deze server. Daarom bewaart de app vóór haar voertuigsave-migratie bovendien één exacte kopie in `<storage_key>_before_vehicles_v1`. QA-tests schrijven uitsluitend in tijdelijke browserprofielen.

## Assets en verwerking

Het aangeleverde ZIP-bestand is gecontroleerd op paden, symlinks, inhoud en SHA-256. Hash: `e47148c85682764d6507b0a95f2d051c45cbd34bad5503383f6f1cc2481cf758`. De vijftien oorspronkelijke PNG-bestanden en LEESMIJ blijven byte-identiek in `../work/cleetus/references/Cleetus_Hunyuan3D_5_Cars/`. Alle hashes staan in `data/vehicle-assets/manifest.json`.

Aangetroffen installatie: `/home/scirockoe/n8n-docker/hunyuan3d-2.1`, image `hunyuan3d-21:2.1-cu124`, upstream `82920d643c0dc2f7bfd7255f45f62d386edfe60c`. Checkpoint `tencent/Hunyuan3D-2.1`, revisie `0b94677654c57bb9a6b6845cd7b704ccf551d327`, daadwerkelijk `hunyuan3d-dit-v2-1/model.fp16.ckpt`. Permanente cache: `/home/scirockoe/n8n-docker/hf-cache`.

Volgens [Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) en de lokale pipeline is dit een single-image-model. De [2.0 multiviewvariant](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) is geen ondersteuning voor deze drie schuine camerahoeken. **Alleen front_3q** is neurale shape-/paintinput. Side/rear_3q dienen voor inspectie en expliciete textureprojectie (Jackstand-achterruit, McFlurry-zijlivery). Paint genereert intern zes eigen camerazichten; dat betekent niet dat zes aangeleverde foto's zijn gebruikt.

Voorbewerking: RGBA geïnspecteerd, losse alpha-restjes verwijderd in afgeleiden, 12% marge, proportioneel naar 1024 × 1024. Geen originelen overschreven of contact sheet als reconstructie-input gebruikt. Eén shape-seed per auto: 240, 50 stappen, guidance 5, octree 384, chunks 4000. Paint: bestaande PBR-pipeline, seed 0, zes views, 512 renderresolutie. Shape en paint draaien in afzonderlijke processen met file lock, geheugencontrole, timeout en hergebruik van resultaten.

Na hervatten was 23.696 MiB vrij op de RTX 3090 (427 MiB in gebruik). Andere jobs zijn niet gestopt. Gemeten shape-piek circa 7.814 MiB; paint maximaal circa 9.567 MiB PyTorch-allocatie (native/driverallocaties komen daar bovenop). DINO gaat na conditioning terug naar CPU; VAE slicing/tiling staat aan. Bij de Jackstand-proef was meer geheugen bezet: paint is toen eveneens met offload gelukt. De eerste automatische GLB-conversie eindigde op `ModuleNotFoundError: No module named 'bpy'`; de voltooide OBJ/PBR-bestanden zijn met de aanwezige officiële PBR-converter omgezet. De 1,24 s in diens herstelstatus betreft **alleen conversie**, geen nieuwe textuurgeneratie.

Neutrale renders en gamebeelden zijn gecontroleerd. Belangrijke reparatie: UV-seamvertices eerst lassen vóór fragmentverwijdering; anders ontstonden gaten door verwijderde UV-eilanden. Baked wielen zijn met echte cilindrische meshverschillen verwijderd. Vier ronde banden/velgen staan op de bestaande simulatie-assen met afzonderlijke stuur-/spinpivots en vaste remklauwen. Mullet kreeg een open laadbak en opnieuw opgebouwde buizen/wieliebars. Detailkeuzes en resterende benaderingen: `VEHICLE_ASSET_BRIEFS.md`.

| Auto | Runtime driehoeken | GLB normaal | GLB laag |
| --- | ---: | ---: | ---: |
| Jackstand | 29.624 | 524.228 B | 257.904 B |
| Eagle | 29.616 | 480.544 B | 253.424 B |
| Mullet | 30.159 | 398.104 B | 214.096 B |
| McFlurry | 34.152 | 582.972 B | 321.872 B |
| Lumberjack | 29.704 | 555.772 B | 288.964 B |

Masters (`master.blend`, `master.glb`), ruwe meshes, 2048-PBR-texturen, inputs en staplogs staan per carId in `../work/cleetus/`. Runtimebestanden staan in `src/assets/models/`, thumbnails in `src/assets/images/vehicles/`. High: carrosserie circa 24k driehoeken en 1024-texturen; low: circa 10k carrosserie en 512-texturen, plus dezelfde wielrig en details. Meshopt-decoder is al aanwezig; WebP wordt door GLTFLoader/browser geladen. Alle textures zitten in de GLB. Alleen actieve auto en eventuele rivaal worden geladen. Geen GPU-server of lokaal ontwikkelpad is een runtimevereiste.

## Selectie, saves en simulatie

Nieuw spel toont zes eigen kaarten en een 3D-preview, specs met bestaande kwalificaties, prijs/status en een expliciete bevestiging. Normaal startbudget: €50.000. Scirocco inbegrepen; Lumberjack €6.602; Jackstand €12.231. Eagle, Mullet en McFlurry blijven gesloten omdat het onderzoek geen prijs geeft. Het zijn dus **drie beschikbare carrièrestarters**, geen zes gratis keuzes. De betaling vindt eenmaal plaats vóór `starterSelection=complete` wordt opgeslagen.

Het aparte QA-profiel (`?profile=vehicle-qa`, knop in nieuwe-carrièrekeuze en instellingen) bezit de vijf auto's en krijgt op gebruikersverzoek **€10.000.000**. Bestaande QA-profielen krijgen die aanvulling eenmaal (`qaCashVersion=1`); latere aankopen blijven afgeschreven. Carrièrekey blijft `ea888_lab_v120_state`; QA gebruikt `ea888_vehicle_qa_v1`. Terug naar carrière wisselt namespace, zonder overzetten van geld/saves.

Saveversie `vehicleSaveVersion=1` migreert oude saves als reeds begonnen. Geld, upgrades, records en slijtage blijven behouden. Onbekende actieve IDs vallen zichtbaar terug naar Scirocco; het onbekende garagerecord blijft bewaard. De migratie is idempotent. Motor/Tune/Dyno voor rosterauto's tonen expliciet de beperking en blokkeren verkeerde mutaties; Service gebruikt alleen de bestaande revisie van die auto. De vijf auto's gebruiken hun bestaande carId, motorkromme, converter/bak, gewicht, banden en onderzoeksversie.

De renderer laadt per carId, voorkomt late callbacks na wisselen en deelt geen wijzigbare materialen. Een ontbrekend model toont een oranje wireframe plus foutmelding. Burnout, staging, run en replay gebruiken dezelfde mapping; wielspin/sturen/vering volgen de runtimewaarden. V8-geluid gebruikt acht cilinders in de bestaande synthese; bij ontbrekende AudioWorklet worden V8-lagen met diezelfde synthese gemaakt. Het zijn **geen echte voertuigspecifieke opnames**. Scirocco houdt het bestaande viercilindergedrag.

## Bouwen en starten

Webbuild: `python3 tools/build_web.py` (ook `npm run build:web`). Output `build/web/`. JS/CSS krijgen versieparameters; de model-URL heeft een assetversie. Er is geen service worker. Android blijft `nl.randy.ea888lab.stabl`, versie 1.29.0 / code 390, dezelfde WebViewAssetLoader-origin en signing key. `tools/build_android.py --skip-web` verpakt exact de reeds geteste webbuild; normale build zonder vlag bouwt alles opnieuw.

APK: `dist/EA888-Lab-1.29.0.apk` (9,08 MB), AAB naast de APK. De bestaande Android-startroute is behouden. Op deze server is geen actieve EA888-webserver of gedocumenteerd gamepoortnummer gevonden. De vraag naar het bestaande browser-startcommando/poort staat nog open. Er is geen alternatieve permanente server gestart en geen poort van een ander project gewijzigd. Daarom kan het opnieuw laden via een bestaande externe webstartroute nog niet worden bevestigd.

## Verificatie

Baseline: volledige `tests/test_sim.js` en bestaande browser-smoke geslaagd. Na wijzigingen: volledige simsuite geslaagd, audio inclusief V8-eventtest geslaagd, voertuig-/prijs-/save-/GLB-test geslaagd. Voor exact dezelfde configuraties zijn kwartmijl, trap, 60 ft en achtste mijl vóór/na vergeleken voor alle vijf plus Scirocco: **delta exact nul** (`reports/vehicle-physics-comparison.json`).

Jackstand heeft eerst een volledige desktopproef doorlopen, daarna een proef via de gewone auto-pass-knop met burnout/staging/run/resultaat/replay en herstart. Mobiele browserregressie controleert starterkoop, één afschrijving, oude save, onbekend ID, QA-geld, snel wisselen, ontbrekend model, stale werkplaatsevents, materiaalisolatie, resourcevrijgave, wielspin en stuurbeweging voor verschillende speler-/rivaalparen. Three r186 houdt één gedeelde DFG-LUT-texture vast; voertuigresources keren terug naar nul geometrieën en die ene basistexture.

Definitieve vijf-auto-acceptatie: **geslaagd**, vijf volledige runs via de gewone auto-pass-knop, met burnout/staging, uitslag, replay, herstart, werkplaatsschermen en vijf opeenvolgende auto's in één QA-profiel. `reports/vehicle-acceptance-final/smoke.json`: 661,26 s, geen paginafouten. Beelden/video's: `reports/vehicle-acceptance-final/index.html`; per carId `preview-360.mp4`, front/side/rear, clay, burnout, race en replay PNG. `race-clip.mp4` is een 20 s-fragment uit de opgenomen gamesessie.

De brede Scirocco-test controleerde ook handmatig sturen/schakelen, meerdere races, opponent, audioherstel, ALS, dyno-abort, import/export en het kopen/rijden van Jackstand. Een oude test zocht letterlijk de Engelse audionaam; die controle is vervangen door daadwerkelijke synthese/eventcounts. Definitieve herhaling: **145/145 checks geslaagd**, geen paginafouten of onverwachte consolefouten (`reports/vehicle-scirocco.json`). Na de laatste automaatlabels/limiterfix is de mobiele regressie opnieuw geslaagd, inclusief echte V8-audio (3.795 ontstekingsevents), automaatweergave en terugkeer naar de bestaande carrière. Testplatform is Chromium met SwiftShader, ook mobiele emulatie. Geen emulator, aangesloten Android-toestel of S24 Ultra getest; geen hardware-FPS-claim.

APK-pakketcontrole: **66/66 webbestanden byte-identiek**, twaalf GLB-bestanden (tien nieuwe plus twee bestaande Scirocco), geen ontwikkelserver-URLs. SHA-256: `1a34ec162c07aa77d2d8cab83562144ee863787f0c6db8cabfca3159666c9cf6`. Het certificaat blijft `74a2076d8d964584dadcb233eb5cd832de144a92173a1c74e4092fa0b3f1affb` (v2/v3). Package-id en versie zijn met `aapt2` gecontroleerd. De niet-blokkerende SDK-waarschuwing over XML-versies 3/4 komt uit de bestaande toolinstallatie; build en signature-verificatie slagen. Machineleesbare samenvatting en loghashes: `data/vehicle-assets/acceptance.json`.

## Reproduceren

```bash
python3 tools/car3d/import_references.py /pad/naar/Cleetus_Hunyuan3D_5_Cars_15_Views.zip ../work/cleetus
python3 tools/car3d/prepare_roster.py --references ../work/cleetus/references/Cleetus_Hunyuan3D_5_Cars --out ../work/cleetus
python3 tools/car3d/process_roster.py shape crc12_jackstand_240
python3 tools/car3d/process_roster.py paint crc12_jackstand_240
python3 tools/car3d/process_roster.py fit crc12_jackstand_240
# Inspecteer master en daadwerkelijke game; pas daarna dezelfde drie stages op de overige vier toe.
python3 tools/build_web.py
node tests/test_vehicle_assets.js
python3 tools/vehicle_regression.py
python3 tools/vehicle_smoke.py --out reports/vehicle-acceptance-final --video
```

Grote tussenbestanden/checkpoints worden niet aan Git toegevoegd. Originele invoer en masterresultaten blijven op deze server herstelbaar bewaard; het compacte manifest staat wel in Git.

## Opgeleverde commits en resterende beperkingen

- `46850d6`: reconstructies, rigs, high/low GLB's, thumbnails, manifest, reproduceerbare verwerking.
- `c58a457`: centrale voertuigidentiteit, starterkeuze, save/QA-isolatie, race/showroom/audio, werkplaatsbescherming.
- `5f5ed53`: automaatweergave, actieve limiterconfiguratie en terugkeer vanuit QA.
- `8de646e`: regressietools, browser/audio/assettests, bestaande web-/Android-buildroute en versie 1.29.0 / 390.
- De afsluitende documentatiecommit bevat dit verslag en `data/vehicle-assets/acceptance.json`; terug te vinden met `git log -1`.

Concreet open: oorspronkelijke externe webstartpoort/command onbekend; echte Android-toesteltest niet uitgevoerd. Sommige kleine decals en lamp-/hardwaredetails blijven benaderingen van de AI-referenties; lampdetails zitten deels nog in de PBR-atlas. Alle vijf hebben wel echte volumetrische meshes en zijn als afzonderlijke auto's door garage en race getest. Niet-bewerkbare roster-tuning wordt expliciet geblokkeerd.
