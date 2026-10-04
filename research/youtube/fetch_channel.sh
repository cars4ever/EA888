#!/usr/bin/env bash
set -euo pipefail
handle="$1"
out="${2:-.}"
mkdir -p "$out"
: > "$out/all.jsonl"
for tab in videos shorts streams; do
  yt-dlp --flat-playlist --dump-json --no-warnings "https://www.youtube.com/$handle/$tab" >> "$out/all.jsonl" || true
done
wc -l "$out/all.jsonl"
