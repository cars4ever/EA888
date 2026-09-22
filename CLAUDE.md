# EA888 LAB — Claude handoff

## Starting point
Use **EA888 Lab v1.2.0 source** as the canonical codebase, not an older APK screenshot/build.

Current architecture after extraction:
- `src/assets/app.js` — UI/game flow/state
- `src/assets/sim.js` — engine/dyno/drag simulation
- `src/assets/styles.css` — UI styling
- `src/assets/index.html` — WebView entry point
- `src/assets/audio/` + `src/assets/audio-bank.js` — engine/drag audio
- `src/assets/images/` — Scirocco, engine, track and UI art
- `tests/test_sim.js` — simulation tests
- `tools/browser_smoke.py` — mobile/WebView workflow smoke test
- `tools/build_apk.py` — offline APK build/sign pipeline

Existing commands:
```bash
node tests/test_sim.js
python3 tools/browser_smoke.py --assets src/assets --screenshots /tmp/ea888-shots --report /tmp/ea888-browser-report.json
python3 tools/build_apk.py --output /tmp/EA888-Lab.apk
```

Android identity in v1.2.0:
- App label: `EA888 LAB`
- Package: `nl.randy.ea888lab.stabl`
- Version code: `120`
- Version name: `1.2.0-debug`

## IMPORTANT signing note
The archive does **not** contain the existing private signing keystore. `tools/build_apk.py` reads `EA888_KEYSTORE` and otherwise creates/uses a keystore at a default path. On another computer/server that will create a different certificate, so it cannot update an already-installed APK signed with the old certificate.

Before making releases, establish one permanent keystore location and keep it backed up. Do not keep regenerating a signing key or changing the package name every version. Move keystore passwords out of source code and into environment variables. Never commit a keystore, signing password, API key, token, or other secret.

## Product goal
This is an Android game/simulator around a VW EA888 Gen 1 / CAWB engine and the user's blue VW Scirocco. The core loop is:

**build engine -> assemble correctly -> bench-test -> tune -> dyno -> diagnose -> drag race -> service/rebuild -> improve build**

The game should feel visually like a polished mobile racing/tuning game, but the underlying engine, turbo, fuel, oil, heat, damage, gearing and drag behavior should stay engineering-inspired and internally consistent.

## User's real reference build
Preserve these important references in presets/components:
- EA888 Gen 1 CAWB base
- JE 83.00 mm Ultra pistons, 9.6:1
- OEM crank, balanced
- forged rods / ARP rod bolts / ACL bearings
- Cometic MLS + ARP head studs
- Bar-Tek / Cat Cams head/cams reference
- Ferrea valves/springs/retainers/keepers
- Nostrum HPFP + Bar-Tek/RSX-style injectors
- Syvecs SGDI-TSI-DF
- Randy K04-064 hybrid
- HX52 twin-scroll reference
- reinforced O2Q + Quaife
- user's actual blue Scirocco image assets in `src/assets/images/`

Do not imply the game is certified tuning software. It is an engineering-inspired simulator/game.

# Highest-priority next work

## 1. Fix contradictory dyno results/state
Current user-reported problem: an aborted pull can say e.g. **aborted at 5900 rpm due to severe knock**, while still displaying a supposed peak at 7800 rpm. That is impossible and breaks trust.

Implement a strict dyno result model:
- `status`: completed / aborted / failed-to-start
- `abortRpm`, `abortReason`, `samples[]`
- If aborted at 5900 rpm, no measured result may reference data above 5900 rpm.
- Display **highest OBSERVED power/torque before abort**, explicitly labeled as partial, or show `—` if insufficient data.
- Never show a completed-run reliability/confidence result for an aborted run.
- Damage/wear must derive from the actually simulated samples up to the abort point.
- Partial telemetry remains viewable, with the abort point marked in red.
- Drag race should require a valid completed dyno for the current build if that remains the game rule.
- Add tests specifically preventing “future RPM” values after an abort.

## 2. Replace simplistic turbo behavior with compressor-map based modeling
The user explicitly wants real-world boost/flow maps where available.

Create a structured turbo dataset, preferably JSON, per turbo:
```json
{
  "id": "...",
  "name": "...",
  "compressorInducerMm": 0,
  "turbineExducerMm": 0,
  "maxShaftRpm": 0,
  "mapSource": "vendor/public reference or modeled approximation",
  "mapType": "measured|vendor|modeled",
  "surgeLine": [],
  "speedLines": [],
  "efficiencyIslands": [],
  "chokeLine": []
}
```

Model with at least:
- corrected mass flow
- compressor pressure ratio
- compressor efficiency interpolation
- surge margin
- choke margin
- shaft-speed limit
- turbine backpressure/EMP approximation
- turbine inertia/spool
- wastegate flow limit
- intercooler pressure loss
- air temperature rise from compressor efficiency
- engine VE/head flow and RPM demand

For a turbo without a trustworthy public map, clearly mark it as **modeled**, do not invent a fake manufacturer map. Keep data/provenance separate from UI.

## 3. Add proper anti-lag system (ALS)
Add an anti-lag setup panel under tuning.

Suggested controls:
- Off / mild / street / rally-style / drag-aggressive / custom
- ALS target RPM
- ALS target boost
- ignition retard (deg ATDC / retard from base)
- extra fuel/enrichment
- throttle/bypass percentage
- aggressiveness 0–100
- maximum allowed EGT
- maximum turbo shaft speed
- cooldown/timeout protection

Simulation effects while ALS is held:
- turbo speed rises faster / boost retained
- exhaust manifold pressure rises
- EGT rises sharply
- turbo/manifold/valve wear rises
- fuel consumption rises
- knock/thermal risk changes realistically
- overly aggressive ALS can damage turbo/manifold/valves and should not be free performance

### ALS gameplay control
Add a **large HOLD ANTILAG** button in staging/launch where appropriate. It must be a hold control, not a simple toggle.

When held:
- engine note becomes harsher/louder
- boost and turbo-speed respond live
- EGT/wear indicators respond live
- exhaust flame effect appears

## 4. Exhaust flames and shift behavior
Add visual exhaust-flame effects tied to actual combustion/shift/ALS events, not random animation.

User preference:
- normal good/green-zone upshift: small brief flame/pop
- red-zone/limiter/late shift: larger, more aggressive flame
- aggressive ALS: frequent/larger flames

Scale flame color/size/duration with unburnt fuel + exhaust temperature + event severity. Avoid showing flames when the calculated conditions do not support them.

## 5. Keep transmission behavior realistic
- DQ250 DSG may shift automatically.
- O2Q/6MT/manual/sequential/dogbox must require user shifts unless an explicit test/autodriver mode is active.
- Early shift: actual RPM drop and lower torque after ratio change.
- Late shift: actual limiter time/fuel cut/thermal consequence.
- Missed shift: remain in gear / limiter or modeled bad engagement; do not just add arbitrary time at the end.

## 6. Preserve and improve realtime drag gameplay
Current intended flow:
1. Fullscreen burnout
2. Fullscreen staging/tree
3. Fullscreen rear-chase 1/4-mile race
4. Finish/timeslip -> overview

Requirements:
- user's Scirocco visibly drives down the track
- road/track geometry and scenery move according to simulated speed and distance
- player steers to stay between lane lines
- lane departure invalidates the run only after a meaningful threshold/time, not instantly
- heads-up opponent remains independently simulated
- rpm, speed, boost, gear, 60 ft/330 ft/1/8/1000 ft/1/4 are live simulation values
- stable 60 fps target where practical on modern Android
- large touch controls with safe-area spacing above Android navigation

## 7. Audio
Audio must survive repeated races without hanging or becoming silent.
- hard-stop/disconnect active race voices at finish/exit
- do not destroy reusable decoded buffers unnecessarily
- safely resume/recreate AudioContext after Android/WebView suspension
- regression test 3+ races in one session
- engine pitch/load must follow RPM/load continuously
- ALS, limiter, manual shift, DSG burp, turbo and tire audio must be separate events/layers

Do **not** copy copyrighted YouTube audio into the APK without user-owned/authorized source media. It is fine to use a reference clip to guide an original synthesis/sample design.

## 8. UI/UX quality
Preserve the dark/metal/orange visual identity, but continue polishing:
- large touch targets
- no tiny stacked critical buttons
- consistent states: disabled / armed / active / danger
- show why an action is unavailable
- bottom nav must clear Android system nav/gesture area
- no contradictory status labels such as “motorwear 100%” next to “motorschade 100%” unless labels clearly mean remaining health vs damage
- standardize semantics: use `health` or `wear` consistently, not both inverted

# State/data consistency rules
These are non-negotiable:
1. There must be one canonical build state.
2. Changing hardware/tune invalidates dependent dyno/bench/race data.
3. UI never invents values separately from simulation state.
4. Completed, aborted and stale measurements are visually distinct.
5. Damage, wear, temperatures and service state persist consistently.
6. A value shown as “measured” must come from simulation samples actually reached.
7. Add regression tests for every bug fixed.

# Working style requested from Claude
Start by reading the whole repository and mapping state flow before changing code. Do not rewrite the app blindly.

Suggested sequence:
1. Create/use a development branch and keep the baseline commit intact.
2. Run `node tests/test_sim.js`.
3. Run `tools/browser_smoke.py` and save baseline report/screenshots.
4. Trace build state, dyno state, damage state and race state.
5. Fix dyno-result consistency first.
6. Refactor turbo data/model second.
7. Implement anti-lag simulation + UI third.
8. Add flames/audio integration fourth.
9. Re-run tests after every subsystem.
10. Only then build a new APK.
11. Provide a changelog plus remaining known inaccuracies.

Do not optimize merely to make the tests green. Tests must express the physical/state invariants above.

# First task to perform
Before editing anything, report:
- repository architecture
- where canonical game state is stored
- how dyno results are generated and persisted
- how turbo performance is currently calculated
- how race audio lifecycle works
- which files/functions need changes for the requested dyno/turbo/ALS work
- any contradictions/technical debt you find

Then implement the work in small commits, starting with the dyno-abort correctness bug.
