import csv, json, glob, os, sys, collections

extract_dir, catalog_csv, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

ALIASES = {
    "mcflurry_godzilla_mustang": "mcflurry",
    "crc3_s10": "crc3_gen1_s10",
    "ty_coyote_ranger": "tye_ranger",
    "crc1_el_camino": "lumberjack",
    "crc1_lumberjack": "lumberjack",
    "crc2_lumberjack": "lumberjack",
    "crc1_240sx_coupe": "crc12_jackstand_240",
    "crc1_jackstand_240": "crc12_jackstand_240",
    "crc2_jackstand_240": "crc12_jackstand_240",
    "crc1_mustang": "crc12_tye_mustang",
    "crc1_tye_mustang": "crc12_tye_mustang",
    "crc2_tye_mustang": "crc12_tye_mustang",
    "crc1_tom_bailey_camaro": "crc12_tom_bailey_camaro",
    "crc2_tom_bailey_camaro": "crc12_tom_bailey_camaro",
}

catalog = {r["id"]: r for r in csv.DictReader(open(catalog_csv))}
cars = collections.defaultdict(lambda: {"car_id": None, "sources": []})
videos = []
problems = []

for path in sorted(glob.glob(os.path.join(extract_dir, "*.json"))):
    try:
        doc = json.load(open(path))
    except json.JSONDecodeError as e:
        problems.append(f"{os.path.basename(path)}: invalid JSON ({e})")
        continue
    vid = doc.get("video_id") or os.path.splitext(os.path.basename(path))[0]
    meta = catalog.get(vid, {})
    rank = int(meta["chrono_rank"]) if meta.get("chrono_rank") else None
    videos.append({"video_id": vid, "title": doc.get("title") or meta.get("title"), "chrono_rank": rank,
                   "coverage": doc.get("coverage"), "n_cars": len(doc.get("cars") or [])})
    for car in doc.get("cars") or []:
        src_id = car.get("car_id")
        if not src_id:
            problems.append(f"{vid}: car without car_id")
            continue
        cid = ALIASES.get(src_id, src_id)
        entry = cars[cid]
        entry["car_id"] = cid
        entry["sources"].append({"video_id": vid, "source_car_id": src_id, "chrono_rank": rank, "title": doc.get("title") or meta.get("title"),
                                 "url": f"https://www.youtube.com/watch?v={vid}", "data": car})

for entry in cars.values():
    entry["sources"].sort(key=lambda s: (s["chrono_rank"] is None, s["chrono_rank"] or 0))
    entry["n_sources"] = len(entry["sources"])
    nicks = set()
    for s in entry["sources"]:
        n = s["data"].get("nickname")
        if isinstance(n, dict):
            n = n.get("value") or n.get("name") or json.dumps(n, sort_keys=True)
        if n:
            nicks.add(str(n))
    entry["nicknames"] = sorted(nicks)

out = {"videos": sorted(videos, key=lambda v: v["chrono_rank"] or 0),
       "cars": sorted(cars.values(), key=lambda c: -c["n_sources"]),
       "problems": problems}
json.dump(out, open(out_path, "w"), indent=1)
print(f"videos: {len(videos)}  cars: {len(cars)}  problems: {len(problems)}")
for c in out["cars"]:
    print(f"  {c['car_id']}: {c['n_sources']} source(s)")
for p in problems:
    print("  !", p)
