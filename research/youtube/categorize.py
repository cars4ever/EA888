import json, re, collections, csv, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "videos.jsonl"

def rx(*words):
    return re.compile(r"\b(?:" + "|".join(words) + r")\b", re.I)

SERIES = {
    "cheap_racecar_challenge": rx(r"cheap racecar challenge", r"cheap race ?car", r"cheap car challenge"),
    "fl2k": rx(r"fl2k\d*"),
    "freedom_factory": rx(r"freedom factory", r"freedom factory's"),
    "cleetus_and_cars": rx(r"cleetus (?:&|and) cars"),
    "burnout_event": rx(r"burnout (?:contest|competition|pad)", r"burnout"),
    "nascar_oval": rx(r"nascar", r"cup car", r"late model", r"daytona", r"oval", r"dale"),
    "auction": rx(r"auction", r"copart", r"iaa"),
    "neighbor": rx(r"neighbor"),
    "abandoned": rx(r"abandoned"),
    "texas_or_events": rx(r"texas", r"world cup finals", r"no prep", r"drag week", r"hot rod drag week", r"lights out", r"street car takeover", r"sct"),
}

NAMED_CARS = {
    "leroy": rx(r"leroy'?s?"),
    "mullet": rx(r"mullet'?s?", r"mini mullet"),
    "ruby": rx(r"ruby'?s?"),
    "eagle": rx(r"bald eagle", r"eagles?'?s?"),
    "godzilla": rx(r"godzilla"),
    "mcflurry": rx(r"mc ?flurry"),
    "toast": rx(r"toast"),
    "lumberjack": rx(r"lumberjack'?s?"),
    "galaxie": rx(r"galaxie"),
    "marauder": rx(r"marauder"),
    "blazer": rx(r"blazer"),
    "ripper": rx(r"ripper"),
    "jet_car_or_boat": rx(r"jet"),
    "jackstand_240": rx(r"jackstand'?s?"),
    "precious": rx(r"precious"),
    "gatorade": rx(r"gatorade"),
    "crown_vic": rx(r"crown vic(?:toria)?", r"cop car"),
}

MAKE_MODEL = {
    "corvette": rx(r"corvettes?'?s?", r"vette", r"zr1", r"z06", r"c[5-8](?: corvette)?"),
    "camaro": rx(r"camaros?", r"zl1"),
    "mustang": rx(r"mustangs?", r"gt500", r"shelby", r"fox ?body", r"coyote"),
    "supra": rx(r"supras?", r"2jz"),
    "f150_or_ford_truck": rx(r"f-?150", r"raptor", r"f-?250", r"lightning"),
    "chevy_truck": rx(r"silverado", r"s-?10", r"c10", r"trailblazer ss", r"ssr"),
    "mopar": rx(r"hellcat", r"demon", r"charger", r"challenger", r"trackhawk", r"hemi", r"viper"),
    "nissan": rx(r"240 ?sx", r"240", r"350z", r"370z", r"gt-?r", r"skyline"),
    "honda_or_acura": rx(r"civic", r"integra", r"s2000", r"nsx"),
    "porsche": rx(r"porsche", r"911", r"gt3", r"gt2"),
    "exotic": rx(r"lambo(?:rghini)?", r"ferrari", r"mclaren", r"bugatti", r"koenigsegg"),
    "ev": rx(r"tesla", r"\bev\b", r"electric", r"plaid", r"lucid", r"rivian"),
    "bmw_audi_vw": rx(r"bmw", r"m3", r"m5", r"audi", r"rs ?\d", r"vw", r"volkswagen", r"golf", r"gti", r"scirocco"),
    "toyota_other": rx(r"camry", r"tundra", r"prius", r"corolla", r"gr86", r"miata", r"mazda", r"rx-?7"),
    "cadillac": rx(r"blackwing", r"cts-?v", r"escalade"),
    "semi_truck": rx(r"semi(?: truck)?"),
    "minivan_or_odd": rx(r"minivan", r"hearse", r"limo", r"school bus", r"bus"),
}

VEHICLE_TYPE = {
    "boat": rx(r"boats?", r"jet ski", r"pontoon"),
    "aircraft": rx(r"helicopter", r"plane", r"airport", r"jet engine"),
    "offroad_utv": rx(r"sand car", r"polaris", r"rzr", r"can-?am", r"utv", r"atv", r"dune", r"mud", r"trophy truck"),
    "rc": rx(r"rc", r"remote control"),
    "motorcycle": rx(r"motorcycle", r"bike", r"hayabusa", r"dirt bike"),
}

POWER = {
    "turbo": rx(r"turbo(?:s|charged)?", r"twin turbo", r"single turbo", r"boost"),
    "supercharged": rx(r"supercharg(?:ed|er|ing)", r"blower", r"blown", r"whipple", r"procharger"),
    "nitrous": rx(r"nitrous", r"nos", r"spray"),
    "big_block": rx(r"big block", r"bbc"),
    "ls": rx(r"ls ?swap(?:ped)?", r"\bls[1-9x]?\b", r"lt[1-5]", r"billet ls"),
    "diesel": rx(r"diesel", r"cummins", r"duramax", r"powerstroke"),
    "engine_swap": rx(r"swap(?:ped)?"),
}

ACTIVITY = {
    "dyno": rx(r"dyno'?d?"),
    "drag_pass": rx(r"drag", r"pass(?:es)?", r"1/4", r"1/8", r"quarter mile", r"eighth mile", r"1320", r"\d'?s", r"second pass", r"record", r"wheelie", r"launch", r"strip", r"et"),
    "build": rx(r"build(?:ing)?", r"built", r"install(?:ed|ing)?", r"swap(?:ped)?", r"upgrades?", r"fix(?:ed|ing)?", r"rebuild", r"project", r"renovat\w*", r"prep"),
    "first_fire": rx(r"first fire", r"fire ?up", r"first start", r"it runs", r"alive"),
    "failure_or_crash": rx(r"blew", r"blown up", r"broke", r"destroyed", r"crash(?:ed)?", r"wreck(?:ed)?", r"damage", r"problems?", r"disaster", r"hurt", r"rip"),
    "purchase": rx(r"bought", r"buy(?:ing)?", r"auction", r"found", r"deal"),
    "burnout": rx(r"burnouts?"),
    "drift": rx(r"drift(?:ing)?"),
    "race_vs": rx(r"vs\.?", r"race", r"racing", r"battle", r"grudge", r"heads ?up"),
}

HP_RX = re.compile(r"(\d{1,2}(?:,\d{3})|\d{3,4})\s*(?:\+\s*)?(?:hp|horsepower|whp)", re.I)
ET_RX = re.compile(r"\b(\d(?:\.\d{1,3})?)\s*(?:'s|s)\b|\b(\d\.\d{2,3})\b", re.I)
MPH_RX = re.compile(r"(\d{2,3})\s*mph", re.I)

def tag(group, title):
    return [k for k, r in group.items() if r.search(title)]

def main():
    rows = [json.loads(l) for l in open(SRC)]
    n = len(rows)
    out = []
    for i, r in enumerate(rows):
        t = r["title"]
        hp = [int(m.replace(",", "")) for m in HP_RX.findall(t)]
        hp = [h for h in hp if 100 <= h <= 12000]
        et = []
        for a, b in ET_RX.findall(t):
            v = a or b
            try:
                f = float(v)
            except ValueError:
                continue
            if 3.0 <= f <= 15.0:
                et.append(f)
        out.append({
            "idx_newest_first": i + 1,
            "chrono_rank": n - i,
            "id": r["id"],
            "title": t,
            "duration_s": r.get("duration"),
            "views": r.get("view_count"),
            "series": tag(SERIES, t),
            "named_cars": tag(NAMED_CARS, t),
            "make_model": tag(MAKE_MODEL, t),
            "vehicle_type": tag(VEHICLE_TYPE, t),
            "power": tag(POWER, t),
            "activity": tag(ACTIVITY, t),
            "hp_in_title": hp,
            "et_hint_in_title": et,
            "mph_in_title": [int(m) for m in MPH_RX.findall(t)],
        })
    return out

if __name__ == "__main__":
    data = main()
    with open("catalog.json", "w") as f:
        json.dump(data, f, indent=1)
    with open("catalog.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["chrono_rank", "id", "title", "duration_s", "views", "series", "named_cars", "make_model", "vehicle_type", "power", "activity", "hp_in_title", "et_hint_in_title", "mph_in_title"])
        for d in data:
            w.writerow([d["chrono_rank"], d["id"], d["title"], d["duration_s"], d["views"]] + ["|".join(map(str, d[k])) for k in ["series", "named_cars", "make_model", "vehicle_type", "power", "activity", "hp_in_title", "et_hint_in_title", "mph_in_title"]])

    def count(key):
        c = collections.Counter()
        for d in data:
            for v in d[key]:
                c[v] += 1
        return c

    print(f"videos: {len(data)}")
    for key in ["series", "named_cars", "make_model", "vehicle_type", "power", "activity"]:
        c = count(key)
        print(f"\n== {key} ==")
        print("  ".join(f"{k}:{v}" for k, v in c.most_common()))
    untagged = [d for d in data if not (d["named_cars"] or d["make_model"] or d["vehicle_type"] or d["series"])]
    print(f"\nno car/series/vehicle tag: {len(untagged)}")
    hp = [d for d in data if d["hp_in_title"]]
    print(f"titles with hp figure: {len(hp)}")
