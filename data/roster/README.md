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
| `workshop.json` | maintained with manufacturer references | editable builds for the five visual carIds; fitment, package parts, explicit modeled prices and missing mechanical dimensions; never replaces research facts |

`kind`: `measured` (timeslip, dyno sheet or scale in the video), `stated` (said, not shown), `estimate`
(the team's estimate), `modeled` (filled in by the game, with `reason` and `derivedFrom`).

As of 1.30, all five visual cars can be bought and modified. Eagle (€450,000), Mullet
(€200,000) and McFlurry (€95,000) use **game estimates**, since no researched sale price
exists. Lumberjack (€6,602) and Jackstand (€12,231) retain their existing researched
cost calculation. The normal €50,000 start budget is unchanged; the isolated QA profile
has €10 million. Model outputs from a player's new tune are not historical dyno measurements.

`workshop.json` adds 114 parts across the existing categories, filtered by LS, Coyote,
BBC or Hemi fitment and car-specific transmission packages. Shared compatible parts
reuse the existing catalogue. Block packages exclude the separately selectable crank.
Source URLs support construction/product families; package prices, head flow, cam curves,
durability and unknown dimensions remain labeled estimates. C16 fuel properties are
kept separate from the old generic race fuel. No external product/API fetch is required
by the APK. Regenerate the bundled data with `node tools/build_roster_data.js`,
`node tools/build_engine_data.js` and `node tools/build_turbo_data.js` after editing their inputs.

```bash
python3 tools/import_roster.py --research <checkout>/research/youtube/cleetusm --commit <sha>
node tools/build_roster_data.js          # -> src/assets/roster-data.js (loaded by index.html, no fetch)
node tests/test_roster_data.js
node tools/roster_calibration.js [--before]   # real passes against the simulation (docs/CALIBRATION.md)
```
