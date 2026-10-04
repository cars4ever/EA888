# YouTube research pipeline

Builds a car/parts database for the drag sim from YouTube channels.

| Step | Where | Script |
|---|---|---|
| 1. List all videos of a channel | anywhere | `fetch_channel.sh @Handle out/` |
| 2. Categorize titles | anywhere | `categorize.py all.jsonl` → `catalog.csv` |
| 3. Download captions | **your own PC** | `fetch_subs_local.py` |
| 4. Extract builds/prices per video | Claude session | → `<channel>/extract/<id>.json` |
| 5. Merge per car | anywhere | `merge_extracts.py` → `<channel>/cars.json` |

Transcripts are copyrighted: they stay outside this repo. Only the paraphrased,
timestamped facts in `extract/` and `cars.json` are committed.

## Step 3 on Windows

YouTube blocks caption downloads from cloud servers, so this step runs at home.

1. Install Python 3.10+ from python.org (tick "Add python.exe to PATH").
2. Open PowerShell in the repo folder and run:

   ```powershell
   python -m pip install -U "yt-dlp[default]"
   python research\youtube\fetch_subs_local.py --dry-run
   python research\youtube\fetch_subs_local.py --limit 20
   ```

   If those 20 succeed, start the full run:

   ```powershell
   python research\youtube\fetch_subs_local.py
   ```

- Output goes to `%USERPROFILE%\ea888-transcripts\cleetusm\tx\<id>.ts.txt`, outside the repo.
- Car videos (named car / make / power adder in the title) go first; ~1,800 videos take roughly 3–5 hours with the default 4–9 s pause.
- It is resumable: stop with Ctrl+C or let it stop on a YouTube rate limit, then run the same command later.
- If almost every video reports `error` about a JavaScript runtime, install Deno (https://deno.com) and retry.

## Getting the transcripts to a Claude cloud session

Cloud credits only apply to cloud sessions, so the files must reach GitHub:

1. Create a **private** repo, e.g. `ea888-transcripts` (not this repo).
2. Copy the `ea888-transcripts` folder into it, commit and push.
3. In a cloud session, ask Claude to attach that repo and run step 4 on it.
