#!/usr/bin/env python3
"""Import the YouTube research roster into the game's data format.

    python3 tools/import_roster.py --research <dir>/research/youtube/cleetusm --commit <sha>

Reads roster.json and calibration/*.csv (read only) and writes data/roster/cars.json and
data/roster/calibration.json. data/roster/display-names.json is created for new ids only, so
names you edited survive a re-import. Run tools/build_roster_data.js afterwards.

Every value keeps where it came from: {value, unit, kind, source: {video, t}, note}. kind is the
research's measured / stated / estimate. A value the game needs but the research does not have is
filled only when the calibration data allow it, as kind "modeled" with the formula and its inputs;
everything else stays null.
"""
import argparse
import csv
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'roster'

# Neutral display names (no brand, model or person). The file is yours to edit.
DEFAULT_NAMES = {
    'eagle': 'Biturbo V8 buizenframe',
    'leroy': 'Biturbo V8 sportwagen',
    'mullet': 'Biturbo big-block ute',
    'mcflurry': 'Turbo-V8 coupé (jaren 80)',
    'ruby': 'Turbo-V8 coupé (rood)',
    'blazer': 'Turbo-V8 SUV',
    'toast': 'Compressor-V8 burnoutauto',
    'crown_vic_gt500': 'Compressor-V8 sedan',
    'marauder': 'Turbo-V8 sedan',
    'galaxie_cummins': 'Turbodiesel klassieker',
    'lumberjack': 'Turbo-V8 ute',
    'crc12_jackstand_240': 'Lachgas-V8 coupé',
    'crc12_tye_mustang': 'Budgetturbo-V8 coupé',
    'crc12_tom_bailey_camaro': 'Lachgas big-block coupé',
    'crc3_gen1_s10': 'Biturbo-V8 pick-up',
    'crc3_95_mustang': 'Turbo-V8 coupé (jaren 90)',
    'crc3_240sx_hatch': 'Lachgas-V8 hatchback',
    'tye_ranger': 'Turbo-V8 pick-up',
    'giveaway_zr1_sep': 'Compressor-V8 sportwagen',
    'cleetus_c8_zr1': 'Middenmotor V8 sportwagen',
}

# Facts the sim needs that roster.json dropped but the per-video extracts have (extract/<video>.json),
# copied by hand with their timestamps. kind is what the extract says it is.
F = lambda value, unit, kind, video, t, note=None: val(value, unit, kind, video, t, note)
FACTS = {
    'crc12_jackstand_240': {
        'transmission': lambda: F('powerglide', None, 'stated', 'PSGvE8jkSoc', '33:39, 41:38', 'Powerglide, rebuild kit only, no upgrades'),
        'frontWeightPct': lambda: F(54, '%', 'measured', '-dDkkIHyQRM', '14:42-15:15', 'scales, with driver'),
        'naPowerHp': lambda: F(520, 'hp', 'measured', '-dDkkIHyQRM', '11:05-11:36', 'chassis dyno without nitrous; flat power from 6,000 rpm up'),
        'naTorqueLbft': lambda: F(433, 'lbft', 'measured', '-dDkkIHyQRM', '11:05-11:36'),
        'revLimitRpm': lambda: F(7500, 'rpm', 'measured', '-dDkkIHyQRM', '11:05-11:36', 'pull from 3,500 to ~7,500 rpm where it hit the limiter'),
        'nitrousShotHp': lambda: F(266, 'hp', 'measured', '-dDkkIHyQRM', '11:36-13:30',
                                   'dyno gain 520 -> 786 hp; the jet is a ~225 hp shot ("two and a quarter", the lightest, used all week); the pull ended at ~6,500 rpm still climbing'),
        'nitrousRetardDeg': lambda: F(6, 'deg', 'stated', '-dDkkIHyQRM', '12:24-14:00', 'timing pulled for the shot'),
        'driverLiftFt': lambda: F(1000, 'ft', 'stated', 'mls_oZ9EQQg', '10:00-11:16, 13:57', 'lifted around 1,000 ft; driver estimated ~5.40 eighth'),
    },
    'crc3_240sx_hatch': {
        'transmission': lambda: F('powerglide', None, 'stated', 'JguV0Y7ZbD0', None, 'Powerglide with trans brake ($700, stock case and planetary)'),
        'tires': lambda: F('drag_radial', None, 'stated', 'PTORqnT_zT4', '38:50-39:09', 'brand new Mickey Thompson radials'),
        'weightWithoutDriverLb': lambda: F(2273, 'lb', 'measured', 'PTORqnT_zT4', '56:43-57:38', 'no driver, springs not yet cut'),
    },
    'giveaway_zr1_sep': {
        'transmission': lambda: F('oem_auto', None, 'stated', 'w4q6pp2mesc', '6:19-6:47, 15:07-15:26',
                                  "automatic with paddle/manual mode; 'seven gears' mentioned"),
        'launchGear': lambda: F(1, None, 'measured', 'w4q6pp2mesc', '31:00-35:05', 'best run launched in 1st gear (run 1 left in 2nd)'),
        'tractionControl': lambda: F(True, None, 'stated', 'w4q6pp2mesc', '31:00-35:05', 'launch with "+1 deg timing in launch": a launch-control tune on the factory ECU'),
        'ambientC': lambda: F(29.7, 'C', 'stated', 'w4q6pp2mesc', '31:00-35:05', '~85-86 F after a 30 min cool-down, iced blower'),
        'peakTorqueLbft': lambda: F(961, 'lbft', 'measured', 'w4q6pp2mesc', '7:39-9:54', 'driver lifted early on this pull; ~1,000 hp said possible'),
    },
    'eagle': {
        'transmission': lambda: F('th400', None, 'stated', 'XgXpvu6Q52Y', '11:58, 13:54', 'lock-up Turbo 400 (planned at the build start, medium confidence)'),
        'tires': lambda: F('pro_radial', None, 'stated', 'wkQiI5gN6Hs', '0:48-1:18', "Mickey Thompson radials; '275' said at the build start (low confidence)"),
    },
    'mullet': {
        'tires': lambda: F('pro_radial', None, 'stated', '6_quJlgCSC0', '2:12, 2:56', 'on radials until the 2026 switch to big tires'),
        'worldCupWeightLb': lambda: F(3330, 'lb', 'measured', 'm-X8-o0myuw', '3:35-3:55', 'World Cup trim before the ~400 lb diet; with or without driver not said'),
        'launchBoostPsi': lambda: F(38, 'psi', 'stated', 'wkQiI5gN6Hs', '6:12', "~38 psi launch boost level discussed for a 1.10 60 ft (caption '38 lb'; low confidence)"),
        'tractionControl': lambda: F(True, None, 'stated', 'wkQiI5gN6Hs', '6:12, 21:32', 'the tuner sets the launch boost for the 60 ft (boost-managed launch)'),
    },
    'mcflurry': {
        'transmission': lambda: F('lenco', None, 'stated', 'jBug09pPpv4', '4:10, 5:36', 'Lenco with a PTC converter matched to the Coyote'),
        'converterFlashRpm': lambda: F(8080, 'rpm', 'stated', 'wkQiI5gN6Hs', '36:58-37:35', 'the Florida best pass flashed the converter to 8,080 rpm'),
        'tractionControl': lambda: F(True, None, 'stated', 'wkQiI5gN6Hs', '3:01', 'Haltech traction control in use ("engaging early")'),
        'shiftRpm': lambda: F(8100, 'rpm', 'stated', 'wkQiI5gN6Hs', '36:58-37:35', '1-2 shift set at 8,100 rpm in the Haltech'),
        'launchBoostPsi': lambda: F(18.8, 'psi', 'stated', 'PgdQ91n0Bmw', '53:45-54:08', 'best pass: 18.8 psi at the launch, 36-37 psi peak, 33 at the trap'),
    },
    'lumberjack': {
        'trapRpm': lambda: F(7100, 'rpm', 'stated', '5ibvcauFris', '32:33-36:58', '7,100 rpm through the traps on the best pass'),
    },
}

# Calibration pairs the extracts rule out, with the same reasoning the Hale check uses for its notes.
EXCLUDE = {
    'mullet': ('the World Cup pass "stopped accelerating late" (thumb on the transbrake button pulled timing); '
               'the trap speed understates the power, and the power would have to come from that trap speed',
               'wkQiI5gN6Hs', '25:54, 32:37-33:56'),
    'mcflurry': ('dyno 1,394 whp at 31 psi; the 7.12 pass ran 36-37 psi peak and 33 psi at the trap: different boost',
                 'PgdQ91n0Bmw', '53:45-54:08, 48:40'),
    'lumberjack': ('dyno 900 hp at 26 psi; for the 9.30 pass the boost was raised +5 (29.4 psi peak): different boost',
                   '5ibvcauFris', '32:33-36:58'),
}

HALE_ET = 5.825   # ET  = 5.825 (lb / hp)^(1/3)   Roger Hale's quarter-mile rules
HALE_MPH = 234.0  # MPH = 234   (hp / lb)^(1/3)


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    v = str(v).strip()
    if v == '':
        return None
    try:
        return float(v)
    except ValueError:
        return None


def read_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def norm_kind(k):
    """The research marks a timeslip read on video as measured=True; keep the four kinds only."""
    k = str(k or '').strip().lower()
    if k in ('true', 'measured') or k.startswith('measured'):
        return 'measured'
    if k.startswith('stated') or k.startswith('claimed'):
        return 'stated'
    if k.startswith('estimate'):
        return 'estimate'
    if k.startswith('recalled'):
        return 'stated'
    return k or None


class Lookup:
    """Timestamps live in the calibration CSVs; roster.json only names the video."""

    def __init__(self, cal):
        self.passes = read_csv(cal / 'passes.csv')
        self.dyno = read_csv(cal / 'dyno.csv')
        self.weights = read_csv(cal / 'weights.csv')

    def t(self, table, car, video, field, value):
        rows = getattr(self, table)
        for r in rows:
            if r['car_id'] == car and r['video_id'] == video and num(r.get(field)) is not None and value is not None \
                    and abs(num(r[field]) - float(value)) < 1e-6:
                return r['t'] or None
        return None


def val(value, unit, kind, video=None, t=None, note=None, **extra):
    out = {'value': value, 'unit': unit, 'kind': kind if value is not None else None,
           'source': {'video': video, 't': t} if video and value is not None else None}
    if note:
        out['note'] = note
    out.update({k: v for k, v in extra.items() if v is not None})
    return out


def unknown(unit, note=None):
    return val(None, unit, None, note=note)


def roster_val(entry, unit, lk, car, table, field):
    """A roster value {value, kind, note, src} in the game's format."""
    if not isinstance(entry, dict) or entry.get('value') is None:
        return unknown(unit, (entry or {}).get('note') if isinstance(entry, dict) else None)
    video = entry.get('src')
    t = lk.t(table, car, video, field, entry['value']) if table else None
    return val(entry['value'], unit, norm_kind(entry.get('kind')) or 'stated', video, t, entry.get('note'))


def text(value, video):
    return {'text': value, 'source': {'video': video, 't': None} if video else None} if value else None


def power_basis(car_id, roster_car, dyno_rows):
    """wheel / crank / unknown, only from what the research says."""
    for b in roster_car.get('builds', []) or []:
        p = b.get('power') or {}
        if p.get('unit') == 'whp' and p.get('value') == (roster_car.get('power') or {}).get('value'):
            return 'wheel'
    note = ' '.join((r.get('dyno_type') or '') + ' ' + (r.get('notes') or '') for r in dyno_rows if r['car_id'] == car_id)
    if 'wheel vs crank not stated' in note:
        return 'unknown'
    return 'unknown'


# The pairs the calibration may use: the latest measured pass of a build together with weight and power
# of that same build. Built by hand from roster.json + hale_check.csv, because the roster mixes eras for
# one car (see 'mullet') and the Hale check flags dyno/pass pairs at different boost.
def calibration(roster, hale, lk, cal_dir):
    cars = {c['id']: c for c in roster['cars']}
    points, excluded = [], []
    for row in hale:
        cid = row['car']
        if row.get('note'):
            excluded.append({'carId': cid, 'build': row.get('build') or None, 'reason': row['note'],
                             'from': 'calibration/hale_check.csv note'})
            continue
        if num(row['et']) is None:
            excluded.append({'carId': cid, 'build': row.get('build') or None, 'reason': 'no quarter-mile pass for this build',
                             'from': 'calibration/hale_check.csv'})
            continue
        weight, power = num(row['weight_lb']), num(row['power_hp'])
        if weight is None and power is None:
            excluded.append({'carId': cid, 'build': row.get('build') or None,
                             'reason': 'neither weight nor power known: one pass cannot give both',
                             'from': 'calibration/hale_check.csv'})
            continue
        points.append((cid, row))

    out = []
    for cid, row in points:
        if cid in EXCLUDE:
            reason, video, t = EXCLUDE[cid]
            excluded.append({'carId': cid, 'build': row.get('build') or None, 'reason': reason,
                             'source': {'video': video, 't': t}, 'from': 'extract (not flagged in hale_check.csv)'})
            continue
        c = cars[cid]
        et, mph, sixty = num(row['et']), num(row['mph']), num(row['sixty_ft'])
        build = row.get('build') or None
        best = c.get('best_pass') or {}
        pass_src = best.get('src')
        if build:
            for b in c.get('builds', []) or []:
                if b.get('version') == build and b.get('best_pass'):
                    best = b['best_pass']
                    pass_src = best.get('src')
        p = {
            'et': val(et, 's', 'measured', pass_src, lk.t('passes', cid, pass_src, 'et', et)),
            'mph': val(mph, 'mph', 'measured', pass_src, lk.t('passes', cid, pass_src, 'mph', mph)),
            'sixtyFt': val(sixty, 's', 'measured', pass_src, lk.t('passes', cid, pass_src, 'sixty_ft', sixty)),
            'track': best.get('track'),
        }
        w = num(row['weight_lb'])
        hp = num(row['power_hp'])
        weight_v = power_v = None
        notes = []
        if cid == 'mullet':
            # roster.json pairs the World Cup pass (video #1731) with 2,762 lb measured for the 2026
            # tall-deck build without its nose (video #1871). The World Cup trim weighed 3,330 lb on the
            # scale (video #1743, 'before' the ~400 lb diet). Use the weight of the pass's own era.
            w = 3330.0
            weight_v = val(w, 'lb', 'measured', 'm-X8-o0myuw', '3:35-3:55',
                           'World Cup trim before the ~400 lb diet (scale read aloud); with or without driver not said')
            notes.append('roster.json pairs this pass with 2,762 lb from the 2026 build (video #1871); '
                         'the pass is from the heavier World Cup trim (3,330 lb, video #1743)')
        if weight_v is None and w is not None:
            rv = c.get('weight_lb') or {}
            weight_v = val(w, 'lb', norm_kind(rv.get('kind')) or 'stated', rv.get('src'),
                           lk.t('weights', cid, rv.get('src'), 'weight_lb', w), rv.get('note'))
        if hp is not None:
            src = None
            dyno_t = None
            for b in [c] + (c.get('builds') or []):
                pv = b.get('power') or {}
                if pv.get('value') == hp:
                    src = pv.get('src')
                    dyno_t = lk.t('dyno', cid, src, 'hp', hp) or lk.t('dyno', cid, src, 'whp', hp)
                    unit = 'whp' if pv.get('unit') == 'whp' else 'hp'
                    power_v = val(hp, unit, norm_kind(pv.get('kind')) or 'measured', src, dyno_t, pv.get('note'),
                                  basis='wheel' if unit == 'whp' else 'unknown',
                                  boostPsi=pv.get('boost_psi'))
                    break
        metrics = ['et', 'sixtyFt']
        if weight_v is None:
            # weight from trap speed and power (Hale): the trap is then an input, not a test
            lb = hp / math.pow(mph / HALE_MPH, 3)
            weight_v = val(round(lb), 'lb', 'modeled', None, None, None,
                           reason='not in the research; from the trap speed and the dyno power with Hale (MPH = 234 (hp/lb)^(1/3))',
                           derivedFrom={'mph': mph, 'hp': hp, 'file': 'calibration/hale_check.csv implied_weight_lb'})
            notes.append('weight derived from the trap speed: trap mph is not a test for this car')
        elif power_v is None:
            hp_m = w * math.pow(mph / HALE_MPH, 3)
            power_v = val(round(hp_m), 'hp', 'modeled', None, None, None, basis='crank',
                          reason='not in the research; from the trap speed and the weight with Hale (MPH = 234 (hp/lb)^(1/3))',
                          derivedFrom={'mph': mph, 'lb': w, 'file': 'calibration/hale_check.csv implied_hp'})
            notes.append('power derived from the trap speed: trap mph is not a test for this car')
        else:
            metrics.append('mph')
        independent = 'mph' in metrics
        out.append({'carId': cid, 'build': build, 'pass': p, 'weight': weight_v, 'power': power_v,
                    'metrics': metrics, 'independent': independent, 'notes': notes})
    return out, excluded


def pass_values(cid, pb, lk):
    src, kind = pb.get('src'), norm_kind(pb.get('kind'))
    out = {k: val(pb.get(rk), unit, kind, src, lk.t('passes', cid, src, rk, pb.get(rk)) if rk in ('et', 'mph', 'sixty_ft') else None)
           for k, rk, unit in (('et', 'et', 's'), ('mph', 'mph', 'mph'), ('sixtyFt', 'sixty_ft', 's'),
                               ('eighthEt', 'eighth_et', 's'), ('eighthMph', 'eighth_mph', 'mph'))}
    out['track'] = pb.get('track')
    if pb.get('note'):
        out['note'] = pb['note']
    return out


def build_entry(cid, b, lk):
    p = b.get('power') or None
    power = None
    if p and p.get('value') is not None:
        unit = 'whp' if p.get('unit') == 'whp' else 'hp'
        power = val(p['value'], unit, norm_kind(p.get('kind')) or 'stated', p.get('src'),
                    lk.t('dyno', cid, p.get('src'), 'whp' if unit == 'whp' else 'hp', p['value']) or lk.t('dyno', cid, p.get('src'), 'hp', p['value']),
                    None, basis='wheel' if unit == 'whp' else 'unknown', boostPsi=p.get('boost_psi'), fuel=p.get('fuel'))
    src = b.get('src')
    return {'version': b.get('version'), 'engine': b.get('engine'), 'powerAdder': b.get('power_adder'),
            'transmission': b.get('transmission'), 'fuel': b.get('fuel'), 'power': power,
            'bestPass': pass_values(cid, b['best_pass'], lk) if b.get('best_pass') else None,
            'note': b.get('power_vs_pass') or b.get('note'),
            'source': src if isinstance(src, list) else ([src] if src else [])}


def build_car(c, lk, dyno_rows):
    cid = c['id']
    weight = roster_val(c.get('weight_lb'), 'lb', lk, cid, 'weights', 'weight_lb')
    power = roster_val(c.get('power'), 'hp', lk, cid, 'dyno', 'hp')
    if power['value'] is not None:
        power['basis'] = power_basis(cid, c, dyno_rows)
    best = c.get('best_pass') or {}
    bp = None
    if best.get('et') is not None or best.get('sixty_ft') is not None:
        src = best.get('src')
        bp = {
            'et': val(best.get('et'), 's', norm_kind(best.get('kind')), src, lk.t('passes', cid, src, 'et', best.get('et'))),
            'mph': val(best.get('mph'), 'mph', norm_kind(best.get('kind')), src, lk.t('passes', cid, src, 'mph', best.get('mph'))),
            'sixtyFt': val(best.get('sixty_ft'), 's', norm_kind(best.get('kind')), src, lk.t('passes', cid, src, 'sixty_ft', best.get('sixty_ft'))),
            'eighthEt': val(best.get('eighth_et'), 's', norm_kind(best.get('kind')), src),
            'eighthMph': val(best.get('eighth_mph'), 'mph', norm_kind(best.get('kind')), src),
            'track': best.get('track'),
        }
    src = c.get('src') if isinstance(c.get('src'), str) else None
    car = {
        'id': cid,
        'sourceName': c.get('name'),
        'group': c.get('group'),
        'description': {k: text(c.get(rk), src) for k, rk in (
            ('base', 'base_vehicle'), ('engine', 'engine'), ('powerAdder', 'power_adder'), ('fuel', 'fuel'),
            ('ecu', 'ecu'), ('transmission', 'transmission'), ('converter', 'converter'), ('rearEnd', 'rear_end'),
            ('tires', 'tires'), ('suspension', 'suspension'))},
        'weightLb': weight,
        'powerHp': power,
        'bestPass': bp,
        'purchaseUsd': roster_val(c.get('purchase_usd'), 'USD', lk, cid, None, None) if c.get('purchase_usd') else None,
        'budgetSpentUsd': roster_val(c.get('budget_spent_usd'), 'USD', lk, cid, None, None) if c.get('budget_spent_usd') else None,
        'maintenance': [{'item': m.get('item'), 'priceUsd': m.get('price_usd'), 'confidence': m.get('confidence'),
                         'source': {'video': m.get('src'), 't': None}} for m in c.get('maintenance') or []],
        'failures': [{'part': f.get('part'), 'cause': f.get('cause'), 'source': {'video': f.get('src'), 't': None}}
                     for f in c.get('failures') or []],
        'builds': [build_entry(cid, b, lk) for b in c.get('builds') or []],
    }
    # extra stated numbers the sim can use (power with nitrous vs without, peak torque, boost)
    pnote = (c.get('power') or {}).get('note') or ''
    m = re.search(r'([\d,]+) hp without nitrous', pnote)
    if m and power['value'] is not None:
        base = float(m.group(1).replace(',', ''))
        car['powerWithoutNitrousHp'] = val(base, 'hp', power['kind'], power['source']['video'],
                                           lk.t('dyno', cid, power['source']['video'], 'hp', base), 'dyno pull without nitrous')
    if (c.get('power') or {}).get('torque_lbft') is not None:
        car['torqueLbft'] = val(c['power']['torque_lbft'], 'lbft', norm_kind(c['power'].get('kind')), c['power'].get('src'))
    if (c.get('power') or {}).get('boost_psi') is not None:
        car['boostPsi'] = val(c['power']['boost_psi'], 'psi', norm_kind(c['power'].get('kind')), c['power'].get('src'))
    car['facts'] = {k: f() for k, f in FACTS.get(cid, {}).items()}
    return car


# ---- Parts catalogue from calibration/prices.csv ---------------------------------------------------------
# Budget-board category totals (item = power_adder / ecu / transmission / purchase) are sums of rows that are
# also listed one by one, so they are left out; so are whole cars, repairs and quotes (kept apart with the
# reason). A board line that repeats a parts line of the same car (same price, overlapping words) is merged
# into it. Only a part that is the same as a game part is linked to its slot; the rest is listed as not
# fitting the EA888/Scirocco slots (yet), with why.
CATEGORY_TOTALS = {'power_adder', 'ecu', 'transmission', 'purchase'}
SLOT_LINKS = {
    # the same turbo the game sells new as pt7675 (Precision 7675, T4 1.15 divided)
    'Precision 7675 remanufactured turbo, T4, 1.15 divided': ('turbo', 'pt7675', 'zelfde Precision 7675-wielset (76 mm compressor, 75 mm turbine) als in het spel; deze heeft een T4 1.15 divided-turbinebehuizing'),
}
CONDITIONS = [
    ('scratch_and_dent', r'scratch[- ]and[- ]dent'),
    ('sponsored', r'sponsor'),
    ('remanufactured', r'\breman|rebuilt'),
    ('used', r'\bused\b|marketplace|junk|core\b|blown|damaged|from friend|scrap|reused|trade|fair market|second car|parts car|donor'),
    ('new', r'^new\b|\bbrand new|[(,] ?new\)|\bnew (fti|carburetor|connecting|transmission)'),
]
GROUPS = [
    ('motor (V8)', r'\bLS\b|coyote|engine|block|rotating|heads?\b|cam(shaft)?\b|lifters|pushrods|rockers|timing|valve cover|head stud|main stud|connecting rod|phaser|head gasket|spark plug'),
    ('automaat en converter', r'powerglide|turbo 400|th400|converter|bellhousing|trans(mission)? cooler|transbrake|shifter'),
    ('turbo en inlaat', r'turbo|wastegate|intercooler|piping|intake|air cleaner'),
    ('brandstof', r'fuel|injector|carb|pump|regulator|fitting|hose|methanol'),
    ('lachgas', r'nitrous'),
    ('ophanging en achteras', r'rear end|8\.8|9-inch|axle|caltrac|coilover|cow tracks|bushing|steering'),
    ('wielen en banden', r'wheel|tire|tyre|radial|lug'),
    ('koeling', r'radiator|fan|cooler'),
    ('ECU en elektra', r'holley|terminator|ecu|relay|ignition|sensor|switch panel|sending unit'),
]


def words(t):
    return {w for w in re.findall(r'[a-z0-9]+', (t or '').lower()) if len(w) > 2}


def build_catalog(cal):
    rows = read_csv(cal / 'prices.csv')
    parts, apart, merged = [], [], []
    for r in rows:
        item, path = (r['item'] or '').strip(), r['path'] or ''
        price = num(r['price_usd'])
        src = {'video': r['video_id'], 't': r['t'] or None}
        if item in CATEGORY_TOTALS:
            apart.append({'item': item, 'priceUsd': price, 'carId': r['car_id'], 'source': src,
                          'reason': 'categorietotaal van een budgetbord (de onderdelen staan los in de lijst)'})
            continue
        if path.startswith(('purchase', 'junkyard_purchase')) or re.search(r'\bcar\b.*delivered|\(auction|^\d{4} .*(camino|truck)| truck$|roller|\bhatch \(no engine', item, re.I) \
                or re.match(r"^(First car|Second car|S10 truck|240SX hatch|Mustang \(auction)", item):
            apart.append({'item': item, 'priceUsd': price, 'carId': r['car_id'], 'source': src, 'reason': 'een hele auto, geen onderdeel (voor fase 2: koopbare auto\'s)'})
            continue
        if path.startswith(('failures', 'reference_prices')) or re.search(r'DISALLOWED|quote, not bought|comparison|owed between crew', item, re.I):
            apart.append({'item': item, 'priceUsd': price, 'carId': r['car_id'], 'source': src,
                          'reason': 'reparatie, offerte of vergelijking, geen te koop onderdeel' if not re.search('DISALLOWED', item) else 'niet gemonteerd (afgekeurd)'})
            continue
        label = re.fullmatch(r'[a-z_]+', item) is not None
        cond = None if label else next((c for c, pat in CONDITIONS if re.search(pat, item, re.I)), None)
        retail = None
        m = re.search(r'(?:half of|of) \$([\d,]+) (?:retail|new)|retail \$([\d,]+)|\$([\d,]+) new\)', item)
        if m:
            retail = float(next(g for g in m.groups() if g).replace(',', ''))
        group = next((g for g, pat in GROUPS if re.search(pat, item, re.I)), 'overig')
        entry = {'item': item, 'priceUsd': price, 'askingUsd': num(r['asking_usd']), 'retailUsd': retail, 'condition': cond,
                 'group': group, 'carId': r['car_id'], 'source': src, 'note': r['note'] or None, 'fromBudgetBoard': path.startswith('budget_whiteboard')}
        # A budget-board line or a bare category label ('fuel_system') that repeats a line of the same car at the
        # same price is the same part: merged. Two ordinary lines alike in price and words may be one part seen
        # in two videos - both stay, marked, because merging them could lose a real second part.
        same = [e for e in parts if e['carId'] == entry['carId'] and e['priceUsd'] == entry['priceUsd']]
        nums = lambda t: set(re.findall(r'#(\d+)', t))
        lw = lambda t: words(t.replace('_', ' ')) | ({'pump', 'fuel'} if 'fuel' in t else set()) | ({'radiator', 'fans', 'fan'} if t == 'cooling' else set())
        dup = next((e for e in same if e['item'].lower() == item.lower()
                    or (label and lw(item) & words(e['item'])) or (re.fullmatch(r'[a-z_]+', e['item']) and lw(e['item']) & words(item))
                    or ((entry['fromBudgetBoard'] != e['fromBudgetBoard']) and len(words(e['item']) & words(item)) >= 1)), None)
        if dup:
            if re.fullmatch(r'[a-z_]+', dup['item']) and not label:
                # keep the descriptive name, the label row becomes the alias
                dup['alsoSeen'] = dup.get('alsoSeen', []) + [{'item': dup['item'], 'source': dup['source']}]
                dup.update({k: entry[k] for k in ('item', 'condition', 'group', 'source', 'fromBudgetBoard', 'retailUsd')})
            else:
                dup.setdefault('alsoSeen', []).append({'item': item, 'source': src})
            merged.append(item)
            continue
        maybe = next((e for e in same if len(words(e['item']) & words(item)) >= 2 and nums(e['item']) == nums(item)), None)
        if maybe:
            entry['possibleDuplicateOf'] = maybe['item']
        link = SLOT_LINKS.get(item)
        entry['slot'] = {'category': link[0], 'partId': link[1], 'reason': link[2]} if link else None
        if not link:
            entry['notFitting'] = {
                'motor (V8)': 'onderdeel van een V8 (LS, Coyote, big-block); het spel heeft het EA888-blok',
                'automaat en converter': 'Powerglide/TH400-automaat en converter: bestaan in het spel alleen voor de roster-auto\'s (fase 2)',
                'turbo en inlaat': 'budget- of universeel turbo-onderdeel zonder compressorkaart of passend EA888-kit',
                'brandstof': 'brandstofonderdeel voor carburateur/V8; de EA888 heeft directe inspuiting met een eigen pomp',
                'lachgas': 'lachgaskit zonder bekende shotgrootte; de spelkits hebben een vaste shot',
                'ophanging en achteras': 'achteras/ophanging van een achterwielaangedreven V8-auto',
                'wielen en banden': 'wiel- of bandenset zonder maat; banden kies je in het spel per compound',
                'koeling': 'universele koeling; het spel modelleert koeling niet als onderdeel',
                'ECU en elektra': 'V8/carburateur-elektronica; de EA888-ECU\'s zijn eigen onderdelen',
                'overig': 'geen passend onderdeelslot',
            }[group]
        parts.append(entry)
    for i, e in enumerate(parts):
        e['id'] = f"p{i + 1:03d}"
    return parts, apart, merged


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--research', required=True, type=Path, help='.../research/youtube/cleetusm')
    ap.add_argument('--commit', required=True, help='research commit the data comes from')
    ap.add_argument('--branch', default='claude/laughing-babbage-ls6v7d')
    args = ap.parse_args()
    res = args.research
    cal = res / 'calibration'
    roster = json.loads((res / 'roster.json').read_text(encoding='utf-8'))
    lk = Lookup(cal)
    dyno_rows = read_csv(cal / 'dyno.csv')
    hale = read_csv(cal / 'hale_check.csv')

    source = {'repo': 'github.com/cars4ever/EA888', 'branch': args.branch, 'commit': args.commit,
              'path': 'research/youtube/cleetusm', 'importedBy': 'tools/import_roster.py'}
    kinds = {
        'measured': 'timeslip, dyno sheet or scale read in the video',
        'stated': 'said by the team without the number being shown',
        'estimate': "the team's own estimate",
        'modeled': 'not in the research; derived by the game from the calibration data or a documented rule, with the reason',
    }
    cars = [build_car(c, lk, dyno_rows) for c in roster['cars']]
    points, excluded = calibration(roster, hale, lk, cal)

    # What an opponent races with: the calibration pair where there is one, otherwise the same Hale
    # derivation from its best pass, with the caveat why it is only approximate.
    by_point = {pt['carId']: pt for pt in points}
    caveat = {e['carId']: e['reason'] for e in excluded if e.get('source')}
    for car in cars:
        cid = car['id']
        if cid in by_point:
            pt = by_point[cid]
            car['opponent'] = {'usable': True, 'weightLb': pt['weight'], 'powerHp': pt['power'], 'notes': pt['notes']}
            continue
        w, hp = car['weightLb'], car['powerHp']
        bp = car.get('bestPass') or {}
        mph = (bp.get('mph') or {}).get('value')
        notes = []
        if mph is None:
            # the car's numbers live per build: take the latest build with a full pass, and its own dyno
            for b in reversed(car['builds']):
                pb = b.get('bestPass') or {}
                if (pb.get('mph') or {}).get('value') and (pb.get('et') or {}).get('value'):
                    mph = pb['mph']['value']
                    car['bestPass'] = {**pb, 'build': b['version']}
                    if hp['value'] is None and b.get('power') and not b.get('note'):
                        hp = b['power']
                    notes.append(f"build: {b['version']}")
                    break
        if cid == 'mullet':
            w = car['facts']['worldCupWeightLb']
            notes.append('the World Cup trim weight; roster.json gives 2,762 lb from the 2026 build')
        if w['value'] is not None and hp['value'] is None and mph:
            hp = val(round(w['value'] * math.pow(mph / HALE_MPH, 3)), 'hp', 'modeled', None, None, None, basis='crank',
                     reason='not in the research; from the trap speed and the weight with Hale (MPH = 234 (hp/lb)^(1/3))',
                     derivedFrom={'mph': mph, 'lb': w['value']})
        elif hp['value'] is not None and w['value'] is None and mph:
            w = val(round(hp['value'] / math.pow(mph / HALE_MPH, 3)), 'lb', 'modeled', None, None, None,
                    reason='not in the research; from the trap speed and the dyno power with Hale (MPH = 234 (hp/lb)^(1/3))',
                    derivedFrom={'mph': mph, 'hp': hp['value']})
        if cid in caveat:
            notes.append('approximate: ' + caveat[cid])
        usable = w['value'] is not None and hp['value'] is not None
        car['opponent'] = {'usable': usable, 'weightLb': w, 'powerHp': hp, 'notes': notes,
                           'reason': None if usable else 'weight and power not both known or derivable'}

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'cars.json').write_text(json.dumps({'schemaVersion': 1, 'source': source, 'about': roster.get('about'),
                                               'kinds': kinds, 'cars': cars}, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    (OUT / 'calibration.json').write_text(json.dumps({'schemaVersion': 1, 'source': source,
                                                      'points': points, 'excluded': excluded}, indent=1, ensure_ascii=False) + '\n',
                                          encoding='utf-8')
    parts, apart, merged = build_catalog(cal)
    (OUT / 'parts-catalog.json').write_text(json.dumps({
        'schemaVersion': 1, 'source': source, 'currency': 'USD',
        'about': 'Onderdelen met prijs uit de video\'s (meest tweedehands). priceUsd = betaald of door het team gewaardeerd; '
                 'condition uit de beschrijving (used / new / scratch_and_dent / sponsored / remanufactured; null = niet gezegd).',
        'parts': parts, 'notInCatalog': apart, 'mergedDuplicates': merged}, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    names_path = OUT / 'display-names.json'
    names = json.loads(names_path.read_text(encoding='utf-8')) if names_path.exists() else {}
    names.setdefault('_about', 'Weergavenamen in het spel. Pas ze vrij aan; een nieuwe import overschrijft ze niet.')
    for c in cars:
        names.setdefault(c['id'], DEFAULT_NAMES.get(c['id'], c['id']))
    names_path.write_text(json.dumps(names, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f"{len(cars)} cars, {len(points)} calibration points, {len(excluded)} excluded -> {OUT.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
