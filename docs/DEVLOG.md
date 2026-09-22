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
  - `modeled-turbos.json`: the other 16 catalogue turbos. No trustworthy public map exists for them, so they are
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

## Changelog (claude-dev)

- `25f8a37` dyno abort consistency (strict result model, legacy repair, tests)
- `153c845` compressor-map turbo model (vendor + modeled data, physics, UI, tests)
- `6397d99` anti-lag core, realtime turbo runtime, flame events (tests)
- `c333da2` anti-lag tune panel, HOLD ANTILAG, live flames, audio layers, wear persistence
- next: two-step pops/stutter, timeslip turbo line, version 1.3.0-debug (code 130)

## Remaining known inaccuracies

- Turbo: see "Known inaccuracies (turbo)" above (outer map efficiency, reference conditions, modeled map shape,
  inflated VE on the big pro-mod presets, simple turbine efficiency).
- Spool transients use an effective inertia factor (×2.5) instead of modeling exhaust-manifold filling and
  thermal lag.
- ALS combustion is a lumped energy model (fraction of the fuel energy released in the manifold); there is no
  per-cylinder or crank-angle model, and catalyst damage is not modeled.
- The realtime race uses the dyno's WOT samples for engine airflow at part load/two-step (scaled), not a
  separate part-load model.
- Flame visuals are CSS sprites; timing/intensity are simulation-driven, the look is stylised.
- The analytic `simulateDrag` (used for the rival) still uses the steady dyno curve (no transient turbo).

## APK signing

The repository has no signing key. Test APKs from this environment are signed with a throw-away session key,
so they **cannot update** an app signed with the original certificate: uninstall the old app first (export the
build code on the Data page before uninstalling; localStorage is lost with the app). For releases, build with
the permanent keystore via `EA888_KEYSTORE` / `EA888_KEY_ALIAS` / `EA888_KEY_PASSWORD`.
