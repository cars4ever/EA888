import csv, json, re, sys
from pathlib import Path

cars_json, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
cars = json.load(open(cars_json))["cars"]

PASS_KEYS = {"et", "eighth_et", "sixty_ft", "et_quarter", "quarter_et", "et_1_8", "et_eighth"}
DYNO_KEYS = {"hp", "whp", "torque_lbft", "torque", "wtq", "crank_hp", "peak_hp", "peak_whp"}


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.search(r"-?\d+(?:,\d{3})*(?:\.\d+)?", v)
        if m:
            return float(m.group(0).replace(",", ""))
    return None


def walk(o, path=()):
    if isinstance(o, dict):
        yield path, o
        for k, v in o.items():
            yield from walk(v, path + (k,))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk(v, path + (str(i),))


def pick(d, *names):
    for n in names:
        if n in d and d[n] not in (None, ""):
            return d[n]
    return None


passes, dynos, weights, prices = [], [], [], []
for car in cars:
    cid = car["car_id"]
    for src in car["sources"]:
        base = {"car_id": cid, "source_car_id": src["source_car_id"], "video_id": src["video_id"], "chrono_rank": src["chrono_rank"]}
        for path, d in walk(src["data"]):
            keys = set(d)
            where = "/".join(path)
            if keys & PASS_KEYS and "dyno" not in where.lower():
                et = num(pick(d, "et", "et_quarter", "quarter_et"))
                e8 = num(pick(d, "eighth_et", "et_1_8", "et_eighth"))
                if et is None and e8 is None and num(d.get("sixty_ft")) is None:
                    continue
                passes.append({**base, "path": where, "et": et, "mph": num(pick(d, "mph", "quarter_mph")),
                               "sixty_ft": num(pick(d, "sixty_ft", "60ft", "sixty")), "three_thirty_ft": num(pick(d, "three_thirty_ft", "330ft")),
                               "eighth_et": e8, "eighth_mph": num(pick(d, "eighth_mph", "mph_1_8", "mph_eighth")),
                               "distance": pick(d, "distance", "length"), "track": pick(d, "track", "event"),
                               "conditions": pick(d, "conditions"), "kind": pick(d, "kind", "measured"), "t": pick(d, "t")})
            if keys & DYNO_KEYS and ("dyno" in where.lower() or "boost_psi" in keys or "pull" in where.lower()):
                dynos.append({**base, "path": where, "hp": num(pick(d, "hp", "crank_hp", "peak_hp")), "whp": num(pick(d, "whp", "peak_whp")),
                              "torque_lbft": num(pick(d, "torque_lbft", "torque", "wtq")), "boost_psi": num(pick(d, "boost_psi", "boost")),
                              "fuel": pick(d, "fuel"), "dyno_type": pick(d, "dyno_type", "type"), "kind": pick(d, "kind", "measured"),
                              "notes": str(pick(d, "notes", "note") or "")[:160], "t": pick(d, "t")})
            price = num(d.get("price_usd"))
            if price is not None and price > 0:
                label = pick(d, "part", "item", "desc", "name") or (path[-2] if len(path) > 1 else where)
                prices.append({**base, "path": where, "item": str(label)[:140], "price_usd": price,
                               "asking_usd": num(d.get("asking_usd")), "note": str(pick(d, "note", "notes") or "")[:140], "t": d.get("t")})
            for k, v in d.items():
                if "weight" in k.lower() and not isinstance(v, (dict, list)):
                    w = num(v)
                    if w and 500 <= w <= 9000:
                        weights.append({**base, "path": f"{where}/{k}", "weight_lb": w, "raw": str(v)[:160], "t": d.get("t")})
                elif "weight" in k.lower() and isinstance(v, dict):
                    for kk, vv in v.items():
                        w = num(vv)
                        if kk != "t" and w and 500 <= w <= 9000:
                            weights.append({**base, "path": f"{where}/{k}/{kk}", "weight_lb": w, "raw": str(vv)[:160], "t": v.get("t")})

out_dir.mkdir(parents=True, exist_ok=True)
for name, rows in (("passes", passes), ("dyno", dynos), ("weights", weights), ("prices", prices)):
    if not rows:
        continue
    with open(out_dir / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        for r in sorted(rows, key=lambda r: (r["car_id"], r["chrono_rank"] or 0)):
            w.writerow(r)
    print(f"{name}: {len(rows)} rows")
