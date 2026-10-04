import csv, json, sys
from pathlib import Path

roster_path, out_csv = Path(sys.argv[1]), Path(sys.argv[2])
cars = json.load(open(roster_path))["cars"]


def hale_et(weight, hp):
    return 5.825 * (weight / hp) ** (1 / 3)


def hale_mph(weight, hp):
    return 234 * (hp / weight) ** (1 / 3)


def val(o):
    return o.get("value") if isinstance(o, dict) else None


rows = []
for car in cars:
    builds = car.get("builds") or [car]
    for b in builds:
        p = b.get("best_pass") or {}
        power = val(b.get("power")) or val(car.get("power"))
        weight = val(b.get("weight_lb")) or val(car.get("weight_lb"))
        et, mph = p.get("et"), p.get("mph")
        if not (et and mph) and not (power and weight):
            continue
        row = {"car": car["id"], "build": b.get("version", ""), "weight_lb": weight, "power_hp": power,
               "et": et, "mph": mph, "sixty_ft": p.get("sixty_ft"), "note": b.get("power_vs_pass", "")}
        if mph:
            row["implied_hp_per_lb"] = round((mph / 234) ** 3, 4)
            row["implied_lb_per_hp"] = round(1 / row["implied_hp_per_lb"], 2)
        if power and mph and not row["note"]:
            row["implied_weight_lb"] = round(power / row["implied_hp_per_lb"])
        if weight and mph:
            row["implied_hp"] = round(weight * row["implied_hp_per_lb"])
        if power and weight:
            row["hale_et"] = round(hale_et(weight, power), 2)
            row["hale_mph"] = round(hale_mph(weight, power), 1)
            if et:
                row["et_error_s"] = round(et - row["hale_et"], 2)
        rows.append(row)

fields = ["car", "build", "weight_lb", "power_hp", "et", "mph", "sixty_ft", "implied_hp_per_lb", "implied_lb_per_hp",
          "implied_weight_lb", "implied_hp", "hale_et", "hale_mph", "et_error_s", "note"]
with open(out_csv, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
for r in rows:
    print(" | ".join(f"{k}={r[k]}" for k in fields if r.get(k) not in (None, "")))
