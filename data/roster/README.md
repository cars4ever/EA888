# Roster: real cars from the YouTube research

Source: `research/youtube/cleetusm` on branch `claude/laughing-babbage-ls6v7d` of this repository
(commit in `cars.json` → `source`). The research files are never edited from here.

| File | Made by | What |
|---|---|---|
| `cars.json` | `tools/import_roster.py` | all cars, every value `{value, unit, kind, source: {video, t}, note}` |
| `calibration.json` | `tools/import_roster.py` | the run/weight/power pairs a calibration may use, and the excluded ones with the reason |
| `display-names.json` | you | the names the game shows; a re-import only adds new ids |
| `model-rules.json` | by hand | per-class rules for what the research does not say (aero, wheelbase, gearbox ratios, converter, curve shape, launch); each with its reason |
| `parts-catalog.json` | `tools/import_roster.py` | the priced parts from `prices.csv`: condition, source, group, the game slot when it is the same part (else why not); totals, whole cars, repairs and quotes in `notInCatalog` |
| `currency.json` | you | the fixed game rate for showing euros next to the dollar prices |

`kind`: `measured` (timeslip, dyno sheet or scale in the video), `stated` (said, not shown), `estimate`
(the team's estimate), `modeled` (filled in by the game, with `reason` and `derivedFrom`).

```bash
python3 tools/import_roster.py --research <checkout>/research/youtube/cleetusm --commit <sha>
node tools/build_roster_data.js          # -> src/assets/roster-data.js (loaded by index.html, no fetch)
node tests/test_roster_data.js
node tools/roster_calibration.js [--before]   # real passes against the simulation (docs/CALIBRATION.md)
```
