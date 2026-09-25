# EA888 Lab

Android tuning/drag-racing game/simulator built around a virtual VW EA888 Gen 1 / CAWB and a blue VW Scirocco.

## Current baseline

The canonical baseline is **EA888 Lab v1.2.0**.

Core loop:

**build engine → assemble → bench-test → tune → dyno → diagnose → drag race → service/rebuild → improve build**

Current systems include engine parts/tuning, dyno simulation, wear/damage, service, realtime drag racing, burnout/staging/tree, manual/DSG transmission behavior, telemetry, and Scirocco-specific visuals.

## v1.17.1 (branch `claude-dev`) — headlight fix

- Removes the headlight patch that 1.17.0 shipped lying flat on the bonnet as a white rectangle. See DEVLOG 22.

## v1.17.0 — the car is a scan of the real Scirocco

- The player's car is now a body generated from the owner's own photos (Hunyuan3D multi-view, cleaned up in Blender), not the procedural shell.
- The procedural car stays as the ghost, as the fallback, and on the lowest quality setting.
- Wheels, exhaust flames and the brake light work exactly as before.
- Honest limits: the front has no crisp headlight or grille shapes and there are no panel gaps. See DEVLOG 21.

## v1.16.0 — night lighting, photo track surfaces, quality tiers

- Bloom over the whole race: the floodlights, the tree, the tail lights and the exhaust flames glow.
- The strip and the launch pad are photographed asphalt and concrete (Poly Haven, CC0) under the painted markings.
- Tyre smoke is lit: it goes warm where it rises into the floodlights, red behind the tail lights, and takes the colour of an exhaust flame.
- The water box mirrors the car, the walls and the floodlights.
- Quality is per feature (bloom, reflections, lit smoke, pixel ratio) in three tiers, set in the settings (Automatisch / Hoog / Gemiddeld / Laag). On 'Automatisch' the renderer measures its own frame cost, steps down on a phone that cannot hold ~45 fps, and the settings page says it did.
- A 3D car pipeline (photos → Hunyuan3D → Blender → GLB) is in `tools/car3d/`. The car in this build is still the procedural model: see DEVLOG 20 for what the generated body did and did not deliver.

## v1.15.0 — physics audit, a sensible tuner, clutch-slip burnout

- The model is checked against the rules of thumb in Graham Bell's Forced Induction Performance Tuning (airflow per hp, BSFC, EGT, compressor outlet temperature, intercooler, back pressure, VE, turbo lag); turbine efficiency and turbo lag corrected.
- Tuner advice never calls a fix that halves your power the best choice; maps are better, safer (explained) or not sold.
- Burnout: the driver slips the clutch while the turbo builds boost, so FWD/AWD no longer bog.

## v1.14.0 — tuner help, optimised maps, N2O switch

- Compound fix: the HP bypass keeps the manifold pressure in check (no more absurd EMP/EGT with a small HP turbo), smooth handover to the big turbo.
- Tuner advice: tick several recommendations and apply them together; the advice stays visible after applying.
- Buy an optimised street or race map from the tuner.
- N2O is an on/off switch in the race (sprays at full throttle while armed); the rival badge no longer covers it.

## v1.13.0 — rev limits, real compound turbos, full-throttle burnout, the Scirocco

- Over-rev names the part that limits the revs; with pro-mod parts the engine revs to 10 500 rpm. The ECU caps the limiter instead of breaking the engine.
- Compound: fit a smaller turbo from the turbo list as the high-pressure stage; the two turbos work in series (pressure ratios multiply, interstage heat, two turbine stages, HP bypass).
- Burnout: hold for full throttle, no controller backing it off; optional burnout limiter.
- The 3D car is now a proper Scirocco Mk3; the registration is erased everywhere.

## v1.12.0 — nitrous, welded head, stroker/destroker, compound boost

- Nitrous kits (dry, wet, progressive, direct port) with an N2O button in the race and a bottle to refill.
- Head lift under extreme cylinder pressure; a head welded to the block cannot lift.
- Stroker and destroker kits; compound boost to spool big turbos on 2.0 litres.

## v1.11.0 — wheel hop, mounts, tuner advice

- Wheel hop from the driveline's torsional mode; mounts and bushings (dogbone insert to solid race mounts) stop it.
- Tuner advice per dyno notice: exact parts and settings, each tested on the dyno simulation, applied with one tap.
- Burnout from the water box at a set rpm, without anti-lag.

## v1.10.0 — phase 7: tyres, a physical burnout, knock in the race

- Tyre skin and core temperatures from the slip power; one grip window per compound for everything.
- The burnout runs on the vehicle model (clutch dump, rpm held, slip power, smoke from a hot skin) and predicts the tyre temperature at the launch; staging cools the tyres.
- Knocking cycles in the race: knock control pulls timing, without it the engine takes damage.

## v1.9.0 — phase 6: engine voice, acoustics, 3D burnout and staging

- Engine sound built live from every combustion event (firing order 1-3-4-2, exhaust pulses through your exhaust, limiter/two-step/shift cuts, afterfire, ALS bangs, knock), not from recordings.
- Acoustics per place: garage, dry dyno cell, open strip with pit-wall and grandstand echoes; the rival is heard from its lane.
- Sound mixer in settings; the recorded-sample sound stays selectable.
- Burnout and staging in 3D: tyre smoke from the driven tyres, staging beams and a live tree.

## v1.8.0 — phase 5: career and bracket racing

- Career events with class rules, entry fees, prize money, reputation and knock-out rounds against real rival builds.
- Bracket racing with dial-in: handicap start, breakout rule, red light, package.
- ECU tables: hold and drag to select a block; tap a row/column header for the whole row/column.

## v1.7.0 — phase 4: one physical simulation

- Combustion-cycle engine model: power, spark, knock, EGT and fuel follow from physics (stock CAWB 194 pk / 273 Nm vs VW 200 PS / 280 Nm).
- ECU tables with a table editor, base maps, knock control; real fuel hardware (HPFP, DI window, MPI), flex fuel.
- Dyno with DIN/ISO/SAE correction, wheel power, heat soak; datalog channels with cursor and CSV export.
- One vehicle model (clutch, tyres, load transfer, gearboxes) for the race, the quick pass and real rival builds.

## v1.6.0 — phase 3: race 2.0

- WebGL drag strip with a 3D Scirocco and rival, smoke and flames from the simulation, chase camera that feels the g-forces.
- Ghost of your fastest run, replay with director cameras on the finish screen, compact race HUD.
- 2D view stays available (setting "3D-racebeeld") and is the automatic fallback without WebGL.

## v1.5.0 — phase 2: design system and controls

- Design tokens, bundled fonts, one component library, docked navigation, readable type everywhere.
- Steppers, tap-to-type values, confirmation above hardware limits and undo after every change.
- A/B dyno comparison, guided first build, much shorter pages.

## v1.4.0 — phase 1: foundation

- **Real Android project** (`android/`, Gradle + AGP 8.13): targetSdk 35, minSdk 26, v2 + v3 signing, APK and
  AAB (Play Store), adaptive launcher icon, edge-to-edge with system-bar insets passed to the CSS, Android back
  button closes the top layer first, screen stays on during pulls and races, assets served by
  WebViewAssetLoader from a fixed https origin (no file:// access).
- **One permanent release key**, supplied only through the environment (see below). No more uninstalling for
  updates after this version.
- **Web build step** (`tools/build_web.py` → `build/web`): esbuild bundle of `src/web/platform.js`,
  version from `version.json`, images recompressed to WebP (web app 11 → 5.2 MB, APK 7.8 → 4.4 MB).
- **Targeted DOM updates** (morphdom): re-rendering no longer swaps whole pages, so scroll position, focus and
  canvases stay put.
- **Full backup to a file** (Data page): the whole game, restorable after a reinstall or on a new phone.

## Styles

`src/styles/` is the source (the build concatenates it into `styles.css`):
`fonts.css` (bundled Barlow Condensed / Inter / JetBrains Mono, OFL) → `tokens.css` (colour, type, spacing,
radius, elevation, motion) → `app.css` (pages) → `race.css` (fullscreen race scenes, rebuilt in phase 3) →
`components.css` (the design system: every shared component defined once; last in the cascade so it wins).
The browser smoke test runs against `build/web`.

## v1.3.1

- **Precision Turbo catalogue** (small to large, PT5558 … PT10603 Pro Mod) replaces the generic modeled
  turbos. PT6062/6466/6870/7675 use Precision's published compressor maps (CM-60/64/68/76, digitized); the
  others are scaled from the nearest CM map and marked *modeled*. Old saves migrate automatically.
- **Auto-start tree**: once fully staged the tree starts by itself after a random 0.5–5 s. Holding LAUNCH
  (two-step) before that arms a release launch; otherwise press LAUNCH on green for a pedal launch.
- **Flames visible**: the flame layer sits above the info panels; aggressive ALS gives a continuous
  flickering flame (bangs overlap) with pops on top.
- **ALS sound**: original synthesized bang set (4 variants) and after-burn crackle bed, at the simulated
  bang rate (firing frequency × ALS cut fraction).
- **Heads-up rival on the track**: two-lane strip, the rival drives in the right lane in the same
  perspective as the track instead of floating in the sky.
- Part masses now count in the drag race.

## v1.3.0

- **Strict dyno results**: completed / aborted / failed-to-start. An aborted pull only contains and reports
  samples up to the abort rpm (highest *observed* values, marked partial), has no reliability score, and wear
  and damage come from the simulated portion only.
- **Compressor-map turbo model**: Garrett G25-660 and G30-770 vendor maps (digitized from Garrett's published
  maps); all other turbos use clearly marked *modeled* maps. Surge, choke, shaft speed, efficiency, charge
  temperature, intercooler loss, EMP, wastegate creep and rotor-inertia spool. Dyno channel "Turbokaart".
- **Anti-lag**: Tune → Anti-lag (off/mild/street/rally/drag/custom, all parameters, ECU/hardware limits, stand
  test). HOLD ANTILAG in staging, rolling ALS on shifts, with real EGT/EMP/shaft-speed/fuel/wear cost.
- **Exhaust flames** only from simulated events (shift, limiter, two-step, ALS), sized by unburnt fuel and
  exhaust temperature.
- **Audio**: turbo whine follows simulated shaft speed; separate ALS, two-step, limiter and shift layers.

See `docs/DEVLOG.md` for design notes, data provenance and known inaccuracies.

## Development

Claude Code should read `CLAUDE.md` before making changes.

Baseline test commands:

```bash
node tests/test_sim.js            # runs all suites (dyno result, turbo map, anti-lag)
node tools/build_turbo_data.js    # regenerate src/assets/turbo-data.js from data/turbo/*.json

python3 tools/browser_smoke.py \
  --assets src/assets \
  --screenshots /tmp/ea888-shots \
  --report /tmp/ea888-browser-report.json

npm install                       # esbuild + morphdom
python3 tools/build_web.py        # build/web (Android assets, browser test target); styles from src/styles
python3 tools/browser_smoke.py --assets build/web --report /tmp/ea888-browser-report.json

tools/setup_android_sdk.sh        # once: Android SDK platform 35 + build-tools
python3 tools/build_android.py --debug   # debug APK (package .dev, installs next to the release)
python3 tools/build_android.py           # release APK + AAB in dist/, signed with the permanent key
```

Release signing reads `EA888_KEYSTORE` (path) or `EA888_KEYSTORE_B64` (base64, for cloud environments),
`EA888_KEY_ALIAS` and `EA888_KEY_PASSWORD` from the environment. Never commit the keystore or its password.
The build prints the signing certificate SHA-256; it must be the same for every release.
`tools/build_apk.py` (hand-patched template APK, v1 signing) is legacy and only kept for reference.

## Android identity

- App label: `EA888 LAB`
- Package: `nl.randy.ea888lab.stabl`
- Version: from `version.json` (now `1.4.0`, code `140`); debug builds are `nl.randy.ea888lab.stabl.dev`

## Accuracy boundary

This is an engineering-inspired game/simulator, not certified ECU, engine-design, or vehicle-dynamics software. Real hardware and tuning decisions must be validated with proper measurements, logs, and professional inspection.
