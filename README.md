# EA888 Lab

Android tuning/drag-racing game/simulator built around a virtual VW EA888 Gen 1 / CAWB and a blue VW Scirocco.

## Current baseline

The canonical baseline is **EA888 Lab v1.2.0**.

Core loop:

**build engine → assemble → bench-test → tune → dyno → diagnose → drag race → service/rebuild → improve build**

Current systems include engine parts/tuning, dyno simulation, wear/damage, service, realtime drag racing, burnout/staging/tree, manual/DSG transmission behavior, telemetry, and Scirocco-specific visuals.

## Development

Claude Code should read `CLAUDE.md` before making changes.

Baseline test commands:

```bash
node tests/test_sim.js

python3 tools/browser_smoke.py \
  --assets src/assets \
  --screenshots /tmp/ea888-shots \
  --report /tmp/ea888-browser-report.json

python3 tools/build_apk.py --output /tmp/EA888-Lab.apk
```

## Android identity

- App label: `EA888 LAB`
- Package: `nl.randy.ea888lab.stabl`
- Baseline version: `1.2.0-debug`
- Baseline version code: `120`

## Accuracy boundary

This is an engineering-inspired game/simulator, not certified ECU, engine-design, or vehicle-dynamics software. Real hardware and tuning decisions must be validated with proper measurements, logs, and professional inspection.
