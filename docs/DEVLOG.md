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
  plate erased), rival car, PMREM reflections. It only **draws** the simulation: every frame gets the realtime
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

## 12. Phase 5: career and bracket racing (v1.8.0)

- Events (sim.js CAREER_EVENTS): street night, Bracket Friday, FWD Challenge, Pro Bracket, Outlaw 2.0, each
  with class rules (tyres, pump fuel, drivetrain, displacement), entry fee, prize, reputation and a reputation
  gate; knock-out rounds against rival builds (same vehicle model, cached passes, per-round consistency and
  reaction from a seeded plan).
- Bracket rules (raceOutcome): the slower dial starts first by the dial difference, first to the finish wins,
  a breakout (ET quicker than dial) loses, both out: the smaller breakout wins, a red light always loses; with
  no breakouts this equals "better package wins" (tested over random cases).
- Race integration: the career round sets the rival, its reaction and handicap start (startOffset), the event's
  track prep; the outcome is applied after the run (next round, elimination, or prize + reputation).
- ECU table editor: hold-and-drag block selection, row/column/all headers.
- Tests: tests/test_career.js; smoke checks for the drag selection and the career flow.

## 13. Phase 6: engine voice, acoustics, 3D burnout and staging (v1.9.0)

- Engine sound (src/assets/engine-voice.js, an AudioWorklet): built sample by sample from the combustion
  events instead of played back from recordings.
  - Crank angle drives, per cylinder in firing order 1-3-4-2, a spark decision at TDC: burn, late burn
    (retard/ALS), spark cut (the charge leaves unburnt) or fuel cut. Cut patterns rotate (Bresenham), like
    ECU cut tables.
  - At EVO a blowdown pulse whose strength follows the cylinder pressure left at EVO against the exhaust
    back pressure (boost, wastegate), with cycle-to-cycle variation (larger at idle) and valve jet noise.
  - Unequal runners into the collector, turbine smoothing, then the exhaust pipe as a digital waveguide:
    the sound speed follows the gas temperature (EGT), reflections at the turbine and the open tailpipe,
    wall losses, tailpipe radiation and a muffler per exhaust part (OEM, catted 3", race 3", side 3.5",
    4" hood dump).
  - Unburnt charges collect in the exhaust and ignite when it is hot enough: limiter pops (spark cut
    only; a fuel cut has nothing to burn), ALS bangs (misfired charges in the manifold, at the bang rate
    the ALS model computes), DSG upshift burp (ignition cut during the clutch handover). Late combustion
    afterburns as crackle.
  - Knock: a damped ring at the first circumferential chamber mode f = 1.841 c / (pi B) (~7 kHz for
    82.5 mm), at the rate of the dyno's knock index.
  - Engine bay: intake pulses through the airbox, throttle hiss at part load, DI injector and valvetrain
    ticks.
  - Inputs: the dyno samples (MAP, EGT, lambda, wastegate, retard from MBT, knock index), the race runtime
    (limiter, flat/dog shift cut, ALS), the two-step. The recorded-sample voice stays as a setting and as the
    automatic fallback without AudioWorklet.
- Acoustics per place from generated impulse responses: garage (concrete workshop), dyno cell (absorptive,
  nearly dry), strip (open air: ground bounce, pit wall at ~8.5 m, grandstand at ~40 m as distinct echoes).
- The heads-up rival has its own voice (its build's exhaust), panned and attenuated by its position on the
  strip relative to the chase camera; the rival stages on the two-step before its launch.
- Mixer in settings: engine, turbo, ALS, tyres, rival, UI.
- 3D burnout and staging on the same renderer as the run: the burnout behind the water box with tyre
  smoke from the driven tyres (rate from the tyre surface speed through first gear and the burnout state),
  staging photocells and the tree bulbs switched by the tree sequence; the car creeps into the beams at
  the staging depth (pre-stage 178 mm before stage). 2D stays the fallback.
- Tests: tests/test_audio.js (event rate rpm/30, firing-order dominance, load and overrun, fuel vs spark
  cut pops, cold vs hot exhaust, half order from alternating cuts, ALS, knock mode and bore, sound speed vs
  EGT, muffler, determinism, worklet registration). The browser smoke test now serves the app on its own
  https origin (a secure context, as on Android) and checks the synth voice, acoustics, the panned rival,
  the sample fallback, the mixer and the 3D burnout/staging scenes.

### 1.9.1: the dyno could hang

- startDyno marked the pull as running and then started the sound; an exception in the sound start (or in
  any per-frame audio update) ended the animation loop, so the pull never finished, was never saved, and
  the tabs stayed locked ("de pull loopt nog"). The pull is now driven by time and cannot be stopped by
  what is drawn or heard: every audio entry point is guarded, a failing frame is logged and the next one
  runs, a timer watchdog keeps the pull going if the WebView stops delivering animation frames, and after
  repeated audio failures the synthesized voice falls back to the sample voice for the session.
- Error log: the last 20 errors are listed under the self-test (Data page), so a failure on the phone can
  be reported. Smoke check dyno_survives_audio_failure runs a full pull with every audio call throwing.

## 14. Phase 7: tyres, a physical burnout, knock in the race (v1.10.0)

- Tyre temperatures (sim.js TYRE_THERMAL, tyreThermalStep): two nodes per driven tyre, the tread skin
  (~0.25 kg, what a pyrometer reads) and the tread bulk (~3 kg). Heat from the slip power at the contact
  patch (70 % into the tyre) and rolling hysteresis; skin -> bulk conduction (~2.5 s), convection that grows
  with speed, conduction into the track. Grip uses a 60/40 skin/bulk blend through one temperature window
  per compound (TYRE optC/windowC, drag compounds ~55-60 C at the launch); the setup grip (gripFactor) uses
  the same curve, so the three inconsistent tyre targets of before are gone.
- Burnout (createBurnoutRuntime): the car held on the brakes in first gear; the driver revs, dumps the
  clutch (slipping clutch, a standing tyre holds until the drive torque beats static grip) and holds the
  burnout rpm with the pedal; engine torque from the engine map with boost from the same turbo runtime as
  the launch. Tyre surface speed, slip power, skin and bulk temperatures and smoke (skin above ~110 C) are
  model values; a hotter tyre loses grip, so the slip power falls as it heats. The burnout HUD shows the
  skin, the bulk and the predicted grip temperature at the launch (after ~20 s to the line); the score is
  the grip that temperature gives. Staging cools the tyres in real time and the race starts from that state.
  The burnout boost display no longer comes from a dyno lookup.
- Knock in the race: knocking cycles from the map's knock index at the ECU's spark (a build at its map
  margin does not knock; single cycles from ~0.97). Knock control pulls 1.5 deg per knocking cycle,
  recovers 1 deg/s, lowers the index 2.3 %/deg and costs 1.2 %/deg torque. Without knock control each
  knocking cycle adds engine damage (applied to the build after the pass). Knock is heard (the engine
  voice's chamber-mode ring) and shown on the timeslip.
- Rivals launch on tyres at their compound's optimum (a good burnout); the rival pass cache is keyed by
  VEHICLE_MODEL_VERSION.
- Tests: tests/test_tyres.js (skin heating rate, skin vs bulk cooling, convection with speed, one grip
  window, burnout tyre speed through first gear, rpm hold, slip power, smoke only from a hot skin, longer
  burnout -> more launch heat, race continues the tyre state, cold/optimum/overheated 60 ft, no knock on a
  map at its margin, knock control vs damage).

## 15. Wheel hop, mounts, tuner advice, burnout fix (v1.11.0)

- Wheel hop: the driveline's torsional mode (drive shafts in series with the engine/gearbox roll on its
  mounts, the driven wheels on it; ~7 Hz on OEM parts) driven by the clutch torque through the clutch
  damper springs. Its damping is the mounts' damping minus the tyre's negative damping past its peak
  (strong at low speed, filtered by the longitudinal relaxation length). An oscillation that keeps going
  for more than 1.5 periods while the tyre works at its limit is hop: less traction, torque peaks,
  driveline wear; the 3D body bounces with it and the tyres chatter. Launch metering by ECU (slip-
  controlled launch control, DSG, two-step, a clutch dump on the stock ECU). New category Motorsteunen &
  bussen (OEM, dogbone insert, poly, solid race mounts with NVH wear).
- Tuner advice: every dyno notice has a key and a measurable limit; for EUR 150 the tuner runs concrete
  candidates (parts, exact settings with old -> new value, services) through the dyno simulation without
  measurement noise, ranks solutions first and then by price (EUR 500 per percent of power lost), tries a
  combination when nothing single solves it, and lists one option per kind of fix with before/after,
  power and price; one tap applies it (undo). The knock notice now fires at the knock-control margin
  (0.93) as in the race.
- Burnout: starts in the water box (wet tyre ~45 % of dry street grip), the tyre spins itself dry and then
  grips ~80 %, heats and smokes; a bogged engine is re-revved; the held rpm is a setup value
  (Burnout-toerental) and the burnout never runs anti-lag. Before, sticky tyres on a prepped track bogged
  the burnout to ~1100 rpm.
- Tests: tests/test_advice.js (the best recommendation, applied and measured again, has the predicted
  power and removes the notice; ranking; table vs quick-setup boost; no knock notice on a stock map);
  hop and burnout regressions in tests/test_tyres.js; smoke checks for buying and applying advice.

## 16. Phase 8: nitrous, welded head, stroker/destroker, compound boost (v1.12.0)

- Driver nitrous (category Lachgas): dry, wet, progressive and direct-port kits. Held N2O button in the
  race; the shot ramps in over the kit's progressive time, uses ~0.85 g/s per hp from a bottle kept per
  build (refill in the race setup), adds the torque of its oxygen, raises the knock index against the
  ECU's nitrous retard (tune: deg per 50 hp, 1.2 % torque per deg), and a dry kit past the injectors'
  capacity runs lean (knock and damage). The automatic spool shot in 'spool' is unchanged.
- Head lift in the race from the cylinder pressure (BMEP) against the head gasket's clamp margin; a head
  welded to the block has no gasket to lift (sealing option; the engine can no longer be split, a rebuild
  costs EUR 6,500 more).
- Stroker/destroker kits (crank category): the stroke sets the displacement, the rods keep the deck height,
  the combustion chamber stays so the compression ratio follows the swept volume; the crank's rpm limit
  follows the piston speed.
- Compound boost (category Compound boost): a K04 or G25-550 high-pressure stage ahead of the main turbo
  with a turbine bypass. Turbo.matchCompound matches both stages on their own maps: while the main turbo
  is spool-limited the HP stage delivers (with both turbines' back pressure); once the main turbo holds
  the target the bypass opens. Known simplification: the series pressure-ratio product and the interstage
  state are not solved, so compound does not raise the peak pressure ratio beyond either turbo.
  (Replaced in v1.13.0, section 17.)
- Tests: tests/test_phase8.js.

## 17. Rev limits, compound from the turbo list, full-throttle burnout, the Scirocco (v1.13.0)

- Rev limits: the mechanical limit is the weakest of block, crank, oiling, head and valvetrain
  (sim.js rpmLimitChain). An over-rev names that part and its failure mode (valve float for valvetrain
  or head, mass forces for the bottom end, oil foaming for the oiling); the advice upgrades exactly the
  limiting part(s). The ECU is not a mechanical limit: an ECU that cannot command the set limiter caps the
  revs (effectiveRevLimit) with a warning. The dyno sweeps up to 10 500 rpm; a full pro-mod rotating and
  valve assembly reaches it. Part cards show each rpm limit and the weakest other link.
- Compound: any smaller turbo from the turbo list can be fitted as the high-pressure stage
  (selections.turboHp; kit EUR 2,600 + the turbo, +14 kg; part of the build signature; 1.12 saves
  migrate). Turbo.matchCompound solves the series system: LP compressor -> interstage duct -> HP
  compressor (pressure ratios multiply; the HP wheel breathes the warm, dense LP outlet air, so its
  corrected flow is the LP flow / PR_lp x sqrt(T_interstage / T_ambient)); exhaust through the HP turbine
  (with a bypass valve) and then the LP turbine; the LP shaft balance sets the pressure split, the HP
  bypass regulates at the target, both rotors spool on their own power surplus and inertia, and once the
  LP turbo alone holds the target the HP stage is bypassed. Choke, surge and shaft limits per stage; HP
  overspeed is a failure. The solver uses a quadratic airflow fit in boost (checked to 0.4 % against the
  engine model) for realtime speed (~0.5 ms per step on a desktop CPU).
- Burnout: holding the button is full throttle; the pedal is never backed off and there is no clutch-in
  re-rev any more. The revs come from the clutch/tyre physics and the rev limiter; the optional burnout
  limiter (race setup) cuts at the set burnout rpm with the pedal flat. Still never anti-lag.
- 3D car: src/web/scirocco.js lofts a Scirocco Mk3 body from cross-sections at production dimensions
  (lowered), with the reference car's details (smoked corner tail lights, diffuser and oval tailpipes,
  roof spoiler, three-piece deep-dish wheels, red calipers). tools/car_preview.py renders fixed views.
- The owner's registration is erased everywhere: the 3D plate texture, the SVG and every photo/render
  (tools/erase_plates.py; blank yellow NL plate); the launcher icon is regenerated.
- Tests: tests/test_phase9.js (rpm chain and ECU cap, series-compound invariants, full-throttle burnout);
  the burnout regression in tests/test_tyres.js now checks that the revs never fall back.

## 18. Compound EMP control, N2O arm switch, tuner help 2.0, optimised maps (v1.14.0)

- Compound regression (1.13.0): a small HP turbine (e.g. a K03) choked the exhaust; the manifold pressure
  reached 9-12 bar and fed back through the residuals to a ~2900 C EGT on the dyno. The controller now
  opens the HP turbine bypass as far as needed to keep EMP <= 1.9 x MAP (absolute), the bypass valve is
  sized for the full exhaust flow (the LP turbine's capacity), and past its choke line the HP wheel loses
  efficiency (the shaft balance hands the work to the LP turbo) instead of the system dropping to the LP
  turbo alone before it has spooled. The turbo load of a compound is the LP map margin plus both shaft
  speeds (an HP wheel past choke is lost efficiency, not a 200 % load).
- N2O in the race is an arm switch: tap on/off (holding it blocked the shift taps on some phones); armed,
  the system sprays whenever the engine fires at full throttle. Bigger button with its state; the rival
  badge moved to the left so it no longer covers it.
- Tuner advice: recommendations can be ticked and evaluated together (one simulated combination, merged
  patch, applied in one tap, one option per family); the advice stays on screen marked "applied" until the
  next pull; predictions run at the heat soak of the measured pull.
- Optimised maps (tuner help, paid): street map (EUR 450, wide margins) and race map (EUR 950, the most
  the hardware survives). createMapOptimizer runs a coordinate search over boost low/mid/high, spark trim,
  lambda and cam on the dyno simulation; the constraints are the margins a map controls (torque and power
  against the weakest part, BMEP against the head clamp, knock, EGT, fuel duty, turbo load). Applying it
  rebuilds the ECU tables from the new quick setup (undo restores the previous tables).
- Tests: tests/test_phase10.js; the compound EMP/EGT regression in tests/test_phase9.js.

## 19. Physics audit against Bell, a sensible tuner, clutch-slip burnout (v1.15.0)

- Audit (tests/test_physics_audit.js) against the rules of thumb in A. Graham Bell, "Forced Induction
  Performance Tuning", on every preset: hp per lb/min of air (gasoline ~9.5-10.5, alcohol more), BSFC per
  fuel, turbine inlet temperature, the adiabatic compressor outlet temperature, intercooler effectiveness,
  EMP/MAP 0.75-2.0 and VE. The steady-state model was inside these ranges already.
- Two corrections from the audit: turbine efficiency versus expansion ratio now follows the shape of Garrett
  turbine maps (88 % of peak at ER 1.3, 95 % at 1.5, peak from ~1.8; it was 72 % at 1.4), and the transient
  inertia factor is 1.35 instead of 2.0, so a K04 on the 2.0 L lags its steady boost threshold by a few
  hundred rpm in a 550 rpm/s pull (it lagged ~1000 rpm). Known limitation: every Precision turbine is one
  mid A/R housing scaled by wheel size, so big turbos (PT7675 and up) come in late on 2.0 L, as they do
  with a large housing; smaller A/R housings are not modelled yet.
- Tuner advice ranking: a fix that costs more than 4 % power (12 % for knock, a failure or another safety
  limit) never ranks first or as "best choice"; it is shown with its power cost. Turbo-load advice offers
  the next one or two turbo sizes, and with a compound the next HP stage up.
- Optimised maps are honest: 'better' (more power inside the margins), 'safer' (the current map was
  outside them; named), or 'blocked' (no map meets the margins: named, not sold, refunded). A map inside
  its margins never loses power; when the current map is outside them the tuner first lowers the boost
  across the board, then optimises.
- Burnout: after the dump the driver slips the clutch (pedal flat) whenever the revs fall below 80 % of the
  dump rpm, until the turbo builds boost and the tyres break loose; the slip energy goes into the clutch.
  FWD and AWD cars with a laggy turbo no longer bog to idle. (An AWD car with a huge turbo stays near the
  floor rpm: four driven tyres under the full weight cannot be spun without boost.)
- Tests: tests/test_physics_audit.js, tests/test_phase10.js sections 5-6.

## 20. Night lighting, photo track surfaces, quality tiers, and what Hunyuan3D delivered (v1.16.0)

- **Bloom.** The race renders through an EffectComposer (RenderPass -> UnrealBloomPass -> OutputPass). The
  emitters in the scene are authored well above white (floodlight heads 3.2, environment lamps 8, tree bulbs
  up to 4, tail bar 3.2), while the clearcoat highlight on the paint peaks just over 1. The bloom threshold
  sits at 1.75, between the two: the lamps, the tree, the tail lights and the flames glow, and a reflection
  sliding over the flank no longer blows the car out (at the first threshold, 1.02, the burnout shot was a
  white streak across the whole bonnet).
- **Quality per feature, not one slider.** bloom strength, water reflections, lit smoke and the pixel ratio
  are separate switches, grouped into high/medium/low only as a default. The tier is guessed from
  deviceMemory/hardwareConcurrency and then corrected by measurement: the renderer averages its own frame
  cost over 60 frames and steps down a tier (at most twice) when that exceeds 22 ms, reporting it through
  opts.onQuality. quality() and setQuality() expose it, so a settings screen can override it.
- **Track surfaces.** The strip and the launch pad now carry photographed asphalt and concrete (Poly Haven
  'Asphalt Track' and 'Brushed Concrete', CC0, app use permitted) on their own plane, with the drawn lane
  lines, rubber and expansion joints as a transparent layer just above. Both are desaturated (0.18/0.15) and
  darkened to the night exposure before shipping; together 150 KB. Two things had to be worked around: a
  canvas that has drawn a cross-origin image cannot be uploaded as a WebGL texture, so the photos are loaded
  straight into a texture instead of being composited on the canvas the markings are drawn on; and the
  floodlight pools (14 m planes, several deep along the strip) washed the new asphalt out to sand, so they
  are down from 0.28 to 0.13 and less orange.
- **Lit smoke.** Each smoke sprite is shaded from its height (low down it is in its own shadow, higher it
  catches the floodlights) and from the car: the tail lights wash the cloud behind it red and an exhaust
  flame throws its own colour into it. flames.update() returns the intensity and colour it is drawing so
  the smoke can use them. A colour per sprite, 240 at most, and off on the low tier.
- **Water box.** A planar Reflector (512) on the high tier, so the car, the walls and the floodlights stand
  in the water; the flat pane above it thins to 0.45 opacity when the mirror carries the image. It is built
  on first use and follows the tier, including a step down from the watchdog.
- **Two things the composer broke, and the guards against them.** `renderer.info` resets itself at the
  start of every `render()` call and the composer makes several per frame, so `info()` reported the last
  fullscreen quad (1 call, 2 triangles) instead of the scene; the browser-smoke 3D checks read exactly that
  and failed (`realtime_canvas_track`, `replay_plays_back`). `autoReset` is off now and the counters are
  reset once per frame, covering the whole frame including post-processing (236 calls / 14.6k triangles for
  a full track scene). `tools/track_preview.py` fails below 50 calls or 2000 triangles, so it cannot break
  silently again - it runs in seconds where the smoke test takes 25 minutes. Second, the pixel ratio was
  read once at create() and then fixed, so a tier step down changed the effects but not the pixels drawn:
  on a phone short of fill rate the watchdog never pulled the cheapest lever. It follows the tier now
  (2.0 / 1.6 / 1.2) and the renderer, composer and canvas resize with it.
- **Tier on a software rasteriser.** SwiftShader, llvmpipe and Mesa software report plenty of memory and
  cores but cannot afford a second scene pass, so the guess asks the renderer what it is
  (`WEBGL_debug_renderer_info`) and starts them on low. That covers the headless smoke test and phones that
  fell back from a broken driver. Consequence for coverage: the browser-smoke test therefore exercises the
  **low** tier, with bloom and the reflector off. The bloom and reflection paths are covered by
  `tools/track_preview.py` across all three tiers instead, and neither has been measured on a real phone.
- **In the settings**, under the 3D switch: Automatisch / Hoog / Gemiddeld / Laag, with a line saying what
  each drops. 'Automatisch' leaves it to the renderer; when the watchdog steps down, the settings page says
  so (`graphicsQualityAuto`) instead of the picture quietly changing, and choosing a tier by hand clears
  that and pins it. The control is hidden while the 3D race view is off.
- **tools/track_preview.py** renders eight fixed points on the strip (burnout, staging, tree, launch, mid,
  finish, side, high) at a chosen tier, serving the page from the app's own https origin as
  WebViewAssetLoader does on Android. **tools/browser_env.py** resolves the headless Chromium from
  $EA888_CHROMIUM, Playwright's own build or the system paths, instead of the hard-coded /usr/bin/chromium.

### The Hunyuan3D car: measured, and not shipped

The pipeline is in `tools/car3d/` (rembg -> Hunyuan3D -> Blender -> GLB) and works end to end. The body it
produces is **not** in this build. What the runs showed, on an RTX 3090:

| Input | Model | Result |
|---|---|---|
| one clean side photo | Hunyuan3D-2.1, octree 512, 60 steps, 155 s | best: correct silhouette and proportions (4.256 x 1.99 x 1.36 m), roofline, C-pillar, shoulder line, arch flares, sill, mirror, roof spoiler all read as a Scirocco Mk3 |
| 3/4 hero photo | same | worse: the parked car and the fence in the background came through as debris on the roof |
| front/back/left/right | Hunyuan3D-2mv, octree 384 | **worse than one photo**: a wide lumpy fusion, 3.7 m across |

The multi-view model needs a straight-on front view and there is none; standing the 3/4 hero in for it makes
the views contradict each other, and the four photos come from three sessions (wet and dry, different ride
height). The single-photo body is good in profile but its front and rear are invented: no readable
headlights or grille, a generic rear with none of the car's wraparound tail lights or diffuser, and no panel
gaps anywhere. The rear is the side the chase camera shows most.

Agreed with the owner: **shoot four photos in one session** (straight on from the front, the rear and both
sides, same ride height, plain background, dry, from a distance with a long focal length) and run multi-view
again. Until then the procedural model in `src/web/scirocco.js` stays.

Notes for that run: the multi-view weights (`tencent/Hunyuan3D-2mv`) are a 2.0-generation checkpoint whose
`config.yaml` names `hy3dgen.shapegen.*` modules, while the 2.1 container calls the same classes
`hy3dshape.*`; rewriting those six `target:` lines in a copy of the model directory is enough to load it,
and the `--model_path` must contain `mv` because that is what switches the app into multi-view mode. The
Blender step needs `--yaw` set from the orientation the generator happened to pick (`probe.py` prints the
bounding box).

## 21. The scanned car (v1.17.0)

The owner shot seven more photos. Seven, all from the left of the car: two square-on left profiles (one dry
and sharp, one from the same wet session as the old side photo), three 3/4 front-left and two 3/4 rear-left.
Still no straight-on front and no right-hand side. What made the difference anyway was the existing
`randy-scirocco-rear-photo.png`, which is a square-on rear: left + rear + a mirrored left are three
consistent views, and Hunyuan3D-2mv needs a fourth only because it insists on a `front` key.

| Input | Result |
|---|---|
| the new dry side photo alone, octree 512 | worse than the old one: a tall bulbous greenhouse. The side windows are see-through in this shot (bright green trees) and the generator read the glasshouse as solid volume |
| multi-view: 3/4 front, rear photo, left, mirrored left, octree 384 | the real thing - but the cowl came out as a field of ragged geometry |
| the same at octree 512 / 70 steps / another seed | **the one shipped**: the cowl is clean, the rear carries the wraparound tail light line, the diffuser fins and the twin oval tailpipes, and the profile is a Scirocco Mk3 at 4.256 x 2.19 x 1.41 m |
| the same with a different 3/4 front photo | a 3.8 m wide blob |

So multi-view does work, with views that agree; the single-photo attempts in DEVLOG 20 failed because the
four photos did not. The front is still the weak side: no crisp headlight or grille shapes, no panel gaps
anywhere, and the wheel-arch cut leaves a slightly ragged lip. The rear - which the chase camera shows most
of the time - is good.

### Getting it into the game

- **Orientation.** The multi-view model comes out with the length already along Y, where the single-image
  ones needed a 90 degree yaw. `tools/car3d/probe.py` prints the bounding box; the yaw is set from it. Wrong
  yaw is not subtle: the car scales to 8.8 m wide.
- **Materials.** Blender assigns only `paint` and `trim` (dark, below 0.36 m: bumpers, sills, diffuser).
  Cutting the lights out of the mesh by position and normal was tried twice and both times gave something
  wrong - half the hatch, then two ragged blobs - because the generated recesses are soft.
- **The lamps are laid onto the surface instead.** A subdivided patch whose every vertex is dropped onto the
  body by a ray along the car's axis and lifted 4 mm clear, so it follows the real curvature instead of
  floating as a flat card. Their heights are measured, not guessed: `tools/car3d/probe_tail.py` prints a
  depth map of the tail and the nose, and the tail shows a band recessed 3-4 cm at y = 0.70..0.82 (the light
  line) with a second recess at 0.50..0.58 (the plate). Two things had to be handled: a ray near the outer
  edge slips past the nose and lands on the wing a metre further back, which dragged the patch out into a
  wedge hanging off the car (rejected now against the patch's median depth, with a tolerance per lamp
  because the nose is genuinely raked - 36 cm to 92 cm across the headlight); and a PlaneGeometry faces +Z,
  so a lamp on the nose faced into the car and was culled away until its winding was reversed.
- **One Object3D cannot hang in two cars.** `loadBody()` resolves with a single scene, and adding it to the
  second car reparented it out of the first: with a rival on the strip the player had wheels and no body.
  Each car clones it; the geometry is shared, only the node tree is new.
- **Frame cost.** 36k triangles a car, so 72k with a rival where the procedural body was ~7k. The strip
  itself is ~6k. The low quality tier therefore keeps the procedural body and everything else about the car
  stays the same. High tier measures 42.8k triangles a frame against 14.6k before.
- **Size.** 618 KB as meshopt (EXT_meshopt_compression + KHR_mesh_quantization), decoded by three's own
  `meshopt_decoder.module.js`, which bundles - no separate wasm file to ship. Draco would have needed one.

The registration is not in the model: only shape is generated (`/shape_generation` returns an untextured
mesh), the photos are not committed, and the 3D plate recess is left blank as before. If a texture is ever
baked from these photos, the plates have to be erased first - `tools/erase_plates.py` with boxes checked by
eye, because neither the shipped detector nor a wider one found them reliably in this set.

## 22. The headlight patch, and what the front photo did (v1.17.1)

**A defect in 1.17.0.** The headlight laid onto the nose lies flat on the bonnet as a white rectangle. It
is visible in the shipped APK. The placement was measured against a depth map, but that nose recedes 30 to
90 cm over the height a headlight occupies - there is no band flat enough to lay a patch on - and five
placements all landed on the slope. It is removed: the generated headlight recesses carry the shape and the
floodlights catch them. The tail lights are unaffected; the tail has a genuine 3-4 cm recess to sit in.

**The square-on front photo.** The owner supplied one afterwards, which is the view the multi-view model had
been missing. Rerun with front + rear + left + mirrored left, at octree 512 / 70 steps:

| | 1.17.0 body | with the front photo |
|---|---|---|
| nose | soft; recesses only | headlight and grille shapes in the mesh |
| height | 1.410 m | 1.513 m, 8 % over the production 1.404 |
| roofline | low and long, reads as a Scirocco | domed; the car reads squat, more hatchback |
| arches | clean | ragged lip where the wheels are cut |

Correcting the height on its own (`postprocess.py --fit`) fixed the number and made the look worse: squashing
a body that is too tall gives a squat one. Fitting the width as well was worse again - forcing it to the
production 1810 mm pulled the bodywork inside the track and the procedural wheels stood proud of the arches,
so `--fit` now deliberately lets the width follow the length. `materials.py` also learned to smooth the
paint/trim boundary, which a bare height threshold leaves ragged round the arches; both are in the tools for
the next attempt.

The shipped body stays the 1.17.0 one. The nose detail is worth having, the stance is worth more, and the
comparison went to the owner to decide. The candidate is kept outside the repo as
`$EA888_CAR3D_WORK/blender/scirocco-body-nofit.glb`.

## 23. The owner's own scan, wheels and all (v1.18.0)

The owner ran the multi-view model themselves, from a phone, with four views that agree: a square-on front
against a plain background, the rear, and both sides. It beat everything generated here - and at lower
settings (30 steps, octree 256, randomised seed) than the 512/70 this log had settled on. Consistent views
matter more than steps. The result has a clean nose with grille and bumper intakes, mirrors, the roof
spoiler, and complete wheels with spokes.

**Wheels baked into a body cannot turn**, and a drag game shows wheelspin, so `tools/car3d/split_car.py`
fits the scan to the game's chassis and cuts the wheels off it: measure the four contact patches, scale each
axis so the wheelbase (2.578 m), track (1.57 m) and height (1.404 m) are the real car's, then cut on the
game's own axle positions and write one wheel centred on its axle. `scirocco.js` hangs a copy in each of the
four wheel groups, where it spins exactly as the procedural one did.

Four things the measurements settled, each after a wrong guess:

- **The scan was 24 % wide for its length** (track/length 0.457 against the real 0.369) while its wheelbase
  was right (0.595 against 0.606). That is why scaling by overall length never looked right, here or in
  DEVLOG 22: the error is in the width, not the length.
- **The old wheel cut was 0.84 m across the axle.** It sliced through the sill and the floor and left the
  torn edge in plain sight under the car - what the owner saw and called out. A tyre is 0.25 m wide; the cut
  is 0.28 m now and its edge hides behind the tyre.
- **Measuring the generated wheel is the wrong tool.** A circle fit over the arch region lands on the arch
  (r = 0.57); a slab outside the axle plane catches the sill and the door (r = 1.0). Cutting on the game's
  own radius is both simpler and exactly the alignment wanted, and the extracted wheel came out 0.65 across
  against the ideal 0.646 - the scan's wheels were already the right size once the chassis fit was in.
- **The per-axis fit leaves the wheel an ellipse** (9 % flat), so it is rounded again on its own before
  export, or it would wobble as it turns.
- Mirroring the wheel for the right-hand side with a negative scale inverts the winding and lights it from
  the inside; it is turned half a turn about the vertical instead.

The road the car stood on comes through as a thin slab welded to the underside and shows as a ragged black
fringe along the bumpers once the wheels are gone; the near-horizontal faces low down are dropped and the
body cut off flat at 0.075 m.

Body 505 KB / 28k triangles, wheel 47 KB / 2.2k, so 37k a car against 36k before and 38k a frame on the high
tier. Still soft: no panel gaps, and the front splitter has a torn lower lip where it is cut off.

## 24. The photo-textured car (v1.19.0)

The owner ran `Gen Textured Shape` and exported it: 40k triangles carrying a 2048 baseColor and
metallicRoughness atlas. The car has its real paint now, with the VW badges, tinted glass, headlight and
tail-light detail, instead of the flat materials this file had been assigning.

`tools/car3d/textured_car.py` keeps the baked material and its UVs - assigning paint/trim by name would
throw the photograph away - and does three things to it.

**The registration is painted into the texture**, and it is not yellow there (the atlas reads as blue
almost everywhere; the largest yellow blob is 66 px), so a colour search finds nothing. It is found through
the mesh instead: the faces on each bumper where a plate sits, whose UV triangles are rasterised and filled
with the region's own median. A bounding box over those UVs blanked a quarter of the atlas because the
islands are scattered; per triangle it is 0.5 %. Both ends, and the band runs down to 0.18 m - on this car
the plate is on the bumper, not up on the boot lid, and the first attempt at 0.50..0.63 m missed it
entirely.

**The photos carry their own light.** The backdrop behind the nose and the sky on the bonnet are projected
into the texture as pale, desaturated patches that read as damage on the paint. Near-white, low-saturation
pixels are pulled towards the colour around them (0.4 % of the atlas). Badges, lights, tyres and glass are
untouched because they are either saturated or dark.

**One atlas, uploaded once.** The wheel carries UVs into the body's atlas and ships no texture of its own;
scirocco.js hands it the body's material. Exported with its own copy it was 233 KB; without, 10 KB.

The wheels themselves come from the *untextured* scan, which is 360k triangles against the textured
export's 40k - the textured wheels are 276 faces and read as dark blobs. So the shipped car is the textured
body with the sharper scan's wheels on the flat tyre/rim materials.

Body 393 KB with the atlas as WebP, wheel 10 KB, against 552 KB for the untextured pair; 34.7k triangles a
frame against 38k. Still there: the front bumper keeps some pale patches the de-glare pass does not reach,
and there are no panel gaps.

## 25. The studio-lit scan (v1.20.0)

The owner reshot the car against a plain mid-grey backdrop in even light - four square-on views, dry - and
ran both passes at octree 512 with a fixed seed: a textured export for the paint and a 1.23M triangle white
mesh for the wheels. Same run, same bounding box, so the wheels land in the arches without adjustment.

**The photographs fixed what no setting could.** The white blobs on the roof and bonnet in 1.19 were the
sky reflecting off the paint, baked into the texture by outdoor shots; they are gone. The de-glare pass
still runs (2.8 % of the atlas against 0.9 %, because the light backdrop bleeds at the silhouette) but it
is no longer papering over the input. Frame cost is down as well: 30.8k triangles against 34.7k.

Two things that had to be re-measured for the new body rather than carried over:

- **The tail glow** was still on the previous body's band and sat half on the hatch. The depth map puts the
  light line just above the bumper, and the reference photo puts the lenses at |x| = 0.57..0.87,
  y = 0.71..0.91. A band is not portable between scans; each one needs `probe_tail.py`.
- **The exhaust mouths** moved to x +/- 0.493, y 0.311, z 2.070.

Also worth recording for the next time: **the texture stage always remeshes.** Both of this owner's
textured exports came out at exactly 40,000 triangles whatever the octree, and at that budget the wheels
are a few hundred faces and read as dark blobs. Octree buys a more accurate shape going into the remesh,
not a denser textured mesh - which is why the shipped car is a textured body with wheels cut from the
untextured pass.

The registration is blanked in the texture as before, and checked at 4x zoom on the rear render: the recess
is body colour, no characters, no yellow.

Body 475 KB, wheel 50 KB. Still soft: the front bumper keeps some artefacts around the lower intake, and
there are no panel gaps.

## 26. High-resolution geometry wearing the texture (v1.21.0)

The body looked like dough because it was. Hunyuan's texture stage remeshes to 40k triangles before it lays
the UVs down, and once the wheels and the road slab are cut out of that, the body is 21k. Too few for a car:
the silhouette goes polygonal and the panel creases disappear. No decimation setting fixes that - there is
nothing left to keep.

`tools/car3d/hires_textured.py` takes the geometry from the 1.23M triangle shape pass and the UVs from the
textured one. Both come out of the same run in the same space, so once each is fitted to the game's chassis
their surfaces sit within a millimetre of one another and Blender's Data Transfer carries the UVs across by
projection. 40k triangles instead of 21k, with the scan noise relaxed by a corrective smooth before the
collapse rather than preserved by it.

The tail lights come out of the texture as well. The studio photos put real red lenses in the atlas (53k red
pixels, against 1k for the outdoor set), so the red inside the rear light region becomes an emissive map and
the lights glow in their own painted shape. The rectangular patch 1.19 drew over them is gone; it was drawing
lights on top of lights.

Still soft: the front bumper keeps artefacts around the lower intake, and there are no panel gaps.

## 27. What an hour of play found in the simulation (v1.22.0)

The owner played a full hour and came back with four things, all of them real:

1. the tuner only ever reached for fuel, boost and perhaps ignition;
2. 500 pk at 80 reliability was unreachable, with help or without;
3. 8000 rpm on parts rated to 8300 was taxed as if it were a stock engine, and oil got a heavier vote than
   it deserved;
4. compound setups did not behave like compound setups.

### The tuner could see one corner of the build

`MAP_PARAMS` held six entries. The optimiser therefore searched six of roughly fifteen settings that matter
and left rail pressure, the rev limiter, cam timing, the wastegate and the ethanol blend exactly where the
player had put them. It is now eleven, each bounded by what the hardware on the car actually allows -
`mapParamRange()` asks the fitted pump for its maximum rail pressure, the fitted parts for their rev limit,
and the fuel for whether a blend is even adjustable. A fixed grade like RON98 is simply not in the search.

It also could not say what it had done. Every change now carries a name, a unit and both values
(`raildruk 180 -> 205 bar`), so the map that comes back is readable instead of a price and a power figure.
On the owner's build the tuner now moves ten settings where it moved four.

### A goal between street and race

There were two goals: street and race. The one the owner wanted - **as much power as will hold 80
reliability** - was neither. `safe` is that goal, and `mapScore` now penalises missing a goal's
`reliabilityFloor` rather than treating reliability as something to trade away freely. On the owner's own
build the three goals come out as a ladder: street 88 reliability, safe **507 pk at exactly 80**, race 530 pk
at 65.

### The reliability score was punishing the wrong things

The score is 100 minus a sum of bands, and a build could sit at 60 with nothing actually wrong - a dozen
bands each taking five points. `tools/risk_breakdown.js` prints the terms so this could be argued from
numbers rather than impressions. Four of them were wrong:

- **Knock.** The score charged `knockIndex * 24`. But a knock controller deliberately holds spark just under
  the limit, so every properly calibrated engine paid about 23 points for its ECU doing its job. What
  actually matters is how much spark is being given up against MBT and whether the controller has run out of
  authority, so the term is now three: spark deficit against MBT (bmep-weighted), how much retard the
  controller is holding, and - sharply - the knock limit actually being exceeded.
- **Revs.** The rev band started at 82 % of the parts' rating, so 8000 rpm on parts rated to 8300 cost
  reliability before anything was wrong. The parts' own rating is the limit: approaching it is not a fault,
  exceeding it is. The band now starts at 95 %. 8000 rpm costs 7 points on the owner's build where it used to
  cost around 15, and 9200 rpm still destroys the engine.
- **Piston speed** was judged against a fixed number and so double-counted the rev limit. It is now derived
  from the fitted crank's own stroke and rating.
- **Oil film** was judged absolutely - a thin film scored badly whether the engine was making 10 bar BMEP or
  35. It is now judged against what the load actually demands (`oilFilmNeed`), and oil temperature is judged
  against the fitted oil's own tolerance rather than a constant.

Part bonuses were also doing too much of the work (a multiplier of 0.62, plus five points for the ECU), which
let parts buy back reliability the physics said was not there. 0.34 and three.

### Compound boost handed over backwards

The HP turbine bypass had two faults. It was sized as a turbine nozzle rather than as a port, so wide open it
still choked the exhaust: 3.4 bar EMP at 6000 rpm where the LP turbo alone makes 2.3, and the compound was
slower than the single turbo everywhere above 4000. And it was scheduled open as the HP compressor approached
choke, on the idea that the LP turbine needed the energy early - which made boost *fall away* at the
handover (1.02 bar at 5000 rpm, 0.63 at 6000), because no boost controller gives up pressure it is still
making.

The bypass is now a port (at least 2.4x the LP turbine's own flow) and there is no schedule at all. The
controller keeps the bypass shut unless the manifold needs relief, and separately tries it wide open, keeping
whichever setting holds more boost. The handover then falls out of the shaft balance: the bypass opens
exactly as fast as the HP stage stops earning its exhaust energy. On the big-turbo case the bypass goes
22 % -> 100 % between 6000 and 7000 rpm and the stage drops to LP-only at 8000, with boost rising the whole
way.

What that costs and buys: a K03 as the HP stage on the owner's build is 59 % up on torque at 2500 rpm and
within 6 % at 6000. An HX52 build with a PT6870 and a K04 HP stage now peaks at 614 pk against 620 for the
PT6870 on its own - a compound should buy its bottom end with a little top end, not with a fifth of it.

### Tests

`tests/test_tuner.js` is new and states each of these as an invariant: the tuner must touch rail pressure,
the rev limiter, cam timing, boost and lambda and name what it changed; it must not offer ethanol on a fixed
grade or rail pressure past the pump; `safe` must reach 500 pk at 80 on the owner's build; the three goals
must form a ladder; 8000 rpm on parts rated 8300 must cost at most 8 points while 9200 still costs; running
the wrong fuel must give up more spark and cost reliability; over-boosting a maxed turbo must cost at least
15 points; and a compound must be 30 % up at 2500 rpm while giving up little at 6000.

One existing assertion in `tests/test_phase8.js` was checking the handover on a build whose LP turbo cannot
spool at all (a PT6870 on the small K04 engine reaches 0.5 bar by 7200 rpm), so it was testing the opposite of
what its own comment claimed. It now asks that of a build whose LP turbo does spool, and asks of the K04 build
the thing that is actually true there: a choked HP compressor makes almost no pressure ratio but the compound
is still far ahead of the LP turbo alone.

### Open

- **The K04 hybrid at 3 bar.** On the engine the wheel reaches 2.44 bar gauge - 3.44 bar absolute - and the
  modelled map's own ceiling is `prTop` 3.75, which is 2.75 bar gauge. So 3 bar absolute is comfortably
  inside it and 3 bar gauge (PR 4.0) is above it. This is a modelled map, not a vendor one, so widening it is
  a judgement about this particular hybrid: worth asking rather than quietly doing.
- A stock engine still scores around 47 reliability, and stock EGT sits near 980 C without responding to
  lambda enrichment. Both are modelling gaps, not balance, and neither is fixed here.

## 28. Compound that stacks, 2500 pk from two litres, and engine swaps (v1.23.0)

Two requests, and the first one turned out to be blocked by the simulation rather than by the catalogue.

### Compound boost was never doing what compounding is for

`matchCompound` bypassed the HP stage whenever the LP turbo was not spool-limited. So a compound helped a
turbo that could not spool, and did nothing at all for a turbo held back by its own shaft speed or its own
map. Adding any HP turbo to the `unlimited` build moved its peak by under one per cent - 1536 to 1542 pk
against 1552 without. Two compressors in series reaching a pressure ratio that neither can reach alone is the
whole point, and the model could not express it. The HP stage is now bypassed only when the LP turbo reaches
the target on its own *and* does it at least as well.

**Surge was upside down.** The surge line is a minimum flow at a given pressure ratio. It was searched for
with `bisectMax`, which assumes a predicate true at low boost and false at high, so the solver drove boost
*down* into surge: a PT10603 came back at 0.80 bar with the surge flag set, where at full flow it sits 18 %
to the right of its own line. Worse, one surging sample low down poisoned the whole pull through the
rotor-inertia chain, which is why the biggest turbo in the catalogue made 350 pk. What surge actually costs
is pressure - in surge the flow breaks down and the compressor cannot hold more than its own line allows at
the flow it has. That is a ceiling on pressure ratio, it does fall with boost, and it bisects honestly. The
compressor map now inverts its surge line (`surgePr`).

**The first stage had no wastegate control at all.** It took every pressure ratio its turbine could drive, so
a compressor sized for 2500 pk of airflow sat deep in surge at 5000 rpm. Its corrected flow is set by the
engine's mass flow and its inlet pressure, not by how the ratio is split between stages, so the highest ratio
it can hold is the surge line read at that flow. The controller holds it there and the HP stage makes up the
rest - which is exactly what a compound is for.

Asking for more boost no longer gives less power. On one build the 7/8/9/10 bar ladder read
2110/1569/2198/1573 pk; it now rises monotonically.

**And the handover had a cliff.** Bypassing the HP stage the moment the LP could just manage alone made 2.97
bar give 3961 pk and 2.98 bar give 4398, off the same hardware: past the threshold the two stages shared the
ratio, each ran lower on its map, and the charge came out cooler and denser at the same manifold pressure.
The decision is now made on that - the charge temperature each setup delivers - rather than on whether the LP
could have coped. A small HP wheel past its choke line heats the charge for nothing and is still bypassed
(the street K03 compound is +58 % torque at 2500 rpm and 3 % down at 6000); a big first stage sharing the
ratio with a fast second one is kept.

### 2500 pk from two litres

With the physics working, the rest was hardware. About 200 lb/min of air at 8-9 bar, which is a big first
stage with a fast second one, dome control that can set two stages apart, an ignition that will fire at 10
bar, a port past the promod head and structure for 120 bar BMEP. Added: `triple_60_compound` (10 bar),
`magneto_cdi` (10 bar), `open_headers_5`, `compound_billet`, `compound_billet_head`,
`pneumatic_valvetrain`, `compound_ecu`, `compound_drysump`, `compound_4speed`, `compound_destroke_crank`.

The `compound2500` preset makes **2533 pk at 45 reliability** on a PT10603 with a PT6466 as the high-pressure
stage, and **2640 pk on the full two litres** with the standard-stroke promod crank (the destroked crank is
1796 cc, which is what real Pro Mod fours do and why it scores better).

`open_headers_5` is deliberately not simply better: a compound wants some back pressure to drive its LP
turbine, so on this engine the freest exhaust costs power (2303 against 2575 pk). On the eight-cylinder it is
the other way round. That is real and it stays.

### Engine swaps

The cycle model was already written for any cylinder count - `engine.js` takes it from the geometry - but
`sim.js` hard-coded four in three places: `engineGeometry`, the cycle-model call and the compression test.
Cylinder count, bore, stroke and rod length now come from the block, so **an engine swap is a block**. A
swapped block also keeps its own stroke: a 100 mm VW stroker crank means nothing inside an RB26.

| swap | | preset makes |
|---|---|---|
| VW VR6 3.2 (R32) | 3189 cc, 6 cyl, 84,0 × 95,9 | 784 pk, 861 Nm |
| 2.5 TFSI DAZA (EA855 evo) | 2480 cc, 5 cyl, 82,5 × 92,8 | 868 pk, 766 Nm |
| Nissan RB25DET Neo | 2498 cc, 6 cyl, 86,0 × 71,7 | 738 pk, 686 Nm |
| Nissan RB26DETT | 2568 cc, 6 cyl, 86,0 × 73,7 | 1002 pk, 803 Nm |
| Toyota 2JZ-GTE VVTi | 2997 cc, 6 cyl, 86,0 × 86,0 | 1090 pk, 934 Nm |
| Mazda 13B-REW bridgeport | 2× 654 cc, 2 rotors | 592 pk, 589 Nm |
| Steve Morris SMX 540 | 8861 cc, V8, 114,3 × 108,0 | **4019 pk, 3136 Nm** |

Each swap brings its own head, because an EA888 head on an RB26 is nonsense; the heads carry their own port
and cam data in `data/engine/heads.json`.

**The Wankel** is the one that does not fit a piston model, and the compromise is stated rather than hidden.
A 13B passes both its 654 cc chambers every revolution of the eccentric shaft, where a four-stroke swallows
half its displacement per crank revolution, so its breathing equivalent is 2616 cc - and it is modelled as
two chambers of 1308 cc with the equivalent bore and stroke that give exactly that. The equivalent bore of
120 mm is an artefact of treating a chamber as a cylinder, so the port equivalent is scaled the same way (a
bridgeport intake of roughly 45 × 55 mm per rotor reads as two 56 mm valves against that bore), or the inlet
Mach index sees a restriction that is not there. A rotor does not reciprocate, so the block states its own
equivalent stroke for the piston-speed term: what limits a Wankel is seals and heat, which is its rpm limit.
Real capacity is reported separately from the breathing equivalent.

**The Steve Morris package** is a package: 4000 pk needs its own crank, valvetrain, oiling, engine
management, a Lenco with a three-disc clutch, a methanol system nearly twice the promod one, and two PT9803
in parallel. The pair is a modelled map, marked as such: identical wheels side by side pass twice the flow at
the same pressure ratio and the same shaft speed, and each rotor only has to spin itself, so the single's
capacity is scaled on flow alone and its pressure ratio, shaft limit, efficiency and inertia are unchanged.
The package also needs a boost ramp - at 3.7 bar from 4000 rpm it makes 4470 Nm and breaks its own torque
limit before it ever reaches peak power.

### A guard, because this bit twice

Four part categories carry their physics in a separate data file, looked up by part id with an OEM fallback.
A part added without its data entry therefore runs silently on OEM numbers instead of failing. The 5-inch
exhaust breathed through the OEM 63.5 mm pipe (2575 down to 968 pk) and the billet compound head ran the OEM
port (2690 down to 2150). `tests/test_parts_data.js` now checks every part in those categories, and caught a
third case immediately - the compound wastegate. `tools/parts_edit.py` reads and writes the parts table that
`sim.js` carries as one 100 KB JSON line, so adding parts is no longer text replacement inside a literal.

Two hard-coded counts in the test suite and the smoke test went stale for the same reason and are now floors.

### Open

### The K04 hybrid at 3 bar

The owner answered the open question from 1.22: 3 bar **gauge**. Their map is modelled, and it had taken this
file's generic 560 m/s tip-speed fallback, which is a cast-wheel figure - 166k rpm and a 3.75 pressure-ratio
ceiling. On the engine that stopped at 2.87 bar with the shaft at 98 % of that limit.

Both numbers come out of the same formulas, so both move together. A 52 mm billet wheel has a 64.5 mm exducer
(inducer / 0.806, trim 65), and 590 m/s - normal for modern billet compressors, where 560 is the cast figure -
gives 174k rpm and `PR = (1 + eta*psi*U^2/(cp*T1))^3.5` = 4.4 at eta 0.72 and a work coefficient of 0.65. The
map now uses those. It is still modelled, not measured; what the owner's statement did was prompt revisiting a
fallback assumption that did not fit the hardware, and the entry's `basis` says exactly that.

Reaching 3 bar then takes the rest of the car, and each link is a real one:

| | |
|---|---|
| the preset as it stands | 2.44 bar — the internal wastegate is rated 2.35 and the overboost cut holds the target at 2.44 |
| + dual 44 mm wastegates | 2.69 bar — then the coils break down; they are rated 2.2 bar |
| + motorsport smart coils | 2.92 bar — then the injectors saturate at 105 % duty |
| + DI/MPI staged fuel | **3.00 bar, 553 pk, 665 Nm**, shaft at 171k of 174k, reliability 47 |

- **EGT on the two-litre compound reads 1523 °C** and barely moves with enrichment (1533 at lambda 0.85,
  1516 at 0.60). The cycle model is right about why - at 11 bar of exhaust manifold pressure the gas cannot
  expand, so it leaves near cylinder temperature - and the eight-cylinder with open headers sits at a healthy
  800-860 °C. But nothing in the model says a turbine wheel melts at 1050 °C, and enrichment should be the
  main EGT control. Both are gaps, not balance.
- A stock engine still scores about 47 reliability.
- The swap engines use the EA888's crank, valvetrain and sealing ladders as "preparation level" rather than
  parts that physically fit. The presets choose sensibly; a player can still build something that could not
  exist.
- The 3D car is still the Scirocco shell whatever is under the bonnet.

## 29. Naming the limit, not just hitting it (v1.23.1)

Reported straight from play: a Steve Morris block with the most expensive gearbox, and the pull ends at 2800
rpm on *"Koppelpiek overschreed de grens van motor of transmissie"* - 516 pk and 1294 Nm observed, no
reliability score - and the tuner has nothing to offer.

Both halves of that were my gap, and both were avoidable.

**The limit could not name itself.** `componentTorqueLimit` was a bare minimum over seven categories, and so
was the mechanical power limit, so the abort could only say "engine or transmission". The rpm abort has named
its part for a long time (`rpmLimitChain`); torque and power now have the same thing, `loadLimitChain`, and
the messages read:

> De versnellingsbak (Randy versterkte O2Q + Quaife) houdt 840 Nm; er kwam 1008 Nm op bij 3000 rpm.

**The advice was reaching for the wrong parts.** For a torque or power abort it offered the next block, the
next crank and the next gearbox regardless of which category was actually low - so fitting a big engine to a
build whose crank is rated 1000 Nm produced advice about the block, and nothing that would let the pull
finish. It now upgrades what is the limit, the way the over-rev advice already did.

**And fixing one wall at a time is not advice.** On that build the gearbox goes first at 840 Nm, then the
crank at 1000, then the valvetrain at 1520: three aborted pulls to learn what the block said on the day it
was fitted. A swapped engine is a deliberate choice about how much the build has to take, so the advice now
also offers the whole set at once - *"Bouw op de motor afstemmen (SMX 540, 4200 Nm): Lenco + SMX krukas + SMX
kleppentrein"* - and taking it lets the pull finish.

**Before the pull, not after.** The part picker already showed each part's rpm limit and whether something
else was the weaker link. It now shows the same for torque, so an engine rated 4200 Nm next to a crank rated
1000 is visible when you fit it.

## 30. Building the maximum by hand, and what that found (v1.24.0)

The owner set a test: assemble the highest-power build the catalogue allows for every engine, by hand, and
then check that the in-game tuner can get within 98 % of it. *"Op deze manier kom je alle problemen met
onderdelen en manier van tuning en hoe alles berekend wordt vanzelf tegen."* That is exactly what happened,
and the first thing it found was that the in-game tuner was making cars slower.

`tools/max_builds.js` is the offline search: coordinate ascent over every part category, every turbo pairing
and eleven tune axes, about 1500 dyno pulls per engine. It judges a candidate by the same margins the in-game
race map is judged by, because maximising power with the margins switched off would both make 98 % of it
unreachable by construction and produce "builds" that are grenades.

### The tuner was detuning the car

Asked for a race map, the optimiser took the 2500 pk compound build from 2520 pk to **1568** and then
declared the map unsellable anyway. Three separate faults stacked up.

**Extra exhaust energy was poured in as heat.** A nitrous spool shot (or fuel burning in the manifold under
anti-lag) was added to the turbine inlet temperature as `power / (mass flow x cp)`. At 3400 rpm off boost the
mass flow is tiny, so a 250 hp shot read **1601 °C** at the turbine. It is a gas stream with its own mass and
its own temperature, not heat poured into the engine's exhaust: two streams mix to a mass-weighted mean, and
nothing burning in air gets past its adiabatic flame temperature. 1601 °C became 1139.

**The optimiser scored against limits no map can move.** With EGT over the goal's 1000 °C, the score is
`-1000 - violation*100 + hp*0.01`, so power is worth a hundredth of a point and the search will trade 950 pk
for a few degrees. It now works out which checks are out of the map's reach and reports them as hardware
findings instead of scoring against them.

**And the first attempt at that probe was wrong in an instructive way.** Winding the boost to zero looked like
the obvious test for "can the map fix this". It is not: the spool shot is gated on the turbo not yet being up,
so at zero boost the very hardware causing the problem switches itself off and the check reads clean. The
probe runs at real fractions of the boost range now, and a limit counts as out of reach only when every probe
is over it.

Together: the tuner now **improves every preset in the game**, from +6 pk on the RB25 to +600 on the Steve
Morris, and none get worse. The compound build goes 2520 → 2609 instead of 2520 → 1568.

### Settings the player had paid for and could not reach

`MAP_PARAMS` carried a static maximum per parameter and the hardware could only ever lower it. So dome control
good for 10 bar could still only be asked for 4.5, and a valvetrain rated 11400 rpm could only be asked for
11000. The static number is the fallback for a part that does not state one; the hardware sets the bound.

The rev limiter had the same problem twice over: `clamp(..., 5000, 10500)`, written when nothing in the
catalogue revved past it. Parts rated 11200 and 11400 rpm were partly unreachable. The ceiling comes from the
catalogue now, with headroom above the strongest part on purpose - asking for more than the parts can take is
how you break them, and the over-rev abort has to stay reachable.

### "Maximum power" could sell you a grenade

The race goal had no reliability floor, so the offline search happily returned an RB26 making 1764 pk at zero
reliability. It has a floor of 35 now: street 88, safe 80, race 35 is a ladder, and every rung means a car
that comes back.

### What the search says about the parts

The nitrous spool shot on the high-end presets is worth nothing: the compound build makes 2520 pk with it and
2518 without, and with it the EGT spike condemns every map. The search drops it, which is the point of running
the search.

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
- Compound: no interstage intercooler, the HP compressor is either in the flow or fully bypassed (no
  partial bypass flow split), and the HP turbine bypass is one lumped valve.
- Turbo: see "Known inaccuracies (turbo)" above; spool transients still use an effective inertia factor.
- ALS combustion is a lumped energy model; flame visuals are stylised, timing/intensity are simulation-driven.
- Engine voice: the exhaust is one waveguide with lumped turbine and muffler filters, not a 1D gas-dynamics
  solution; blowdown pulse shapes and the engine-bay levels are tuned, not measured. It is an original
  synthesis, not a recording of a real car.
- Tyres: two lumped thermal nodes with modeled coefficients (no tyre test data), one grip-vs-temperature
  curve per compound; no tread wear, no pressure rise with temperature. The burnout car is held perfectly
  still (no creep, no line-lock model).
- Knock events are the expected number of knocking cycles (deterministic), not a stochastic per-cycle model.
- 2D fallback track perspective is stylised; the 3D car is a procedural model without suspension motion.
- Oil temperature, oil film and wear are still empirical models.

## APK signing

The repository has no signing key. Test APKs from this environment are signed with a throw-away session key,
so they **cannot update** an app signed with the original certificate: uninstall the old app first (export the
build code on the Data page before uninstalling; localStorage is lost with the app). For releases, build with
the permanent keystore via `EA888_KEYSTORE` / `EA888_KEY_ALIAS` / `EA888_KEY_PASSWORD`.
