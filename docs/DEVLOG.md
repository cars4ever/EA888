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
