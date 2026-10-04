# Kalibratie tegen echte runs

De dragsimulatie vergeleken met echte passes uit het YouTube-onderzoek (`data/roster`, research-commit
`334e31d`). Alleen de fysica is aangepast, voor iedereen gelijk: er is geen correctiefactor per auto.

```bash
node tools/roster_calibration.js            # tabel met de huidige fysica
node tools/roster_calibration.js --before   # dezelfde auto-data met de fysica van v1.28
node tests/test_roster_calibration.js       # de toetsing (ook onderdeel van tests/test_sim.js)
```

## Wat getoetst wordt

Een kalibratiepunt is een run waarvan gewicht én vermogen bij dezelfde build horen (`calibration.json`).
Gebruikt worden alleen de rijen zonder notitie in `hale_check.csv`, en drie daarvan vallen alsnog af omdat de
extracts ze uitsluiten:

| Auto | Waarom niet |
|---|---|
| Mullet (World Cup) | de run "stopped accelerating late" (duim op de transbrake-knop nam ontsteking terug); het vermogen zou uit die trap moeten komen. Bovendien geeft `roster.json` het gewicht van de build uit 2026 (2.762 lb, video #1871); de World Cup-trim woog 3.330 lb (video #1743). |
| McFlurry (Coyote) | dyno 1.394 whp op 31 psi; de 7,12-run liep 36–37 psi piek, 33 psi bij de trap. |
| Lumberjack | dyno 900 pk op 26 psi; voor de 9,30-run ging de boost +5 psi omhoog (29,4 psi piek). |

Blijven over: **Jackstand's 240** (gewicht, vermogen en run allemaal gemeten — de onafhankelijke toets), de
**ZR1** (gewicht uit de trap afgeleid, dus mph geen toets) en **Eagle** (vermogen uit de trap afgeleid, gewicht een
schatting van vóór de bouw).

**Toleranties**, uit de data zelf: dezelfde auto op dezelfde dag spreidt 2–4 % in ET (Lumberjack 9,30–9,49; ZR1
9,11–9,47) en tot 0,19 s in de 60 ft (ZR1 1,30–1,49), en geen dyno zegt of het wiel- of krukasvermogen is (±15 %
vermogen is ±5 % ET). Dus **ET ±4 %, trap ±4 %, 60 ft ±0,10 s**. Een trap die gebruikt is om gewicht of vermogen af
te leiden wordt niet getoetst.

De 240 ging volgens de extract **rond 1.000 ft van het gas** (coureur schatte 5,40 op de 1/8). De sim rijdt die
run zoals hij gereden is: gas dicht op 1.000 ft (¹ in de tabel). Dat verklaart de lage trap (141 mph bij 786 pk,
waar Hale 157 voorspelt) zonder iets aan de fysica te doen.

## Vóór

| Auto | echt ET | sim ET | echt mph | sim mph | echt 60ft | sim 60ft | getoetst |
|---|---|---|---|---|---|---|---|
| Biturbo V8 buizenframe | 5.74 | 12.43 (+116.5 %) ✗ | 259 | 144.8 (-44.1 %) | 1.050 | 2.657 (+1.607 s) ✗ | et, sixtyFt |
| Biturbo big-block ute | 6.60 | 12.75 (+93.3 %) | 214 | 139.0 (-35.0 %) | 1.100 | 2.717 (+1.617 s) | nee (alleen tegenstander) |
| Turbo-V8 coupé (jaren 80) | 7.12 | 12.68 (+78.1 %) | 189 | 136.2 (-28.0 %) | 1.100 | 2.675 (+1.575 s) | nee (alleen tegenstander) |
| Turbo-V8 ute | 9.30 | 12.50 (+34.4 %) | 144 | 133.9 (-7.0 %) | 1.432 | 2.609 (+1.177 s) | nee (alleen tegenstander) |
| Lachgas-V8 coupé ¹ | 8.70 | 11.78 (+35.4 %) ✗ | 141 | 124.1 (-12.0 %) ✗ | 1.260 | 2.187 (+0.927 s) ✗ | et, sixtyFt, mph |
| Lachgas-V8 hatchback | — | 11.08 | — | 130.0 | — | 2.070 | nee (alleen tegenstander) |
| Compressor-V8 sportwagen | 9.11 | 10.64 (+16.8 %) ✗ | 148 | 144.8 (-2.2 %) | 1.300 | 2.099 (+0.799 s) ✗ | et, sixtyFt |

## Na

| Auto | echt ET | sim ET | echt mph | sim mph | echt 60ft | sim 60ft | getoetst |
|---|---|---|---|---|---|---|---|
| Biturbo V8 buizenframe | 5.74 | 7.50 (+30.6 %) ✗ | 259 | 198.6 (-23.3 %) | 1.050 | 1.351 (+0.301 s) ✗ | et, sixtyFt |
| Biturbo big-block ute | 6.60 | 7.80 (+18.1 %) | 214 | 187.7 (-12.3 %) | 1.100 | 1.381 (+0.281 s) | nee (alleen tegenstander) |
| Turbo-V8 coupé (jaren 80) | 7.12 | 7.76 (+9.0 %) | 189 | 185.8 (-1.7 %) | 1.100 | 1.388 (+0.288 s) | nee (alleen tegenstander) |
| Turbo-V8 ute | 9.30 | 9.55 (+2.7 %) | 144 | 141.8 (-1.6 %) | 1.432 | 1.429 (-0.003 s) | nee (alleen tegenstander) |
| Lachgas-V8 coupé ¹ | 8.70 | 9.03 (+3.8 %) ✓ | 141 | 138.0 (-2.1 %) ✓ | 1.260 | 1.393 (+0.133 s) ✗ | et, sixtyFt, mph |
| Lachgas-V8 hatchback | — | 10.33 | — | 131.8 | — | 1.500 | nee (alleen tegenstander) |
| Compressor-V8 sportwagen | 9.11 | 9.01 (-1.1 %) ✓ | 148 | 149.8 (+1.2 %) | 1.300 | 1.333 (+0.033 s) ✓ | et, sixtyFt |

¹ run met de gedocumenteerde lift op 1.000 ft. ✓ binnen tolerantie, ✗ erbuiten (alleen bij getoetste waarden).

## Wat er aan de fysica veranderd is (en waarom)

1. **Tijdwaarneming zoals de baan meet.** De klok start pas als de band uit de stagebeam rolt (rollout, 11,5 in);
   60 ft en ET tellen vanaf daar. De trap is de gemiddelde snelheid over de laatste 66 ft, niet de snelheid op de
   streep. De totale tijd van groen tot finish blijft gelijk (reactie + rollout + ET); de reactietijd houdt de
   spelbetekenis. Geldt voor speler en tegenstanders (één `createTimingSystem` in `sim.js`).
2. **Anti-squat.** Een dragvering (4-link, ladderbars) belast de achterbanden direct met het askoppel, in plaats van
   via het kantelen van de carrosserie. Zonder dit spint elke converterauto bij de klap. Alleen voor achterwiel-
   aandrijving met `antiSquatPct` > 0; de speler heeft standaard 0 (ongewijzigd).
3. **Torque converter** (nieuw voor de roster-auto's): capaciteit constant tot het koppelpunt en daarna kwadratisch
   naar nul, zodat een raceconverter op de streep nog 5–8 % slipt. Raceconverters vermenigvuldigen 2,0 bij stilstand
   (regel).
4. **Grip van dragbanden op een geprepareerde baan × 1,28** (drag radial 1,95 → 2,50, alle dragcompounds dezelfde
   factor). De 240 grijpt pas zoals op zijn timeslip vanaf ~1,25×; de ZR1, ook op drag radials, komt er dan binnen
   1 % ET mee uit. Straatcompounds hebben geen data en zijn ongewijzigd.
5. **Bandwarmte.** Bij slip rond het piekpunt gaat de slipenergie grotendeels in het vervormende loopvlak (bulk),
   bij echt glijden (burnout, wielspin) in de huid. Zonder dit verloor een band op de tractiegrens binnen 3 s de
   helft van zijn grip (oppervlak 175 °C).
6. **Lancering van de roster-auto's** (regels in `model-rules.json`): turbomotoren lanceren op lagere boost en voeren
   die met de tijd op (opgegeven launch-boost gaat voor: McFlurry 18,8 psi, Mullet 38 psi); het lanceertoerental op
   de transbrake is zo gekozen dat de converter de band bij de klap niet overweldigt; auto's met een race-ECU met
   tractieregeling (FuelTech, Haltech, een launch-tune) houden het motorkoppel op wat de band kan dragen.

## Afwijkingen die blijven (en waarom)

- **Jackstand's 240, 60 ft 1,393 tegen 1,26 (+0,13 s).** De auto is in de eerste 60 ft koppelbeperkt, niet
  tractiebeperkt. Hoeveel koppel er dan is hangt af van wanneer het lachgas komt (geen controller genoemd; de regel
  is 0,25 s vertraging + 1 s opbouw), de converter en de achterasverhouding — niets daarvan staat in de data. Met het
  lachgas vanaf de klap en 0,3 s opbouw rijdt dezelfde auto 1,278 (ET 8,87, trap 138). ET en trap blijven binnen
  tolerantie.
- **Eagle, 7,50 s @ 199 mph tegen 5,74 @ 259.** Een radialauto met 3.500 pk is bijna de hele kwartmijl
  tractiebeperkt. Het model mist aerodynamische neerwaartse druk (de spoiler belast de achterbanden het meest
  boven 200 mph) en de lock-up converter die deze auto heeft; zijn gewicht is een schatting van vóór de bouw en zijn
  vermogen komt uit zijn eigen trap via Hale. Gedocumenteerd met een regressiegrens; de tolerantie is niet verruimd.
- **Mullet en McFlurry** (alleen tegenstander) zijn om dezelfde reden te traag bovenin (188 en 186 mph tegen 214 en
  189); McFlurry's dynocurve is ook op lagere boost gemaakt dan zijn run.

## Ontbrekende data (wat de toets scherper zou maken)

- Achterasverhouding en bandmaat van elke auto (nu een regel: over de streep net voorbij piekvermogen).
- Converter: stall/flash-toerental (alleen McFlurry: 8.080) en type (lock-up of niet).
- Lachgascontroller van de 240 (vertraging, progressief).
- Wiel- of krukasvermogen bij elke dynopull.
- Weer en baantemperatuur per run (alleen de ZR1: 29–30 °C).
- Gewicht van Eagle, McFlurry, Lumberjack en de ZR1 op een weegschaal; vermogen van Eagle en Mullet op een dyno.
- Voor 13 van de 20 auto's ontbreekt gewicht of vermogen, of een run: die rijden niet mee.
