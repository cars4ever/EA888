import argparse, csv, json, random, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRIORITY_KEYS = ("named_cars", "make_model", "power")


def fmt_time(ms):
    s = int(ms) // 1000
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def json3_to_lines(path, chunk_chars=350):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    lines, buf, start = [], [], None
    for ev in d.get("events", []):
        text = "".join(s.get("utf8", "") for s in ev.get("segs") or []).replace("\n", " ").strip()
        if not text:
            continue
        if start is None:
            start = ev.get("tStartMs", 0)
        buf.append(text)
        if sum(len(b) for b in buf) > chunk_chars:
            lines.append(f"[{fmt_time(start)}] " + " ".join(buf))
            buf, start = [], None
    if buf:
        lines.append(f"[{fmt_time(start)}] " + " ".join(buf))
    return lines


def load_queue(catalog, extract_dir):
    done = {p.stem for p in Path(extract_dir).glob("*.json")}
    rows = [r for r in csv.DictReader(open(catalog, encoding="utf-8")) if r["id"] not in done]
    rows.sort(key=lambda r: (not any(r.get(k) for k in PRIORITY_KEYS), int(r["chrono_rank"])))
    return rows, len(done)


def read_manifest(path):
    status = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                status[rec["id"]] = rec
    return status


def main():
    ap = argparse.ArgumentParser(description="Download YouTube captions for a catalogued channel, locally, resumable.")
    ap.add_argument("--channel", default="cleetusm", help="folder name under research/youtube/")
    ap.add_argument("--out", default=str(Path.home() / "ea888-transcripts"), help="output root (keep it outside the git repo)")
    ap.add_argument("--limit", type=int, default=0, help="stop after N videos this run (0 = all)")
    ap.add_argument("--min-sleep", type=float, default=4.0)
    ap.add_argument("--max-sleep", type=float, default=9.0)
    ap.add_argument("--dry-run", action="store_true", help="only show what would be downloaded")
    args = ap.parse_args()

    chan_dir = HERE / args.channel
    queue, n_done = load_queue(chan_dir / "catalog.csv", chan_dir / "extract")
    out = Path(args.out) / args.channel
    raw_dir, tx_dir = out / "raw", out / "tx"
    manifest_path = out / "manifest.jsonl"
    status = read_manifest(manifest_path)
    todo = [r for r in queue if status.get(r["id"], {}).get("status") not in ("ok", "no_subs")]

    print(f"already extracted: {n_done}  in catalog to fetch: {len(queue)}  remaining this run: {len(todo)}")
    print(f"output: {out}")
    if args.dry_run:
        for r in todo[:15]:
            print(f"  {r['chrono_rank']:>5} {r['id']}  {r['title'][:80]}")
        return

    try:
        from yt_dlp import YoutubeDL
    except ImportError:
        sys.exit('yt-dlp is not installed. Run:  python -m pip install -U "yt-dlp[default]"')

    raw_dir.mkdir(parents=True, exist_ok=True)
    tx_dir.mkdir(parents=True, exist_ok=True)
    opts = {
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en"],
        "subtitlesformat": "json3",
        "outtmpl": {"default": str(raw_dir / "%(id)s.%(ext)s")},
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "extractor_retries": 2,
        "sleep_interval_requests": 1,
    }

    fetched = 0
    with YoutubeDL(opts) as ydl, open(manifest_path, "a", encoding="utf-8") as mf:
        for i, r in enumerate(todo, 1):
            if args.limit and fetched >= args.limit:
                break
            vid = r["id"]
            rec = {"id": vid, "title": r["title"], "chrono_rank": int(r["chrono_rank"])}
            try:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=True)
                sub = raw_dir / f"{vid}.en.json3"
                if not sub.exists():
                    rec["status"] = "no_subs"
                else:
                    lines = json3_to_lines(sub)
                    (tx_dir / f"{vid}.ts.txt").write_text("\n".join(lines), encoding="utf-8")
                    rec.update(status="ok", kind="manual" if "en" in (info.get("subtitles") or {}) else "auto",
                               lines=len(lines), duration_s=info.get("duration"))
            except Exception as e:
                msg = str(e)
                rec.update(status="error", error=msg[:300])
                mf.write(json.dumps(rec) + "\n")
                mf.flush()
                if "confirm you" in msg.lower() or "429" in msg:
                    print(f"\nYouTube is rate-limiting or asking for a bot check ({vid}). Stopping to protect your IP.")
                    print("Wait a few hours and run the same command again; it resumes where it stopped.")
                    break
                print(f"[{i}/{len(todo)}] {vid} error: {msg[:120]}")
                continue
            mf.write(json.dumps(rec) + "\n")
            mf.flush()
            fetched += 1
            print(f"[{i}/{len(todo)}] {vid} {rec['status']} {rec.get('lines', '')}  {r['title'][:60]}")
            time.sleep(random.uniform(args.min_sleep, args.max_sleep))

    final = read_manifest(manifest_path)
    counts = {}
    for rec in final.values():
        counts[rec["status"]] = counts.get(rec["status"], 0) + 1
    print(f"\nmanifest totals: {counts}")
    print(f"transcripts: {tx_dir}")


if __name__ == "__main__":
    main()
