# Herstel na Android-audit — 1.31.0 (410), 10 oktober 2026

Actuele uitgangscommit: `ccf4d067658bba7c4e90949483c57553098aa2b4`, schone `claude-dev`. Audit-ZIP veilig uitgepakt onder `../work/audit-1.30/input/`; originele bestanden en gameplayvideo ongewijzigd. Eerst BEVINDINGEN.md, daarna Astra_reparatieopdracht.txt gelezen. Hashes staan in `../work/audit-1.30/input-manifest.json`. Herstelpunt met uitgangscommit, patch, configuratie en later de oorspronkelijke Jackstand-master/runtime: `../work/audit-1.30/baseline/`. Geen reset, nieuwe auto, enginewissel, checkpointdownload of GPU-generatie. Gebruikersjobs zijn niet gestopt.

## Budget en volledige saves

De **echte bestaande werkplaats** krijgt bij de eerste migratie minimaal €10.000.000, een hoger saldo blijft staan. `workshopBudgetVersion=1` voorkomt opnieuw aanvullen na uitgaven/herstart. Auto’s, onderdelen, montage, bench, tune, service, slijtage, schade, lachgas, dyno’s, records en voortgang blijven behouden. De telefoon-save is niet op de server beschikbaar: de APK voert deze migratie op het toestel uit bij openen. Er is dus geen claim dat het saldo op de telefoon al gewijzigd is.

v1.30 had één root-key zonder betrouwbare werkplaats/carrière-modus. Daarom blijft de oorspronkelijke localStorage-string ongewijzigd, komt er een volledige herstelkopie, én wordt een apart **onverhoogd carrièreprofiel** bewaard. Een nieuwe werkplaats begint met €10 miljoen; een nieuwe carrière met het bestaande €50.000. Autokosten worden eenmaal betaald. QA is een eigen profiel. Vrij bouwen wordt expliciet bij het profiel vermeld. Via Spelbeheer kan de gebruiker het werkplaatsbudget na bevestiging weer aanvullen; carrière/QA krijgen die knop niet. Geldmutaties verschijnen met voor/na-saldo in het logboek.

**Spelbeheer** staat boven garage, shop, tune en service: opslaan, dupliceren/opslaan als, nieuw profiel zonder wissen, profiel laden/verwijderen, vijf benoemde volledige slots, drie roterende autosaves, laatst bekende goede save en migratiekopie. Overwrite/delete vragen bevestiging. Het laatst gekozen profiel en de actieve auto keren terug bij herstart. Laden beëindigt oude race/audio/input/jobs. Buildpresets blijven apart.

Nieuwe opslag: `ea888-full-saves-v1` in IndexedDB. Snapshot en verwijzingen worden atomair gepubliceerd; SHA-256 controleert de payload, ongeldige/future imports worden geweigerd. Een mislukte schrijfactie vervangt de vorige geldige save niet. Ook een beschadigde huidige save blijft via het zichtbare herstelmenu herstelbaar. De bestaande `persistGarageState`/`restoreGarageState` en verliesloze codec blijven de serialisatiegrens; geen WebGL/audio/pointerstate. Native JSON-import/export kapt niet meer stilzwijgend af op vijf miljoen tekens; expliciete limiet 60 miljoen en zichtbare leesfouten.

## Auditbevindingen en reparaties

| Bevinding | Bewijs / status | Reparatie / grens |
| --- | --- | --- |
| Echt saldo laag ondanks eerder QA-budget | Aangetoond in video; opgelost in migratie en echte browser-root-save | Eenmalige werkplaatsaanvulling, geen reset of verborgen carrièreverruiming |
| Geen volledige profielen en herstelbare slots | Opgelost | Volledige snapshots en UI; tests met quota-/schrijffout, beschadiging, herstart en import |
| 245–255 °C oppervlak met “perfect grip” | Verwarrende tekst aangetoond; thermische reset niet aangetoond | Oppervlak, kern, griptemperatuur en **raming na 20 s koelen** apart benoemd. Geen clamp/reset. Continue thermische logs |
| Wisselende startaanwijzing | Gereproduceerd in code; opgelost | Eén bediening: volledig stagen, launch vasthouden, loslaten op groen. Cancel reset staging; vroeg loslaten blijft rood |
| RT −1,997 s | Niet op zichzelf een fout bewezen | Vroeg loslaten is reproduceerbaar als negatieve RT. Werkelijk getoond groenmoment en release gebruiken dezelfde monotone klok. ET start na beam-exit; rollout en ruwe duur afzonderlijk |
| DNF toont afgebroken tijd als kwartmijl-ET | Codefout bevestigd; opgelost | Alleen gepasseerde splits, geen ongehaalde ET/trap/totaal/delta; DNF toont afstand en duur. Geen record |
| Plotselinge vertraging buiten de lijn | Herhaalde onzichtbare snelheidsvermenigvuldiging bevestigd | Verwijderd. Lane-DNF eindigt bij ongeldigverklaring, zonder nep-botsing of extra remimpuls |
| Automaat toont “perfecte” handmatige shifts | Opgelost | Werkelijke automatische schakelingen benoemd |
| HUD, gas/N2O/rivaal overlappen; tabs afgekapt | Verbeterd en visueel gecontroleerd | Compacte hoofdmeters, techniek optioneel, gescheiden knoppen, volledige horizontaal scrollbare tabnamen, wielwaarden met spatie/eenheid |
| Verkeerde auto in race-overzicht / statische finishplaat | Opgelost | Geselecteerde live 3D-preview; finish gebruikt het laatste echte renderbeeld. Uitslag blijft staan tot de speler verdergaat |
| Jackstand platte lichtvlakken / felle achterruit | Gericht verbeterd | Afgeronde geprojecteerde lensbehuizingen, lensdikte/facetten, donkerdere gedrukte achterruit. Zachte bumpers/bodydetails blijven een beperking van de bestaande AI-mesh |
| Wielmaat verandert niet mee | Opgelost voor vijf V8-modellen | Achterbandbreedte/radius, centra, carrosseriehouding en wielomwentelingen volgen setup; calipers blijven stationair. Geen simdimensies aangepast |
| Scènemix: stationair te hard, abrupte finish | Verbeterd en gemeten | Zelfde bestaande mixer, lastafhankelijk niveau, gas volgt pedaal; 650 ms afbouw/opruimen, directe stop bij verlaten/pauze. Hardware bepaalt turbo-audio |
| ECU-tabellen openen geeft null/spark-fout | Extra echte fout gevonden in werkplaatstest | Ontbrekende tabellen lui opgebouwd met dezelfde corefunctie als de simulatie; handmatige maps blijven behouden. Geen turbo/VVT/elektronische brandstoftabel aangeboden zonder passende hardware |

Thermische controle bij 1,35 bar: drag radial na 6 s burnout circa 241 °C oppervlak / 51 °C kern, voorspelde griptemperatuur na 20 s circa 57 °C. Na 30 s circa 370 / 184 °C en voorspeld 171 °C: oververhit. Ook Pro Mod slick, korte/medium/lange burnouts en exacte overdracht naar de runtime gecontroleerd. Dit zijn bestaande modeluitkomsten, geen gemeten echte bandentemperaturen. `reports/audit-repair/thermal.json` bevat de waarden; de race bewaart fase, tijd, surface/core, voorspelling, druk, compound, slipenergie en gripfactor.

## Auto’s en bewijs uit de game

| Auto | Status | Geldige volledige QA-run in mobiele browser |
| --- | --- | ---: |
| Jackstand 240SX coupé | Bestaande eigen Hunyuan-mesh gericht afgewerkt; garage/race/replay/wielsetup getest | 9,885 s |
| Eagle Camaro | Bestaande eigen mesh behouden; garage/race/replay/wielsetup getest | 8,635 s |
| Mullet El Camino | Bestaande eigen mesh behouden; garage/race/replay/wielsetup getest | 10,350 s |
| McFlurry Foxbody coupé | Bestaande eigen mesh behouden; garage/race/replay/wielsetup getest | 10,479 s |
| Lumberjack El Camino | Bestaande eigen mesh/patina behouden; garage/race/replay/wielsetup getest | 10,695 s |
| Scirocco | Bestaande inhoud behouden; volledige regressierun/replay | 12,762 s |

Dit zijn specifieke QA-builds met koude starts in de directe runtimetest, geen nieuwe historische kalibratieclaims. De volledige burnout→stage→run-keten is daarnaast met Jackstand uitgevoerd (9,838 s). `sim.js` en de technische onderzoeksdata zijn niet gewijzigd. De bestaande ruisvrije werkplaats-/Scirocco-/tegenstanderfixture blijft binnen haar tolerantie.

Bewijsmap: `reports/audit-repair/`. `before/` bevat frames uit de aangeleverde video. `saves/` toont echte migratie, spelbeheer en herstel. `race/` bevat rear/overview/run/finish/replay voor alle zes, DNF, rood licht, hold/release en de laatste HUD. `race/jackstand-run.mp4` is een korte uitsnede uit de echte browseropname (geen mee-opgenomen audio). `jackstand-preview/jackstand-360.mp4` is het aangepaste runtime-model in de echte showroom. `models/` toont modelafwerking, ontbrekend-modelmelding, hardwarebeperkingen en tabnamen. De eerste screenshotcontrole leidde tot een correctie van lensvlakken die in de carrosserie vielen; alleen de gecorrigeerde modellen worden verpakt.

`audio/before.wav` en `audio/after.wav` komen uit de echte WebAudio-keten met identieke mixerinstellingen en gecontroleerde RPM/last-fasen. Stationair ging van circa −13,9 naar −24,7 dBFS RMS; belast stripgeluid bleef circa −16,1 dBFS. Dynocel en strip verschillen door de bestaande akoestiek; de originele telefoonvideo heeft andere bedrijfscondities en is geen directe numerieke A/B. Losse gelijk-volume-fragmenten staan in `audio/level-matched/` (−20 LUFS). RMS/LUFS bewijzen geen overtuigende echte V8-klank: dit blijft synthese, geen voertuigopname; beoordeling op de telefoonspeaker is nog een toestelcontrole.

## Testen en oplevering

Direct bewijs: [werkplaatsmigratie](../reports/audit-repair/saves/actual-legacy-workshop-migration.png), [spelbeheer](../reports/audit-repair/saves/game-manager.png), [DNF](../reports/audit-repair/race/dnf.png), [laatste HUD](../reports/audit-repair/layout/hud.png), [racevideo](../reports/audit-repair/race/jackstand-run.mp4), [360° showroom](../reports/audit-repair/jackstand-preview/jackstand-360.mp4), [audio vóór](../reports/audit-repair/audio/before.wav), [audio na](../reports/audit-repair/audio/after.wav).

De volledige `node tests/test_sim.js` is met exit 0 afgerond. De gerichte regressiereeks (save manager/codec, assets, garage, timing, dynoresultaten, audio, voertuig, burnout en fysica-audit) is ook groen. Aanvullend: 19 werkplaatschecks inclusief fysica-neutrale lazy ECU-initialisatie; daadwerkelijke koop/bouw/tune/bench/dyno/service/herstart voor alle vijf; volledige historie-stresstest (zes auto's × 20 dyno's × 30 races, 27.501.444 JSON-tekens); corrupte legacydata wordt niet gemigreerd naar een lege vervanging. De geïsoleerde UI-test constateerde eerst vijf null/spark-fouten; na reparatie is de volledige werkplaatstest opnieuw zonder page errors geslaagd.


Reproduceerbare nieuwe tests: `tools/audit_save_smoke.py`, `tools/audit_storage_stress.py`, `tools/audit_race_smoke.py`, `tools/audit_model_smoke.py`, `tools/audit_audio.py`, `tests/test_save_manager.js`, `tests/test_audit_thermal.js`. Werkplaatstest `tools/workshop_smoke.py` gebruikt nu de werkelijke profielopslag. Logs en compacte eindacceptatie staan onder `reports/audit-repair/` en `data/vehicle-assets/audit-repair-1.31.json`.

Getest op desktop Chromium/SwiftShader en mobiele emulatie 412×892. **Geen emulator, aangesloten Android-toestel of S24 Ultra-test.** Niet alle details van een handmatige telefoonrun zijn identiek gereproduceerd. Android compile/sign/package wordt wel gecontroleerd; alle verpakte webbestanden moeten bytegelijk zijn aan de geteste webbuild.

Build: `ANDROID_HOME=/home/scirockoe/android-sdk python3 tools/build_android.py --local-signing`. APK `dist/EA888-Lab-1.31.0.apk`; AAB gelijknamig; web `build/web/`. Installeer als update over de bestaande app, niet verwijderen. Package `nl.randy.ea888lab.stabl`, code 410, bestaande cert-SHA256 `74a2076d8d964584dadcb233eb5cd832de144a92173a1c74e4092fa0b3f1affb`. Geen signing identity vervangen. Bestaande versie-stamping en modelassetversie verversen de cache; geen service worker aanwezig. Er draaide geen game-HTTP-server die omgezet moest worden, geen alternatieve poort of publieke publicatie aangemaakt. SDK XML-versiewaarschuwing is niet blokkerend; SDK/dependencies niet blind bijgewerkt.

---

# Voertuigen en werkplaats 1.30.0 — audit

Uitgangscommit `ca84a3373f346fb68af5c1b3ef0d10929d681579`, schone werkboom op `claude-dev`. Herstelpunt buiten Git: `../work/workshop/backups/20261009T224617Z/` (status, lokale patch, configuratiearchief). Geen bereikbare gebruikerssaves op server/toestel; browsermigratie bewaart daarom een eigen kopie. Bestaande keystore, package-id, modellen en onderzoeksrecords zijn behouden. Onderstaande 1.29-sectie is de historische assetaudit; haar werkplaatsbeperking is in 1.30 opgeheven.

## Koopbare en bewerkbare auto's

Alle vijf gebruiken nu dezelfde werkplaatscyclus als Scirocco: onderdelen kopen/monteren, montagewaarden, zes benchtests, tune/ECU-tabellen, tuneradvies, dyno, race/replay, olie, revisie, lachgas en drie eigen buildslots. Model, sound en simulatie volgen de actieve carId. Een nieuwe dyno is vereist na motorwijzigingen. De motorweergave is een expliciet schematische V8; de garage/race gebruiken de bestaande afzonderlijke GLB's.

| Auto | Gekozen werkplaatsvariant | Carrièreprijs | Herkomst prijs |
| --- | --- | ---: | --- |
| Jackstand 240SX coupé | LS 6.0, PRC 237, carburateur, Powerglide, nominale 225 hp wet-N2O | €12.231 | bestaande berekening uit onderzoek |
| Lumberjack | turbo-LS, Precision 7675, C16; onbekende inhoud gemodelleerd als 6.0 | €6.602 | bestaande berekening uit onderzoek |
| McFlurry | Coyote, single 76 mm, E85 als expliciete werkplaatsaanname | €95.000 | geschatte spelprijs |
| Mullet | World Cup big block; onbekende interne maten gemodelleerd als 540ci | €200.000 | geschatte spelprijs |
| Eagle | PLR/AJPE 564ci Hemi, twin 98 mm, methanol | €450.000 | geschatte spelprijs |

Deze bedragen worden precies één keer afgeschreven; onvoldoende budget blokkeert de koop. Geen fictieve onderzoeksprijzen toegevoegd. Normaal startbudget blijft €50.000: Scirocco, Lumberjack en Jackstand passen daarin. De drie duurdere auto's zijn later koopbaar. QA blijft een apart profiel met €10.000.000 en alle vijf auto's; terugkeer naar carrière verandert geen carrièregeld.

## Onderdelen en fysica

`data/roster/workshop.json` breidt de bestaande database uit met 114 onderdelen en fitment voor LS, Coyote, BBC en Hemi. Bestaande passende turbo's, banden en overige generieke onderdelen worden hergebruikt. De shop, gebruikte aanbiedingen, presets, import, slots en tuneradvies controleren compatibiliteit. Blokpakketten sluiten de afzonderlijke krukas uit. Eigendom is per auto: een al gekocht onderdeel terugplaatsen is gratis. EA888-onderdelen verschijnen niet als passende V8-motoronderdelen.

Fabrikantreferenties staan per pakket in de shop en in de dataset (PRC/Texas Speed, Proline, Steve Morris, Holley, FTI en VP). De bron voor TKM gaf HTTP 403; er is geen prijs uit gehaald. Pakketprijzen, flow-/nokkencurves, mechanische limieten en ontbrekende maten blijven **modelwaarden**, geen fabrikantcertificering of voertuigspecifieke meting. Geen complete andere bouwversie binnengesmokkeld: McFlurry blijft Coyote en Mullet blijft de gekozen big-blockvariant, niet Godzilla/SMX.

Werkende fysische verschillen: acht cilinders, eigen geometrie/koppen/nokken, 8/16/32 poortinjectoren met regeldruk, carburateurcapaciteit met lagedrukaanvoer, C16 met afzonderlijke VP-eigenschappen, grotere olievulling/thermiek, converter en autogebonden overbrengingen. Pushrodmotoren krijgen geen fictieve VVT. Een atmosferische auto heeft nul boost, turbotoerental en turboslijtage; geen verzonnen compressormap. Jackstands turboconversie vereist eerst passende EFI en boostregeling. Brandstofcapaciteit en gemonteerde onderdelen begrenzen ook de racefysica.

De speler rijdt vanaf deze versie met zijn **eigen berekende build**, niet met de onveranderlijke historische vermogenskromme. De eerste maps zijn bruikbare spelafstellingen, geen nieuwe historische calibratie. Ruisvrije basisdyno's: Jackstand 595,954 pk, Lumberjack 1.101,018 pk, McFlurry 1.528,008 pk, Mullet 3.175,536 pk, Eagle 3.645,872 pk. Die getallen kunnen door onderdelen/tune/slijtage veranderen en zijn geen claims over de echte auto's. Er is geen ET-aanpassing uitgevoerd om deze werkplaatsbuilds naar een echte timeslip te dwingen.

De Scirocco stock/Randy-configuraties en vijf historische tegenstanderconfiguraties zijn tegen een uit `ca84a337` gemaakte fixture vergeleken: vermogen/koppel binnen 0,000001 en race-ET/trapsnelheid binnen 0,000000001. Ook de oude Scirocco-dynosignatuur blijft gelijk. `tests/fixtures/workshop-physics-baseline.json` bewaart die controle.

## Saves en isolatie

`garageSaveVersion=2` migreert idempotent. De Scirocco blijft de compatibele root-build en heeft `garage.scirocco`; elke V8 bewaart `garage.cars[carId].build`. Geld/career/settings blijven globaal; hardware, tune, montage, bench, olie, schade/slijtage, nitrous, dyno's, races, records en slots zijn per auto. Bestaande records, aankoopbedragen en defectstatus gaan mee. Een verkeerde opgeslagen build-identiteit kan de geselecteerde carId niet overschrijven; niet-passende onderdelen worden met melding hersteld. Onbekende IDs blijven bewaard en vallen zichtbaar terug naar Scirocco.

Vóór de eerste migratie wordt `<storage_key>_before_workshop_v2` bewaard indien de browser ruimte heeft. Grote meetreeksen worden verliesloos gecomprimeerd met lokaal verpakte `lz-string` 1.5.0 (MIT). Het maximale testprofiel met zes auto's × 20 dyno's × 30 races neemt circa 3,01 miljoen localStorage-tekens in, tegenover 55 MB ongecomprimeerde UTF-16-JSON. Chromium heeft dit met nog een miljoen tekens extra back-up werkelijk opgeslagen en alle geschiedenissen na herstart hersteld. Geld/hardware blijven gewone JSON. Exports zijn volledige, ongecomprimeerde JSON-back-ups. Beschadigde saves worden niet stilzwijgend overschreven; de UI vraagt om herstel. Quotafouten geven een exportmelding.

Wisselen sluit oude modals/undo en reset lokale bedieningswaarden. Late gebeurtenissen uit een andere werkplaats worden geweigerd. Tijdens actieve dyno/race/betaalde tunerjob kan niet worden gewisseld. Zo kan een bewerking geen andere auto aanpassen.

## Verificatie en build

Concrete test- en buildresultaten staan in `data/vehicle-assets/workshop-acceptance.json`. Bewijs blijft lokaal onder `reports/workshop-*`; grote videoframes en testprofielen worden niet aan Git toegevoegd. Relevante reproduceerbare opdrachten:

```bash
node tools/build_roster_data.js
node tools/build_engine_data.js
node tools/build_turbo_data.js
node tests/test_sim.js
python3 tools/build_web.py
python3 tools/workshop_smoke.py
python3 tools/workshop_storage_smoke.py
python3 tools/vehicle_regression.py
python3 tools/vehicle_smoke.py --cars crc12_jackstand_240 --out reports/workshop-first-chain --video
python3 tools/vehicle_smoke.py --cars eagle,mullet,mcflurry,lumberjack --out reports/workshop-races --video
python3 tools/browser_smoke.py --assets build/web --dpr 1 --screenshots reports/workshop-browser-shots --report reports/workshop-browser.json
ANDROID_HOME=/home/scirockoe/android-sdk python3 tools/build_android.py --local-signing --skip-web
```

Web: `build/web/`. Release: `dist/EA888-Lab-1.30.0.apk` en `.aab`, versionCode 400, dezelfde ondertekening en package `nl.randy.ea888lab.stabl`. JS/CSS krijgen versie 1.30.0; er is geen service worker. De Android-startroute en volledig offline verpakte assets blijven behouden. Er is opnieuw geen draaiende EA888-webserver of vastgelegde externe gamepoort gevonden; Music Factory-poorten zijn niet gewijzigd.

Platform van de UI-proeven: desktop Chromium en mobiele emulatie met SwiftShader. Geen echt Android-toestel, emulator of S24 Ultra getest. Het spelmodel blijft een vereenvoudiging (onder meer empirische slijtage, benaderde flow/knock, geen cilinderverschillen); de echte historische motorvermogens zijn geen garanties voor de nieuwe bewerkbare builds. De visuele benaderingen van 1.29 blijven in `VEHICLE_ASSET_BRIEFS.md` beschreven.

Simulatiecontrole: **alle 30 suites plus de hoofdasserties en self-test geslaagd**. De lange verzamelopdracht werd na `physics_audit` met SIGTERM (143) beëindigd, zonder assertiefout. De resterende modules zijn vervolgens in twee begrensde deelruns voltooid (`reports/workshop-sim-batch-0.json` en `-1.json`), inclusief 18 nieuwe werkplaatschecks en de maximale referentiebuilds. De eerste baselinepoging kon niet volledig worden afgerond doordat de calibratiebronmatcher tijdens de ontwikkeling gewijzigde broncode las; de expliciete fixture uit uitgangscommit `ca84a337` levert de controle op vóór/na-resultaten.

Werkelijke UI-resultaten: vijf auto's gekocht, per auto een passende kop gekocht en gratis teruggeplaatst, zes benchtests, zeven tunepanelen, volledige dyno, oliebeurt/revisie en herstart: geslaagd in 205,43 s. De brede browsertest is 145/145 groen, zonder paginafouten of onverwachte consolefouten. Mobiele regressie controleert ook stale events, foutfallback, snelle wissels, geïsoleerde materialen/resources, stuur-/wielrigs en V8-audio (5.850 ontstekingsevents).

Jackstand is eerst afzonderlijk volledig getest. De afsluitende herhaling op de releasebuild staat in `reports/workshop-jackstand-release/smoke.json` (126,32 s; nul turboslijtage voor de atmosferische build). De vier overige auto's reden achtereenvolgens in één QA-profiel: `reports/workshop-races/smoke.json` (595,89 s). Alle races inclusief resultaat en replay, alle vijf showroomrondgangen en herstarts zijn geslaagd. Bekijk **`reports/workshop-release/index.html`** voor de vijf echte 360°-previews, raceclip, werkplaatsbeelden en rapportlinks.

Pakketcontrole: 70/70 webbestanden byte-identiek in de APK; twaalf GLB's. Releasecertificaat onveranderd: `74a2076d8d964584dadcb233eb5cd832de144a92173a1c74e4092fa0b3f1affb`. APK SHA-256: `201b6327f828c97b480753b18dc0c20e92ce9e6d3a512230e96989ad64be3c78` (9.101.809 bytes). De bestaande SDK XML 3/4-waarschuwing blokkeerde de build niet. Signing en package/version zijn daadwerkelijk gecontroleerd.

Commits: `bb88dbd` bevat onderdelen, fysica en migratiehelpers; `b7b5161` bevat UI, gecomprimeerde opslag, regressietools en versie 1.30.0; `31f679f` herstelt de voertuigidentiteit op de dynobank. De afsluitende documentatiecommit bevat dit rapport en de machineleesbare acceptatie. Alle grote testbeelden, tussenbestanden en APK's blijven buiten Git; de gebouwde APK staat in `dist/`.

---

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
