# EA888 Lab

Android tuning/drag-racing game/simulator built around a virtual VW EA888 Gen 1 / CAWB and a blue VW Scirocco.

## Current baseline

The canonical baseline is **EA888 Lab v1.2.0**.

Core loop:

**build engine → assemble → bench-test → tune → dyno → diagnose → drag race → service/rebuild → improve build**

Current systems include engine parts/tuning, dyno simulation, wear/damage, service, realtime drag racing, burnout/staging/tree, manual/DSG transmission behavior, telemetry, and Scirocco-specific visuals.

## v1.4.0 (branch `claude-dev`) — phase 1: foundation

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
