# Development log

Working notes for EA888 Lab development on `claude-dev`. Baseline: `05dcca2` (v1.2.0 source).

## State flow (as found in v1.2.0)

- **Canonical state**: one object `state` in `src/assets/app.js`, created by `C.createInitialState()` /
  `C.normalizeState()` from `sim.js` and persisted to `localStorage['ea888_lab_v120_state']` by `saveState()`.
- **Build signature**: `engineSignature()` hashes selections, tune, assembly, oil and dyno config. A dyno result is
  "current" only while `state.lastDynoSignature === engineSignature(state)`; any hardware/tune change makes it stale.
  `benchSignature()` does the same for bench tests and also covers wear/damage.
- **Dyno**: `startDyno()` calls `C.simulateEngine(state)` once, then reveals the samples over ~5.6 s;
  `finishDyno()` stores it as `state.lastDyno`, prepends it to `state.dynoRuns` and applies wear/damage.
- **Drag**: requires a current dyno; the realtime race (`createRealtimeRun`/`stepRealtimePhysics`) and the
  analytic `C.simulateDrag()` both interpolate torque from the stored dyno samples.
- **Turbo (v1.2.0)**: no compressor map. Boost = requested boost × logistic spool curve around `turboSpoolRpm`;
  power is capped by a scalar `turboMaxHp`; shaft speed, EMP and IAT are linear functions of a "turbo load %".
- **Race audio**: `ensureEngineAudio()` builds a WebAudio graph from the PCM bank in `audio-bank.js`
  (decoded once per AudioContext), `stopEngineAudio({hard})` stops/disconnects voices; smoke test checks 3 races.

## 1. Dyno result consistency (done)

Bug: `simulateEngine()` kept simulating to the rev limit after a critical failure, and peaks, maxima, reliability,
warnings and wear were computed over the whole sweep. An abort at 5900 rpm could therefore show a peak at 7900 rpm
(838 such configurations existed in the baseline, e.g. HX52 + RON95 + knock control off).

Now (`dynoResultVersion: 2`):

- The pull stops at the sample where a failure is detected (`criticalFailure()` returns a structured event with
  `code`, `system`, `severity`). `options.stopAtRpm` provides the same for an operator abort.
- Result fields: `status` (`completed` / `aborted` / `failed-to-start`), `abortRpm`, `abortReason`, `abortKind`
  (`engine-failure` / `operator` / `failed-to-start`), `samples[]` (replaces `curve`), `targetRpm`, `rpmReached`.
  The old rating label moved from `status` to `rating`.
- All summaries come from `summarizeDynoSamples(samples)`. Aborted runs quote the *highest observed* value
  (labelled partial with `*`) or `—` below 5 samples, and have `reliabilityScore: null`.
- Wear is integrated per sample (`dynoWearFromSamples`), damage comes from the failure event
  (`dynoFailureDamage`), both applied by `commitDynoResult()`; the app no longer computes them itself.
- Results saved by v1.2.0 are repaired on load (`sanitizeDynoResult`): samples above the failure rpm and the
  warnings/bottleneck derived from them are dropped.
- UI: partial runs show "Hoogst waargenomen", an abort notice, no score, a red abort line with the unmeasured
  range shaded; the live display never scales to values that have not been revealed yet. Operator aborts are kept
  as partial runs with the wear of the portion actually run (v1.2.0 discarded them and charged nothing).
- Drag and challenges require `isCompletedDyno()`.
- Tests: `tests/test_dyno_result.js` (run from `tests/test_sim.js`) plus browser checks `dyno_abort_*` in
  `tools/browser_smoke.py`.

## Technical debt / contradictions found

- The garage reliability card printed `r.weakestLink`, a field that never existed ("undefined"); fixed to
  `bottleneck`.
- `__EA888_DEBUG__.setTransmissionForTest` re-signs a stale dyno after changing the gearbox (test-only shortcut).
- `tools/browser_smoke.py` hardcodes `/usr/bin/chromium` and the list of script files it injects.
- `tools/generate_sim_v6.py` would overwrite `src/assets/sim.js` from an old template; treat it as legacy.
- `wear` (0 = new) and `damage` are both shown as percentages; labels must keep "slijtage" vs "schade" distinct.

## 2. Compressor-map turbo model (done)

Replaced the logistic spool curve and scalar `turboMaxHp` cap with turbo matching on real/modeled maps.

- **Data** (`data/turbo/`, provenance kept separate from UI):
  - `garrett-g25-660.json`, `garrett-g30-770.json`: **vendor** maps, manually digitized from Garrett's published
    compressor and turbine flow map images (URLs inside). Speed lines/surge/choke ±0.5 lb/min, ±0.02 PR.
  - `modeled-turbos.json`: the catalogue turbos without a public map (since v1.3.1 only K03, K04, the K04 hybrid and HX52). No trustworthy public map exists for them, so they are
    **modeled** (G25 map shape rescaled to the stated flow, PR, shaft speed and efficiency) and tagged as such
    in the data and in the UI ("GEMODELLEERDE KAART").
  - `charge-system.json`: intercooler/filter pressure loss, exhaust back pressure, wastegate capacity, fuel
    stoichiometry, rotor inertia rule (all modeled estimates).
  - `tools/build_turbo_data.js` generates `src/assets/turbo-data.js`; a test fails when it is stale.
- **Physics** (`src/assets/turbo.js`): corrected mass flow, pressure ratio incl. filter + intercooler losses,
  map efficiency (inner islands from vendor contours, outer region interpolated to assumed boundary values),
  isentropic compressor outlet temperature → intercooler → charge density, turbine flow curve → EMP,
  turbine/compressor power balance with wastegate split, wastegate creep, surge and choke limits,
  shaft-speed limit (enforced when overboost cut or a shaft-speed sensor is present), rotor-inertia spool
  (energy balance per dyno sample, so ramp rate matters). Engine demand comes from the existing VE/breathing
  model; torque now scales with charge density and pays pumping/residual-gas cost for EMP > boost.
- **UI**: dyno channel "Turbokaart" draws the map with the pull's operating line (revealed live), tune page
  shows whether the map is vendor or modeled.
- **Tests**: `tests/test_turbo_map.js` (schema/provenance, speed-line fidelity, vendor contour checks,
  isentropic consistency, choke fall-off, spool vs turbo size, rotor inertia vs ramp rate, wastegate creep,
  altitude, EMP vs turbine size).

### Known inaccuracies (turbo)

- Efficiency outside the digitized inner islands is interpolated: RMS error ≈3 %pt vs the vendor contour labels,
  up to ≈6 %pt in the far choke/max-speed corner.
- Garrett's corrected-flow reference conditions (545 R/13.95 psia compressor, 519 R/14.696 psia turbine) are
  taken as commonly quoted; verify before relying on absolute turbine numbers.
- Precision 7675: the published CM-76 map fits the 1250 hp Sport-series wheel; the Next Gen 7675 (1480 hp) flows
  ~10 % more than modeled. Pro Mod 91–106 mm maps are extrapolated from CM-76 and are the least certain.
- Modeled maps reuse the G25 shape; real K03/K04/Holset/big-frame maps differ in width and surge slope.
- The engine breathing multipliers of the catalogue imply volumetric efficiencies up to ~1.7–2.3 on the big
  pro-mod builds (real engines ≈1.1–1.25). The map model uses the airflow those power levels require, so the
  compressor side is consistent, but the big-turbo presets overstate power per bar of boost.
- Turbine efficiency is a simple function of expansion ratio (no blade-speed-ratio map); pulse/twin-scroll
  energy is a flat +3 %.

## 3. Anti-lag, HOLD ANTILAG, flames, audio (done)

- **Core** (`sim.js`): `tune.als` presets + custom parameters; `antiLagCapability` (OEM MED17: none, custom MED17:
  limited, Syvecs/Promod: full; bypass air limited by the spool hardware: none 10 %, mild_als 20 %, hard_als 32 %).
  `createTurboRuntime` keeps a realtime turbo state on the same maps as the dyno: two-step and ALS add exhaust
  energy (ALS retard/enrichment/bypass), the ALS controller caps it at max EGT, limits at max shaft speed and
  target boost, times out into a cooldown; spool-up/down are inertia limited; it accumulates turbo, manifold,
  valve and engine wear, damage and fuel. Excessive settings damage the turbo (EGT > 1150 °C, overspeed).
- **Flames**: `exhaustFlameEvent` gives intensity/size/colour from unburnt fuel and tailpipe temperature. Good
  shifts → small/brief, late shifts and the spark-cut limiter → larger, ALS → frequent pops; no flame when the
  exhaust is too cold or no fuel is left unburnt (e.g. fuel-cut throttle lift on OEM ECU).
- **Gameplay**: staging has HOLD ANTILAG between CREEP and LAUNCH (hold control, two-thumb with the two-step);
  boost/turbo speed/EGT/ALS state/session wear shown live from the runtime. The runtime carries into the run;
  torque follows the delivered boost; rolling ALS on shifts for rally/drag. Wear is applied to the build at the
  finish or when the drag screen is closed.
- **Audio**: turbo loop follows simulated shaft speed; ALS pops/bangs and the two-step stutter are separate
  one-shot layers; rev limiter, DSG burp and manual shift samples unchanged; audio lifecycle still hard-stops
  after every race (smoke test covers 5 races/sessions).

## 4. Precision Turbo catalogue (v1.3.1)

The generic modeled aftermarket turbos (64–127 mm) were replaced by the Precision Turbo & Engine range, small to
large: PT5558, PT5862, PT6062, PT6466, PT6870, 7675, Next Gen 8085/8685, Pro Mod 9103/9803/10603.

- `data/turbo/precision-cm-maps.json`: the four compressor maps Precision publishes (CM-60-0001, CM-64-0001,
  CM-68-0001, CM-76-0001; image URLs inside). Speed lines were traced on the map pixels after gridline calibration
  (±0.3 lb/min, ±0.01 PR); the surge line is the start of each speed line, choke the end. Precision prints only
  one efficiency contour set clearly (CM-60); the 76/74/72/66 % islands of the others are the CM-60 islands scaled
  by flow ratio — marked as such in `digitization`.
- `data/turbo/precision-turbos.json`: model, Precision's own hp rating, inducer/turbine size, list price
  (2026-09-23), product URL. PT6062/6466/6870/7675 use their own map (`vendor`). Models without a published map are
  `modeled`: nearest CM map scaled by inducer area (flow) and inducer diameter (shaft speed at equal tip speed).
- Turbine side: Precision publishes no turbine maps, so turbine flow is modeled (G25 0.72 A/R curve scaled by
  turbine wheel area) for every Precision entry.
- Ratings check: map choke flow × 10 hp/(lb/min) agrees with Precision's rating within ±20 % for every model (test).
- Old saves/build slots are migrated to the nearest Precision model (`LEGACY_TURBO_IDS`; 118/127 mm → PT10603).
- Turbo mass relative to the K03 is now set per unit (0–17 kg); previously 0 for all but the 127 mm.
- selfTest: the low-oil and tight-ring-gap checks compared `null < 72` when the pull aborted; they now test the
  status explicitly.

## 5. Staging, flames, ALS sound, rival (v1.3.1)

- **Auto-start tree**: like a strip's auto-start system the tree activates a random 0.5–5 s after the car is
  fully staged (not deep), independent of the launch button. Holding LAUNCH when the tree drops arms the
  two-step: release launches (early release = red light). Without it, pressing LAUNCH is a pedal launch from
  the current engine speed (≥ 2200 rpm, no two-step boost).
- **Flames above the HUD**: the stage flame layer is a separate top layer with the plate's geometry and zoom;
  the race's lane-position and shift-feedback panels moved under the progress bar, off the car.
- **Continuous ALS flame**: the bang rate is firing frequency × ALS cut fraction
  (`rpm/30 × (0.04 + 0.12·aggressiveness) × (0.6 + 0.4·k)`), no longer the boost-hold trim k alone, so it
  keeps going once boost is on target. When rate × flame duration > 1 consecutive flames overlap: the runtime
  reports `flameSustain` and the UI shows a sustained flickering flame (drag ≈ 14 bangs/s, sustain 0.8; mild
  only pops). ALS time limits: street 4 s, rally 30 s, drag 15 s (EGT stays the main protection).
- **ALS audio**: `tools/generate_audio_bank.py` synthesizes 4 bang variants (tailpipe jet-noise crack, shock
  exciting short exhaust resonances, downpipe thump, pipe ring, after-burn ticks) and a seamless crackle bed.
  Bangs play at the simulated rate with jittered spacing and changing variants; the bed follows
  `flameSustain`. No third-party recordings. The generator seed is now stable (crc32 instead of the
  per-process salted `hash()`).
- **Rival on the track**: heads-up draws a two-lane strip; the rival is projected with the track's own
  perspective at depth = the player's car depth + simulated gap in the right lane, sized to its lane.
- **Build mass**: `buildMassKg()` adds every selected part's `massDeltaKg` (dry sump, ice tank, turbo, …);
  before, only the gearbox counted, in both the analytic and realtime drag models.

## 6. Launch ALS, audible bangs, scroll-safe sliders (v1.3.2)

- User report: no ALS bangs with drag ALS. Two causes: ALS fired only with the separate HOLD ANTILAG button,
  not on the two-step; and the master compressor (-16 dB, 2 ms attack) squashed the bangs under the engine.
  Now an armed ALS fires on the two-step (launch ALS, as on Syvecs-style launch strategies) and each bang
  briefly ducks the engine bus; bang level raised. Browser checks: launch ALS on the two-step, bang events.
- Sliders changed value when the user only swiped vertically to scroll. Range inputs now ignore the pointer;
  a delegated handler moves them only after a clearly horizontal drag, a vertical swipe scrolls, a tap does
  nothing. Bigger touch thumb. Browser checks for both gestures.

## 7. Launcher icon (v1.3.3)

- The launcher showed the default Android icon although the APK carried `res/mipmap/app_icon.png`. The
  manifest patch repurposed the `fullBackupContent` attribute slot as `android:icon`, leaving icon (0x01010002)
  last in `<application>`. The framework looks attributes up with a merge over sorted resource IDs, so it
  never found the icon. `patch_manifest.py` now re-sorts attributes like aapt and verifies the order.
- New full-bleed icon from the rear photo of the Scirocco on the night strip (no own frame: launchers mask
  legacy icons themselves). A proper adaptive icon comes with the Gradle project (phase 1 of the proposal).

## 8. Phase 1 foundation (v1.4.0)

- `android/`: Gradle project replacing the hand-patched template APK. Java `MainActivity` (WebView,
  WebViewAssetLoader on `https://appassets.androidplatform.net/assets/`, external links open in the browser,
  edge-to-edge insets → `--native-safe-*`, back → `window.__ea888HandleBack()`), `NativeBridge`
  (`window.EA888Native`: saveFile/openFile via the Storage Access Framework, haptic, keepScreenOn,
  appVersion). R8 keeps the `@JavascriptInterface` methods. Adaptive icon from `tools/generate_app_icon.py`.
- Signing: release config only exists when the key is in the environment; `enableV1Signing false` (minSdk 26).
  `tools/build_android.py` decodes `EA888_KEYSTORE_B64` to a private temp file and deletes it after the build.
- Web: `tools/build_web.py`, `src/web/platform.js` (morphdom patchHtml, native wrapper with browser
  fallbacks). `render()`, header and nav are patched instead of replaced; the smoke test checks node identity
  and scroll position across a re-render.
- Storage: the new origin starts with empty localStorage, and the new key needs a one-time uninstall anyway.
  Export (build code or, from v1.4.0, full backup) before switching.
- No emulator here (no KVM): Android verification is aapt2 badging, apksigner, dexdump of the bridge and the
  full browser smoke test on the assets extracted from the release APK.

## 9. Phase 2: design system and controls (v1.5.0)

- Styles split mechanically (pixel-identical) into `src/styles/app.css` and `race.css`; new `tokens.css`,
  `fonts.css` (bundled OFL fonts) and `components.css` (last in the cascade: every shared component defined
  once). 52 duplicate legacy component rules removed; no page text below 10 px.
- Docked bottom navigation (48 px+ targets above the gesture area), one button language (default / disabled /
  armed / active / danger), segmented controls with automatic columns.
- Range controls: -/+ steppers with hold-to-repeat, tap-to-type value editor, confirmation above hardware limits
  (boost > boost-control maximum, rev limit > weakest part, ignition trim > +3 deg, ALS EGT > 1100 C, shaft >
  100 %), undo toast that restores only the touched state paths.
- A/B dyno: pick any earlier run as A; deltas only over the rpm range both runs measured; different cell
  conditions are flagged.
- Guided first build (build -> full pull -> quarter mile) with real completion signals; veterans skip it.
- Shorter pages: compact part rows (Motor 7.7k -> 2.7k px), oil details only for the chosen oil, 3 of 6
  challenges by default, foldable hardware table (Data 3.6k -> 2.3k px).
- Not yet: app.js module split and the race-scene CSS (phase 3 rebuilds the race scenes).

## 10. Phase 3: 3D race, replay, ghost (v1.6.0)

- `src/web/race3d.js` (three.js, bundled by esbuild): WebGL drag strip (asphalt/rubber/lane textures, walls,
  stands, lights, markers 60 ft -> finish, tree), procedural Scirocco (extruded, sculpted body, plate
  KK-895-H), rival car, PMREM reflections. It only **draws** the simulation: every frame gets the realtime
  point (distance, lateral position, speed, g, wheelspin, rival distance) from app.js; it never integrates.
- Smoke from simulated wheelspin, flames and flame light from the same `exhaustFlameEvent`/ALS sustain values
  as the 2D view. Chase camera on springs: lags under acceleration, FOV opens with speed, yaw follows steering.
- Ghost: the fastest valid run per drivetrain is stored as a 20 Hz trace (`state.ghost`) and drawn as a
  translucent car in solo runs.
- Replay (finish screen, "Bekijk replay"): the run records its samples at ~30 Hz plus every flame event; the
  replay plays exactly those back (interpolated, nothing re-simulated) in a new renderer with director cameras
  (chase, launch, side, high, finish) and slow motion off the line. Opening it cancels the automatic return to
  the overview; closing, back button or leaving the race disposes the WebGL context.
- Compact HUD over the 3D view (smaller gauges, rival card moved to the free corner, driveline detail on the
  timeslip instead). Setting "3D-racebeeld" switches back to the 2D canvas; WebGL errors fall back automatically.
- Smoke checks: 3D draw calls/triangles, disposal after finish, ghost stored with a record, 2D fallback draws,
  replay recorded to the finish line, replay plays back, replay disposed on close.

## 11. Phase 4: one physical simulation (v1.7.0)

Why: the v1.6 engine scaled a fixed torque curve with boost (K04 hybrid: 682 Nm at 1.8 bar = 43 bar BMEP,
VE 1.44), spark and lambda had no physical meaning, the race used its own formulas and the rival was a scaled
copy of the player's dyno curve. Every preset ran the same 60 ft.

- **Engine (src/assets/engine.js, data/engine/*.json)**: zero-D closed cycle IVC to EVO (Wiebe heat release,
  Woschni wall heat, variable gamma); VE from the Taylor inlet Mach index, cam/runner tuning, ideal-cycle
  backpressure, residual gas and overlap scavenging; end-gas knock from the Douaud-Eyzat induction time with
  the Kalghatgi octane index and end-gas wall cooling; Chen-Flynn friction; pumping from MAP vs EMP; EGT from
  the cycle state at EVO. Fuel blends from components (octane linear in molar fraction).
- **Calibration**: stock CAWB 194 pk / 273 Nm (VW 200 PS / 280 Nm); knock limit fitted to 9 reference points
  (1.3 deg RMS); K03 turbine and wastegates re-sized for the real airflow (wastegates are now absolute orifices).
- **Fuel hardware**: HPFP displacement x rpm (efficiency falls with rail pressure), DI flow within the
  injection window, port injection, low-pressure pump; the rail falls when the pump saturates; lean -> lambda
  protection lowers boost. Flex-fuel part with ethanol content.
- **ECU tables** (canonical in `tune.ecu`): boost per gear x rpm; spark, lambda, cam per MAP x rpm; base spark
  map = min(MBT, knock limit - 2 deg) for the fitted hardware; knock control with a retard budget and knock
  boost protection; quick setup drives tables that were not edited by hand. Editor: heat map, range select,
  step/set/smooth/interpolate/copy, last-pull trace and knock-retard cells, exact undo.
- **Dyno measurement**: DIN 70020 / ISO 1585 / SAE J1349 correction (dry-air pressure), wheel power from
  chassis-dyno losses in the pull gear, heat soak between pulls, repeatability scatter, pull gear, humidity.
- **Vehicle model** (sim.js createRaceRuntime): engine map from the combustion model (density and pumping
  corrected at runtime), turbo runtime on the breathing model, engine inertia + slipping/locked clutch with
  fade and heat, driven-wheel dynamics, Pacejka-type tyre with relaxation length, load transfer m a h / L with
  suspension lag, shift phases per gearbox, slip-controlled launch, traction control, nitrous spool shot.
  Player race, quick pass and every rival use it; rivals are real builds (cached).
- **Datalog**: spark (table / fired / MBT / knock retard), cylinder (Pmax, BMEP, VE, CA50), fuel (duty, rail,
  lambda vs target) channels, tap cursor, CSV export for dyno and race (Android CSV save dialog).
- **Validation**: stock Scirocco 0-100 7.2 s (VW 7.2 s), 15.1 s @ 155 km/h; trap speeds within 3 % of the Hale
  formula for stock, K04 hybrid and HX52 builds. Tests: tests/test_engine.js, tests/test_vehicle.js.

## Changelog (claude-dev)

- `25f8a37` dyno abort consistency (strict result model, legacy repair, tests)
- `153c845` compressor-map turbo model (vendor + modeled data, physics, UI, tests)
- `6397d99` anti-lag core, realtime turbo runtime, flame events (tests)
- `c333da2` anti-lag tune panel, HOLD ANTILAG, live flames, audio layers, wear persistence
- `a805378` two-step pops/stutter, timeslip turbo line, version 1.3.0-debug (code 130)
- `7590dc4` Precision turbo catalogue (vendor CM maps + scaled models, migration, turbo masses)
- v1.3.1: build mass, continuous ALS bang rate/flame, auto tree, flame layer, ALS sound, rival on track

## Remaining known inaccuracies

- Engine: single-zone cycle with Wiebe combustion (no turbulence/flame model), end-gas knock from a
  correlation fitted to estimated knock-limited spark points (+/-3 deg), no cylinder-to-cylinder spread.
  Head flow coefficients, cam tuning and fuel-system flows are modeled values, not flow-bench data (see the
  mapType of every entry in data/engine/).
- The race engine map uses a reference charge temperature and corrects density and pumping at runtime; VE
  changes from exhaust pressure within the race are second order and not remapped.
- FWD launches are ~0.2-0.3 s slower over 60 ft than the best real FWD drag passes (tyre model and driver
  model are simple); trap speeds match power-to-weight.
- The driveline has no torsional compliance (no axle hop) and one diff model per axle; no aero lift.
- Knock in the race is taken from the map (knock control result); there are no individual knock events.
- Turbo: see "Known inaccuracies (turbo)" above; spool transients still use an effective inertia factor.
- ALS combustion is a lumped energy model; flame visuals are stylised, timing/intensity are simulation-driven.
- The ALS sound is synthesized; it is not a recording of a real car.
- 2D fallback track perspective is stylised; the 3D car is a procedural model without suspension motion.
- Oil temperature, oil film and wear are still empirical models.

## APK signing

The repository has no signing key. Test APKs from this environment are signed with a throw-away session key,
so they **cannot update** an app signed with the original certificate: uninstall the old app first (export the
build code on the Data page before uninstalling; localStorage is lost with the app). For releases, build with
the permanent keystore via `EA888_KEYSTORE` / `EA888_KEY_ALIAS` / `EA888_KEY_PASSWORD`.
