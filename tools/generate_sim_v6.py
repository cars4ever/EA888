#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / '.data'
OUT = ROOT / 'src' / 'assets' / 'sim.js'

raw_categories = json.loads((DATA/'categories.json').read_text())
oils = json.loads((DATA/'oils.json').read_text())
filters = json.loads((DATA/'filters.json').read_text())
tires = json.loads((DATA/'tires.json').read_text())
drivetrains = json.loads((DATA/'drivetrains.json').read_text())
presets = json.loads((DATA/'presets.json').read_text())

# Extend the physical catalog with systems that matter on a real high-output build.
def part(id, name, detail, specs, price, **metrics):
    return {'id':id,'name':name,'detail':detail,'specs':specs,'price':price,**metrics}

new_categories = {
 'crankcase': {
   'id':'crankcase','label':'Carterventilatie & vacuüm','short':'PCV','items':[
      part('oem_pcv','OEM PCV-systeem','Gesloten OEM carterventilatie. Goed voor standaard gebruik; bij hoge boost kan oliedamp de inlaat en knockmarge beïnvloeden.','OEM membraan · retour naar inlaat',0,crankcaseControl=.58,oilVaporPenalty=.055,vacuumKpa=0,reliabilityBonus=0),
      part('catch_can','Gesloten catch-can systeem','Afscheiding van olie/nevel met retour naar de inlaat. Geschikt voor straatgebruik wanneer slangen en terugslagkleppen correct zijn uitgevoerd.','Baffled can · check valves · gesloten circuit',480,crankcaseControl=.82,oilVaporPenalty=.025,vacuumKpa=0,reliabilityBonus=2),
      part('vented_can','Race catch-can / atmosferisch','Grote ontluchting voor racegebruik. Minder oliedamp in de inlaat, maar niet emissie- of straatgericht.','-10AN/-12AN ontluchting · drain',780,crankcaseControl=.92,oilVaporPenalty=.012,vacuumKpa=0,reliabilityBonus=3),
      part('vacuum_pump','Externe vacuümpomp','Geregeld cartervacuüm vermindert windage en helpt ringseal. Vereist drukregeling en betrouwbare olieafscheiding.','Externe pomp · regulator · catch tank',2450,crankcaseControl=1.02,oilVaporPenalty=.004,vacuumKpa=-10,powerMultiplier=1.012,reliabilityBonus=5,massDeltaKg=3)
   ]
 },
 'boostControl': {
   'id':'boostControl','label':'Wastegate & boostregeling','short':'WG','items':[
      part('oem_internal','OEM interne wastegate','Snelle respons en compacte montage. Regelautoriteit wordt beperkt bij hoge flow en lage gewenste boost.','Interne klep · OEM actuator',0,boostControlQuality=.66,boostHardwareMaxBar=1.55,wastegateFlow=.72),
      part('uprated_internal','Versterkte interne wastegate','Zwaardere actuator en betere klepgeometrie voor een K04/hybrid-setup.','Uprated actuator · ported flap',520,boostControlQuality=.82,boostHardwareMaxBar=2.35,wastegateFlow=.86,reliabilityBonus=1),
      part('single_44','Enkele 44-mm externe wastegate','Meer bypass-flow en stabielere regeling op een degelijk gescheiden spruitstuk.','44 mm · boost solenoid · dump/recirc',920,boostControlQuality=.92,boostHardwareMaxBar=3.25,wastegateFlow=1.00,reliabilityBonus=2),
      part('dual_44','Dubbele 44-mm wastegates','Twin-scroll regeling met één wastegate per scroll. Past bij de bekende HX52-opzet met twee gates.','2×44 mm · twin-scroll · 4-port control',1780,boostControlQuality=.975,boostHardwareMaxBar=4.25,wastegateFlow=1.17,reliabilityBonus=4,visualKey='randy'),
      part('co2_dome','CO₂ dome pressure control','Zeer hoge regelautoriteit en herhaalbaarheid voor draggebruik. Foutieve strategie kan juist extreme overboost geven.','Dome pressure · dual gate · closed-loop',3650,boostControlQuality=.995,boostHardwareMaxBar=5.50,wastegateFlow=1.24,reliabilityBonus=4,massDeltaKg=5)
   ]
 },
 'manifold': {
   'id':'manifold','label':'Inlaatspruitstuk & gasklep','short':'Inlaat','items':[
      part('oem_manifold','OEM inlaatspruitstuk','Lange runners en goede lage-toerenrespons. De plenum- en gasklepflow worden beperkend op extreme top-end.','OEM kunststof runners · OEM gasklep',0,intakeFlow=1.00,lowRpmMultiplier=1.025,highRpmMultiplier=.965,throttleMm=68,plenumL=2.4),
      part('ported_oem','Geport OEM spruitstuk + 76 mm','Behoudt runnerlengte en respons, met minder lokale restrictie.','Geport runners · 76-mm gasklep',780,intakeFlow=1.045,lowRpmMultiplier=1.015,highRpmMultiplier=1.025,throttleMm=76,plenumL=2.6,reliabilityBonus=1),
      part('cast_plenum','Cast race plenum + 80 mm','Groter plenum en kortere runners voor hogere massaflow. Iets minder respons onderin.','Cast aluminium · 80-mm gasklep',1650,intakeFlow=1.085,lowRpmMultiplier=.98,highRpmMultiplier=1.075,throttleMm=80,plenumL=3.4),
      part('billet_plenum','Billet plenum + 90 mm','Gelijke runnerverdeling, grote gasklep en MAP/IAT-poorten voor hoog vermogen.','Billet plenum · bellmouth runners · 90 mm',3250,intakeFlow=1.125,lowRpmMultiplier=.94,highRpmMultiplier=1.12,throttleMm=90,plenumL=4.2,reliabilityBonus=2),
      part('sheetmetal_105','Drag sheet-metal plenum + 105 mm','Zeer groot plenum en korte runners. Bedoeld voor hoog toerental en enorme compressorflow.','Sheet metal · 105-mm throttle · burst panel',5450,intakeFlow=1.17,lowRpmMultiplier=.86,highRpmMultiplier=1.17,throttleMm=105,plenumL=5.4,reliabilityBonus=1)
   ]
 },
 'sensors': {
   'id':'sensors','label':'Sensoren & datalogging','short':'Sensors','items':[
      part('oem_sensors','OEM sensoren','OEM MAP, lambda, knock en druksignalen. Voldoende voor standaard en milde builds, minder dekking voor extreme hardware.','OEM MAP · wideband · knock · rail',0,sensorQuality=.64,diagnosticConfidence=.60,measurementNoise=.030),
      part('street_sensor_pack','Uitgebreid street sensorpakket','Extra 4-bar MAP, brandstofdruk, oliedruk en olietemperatuur.','4-bar MAP · fuel/oil pressure · oil temp',680,sensorQuality=.80,diagnosticConfidence=.78,measurementNoise=.020,reliabilityBonus=2),
      part('motorsport_sensors','Motorsport safety sensorpakket','EGT, flex-fuel, WMI-flow, backpressure en redundante drukbewaking voor echte failsafes.','EGT · flex · WMI flow · EMP · pressure',1950,sensorQuality=.94,diagnosticConfidence=.93,measurementNoise=.010,reliabilityBonus=5,visualKey='randy'),
      part('pro_instrumentation','Pro instrumentation + turbospeed','Turbospeed, vier EGT-kanalen, krukasdruk, individuele lambda en hoge-snelheidslogging.','Shaft speed · 4× EGT · crank pressure · 1 kHz log',4950,sensorQuality=.992,diagnosticConfidence=.99,measurementNoise=.004,reliabilityBonus=7)
   ]
 }
}

# Insert new categories at logical physical positions.
ids = [c['id'] for c in raw_categories]
def insert_after(after_id, category):
    idx = next(i for i,c in enumerate(raw_categories) if c['id']==after_id)
    raw_categories.insert(idx+1, category)
insert_after('oiling', new_categories['crankcase'])
insert_after('turbo', new_categories['boostControl'])
insert_after('air', new_categories['manifold'])
insert_after('ecu', new_categories['sensors'])

# Add extremely large but physically possible drag-only hardware.
turbo_cat = next(c for c in raw_categories if c['id']=='turbo')
turbo_cat['items'].append(part('127mm','127-mm Unlimited turbo','Een echte unlimited-size compressor voor extreme dragprojecten. Op circa 2,0 liter is bruikbare spool zonder zeer hoog toerental en externe energie extreem laat.','127-mm compressor · 118-mm turbine · drag-only',18500,turboMaxHp=2200,turboSpoolRpm=9300,turboEfficiency=.84,turboMaxBoost=5.6,compressorMm=127,turbineMm=118,hpLimit=2200,torqueLimit=2200,rpmLimit=10600,shaftSpeedLimitRpm=104000,massDeltaKg=22))
spool_cat = next(c for c in raw_categories if c['id']=='spool')
spool_cat['items'].append(part('n2o_250','250 hp staged nitrous spool system','Meervoudig progressief spoolshot voor extreem grote turbo’s. Vereist passende brandstof-, ontstekings- en cilinderdrukmarge.','250 hp staged · boost-referenced cut · race-only',3850,spoolShiftRpm=1900,nitrousHp=250,spoolHeat=.38,wearFactor=.44))

# A 98–127 mm compressor is only useful when the entire engine, oil system,
# cylinder head, sealing, ECU and driveline are engineered to the same level.
# These parts are deliberately drag-only and expensive; they are not upgrades
# for the street-based Randy engine.
def append_part(category_id, item):
    next(c for c in raw_categories if c['id']==category_id)['items'].append(item)

append_part('block', part('promod_block','Promod dry-deck billet block','Volledig billet/dry-deck onderblok met ductile sleeves, vaste mains en externe koelwaterroute. Onderhoud na korte race-intervallen.','83,5 mm · dry deck · billet mains · drag-only',31500,hpLimit=2350,torqueLimit=2250,rpmLimit=10600,reliabilityBonus=10,massDeltaKg=24,boreMm=83.5,strokeMm=92.8,compressionRatio=8.5,visualKey='promod'))
append_part('crank', part('promod_crank','Promod billet krukas + tuned damper','Billet krukas, heavy-duty damper en volledig gematchte roterende groep voor zeer hoge BMEP en toerental.','Billet steel · tuned damper · matched bobweight',13900,hpLimit=2350,torqueLimit=2300,rpmLimit=10600,harmonicControl=1.04,reliabilityBonus=11,massDeltaKg=6))
append_part('oiling', part('promod_drysump','5-stage Promod dry-sump','Grote scavengecapaciteit, geregelde carterdruk en externe olievoorraad voor herhaalde dragpulls.','5-stage pump · vacuum regulation · 12 L tank',12800,hpLimit=2450,torqueLimit=2450,rpmLimit=10800,oilControl=1.10,oilCooling=1.35,reliabilityBonus=12,massDeltaKg=15))
append_part('head', part('promod_head','Promod billet-port cylinder head','Zwaar geporte kop met grote zittingen, korte runners en race-spec nokken voor top-end flow boven 9000 rpm.','Billet-port · oversized seats · drag cams',18600,hpLimit=2300,torqueLimit=2300,rpmLimit=10600,powerMultiplier=1.20,lowRpmMultiplier=.74,highRpmMultiplier=1.36,headFlow=1.29,reliabilityBonus=6,visualKey='promod'))
append_part('valvetrain', part('promod_valvetrain','Promod solid valvetrain','Solid buckets, DLC followers, titanium retainers en raceveren met zeer korte inspectie-intervallen.','Solid bucket · DLC · Ti retainers · 10.7k rpm',11800,hpLimit=2350,torqueLimit=2350,rpmLimit=10700,reliabilityBonus=7))
append_part('air', part('promod_ice_system','Promod ice-water charge system','Grote water/ijs-tank, high-flow core en gecontroleerde pompflow voor een korte, reproduceerbare dragpass.','30 L ice tank · dual pump · race core',8900,cooling=.985,flow=1.21,reliabilityBonus=4,massDeltaKg=23))
append_part('fuelSystem', part('promod_methanol_fuel','Promod staged methanol system','Meervoudige mechanische injectoren met staged nozzles en onafhankelijke brandstofdrukbewaking.','16 injectors · belt pump · staged control',24900,fuelSystemHp=5200,maxRailBar=250,reliabilityBonus=7,massDeltaKg=19))
append_part('ecu', part('promod_ecu','Promod motorsport ECU + PDM','Volledige staged fuel/ignition/boost-regeling met turbospeed, individuele EGT/lambda en harde shutdowns.','Dual ECU/PDM · cylinder trim · 2 kHz logging',14900,hpLimit=2400,torqueLimit=2400,rpmLimit=10800,safetyQuality=.998,reliabilityBonus=11))
append_part('ignition', part('dual_cdi','Dual-channel CDI ignition','Dubbele CDI en afgeschermde loom voor methanol en zeer hoge cilinderdruk.','Dual CDI · crank-trigger · shielded harness',6800,sparkQuality=1.065,sparkBoostLimit=6.2,reliabilityBonus=6))
append_part('sealing', part('receiver_ring_extreme','Receiver-ring dry-deck sealing','Dry-deck kop/blok, koperpakking en receiver rings met hoge en gelijkmatige clamp load.','Copper · receiver rings · external coolant',9800,headClampBmep=124,reliabilityBonus=9))
append_part('transmission', part('promod_5speed','5-speed Promod drag transmission','Clutchless vijfversnellingsbak, spool/dragdiff en verhoudingen voor een smalle high-rpm powerband.','5-speed clutchless · straight-cut · spool',36500,transTorque=2450,shiftSeconds=.038,transEfficiency=.945,reliabilityBonus=5,massDeltaKg=8,gearRatios=[2.56,1.78,1.36,1.10,.92],finalDrive=3.55))
append_part('manifold', part('billet_120','Billet drag plenum + 120 mm','Groot plenum, korte gelijke runners, burst panel en 120-mm gasklep voor extreme top-end massaflow.','Billet runners · 120-mm throttle · burst panel',8900,intakeFlow=1.25,lowRpmMultiplier=.74,highRpmMultiplier=1.25,throttleMm=120,plenumL=6.6,reliabilityBonus=2))
append_part('boostControl', part('dual_60_co2','Dubbele 60-mm CO₂ wastegates','Twee grote wastegates en dome pressure control voor zeer hoge turbineflow en stabiele boost ramps.','2×60 mm · dome CO₂ · shaft-speed limit',6900,boostControlQuality=.998,boostHardwareMaxBar=6.2,wastegateFlow=1.45,reliabilityBonus=6,massDeltaKg=7))

# Default selections for new systems.
def_sel = {
 'crankcase':'catch_can', 'boostControl':'uprated_internal', 'manifold':'ported_oem', 'sensors':'motorsport_sensors'
}
for key,p in presets.items():
    sel=p.setdefault('selections',{})
    if key=='stock': sel.update({'crankcase':'oem_pcv','boostControl':'oem_internal','manifold':'oem_manifold','sensors':'oem_sensors'})
    elif key=='k04': sel.update({'crankcase':'catch_can','boostControl':'uprated_internal','manifold':'ported_oem','sensors':'street_sensor_pack'})
    elif key=='randy': sel.update(def_sel)
    elif key=='hx52': sel.update({'crankcase':'vented_can','boostControl':'dual_44','manifold':'cast_plenum','sensors':'motorsport_sensors'})
    else: sel.update({'crankcase':'vacuum_pump','boostControl':'co2_dome','manifold':'sheetmetal_105','sensors':'pro_instrumentation'})

# Calibrated large-frame reference builds. The 98- and 106-mm presets keep a
# conventional ported head so the compressor is not magically converted into
# power; the extreme bottom end, oiling and controls provide the survival margin.
extreme_support={
  'block':'promod_block','crank':'promod_crank','oiling':'promod_drysump','boostControl':'dual_60_co2',
  'fuelSystem':'promod_methanol_fuel','ecu':'promod_ecu','ignition':'dual_cdi',
  'sealing':'receiver_ring_extreme','transmission':'promod_5speed'
}
presets['pro98']['selections'].update(extreme_support)
presets['pro98']['tune'].update({'boostHighBar':2.60,'revLimitRpm':9500,'railTargetBar':225})
presets['pro98']['assembly']={'topRingGapMm':.56,'secondRingGapMm':.62,'rodClearanceMm':.060,'mainClearanceMm':.058,'sparkGapMm':.52,'balanceQualityPct':100,'deckSealQualityPct':100,'fastenerProcedurePct':100,'oilPrimed':True}
presets['pro98']['service']={'oilId':'10w60_race','liters':5.0,'filterId':'motorsport','oilAgeKm':0,'oilRuns':0}

presets['outlaw106']['selections'].update(extreme_support)
presets['outlaw106']['tune'].update({'boostHighBar':2.80,'revLimitRpm':9200,'railTargetBar':225})
presets['outlaw106']['assembly']={'topRingGapMm':.57,'secondRingGapMm':.63,'rodClearanceMm':.060,'mainClearanceMm':.058,'sparkGapMm':.50,'balanceQualityPct':100,'deckSealQualityPct':100,'fastenerProcedurePct':100,'oilPrimed':True}
presets['outlaw106']['service']={'oilId':'10w60_race','liters':5.0,'filterId':'motorsport','oilAgeKm':0,'oilRuns':0}

presets['unlimited127']={
 'name':'127-mm Unlimited 2.0',
 'selections':{
   'block':'promod_block','crank':'promod_crank','oiling':'promod_drysump','crankcase':'vacuum_pump','head':'promod_head','valvetrain':'promod_valvetrain',
   'turbo':'127mm','boostControl':'dual_60_co2','air':'promod_ice_system','manifold':'billet_120','fuelSystem':'promod_methanol_fuel','fuel':'methanol',
   'exhaust':'hood_4','ecu':'promod_ecu','sensors':'pro_instrumentation','ignition':'dual_cdi','sealing':'receiver_ring_extreme','transmission':'promod_5speed','spool':'n2o_250'
 },
 'tune':{'boostLowBar':.05,'boostMidBar':.30,'boostHighBar':2.80,'lambda':.72,'ignitionTrimDeg':-3.0,'revLimitRpm':9800,'railTargetBar':225,'intakeCamAdvanceDeg':-2,'launchRpm':7800,'firstGearBoostPct':34,'secondGearBoostPct':54},
 'assembly':{'topRingGapMm':.58,'secondRingGapMm':.64,'rodClearanceMm':.062,'mainClearanceMm':.060,'sparkGapMm':.49,'balanceQualityPct':100,'deckSealQualityPct':100,'fastenerProcedurePct':100,'oilPrimed':True},
 'service':{'oilId':'10w60_race','liters':5.0,'filterId':'motorsport','oilAgeKm':0,'oilRuns':0}
}

# Compact JSON keeps the production script reasonably sized.
def js(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',',':'))

template = r'''/* EA888 Lab v0.6.0 — deterministic engine, bench and drag simulation core.
 * Offline and dependency-free. This is an engineering game model, not workshop
 * certification, an ECU calibration or a substitute for measurements on a real engine.
 */
(function (root) {
  'use strict';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, f) => a + (b - a) * f;
  const round = (v, n = 0) => { const p = 10 ** n; return Math.round(v * p) / p; };
  const deepClone = obj => JSON.parse(JSON.stringify(obj));

  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const METRIC_DEFAULTS = Object.freeze({
    hpLimit:10000, torqueLimit:10000, rpmLimit:20000, powerMultiplier:1, lowRpmMultiplier:1, highRpmMultiplier:1,
    headFlow:1, turboMaxHp:10000, turboSpoolRpm:0, turboEfficiency:1, turboMaxBoost:10, compressorMm:0, turbineMm:0,
    shaftSpeedLimitRpm:0, cooling:0, flow:1, intakeFlow:1, throttleMm:68, plenumL:2.4, fuelSystemHp:10000, maxRailBar:250,
    octane:120, fuelCooling:0, fuelFlowFactor:1, exhaustFlow:1, oilControl:.5, oilCooling:.2, harmonicControl:.2,
    safetyQuality:.5, sparkQuality:1, sparkBoostLimit:10, headClampBmep:60, transTorque:10000, shiftSeconds:.20,
    transEfficiency:.90, reliabilityBonus:0, massDeltaKg:0, spoolShiftRpm:0, nitrousHp:0, spoolHeat:0, wearFactor:0,
    gearRatios:[3.36,2.09,1.47,1.10,.86,.72], finalDrive:3.94, boreMm:82.5, strokeMm:92.8, compressionRatio:9.6,
    targetExhaustTdcMm:null, targetIntakeTdcMm:null, visualKey:'', crankcaseControl:.6, oilVaporPenalty:.05, vacuumKpa:0,
    boostControlQuality:.72, boostHardwareMaxBar:2, wastegateFlow:.8, sensorQuality:.65, diagnosticConfidence:.62, measurementNoise:.03
  });

  const RAW_CATEGORIES = __CATEGORIES__;
  const CATEGORIES = RAW_CATEGORIES.map(c => ({...c, items:c.items.map(p => ({...METRIC_DEFAULTS, ...p}))}));
  const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id,c]));
  const OILS = __OILS__;
  const OIL_MAP = Object.fromEntries(OILS.map(o => [o.id,o]));
  const FILTERS = __FILTERS__;
  const FILTER_MAP = Object.fromEntries(FILTERS.map(f => [f.id,f]));
  const TIRE_COMPOUNDS = __TIRES__;
  const TIRE_MAP = Object.fromEntries(TIRE_COMPOUNDS.map(t => [t.id,t]));
  const DRIVETRAINS = __DRIVETRAINS__;
  const PRESETS = __PRESETS__;

  const BENCH_TESTS = [
    {id:'oilPrime',name:'Oliedruk primen',detail:'Controleert de gemodelleerde druk bij starttoerental vóór de eerste pull.'},
    {id:'compression',name:'Compressietest',detail:'Vergelijkt de vier cilinders en laat spreiding of afdichtingsverlies zien.'},
    {id:'leakdown',name:'Leak-down test',detail:'Schat ring-, klep- en koppakkingafdichting per cilinder.'},
    {id:'fuelFlow',name:'Brandstofsysteem flowtest',detail:'Test pomp-, injector- en railmarge zonder vermogen vooraf te verklappen.'},
    {id:'camCheck',name:'Nokken timingcontrole',detail:'Controleert overlap-TDC lift en VVT-basispositie.'},
    {id:'sparkCheck',name:'Ontsteking & bougiegap',detail:'Controleert gap en beschikbare vonkmarge tegen de gevraagde boost.'}
  ];

  const CHALLENGES = [
    {id:'first_pull',title:'Eerste volledige pull',reward:750,detail:'Sla een volledige dynopull zonder afbreken op.'},
    {id:'safe500',title:'500 pk met marge',reward:1800,detail:'Minimaal 500 pk en betrouwbaarheid 80/100 of hoger.'},
    {id:'k04_hero',title:'K04 boven 500',reward:2200,detail:'Minimaal 500 pk met K04/K04-hybrid en een geldige pull.'},
    {id:'bench_master',title:'Testbankmeester',reward:1600,detail:'Alle zes benchtests actueel en zonder fail-resultaat.'},
    {id:'fwd11',title:'FWD 11-secondenkaart',reward:2500,detail:'Geldige FWD-pass onder 12,000 seconden.'},
    {id:'fwd10',title:'FWD tiener',reward:4800,detail:'Geldige FWD-pass onder 11,000 seconden.'},
    {id:'seven_hundred',title:'700-club',reward:3000,detail:'Minimaal 700 pk met betrouwbaarheid 68/100 of hoger.'},
    {id:'four_digits',title:'Vier cijfers',reward:6500,detail:'Minimaal 1000 pk zonder afgebroken dynopull.'},
    {id:'big_turbo_survivor',title:'98+ mm overlever',reward:7200,detail:'Volledige pull met minimaal 98-mm compressor en betrouwbaarheid 55/100 of hoger.'}
  ];

  function defaultSelections() {
    return {block:'randy_je83',crank:'randy_balanced_crank',oiling:'baffled',crankcase:'catch_can',head:'randy_catcams',valvetrain:'randy_ferrea',
      turbo:'k04_hybrid',boostControl:'uprated_internal',air:'wmi',manifold:'ported_oem',fuelSystem:'randy_nostrum_rsx',fuel:'blend_wmi',exhaust:'race_3',
      ecu:'randy_syvecs',sensors:'motorsport_sensors',ignition:'fresh_coils',sealing:'randy_cometic_arp',transmission:'randy_o2q',spool:'none'};
  }
  function defaultTune() {
    return {boostLowBar:.95,boostMidBar:1.88,boostHighBar:1.72,lambda:.79,ignitionTrimDeg:-.5,revLimitRpm:8000,railTargetBar:175,
      intakeCamAdvanceDeg:8,exhaustTdcLiftMm:.85,intakeTdcLiftMm:.25,vvtEnabled:true,launchRpm:4200,firstGearBoostPct:55,secondGearBoostPct:78,
      knockControl:true,railPressureCut:true,lambdaProtection:true,methFailsafe:true,oilPressureProtection:true,overboostCut:true};
  }
  function defaultAssembly() {
    return {topRingGapMm:.52,secondRingGapMm:.58,rodClearanceMm:.055,mainClearanceMm:.052,sparkGapMm:.60,
      balanceQualityPct:98,deckSealQualityPct:97,fastenerProcedurePct:98,oilPrimed:true};
  }
  function blankState() {
    return {
      version:5, buildName:'Randy CAWB JE83 K04', selections:defaultSelections(), tune:defaultTune(), assembly:defaultAssembly(),
      bench:{results:{}}, dynoConfig:{rampRpmPerSec:550,fanSpeedPct:85,ambientTempC:20,baroKpa:101.3},
      service:{oilId:'5w40_ester',liters:4.6,filterId:'motorsport',oilAgeKm:1800,oilRuns:4,lastChangeLabel:'voor deze update',coolantQuality:.96},
      vehicle:{drivetrain:'FWD',massKg:1350,tireCompound:'uhp',rimDiameterIn:19,rimWidthIn:8.5,tireWidthMm:245,aspectRatio:35,pressureBar:2.20,
        wheelMassKg:12.4,preparedTrack:false,ambientTempC:20,trackTempC:28,altitudeM:12,humidityPct:68,headwindKmh:0,burnoutLevel:15,
        shiftRpm:7600,suspensionTransferPct:60,cdA:.68,wheelbaseM:2.58,cgHeightM:.51},
      wear:{engine:5,turbo:3,transmission:4},damage:{engine:0,turbo:0,transmission:0},bank:50000,lastDyno:null,lastDynoSignature:'',lastDrag:null,
      dynoRuns:[],dragRuns:[],records:{FWD:null,RWD:null,AWD:null},achievements:{},buildSlots:[null,null,null],settings:{sound:false,haptics:true,reducedMotion:false},history:[]
    };
  }

  function getPart(state, categoryId) {
    const cat=CATEGORY_MAP[categoryId]; if(!cat) throw new Error(`Unknown category ${categoryId}`);
    return cat.items.find(x=>x.id===state.selections[categoryId]) || cat.items[0];
  }
  function normalizeState(input) {
    const base=blankState(); if(!input || typeof input!=='object') return base;
    const s={...base,...input};
    for(const k of ['selections','tune','assembly','service','vehicle','wear','damage','settings','dynoConfig','records','achievements']) s[k]={...base[k],...(input[k]||{})};
    s.bench={...base.bench,...(input.bench||{}),results:{...(base.bench.results||{}),...((input.bench||{}).results||{})}};
    s.dynoRuns=Array.isArray(input.dynoRuns)?input.dynoRuns.slice(0,20):[];
    s.dragRuns=Array.isArray(input.dragRuns)?input.dragRuns.slice(0,30):[];
    s.history=Array.isArray(input.history)?input.history.slice(0,60):[];
    s.version=5;
    for(const cat of CATEGORIES) if(!cat.items.some(x=>x.id===s.selections[cat.id])) s.selections[cat.id]=cat.items[0].id;
    if(!OIL_MAP[s.service.oilId]) s.service.oilId=base.service.oilId;
    if(!FILTER_MAP[s.service.filterId]) s.service.filterId=base.service.filterId;
    if(!TIRE_MAP[s.vehicle.tireCompound]) s.vehicle.tireCompound=base.vehicle.tireCompound;
    if(!DRIVETRAINS[s.vehicle.drivetrain]) s.vehicle.drivetrain=base.vehicle.drivetrain;
    return s;
  }

  function compactObject(obj, decimals=3) {
    const out={}; for(const [k,v] of Object.entries(obj||{})) out[k]=typeof v==='number'?round(v,decimals):v; return out;
  }
  function engineSignature(inputState) {
    const s=normalizeState(inputState), t=s.tune;
    return JSON.stringify({selections:s.selections,tune:{...compactObject(t,3),revLimitRpm:Math.round(t.revLimitRpm)},assembly:compactObject(s.assembly,3),
      oil:{id:s.service.oilId,liters:round(s.service.liters,2),filter:s.service.filterId},dyno:compactObject(s.dynoConfig,2)});
  }
  function benchSignature(inputState) {
    const s=normalizeState(inputState); return JSON.stringify({selections:s.selections,tune:{revLimitRpm:s.tune.revLimitRpm,railTargetBar:s.tune.railTargetBar,
      exhaustTdcLiftMm:s.tune.exhaustTdcLiftMm,intakeTdcLiftMm:s.tune.intakeTdcLiftMm,vvtEnabled:s.tune.vvtEnabled,
      boostHighBar:s.tune.boostHighBar,boostMidBar:s.tune.boostMidBar},assembly:compactObject(s.assembly,3),service:{oilId:s.service.oilId,liters:round(s.service.liters,2)},wear:s.wear,damage:s.damage});
  }
  function isDynoCurrent(state) { return !!(state.lastDyno && state.lastDynoSignature===engineSignature(state)); }

  function engineGeometry(inputState) {
    const s=normalizeState(inputState), block=getPart(s,'block');
    const boreMm=Number(block.boreMm||82.5),strokeMm=Number(block.strokeMm||92.8),cylinders=4;
    const displacementCc=Math.PI/4*boreMm*boreMm*strokeMm*cylinders/1000;
    return {boreMm,strokeMm,cylinders,displacementCc,displacementL:displacementCc/1000,compressionRatio:Number(block.compressionRatio||9.6)};
  }
  function camTimingHealth(inputState) {
    const s=normalizeState(inputState),head=getPart(s,'head');
    if(!Number.isFinite(head.targetExhaustTdcMm)||!Number.isFinite(head.targetIntakeTdcMm)) return {applicable:false,score:1,exhaustErrorMm:0,intakeErrorMm:0,targetExhaustTdcMm:null,targetIntakeTdcMm:null};
    const exhaustErrorMm=Math.abs(Number(s.tune.exhaustTdcLiftMm)-head.targetExhaustTdcMm),intakeErrorMm=Math.abs(Number(s.tune.intakeTdcLiftMm)-head.targetIntakeTdcMm);
    const score=clamp(1-(exhaustErrorMm/.23+intakeErrorMm/.14)*.28,.55,1);
    return {applicable:true,score,exhaustErrorMm,intakeErrorMm,targetExhaustTdcMm:head.targetExhaustTdcMm,targetIntakeTdcMm:head.targetIntakeTdcMm};
  }

  function assemblyTargets(inputState) {
    const s=normalizeState(inputState),g=engineGeometry(s),boost=Math.max(s.tune.boostLowBar,s.tune.boostMidBar,s.tune.boostHighBar),rev=s.tune.revLimitRpm;
    const top=clamp(.42+boost*.045+Math.max(0,g.boreMm-82.5)*.01,.42,.72);
    return {topRingGapMm:top,secondRingGapMm:top+.05,rodClearanceMm:clamp(.047+Math.max(0,rev-7200)/1000*.003+Math.max(0,boost-2)*.002,.045,.066),
      mainClearanceMm:clamp(.049+Math.max(0,rev-7200)/1000*.003,.047,.067),sparkGapMm:clamp(.73-boost*.075,.42,.70)};
  }
  function centeredScore(value,target,tolerance) { return clamp(1-Math.abs(value-target)/Math.max(.0001,tolerance),0,1); }
  function assemblyHealth(inputState) {
    const s=normalizeState(inputState),a=s.assembly,t=assemblyTargets(s);
    const top=centeredScore(a.topRingGapMm,t.topRingGapMm,.22),second=centeredScore(a.secondRingGapMm,t.secondRingGapMm,.24),rod=centeredScore(a.rodClearanceMm,t.rodClearanceMm,.027),main=centeredScore(a.mainClearanceMm,t.mainClearanceMm,.028),spark=centeredScore(a.sparkGapMm,t.sparkGapMm,.28);
    const ringTightRisk=clamp((t.topRingGapMm-a.topRingGapMm)/.16,0,1.5),ringWideRisk=clamp((a.topRingGapMm-t.topRingGapMm)/.30,0,1),bearingTightRisk=clamp((t.rodClearanceMm-a.rodClearanceMm)/.018,0,1.5),bearingLooseRisk=clamp((a.mainClearanceMm-t.mainClearanceMm)/.025,0,1.2);
    const procedure=(clamp(a.balanceQualityPct,0,100)+clamp(a.deckSealQualityPct,0,100)+clamp(a.fastenerProcedurePct,0,100))/300;
    const score=clamp((top*.16+second*.10+rod*.16+main*.16+spark*.12+procedure*.25+(a.oilPrimed?1:0)*.05),0,1);
    return {score,targets:t,ringScore:(top+second)/2,bearingScore:(rod+main)/2,sparkScore:spark,procedureScore:procedure,ringTightRisk,ringWideRisk,bearingTightRisk,bearingLooseRisk,oilPrimed:!!a.oilPrimed};
  }

  function runBenchTest(inputState,id) {
    const s=normalizeState(inputState),sig=benchSignature(s),rand=mulberry32(fnv1a(sig+'|'+id)),a=assemblyHealth(s),g=engineGeometry(s),cam=camTimingHealth(s);
    const wear=s.wear.engine*.08+s.damage.engine*.24;
    let score=100,status='pass',summary='',values=[];
    if(id==='oilPrime') {
      const pressure=Math.max(.2,1.05+a.bearingScore*1.25+(s.service.liters-4.1)*.28+(s.assembly.oilPrimed?.45:-1.10)-s.damage.engine*.015+(rand()-.5)*.12);
      score=clamp((pressure-0.5)/1.7*100,0,100); status=pressure>=1.4?'pass':pressure>=.9?'warn':'fail'; summary=`${pressure.toFixed(2)} bar bij gesimuleerd starttoerental`;
      values=[['Oliedruk',`${pressure.toFixed(2)} bar`],['Vulniveau',`${s.service.liters.toFixed(1)} L`],['Geprimed',s.assembly.oilPrimed?'ja':'nee']];
    } else if(id==='compression') {
      const base=11.2*(g.compressionRatio/9.6)*(0.97+a.ringScore*.03)-wear*.018; const cylinders=[];
      for(let i=0;i<4;i++) cylinders.push(Math.max(4,base+(rand()-.5)*.35-(i===0?s.damage.engine*.025:0)));
      const min=Math.min(...cylinders),max=Math.max(...cylinders),spread=(max-min)/max*100; score=clamp(100-spread*5-Math.max(0,9.5-min)*12,0,100); status=score>=80?'pass':score>=60?'warn':'fail'; summary=`spreiding ${spread.toFixed(1)}% over vier cilinders`; values=cylinders.map((v,i)=>[`Cilinder ${i+1}`,`${v.toFixed(1)} bar`]);
    } else if(id==='leakdown') {
      const base=3.0+(1-a.ringScore)*9+s.wear.engine*.10+s.damage.engine*.30+a.ringWideRisk*4; const cyl=[];
      for(let i=0;i<4;i++) cyl.push(Math.max(1,base+(rand()-.5)*2.0+(i===0?s.damage.engine*.05:0)));
      const avg=cyl.reduce((x,y)=>x+y,0)/4,max=Math.max(...cyl); score=clamp(105-avg*4-max*1.2,0,100); status=max<9?'pass':max<15?'warn':'fail'; summary=`gemiddeld ${avg.toFixed(1)}% verlies`; values=cyl.map((v,i)=>[`Cilinder ${i+1}`,`${v.toFixed(1)}%`]);
    } else if(id==='fuelFlow') {
      const fs=getPart(s,'fuelSystem'),fuel=getPart(s,'fuel'); const capacity=fs.fuelSystemHp*fuel.fuelFlowFactor; const demand=Math.max(220,getPart(s,'turbo').turboMaxHp*.72); const margin=(capacity-demand)/demand*100;
      const rail=Math.min(s.tune.railTargetBar,fs.maxRailBar)-Math.max(0,-margin)*.25; score=clamp(72+margin*.8,0,100); status=margin>=12?'pass':margin>=-5?'warn':'fail'; summary=`${margin>=0?'+':''}${margin.toFixed(0)}% theoretische flowmarge`; values=[['Capaciteit',`${Math.round(capacity)} pk-equivalent`],['Testvraag',`${Math.round(demand)} pk-equivalent`],['Rail',`${Math.round(rail)} bar`]];
    } else if(id==='camCheck') {
      score=Math.round(cam.score*100); status=!cam.applicable||score>=88?'pass':score>=72?'warn':'fail'; summary=cam.applicable?`${score}% match met de ingevoerde camdata`:'OEM timing zonder aparte overlap-doelwaarde'; values=[['Uitlaat TDC',`${s.tune.exhaustTdcLiftMm.toFixed(2)} mm`],['Inlaat TDC',`${s.tune.intakeTdcLiftMm.toFixed(2)} mm`],['VVT basis',s.tune.vvtEnabled?'aangesloten':'uitgeschakeld']];
    } else if(id==='sparkCheck') {
      const ign=getPart(s,'ignition'),target=a.targets.sparkGapMm,gap=s.assembly.sparkGapMm,boost=Math.max(s.tune.boostMidBar,s.tune.boostHighBar); const margin=ign.sparkBoostLimit-boost-(gap-target)*3.2; score=clamp(72+margin*18-a.ringTightRisk*2,0,100); status=score>=80?'pass':score>=58?'warn':'fail'; summary=`bougiegap ${gap.toFixed(2)} mm · berekende boostmarge ${margin.toFixed(2)} bar`; values=[['Doelgebied',`rond ${target.toFixed(2)} mm`],['Ingesteld',`${gap.toFixed(2)} mm`],['Bobines',getPart(s,'ignition').name]];
    } else throw new Error(`Unknown bench test ${id}`);
    return {id,signature:sig,measuredAt:new Date().toISOString(),score:Math.round(score),status,summary,values};
  }
  function benchConfidence(inputState) {
    const s=normalizeState(inputState),sig=benchSignature(s),results=s.bench.results||{}; let current=0,score=0,failed=0;
    for(const test of BENCH_TESTS){const r=results[test.id];if(r&&r.signature===sig){current++;score+=r.score;if(r.status==='fail')failed++;}}
    return {current,total:BENCH_TESTS.length,score:current?Math.round(score/current):0,failed,complete:current===BENCH_TESTS.length};
  }

  function tireGeometry(vehicle) {
    const rimMm=Number(vehicle.rimDiameterIn)*25.4,sidewallMm=Number(vehicle.tireWidthMm)*Number(vehicle.aspectRatio)/100,diameterMm=rimMm+2*sidewallMm,circumferenceM=Math.PI*diameterMm/1000;
    return {rimMm,sidewallMm,diameterMm,circumferenceM,radiusM:diameterMm/2000,revPerKm:1000/circumferenceM};
  }
  function wheelFitment(vehicle) {
    const g=tireGeometry(vehicle),rimWidthMm=Number(vehicle.rimWidthIn)*25.4,sectionRatio=Number(vehicle.tireWidthMm)/Math.max(1,rimWidthMm),diameterDeltaPct=(g.diameterMm-654.1)/654.1*100,warnings=[];
    if(sectionRatio<1.02) warnings.push('Band is sterk getrokken voor deze velgbreedte.'); if(sectionRatio>1.42) warnings.push('Band is erg breed/bol voor deze velgbreedte.');
    if(Math.abs(diameterDeltaPct)>4.5) warnings.push('Buitendiameter wijkt meer dan 4,5% af van de referentie.'); if(Number(vehicle.rimDiameterIn)>=20&&Number(vehicle.aspectRatio)<=30) warnings.push('Zeer kleine wang: minder launch-compliance en meer velgrisico.');
    const score=clamp(1-Math.max(0,1.04-sectionRatio)*1.3-Math.max(0,sectionRatio-1.38)*.9-Math.max(0,Math.abs(diameterDeltaPct)-3)*.015,.72,1);
    return {...g,rimWidthMm,sectionRatio,diameterDeltaPct,warnings,score};
  }
  function requestedBoostAt(tune,rpm,revLimit) { if(rpm<=3200)return lerp(tune.boostLowBar*.55,tune.boostLowBar,clamp((rpm-1500)/1700,0,1)); if(rpm<=5200)return lerp(tune.boostLowBar,tune.boostMidBar,(rpm-3200)/2000); return lerp(tune.boostMidBar,tune.boostHighBar,clamp((rpm-5200)/Math.max(700,revLimit-5200),0,1)); }
  function oilHealth(state) { return clamp(1-Math.max(0,Number(state.service.oilAgeKm)||0)/18000-Math.max(0,Number(state.service.oilRuns)||0)*.006,.50,1); }
  function calculateOilPressure(rpm,oilTemp,state,oiling,oil,filter,assembly=null) {
    const liters=Number(state.service.liters),levelFactor=liters<4.1?clamp(.55+(liters-3.5)*.75,.42,1):liters>5.0?clamp(1-(liters-5.0)*.18,.82,1):1,tempVisc=clamp(1.22-Math.max(0,oilTemp-90)*.0082,.48,1.22),pump=1.15+rpm/1000*.67;
    const clearance=assembly?clamp(.78+assembly.bearingScore*.22-assembly.bearingLooseRisk*.15,.62,1.04):1;
    return Math.max(.45,pump*oil.hotViscosity*tempVisc*(.72+oiling.oilControl*.33)*filter.flow*levelFactor*oilHealth(state)*clearance);
  }
  function minPositive(...values){return Math.min(...values.filter(v=>Number.isFinite(v)&&v>0));}
  function addWarning(list,condition,text,severity='warn',system='algemeen'){if(condition)list.push({text,severity,system});}

  function criticalFailure(point,ctx) {
    const {tune,mechanicalHpLimit,componentTorqueLimit,componentRpmLimit,sealing,turbo,ignition,oiling,ecu,oilFilm,assembly,boostControl,sensors}=ctx;
    if(point.hp>mechanicalHpLimit*1.18)return'Onderblok/krukas overschreed de mechanische vermogensmarge.';
    if(point.torqueNm>componentTorqueLimit*1.18)return'Koppelpiek overschreed de grens van motor of transmissie.';
    if(point.rpm>componentRpmLimit*1.04)return'Valve-float of mechanische over-rev.';
    if(point.bmepBar>sealing.headClampBmep*1.15)return'Head-lift: cilinderdruk overschreed de sealingmarge.';
    if(point.fuelDutyPct>113&&!tune.railPressureCut)return'Brandstofsysteem liep leeg: lean-out onder boost.';
    if(point.turboLoadPct>122&&!tune.overboostCut)return'Turbo overspeed / compressor buiten kaart.';
    if(point.knockRisk>1.35||(point.knockRisk>1.05&&!tune.knockControl))return'Zware knock/detonatie.';
    if(point.boostBar>ignition.sparkBoostLimit*1.22&&ignition.sparkQuality<1.01)return'Ontstekingsuitval onder hoge cilinderdruk.';
    if(point.oilPressureBar<1.75&&point.rpm>5000&&!tune.oilPressureProtection)return'Lagerfalen door te lage oliedruk.';
    if(point.oilFilmRisk>1.75||oilFilm<.48)return'Oliefilm brak af onder lager- en zuigerbelasting.';
    if(point.oilTempC>164&&oiling.oilCooling<.6)return'Olie oververhit; lager- en turboschade.';
    if(ecu.safetyQuality*sensors.sensorQuality<.42&&point.boostBar>2.4&&point.rpm>6500)return'ECU/sensorstrategie kon de extreme hardware niet beheersen.';
    if(assembly.ringTightRisk>1.05&&point.bmepBar>32)return'Zuigerring-einden liepen dicht onder temperatuur en cilinderdruk.';
    if(assembly.bearingTightRisk>1.05&&point.oilTempC>135&&point.rpm>7000)return'Lagerclearance werd te krap bij temperatuur en toerental.';
    if(!assembly.oilPrimed&&point.rpm>3500)return'Motor werd belast zonder geldige oliedruk-prime.';
    if(point.boostBar>boostControl.boostHardwareMaxBar*1.28&&!tune.overboostCut)return'Wastegate/boostregeling verloor controle.';
    return'';
  }

  function simulateEngine(inputState,options={}) {
    const state=normalizeState(inputState),block=getPart(state,'block'),crank=getPart(state,'crank'),oiling=getPart(state,'oiling'),crankcase=getPart(state,'crankcase'),head=getPart(state,'head'),valve=getPart(state,'valvetrain'),turbo=getPart(state,'turbo'),boostControl=getPart(state,'boostControl'),air=getPart(state,'air'),manifold=getPart(state,'manifold'),fuelSystem=getPart(state,'fuelSystem'),fuel=getPart(state,'fuel'),exhaust=getPart(state,'exhaust'),ecu=getPart(state,'ecu'),sensors=getPart(state,'sensors'),ignition=getPart(state,'ignition'),sealing=getPart(state,'sealing'),trans=getPart(state,'transmission'),spoolAssist=getPart(state,'spool'),oil=OIL_MAP[state.service.oilId],filter=FILTER_MAP[state.service.filterId],tune=state.tune,geometry=engineGeometry(state),camTiming=camTimingHealth(state),assembly=assemblyHealth(state);
    const revLimit=clamp(Math.round(tune.revLimitRpm/100)*100,5000,10000),effectiveFuelCapacity=fuelSystem.fuelSystemHp*fuel.fuelFlowFactor;
    const mechanicalHpLimit=minPositive(block.hpLimit,crank.hpLimit,oiling.hpLimit,head.hpLimit,valve.hpLimit,ecu.hpLimit),componentTorqueLimit=minPositive(block.torqueLimit,crank.torqueLimit,oiling.torqueLimit,head.torqueLimit,valve.torqueLimit,ecu.torqueLimit,trans.transTorque),componentRpmLimit=minPositive(block.rpmLimit,crank.rpmLimit,oiling.rpmLimit,head.rpmLimit,valve.rpmLimit,ecu.rpmLimit);
    const wearTotal=state.wear.engine*.72+state.wear.turbo*.18+state.damage.engine*.9+state.damage.turbo*.35,wearFactor=1-clamp(wearTotal/230,0,.32),health=oilHealth(state),oilLevel=Number(state.service.liters),levelFilm=oilLevel<4?clamp(.45+(oilLevel-3.4)*.9,.35,1):oilLevel>5.15?.93:1;
    const oilFilm=oil.film*health*levelFilm*(.80+oiling.oilControl*.20)*(.86+crankcase.crankcaseControl*.14),curve=[];
    let peakHp=0,peakHpRpm=0,peakTorqueNm=0,peakTorqueRpm=0,maxBmepBar=0,maxMeanPistonSpeed=0,maxFuelDuty=0,maxTurboLoad=0,maxTurboShaftRpm=0,maxEmpBar=0,maxIatC=0,maxEgtC=0,maxOilTempC=0,maxKnockRisk=0,maxOilAerationPct=0,minOilPressureBar=99,failureRpm=0,failureReason='';
    const rand=mulberry32(fnv1a(engineSignature(state))),measurementNoise=options.noise===false?0:sensors.measurementNoise,baseDynoFactor=options.noise===false?1:1+(rand()-.5)*measurementNoise;
    const ambient=Number(state.dynoConfig.ambientTempC||20),baro=Number(state.dynoConfig.baroKpa||101.3),airDensityFactor=clamp((baro/101.3)*(293.15/(ambient+273.15)),.74,1.10),ramp=clamp(Number(state.dynoConfig.rampRpmPerSec||550),250,1000),fan=clamp(Number(state.dynoConfig.fanSpeedPct||85)/100,.25,1),heatSoak=clamp(650/ramp,.72,1.35);
    for(let rpm=1500;rpm<=revLimit;rpm+=100){
      const desired=requestedBoostAt(tune,rpm,revLimit),effectiveSpool=Math.max(1300,turbo.turboSpoolRpm-spoolAssist.spoolShiftRpm),spoolWidth=Math.max(250,360+(turbo.turboSpoolRpm-2000)*.092),spool=1/(1+Math.exp(-(rpm-effectiveSpool)/spoolWidth));
      const controlRipple=(1-boostControl.boostControlQuality)*(.04*Math.sin(rpm/285)+.025*(rand()-.5)),hardwareLimit=boostControl.boostHardwareMaxBar,requestedRatio=desired/Math.max(.15,hardwareLimit);
      let actualBoost=desired*spool*(1+controlRipple); if(tune.overboostCut&&requestedRatio>1.03)actualBoost=Math.min(actualBoost,hardwareLimit*1.04); else if(requestedRatio>1)actualBoost*=1+Math.min(.18,(requestedRatio-1)*.16);
      actualBoost=Math.max(0,actualBoost);
      const x=(rpm-4300)/2700,naTorque=clamp(184-30*x*x,108,186),rpmBlend=clamp((rpm-3800)/2800,0,1),camShape=lerp(head.lowRpmMultiplier,head.highRpmMultiplier,rpmBlend)*lerp(manifold.lowRpmMultiplier,manifold.highRpmMultiplier,rpmBlend);
      let camAdvanceEffect=1,commandedAdvance=tune.vvtEnabled===false?0:tune.intakeCamAdvanceDeg;if(rpm<4500)camAdvanceEffect+=(commandedAdvance-15)*.0015;if(rpm>6200)camAdvanceEffect-=Math.max(0,commandedAdvance-10)*.0018;
      const camTimingShape=camTiming.applicable?camTiming.score*(rpm<3600?.985+(1-camTiming.score)*.03:1):1,pressureMultiplier=(1+actualBoost)*.97,intakeFlowFactor=1+(air.flow-1)*.80+(manifold.intakeFlow-1)*.86,exhaustFlowFactor=1+(exhaust.exhaustFlow-1)*.75,turboPowerFactor=.98+(turbo.turboEfficiency-.84)*.40;
      const breathing=head.powerMultiplier*head.headFlow*camShape*intakeFlowFactor*exhaustFlowFactor*camTimingShape,ringSeal=.94+assembly.ringScore*.06-assembly.ringWideRisk*.025,assemblyPower=.965+assembly.score*.035;
      let spark=ignition.sparkQuality*(.91+assembly.sparkScore*.09);if(actualBoost>ignition.sparkBoostLimit)spark*=clamp(1-(actualBoost-ignition.sparkBoostLimit)*.10,.70,1);
      let torque=naTorque*pressureMultiplier*breathing*turboPowerFactor*camAdvanceEffect*spark*wearFactor*ringSeal*assemblyPower*(.997+(crankcase.vacuumKpa<0?.012:0));
      if(spoolAssist.nitrousHp>0){const taper=clamp((.93-spool)/.58,0,1)*clamp((revLimit-rpm+800)/2200,0,1);torque+=spoolAssist.nitrousHp*7127/Math.max(2600,rpm)*taper;}
      let rawHp=torque*rpm/7127,flowRamp=.58+.42*clamp((rpm-effectiveSpool+900)/2600,0,1),turboFlowCap=turbo.turboMaxHp*flowRamp*clamp(.90+airDensityFactor*.10,.96,1.02),totalFlowCap=Math.min(turboFlowCap,effectiveFuelCapacity)*(.985+(air.flow-1)*.20+(manifold.intakeFlow-1)*.16)*baseDynoFactor/oil.drag;
      if(rawHp>totalFlowCap){torque*=totalFlowCap/rawHp;rawHp=totalFlowCap;}else{torque*=baseDynoFactor/oil.drag;rawHp=torque*rpm/7127;}
      let fuelDutyPct=rawHp/Math.max(1,effectiveFuelCapacity)*100,railDrop=Math.max(0,fuelDutyPct-88)*1.15+Math.max(0,tune.railTargetBar-fuelSystem.maxRailBar),railBar=Math.max(35,Math.min(tune.railTargetBar,fuelSystem.maxRailBar)-railDrop);
      if(fuelDutyPct>100&&tune.railPressureCut){const cut=clamp((112-fuelDutyPct)/12,.52,1);torque*=cut;rawHp=torque*rpm/7127;fuelDutyPct=rawHp/Math.max(1,effectiveFuelCapacity)*100;}
      let actualLambda=tune.lambda+Math.max(0,fuelDutyPct-94)*.0035+Math.max(0,tune.railTargetBar-railBar)*.0009;if(tune.lambda<.70){const richLoss=clamp((.70-tune.lambda)*2.8,0,.10);torque*=1-richLoss;rawHp=torque*rpm/7127;}
      const turboLoadPct=Math.max(rawHp/Math.max(1,turbo.turboMaxHp),desired/Math.max(.1,turbo.turboMaxBoost),desired/Math.max(.1,hardwareLimit)*.94)*100/Math.max(.80,airDensityFactor),shaftLimit=turbo.shaftSpeedLimitRpm||clamp(250000-(turbo.compressorMm||45)*900,108000,207000),turboShaftRpm=shaftLimit*clamp(.34+turboLoadPct/145,.30,1.34),empBar=actualBoost*(1.05+turboLoadPct/185+Math.max(0,1/exhaust.exhaustFlow-1)*1.6);
      const compressorRise=actualBoost*50/Math.max(.70,turbo.turboEfficiency),iatC=ambient+2+compressorRise*(1-air.cooling)*(1-fuel.fuelCooling)*(1.18-.48*fan)*heatSoak+Math.max(0,rawHp-500)*.008+spoolAssist.spoolHeat*22,oilVaporOctaneLoss=crankcase.oilVaporPenalty*35;
      let effectiveOctane=fuel.octane-oilVaporOctaneLoss;if(state.selections.air==='wmi'&&tune.methFailsafe)effectiveOctane+=1.5;
      const requiredOctane=90.8+actualBoost*4.8+Math.max(0,iatC-35)*.075+Math.max(0,tune.ignitionTrimDeg)*1.45+Math.max(0,actualLambda-.84)*80+spoolAssist.nitrousHp*.012+(camTiming.applicable?(1-camTiming.score)*8.5:0),effectiveSafety=ecu.safetyQuality*(.78+sensors.sensorQuality*.22);
      let knockRisk=clamp((requiredOctane-effectiveOctane+3)/7,0,1.8);if(tune.knockControl)knockRisk*=.76+(1-effectiveSafety)*.29;
      const egtC=715+actualBoost*66+Math.max(0,actualLambda-.80)*650+Math.max(0,-tune.ignitionTrimDeg)*13+Math.max(0,turboLoadPct-90)*1.3+spoolAssist.spoolHeat*145,bmepBar=torque*4*Math.PI/(geometry.displacementL/1000)/100000,meanPistonSpeed=2*(geometry.strokeMm/1000)*rpm/60;
      const oilTempC=88+rawHp*(.108-oiling.oilCooling*.067)*heatSoak+Math.max(0,meanPistonSpeed-22)*1.8+spoolAssist.spoolHeat*16+Math.max(0,oil.drag-1)*90-Math.max(0,rawHp-700)*oiling.oilCooling*.028,oilPressureBar=calculateOilPressure(rpm,oilTempC,state,oiling,oil,filter,assembly),oilAerationPct=clamp(Math.max(0,oilLevel-5)*22+Math.max(0,rpm-7800)*.0045+(1-oiling.oilControl)*9+(1-crankcase.crankcaseControl)*6,0,55),loadFilmNeed=.48+bmepBar/58+Math.max(0,oilTempC-oil.tempTolerance)*.018+oilAerationPct*.006,oilFilmRisk=loadFilmNeed/Math.max(.25,oilFilm*(.80+oilPressureBar/12));
      const point={rpm,hp:rawHp,torqueNm:torque,boostBar:actualBoost,lambda:actualLambda,lambdaTarget:tune.lambda,iatC,egtC,railBar,fuelDutyPct,turboLoadPct,turboShaftRpm,shaftLimitRpm:shaftLimit,empBar,bmepBar,meanPistonSpeed,knockRisk,oilTempC,oilPressureBar,oilFilmRisk,oilAerationPct,spoolPct:spool*100,airflowLbMin:rawHp/9.55};curve.push(point);
      if(rawHp>peakHp){peakHp=rawHp;peakHpRpm=rpm;}if(torque>peakTorqueNm){peakTorqueNm=torque;peakTorqueRpm=rpm;}maxBmepBar=Math.max(maxBmepBar,bmepBar);maxMeanPistonSpeed=Math.max(maxMeanPistonSpeed,meanPistonSpeed);maxFuelDuty=Math.max(maxFuelDuty,fuelDutyPct);maxTurboLoad=Math.max(maxTurboLoad,turboLoadPct);maxTurboShaftRpm=Math.max(maxTurboShaftRpm,turboShaftRpm);maxEmpBar=Math.max(maxEmpBar,empBar);maxIatC=Math.max(maxIatC,iatC);maxEgtC=Math.max(maxEgtC,egtC);maxOilTempC=Math.max(maxOilTempC,oilTempC);maxKnockRisk=Math.max(maxKnockRisk,knockRisk);maxOilAerationPct=Math.max(maxOilAerationPct,oilAerationPct);if(rpm>=4000)minOilPressureBar=Math.min(minOilPressureBar,oilPressureBar);
      if(!failureRpm){const reason=criticalFailure(point,{tune,mechanicalHpLimit,componentTorqueLimit,componentRpmLimit,sealing,turbo,ignition,oiling,ecu,oilFilm,assembly,boostControl,sensors});if(reason){failureRpm=rpm;failureReason=reason;}}
    }
    const hpRatio=peakHp/mechanicalHpLimit,tqRatio=peakTorqueNm/componentTorqueLimit,rpmRatio=revLimit/componentRpmLimit,clampRatio=maxBmepBar/sealing.headClampBmep,fuelRatio=maxFuelDuty/100,turboRatio=maxTurboLoad/100,mpsRatio=maxMeanPistonSpeed/25,oilTempRatio=maxOilTempC/oil.tempTolerance,oilPressureRisk=clamp((2.8-minOilPressureBar)/1.8,0,1.5),oilFilmRatio=1/Math.max(.35,oilFilm),shaftRatio=maxTurboShaftRpm/(curve[0]?.shaftLimitRpm||150000),warnings=[];
    addWarning(warnings,hpRatio>.92,'Vermogensmarge van onderblok/krukas is klein.','warn','mechanisch');addWarning(warnings,tqRatio>.92,'Koppelpiek zit dicht bij de mechanische of transmissiegrens; bouw boost later op.','warn','mechanisch');addWarning(warnings,rpmRatio>.94,'Toerental zit dicht bij de laagste rpm-grens van blok, krukas, olie of kleppentrein.','warn','kleppentrein');addWarning(warnings,clampRatio>.90,'BMEP nadert de klemkracht van koppakking/studs: head-lift risico.','warn','sealing');
    addWarning(warnings,maxFuelDuty>88,`Brandstof duty ${Math.round(maxFuelDuty)}%: controleer injector/pomp en raildruk.`,'warn','brandstof');addWarning(warnings,maxTurboLoad>93,`Turbo load ${Math.round(maxTurboLoad)}%: turbospeed en uitlaatdruk raken de grens.`,'warn','turbo');addWarning(warnings,shaftRatio>1,`Geschatte turbospeed ${Math.round(maxTurboShaftRpm/1000)}k rpm overschrijdt de gemodelleerde asgrens.`,'danger','turbo');addWarning(warnings,maxEmpBar>4.5,`Hoge uitlaatspruitstukdruk ${maxEmpBar.toFixed(1)} bar belast turbine, kleppen en ringseal.`,'warn','uitlaat');
    addWarning(warnings,maxIatC>55,`Hoge IAT ${Math.round(maxIatC)}°C: knockmarge en herhaalbaarheid nemen af.`,'warn','temperatuur');addWarning(warnings,maxEgtC>925,`Hoge EGT ${Math.round(maxEgtC)}°C: turbine, kleppen en spruitstuk worden zwaar belast.`,'warn','temperatuur');addWarning(warnings,maxOilTempC>oil.tempTolerance,`Olietemperatuur ${Math.round(maxOilTempC)}°C overschrijdt de comfortabele zone van ${oil.name}.`,'warn','olie');addWarning(warnings,minOilPressureBar<2.5,`Minimale berekende oliedruk ${minOilPressureBar.toFixed(1)} bar: niveau, viscositeit en pickup controleren.`,'warn','olie');addWarning(warnings,maxOilAerationPct>18,`Geschatte olie-aeratie ${Math.round(maxOilAerationPct)}%: vulniveau, cartercontrole en carterventilatie controleren.`,'warn','olie');
    addWarning(warnings,maxMeanPistonSpeed>25,`Gemiddelde zuigersnelheid ${maxMeanPistonSpeed.toFixed(1)} m/s is racegebied.`,'warn','mechanisch');addWarning(warnings,state.service.liters<4.1,`Oliepeil ${state.service.liters.toFixed(1)} L is te laag voor harde pulls.`,'danger','olie');addWarning(warnings,state.service.liters>5.1,`Oliepeil ${state.service.liters.toFixed(1)} L kan windage/schuim veroorzaken.`,'warn','olie');addWarning(warnings,health<.70,`Olieconditie is nog circa ${Math.round(health*100)}%; verversen verkleint het risico.`,'warn','olie');
    addWarning(warnings,state.selections.air==='wmi'&&!tune.methFailsafe,'WMI zonder meth-failsafe kan bij flowverlies direct zware knock veroorzaken.','danger','beveiliging');addWarning(warnings,!tune.railPressureCut&&maxFuelDuty>92,'Raildrukbeveiliging staat uit terwijl het brandstofsysteem bijna verzadigd is.','danger','beveiliging');addWarning(warnings,!tune.oilPressureProtection&&revLimit>7600,'Oliedrukbeveiliging staat uit bij hoog toerental.','danger','beveiliging');addWarning(warnings,turbo.compressorMm>=94&&spoolAssist.id==='none',`${turbo.compressorMm}-mm turbo zonder spool assistance heeft op 2,0 liter een zeer smalle bruikbare powerband.`,'warn','turbo');addWarning(warnings,spoolAssist.spoolHeat>.3,'Agressieve anti-lag/nitrous-spool verhoogt EGT en verkort de levensduur.','warn','turbo');
    addWarning(warnings,assembly.ringTightRisk>.55,'Topring-gap is in het model krap voor de gekozen boost/temperatuur; ring-butting risico.','danger','montage');addWarning(warnings,assembly.bearingTightRisk>.55,'Drijfstanglagerclearance is in het model krap voor toerental en olietemperatuur.','danger','montage');addWarning(warnings,assembly.bearingLooseRisk>.55,'Hoofdlagerclearance is ruim; warme oliedruk kan dalen.','warn','montage');addWarning(warnings,!assembly.oilPrimed,'Oliesysteem is niet als geprimed gemarkeerd.','danger','montage');
    if(camTiming.applicable){addWarning(warnings,camTiming.exhaustErrorMm>.10,`Uitlaatnok wijkt ${camTiming.exhaustErrorMm.toFixed(2)} mm af van ${camTiming.targetExhaustTdcMm.toFixed(2)} mm @ overlap-TDC.`,camTiming.exhaustErrorMm>.24?'danger':'warn','nokken');addWarning(warnings,camTiming.intakeErrorMm>.07,`Inlaatnok wijkt ${camTiming.intakeErrorMm.toFixed(2)} mm af van ${camTiming.targetIntakeTdcMm.toFixed(2)} mm @ overlap-TDC.`,camTiming.intakeErrorMm>.17?'danger':'warn','nokken');}
    const riskOver=(value,start,full)=>clamp((value-start)/(full-start),0,1.35);let risk=0;risk+=riskOver(hpRatio,.78,1.18)*22+riskOver(tqRatio,.78,1.18)*24+riskOver(rpmRatio,.82,1.12)*19+riskOver(clampRatio,.75,1.20)*18+riskOver(fuelRatio,.78,1.12)*20+riskOver(turboRatio,.78,1.15)*18+riskOver(shaftRatio,.82,1.16)*16+riskOver(maxIatC/70,.62,1.20)*10+riskOver(maxEgtC/980,.75,1.12)*12+riskOver(oilTempRatio,.82,1.18)*14+riskOver(mpsRatio,.82,1.13)*10+maxKnockRisk*24+oilPressureRisk*18+riskOver(oilFilmRatio,.86,1.65)*15;
    risk+=state.wear.engine*.22+state.wear.turbo*.08+state.damage.engine*.7+spoolAssist.wearFactor*16+(1-assembly.score)*30+assembly.ringTightRisk*12+assembly.bearingTightRisk*10+assembly.bearingLooseRisk*5;if(camTiming.applicable)risk+=(1-camTiming.score)*26;risk-=(block.reliabilityBonus+crank.reliabilityBonus+oiling.reliabilityBonus+crankcase.reliabilityBonus+valve.reliabilityBonus+ecu.reliabilityBonus+sensors.reliabilityBonus+sealing.reliabilityBonus)*.62;risk-=ecu.safetyQuality*sensors.sensorQuality*5;if(!tune.knockControl)risk+=8;if(!tune.lambdaProtection)risk+=5;if(!tune.overboostCut)risk+=4;if(failureRpm)risk+=45;
    const reliabilityScore=Math.round(clamp(100-risk,0,100)),status=failureRpm?'AFGEBROKEN':reliabilityScore>=82?'VEILIG':reliabilityScore>=65?'STRAKKE MARGE':reliabilityScore>=43?'RISICOVOL':'BREUKGEVAAR',ratios=[['Onderblok/krukas',hpRatio],['Koppel/transmissie',tqRatio],['Toerental/kleppentrein',rpmRatio],['Koppakking/head-lift',clampRatio],['Brandstofcapaciteit',fuelRatio],['Turbo-airflow/turbospeed',Math.max(turboRatio,shaftRatio)],['Olie/lagers',Math.max(oilTempRatio,oilPressureRisk,oilFilmRatio*.72)],['Montageclearances',1+(1-assembly.score)*.7],['Nokkenastiming',camTiming.applicable?1+(1-camTiming.score)*.72:0]];ratios.sort((a,b)=>b[1]-a[1]);
    const bottleneck=`${ratios[0][0]}: ${ratios[0][1].toFixed(2)}× van de richtgrens`,safePowerLimitHp=Math.min(mechanicalHpLimit*.88,effectiveFuelCapacity*.88,turbo.turboMaxHp*.90),wearPerDynoPull=clamp(.10+Math.max(0,78-reliabilityScore)*.025+spoolAssist.wearFactor*.8+(failureRpm?7:0),.08,12),estimatedAirflowLbMin=peakHp/9.55,airDensityKgM3=1.204*airDensityFactor;
    return {modelVersion:'4.0',curve,peakHp,peakHpRpm,peakTorqueNm,peakTorqueRpm,reliabilityScore,status,bottleneck,warnings,failureRpm,failureReason,wearPerDynoPull,safePowerLimitHp,maxBmepBar,maxMeanPistonSpeed,maxFuelDuty,maxTurboLoad,maxTurboShaftRpm,maxEmpBar,maxIatC,maxEgtC,maxOilTempC,minOilPressureBar,maxKnockRisk,maxOilAerationPct,estimatedAirflowLbMin,oilHealth:health,oilFilm,turboName:turbo.name,compressorMm:turbo.compressorMm,displacementCc:geometry.displacementCc,boreMm:geometry.boreMm,strokeMm:geometry.strokeMm,compressionRatio:geometry.compressionRatio,camTiming,assembly,benchConfidence:benchConfidence(state),airDensityKgM3,dynoConfig:deepClone(state.dynoConfig),measuredAt:new Date().toISOString()};
  }

  function interpolateCurve(curve,rpm){if(!curve||!curve.length)return null;if(rpm<=curve[0].rpm)return curve[0];for(let i=1;i<curve.length;i++){const b=curve[i],a=curve[i-1];if(rpm<=b.rpm){const f=(rpm-a.rpm)/(b.rpm-a.rpm),out={};for(const k of Object.keys(a))out[k]=typeof a[k]==='number'?lerp(a[k],b[k],f):a[k];return out;}}return curve[curve.length-1];}
  function airDensity(vehicle){const tempK=Number(vehicle.ambientTempC||20)+273.15,alt=Math.max(-200,Number(vehicle.altitudeM||0)),humidity=clamp(Number(vehicle.humidityPct||50)/100,0,1),pressurePa=101325*Math.exp(-alt/8434.5),dry=pressurePa/(287.05*tempK),humidFactor=1-humidity*.012;return dry*humidFactor;}
  function densityAltitude(vehicle){const rho=airDensity(vehicle),rho0=1.225;return 44330*(1-Math.pow(rho/rho0,.234969));}
  function gripFactor(vehicle){const tire=TIRE_MAP[vehicle.tireCompound],geometry=wheelFitment(vehicle),optimum=tire.optimumBar,pressurePenalty=clamp(1-Math.abs(vehicle.pressureBar-optimum)*.14,.72,1),widthFactor=clamp(.88+(vehicle.tireWidthMm-195)/420,.84,1.18),sidewallRatio=geometry.sidewallMm/Math.max(1,vehicle.tireWidthMm),sidewallFactor=tire.id.includes('drag')||tire.id==='slick'?clamp(.87+sidewallRatio*.38,.88,1.10):clamp(1.03-Math.max(0,sidewallRatio-.45)*.14,.94,1.04),prep=vehicle.preparedTrack?(tire.id==='street'?1.04:1.13):(tire.id==='slick'||tire.id==='pro_radial'?.88:1),burn=clamp(Number(vehicle.burnoutLevel||0),0,100),tireTemp=Number(vehicle.trackTempC||25)+burn*(tire.id==='street'?.28:tire.id==='uhp'?.42:tire.id==='semislick'?.55:.72),target=tire.id==='street'?38:tire.id==='uhp'?52:tire.id==='semislick'?68:82,tempFactor=clamp(1-Math.abs(tireTemp-target)/(tire.id==='street'?75:105),.75,1.06);return{mu:tire.mu*pressurePenalty*widthFactor*sidewallFactor*prep*geometry.score*tempFactor,tire,geometry,pressurePenalty,widthFactor,sidewallFactor,prep,fitmentScore:geometry.score,tireTempC:tireTemp,tempFactor};}

  function simulateDrag(inputState,dynoResult,config={}){
    const state=normalizeState(inputState),dyno=dynoResult||state.lastDyno;if(!dyno||!dyno.curve||!dyno.curve.length)throw new Error('Een geldige dynometing is vereist.');if(dyno.failureRpm)throw new Error('De dynorun eindigde met motorschade; eerst herstellen en opnieuw meten.');
    const vehicle=state.vehicle,drive=DRIVETRAINS[vehicle.drivetrain],trans=getPart(state,'transmission'),grip=gripFactor(vehicle),wheelMassPenalty=Math.max(0,vehicle.wheelMassKg-7.5)*4*1.35,mass=Math.max(750,vehicle.massKg+drive.mass+trans.massDeltaKg+wheelMassPenalty),radius=grip.geometry.radiusM,gears=trans.gearRatios,finalDrive=trans.finalDrive,launchRpm=clamp(state.tune.launchRpm,2200,state.tune.revLimitRpm-500),revLimit=state.tune.revLimitRpm,shiftRpm=clamp(Number(vehicle.shiftRpm||revLimit),Math.max(4500,launchRpm+500),revLimit),dt=.006,target=402.336,rho=airDensity(vehicle),dynoRho=dyno.airDensityKgM3||1.204,airPowerFactor=clamp(Math.pow(rho/dynoRho,.35),.86,1.05),cdA=vehicle.cdA||.68,g=9.80665,wheelbase=vehicle.wheelbaseM||2.58,cg=vehicle.cgHeightM||.51,transEff=trans.transEfficiency*(1-drive.loss*.34),headwind=Math.max(-20,Number(vehicle.headwindKmh||0))/3.6,transferScale=clamp(.55+Number(vehicle.suspensionTransferPct||60)/100*.85,.55,1.40);
    let t=0,x=0,v=0,aPrev=0,gear=0,shiftRemaining=0,wheelspinIntegral=0,tractionIntegral=0,shifts=0,rpm=launchRpm;const milestones={m18:null,m100:null,m201:null,m305:null,m402:null,zero100:null},trace=[];let traceClock=0;
    const gearBoost=gi=>gi===0?state.tune.firstGearBoostPct/100:gi===1?state.tune.secondGearBoostPct/100:1;
    while(t<25&&x<target){const ratio=gears[Math.min(gear,gears.length-1)]*finalDrive,wheelRpmEngine=v/Math.max(.05,2*Math.PI*radius)*60*ratio,clutchSlip=gear===0&&wheelRpmEngine<launchRpm;rpm=clutchSlip?launchRpm:Math.max(1500,wheelRpmEngine);if(rpm>=shiftRpm&&gear<gears.length-1&&shiftRemaining<=0){gear++;shifts++;shiftRemaining=trans.shiftSeconds;rpm=Math.max(1800,v/(2*Math.PI*radius)*60*gears[gear]*finalDrive);}let driveForce=0,demandForce=0;if(shiftRemaining>0)shiftRemaining-=dt;else{const point=interpolateCurve(dyno.curve,rpm),naBase=clamp(178-Math.max(0,rpm-5000)*.006,120,180),boostScale=gearBoost(gear),torqueEngine=Math.max(0,(naBase+(point.torqueNm-naBase)*boostScale)*airPowerFactor);demandForce=torqueEngine*gears[gear]*finalDrive*transEff/Math.max(.20,radius);const transfer=mass*Math.max(-2,aPrev)*cg/wheelbase*transferScale;let drivenNormal;if(vehicle.drivetrain==='FWD')drivenNormal=drive.frontStatic*mass*g-transfer;else if(vehicle.drivetrain==='RWD')drivenNormal=(1-drive.frontStatic)*mass*g+transfer;else drivenNormal=mass*g*drive.tractionUse;drivenNormal=clamp(drivenNormal,mass*g*.18,mass*g);const speedGrip=v<8?1:clamp(1-(v-8)*.0016,.90,1),tireForce=grip.mu*drivenNormal*speedGrip;driveForce=Math.min(demandForce,tireForce);const spin=demandForce>tireForce?(demandForce-tireForce)/Math.max(1,demandForce):0;wheelspinIntegral+=spin*dt;tractionIntegral+=dt;}const relativeAir=Math.max(0,v+headwind),aero=.5*rho*cdA*relativeAir*relativeAir,rolling=grip.tire.rolling*mass*g*(1+v*.006),net=driveForce-aero-rolling,a=Math.max(-1.5,net/mass);v=Math.max(0,v+a*dt);x+=v*dt;t+=dt;aPrev=a;const mark=(key,dist)=>{if(milestones[key]==null&&x>=dist)milestones[key]={time:t,speedKmh:v*3.6};};mark('m18',18.288);mark('m100',100.584);mark('m201',201.168);mark('m305',304.8);mark('m402',402.336);if(milestones.zero100==null&&v*3.6>=100)milestones.zero100=t;traceClock+=dt;if(traceClock>=.04){traceClock=0;trace.push({time:t,distanceM:x,speedKmh:v*3.6,gear:gear+1,rpm,accelerationG:a/g});}}
    if(!milestones.m402)throw new Error('De combinatie bereikte de finish niet binnen 25 seconden.');const wheelspinPct=clamp(wheelspinIntegral/Math.max(.001,tractionIntegral)*100,0,99),rt=Number.isFinite(config.reactionTime)?config.reactionTime:.090,redLight=rt<0;
    return{valid:!redLight,redLight,reactionTime:rt,sixtyFt:milestones.m18?.time||null,threeThirty:milestones.m100?.time||null,eighth:milestones.m201?.time||null,eighthKmh:milestones.m201?.speedKmh||null,thousandFt:milestones.m305?.time||null,quarter:milestones.m402.time,trapKmh:milestones.m402.speedKmh,zeroTo100:milestones.zero100,wheelspinPct,shifts,drivetrain:drive.name,tireName:grip.tire.name,tireSize:`${vehicle.tireWidthMm}/${vehicle.aspectRatio} R${vehicle.rimDiameterIn}`,wheelSpec:`${vehicle.rimDiameterIn}×${Number(vehicle.rimWidthIn).toFixed(1)} in`,tireDiameterMm:grip.geometry.diameterMm,totalMassKg:mass,finishTotalTime:milestones.m402.time+Math.max(0,rt),trace,setup:{mu:grip.mu,pressurePenalty:grip.pressurePenalty,driveLoss:drive.loss,tireTempC:grip.tireTempC,airDensityKgM3:rho,densityAltitudeM:densityAltitude(vehicle),headwindKmh:vehicle.headwindKmh,shiftRpm}};
  }

  function diagnoseDyno(result){if(!result)return[];const out=[];const add=(system,severity,observation,action)=>out.push({system,severity,observation,action});if(result.failureRpm)add('Run','danger',`Pull afgebroken bij ${result.failureRpm} rpm: ${result.failureReason}`,'Herstel de oorzaak en virtuele schade voordat opnieuw wordt gemeten.');if(result.maxFuelDuty>88)add('Brandstof',result.maxFuelDuty>102?'danger':'warn',`Maximale duty ${Math.round(result.maxFuelDuty)}%.`,`Vergroot de flowmarge of verlaag de vraag; controleer de raildrukcurve.`);if(result.maxTurboLoad>92)add('Turbo',result.maxTurboLoad>112?'danger':'warn',`Turbo-load ${Math.round(result.maxTurboLoad)}% en geschatte as ${Math.round(result.maxTurboShaftRpm/1000)}k rpm.`,'Gebruik minder druk buiten het efficiënte gebied, meer turbine/wastegateflow of een passend compressorframe.');if(result.maxKnockRisk>.55)add('Verbranding',result.maxKnockRisk>1?'danger':'warn',`Knock-index piekte op ${result.maxKnockRisk.toFixed(2)}.`,'Vergroot brandstof-, temperatuur- en ontstekingsmarge; controleer mechanische noktiming.');if(result.maxIatC>50)add('Inlaatlucht','warn',`IAT bereikte ${Math.round(result.maxIatC)}°C.`,'Verbeter koeling, ventilator/ice-tank of verminder heat-soak en compressorbelasting.');if(result.minOilPressureBar<2.8||result.maxOilTempC>135)add('Olie',result.minOilPressureBar<2.1?'danger':'warn',`Min ${result.minOilPressureBar.toFixed(1)} bar, max ${Math.round(result.maxOilTempC)}°C, aeratie ${Math.round(result.maxOilAerationPct)}%.`,'Controleer vulniveau, clearances, pickup/cartercontrole, viscositeit en koeling.');if(result.camTiming?.applicable&&result.camTiming.score<.88)add('Nokken','warn',`Timingmatch ${Math.round(result.camTiming.score*100)}%.`,'Meet opnieuw op overlap-TDC en herstel de mechanische basisstand voordat de map wordt beoordeeld.');if(result.assembly?.score<.85)add('Montage',result.assembly.score<.68?'danger':'warn',`Montagescore ${Math.round(result.assembly.score*100)}%.`,'Controleer ringgap, lagerclearance, bougiegap, priming en montageprocedure.');if(!out.length)add('Resultaat','good','Geen hoofdafwijking in de gemodelleerde kanalen.','Bewaar de run als referentie en vergelijk herhaalbaarheid bij dezelfde condities.');return out;}

  function applyPreset(inputState,presetId){const state=normalizeState(inputState),p=PRESETS[presetId];if(!p)throw new Error(`Unknown preset ${presetId}`);state.buildName=p.name;state.selections={...state.selections,...deepClone(p.selections)};state.tune={...state.tune,...deepClone(p.tune)};if(p.assembly)state.assembly={...state.assembly,...deepClone(p.assembly)};if(p.service)state.service={...state.service,...deepClone(p.service)};if(p.dynoConfig)state.dynoConfig={...state.dynoConfig,...deepClone(p.dynoConfig)};if(p.vehicle)state.vehicle={...state.vehicle,...deepClone(p.vehicle)};state.bench={results:{}};return state;}
  function createInitialState(){let state=blankState(),result=simulateEngine(state,{noise:false});state.lastDyno=result;state.lastDynoSignature=engineSignature(state);state.dynoRuns=[{...result,label:'Referentierun Randy JE83 K04'}];state.history=[{type:'dyno',label:'Referentierun Randy JE83 K04',at:new Date().toISOString(),hp:result.peakHp,nm:result.peakTorqueNm}];return state;}
  function totalPartsPrice(state){return CATEGORIES.reduce((sum,cat)=>sum+getPart(state,cat.id).price,0);}
  function evaluateChallenges(inputState){const s=normalizeState(inputState),r=s.lastDyno,d=s.lastDrag,b=benchConfidence(s),turbo=getPart(s,'turbo');return{
    first_pull:!!(r&&!r.failureRpm),safe500:!!(r&&!r.failureRpm&&r.peakHp>=500&&r.reliabilityScore>=80),k04_hero:!!(r&&!r.failureRpm&&['k04','k04_hybrid'].includes(turbo.id)&&r.peakHp>=500),bench_master:b.complete&&b.failed===0,
    fwd11:!!(d&&d.valid&&s.vehicle.drivetrain==='FWD'&&d.quarter<12),fwd10:!!(d&&d.valid&&s.vehicle.drivetrain==='FWD'&&d.quarter<11),seven_hundred:!!(r&&!r.failureRpm&&r.peakHp>=700&&r.reliabilityScore>=68),four_digits:!!(r&&!r.failureRpm&&r.peakHp>=1000),big_turbo_survivor:!!(r&&!r.failureRpm&&turbo.compressorMm>=98&&r.reliabilityScore>=55)};}

  function selfTest(){const checks=[],add=(name,ok,value)=>checks.push({name,ok:!!ok,value});let stock=applyPreset(blankState(),'stock');stock.service.oilId='5w40_502';const stockR=simulateEngine(stock,{noise:false});add('OEM vermogen plausibel',stockR.peakHp>165&&stockR.peakHp<250,round(stockR.peakHp));const randyState=blankState(),randy=simulateEngine(randyState,{noise:false}),rg=engineGeometry(randyState);add('Randy JE83 cilinderinhoud',rg.displacementCc>2005&&rg.displacementCc<2012,round(rg.displacementCc,1));add('Randy K04 band',randy.peakHp>420&&randy.peakHp<590,round(randy.peakHp));const big=applyPreset(blankState(),'pro98');big.selections.spool='none';const bigNo=simulateEngine(big,{noise:false});big.selections.spool='n2o_150';const bigYes=simulateEngine(big,{noise:false}),pNo=bigNo.curve.find(p=>p.rpm===7000)?.boostBar||0,pYes=bigYes.curve.find(p=>p.rpm===7000)?.boostBar||0;add('98-mm spool assistance werkt',pYes>pNo*1.2,`${pNo.toFixed(2)}→${pYes.toFixed(2)} bar @7000`);const lowOil=blankState();lowOil.service.liters=3.7;const lowR=simulateEngine(lowOil,{noise:false});add('Laag oliepeil verlaagt marge',lowR.reliabilityScore<randy.reliabilityScore,`${lowR.reliabilityScore}<${randy.reliabilityScore}`);const badAssembly=blankState();badAssembly.assembly.topRingGapMm=.30;const badR=simulateEngine(badAssembly,{noise:false});add('Krappe ringgap verlaagt marge',badR.reliabilityScore<randy.reliabilityScore,`${badR.reliabilityScore}<${randy.reliabilityScore}`);const tg=tireGeometry(blankState().vehicle);add('Bandomtrek',tg.diameterMm>640&&tg.diameterMm<680,round(tg.diameterMm,1));const bt=runBenchTest(blankState(),'compression');add('Benchtest werkt',bt.values.length===4&&bt.score>0,`${bt.score}/100`);try{const drag=simulateDrag(blankState(),randy,{reactionTime:.08});add('Quarter-mile integratie',drag.quarter>7&&drag.quarter<18&&drag.trapKmh>120,`${drag.quarter.toFixed(3)} s @ ${drag.trapKmh.toFixed(1)}`);}catch(e){add('Quarter-mile integratie',false,e.message);}return{ok:checks.every(c=>c.ok),checks};}

  const Core={CATEGORIES,CATEGORY_MAP,OILS,OIL_MAP,FILTERS,FILTER_MAP,TIRE_COMPOUNDS,TIRE_MAP,DRIVETRAINS,PRESETS,BENCH_TESTS,CHALLENGES,blankState,normalizeState,createInitialState,getPart,engineSignature,benchSignature,engineGeometry,camTimingHealth,assemblyTargets,assemblyHealth,runBenchTest,benchConfidence,isDynoCurrent,tireGeometry,wheelFitment,gripFactor,airDensity,densityAltitude,oilHealth,simulateEngine,simulateDrag,interpolateCurve,diagnoseDyno,applyPreset,totalPartsPrice,evaluateChallenges,selfTest,clamp,lerp,round};
  if(typeof module!=='undefined'&&module.exports)module.exports=Core;root.EA888Core=Core;
})(typeof globalThis!=='undefined'?globalThis:this);
'''

template = template.replace('__CATEGORIES__', js(raw_categories)).replace('__OILS__',js(oils)).replace('__FILTERS__',js(filters)).replace('__TIRES__',js(tires)).replace('__DRIVETRAINS__',js(drivetrains)).replace('__PRESETS__',js(presets))
OUT.write_text(template,encoding='utf-8')
print('wrote',OUT,OUT.stat().st_size)
