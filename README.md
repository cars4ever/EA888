# EA888 Lab

Android tuning/drag-racing game/simulator built around a virtual VW EA888 Gen 1 / CAWB and a blue VW Scirocco.

## Current baseline

The canonical baseline is **EA888 Lab v1.2.0**.

Core loop:

**build engine → assemble → bench-test → tune → dyno → diagnose → drag race → service/rebuild → improve build**

Current systems include engine parts/tuning, dyno simulation, wear/damage, service, realtime drag racing, burnout/staging/tree, manual/DSG transmission behavior, telemetry, and Scirocco-specific visuals.

## v1.3.0 (branch `claude-dev`)

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

python3 tools/build_apk.py --output /tmp/EA888-Lab.apk
```

## Android identity

- App label: `EA888 LAB`
- Package: `nl.randy.ea888lab.stabl`
- Version: `1.3.0-debug` (code `130`); baseline was `1.2.0-debug` (code `120`)

## Accuracy boundary

This is an engineering-inspired game/simulator, not certified ECU, engine-design, or vehicle-dynamics software. Real hardware and tuning decisions must be validated with proper measurements, logs, and professional inspection.
