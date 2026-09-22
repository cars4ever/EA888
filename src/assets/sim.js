/* EA888 Lab v0.9.0 — deterministic engine, bench and drag simulation core.
 * Offline and dependency-free. This is an engineering game model, not workshop
 * certification, an ECU calibration or a substitute for measurements on a real engine.
 */
(function (root) {
  'use strict';
  const Turbo = typeof module !== 'undefined' && module.exports ? require('./turbo.js') : root.EA888Turbo;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, f) => a + (b - a) * f;
  const round = (v, n = 0) => {
    const p = 10 ** n;
    return Math.round(v * p) / p;
  };
  const deepClone = obj => JSON.parse(JSON.stringify(obj));

  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const METRIC_DEFAULTS = Object.freeze({
    hpLimit: 10000,
    torqueLimit: 10000,
    rpmLimit: 20000,
    powerMultiplier: 1,
    lowRpmMultiplier: 1,
    highRpmMultiplier: 1,
    headFlow: 1,
    turboMaxHp: 10000,
    turboSpoolRpm: 0,
    turboEfficiency: 1,
    turboMaxBoost: 10,
    compressorMm: 0,
    turbineMm: 0,
    shaftSpeedLimitRpm: 0,
    cooling: 0,
    flow: 1,
    intakeFlow: 1,
    throttleMm: 68,
    plenumL: 2.4,
    fuelSystemHp: 10000,
    maxRailBar: 250,
    octane: 120,
    fuelCooling: 0,
    fuelFlowFactor: 1,
    exhaustFlow: 1,
    oilControl: 0.5,
    oilCooling: 0.2,
    harmonicControl: 0.2,
    safetyQuality: 0.5,
    sparkQuality: 1,
    sparkBoostLimit: 10,
    headClampBmep: 60,
    transTorque: 10000,
    shiftSeconds: 0.2,
    transEfficiency: 0.9,
    reliabilityBonus: 0,
    massDeltaKg: 0,
    spoolShiftRpm: 0,
    nitrousHp: 0,
    spoolHeat: 0,
    wearFactor: 0,
    gearRatios: [3.36, 2.09, 1.47, 1.1, 0.86, 0.72],
    finalDrive: 3.94,
    boreMm: 82.5,
    strokeMm: 92.8,
    compressionRatio: 9.6,
    targetExhaustTdcMm: null,
    targetIntakeTdcMm: null,
    visualKey: '',
    crankcaseControl: 0.6,
    oilVaporPenalty: 0.05,
    vacuumKpa: 0,
    boostControlQuality: 0.72,
    boostHardwareMaxBar: 2,
    wastegateFlow: 0.8,
    sensorQuality: 0.65,
    diagnosticConfidence: 0.62,
    measurementNoise: 0.03
  });

  // prettier-ignore
  const RAW_CATEGORIES = [{"id":"block","label":"Onderblok","short":"Blok","items":[{"id":"oem_block","name":"OEM CAWB onderblok","detail":"Gietijzeren Gen-1 blok met standaard zuigers en drijfstangen. Een vroege koppelpiek en knock zijn de echte vijanden.","specs":"1984 cc · 82,5 × 92,8 mm · 9,6:1","price":0,"hpLimit":380,"torqueLimit":520,"rpmLimit":7500,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"oem"},{"id":"rods","name":"Gesmede drijfstangen","detail":"Gesmede drijfstangen met OEM-zuigers. De ringlands en zuigers blijven de volgende grens.","specs":"H-beam · ARP-bouten · 82,5 mm boring","price":1650,"hpLimit":520,"torqueLimit":700,"rpmLimit":7900,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"rods"},{"id":"forged","name":"Forged zuigers + drijfstangen","detail":"Gebalanceerde forged set met passende spelingen, lagers en gecontroleerde compressieverhouding.","specs":"2618 zuigers · H-beam rods · gebalanceerd","price":4800,"hpLimit":780,"torqueLimit":930,"rpmLimit":8400,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.3,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"forged"},{"id":"randy_je83","name":"Randy JE 83,00 mm shortblock","detail":"De bekende CAWB-basis: JE Ultra 83,00 mm 9,6:1, gesmede drijfstangen, ACL-lagers, ARP rod bolts en volledig gebalanceerde roterende delen.","specs":"2008 cc · JE Ultra 83,00 mm · 9,6:1 · ACL · ARP","price":5850,"hpLimit":850,"torqueLimit":980,"rpmLimit":8600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":7,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":83,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"closed_deck","name":"Closed-deck race shortblock","detail":"Closed-deck versterking, forged internals, bedplate-brace en volledig dynamisch gebalanceerd.","specs":"Closed deck · 83,0 mm forged · brace · 9,0:1","price":9500,"hpLimit":1120,"torqueLimit":1200,"rpmLimit":9100,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":8,"massDeltaKg":8,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":83,"strokeMm":92.8,"compressionRatio":9,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"closed"},{"id":"billet_block","name":"Billet/filled drag shortblock","detail":"Extreme sleeved/billet dragconstructie. Onderhoudsintensief en niet bedoeld als normale straatmotor.","specs":"Ductile sleeves · billet mains · dry-deck","price":18500,"hpLimit":1500,"torqueLimit":1500,"rpmLimit":9800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":7,"massDeltaKg":16,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":83.5,"strokeMm":92.8,"compressionRatio":8.8,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"billet"},{"id":"promod_block","name":"Promod dry-deck billet block","detail":"Volledig billet/dry-deck onderblok met ductile sleeves, vaste mains en externe koelwaterroute. Onderhoud na korte race-intervallen.","specs":"83,5 mm · dry deck · billet mains · drag-only","price":31500,"hpLimit":2350,"torqueLimit":2250,"rpmLimit":10600,"reliabilityBonus":10,"massDeltaKg":24,"boreMm":83.5,"strokeMm":92.8,"compressionRatio":8.5,"visualKey":"promod"}]},{"id":"crank","label":"Krukas & demper","short":"Krukas","items":[{"id":"oem_crank","name":"OEM krukas + poelie","detail":"OEM krukas en rubberdemper. Vermijd langdurig extreem toerental en abrupte koppelpulsen.","specs":"92,8 mm slag · OEM demper","price":0,"hpLimit":700,"torqueLimit":820,"rpmLimit":8000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_balanced_crank","name":"Randy OEM krukas — gebalanceerd","detail":"Originele CAWB-krukas, gecontroleerd en samen met de nieuwe roterende delen dynamisch gebalanceerd.","specs":"OEM 92,8 mm · gemeten · dynamisch gebalanceerd","price":1450,"hpLimit":880,"torqueLimit":1000,"rpmLimit":8600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.72,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"fluidampr","name":"OEM krukas + Fluidampr","detail":"Geïnspecteerd, gemeten en gebalanceerd met viskeuze torsiedemper.","specs":"Scheurcontrole · dynamic balance · viscous damper","price":1350,"hpLimit":850,"torqueLimit":970,"rpmLimit":8400,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.74,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":2,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_crank","name":"Race-prep OEM krukas + brace","detail":"Nitreren/polijsten, dynamisch balanceren, brace en motorsportdemper.","specs":"Nitrided journals · bedplate brace","price":3200,"hpLimit":980,"torqueLimit":1100,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.88,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":3,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"billet_crank","name":"Billet krukas + race damper","detail":"Voor extreme cilinderdruk en toerental. Alleen logisch als de rest van de motor hetzelfde niveau heeft.","specs":"Billet steel · heavy-duty damper","price":7900,"hpLimit":1500,"torqueLimit":1550,"rpmLimit":9800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.99,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":8,"massDeltaKg":5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_crank","name":"Promod billet krukas + tuned damper","detail":"Billet krukas, heavy-duty damper en volledig gematchte roterende groep voor zeer hoge BMEP en toerental.","specs":"Billet steel · tuned damper · matched bobweight","price":13900,"hpLimit":2350,"torqueLimit":2300,"rpmLimit":10600,"harmonicControl":1.04,"reliabilityBonus":11,"massDeltaKg":6}]},{"id":"oiling","label":"Oliehuishouding","short":"Olie","items":[{"id":"wet_sump","name":"OEM nat carter","detail":"Standaard carter en pickup. Harde launches, remmen en lang hoog toerental kunnen drukschommelingen geven.","specs":"OEM pomp · standaard pickup · ±4,6 L","price":0,"hpLimit":650,"torqueLimit":900,"rpmLimit":7600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.3,"oilCooling":0.15,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"baffled","name":"Baffled sump + oliekoeler","detail":"Schotten, verbeterde pickup en thermostatische oliekoeler voor herhaalbare straat- en dragruns.","specs":"Baffled pan · 19-row cooler · thermostat","price":950,"hpLimit":850,"torqueLimit":1020,"rpmLimit":8300,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.73,"oilCooling":0.63,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"accusump","name":"Accusump + grote oliekoeler","detail":"Drukbuffer tijdens launch en shifts, plus veel meer thermische reserve.","specs":"3 qt accumulator · 25-row cooler","price":2250,"hpLimit":1030,"torqueLimit":1160,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.89,"oilCooling":0.81,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dry_sump","name":"Dry-sump race systeem","detail":"Externe pomp, tank en scavenging. Maximale drukcontrole bij extreme acceleratie.","specs":"4-stage pump · remote tank · crank vacuum","price":6800,"hpLimit":1600,"torqueLimit":1700,"rpmLimit":10000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.995,"oilCooling":0.95,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":10,"massDeltaKg":10,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_drysump","name":"5-stage Promod dry-sump","detail":"Grote scavengecapaciteit, geregelde carterdruk en externe olievoorraad voor herhaalde dragpulls.","specs":"5-stage pump · vacuum regulation · 12 L tank","price":12800,"hpLimit":2450,"torqueLimit":2450,"rpmLimit":10800,"oilControl":1.1,"oilCooling":1.35,"reliabilityBonus":12,"massDeltaKg":15}]},{"id":"crankcase","label":"Carterventilatie & vacuüm","short":"PCV","items":[{"id":"oem_pcv","name":"OEM PCV-systeem","detail":"Gesloten OEM carterventilatie. Goed voor standaard gebruik; bij hoge boost kan oliedamp de inlaat en knockmarge beïnvloeden.","specs":"OEM membraan · retour naar inlaat","price":0,"crankcaseControl":0.58,"oilVaporPenalty":0.055,"vacuumKpa":0,"reliabilityBonus":0},{"id":"catch_can","name":"Gesloten catch-can systeem","detail":"Afscheiding van olie/nevel met retour naar de inlaat. Geschikt voor straatgebruik wanneer slangen en terugslagkleppen correct zijn uitgevoerd.","specs":"Baffled can · check valves · gesloten circuit","price":480,"crankcaseControl":0.82,"oilVaporPenalty":0.025,"vacuumKpa":0,"reliabilityBonus":2},{"id":"vented_can","name":"Race catch-can / atmosferisch","detail":"Grote ontluchting voor racegebruik. Minder oliedamp in de inlaat, maar niet emissie- of straatgericht.","specs":"-10AN/-12AN ontluchting · drain","price":780,"crankcaseControl":0.92,"oilVaporPenalty":0.012,"vacuumKpa":0,"reliabilityBonus":3},{"id":"vacuum_pump","name":"Externe vacuümpomp","detail":"Geregeld cartervacuüm vermindert windage en helpt ringseal. Vereist drukregeling en betrouwbare olieafscheiding.","specs":"Externe pomp · regulator · catch tank","price":2450,"crankcaseControl":1.02,"oilVaporPenalty":0.004,"vacuumKpa":-10,"powerMultiplier":1.012,"reliabilityBonus":5,"massDeltaKg":3}]},{"id":"head","label":"Kop & nokkenassen","short":"Kop","items":[{"id":"oem_head","name":"OEM kop & nokkenassen","detail":"Sterk onderin en middengebied; boven circa 6500 rpm neemt de massaflow af.","specs":"OEM lift/duur · variabele inlaatnok","price":0,"hpLimit":850,"torqueLimit":1100,"rpmLimit":7300,"powerMultiplier":1,"lowRpmMultiplier":1.03,"highRpmMultiplier":0.91,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_catcams","name":"Randy Cat Cams / Bar-Tek kop","detail":"Custom Cat Cams met inlaat-VVT en de opgegeven overlap-TDC meetwaarden. Verkeerde mechanische timing kost flow en verhoogt het knockrisico.","specs":"Uitlaat 0,85 mm @ overlap-TDC · inlaat 0,25 mm @ overlap-TDC","price":3750,"hpLimit":1120,"torqueLimit":1320,"rpmLimit":8700,"powerMultiplier":1.075,"lowRpmMultiplier":0.95,"highRpmMultiplier":1.19,"headFlow":1.1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":0.85,"targetIntakeTdcMm":0.25,"visualKey":"randy"},{"id":"mild_cams","name":"Milde 260° cams","detail":"Meer gebied onder de curve zonder alle lage-toerenrespons op te offeren.","specs":"±260° · straatlift · VVT behouden","price":1450,"hpLimit":930,"torqueLimit":1170,"rpmLimit":7900,"powerMultiplier":1.035,"lowRpmMultiplier":0.99,"highRpmMultiplier":1.08,"headFlow":1.04,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"high_lift","name":"11,75/11,00 mm high-lift cams","detail":"Lange duur en hoge lift. Minder onderin, veel sterker bovenin wanneer turbo en kop kunnen volgen.","specs":"High lift · lange duur · instelbare timing","price":2350,"hpLimit":1080,"torqueLimit":1250,"rpmLimit":8500,"powerMultiplier":1.08,"lowRpmMultiplier":0.9,"highRpmMultiplier":1.2,"headFlow":1.1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"ported_head","name":"CNC ported race head","detail":"Grote poorten, zetelwerk, aangepaste kamers en high-lift cams voor maximale massaflow.","specs":"CNC ports · oversize valves · race cams","price":6900,"hpLimit":1320,"torqueLimit":1450,"rpmLimit":9300,"powerMultiplier":1.15,"lowRpmMultiplier":0.85,"highRpmMultiplier":1.3,"headFlow":1.21,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_head","name":"Promod billet-port cylinder head","detail":"Zwaar geporte kop met grote zittingen, korte runners en race-spec nokken voor top-end flow boven 9000 rpm.","specs":"Billet-port · oversized seats · drag cams","price":18600,"hpLimit":2300,"torqueLimit":2300,"rpmLimit":10600,"powerMultiplier":1.2,"lowRpmMultiplier":0.74,"highRpmMultiplier":1.36,"headFlow":1.29,"reliabilityBonus":6,"visualKey":"promod"}]},{"id":"valvetrain","label":"Kleppentrein","short":"Kleppen","items":[{"id":"oem_valves","name":"OEM kleppentrein","detail":"OEM veren, kleppen en retainers. Valve-float wordt waarschijnlijk bij agressief hoog toerental.","specs":"Hydraulisch · OEM veren","price":0,"hpLimit":850,"torqueLimit":1250,"rpmLimit":7050,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_ferrea","name":"Ferrea / Bar-Tek high-boost kleppentrein","detail":"Ferrea kleppen en veren met retainers en keepers uit de high-boost kopset. Geometrie en installed height blijven bepalend.","specs":"Ferrea valves · high-boost springs · retainers/keepers","price":3150,"hpLimit":1280,"torqueLimit":1520,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":7,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"springs","name":"Versterkte veren & retainers","detail":"Meer seat/open pressure met lichte retainers en gecontroleerde installed height.","specs":"Dual springs · lightweight retainers","price":950,"hpLimit":980,"torqueLimit":1350,"rpmLimit":7900,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_valves","name":"Race valves + veren","detail":"Versterkte kleppen, veren en retainers voor serieuze high-lift/high-rpm bouw.","specs":"Inconel exhaust · stainless intake","price":2650,"hpLimit":1230,"torqueLimit":1500,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"solid_lifter","name":"Solid-lifter race setup","detail":"Voor extreem toerental. Vereist periodieke lash-controle en is geen rustige straatoplossing.","specs":"Solid buckets · shimmed lash","price":5500,"hpLimit":1550,"torqueLimit":1650,"rpmLimit":10000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_valvetrain","name":"Promod solid valvetrain","detail":"Solid buckets, DLC followers, titanium retainers en raceveren met zeer korte inspectie-intervallen.","specs":"Solid bucket · DLC · Ti retainers · 10.7k rpm","price":11800,"hpLimit":2350,"torqueLimit":2350,"rpmLimit":10700,"reliabilityBonus":7}]},{"id":"turbo","label":"Turbo & spruitstuk","short":"Turbo","items":[{"id":"k03","name":"OEM K03/IHI-frame","detail":"Zeer snelle spool. Buiten zijn efficiënte gebied maakt extra boost vooral hitte en turbospeed.","specs":"Compressor 41 mm · OEM manifold","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":250,"turboSpoolRpm":1650,"turboEfficiency":0.84,"turboMaxBoost":1.15,"compressorMm":41,"turbineMm":45,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"k04","name":"K04-064","detail":"Snelle straatupgrade met directe respons en beperkte top-end.","specs":"Compressor 46 mm · twin-scroll OEM-frame","price":2250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":395,"turboSpoolRpm":2450,"turboEfficiency":0.88,"turboMaxBoost":1.85,"compressorMm":46,"turbineMm":50,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"k04_hybrid","name":"Randy K04-064 hybrid 500","detail":"De compacte 2,5-bar K04-hybrid uit de bekende build. Sterk middengebied, maar turbine-backpressure en turbospeed blijven de echte grens.","specs":"±52 mm compressor · compact K04-frame · 2,5 bar rating","price":3450,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":520,"turboSpoolRpm":3000,"turboEfficiency":0.86,"turboMaxBoost":2.5,"compressorMm":52,"turbineMm":52,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy-k04"},{"id":"g25","name":"G25-660 twin-scroll","detail":"Modern compact frame voor een breed bereik en goede transient response.","specs":"54 mm inducer · ball-bearing · twin-scroll","price":4950,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":680,"turboSpoolRpm":3500,"turboEfficiency":0.925,"turboMaxBoost":2.8,"compressorMm":54,"turbineMm":54,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"g30","name":"G30-770 twin-scroll","detail":"Meer top-end dan G25, nog bruikbaar op een goed gebouwde 2.0-liter.","specs":"58 mm inducer · 0.83 A/R","price":5250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":790,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":58,"turbineMm":60,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"6466","name":"6466 drag turbo","detail":"64-mm compressor met snelle turbine voor zijn klasse. Vereist goede uitlaatflow en boostregeling.","specs":"64 mm inducer · 66 mm turbine","price":5400,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":930,"turboSpoolRpm":4450,"turboEfficiency":0.92,"turboMaxBoost":3.25,"compressorMm":64,"turbineMm":66,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hx52","name":"Randy HX52 67-mm twin-scroll","detail":"De grote HX52-combinatie met 67-mm inducer, 11-cm² twin-scroll huis en twee wastegates. Op circa 2,0 liter komt het bruikbare gebied duidelijk later.","specs":"67 mm inducer · 11 cm² twin-scroll · dual wastegate","price":3900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":900,"turboSpoolRpm":4650,"turboEfficiency":0.885,"turboMaxBoost":3.15,"compressorMm":67,"turbineMm":70,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy-hx52"},{"id":"6870","name":"6870 drag turbo","detail":"Veel top-end en meer turbineflow; lage-toerenrespons wordt ondergeschikt.","specs":"68 mm inducer · 70 mm turbine","price":5800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1080,"turboSpoolRpm":4950,"turboEfficiency":0.92,"turboMaxBoost":3.4,"compressorMm":68,"turbineMm":70,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"7275","name":"7275 Pro Race","detail":"Groot frame voor een volledige dragmotor. Zonder anti-lag of nitrous komt hij laat tot leven.","specs":"72 mm inducer · 75 mm turbine","price":6500,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1220,"turboSpoolRpm":5350,"turboEfficiency":0.925,"turboMaxBoost":3.55,"compressorMm":72,"turbineMm":75,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"7685","name":"7685 Pro Race","detail":"76-mm compressor met grote turbine. Alleen logisch met hoge flow, toerental en serieuze brandstofcapaciteit.","specs":"76 mm inducer · 85 mm turbine","price":7350,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1400,"turboSpoolRpm":5750,"turboEfficiency":0.93,"turboMaxBoost":3.7,"compressorMm":76,"turbineMm":85,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"8285","name":"8285 Outlaw","detail":"82-mm compressor. Op 1984 cc is spool een hoofdonderdeel van de strategie.","specs":"82 mm inducer · 85 mm turbine","price":8200,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1550,"turboSpoolRpm":6100,"turboEfficiency":0.925,"turboMaxBoost":3.8,"compressorMm":82,"turbineMm":85,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"8685","name":"8685 Outlaw","detail":"86-mm compressor voor extreme top-end. Straatgebruik is praktisch niet het doel.","specs":"86 mm inducer · 85 mm turbine","price":8950,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1700,"turboSpoolRpm":6400,"turboEfficiency":0.92,"turboMaxBoost":3.9,"compressorMm":86,"turbineMm":85,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"8891","name":"8891 Xtreme","detail":"88-mm compressor en zeer grote turbine. Vereist nitrous/anti-lag en een volledig racegerichte motor.","specs":"88 mm inducer · 91 mm turbine","price":9800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1850,"turboSpoolRpm":6650,"turboEfficiency":0.915,"turboMaxBoost":4,"compressorMm":88,"turbineMm":91,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"9488","name":"9488 Pro Mod","detail":"94-mm compressor. Bij een 2.0-liter is de powerband smal en het toerental hoog.","specs":"94 mm inducer · 88 mm turbine","price":10800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":2050,"turboSpoolRpm":7000,"turboEfficiency":0.91,"turboMaxBoost":4.1,"compressorMm":94,"turbineMm":88,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"9894","name":"98-mm Pro Mod","detail":"Volwaardige 98-mm dragunit. Zonder spool assistance blijft veel van de run buiten het efficiënte gebied.","specs":"98 mm inducer · 94 mm turbine · large frame","price":12500,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":2250,"turboSpoolRpm":7350,"turboEfficiency":0.905,"turboMaxBoost":4.2,"compressorMm":98,"turbineMm":94,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"106mm","name":"106-mm Outlaw","detail":"Groter dan 98 mm. Alleen bruikbaar met extreme flow, zeer hoog toerental en actieve spoolstrategie.","specs":"106 mm inducer · 102 mm turbine","price":14800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":2550,"turboSpoolRpm":7850,"turboEfficiency":0.895,"turboMaxBoost":4.35,"compressorMm":106,"turbineMm":102,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"118mm","name":"118-mm Extreme","detail":"Experiment voor een volledig drag-only 2.0-liter. De compressorcapaciteit ligt ver boven wat een normale EA888 kan benutten.","specs":"118 mm inducer · 108 mm turbine","price":18500,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":3000,"turboSpoolRpm":8450,"turboEfficiency":0.88,"turboMaxBoost":4.5,"compressorMm":118,"turbineMm":108,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"127mm","name":"127-mm Unlimited turbo","detail":"Een echte unlimited-size compressor voor extreme dragprojecten. Op circa 2,0 liter is bruikbare spool zonder zeer hoog toerental en externe energie extreem laat.","specs":"127-mm compressor · 118-mm turbine · drag-only","price":18500,"turboMaxHp":2200,"turboSpoolRpm":9300,"turboEfficiency":0.84,"turboMaxBoost":5.6,"compressorMm":127,"turbineMm":118,"hpLimit":2200,"torqueLimit":2200,"rpmLimit":10600,"shaftSpeedLimitRpm":104000,"massDeltaKg":22}]},{"id":"boostControl","label":"Wastegate & boostregeling","short":"WG","items":[{"id":"oem_internal","name":"OEM interne wastegate","detail":"Snelle respons en compacte montage. Regelautoriteit wordt beperkt bij hoge flow en lage gewenste boost.","specs":"Interne klep · OEM actuator","price":0,"boostControlQuality":0.66,"boostHardwareMaxBar":1.55,"wastegateFlow":0.72},{"id":"uprated_internal","name":"Versterkte interne wastegate","detail":"Zwaardere actuator en betere klepgeometrie voor een K04/hybrid-setup.","specs":"Uprated actuator · ported flap","price":520,"boostControlQuality":0.82,"boostHardwareMaxBar":2.35,"wastegateFlow":0.86,"reliabilityBonus":1},{"id":"single_44","name":"Enkele 44-mm externe wastegate","detail":"Meer bypass-flow en stabielere regeling op een degelijk gescheiden spruitstuk.","specs":"44 mm · boost solenoid · dump/recirc","price":920,"boostControlQuality":0.92,"boostHardwareMaxBar":3.25,"wastegateFlow":1.0,"reliabilityBonus":2},{"id":"dual_44","name":"Dubbele 44-mm wastegates","detail":"Twin-scroll regeling met één wastegate per scroll. Past bij de bekende HX52-opzet met twee gates.","specs":"2×44 mm · twin-scroll · 4-port control","price":1780,"boostControlQuality":0.975,"boostHardwareMaxBar":4.25,"wastegateFlow":1.17,"reliabilityBonus":4,"visualKey":"randy"},{"id":"co2_dome","name":"CO₂ dome pressure control","detail":"Zeer hoge regelautoriteit en herhaalbaarheid voor draggebruik. Foutieve strategie kan juist extreme overboost geven.","specs":"Dome pressure · dual gate · closed-loop","price":3650,"boostControlQuality":0.995,"boostHardwareMaxBar":5.5,"wastegateFlow":1.24,"reliabilityBonus":4,"massDeltaKg":5},{"id":"dual_60_co2","name":"Dubbele 60-mm CO₂ wastegates","detail":"Twee grote wastegates en dome pressure control voor zeer hoge turbineflow en stabiele boost ramps.","specs":"2×60 mm · dome CO₂ · shaft-speed limit","price":6900,"boostControlQuality":0.998,"boostHardwareMaxBar":6.2,"wastegateFlow":1.45,"reliabilityBonus":6,"massDeltaKg":7}]},{"id":"air","label":"Inlaat & koeling","short":"Koeling","items":[{"id":"oem_air","name":"OEM airbox & intercooler","detail":"Stil, maar snel heat-soaked bij herhaalde pulls.","specs":"OEM core · OEM throttle · gesloten airbox","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.28,"flow":0.96,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fmic","name":"High-flow inlaat + FMIC","detail":"Lagere drukval en voldoende koeling voor een sterke straatsetup.","specs":"76 mm intake · grote bar-and-plate FMIC","price":1150,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.62,"flow":1.035,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"wmi","name":"Grote FMIC + WMI","detail":"Grote intercooler en water/meth met echte flow-/drukfailsafe.","specs":"1000 cc/min WMI · failsafe · large FMIC","price":2100,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.82,"flow":1.075,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"ice_tank","name":"Drag ice tank + race plenum","detail":"Maximale korte-run koeling, grote plenum/throttle en minimale restrictie.","specs":"Water-to-air · ice tank · 90 mm throttle","price":4600,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.93,"flow":1.13,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":12,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_ice_system","name":"Promod ice-water charge system","detail":"Grote water/ijs-tank, high-flow core en gecontroleerde pompflow voor een korte, reproduceerbare dragpass.","specs":"30 L ice tank · dual pump · race core","price":8900,"cooling":0.985,"flow":1.21,"reliabilityBonus":4,"massDeltaKg":23}]},{"id":"manifold","label":"Inlaatspruitstuk & gasklep","short":"Inlaat","items":[{"id":"oem_manifold","name":"OEM inlaatspruitstuk","detail":"Lange runners en goede lage-toerenrespons. De plenum- en gasklepflow worden beperkend op extreme top-end.","specs":"OEM kunststof runners · OEM gasklep","price":0,"intakeFlow":1.0,"lowRpmMultiplier":1.025,"highRpmMultiplier":0.965,"throttleMm":68,"plenumL":2.4},{"id":"ported_oem","name":"Geport OEM spruitstuk + 76 mm","detail":"Behoudt runnerlengte en respons, met minder lokale restrictie.","specs":"Geport runners · 76-mm gasklep","price":780,"intakeFlow":1.045,"lowRpmMultiplier":1.015,"highRpmMultiplier":1.025,"throttleMm":76,"plenumL":2.6,"reliabilityBonus":1},{"id":"cast_plenum","name":"Cast race plenum + 80 mm","detail":"Groter plenum en kortere runners voor hogere massaflow. Iets minder respons onderin.","specs":"Cast aluminium · 80-mm gasklep","price":1650,"intakeFlow":1.085,"lowRpmMultiplier":0.98,"highRpmMultiplier":1.075,"throttleMm":80,"plenumL":3.4},{"id":"billet_plenum","name":"Billet plenum + 90 mm","detail":"Gelijke runnerverdeling, grote gasklep en MAP/IAT-poorten voor hoog vermogen.","specs":"Billet plenum · bellmouth runners · 90 mm","price":3250,"intakeFlow":1.125,"lowRpmMultiplier":0.94,"highRpmMultiplier":1.12,"throttleMm":90,"plenumL":4.2,"reliabilityBonus":2},{"id":"sheetmetal_105","name":"Drag sheet-metal plenum + 105 mm","detail":"Zeer groot plenum en korte runners. Bedoeld voor hoog toerental en enorme compressorflow.","specs":"Sheet metal · 105-mm throttle · burst panel","price":5450,"intakeFlow":1.17,"lowRpmMultiplier":0.86,"highRpmMultiplier":1.17,"throttleMm":105,"plenumL":5.4,"reliabilityBonus":1},{"id":"billet_120","name":"Billet drag plenum + 120 mm","detail":"Groot plenum, korte gelijke runners, burst panel en 120-mm gasklep voor extreme top-end massaflow.","specs":"Billet runners · 120-mm throttle · burst panel","price":8900,"intakeFlow":1.25,"lowRpmMultiplier":0.74,"highRpmMultiplier":1.25,"throttleMm":120,"plenumL":6.6,"reliabilityBonus":2}]},{"id":"fuelSystem","label":"Brandstofsysteem","short":"Brandstof","items":[{"id":"oem_fuel","name":"OEM DI-systeem","detail":"OEM HPFP en injectoren. Duty en raildruk worden snel de grens.","specs":"OEM HPFP · OEM DI · 150 bar","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":255,"maxRailBar":150,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hpfp","name":"HPFP internals","detail":"Meer pompvolume, maar OEM-injectoren blijven de volgende beperking.","specs":"Vergrote plunjer · OEM injectoren","price":780,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":345,"maxRailBar":170,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_nostrum_rsx","name":"Nostrum HPFP + Bar-Tek RSX injectoren","detail":"De bekende DI-combinatie uit de build. Correcte injector-karakterisatie en CAWB-HPFP-aansturing zijn essentieel; 100% duty is geen normale regelstrategie.","specs":"Nostrum HPFP ±650 pk · RSX/Bar-Tek DI · gekarakteriseerd","price":3650,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":650,"maxRailBar":195,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"nostrum","name":"Grote HPFP + HDEV5 injectoren","detail":"Grote DI-capaciteit met correcte aansturing en karakterisatie.","specs":"High-flow HPFP · calibrated DI","price":3250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":575,"maxRailBar":190,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"di_mpi","name":"DI + MPI staged","detail":"Direct injection plus poortinjectie voor meer flow en betere verdeling.","specs":"DI + 4× MPI · flex-fuel compatible","price":4900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":900,"maxRailBar":195,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_fuel","name":"Race DI + dubbel MPI","detail":"Surge tank, dubbele rails, grote pompen en motorsportdrukregeling.","specs":"Dual brushless pumps · DI + 8× MPI","price":8800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":1280,"maxRailBar":215,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":9,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"methanol_fuel","name":"Mechanische methanol-injectie","detail":"Drag-only systeem met enorme volumeflow. Vereist volledig aangepaste start- en warmupstrategie.","specs":"Mechanical pump · 16 injectors · return system","price":14500,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":3500,"maxRailBar":230,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":14,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_methanol_fuel","name":"Promod staged methanol system","detail":"Meervoudige mechanische injectoren met staged nozzles en onafhankelijke brandstofdrukbewaking.","specs":"16 injectors · belt pump · staged control","price":24900,"fuelSystemHp":5200,"maxRailBar":250,"reliabilityBonus":7,"massDeltaKg":19}]},{"id":"fuel","label":"Brandstof","short":"Fuel","items":[{"id":"ron95","name":"Euro 95","detail":"Lage knockmarge bij hoge cilinderdruk.","specs":"95 RON · stoich 14,7:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":95,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"ron98","name":"Euro 98","detail":"Goede basis voor een conservatieve straatkalibratie.","specs":"98 RON · stoich 14,7:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":98,"fuelCooling":0.01,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"blend_wmi","name":"98 + ethanolblend + WMI","detail":"Hoge effectieve knockmarge, mits flow/drukbewaking echt ingrijpt.","specs":"Effectief ±105 RON · WMI","price":650,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":105,"fuelCooling":0.1,"fuelFlowFactor":0.96,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"e30","name":"E30","detail":"Sterke knock- en charge-coolingmarge met minder volumeverbruik dan E85.","specs":"±103 RON · stoich ±12,7:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":103,"fuelCooling":0.06,"fuelFlowFactor":0.91,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"e85","name":"E85","detail":"Zeer goede knockmarge en koeling; vraagt veel meer volumeflow.","specs":"±109 RON · stoich ±9,8:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":109,"fuelCooling":0.12,"fuelFlowFactor":0.73,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_fuel_type","name":"Race ethanol / C16-equivalent","detail":"Motorsportbrandstof met grote knockmarge.","specs":"Effectief 116 RON · gecontroleerde samenstelling","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":116,"fuelCooling":0.1,"fuelFlowFactor":0.8,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"methanol","name":"M1 methanol","detail":"Enorme charge cooling en knockmarge, maar ongeveer dubbel volumeverbruik en corrosief onderhoud.","specs":"M1 · stoich 6,45:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0.22,"fuelFlowFactor":0.49,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""}]},{"id":"exhaust","label":"Uitlaat","short":"Uitlaat","items":[{"id":"oem_exhaust","name":"OEM katalysator & uitlaat","detail":"Hoge backpressure bij grote massaflow.","specs":"OEM cat · OEM diameter","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":0.91,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"catted_3","name":"3-inch high-flow catted","detail":"Straatgerichte downpipe en uitlaat met lagere tegendruk.","specs":"76 mm · high-flow catalyst","price":1450,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.025,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_3","name":"3-inch race exhaust","detail":"Minimale restrictie voor circuit/dragconfiguratie.","specs":"76 mm · straight-through","price":1850,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.075,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"side_35","name":"3,5-inch side exit","detail":"Maximale turbine-uitlaatflow voor grote turbo en korte runs.","specs":"89 mm · side/hood exit","price":2400,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.13,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":-8,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hood_4","name":"4-inch hood exit","detail":"Drag-only. Extreem lage tegendruk, zeer luid en niet straatgericht.","specs":"102 mm · short hood exit","price":3200,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.18,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":-12,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""}]},{"id":"ecu","label":"ECU & beveiliging","short":"ECU","items":[{"id":"med17","name":"OEM MED17","detail":"OEM knock-, lambda- en railregeling; beperkte flexibiliteit voor grote hardwarewijzigingen.","specs":"Torque model · OEM safeties","price":0,"hpLimit":700,"torqueLimit":900,"rpmLimit":7000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.52,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"custom_med17","name":"Custom MED17","detail":"Boost, load, torque model en brandstof aangepast met basisbeveiligingen behouden.","specs":"Custom calibration · datalogging","price":850,"hpLimit":870,"torqueLimit":1070,"rpmLimit":7700,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.69,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_syvecs","name":"Syvecs SGDI-TSI-DF PnP","detail":"De gekozen standalone voor de CAWB: DI-regeling, speed-density, individuele knockstrategie, logging en flexibele beveiligingen.","specs":"SGDI-TSI-DF · PnP · CAN · motorsport logging","price":5200,"hpLimit":1320,"torqueLimit":1460,"rpmLimit":9200,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.94,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"syvecs","name":"Syvecs SGDI basis","detail":"Speed-density, DI-aansturing, flex-fuel, logging en flexibele strategieën.","specs":"Standalone · SGDI · CAN","price":4500,"hpLimit":1180,"torqueLimit":1320,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.85,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"syvecs_full","name":"Syvecs full safeties","detail":"Knock per cilinder, raildrukcut, lambda/EGT, meth-failsafe, oliedruk en boost-by-gear.","specs":"Motorsport sensors · full failsafes","price":5800,"hpLimit":1450,"torqueLimit":1550,"rpmLimit":9600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.985,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":8,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_ecu","name":"Promod motorsport ECU + PDM","detail":"Volledige staged fuel/ignition/boost-regeling met turbospeed, individuele EGT/lambda en harde shutdowns.","specs":"Dual ECU/PDM · cylinder trim · 2 kHz logging","price":14900,"hpLimit":2400,"torqueLimit":2400,"rpmLimit":10800,"safetyQuality":0.998,"reliabilityBonus":11}]},{"id":"sensors","label":"Sensoren & datalogging","short":"Sensors","items":[{"id":"oem_sensors","name":"OEM sensoren","detail":"OEM MAP, lambda, knock en druksignalen. Voldoende voor standaard en milde builds, minder dekking voor extreme hardware.","specs":"OEM MAP · wideband · knock · rail","price":0,"sensorQuality":0.64,"diagnosticConfidence":0.6,"measurementNoise":0.03},{"id":"street_sensor_pack","name":"Uitgebreid street sensorpakket","detail":"Extra 4-bar MAP, brandstofdruk, oliedruk en olietemperatuur.","specs":"4-bar MAP · fuel/oil pressure · oil temp","price":680,"sensorQuality":0.8,"diagnosticConfidence":0.78,"measurementNoise":0.02,"reliabilityBonus":2},{"id":"motorsport_sensors","name":"Motorsport safety sensorpakket","detail":"EGT, flex-fuel, WMI-flow, backpressure en redundante drukbewaking voor echte failsafes.","specs":"EGT · flex · WMI flow · EMP · pressure","price":1950,"sensorQuality":0.94,"diagnosticConfidence":0.93,"measurementNoise":0.01,"reliabilityBonus":5,"visualKey":"randy"},{"id":"pro_instrumentation","name":"Pro instrumentation + turbospeed","detail":"Turbospeed, vier EGT-kanalen, krukasdruk, individuele lambda en hoge-snelheidslogging.","specs":"Shaft speed · 4× EGT · crank pressure · 1 kHz log","price":4950,"sensorQuality":0.992,"diagnosticConfidence":0.99,"measurementNoise":0.004,"reliabilityBonus":7}]},{"id":"ignition","label":"Ontsteking","short":"Vonk","items":[{"id":"oem_ignition","name":"OEM bobines & bougies","detail":"Prima bij OEM boost; spark blow-out wordt waarschijnlijk bij hoge druk.","specs":"OEM coil energy · OEM heat range","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":0.96,"sparkBoostLimit":1.55,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fresh_coils","name":"High-output OEM-style coils","detail":"Nieuwe coils, koudere bougies en correcte gap.","specs":"Colder plugs · 0,55–0,65 mm gap","price":320,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":2.2,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"smart_coils","name":"Motorsport smart coils","detail":"Meer dwell- en spark-energy marge voor hoge boost.","specs":"Smart coils · ECU dwell control","price":950,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1.025,"sparkBoostLimit":3.2,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"cdi","name":"CDI extreme boost ignition","detail":"Voor zeer hoge cilinderdruk en racegebruik.","specs":"Capacitive discharge · shielded loom","price":2400,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1.045,"sparkBoostLimit":4.5,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dual_cdi","name":"Dual-channel CDI ignition","detail":"Dubbele CDI en afgeschermde loom voor methanol en zeer hoge cilinderdruk.","specs":"Dual CDI · crank-trigger · shielded harness","price":6800,"sparkQuality":1.065,"sparkBoostLimit":6.2,"reliabilityBonus":6}]},{"id":"sealing","label":"Koppakking & studs","short":"Sealing","items":[{"id":"oem_bolts","name":"OEM koppakking & bouten","detail":"OEM clamp load. Head-lift wordt reëel bij hoge BMEP of knock.","specs":"OEM MLS · stretch bolts","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":29,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fresh_mls","name":"Nieuwe MLS + OEM bouten","detail":"Vlakke oppervlakken en correcte montage geven wat extra marge.","specs":"Fresh MLS · measured flatness","price":480,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":34,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_cometic_arp","name":"Cometic MLS + ARP head studs","detail":"De afdichting uit de bekende motor. Oppervlaktefinish, vlakheid, aanhaalmethode en echte knockcontrole blijven bepalend.","specs":"Cometic MLS · ARP studs · gemeten vlakheid","price":1280,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":54,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"studs","name":"MLS + head studs","detail":"Hogere en herhaalbare klemkracht voor serieuze boost.","specs":"High-tensile studs · MLS","price":980,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":50,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fire_ring","name":"Fire-ring/O-ring race sealing","detail":"Voor extreme cilinderdruk; blok/kopbewerking en nauwkeurige montage vereist.","specs":"Receiver grooves · fire rings","price":2900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":74,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dry_deck","name":"Dry-deck + copper/O-ring","detail":"Drag-only afdichting met externe koelwaterroute en maximale clamp load.","specs":"Dry deck · copper gasket · receiver grooves","price":5900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":92,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"receiver_ring_extreme","name":"Receiver-ring dry-deck sealing","detail":"Dry-deck kop/blok, koperpakking en receiver rings met hoge en gelijkmatige clamp load.","specs":"Copper · receiver rings · external coolant","price":9800,"headClampBmep":124,"reliabilityBonus":9}]},{"id":"transmission","label":"Versnellingsbak","short":"Bak","items":[{"id":"oem_6mt","name":"OEM 6MT + OEM koppeling","detail":"Relatief laag verlies; koppeling en tandwielen begrenzen het koppel.","specs":"6-speed H-pattern · open/OEM diff","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":440,"shiftSeconds":0.34,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_o2q","name":"Randy versterkte O2Q + Quaife","detail":"Versterkte handbak met extra beugels, Quaife ATB-sper en stijve aandrijflijnmontage. Tractie en koppelpieken blijven belangrijk.","specs":"O2Q 6MT · Quaife ATB · verstevigingen · performance clutch","price":5350,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":840,"shiftSeconds":0.245,"transEfficiency":0.915,"reliabilityBonus":5,"massDeltaKg":3,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"built_6mt","name":"Built 6MT + twin-disc","detail":"Versterkte bak, sper en twin-disc koppeling.","specs":"Plate LSD · dog synchros · twin-disc","price":4200,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":780,"shiftSeconds":0.24,"transEfficiency":0.91,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.08,2.05,1.5,1.17,0.94,0.78],"finalDrive":4.06,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dq250","name":"DQ250 Stage 3","detail":"Snelle, consistente shifts. Clutch packs, koeling en koppelmanagement zijn essentieel.","specs":"Wet DCT · upgraded clutches","price":5800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":860,"shiftSeconds":0.115,"transEfficiency":0.875,"reliabilityBonus":4,"massDeltaKg":18,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.46,2.15,1.46,1.08,0.86,0.72],"finalDrive":3.45,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"sequential","name":"6-speed sequential dogbox","detail":"Zeer snelle racebak met weinig vermogensonderbreking.","specs":"Straight-cut · dog engagement","price":12500,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":1180,"shiftSeconds":0.065,"transEfficiency":0.925,"reliabilityBonus":5,"massDeltaKg":-5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[2.75,1.95,1.52,1.24,1.05,0.91],"finalDrive":4.1,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"liberty","name":"4-speed drag dogbox","detail":"Drag-only verhoudingen voor enorme vermogens en minder shifts.","specs":"4-speed · clutchless/dog · spool diff","price":21000,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":1700,"shiftSeconds":0.05,"transEfficiency":0.94,"reliabilityBonus":3,"massDeltaKg":4,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[2.45,1.68,1.27,1],"finalDrive":3.7,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_5speed","name":"5-speed Promod drag transmission","detail":"Clutchless vijfversnellingsbak, spool/dragdiff en verhoudingen voor een smalle high-rpm powerband.","specs":"5-speed clutchless · straight-cut · spool","price":36500,"transTorque":2450,"shiftSeconds":0.038,"transEfficiency":0.945,"reliabilityBonus":5,"massDeltaKg":8,"gearRatios":[2.56,1.78,1.36,1.1,0.92],"finalDrive":3.55}]},{"id":"spool","label":"Spool assistance","short":"Spool","items":[{"id":"none","name":"Geen spool assistance","detail":"Turbo bouwt uitsluitend op uitlaatenergie op. Het meest voorspelbaar en minst belastend.","specs":"Geen anti-lag · geen nitrous","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"mild_als","name":"Milde rolling anti-lag","detail":"Retard en extra lucht/brandstof houden de turbine op snelheid. Meer EGT en onderhoud.","specs":"Rolling ALS · EGT-limited","price":850,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":350,"nitrousHp":0,"spoolHeat":0.18,"wearFactor":0.08,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hard_als","name":"Drag anti-lag","detail":"Agressieve ignition cut/retard. Sneller op boost, zwaar voor turbine, spruitstuk en kleppen.","specs":"Hard ALS · launch/rolling modes","price":1650,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":700,"nitrousHp":0,"spoolHeat":0.45,"wearFactor":0.22,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_50","name":"50 hp nitrous spool shot","detail":"Kleine droge/natte shot die afbouwt zodra boost binnenkomt.","specs":"50 hp · pressure switch · progressive cut","price":1250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":550,"nitrousHp":50,"spoolHeat":0.1,"wearFactor":0.09,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_100","name":"100 hp nitrous spool shot","detail":"Duidelijk snellere spool; brandstof- en ontstekingsstrategie moeten kloppen.","specs":"100 hp · progressive controller","price":1750,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":950,"nitrousHp":100,"spoolHeat":0.18,"wearFactor":0.17,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_150","name":"150 hp nitrous spool shot","detail":"Race-only. Grote cilinderdrukpuls voordat de turbo volledig meedoet.","specs":"150 hp · staged progressive","price":2350,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":1300,"nitrousHp":150,"spoolHeat":0.26,"wearFactor":0.29,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_250","name":"250 hp staged nitrous spool system","detail":"Meervoudig progressief spoolshot voor extreem grote turbo’s. Vereist passende brandstof-, ontstekings- en cilinderdrukmarge.","specs":"250 hp staged · boost-referenced cut · race-only","price":3850,"spoolShiftRpm":1900,"nitrousHp":250,"spoolHeat":0.38,"wearFactor":0.44}]}];
  const CATEGORIES = RAW_CATEGORIES.map(c => ({ ...c, items: c.items.map(p => ({ ...METRIC_DEFAULTS, ...p })) }));
  const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  // prettier-ignore
  const OILS = [{"id":"0w30_504","name":"0W-30 VW 504/507","detail":"Snelle koude flow en laag pompverlies. Minder film- en drukmarge bij zeer hoge olietemperatuur.","coldFlow":1,"hotViscosity":0.79,"film":0.8,"drag":0.992,"tempTolerance":122,"price":58},{"id":"5w30_504","name":"5W-30 VW 504/507","detail":"OEM-achtige allround olie voor standaard tot milde straatbelasting.","coldFlow":0.94,"hotViscosity":0.85,"film":0.85,"drag":0.997,"tempTolerance":126,"price":54},{"id":"5w40_502","name":"5W-40 VW 502/505","detail":"Meer warme druk en filmsterkte; logische straatkeuze voor een getunede EA888.","coldFlow":0.9,"hotViscosity":0.94,"film":0.94,"drag":1.004,"tempTolerance":132,"price":52},{"id":"5w40_ester","name":"5W-40 ester performance","detail":"Hoge filmsterkte en afschuifstabiliteit zonder extreem dikke koude viscositeit.","coldFlow":0.89,"hotViscosity":0.99,"film":1.02,"drag":1.006,"tempTolerance":138,"price":78},{"id":"10w50_ester","name":"10W-50 ester race/road","detail":"Sterke warme film voor hoge lagerbelasting. Koud rustig warmrijden.","coldFlow":0.78,"hotViscosity":1.09,"film":1.1,"drag":1.014,"tempTolerance":145,"price":86},{"id":"10w60_race","name":"10W-60 race","detail":"Zeer hoge warme viscositeit. Kan bij koude motor onnodig zwaar pompen en warmte maken.","coldFlow":0.7,"hotViscosity":1.18,"film":1.15,"drag":1.025,"tempTolerance":151,"price":91},{"id":"15w50_race","name":"15W-50 race","detail":"Drag/circuitolie voor warme motor en ruime lagerspelingen; niet ideaal voor dagelijks koud starten.","coldFlow":0.62,"hotViscosity":1.12,"film":1.12,"drag":1.02,"tempTolerance":148,"price":84}];
  const OIL_MAP = Object.fromEntries(OILS.map(o => [o.id, o]));
  // prettier-ignore
  const FILTERS = [{"id":"oem","name":"OEM kwaliteitsfilter","flow":0.94,"capture":0.96,"price":16},{"id":"highflow","name":"High-flow performancefilter","flow":1,"capture":0.93,"price":24},{"id":"motorsport","name":"Motorsportfilter + magneetplug","flow":1.04,"capture":0.98,"price":42}];
  const FILTER_MAP = Object.fromEntries(FILTERS.map(f => [f.id, f]));
  // prettier-ignore
  const TIRE_COMPOUNDS = [{"id":"street","name":"Straatband","mu":0.98,"rolling":0.014,"optimumBar":2.35,"heat":0.93},{"id":"uhp","name":"UHP zomerband","mu":1.12,"rolling":0.013,"optimumBar":2.2,"heat":0.98},{"id":"semislick","name":"Semi-slick","mu":1.28,"rolling":0.015,"optimumBar":1.95,"heat":1.02},{"id":"drag_radial","name":"Drag radial","mu":1.49,"rolling":0.019,"optimumBar":1.35,"heat":1.06},{"id":"slick","name":"Bias-ply slick","mu":1.65,"rolling":0.022,"optimumBar":0.85,"heat":1.08},{"id":"pro_radial","name":"Pro drag radial","mu":1.76,"rolling":0.021,"optimumBar":1.05,"heat":1.1}];
  const TIRE_MAP = Object.fromEntries(TIRE_COMPOUNDS.map(t => [t.id, t]));
  // prettier-ignore
  const DRIVETRAINS = {"FWD":{"name":"FWD","frontStatic":0.63,"loss":0.1,"mass":0,"tractionUse":1},"RWD":{"name":"RWD swap","frontStatic":0.51,"loss":0.13,"mass":35,"tractionUse":1},"AWD":{"name":"AWD","frontStatic":0.56,"loss":0.17,"mass":95,"tractionUse":0.92}};
  // prettier-ignore
  const PRESETS = {"stock":{"name":"OEM CAWB 200","selections":{"block":"oem_block","crank":"oem_crank","oiling":"wet_sump","head":"oem_head","valvetrain":"oem_valves","turbo":"k03","air":"oem_air","fuelSystem":"oem_fuel","fuel":"ron98","exhaust":"oem_exhaust","ecu":"med17","ignition":"oem_ignition","sealing":"oem_bolts","transmission":"oem_6mt","spool":"none","crankcase":"oem_pcv","boostControl":"oem_internal","manifold":"oem_manifold","sensors":"oem_sensors"},"tune":{"boostLowBar":0.5,"boostMidBar":0.82,"boostHighBar":0.6,"lambda":0.82,"ignitionTrimDeg":0,"revLimitRpm":6500,"railTargetBar":150,"intakeCamAdvanceDeg":18,"launchRpm":3000,"firstGearBoostPct":76,"secondGearBoostPct":90}},"k04":{"name":"K04 straat","selections":{"block":"rods","crank":"fluidampr","oiling":"baffled","head":"mild_cams","valvetrain":"springs","turbo":"k04","air":"fmic","fuelSystem":"nostrum","fuel":"ron98","exhaust":"catted_3","ecu":"custom_med17","ignition":"fresh_coils","sealing":"studs","transmission":"built_6mt","spool":"none","crankcase":"catch_can","boostControl":"uprated_internal","manifold":"ported_oem","sensors":"street_sensor_pack"},"tune":{"boostLowBar":1.15,"boostMidBar":1.7,"boostHighBar":1.25,"lambda":0.8,"ignitionTrimDeg":-0.5,"revLimitRpm":7200,"railTargetBar":170,"intakeCamAdvanceDeg":12,"launchRpm":3800,"firstGearBoostPct":62,"secondGearBoostPct":82}},"randy":{"name":"Randy CAWB JE83 K04","selections":{"block":"randy_je83","crank":"randy_balanced_crank","oiling":"baffled","head":"randy_catcams","valvetrain":"randy_ferrea","turbo":"k04_hybrid","air":"wmi","fuelSystem":"randy_nostrum_rsx","fuel":"blend_wmi","exhaust":"race_3","ecu":"randy_syvecs","ignition":"fresh_coils","sealing":"randy_cometic_arp","transmission":"randy_o2q","spool":"none","crankcase":"catch_can","boostControl":"uprated_internal","manifold":"ported_oem","sensors":"motorsport_sensors"},"tune":{"boostLowBar":0.95,"boostMidBar":1.88,"boostHighBar":1.72,"lambda":0.79,"ignitionTrimDeg":-0.5,"revLimitRpm":8000,"railTargetBar":175,"intakeCamAdvanceDeg":8,"exhaustTdcLiftMm":0.85,"intakeTdcLiftMm":0.25,"vvtEnabled":true,"launchRpm":4200,"firstGearBoostPct":55,"secondGearBoostPct":78,"knockControl":true,"railPressureCut":true,"lambdaProtection":true,"methFailsafe":true,"oilPressureProtection":true,"overboostCut":true}},"hx52":{"name":"HX52 high-rpm","selections":{"block":"randy_je83","crank":"randy_balanced_crank","oiling":"baffled","head":"randy_catcams","valvetrain":"randy_ferrea","turbo":"hx52","air":"wmi","fuelSystem":"race_fuel","fuel":"e85","exhaust":"side_35","ecu":"randy_syvecs","ignition":"fresh_coils","sealing":"fire_ring","transmission":"sequential","spool":"mild_als","crankcase":"vented_can","boostControl":"dual_44","manifold":"cast_plenum","sensors":"motorsport_sensors"},"tune":{"boostLowBar":0.3,"boostMidBar":1.1,"boostHighBar":2.2,"lambda":0.78,"ignitionTrimDeg":-1,"revLimitRpm":8400,"railTargetBar":185,"intakeCamAdvanceDeg":4,"launchRpm":5000,"firstGearBoostPct":48,"secondGearBoostPct":72}},"pro98":{"name":"98-mm Pro Mod 2.0","selections":{"block":"promod_block","crank":"promod_crank","oiling":"promod_drysump","head":"ported_head","valvetrain":"solid_lifter","turbo":"9894","air":"ice_tank","fuelSystem":"promod_methanol_fuel","fuel":"methanol","exhaust":"hood_4","ecu":"promod_ecu","ignition":"dual_cdi","sealing":"receiver_ring_extreme","transmission":"promod_5speed","spool":"n2o_150","crankcase":"vacuum_pump","boostControl":"dual_60_co2","manifold":"sheetmetal_105","sensors":"pro_instrumentation"},"tune":{"boostLowBar":0.1,"boostMidBar":0.8,"boostHighBar":2.6,"lambda":0.74,"ignitionTrimDeg":-2,"revLimitRpm":9500,"railTargetBar":225,"intakeCamAdvanceDeg":0,"launchRpm":6800,"firstGearBoostPct":45,"secondGearBoostPct":68},"service":{"oilId":"10w60_race","liters":5.0,"filterId":"motorsport","oilAgeKm":0,"oilRuns":0},"assembly":{"topRingGapMm":0.56,"secondRingGapMm":0.62,"rodClearanceMm":0.06,"mainClearanceMm":0.058,"sparkGapMm":0.52,"balanceQualityPct":100,"deckSealQualityPct":100,"fastenerProcedurePct":100,"oilPrimed":true}},"outlaw106":{"name":"106-mm Outlaw experiment","selections":{"block":"promod_block","crank":"promod_crank","oiling":"promod_drysump","head":"ported_head","valvetrain":"solid_lifter","turbo":"106mm","air":"ice_tank","fuelSystem":"promod_methanol_fuel","fuel":"methanol","exhaust":"hood_4","ecu":"promod_ecu","ignition":"dual_cdi","sealing":"receiver_ring_extreme","transmission":"promod_5speed","spool":"n2o_150","crankcase":"vacuum_pump","boostControl":"dual_60_co2","manifold":"sheetmetal_105","sensors":"pro_instrumentation"},"tune":{"boostLowBar":0.05,"boostMidBar":0.65,"boostHighBar":2.8,"lambda":0.73,"ignitionTrimDeg":-2.5,"revLimitRpm":9200,"railTargetBar":225,"intakeCamAdvanceDeg":-1,"launchRpm":7200,"firstGearBoostPct":42,"secondGearBoostPct":65},"service":{"oilId":"10w60_race","liters":5.0,"filterId":"motorsport","oilAgeKm":0,"oilRuns":0},"assembly":{"topRingGapMm":0.57,"secondRingGapMm":0.63,"rodClearanceMm":0.06,"mainClearanceMm":0.058,"sparkGapMm":0.5,"balanceQualityPct":100,"deckSealQualityPct":100,"fastenerProcedurePct":100,"oilPrimed":true}},"unlimited127":{"name":"127-mm Unlimited 2.0","selections":{"block":"promod_block","crank":"promod_crank","oiling":"promod_drysump","crankcase":"vacuum_pump","head":"promod_head","valvetrain":"promod_valvetrain","turbo":"127mm","boostControl":"dual_60_co2","air":"promod_ice_system","manifold":"billet_120","fuelSystem":"promod_methanol_fuel","fuel":"methanol","exhaust":"hood_4","ecu":"promod_ecu","sensors":"pro_instrumentation","ignition":"dual_cdi","sealing":"receiver_ring_extreme","transmission":"promod_5speed","spool":"n2o_250"},"tune":{"boostLowBar":0.05,"boostMidBar":0.3,"boostHighBar":2.8,"lambda":0.72,"ignitionTrimDeg":-3.0,"revLimitRpm":9800,"railTargetBar":225,"intakeCamAdvanceDeg":-2,"launchRpm":7800,"firstGearBoostPct":34,"secondGearBoostPct":54},"assembly":{"topRingGapMm":0.58,"secondRingGapMm":0.64,"rodClearanceMm":0.062,"mainClearanceMm":0.06,"sparkGapMm":0.49,"balanceQualityPct":100,"deckSealQualityPct":100,"fastenerProcedurePct":100,"oilPrimed":true},"service":{"oilId":"10w60_race","liters":5.0,"filterId":"motorsport","oilAgeKm":0,"oilRuns":0}}};

  const BENCH_TESTS = [
    { id: 'oilPrime', name: 'Oliedruk primen', detail: 'Controleert de gemodelleerde druk bij starttoerental vóór de eerste pull.' },
    { id: 'compression', name: 'Compressietest', detail: 'Vergelijkt de vier cilinders en laat spreiding of afdichtingsverlies zien.' },
    { id: 'leakdown', name: 'Leak-down test', detail: 'Schat ring-, klep- en koppakkingafdichting per cilinder.' },
    {
      id: 'fuelFlow',
      name: 'Brandstofsysteem flowtest',
      detail: 'Test pomp-, injector- en railmarge zonder vermogen vooraf te verklappen.'
    },
    { id: 'camCheck', name: 'Nokken timingcontrole', detail: 'Controleert overlap-TDC lift en VVT-basispositie.' },
    { id: 'sparkCheck', name: 'Ontsteking & bougiegap', detail: 'Controleert gap en beschikbare vonkmarge tegen de gevraagde boost.' }
  ];

  const CHALLENGES = [
    { id: 'first_pull', title: 'Eerste volledige pull', reward: 750, detail: 'Sla een volledige dynopull zonder afbreken op.' },
    { id: 'safe500', title: '500 pk met marge', reward: 1800, detail: 'Minimaal 500 pk en betrouwbaarheid 80/100 of hoger.' },
    { id: 'k04_hero', title: 'K04 boven 500', reward: 2200, detail: 'Minimaal 500 pk met K04/K04-hybrid en een geldige pull.' },
    { id: 'bench_master', title: 'Testbankmeester', reward: 1600, detail: 'Alle zes benchtests actueel en zonder fail-resultaat.' },
    { id: 'fwd11', title: 'FWD 11-secondenkaart', reward: 2500, detail: 'Geldige FWD-pass onder 12,000 seconden.' },
    { id: 'fwd10', title: 'FWD tiener', reward: 4800, detail: 'Geldige FWD-pass onder 11,000 seconden.' },
    { id: 'seven_hundred', title: '700-club', reward: 3000, detail: 'Minimaal 700 pk met betrouwbaarheid 68/100 of hoger.' },
    { id: 'four_digits', title: 'Vier cijfers', reward: 6500, detail: 'Minimaal 1000 pk zonder afgebroken dynopull.' },
    {
      id: 'big_turbo_survivor',
      title: '98+ mm overlever',
      reward: 7200,
      detail: 'Volledige pull met minimaal 98-mm compressor en betrouwbaarheid 55/100 of hoger.'
    }
  ];

  function defaultSelections() {
    return {
      block: 'randy_je83',
      crank: 'randy_balanced_crank',
      oiling: 'baffled',
      crankcase: 'catch_can',
      head: 'randy_catcams',
      valvetrain: 'randy_ferrea',
      turbo: 'k04_hybrid',
      boostControl: 'uprated_internal',
      air: 'wmi',
      manifold: 'ported_oem',
      fuelSystem: 'randy_nostrum_rsx',
      fuel: 'blend_wmi',
      exhaust: 'race_3',
      ecu: 'randy_syvecs',
      sensors: 'motorsport_sensors',
      ignition: 'fresh_coils',
      sealing: 'randy_cometic_arp',
      transmission: 'randy_o2q',
      spool: 'none'
    };
  }
  function defaultTune() {
    return {
      boostLowBar: 0.95,
      boostMidBar: 1.88,
      boostHighBar: 1.72,
      lambda: 0.79,
      ignitionTrimDeg: -0.5,
      revLimitRpm: 8000,
      railTargetBar: 175,
      intakeCamAdvanceDeg: 8,
      exhaustTdcLiftMm: 0.85,
      intakeTdcLiftMm: 0.25,
      vvtEnabled: true,
      launchRpm: 4200,
      firstGearBoostPct: 55,
      secondGearBoostPct: 78,
      knockControl: true,
      railPressureCut: true,
      lambdaProtection: true,
      methFailsafe: true,
      oilPressureProtection: true,
      overboostCut: true,
      als: defaultAntiLag()
    };
  }
  function defaultAssembly() {
    return {
      topRingGapMm: 0.52,
      secondRingGapMm: 0.58,
      rodClearanceMm: 0.055,
      mainClearanceMm: 0.052,
      sparkGapMm: 0.6,
      balanceQualityPct: 98,
      deckSealQualityPct: 97,
      fastenerProcedurePct: 98,
      oilPrimed: true
    };
  }
  function blankState() {
    return {
      version: 12,
      buildName: 'Randy CAWB JE83 K04',
      selections: defaultSelections(),
      tune: defaultTune(),
      assembly: defaultAssembly(),
      bench: { results: {} },
      dynoConfig: { rampRpmPerSec: 550, fanSpeedPct: 85, ambientTempC: 20, baroKpa: 101.3 },
      service: {
        oilId: '5w40_ester',
        liters: 4.6,
        filterId: 'motorsport',
        oilAgeKm: 1800,
        oilRuns: 4,
        lastChangeLabel: 'voor deze update',
        coolantQuality: 0.96
      },
      vehicle: {
        drivetrain: 'FWD',
        massKg: 1350,
        tireCompound: 'uhp',
        rimDiameterIn: 19,
        rimWidthIn: 8.5,
        tireWidthMm: 245,
        aspectRatio: 35,
        pressureBar: 2.2,
        wheelMassKg: 12.4,
        preparedTrack: false,
        ambientTempC: 20,
        trackTempC: 28,
        altitudeM: 12,
        humidityPct: 68,
        headwindKmh: 0,
        burnoutLevel: 15,
        shiftRpm: 7600,
        suspensionTransferPct: 60,
        cdA: 0.68,
        wheelbaseM: 2.58,
        cgHeightM: 0.51,
        raceMode: 'heads_up',
        rivalLevel: 'street',
        steeringAssistPct: 22,
        steeringSensitivityPct: 100
      },
      wear: { engine: 5, turbo: 3, transmission: 4, manifold: 0, valves: 0 },
      damage: { engine: 0, turbo: 0, transmission: 0 },
      bank: 50000,
      lastDyno: null,
      lastDynoSignature: '',
      lastDrag: null,
      dynoRuns: [],
      dragRuns: [],
      records: { FWD: null, RWD: null, AWD: null },
      achievements: {},
      buildSlots: [null, null, null],
      settings: { sound: true, haptics: true, reducedMotion: false },
      history: []
    };
  }

  function getPart(state, categoryId) {
    const cat = CATEGORY_MAP[categoryId];
    if (!cat) throw new Error(`Unknown category ${categoryId}`);
    return cat.items.find(x => x.id === state.selections[categoryId]) || cat.items[0];
  }
  function normalizeState(input) {
    const base = blankState();
    if (!input || typeof input !== 'object') return base;
    const s = { ...base, ...input };
    for (const k of [
      'selections',
      'tune',
      'assembly',
      'service',
      'vehicle',
      'wear',
      'damage',
      'settings',
      'dynoConfig',
      'records',
      'achievements'
    ])
      s[k] = { ...base[k], ...(input[k] || {}) };
    s.tune.als = { ...defaultAntiLag(), ...((input.tune && input.tune.als) || {}) };
    s.bench = { ...base.bench, ...(input.bench || {}), results: { ...(base.bench.results || {}), ...((input.bench || {}).results || {}) } };
    s.dynoRuns = Array.isArray(input.dynoRuns) ? input.dynoRuns.slice(0, 20).map(sanitizeDynoResult).filter(Boolean) : [];
    s.lastDyno = sanitizeDynoResult(input.lastDyno);
    s.dragRuns = Array.isArray(input.dragRuns) ? input.dragRuns.slice(0, 30) : [];
    s.history = Array.isArray(input.history) ? input.history.slice(0, 60) : [];
    s.version = 12;
    for (const cat of CATEGORIES) if (!cat.items.some(x => x.id === s.selections[cat.id])) s.selections[cat.id] = cat.items[0].id;
    if (!OIL_MAP[s.service.oilId]) s.service.oilId = base.service.oilId;
    if (!FILTER_MAP[s.service.filterId]) s.service.filterId = base.service.filterId;
    if (!TIRE_MAP[s.vehicle.tireCompound]) s.vehicle.tireCompound = base.vehicle.tireCompound;
    if (!DRIVETRAINS[s.vehicle.drivetrain]) s.vehicle.drivetrain = base.vehicle.drivetrain;
    return s;
  }

  function compactObject(obj, decimals = 3) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) out[k] = typeof v === 'number' ? round(v, decimals) : v;
    return out;
  }
  function engineSignature(inputState) {
    const s = normalizeState(inputState),
      t = s.tune;
    // The physics model version is part of the signature: a pull measured with
    // an older model is shown as historical, never as the current result.
    return JSON.stringify({
      model: ENGINE_MODEL_VERSION,
      selections: s.selections,
      // Anti-lag only acts off-throttle / on the two-step, never in a WOT dyno pull.
      tune: { ...compactObject({ ...t, als: undefined }, 3), revLimitRpm: Math.round(t.revLimitRpm) },
      assembly: compactObject(s.assembly, 3),
      oil: { id: s.service.oilId, liters: round(s.service.liters, 2), filter: s.service.filterId },
      dyno: compactObject(s.dynoConfig, 2)
    });
  }
  function benchSignature(inputState) {
    const s = normalizeState(inputState);
    return JSON.stringify({
      selections: s.selections,
      tune: {
        revLimitRpm: s.tune.revLimitRpm,
        railTargetBar: s.tune.railTargetBar,
        exhaustTdcLiftMm: s.tune.exhaustTdcLiftMm,
        intakeTdcLiftMm: s.tune.intakeTdcLiftMm,
        vvtEnabled: s.tune.vvtEnabled,
        boostHighBar: s.tune.boostHighBar,
        boostMidBar: s.tune.boostMidBar
      },
      assembly: compactObject(s.assembly, 3),
      service: { oilId: s.service.oilId, liters: round(s.service.liters, 2) },
      wear: s.wear,
      damage: s.damage
    });
  }
  function isDynoCurrent(state) {
    return !!(state.lastDyno && state.lastDynoSignature === engineSignature(state));
  }

  function engineGeometry(inputState) {
    const s = normalizeState(inputState),
      block = getPart(s, 'block');
    const boreMm = Number(block.boreMm || 82.5),
      strokeMm = Number(block.strokeMm || 92.8),
      cylinders = 4;
    const displacementCc = ((Math.PI / 4) * boreMm * boreMm * strokeMm * cylinders) / 1000;
    return {
      boreMm,
      strokeMm,
      cylinders,
      displacementCc,
      displacementL: displacementCc / 1000,
      compressionRatio: Number(block.compressionRatio || 9.6)
    };
  }
  function camTimingHealth(inputState) {
    const s = normalizeState(inputState),
      head = getPart(s, 'head');
    if (!Number.isFinite(head.targetExhaustTdcMm) || !Number.isFinite(head.targetIntakeTdcMm))
      return { applicable: false, score: 1, exhaustErrorMm: 0, intakeErrorMm: 0, targetExhaustTdcMm: null, targetIntakeTdcMm: null };
    const exhaustErrorMm = Math.abs(Number(s.tune.exhaustTdcLiftMm) - head.targetExhaustTdcMm),
      intakeErrorMm = Math.abs(Number(s.tune.intakeTdcLiftMm) - head.targetIntakeTdcMm);
    const score = clamp(1 - (exhaustErrorMm / 0.23 + intakeErrorMm / 0.14) * 0.28, 0.55, 1);
    return {
      applicable: true,
      score,
      exhaustErrorMm,
      intakeErrorMm,
      targetExhaustTdcMm: head.targetExhaustTdcMm,
      targetIntakeTdcMm: head.targetIntakeTdcMm
    };
  }

  function assemblyTargets(inputState) {
    const s = normalizeState(inputState),
      g = engineGeometry(s),
      boost = Math.max(s.tune.boostLowBar, s.tune.boostMidBar, s.tune.boostHighBar),
      rev = s.tune.revLimitRpm;
    const top = clamp(0.42 + boost * 0.045 + Math.max(0, g.boreMm - 82.5) * 0.01, 0.42, 0.72);
    return {
      topRingGapMm: top,
      secondRingGapMm: top + 0.05,
      rodClearanceMm: clamp(0.047 + (Math.max(0, rev - 7200) / 1000) * 0.003 + Math.max(0, boost - 2) * 0.002, 0.045, 0.066),
      mainClearanceMm: clamp(0.049 + (Math.max(0, rev - 7200) / 1000) * 0.003, 0.047, 0.067),
      sparkGapMm: clamp(0.73 - boost * 0.075, 0.42, 0.7)
    };
  }
  function centeredScore(value, target, tolerance) {
    return clamp(1 - Math.abs(value - target) / Math.max(0.0001, tolerance), 0, 1);
  }
  function assemblyHealth(inputState) {
    const s = normalizeState(inputState),
      a = s.assembly,
      t = assemblyTargets(s);
    const top = centeredScore(a.topRingGapMm, t.topRingGapMm, 0.22),
      second = centeredScore(a.secondRingGapMm, t.secondRingGapMm, 0.24),
      rod = centeredScore(a.rodClearanceMm, t.rodClearanceMm, 0.027),
      main = centeredScore(a.mainClearanceMm, t.mainClearanceMm, 0.028),
      spark = centeredScore(a.sparkGapMm, t.sparkGapMm, 0.28);
    const ringTightRisk = clamp((t.topRingGapMm - a.topRingGapMm) / 0.16, 0, 1.5),
      ringWideRisk = clamp((a.topRingGapMm - t.topRingGapMm) / 0.3, 0, 1),
      bearingTightRisk = clamp((t.rodClearanceMm - a.rodClearanceMm) / 0.018, 0, 1.5),
      bearingLooseRisk = clamp((a.mainClearanceMm - t.mainClearanceMm) / 0.025, 0, 1.2);
    const procedure =
      (clamp(a.balanceQualityPct, 0, 100) + clamp(a.deckSealQualityPct, 0, 100) + clamp(a.fastenerProcedurePct, 0, 100)) / 300;
    const score = clamp(
      top * 0.16 + second * 0.1 + rod * 0.16 + main * 0.16 + spark * 0.12 + procedure * 0.25 + (a.oilPrimed ? 1 : 0) * 0.05,
      0,
      1
    );
    return {
      score,
      targets: t,
      ringScore: (top + second) / 2,
      bearingScore: (rod + main) / 2,
      sparkScore: spark,
      procedureScore: procedure,
      ringTightRisk,
      ringWideRisk,
      bearingTightRisk,
      bearingLooseRisk,
      oilPrimed: !!a.oilPrimed
    };
  }

  function runBenchTest(inputState, id) {
    const s = normalizeState(inputState),
      sig = benchSignature(s),
      rand = mulberry32(fnv1a(sig + '|' + id)),
      a = assemblyHealth(s),
      g = engineGeometry(s),
      cam = camTimingHealth(s);
    const wear = s.wear.engine * 0.08 + s.damage.engine * 0.24;
    let score = 100,
      status = 'pass',
      summary = '',
      values = [];
    if (id === 'oilPrime') {
      const pressure = Math.max(
        0.2,
        1.05 +
          a.bearingScore * 1.25 +
          (s.service.liters - 4.1) * 0.28 +
          (s.assembly.oilPrimed ? 0.45 : -1.1) -
          s.damage.engine * 0.015 +
          (rand() - 0.5) * 0.12
      );
      score = clamp(((pressure - 0.5) / 1.7) * 100, 0, 100);
      status = pressure >= 1.4 ? 'pass' : pressure >= 0.9 ? 'warn' : 'fail';
      summary = `${pressure.toFixed(2)} bar bij gesimuleerd starttoerental`;
      values = [
        ['Oliedruk', `${pressure.toFixed(2)} bar`],
        ['Vulniveau', `${s.service.liters.toFixed(1)} L`],
        ['Geprimed', s.assembly.oilPrimed ? 'ja' : 'nee']
      ];
    } else if (id === 'compression') {
      const base = 11.2 * (g.compressionRatio / 9.6) * (0.97 + a.ringScore * 0.03) - wear * 0.018;
      const cylinders = [];
      for (let i = 0; i < 4; i++) cylinders.push(Math.max(4, base + (rand() - 0.5) * 0.35 - (i === 0 ? s.damage.engine * 0.025 : 0)));
      const min = Math.min(...cylinders),
        max = Math.max(...cylinders),
        spread = ((max - min) / max) * 100;
      score = clamp(100 - spread * 5 - Math.max(0, 9.5 - min) * 12, 0, 100);
      status = score >= 80 ? 'pass' : score >= 60 ? 'warn' : 'fail';
      summary = `spreiding ${spread.toFixed(1)}% over vier cilinders`;
      values = cylinders.map((v, i) => [`Cilinder ${i + 1}`, `${v.toFixed(1)} bar`]);
    } else if (id === 'leakdown') {
      const base = 3.0 + (1 - a.ringScore) * 9 + s.wear.engine * 0.1 + s.damage.engine * 0.3 + a.ringWideRisk * 4;
      const cyl = [];
      for (let i = 0; i < 4; i++) cyl.push(Math.max(1, base + (rand() - 0.5) * 2.0 + (i === 0 ? s.damage.engine * 0.05 : 0)));
      const avg = cyl.reduce((x, y) => x + y, 0) / 4,
        max = Math.max(...cyl);
      score = clamp(105 - avg * 4 - max * 1.2, 0, 100);
      status = max < 9 ? 'pass' : max < 15 ? 'warn' : 'fail';
      summary = `gemiddeld ${avg.toFixed(1)}% verlies`;
      values = cyl.map((v, i) => [`Cilinder ${i + 1}`, `${v.toFixed(1)}%`]);
    } else if (id === 'fuelFlow') {
      const fs = getPart(s, 'fuelSystem'),
        fuel = getPart(s, 'fuel');
      const capacity = fs.fuelSystemHp * fuel.fuelFlowFactor;
      const demand = Math.max(220, turboFlowCapacityHp(getPart(s, 'turbo').id) * 0.72);
      const margin = ((capacity - demand) / demand) * 100;
      const rail = Math.min(s.tune.railTargetBar, fs.maxRailBar) - Math.max(0, -margin) * 0.25;
      score = clamp(72 + margin * 0.8, 0, 100);
      status = margin >= 12 ? 'pass' : margin >= -5 ? 'warn' : 'fail';
      summary = `${margin >= 0 ? '+' : ''}${margin.toFixed(0)}% theoretische flowmarge`;
      values = [
        ['Capaciteit', `${Math.round(capacity)} pk-equivalent`],
        ['Testvraag', `${Math.round(demand)} pk-equivalent`],
        ['Rail', `${Math.round(rail)} bar`]
      ];
    } else if (id === 'camCheck') {
      score = Math.round(cam.score * 100);
      status = !cam.applicable || score >= 88 ? 'pass' : score >= 72 ? 'warn' : 'fail';
      summary = cam.applicable ? `${score}% match met de ingevoerde camdata` : 'OEM timing zonder aparte overlap-doelwaarde';
      values = [
        ['Uitlaat TDC', `${s.tune.exhaustTdcLiftMm.toFixed(2)} mm`],
        ['Inlaat TDC', `${s.tune.intakeTdcLiftMm.toFixed(2)} mm`],
        ['VVT basis', s.tune.vvtEnabled ? 'aangesloten' : 'uitgeschakeld']
      ];
    } else if (id === 'sparkCheck') {
      const ign = getPart(s, 'ignition'),
        target = a.targets.sparkGapMm,
        gap = s.assembly.sparkGapMm,
        boost = Math.max(s.tune.boostMidBar, s.tune.boostHighBar);
      const margin = ign.sparkBoostLimit - boost - (gap - target) * 3.2;
      score = clamp(72 + margin * 18 - a.ringTightRisk * 2, 0, 100);
      status = score >= 80 ? 'pass' : score >= 58 ? 'warn' : 'fail';
      summary = `bougiegap ${gap.toFixed(2)} mm · berekende boostmarge ${margin.toFixed(2)} bar`;
      values = [
        ['Doelgebied', `rond ${target.toFixed(2)} mm`],
        ['Ingesteld', `${gap.toFixed(2)} mm`],
        ['Bobines', getPart(s, 'ignition').name]
      ];
    } else throw new Error(`Unknown bench test ${id}`);
    return { id, signature: sig, measuredAt: new Date().toISOString(), score: Math.round(score), status, summary, values };
  }
  function benchConfidence(inputState) {
    const s = normalizeState(inputState),
      sig = benchSignature(s),
      results = s.bench.results || {};
    let current = 0,
      score = 0,
      failed = 0;
    for (const test of BENCH_TESTS) {
      const r = results[test.id];
      if (r && r.signature === sig) {
        current++;
        score += r.score;
        if (r.status === 'fail') failed++;
      }
    }
    return {
      current,
      total: BENCH_TESTS.length,
      score: current ? Math.round(score / current) : 0,
      failed,
      complete: current === BENCH_TESTS.length
    };
  }

  function tireGeometry(vehicle) {
    const rimMm = Number(vehicle.rimDiameterIn) * 25.4,
      sidewallMm = (Number(vehicle.tireWidthMm) * Number(vehicle.aspectRatio)) / 100,
      diameterMm = rimMm + 2 * sidewallMm,
      circumferenceM = (Math.PI * diameterMm) / 1000;
    return { rimMm, sidewallMm, diameterMm, circumferenceM, radiusM: diameterMm / 2000, revPerKm: 1000 / circumferenceM };
  }
  function wheelFitment(vehicle) {
    const g = tireGeometry(vehicle),
      rimWidthMm = Number(vehicle.rimWidthIn) * 25.4,
      sectionRatio = Number(vehicle.tireWidthMm) / Math.max(1, rimWidthMm),
      diameterDeltaPct = ((g.diameterMm - 654.1) / 654.1) * 100,
      warnings = [];
    if (sectionRatio < 1.02) warnings.push('Band is sterk getrokken voor deze velgbreedte.');
    if (sectionRatio > 1.42) warnings.push('Band is erg breed/bol voor deze velgbreedte.');
    if (Math.abs(diameterDeltaPct) > 4.5) warnings.push('Buitendiameter wijkt meer dan 4,5% af van de referentie.');
    if (Number(vehicle.rimDiameterIn) >= 20 && Number(vehicle.aspectRatio) <= 30)
      warnings.push('Zeer kleine wang: minder launch-compliance en meer velgrisico.');
    const score = clamp(
      1 -
        Math.max(0, 1.04 - sectionRatio) * 1.3 -
        Math.max(0, sectionRatio - 1.38) * 0.9 -
        Math.max(0, Math.abs(diameterDeltaPct) - 3) * 0.015,
      0.72,
      1
    );
    return { ...g, rimWidthMm, sectionRatio, diameterDeltaPct, warnings, score };
  }
  function requestedBoostAt(tune, rpm, revLimit) {
    if (rpm <= 3200) return lerp(tune.boostLowBar * 0.55, tune.boostLowBar, clamp((rpm - 1500) / 1700, 0, 1));
    if (rpm <= 5200) return lerp(tune.boostLowBar, tune.boostMidBar, (rpm - 3200) / 2000);
    return lerp(tune.boostMidBar, tune.boostHighBar, clamp((rpm - 5200) / Math.max(700, revLimit - 5200), 0, 1));
  }
  function oilHealth(state) {
    return clamp(
      1 - Math.max(0, Number(state.service.oilAgeKm) || 0) / 18000 - Math.max(0, Number(state.service.oilRuns) || 0) * 0.006,
      0.5,
      1
    );
  }
  function calculateOilPressure(rpm, oilTemp, state, oiling, oil, filter, assembly = null) {
    const liters = Number(state.service.liters),
      levelFactor =
        liters < 4.1 ? clamp(0.55 + (liters - 3.5) * 0.75, 0.42, 1) : liters > 5.0 ? clamp(1 - (liters - 5.0) * 0.18, 0.82, 1) : 1,
      tempVisc = clamp(1.22 - Math.max(0, oilTemp - 90) * 0.0082, 0.48, 1.22),
      pump = 1.15 + (rpm / 1000) * 0.67;
    const clearance = assembly ? clamp(0.78 + assembly.bearingScore * 0.22 - assembly.bearingLooseRisk * 0.15, 0.62, 1.04) : 1;
    return Math.max(
      0.45,
      pump * oil.hotViscosity * tempVisc * (0.72 + oiling.oilControl * 0.33) * filter.flow * levelFactor * oilHealth(state) * clearance
    );
  }
  function minPositive(...values) {
    return Math.min(...values.filter(v => Number.isFinite(v) && v > 0));
  }
  function addWarning(list, condition, text, severity = 'warn', system = 'algemeen') {
    if (condition) list.push({ text, severity, system });
  }

  // Returns the first critical failure event at this sample, or null.
  // severity 0..1 expresses how far past the failure threshold the sample was.
  function criticalFailure(point, ctx) {
    const {
      tune,
      mechanicalHpLimit,
      componentTorqueLimit,
      componentRpmLimit,
      sealing,
      ignition,
      oiling,
      ecu,
      oilFilm,
      assembly,
      boostControl,
      sensors
    } = ctx;
    const over = (value, limit, span = 0.3) => clamp((value / Math.max(1e-9, limit) - 1) / span, 0, 1);
    const fail = (code, system, reason, severity) => ({ code, system, reason, severity: clamp(severity, 0, 1) });
    if (point.hp > mechanicalHpLimit * 1.18)
      return fail('mechanical_power', 'engine', 'Onderblok/krukas overschreed de mechanische vermogensmarge.', over(point.hp, mechanicalHpLimit * 1.18));
    if (point.torqueNm > componentTorqueLimit * 1.18)
      return fail('torque', 'engine', 'Koppelpiek overschreed de grens van motor of transmissie.', over(point.torqueNm, componentTorqueLimit * 1.18));
    if (point.rpm > componentRpmLimit * 1.04)
      return fail('overrev', 'engine', 'Valve-float of mechanische over-rev.', over(point.rpm, componentRpmLimit * 1.04, 0.1));
    if (point.bmepBar > sealing.headClampBmep * 1.15)
      return fail('head_lift', 'engine', 'Head-lift: cilinderdruk overschreed de sealingmarge.', over(point.bmepBar, sealing.headClampBmep * 1.15));
    if (point.fuelDutyPct > 113 && !tune.railPressureCut)
      return fail('lean_out', 'engine', 'Brandstofsysteem liep leeg: lean-out onder boost.', over(point.fuelDutyPct, 113));
    if (point.shaftSpeedPct > 112)
      return fail('turbo_overspeed', 'turbo', 'Turbo overspeed: asoptoerental boven de compressorgrens.', over(point.shaftSpeedPct, 112, 0.15));
    if (point.knockRisk > 1.35 || (point.knockRisk > 1.05 && !tune.knockControl))
      return fail('knock', 'engine', 'Zware knock/detonatie.', over(point.knockRisk, tune.knockControl ? 1.35 : 1.05));
    if (point.boostBar > ignition.sparkBoostLimit * 1.22 && ignition.sparkQuality < 1.01)
      return fail('misfire', 'engine', 'Ontstekingsuitval onder hoge cilinderdruk.', over(point.boostBar, ignition.sparkBoostLimit * 1.22));
    if (point.oilPressureBar < 1.75 && point.rpm > 5000 && !tune.oilPressureProtection)
      return fail('oil_pressure', 'engine', 'Lagerfalen door te lage oliedruk.', clamp((1.75 - point.oilPressureBar) / 0.8, 0, 1));
    if (point.oilFilmRisk > 1.75 || oilFilm < 0.48)
      return fail('oil_film', 'engine', 'Oliefilm brak af onder lager- en zuigerbelasting.', over(point.oilFilmRisk, 1.75));
    if (point.oilTempC > 164 && oiling.oilCooling < 0.6)
      return fail('oil_temp', 'engine', 'Olie oververhit; lager- en turboschade.', over(point.oilTempC, 164, 0.15));
    if (ecu.safetyQuality * sensors.sensorQuality < 0.42 && point.boostBar > 2.4 && point.rpm > 6500)
      return fail('ecu_control', 'engine', 'ECU/sensorstrategie kon de extreme hardware niet beheersen.', over(point.boostBar, 2.4));
    if (assembly.ringTightRisk > 1.05 && point.bmepBar > 32)
      return fail('ring_butt', 'engine', 'Zuigerring-einden liepen dicht onder temperatuur en cilinderdruk.', over(assembly.ringTightRisk, 1.05));
    if (assembly.bearingTightRisk > 1.05 && point.oilTempC > 135 && point.rpm > 7000)
      return fail('bearing_clearance', 'engine', 'Lagerclearance werd te krap bij temperatuur en toerental.', over(assembly.bearingTightRisk, 1.05));
    if (!assembly.oilPrimed && point.rpm > 3500)
      return fail('no_oil_prime', 'engine', 'Motor werd belast zonder geldige oliedruk-prime.', 0.6);
    if (point.boostBar > boostControl.boostHardwareMaxBar * 1.28 && !tune.overboostCut)
      return fail('boost_control', 'turbo', 'Wastegate/boostregeling verloor controle.', over(point.boostBar, boostControl.boostHardwareMaxBar * 1.28));
    return null;
  }

  // Engine air model calibration: the NA torque curve corresponds to a 308 K
  // manifold charge, and about 10 crank hp are made per lb/min of air.
  const CHARGE_REF_K = 308.15;
  const HP_PER_LBMIN_AIR = 10.0;
  // Power the compressor can flow at its choke limit (reference conditions).
  function turboFlowCapacityHp(turboId) {
    const map = Turbo.getMap(turboId);
    return map ? map.wMax * HP_PER_LBMIN_AIR : 10000;
  }

  // ---- Dyno result model ---------------------------------------------------
  // A dyno result only contains samples the simulated pull actually reached.
  // Every summary value (peaks, maxima, wear, damage) is derived from those
  // samples, so an aborted pull can never report data above its abort rpm.
  const DYNO_RESULT_VERSION = 2;
  // Bump when the engine/turbo physics changes (4.1: compressor-map turbo model).
  const ENGINE_MODEL_VERSION = '4.1';
  const DYNO_START_RPM = 1500;
  const DYNO_STEP_RPM = 100;
  // Below this many samples (400 rpm of data) a partial peak is not quoted.
  const DYNO_MIN_PARTIAL_SAMPLES = 5;
  const DYNO_STATUS = Object.freeze({ COMPLETED: 'completed', ABORTED: 'aborted', FAILED_TO_START: 'failed-to-start' });

  function isCompletedDyno(result) {
    return !!(result && result.status === DYNO_STATUS.COMPLETED && Array.isArray(result.samples) && result.samples.length > 0);
  }

  function summarizeDynoSamples(samples) {
    const list = Array.isArray(samples) ? samples : [];
    const out = {
      sampleCount: list.length,
      rpmStart: list.length ? list[0].rpm : null,
      rpmReached: list.length ? list[list.length - 1].rpm : null,
      peakHp: null,
      peakHpRpm: null,
      peakTorqueNm: null,
      peakTorqueRpm: null,
      maxBmepBar: null,
      maxMeanPistonSpeed: null,
      maxFuelDuty: null,
      maxTurboLoad: null,
      maxTurboShaftRpm: null,
      maxEmpBar: null,
      maxIatC: null,
      maxEgtC: null,
      maxOilTempC: null,
      maxKnockRisk: null,
      maxOilAerationPct: null,
      minOilPressureBar: null
    };
    const maxOf = (key, value) => {
      if (Number.isFinite(value) && (out[key] === null || value > out[key])) out[key] = value;
    };
    for (const p of list) {
      if (out.peakHp === null || p.hp > out.peakHp) {
        out.peakHp = p.hp;
        out.peakHpRpm = p.rpm;
      }
      if (out.peakTorqueNm === null || p.torqueNm > out.peakTorqueNm) {
        out.peakTorqueNm = p.torqueNm;
        out.peakTorqueRpm = p.rpm;
      }
      maxOf('maxBmepBar', p.bmepBar);
      maxOf('maxMeanPistonSpeed', p.meanPistonSpeed);
      maxOf('maxFuelDuty', p.fuelDutyPct);
      maxOf('maxTurboLoad', p.turboLoadPct);
      maxOf('maxTurboShaftRpm', p.turboShaftRpm);
      maxOf('maxEmpBar', p.empBar);
      maxOf('maxIatC', p.iatC);
      maxOf('maxEgtC', p.egtC);
      maxOf('maxOilTempC', p.oilTempC);
      maxOf('maxKnockRisk', p.knockRisk);
      maxOf('maxOilAerationPct', p.oilAerationPct);
      // Hot-oil pressure is only judged under load (>= 4000 rpm).
      if (p.rpm >= 4000 && (out.minOilPressureBar === null || p.oilPressureBar < out.minOilPressureBar))
        out.minOilPressureBar = p.oilPressureBar;
    }
    return out;
  }

  // Wear accrued by a dyno pull, integrated over the samples that were run.
  // Each sample represents DYNO_STEP_RPM / ramp seconds of load.
  function dynoWearFromSamples(samples, ctx) {
    const list = Array.isArray(samples) ? samples : [];
    const dt = DYNO_STEP_RPM / clamp(Number(ctx.rampRpmPerSec) || 550, 250, 1000);
    const riskOver = (value, start, full) => clamp((value - start) / (full - start), 0, 1.35);
    const condition = 1 + (1 - clamp(ctx.assemblyScore ?? 1, 0, 1)) * 2.5 + (ctx.spoolWearFactor || 0) * 1.5 + (ctx.engineWearPct || 0) / 200;
    let engine = 0,
      turbo = 0,
      oilAgeKm = 0;
    for (const p of list) {
      const engineRate =
        0.004 +
        riskOver(p.hp / ctx.mechanicalHpLimit, 0.78, 1.18) * 0.05 +
        riskOver(p.torqueNm / ctx.componentTorqueLimit, 0.78, 1.18) * 0.05 +
        riskOver(p.bmepBar / ctx.headClampBmep, 0.75, 1.2) * 0.04 +
        riskOver(p.meanPistonSpeed / 25, 0.82, 1.13) * 0.02 +
        Math.max(0, p.knockRisk - 0.3) * 0.08 +
        riskOver(p.oilTempC / ctx.oilTempTolerance, 0.82, 1.18) * 0.03 +
        Math.max(0, p.oilFilmRisk - 0.9) * 0.05 +
        riskOver(p.egtC / 980, 0.75, 1.12) * 0.02;
      const turboRate =
        0.003 +
        riskOver(p.turboLoadPct / 100, 0.8, 1.2) * 0.06 +
        riskOver(p.turboShaftRpm / Math.max(1, p.shaftLimitRpm), 0.82, 1.16) * 0.05 +
        riskOver(p.egtC / 980, 0.8, 1.12) * 0.03;
      engine += engineRate * condition * dt;
      turbo += turboRate * (1 + (ctx.spoolWearFactor || 0) * 3) * dt;
      oilAgeKm += (10 + Math.max(0, p.oilTempC - 110) * 0.25) * dt;
    }
    const durationS = list.length * dt;
    return { engine: Math.min(12, engine), turbo: Math.min(12, turbo), transmission: 0.0025 * durationS, oilAgeKm, durationS };
  }

  function dynoFailureDamage(event) {
    if (!event) return { engine: 0, turbo: 0 };
    return { engine: 18 + clamp(event.severity || 0, 0, 1) * 20, turbo: event.system === 'turbo' ? 28 : 4 };
  }

  // Upgrades results stored by v1.2.0 and earlier. Those kept simulating to the
  // rev limit after a failure, so every sample above the failure rpm and every
  // summary derived from them is discarded here.
  function sanitizeDynoResult(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.dynoResultVersion === DYNO_RESULT_VERSION) return result;
    const legacyCurve = Array.isArray(result.samples) ? result.samples : Array.isArray(result.curve) ? result.curve : [];
    const failureRpm = Number(result.failureRpm) || 0;
    const samples = failureRpm ? legacyCurve.filter(p => p.rpm <= failureRpm) : legacyCurve.slice();
    const completed = !failureRpm && samples.length > 0;
    const out = { ...result };
    delete out.curve;
    Object.assign(out, summarizeDynoSamples(samples));
    out.samples = samples;
    out.dynoResultVersion = DYNO_RESULT_VERSION;
    out.legacyMigrated = true;
    out.rating = completed ? result.status || result.rating || '' : 'AFGEBROKEN';
    out.status = completed ? DYNO_STATUS.COMPLETED : samples.length ? DYNO_STATUS.ABORTED : DYNO_STATUS.FAILED_TO_START;
    out.partial = !completed;
    out.targetRpm = Number(result.targetRpm) || (legacyCurve.length ? legacyCurve[legacyCurve.length - 1].rpm : null);
    if (!completed) {
      out.abortRpm = failureRpm || null;
      out.abortReason = result.failureReason || 'Onbekende oorzaak (oude meting)';
      out.abortKind = 'engine-failure';
      out.reliabilityScore = null;
      // Legacy warnings/bottleneck were computed from the full sweep, including
      // samples that were never reached, so they cannot be trusted.
      out.warnings = [];
      out.bottleneck = `Afgebroken @ ${failureRpm} rpm`;
      out.estimatedAirflowLbMin = null;
      if (samples.length < DYNO_MIN_PARTIAL_SAMPLES) {
        out.peakHp = out.peakHpRpm = out.peakTorqueNm = out.peakTorqueRpm = null;
      } else out.estimatedAirflowLbMin = out.peakHp / 9.55;
    }
    return out;
  }

  function simulateEngine(inputState, options = {}) {
    const state = normalizeState(inputState),
      block = getPart(state, 'block'),
      crank = getPart(state, 'crank'),
      oiling = getPart(state, 'oiling'),
      crankcase = getPart(state, 'crankcase'),
      head = getPart(state, 'head'),
      valve = getPart(state, 'valvetrain'),
      turbo = getPart(state, 'turbo'),
      boostControl = getPart(state, 'boostControl'),
      air = getPart(state, 'air'),
      manifold = getPart(state, 'manifold'),
      fuelSystem = getPart(state, 'fuelSystem'),
      fuel = getPart(state, 'fuel'),
      exhaust = getPart(state, 'exhaust'),
      ecu = getPart(state, 'ecu'),
      sensors = getPart(state, 'sensors'),
      ignition = getPart(state, 'ignition'),
      sealing = getPart(state, 'sealing'),
      trans = getPart(state, 'transmission'),
      spoolAssist = getPart(state, 'spool'),
      oil = OIL_MAP[state.service.oilId],
      filter = FILTER_MAP[state.service.filterId],
      tune = state.tune,
      geometry = engineGeometry(state),
      camTiming = camTimingHealth(state),
      assembly = assemblyHealth(state);
    const revLimit = clamp(Math.round(tune.revLimitRpm / 100) * 100, 5000, 10000),
      effectiveFuelCapacity = fuelSystem.fuelSystemHp * fuel.fuelFlowFactor;
    const mechanicalHpLimit = minPositive(block.hpLimit, crank.hpLimit, oiling.hpLimit, head.hpLimit, valve.hpLimit, ecu.hpLimit),
      componentTorqueLimit = minPositive(
        block.torqueLimit,
        crank.torqueLimit,
        oiling.torqueLimit,
        head.torqueLimit,
        valve.torqueLimit,
        ecu.torqueLimit,
        trans.transTorque
      ),
      componentRpmLimit = minPositive(block.rpmLimit, crank.rpmLimit, oiling.rpmLimit, head.rpmLimit, valve.rpmLimit, ecu.rpmLimit);
    const wearTotal = state.wear.engine * 0.72 + state.wear.turbo * 0.18 + state.damage.engine * 0.9 + state.damage.turbo * 0.35,
      wearFactor = 1 - clamp(wearTotal / 230, 0, 0.32),
      health = oilHealth(state),
      oilLevel = Number(state.service.liters),
      levelFilm = oilLevel < 4 ? clamp(0.45 + (oilLevel - 3.4) * 0.9, 0.35, 1) : oilLevel > 5.15 ? 0.93 : 1;
    const oilFilm = oil.film * health * levelFilm * (0.8 + oiling.oilControl * 0.2) * (0.86 + crankcase.crankcaseControl * 0.14),
      curve = [];
    // Pre-flight: an engine that is already destroyed does not start a pull.
    let abort =
      Number(state.damage.engine) >= 100
        ? {
            kind: 'failed-to-start',
            code: 'engine_destroyed',
            system: 'engine',
            reason: 'Motorschade 100%: de motor start niet. Eerst reviseren.',
            severity: 0,
            rpm: null
          }
        : null;
    const stopAtRpm = Number.isFinite(options.stopAtRpm) ? options.stopAtRpm : Infinity;
    const rand = mulberry32(fnv1a(engineSignature(state))),
      measurementNoise = options.noise === false ? 0 : sensors.measurementNoise,
      baseDynoFactor = options.noise === false ? 1 : 1 + (rand() - 0.5) * measurementNoise;
    const ambient = Number(state.dynoConfig.ambientTempC || 20),
      baro = Number(state.dynoConfig.baroKpa || 101.3),
      airDensityFactor = clamp((baro / 101.3) * (293.15 / (ambient + 273.15)), 0.74, 1.1),
      ramp = clamp(Number(state.dynoConfig.rampRpmPerSec || 550), 250, 1000),
      fan = clamp(Number(state.dynoConfig.fanSpeedPct || 85) / 100, 0.25, 1),
      heatSoak = clamp(650 / ramp, 0.72, 1.35);
    // Turbo matching context: compressor/turbine map, charge air, exhaust, wastegate.
    const turboMap = Turbo.getMap(turbo.id),
      chargeAir = Turbo.DATA.chargeAir[air.id] || Turbo.DATA.chargeAir.oem_air,
      exhaustSystem = Turbo.DATA.exhaust[exhaust.id] || Turbo.DATA.exhaust.oem_exhaust,
      wastegate = Turbo.DATA.wastegate[boostControl.id] || Turbo.DATA.wastegate.oem_internal,
      stoichAfr = Turbo.DATA.fuelStoichAfr[fuel.id] || 14.7,
      baroBar = baro / 100,
      ambientK = ambient + 273.15,
      dtSample = DYNO_STEP_RPM / ramp;
    let prevShaftRpm = NaN,
      prevSpoolFrac = 0;
    for (let rpm = DYNO_START_RPM; !abort && rpm <= revLimit; rpm += DYNO_STEP_RPM) {
      const desired = requestedBoostAt(tune, rpm, revLimit);
      const controlRipple = (1 - boostControl.boostControlQuality) * (0.04 * Math.sin(rpm / 285) + 0.025 * (rand() - 0.5)),
        hardwareLimit = boostControl.boostHardwareMaxBar,
        requestedRatio = desired / Math.max(0.15, hardwareLimit);
      // Boost the controller asks for; what the turbo can deliver follows from the map.
      let targetBoost = desired * (1 + controlRipple);
      if (tune.overboostCut && requestedRatio > 1.03) targetBoost = Math.min(targetBoost, hardwareLimit * 1.04);
      else if (requestedRatio > 1) targetBoost *= 1 + Math.min(0.18, (requestedRatio - 1) * 0.16);
      targetBoost = Math.max(0, targetBoost);
      const x = (rpm - 4300) / 2700,
        naTorque = clamp(184 - 30 * x * x, 108, 186),
        rpmBlend = clamp((rpm - 3800) / 2800, 0, 1),
        camShape =
          lerp(head.lowRpmMultiplier, head.highRpmMultiplier, rpmBlend) *
          lerp(manifold.lowRpmMultiplier, manifold.highRpmMultiplier, rpmBlend);
      let camAdvanceEffect = 1,
        commandedAdvance = tune.vvtEnabled === false ? 0 : tune.intakeCamAdvanceDeg;
      if (rpm < 4500) camAdvanceEffect += (commandedAdvance - 15) * 0.0015;
      if (rpm > 6200) camAdvanceEffect -= Math.max(0, commandedAdvance - 10) * 0.0018;
      const camTimingShape = camTiming.applicable ? camTiming.score * (rpm < 3600 ? 0.985 + (1 - camTiming.score) * 0.03 : 1) : 1,
        intakeFlowFactor = 1 + (air.flow - 1) * 0.8 + (manifold.intakeFlow - 1) * 0.86,
        exhaustFlowFactor = 1 + (exhaust.exhaustFlow - 1) * 0.75;
      const breathing = head.powerMultiplier * head.headFlow * camShape * intakeFlowFactor * exhaustFlowFactor * camTimingShape;
      // Charge density relative to the NA calibration (1.01325 bar, 308 K manifold).
      const densityRatio = (B, tK) => ((baroBar + B) / 1.01325) * (CHARGE_REF_K / tK);
      const airflowAt = (B, tK) =>
        ((naTorque * densityRatio(B, tK) * 0.97 * breathing * camAdvanceEffect * rpm) / 7127 / HP_PER_LBMIN_AIR) / Turbo.LBMIN_PER_KGS;
      const exhaustTempK = B =>
        273.15 + 715 + B * 66 + Math.max(0, tune.lambda - 0.8) * 650 + Math.max(0, -tune.ignitionTrimDeg) * 13 + spoolAssist.spoolHeat * 145;
      const chargeCooling = (t2K, flowLb) => {
        // Catalogue "cooling" 0.28 (OEM core) .. 0.985 (ice system) maps to an
        // intercooler effectiveness of 0.68 .. 0.99, falling once flow exceeds the core rating.
        const eps = (0.55 + 0.45 * air.cooling) * clamp(1 - 0.35 * Math.max(0, flowLb / chargeAir.refFlowLbMin - 1), 0.4, 1);
        return ambientK + 2 + (t2K - ambientK) * (1 - eps) * (1 - fuel.fuelCooling) * (1.18 - 0.48 * fan) * heatSoak + spoolAssist.spoolHeat * 22;
      };
      // Spool assistance adds exhaust energy while the turbo is still coming up.
      const nitrousTaper =
        spoolAssist.nitrousHp > 0 ? clamp((0.93 - prevSpoolFrac) / 0.58, 0, 1) * clamp((revLimit - rpm + 800) / 2200, 0, 1) : 0;
      const extraExhaustKw =
        spoolAssist.spoolHeat * 220 * (0.15 + 0.85 * clamp(1 - prevSpoolFrac, 0, 1)) + spoolAssist.nitrousHp * 0.7457 * 1.1 * nitrousTaper;
      const tp = Turbo.matchEngine(
        {
          map: turboMap,
          baroBar,
          ambientK,
          airflowAt,
          exhaustTempK,
          chargeCooling,
          stoichAfr,
          lambda: tune.lambda,
          chargeAir,
          exhaust: exhaustSystem,
          wastegate,
          protectShaftSpeed: !!(tune.overboostCut || wastegate.shaftSpeedSensor),
          extraExhaustKw,
          extraExhaustKgS: (spoolAssist.nitrousHp * 0.0075 * nitrousTaper) / Turbo.LBMIN_PER_KGS
        },
        { targetBoostBar: targetBoost, prevShaftRpm, dtS: dtSample }
      );
      prevShaftRpm = tp.shaftRpm;
      const actualBoost = tp.boostBar,
        spool = targetBoost > 0.05 ? clamp(actualBoost / targetBoost, 0, 1) : 1;
      prevSpoolFrac = spool;
      const manifoldK = tp.manifoldC + 273.15,
        pManAbs = baroBar + actualBoost,
        empRatio = tp.empBarAbs / pManAbs,
        pressureMultiplier = densityRatio(actualBoost, manifoldK) * 0.97,
        // Residual gas and pumping work follow exhaust manifold pressure vs boost.
        residualFactor = clamp(1 - 0.05 * (empRatio - 1), 0.9, 1.02),
        pumpingNm = ((tp.empBarAbs - pManAbs) * 1e5 * (geometry.displacementL / 1000)) / (4 * Math.PI);
      const ringSeal = 0.94 + assembly.ringScore * 0.06 - assembly.ringWideRisk * 0.025,
        assemblyPower = 0.965 + assembly.score * 0.035;
      let spark = ignition.sparkQuality * (0.91 + assembly.sparkScore * 0.09);
      if (actualBoost > ignition.sparkBoostLimit) spark *= clamp(1 - (actualBoost - ignition.sparkBoostLimit) * 0.1, 0.7, 1);
      let torque =
        naTorque *
          pressureMultiplier *
          breathing *
          residualFactor *
          camAdvanceEffect *
          spark *
          wearFactor *
          ringSeal *
          assemblyPower *
          (0.997 + (crankcase.vacuumKpa < 0 ? 0.012 : 0)) -
        Math.max(-4, pumpingNm);
      if (spoolAssist.nitrousHp > 0) torque += ((spoolAssist.nitrousHp * 7127) / Math.max(2600, rpm)) * nitrousTaper;
      let rawHp = (torque * rpm) / 7127,
        totalFlowCap = (effectiveFuelCapacity * (0.985 + (air.flow - 1) * 0.2 + (manifold.intakeFlow - 1) * 0.16) * baseDynoFactor) / oil.drag;
      if (rawHp > totalFlowCap) {
        torque *= totalFlowCap / rawHp;
        rawHp = totalFlowCap;
      } else {
        torque *= baseDynoFactor / oil.drag;
        rawHp = (torque * rpm) / 7127;
      }
      let fuelDutyPct = (rawHp / Math.max(1, effectiveFuelCapacity)) * 100,
        railDrop = Math.max(0, fuelDutyPct - 88) * 1.15 + Math.max(0, tune.railTargetBar - fuelSystem.maxRailBar),
        railBar = Math.max(35, Math.min(tune.railTargetBar, fuelSystem.maxRailBar) - railDrop);
      if (fuelDutyPct > 100 && tune.railPressureCut) {
        const cut = clamp((112 - fuelDutyPct) / 12, 0.52, 1);
        torque *= cut;
        rawHp = (torque * rpm) / 7127;
        fuelDutyPct = (rawHp / Math.max(1, effectiveFuelCapacity)) * 100;
      }
      let actualLambda = tune.lambda + Math.max(0, fuelDutyPct - 94) * 0.0035 + Math.max(0, tune.railTargetBar - railBar) * 0.0009;
      if (tune.lambda < 0.7) {
        const richLoss = clamp((0.7 - tune.lambda) * 2.8, 0, 0.1);
        torque *= 1 - richLoss;
        rawHp = (torque * rpm) / 7127;
      }
      // Turbo load = how close the compressor is to its shaft-speed or choke limit.
      const turboLoadPct = Math.max(tp.shaftSpeedPct, 100 - tp.chokeMarginPct),
        shaftLimit = turboMap.maxShaftRpm,
        turboShaftRpm = tp.shaftRpm,
        empBar = tp.empBarAbs - baroBar;
      const iatC = tp.manifoldC,
        oilVaporOctaneLoss = crankcase.oilVaporPenalty * 35;
      let effectiveOctane = fuel.octane - oilVaporOctaneLoss;
      if (state.selections.air === 'wmi' && tune.methFailsafe) effectiveOctane += 1.5;
      const requiredOctane =
          90.8 +
          actualBoost * 4.8 +
          Math.max(0, iatC - 35) * 0.075 +
          Math.max(0, tune.ignitionTrimDeg) * 1.45 +
          Math.max(0, actualLambda - 0.84) * 80 +
          spoolAssist.nitrousHp * 0.012 +
          Math.max(0, empRatio - 1.15) * 5 +
          (camTiming.applicable ? (1 - camTiming.score) * 8.5 : 0),
        effectiveSafety = ecu.safetyQuality * (0.78 + sensors.sensorQuality * 0.22);
      let knockRisk = clamp((requiredOctane - effectiveOctane + 3) / 7, 0, 1.8);
      if (tune.knockControl) knockRisk *= 0.76 + (1 - effectiveSafety) * 0.29;
      const egtC =
          exhaustTempK(actualBoost) -
          273.15 +
          Math.max(0, Math.max(actualLambda, 0.8) - Math.max(tune.lambda, 0.8)) * 650 +
          Math.max(0, turboLoadPct - 90) * 1.3,
        bmepBar = (torque * 4 * Math.PI) / (geometry.displacementL / 1000) / 100000,
        meanPistonSpeed = (2 * (geometry.strokeMm / 1000) * rpm) / 60;
      const oilTempC =
          88 +
          rawHp * (0.108 - oiling.oilCooling * 0.067) * heatSoak +
          Math.max(0, meanPistonSpeed - 22) * 1.8 +
          spoolAssist.spoolHeat * 16 +
          Math.max(0, oil.drag - 1) * 90 -
          Math.max(0, rawHp - 700) * oiling.oilCooling * 0.028,
        oilPressureBar = calculateOilPressure(rpm, oilTempC, state, oiling, oil, filter, assembly),
        oilAerationPct = clamp(
          Math.max(0, oilLevel - 5) * 22 +
            Math.max(0, rpm - 7800) * 0.0045 +
            (1 - oiling.oilControl) * 9 +
            (1 - crankcase.crankcaseControl) * 6,
          0,
          55
        ),
        loadFilmNeed = 0.48 + bmepBar / 58 + Math.max(0, oilTempC - oil.tempTolerance) * 0.018 + oilAerationPct * 0.006,
        oilFilmRisk = loadFilmNeed / Math.max(0.25, oilFilm * (0.8 + oilPressureBar / 12));
      const point = {
        rpm,
        hp: rawHp,
        torqueNm: torque,
        boostBar: actualBoost,
        lambda: actualLambda,
        lambdaTarget: tune.lambda,
        iatC,
        egtC,
        railBar,
        fuelDutyPct,
        turboLoadPct,
        turboShaftRpm,
        shaftLimitRpm: shaftLimit,
        empBar,
        bmepBar,
        meanPistonSpeed,
        knockRisk,
        oilTempC,
        oilPressureBar,
        oilFilmRisk,
        oilAerationPct,
        spoolPct: spool * 100,
        airflowLbMin: tp.massFlowLbMin,
        boostTargetBar: targetBoost,
        boostLimitedBy: tp.limitedBy,
        shaftSpeedPct: tp.shaftSpeedPct,
        compressorPr: tp.pressureRatio,
        correctedFlowLbMin: tp.correctedFlowLbMin,
        compressorEff: tp.compressorEff,
        compressorOutC: tp.compressorOutC,
        surgeMarginPct: tp.surgeMarginPct,
        chokeMarginPct: tp.chokeMarginPct,
        surge: tp.surge,
        wastegatePct: tp.wastegatePct,
        turbineKw: tp.turbineKw,
        compressorKw: tp.compressorKw,
        volumetricEff: tp.massFlowKgS / ((pManAbs * 1e5) / (287.05 * manifoldK)) / ((geometry.displacementL / 1000) * (rpm / 120))
      };
      point.tS = (rpm - DYNO_START_RPM) / ramp;
      curve.push(point);
      const event = criticalFailure(point, {
        tune,
        mechanicalHpLimit,
        componentTorqueLimit,
        componentRpmLimit,
        sealing,
        ignition,
        oiling,
        ecu,
        oilFilm,
        assembly,
        boostControl,
        sensors
      });
      // The pull stops at the sample where a failure is detected: nothing above
      // this rpm is ever simulated, measured or summarised.
      if (event) abort = { kind: 'engine-failure', rpm, ...event };
      else if (rpm >= stopAtRpm)
        abort = { kind: 'operator', code: 'operator', system: 'operator', reason: 'Handmatig afgebroken door operator.', severity: 0, rpm };
    }
    if (abort && abort.kind === 'engine-failure' && curve.length <= 1) abort.kind = 'failed-to-start';
    const runStatus = !abort ? DYNO_STATUS.COMPLETED : abort.kind === 'failed-to-start' ? DYNO_STATUS.FAILED_TO_START : DYNO_STATUS.ABORTED;
    const completed = runStatus === DYNO_STATUS.COMPLETED;
    const summary = summarizeDynoSamples(curve);
    const failureRpm = abort && abort.kind !== 'operator' && abort.rpm ? abort.rpm : 0,
      failureReason = failureRpm ? abort.reason : '';
    const val = v => (Number.isFinite(v) ? v : 0);
    const peakHp = val(summary.peakHp),
      peakTorqueNm = val(summary.peakTorqueNm),
      maxBmepBar = val(summary.maxBmepBar),
      maxMeanPistonSpeed = val(summary.maxMeanPistonSpeed),
      maxFuelDuty = val(summary.maxFuelDuty),
      maxTurboLoad = val(summary.maxTurboLoad),
      maxTurboShaftRpm = val(summary.maxTurboShaftRpm),
      maxEmpBar = val(summary.maxEmpBar),
      maxIatC = val(summary.maxIatC),
      maxEgtC = val(summary.maxEgtC),
      maxOilTempC = val(summary.maxOilTempC),
      maxKnockRisk = val(summary.maxKnockRisk),
      maxOilAerationPct = val(summary.maxOilAerationPct),
      minOilPressureBar = summary.minOilPressureBar;
    const hpRatio = peakHp / mechanicalHpLimit,
      tqRatio = peakTorqueNm / componentTorqueLimit,
      rpmRatio = revLimit / componentRpmLimit,
      clampRatio = maxBmepBar / sealing.headClampBmep,
      fuelRatio = maxFuelDuty / 100,
      turboRatio = maxTurboLoad / 100,
      mpsRatio = maxMeanPistonSpeed / 25,
      oilTempRatio = maxOilTempC / oil.tempTolerance,
      oilPressureRisk = minOilPressureBar === null ? 0 : clamp((2.8 - minOilPressureBar) / 1.8, 0, 1.5),
      oilFilmRatio = 1 / Math.max(0.35, oilFilm),
      shaftRatio = maxTurboShaftRpm / (curve[0]?.shaftLimitRpm || 150000),
      warnings = [];
    addWarning(warnings, hpRatio > 0.92, 'Vermogensmarge van onderblok/krukas is klein.', 'warn', 'mechanisch');
    addWarning(
      warnings,
      tqRatio > 0.92,
      'Koppelpiek zit dicht bij de mechanische of transmissiegrens; bouw boost later op.',
      'warn',
      'mechanisch'
    );
    addWarning(
      warnings,
      rpmRatio > 0.94,
      'Toerental zit dicht bij de laagste rpm-grens van blok, krukas, olie of kleppentrein.',
      'warn',
      'kleppentrein'
    );
    addWarning(warnings, clampRatio > 0.9, 'BMEP nadert de klemkracht van koppakking/studs: head-lift risico.', 'warn', 'sealing');
    addWarning(
      warnings,
      maxFuelDuty > 88,
      `Brandstof duty ${Math.round(maxFuelDuty)}%: controleer injector/pomp en raildruk.`,
      'warn',
      'brandstof'
    );
    addWarning(
      warnings,
      maxTurboLoad > 93,
      `Turbo load ${Math.round(maxTurboLoad)}%: turbospeed en uitlaatdruk raken de grens.`,
      'warn',
      'turbo'
    );
    addWarning(
      warnings,
      shaftRatio > 1,
      `Geschatte turbospeed ${Math.round(maxTurboShaftRpm / 1000)}k rpm overschrijdt de gemodelleerde asgrens.`,
      'danger',
      'turbo'
    );
    addWarning(
      warnings,
      maxEmpBar > 4.5,
      `Hoge uitlaatspruitstukdruk ${maxEmpBar.toFixed(1)} bar belast turbine, kleppen en ringseal.`,
      'warn',
      'uitlaat'
    );
    addWarning(warnings, maxIatC > 55, `Hoge IAT ${Math.round(maxIatC)}°C: knockmarge en herhaalbaarheid nemen af.`, 'warn', 'temperatuur');
    addWarning(
      warnings,
      maxEgtC > 925,
      `Hoge EGT ${Math.round(maxEgtC)}°C: turbine, kleppen en spruitstuk worden zwaar belast.`,
      'warn',
      'temperatuur'
    );
    addWarning(
      warnings,
      maxOilTempC > oil.tempTolerance,
      `Olietemperatuur ${Math.round(maxOilTempC)}°C overschrijdt de comfortabele zone van ${oil.name}.`,
      'warn',
      'olie'
    );
    addWarning(
      warnings,
      minOilPressureBar !== null && minOilPressureBar < 2.5,
      `Minimale berekende oliedruk ${(minOilPressureBar ?? 0).toFixed(1)} bar: niveau, viscositeit en pickup controleren.`,
      'warn',
      'olie'
    );
    addWarning(
      warnings,
      maxOilAerationPct > 18,
      `Geschatte olie-aeratie ${Math.round(maxOilAerationPct)}%: vulniveau, cartercontrole en carterventilatie controleren.`,
      'warn',
      'olie'
    );
    addWarning(
      warnings,
      maxMeanPistonSpeed > 25,
      `Gemiddelde zuigersnelheid ${maxMeanPistonSpeed.toFixed(1)} m/s is racegebied.`,
      'warn',
      'mechanisch'
    );
    addWarning(
      warnings,
      state.service.liters < 4.1,
      `Oliepeil ${state.service.liters.toFixed(1)} L is te laag voor harde pulls.`,
      'danger',
      'olie'
    );
    addWarning(
      warnings,
      state.service.liters > 5.1,
      `Oliepeil ${state.service.liters.toFixed(1)} L kan windage/schuim veroorzaken.`,
      'warn',
      'olie'
    );
    addWarning(
      warnings,
      health < 0.7,
      `Olieconditie is nog circa ${Math.round(health * 100)}%; verversen verkleint het risico.`,
      'warn',
      'olie'
    );
    addWarning(
      warnings,
      state.selections.air === 'wmi' && !tune.methFailsafe,
      'WMI zonder meth-failsafe kan bij flowverlies direct zware knock veroorzaken.',
      'danger',
      'beveiliging'
    );
    addWarning(
      warnings,
      !tune.railPressureCut && maxFuelDuty > 92,
      'Raildrukbeveiliging staat uit terwijl het brandstofsysteem bijna verzadigd is.',
      'danger',
      'beveiliging'
    );
    addWarning(
      warnings,
      !tune.oilPressureProtection && revLimit > 7600,
      'Oliedrukbeveiliging staat uit bij hoog toerental.',
      'danger',
      'beveiliging'
    );
    addWarning(
      warnings,
      turbo.compressorMm >= 94 && spoolAssist.id === 'none',
      `${turbo.compressorMm}-mm turbo zonder spool assistance heeft op 2,0 liter een zeer smalle bruikbare powerband.`,
      'warn',
      'turbo'
    );
    addWarning(
      warnings,
      spoolAssist.spoolHeat > 0.3,
      'Agressieve anti-lag/nitrous-spool verhoogt EGT en verkort de levensduur.',
      'warn',
      'turbo'
    );
    addWarning(
      warnings,
      assembly.ringTightRisk > 0.55,
      'Topring-gap is in het model krap voor de gekozen boost/temperatuur; ring-butting risico.',
      'danger',
      'montage'
    );
    addWarning(
      warnings,
      assembly.bearingTightRisk > 0.55,
      'Drijfstanglagerclearance is in het model krap voor toerental en olietemperatuur.',
      'danger',
      'montage'
    );
    addWarning(warnings, assembly.bearingLooseRisk > 0.55, 'Hoofdlagerclearance is ruim; warme oliedruk kan dalen.', 'warn', 'montage');
    addWarning(warnings, !assembly.oilPrimed, 'Oliesysteem is niet als geprimed gemarkeerd.', 'danger', 'montage');
    if (camTiming.applicable) {
      addWarning(
        warnings,
        camTiming.exhaustErrorMm > 0.1,
        `Uitlaatnok wijkt ${camTiming.exhaustErrorMm.toFixed(2)} mm af van ${camTiming.targetExhaustTdcMm.toFixed(2)} mm @ overlap-TDC.`,
        camTiming.exhaustErrorMm > 0.24 ? 'danger' : 'warn',
        'nokken'
      );
      addWarning(
        warnings,
        camTiming.intakeErrorMm > 0.07,
        `Inlaatnok wijkt ${camTiming.intakeErrorMm.toFixed(2)} mm af van ${camTiming.targetIntakeTdcMm.toFixed(2)} mm @ overlap-TDC.`,
        camTiming.intakeErrorMm > 0.17 ? 'danger' : 'warn',
        'nokken'
      );
    }
    const riskOver = (value, start, full) => clamp((value - start) / (full - start), 0, 1.35);
    let risk = 0;
    risk +=
      riskOver(hpRatio, 0.78, 1.18) * 22 +
      riskOver(tqRatio, 0.78, 1.18) * 24 +
      riskOver(rpmRatio, 0.82, 1.12) * 19 +
      riskOver(clampRatio, 0.75, 1.2) * 18 +
      riskOver(fuelRatio, 0.78, 1.12) * 20 +
      riskOver(turboRatio, 0.78, 1.15) * 18 +
      riskOver(shaftRatio, 0.82, 1.16) * 16 +
      riskOver(maxIatC / 70, 0.62, 1.2) * 10 +
      riskOver(maxEgtC / 980, 0.75, 1.12) * 12 +
      riskOver(oilTempRatio, 0.82, 1.18) * 14 +
      riskOver(mpsRatio, 0.82, 1.13) * 10 +
      maxKnockRisk * 24 +
      oilPressureRisk * 18 +
      riskOver(oilFilmRatio, 0.86, 1.65) * 15;
    risk +=
      state.wear.engine * 0.22 +
      state.wear.turbo * 0.08 +
      state.damage.engine * 0.7 +
      spoolAssist.wearFactor * 16 +
      (1 - assembly.score) * 30 +
      assembly.ringTightRisk * 12 +
      assembly.bearingTightRisk * 10 +
      assembly.bearingLooseRisk * 5;
    if (camTiming.applicable) risk += (1 - camTiming.score) * 26;
    risk -=
      (block.reliabilityBonus +
        crank.reliabilityBonus +
        oiling.reliabilityBonus +
        crankcase.reliabilityBonus +
        valve.reliabilityBonus +
        ecu.reliabilityBonus +
        sensors.reliabilityBonus +
        sealing.reliabilityBonus) *
      0.62;
    risk -= ecu.safetyQuality * sensors.sensorQuality * 5;
    if (!tune.knockControl) risk += 8;
    if (!tune.lambdaProtection) risk += 5;
    if (!tune.overboostCut) risk += 4;
    if (abort && abort.kind !== 'operator') risk += 45;
    // Reliability is a verdict on a whole pull. An aborted pull did not cover
    // the rpm range, so it gets no score rather than a misleading one.
    const reliabilityScore = completed ? Math.round(clamp(100 - risk, 0, 100)) : null,
      rating = !completed
        ? 'AFGEBROKEN'
        : reliabilityScore >= 82
          ? 'VEILIG'
          : reliabilityScore >= 65
            ? 'STRAKKE MARGE'
            : reliabilityScore >= 43
              ? 'RISICOVOL'
              : 'BREUKGEVAAR',
      ratios = [
        ['Onderblok/krukas', hpRatio],
        ['Koppel/transmissie', tqRatio],
        ['Toerental/kleppentrein', rpmRatio],
        ['Koppakking/head-lift', clampRatio],
        ['Brandstofcapaciteit', fuelRatio],
        ['Turbo-airflow/turbospeed', Math.max(turboRatio, shaftRatio)],
        ['Olie/lagers', Math.max(oilTempRatio, oilPressureRisk, oilFilmRatio * 0.72)],
        ['Montageclearances', 1 + (1 - assembly.score) * 0.7],
        ['Nokkenastiming', camTiming.applicable ? 1 + (1 - camTiming.score) * 0.72 : 0]
      ];
    ratios.sort((a, b) => b[1] - a[1]);
    const bottleneck = completed
        ? `${ratios[0][0]}: ${ratios[0][1].toFixed(2)}× van de richtgrens`
        : abort.rpm
          ? `Afgebroken @ ${abort.rpm} rpm: ${abort.reason}`
          : abort.reason,
      safePowerLimitHp = Math.min(mechanicalHpLimit * 0.88, effectiveFuelCapacity * 0.88, turboFlowCapacityHp(turbo.id) * 0.9),
      wear = dynoWearFromSamples(curve, {
        rampRpmPerSec: ramp,
        mechanicalHpLimit,
        componentTorqueLimit,
        headClampBmep: sealing.headClampBmep,
        oilTempTolerance: oil.tempTolerance,
        assemblyScore: assembly.score,
        spoolWearFactor: spoolAssist.wearFactor,
        engineWearPct: state.wear.engine
      }),
      damage = dynoFailureDamage(abort && abort.kind !== 'operator' && abort.code !== 'engine_destroyed' ? abort : null),
      airDensityKgM3 = 1.204 * airDensityFactor;
    // A partial peak is only quoted when enough of the pull was observed.
    const quotePeak = completed || summary.sampleCount >= DYNO_MIN_PARTIAL_SAMPLES;
    const plannedSamples = Math.floor((revLimit - DYNO_START_RPM) / DYNO_STEP_RPM) + 1;
    return {
      modelVersion: ENGINE_MODEL_VERSION,
      dynoResultVersion: DYNO_RESULT_VERSION,
      status: runStatus,
      partial: !completed,
      abortRpm: abort ? abort.rpm : null,
      abortReason: abort ? abort.reason : '',
      abortKind: abort ? abort.kind : null,
      abortCode: abort ? abort.code : null,
      abortSystem: abort ? abort.system : null,
      abortSeverity: abort ? abort.severity : 0,
      startRpm: DYNO_START_RPM,
      targetRpm: revLimit,
      rpmReached: summary.rpmReached,
      sampleCount: summary.sampleCount,
      plannedSampleCount: plannedSamples,
      samples: curve,
      peakHp: quotePeak ? summary.peakHp : null,
      peakHpRpm: quotePeak ? summary.peakHpRpm : null,
      peakTorqueNm: quotePeak ? summary.peakTorqueNm : null,
      peakTorqueRpm: quotePeak ? summary.peakTorqueRpm : null,
      reliabilityScore,
      rating,
      bottleneck,
      warnings,
      failureRpm,
      failureReason,
      wear,
      damage,
      wearPerDynoPull: wear.engine,
      safePowerLimitHp,
      maxBmepBar: summary.maxBmepBar,
      maxMeanPistonSpeed: summary.maxMeanPistonSpeed,
      maxFuelDuty: summary.maxFuelDuty,
      maxTurboLoad: summary.maxTurboLoad,
      maxTurboShaftRpm: summary.maxTurboShaftRpm,
      maxEmpBar: summary.maxEmpBar,
      maxIatC: summary.maxIatC,
      maxEgtC: summary.maxEgtC,
      maxOilTempC: summary.maxOilTempC,
      minOilPressureBar: summary.minOilPressureBar,
      maxKnockRisk: summary.maxKnockRisk,
      maxOilAerationPct: summary.maxOilAerationPct,
      estimatedAirflowLbMin: quotePeak && summary.peakHp !== null ? summary.peakHp / 9.55 : null,
      oilHealth: health,
      oilFilm,
      turboId: turbo.id,
      turboName: turbo.name,
      turboMapType: turboMap.source.mapType,
      compressorMm: turbo.compressorMm,
      displacementCc: geometry.displacementCc,
      boreMm: geometry.boreMm,
      strokeMm: geometry.strokeMm,
      compressionRatio: geometry.compressionRatio,
      camTiming,
      assembly,
      benchConfidence: benchConfidence(state),
      airDensityKgM3,
      dynoConfig: deepClone(state.dynoConfig),
      measuredAt: new Date().toISOString()
    };
  }

  // Applies a finished (completed or aborted) pull to the canonical state:
  // it becomes the active measurement, and its sample-derived wear/damage is
  // added. Returns a new normalized state.
  function commitDynoResult(inputState, result, options = {}) {
    const state = normalizeState(inputState);
    if (!result || result.dynoResultVersion !== DYNO_RESULT_VERSION) throw new Error('Ongeldig dynoresultaat.');
    const completed = isCompletedDyno(result);
    const label =
      options.label ||
      (completed
        ? `${state.buildName} dynopull`
        : result.status === DYNO_STATUS.FAILED_TO_START
          ? 'Start mislukt'
          : `Afgebroken @ ${result.abortRpm} rpm`);
    state.lastDyno = result;
    state.lastDynoSignature = engineSignature(state);
    state.dynoRuns = [{ ...result, label }, ...(state.dynoRuns || [])].slice(0, 20);
    const w = result.wear || {},
      d = result.damage || {};
    state.wear.engine = clamp(state.wear.engine + (w.engine || 0), 0, 100);
    state.wear.turbo = clamp(state.wear.turbo + (w.turbo || 0), 0, 100);
    state.wear.transmission = clamp(state.wear.transmission + (w.transmission || 0), 0, 100);
    state.damage.engine = clamp(state.damage.engine + (d.engine || 0), 0, 100);
    state.damage.turbo = clamp(state.damage.turbo + (d.turbo || 0), 0, 100);
    if (result.sampleCount > 0) {
      state.service.oilAgeKm += w.oilAgeKm || 0;
      state.service.oilRuns += 1;
    }
    state.history = [
      {
        type: 'dyno',
        at: new Date().toISOString(),
        label: completed ? 'Volledige dynopull' : result.status === DYNO_STATUS.FAILED_TO_START ? 'Dyno: start mislukt' : `Dyno afgebroken @ ${result.abortRpm} rpm`,
        status: result.status,
        partial: !completed,
        hp: result.peakHp,
        nm: result.peakTorqueNm
      },
      ...(state.history || [])
    ].slice(0, 40);
    return state;
  }

  function interpolateCurve(curve, rpm) {
    if (!curve || !curve.length) return null;
    if (rpm <= curve[0].rpm) return curve[0];
    for (let i = 1; i < curve.length; i++) {
      const b = curve[i],
        a = curve[i - 1];
      if (rpm <= b.rpm) {
        const f = (rpm - a.rpm) / (b.rpm - a.rpm),
          out = {};
        for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], f) : a[k];
        return out;
      }
    }
    return curve[curve.length - 1];
  }
  function airDensity(vehicle) {
    const tempK = Number(vehicle.ambientTempC || 20) + 273.15,
      alt = Math.max(-200, Number(vehicle.altitudeM || 0)),
      humidity = clamp(Number(vehicle.humidityPct || 50) / 100, 0, 1),
      pressurePa = 101325 * Math.exp(-alt / 8434.5),
      dry = pressurePa / (287.05 * tempK),
      humidFactor = 1 - humidity * 0.012;
    return dry * humidFactor;
  }
  function densityAltitude(vehicle) {
    const rho = airDensity(vehicle),
      rho0 = 1.225;
    return 44330 * (1 - Math.pow(rho / rho0, 0.234969));
  }
  function gripFactor(vehicle) {
    const tire = TIRE_MAP[vehicle.tireCompound],
      geometry = wheelFitment(vehicle),
      optimum = tire.optimumBar,
      pressurePenalty = clamp(1 - Math.abs(vehicle.pressureBar - optimum) * 0.14, 0.72, 1),
      widthFactor = clamp(0.88 + (vehicle.tireWidthMm - 195) / 420, 0.84, 1.18),
      sidewallRatio = geometry.sidewallMm / Math.max(1, vehicle.tireWidthMm),
      sidewallFactor =
        tire.id.includes('drag') || tire.id === 'slick'
          ? clamp(0.87 + sidewallRatio * 0.38, 0.88, 1.1)
          : clamp(1.03 - Math.max(0, sidewallRatio - 0.45) * 0.14, 0.94, 1.04),
      prep = vehicle.preparedTrack ? (tire.id === 'street' ? 1.04 : 1.13) : tire.id === 'slick' || tire.id === 'pro_radial' ? 0.88 : 1,
      burn = clamp(Number(vehicle.burnoutLevel || 0), 0, 100),
      tireTemp =
        Number(vehicle.trackTempC || 25) +
        burn * (tire.id === 'street' ? 0.28 : tire.id === 'uhp' ? 0.42 : tire.id === 'semislick' ? 0.55 : 0.72),
      target = tire.id === 'street' ? 38 : tire.id === 'uhp' ? 52 : tire.id === 'semislick' ? 68 : 82,
      tempFactor = clamp(1 - Math.abs(tireTemp - target) / (tire.id === 'street' ? 75 : 105), 0.75, 1.06);
    return {
      mu: tire.mu * pressurePenalty * widthFactor * sidewallFactor * prep * geometry.score * tempFactor,
      tire,
      geometry,
      pressurePenalty,
      widthFactor,
      sidewallFactor,
      prep,
      fitmentScore: geometry.score,
      tireTempC: tireTemp,
      tempFactor
    };
  }

  function simulateDrag(inputState, dynoResult, config = {}) {
    const state = normalizeState(inputState),
      dyno = dynoResult || state.lastDyno;
    if (!dyno || !Array.isArray(dyno.samples) || !dyno.samples.length) throw new Error('Een geldige dynometing is vereist.');
    if (!isCompletedDyno(dyno))
      throw new Error(
        dyno.failureRpm
          ? 'De dynorun eindigde met motorschade; eerst herstellen en opnieuw meten.'
          : 'De dynorun is niet voltooid; voer eerst een volledige pull uit.'
      );
    const vehicle = state.vehicle,
      drive = DRIVETRAINS[vehicle.drivetrain],
      trans = getPart(state, 'transmission'),
      grip = gripFactor(vehicle),
      wheelMassPenalty = Math.max(0, vehicle.wheelMassKg - 7.5) * 4 * 1.35,
      mass = Math.max(750, vehicle.massKg + drive.mass + trans.massDeltaKg + wheelMassPenalty),
      radius = grip.geometry.radiusM,
      gears = trans.gearRatios,
      finalDrive = trans.finalDrive,
      launchRpm = clamp(state.tune.launchRpm, 2200, state.tune.revLimitRpm - 500),
      revLimit = state.tune.revLimitRpm,
      shiftRpm = clamp(Number(vehicle.shiftRpm || revLimit), Math.max(4500, launchRpm + 500), revLimit),
      dt = 0.006,
      target = 402.336,
      rho = airDensity(vehicle),
      dynoRho = dyno.airDensityKgM3 || 1.204,
      airPowerFactor = clamp(Math.pow(rho / dynoRho, 0.35), 0.86, 1.05),
      cdA = vehicle.cdA || 0.68,
      g = 9.80665,
      wheelbase = vehicle.wheelbaseM || 2.58,
      cg = vehicle.cgHeightM || 0.51,
      transEff = trans.transEfficiency * (1 - drive.loss * 0.34),
      headwind = Math.max(-20, Number(vehicle.headwindKmh || 0)) / 3.6,
      transferScale = clamp(0.55 + (Number(vehicle.suspensionTransferPct || 60) / 100) * 0.85, 0.55, 1.4);
    let t = 0,
      x = 0,
      v = 0,
      aPrev = 0,
      gear = 0,
      shiftRemaining = 0,
      wheelspinIntegral = 0,
      tractionIntegral = 0,
      shifts = 0,
      rpm = launchRpm;
    const milestones = { m18: null, m100: null, m201: null, m305: null, m402: null, zero100: null },
      trace = [];
    let traceClock = 0;
    const gearBoost = gi => (gi === 0 ? state.tune.firstGearBoostPct / 100 : gi === 1 ? state.tune.secondGearBoostPct / 100 : 1);
    while (t < 25 && x < target) {
      const ratio = gears[Math.min(gear, gears.length - 1)] * finalDrive,
        wheelRpmEngine = (v / Math.max(0.05, 2 * Math.PI * radius)) * 60 * ratio,
        clutchSlip = gear === 0 && wheelRpmEngine < launchRpm;
      rpm = clutchSlip ? launchRpm : Math.max(1500, wheelRpmEngine);
      if (rpm >= shiftRpm && gear < gears.length - 1 && shiftRemaining <= 0) {
        gear++;
        shifts++;
        shiftRemaining = trans.shiftSeconds;
        rpm = Math.max(1800, (v / (2 * Math.PI * radius)) * 60 * gears[gear] * finalDrive);
      }
      let driveForce = 0,
        demandForce = 0;
      if (shiftRemaining > 0) shiftRemaining -= dt;
      else {
        const point = interpolateCurve(dyno.samples, rpm),
          naBase = clamp(178 - Math.max(0, rpm - 5000) * 0.006, 120, 180),
          boostScale = gearBoost(gear),
          torqueEngine = Math.max(0, (naBase + (point.torqueNm - naBase) * boostScale) * airPowerFactor);
        demandForce = (torqueEngine * gears[gear] * finalDrive * transEff) / Math.max(0.2, radius);
        const transfer = ((mass * Math.max(-2, aPrev) * cg) / wheelbase) * transferScale;
        let drivenNormal;
        if (vehicle.drivetrain === 'FWD') drivenNormal = drive.frontStatic * mass * g - transfer;
        else if (vehicle.drivetrain === 'RWD') drivenNormal = (1 - drive.frontStatic) * mass * g + transfer;
        else drivenNormal = mass * g * drive.tractionUse;
        drivenNormal = clamp(drivenNormal, mass * g * 0.18, mass * g);
        const speedGrip = v < 8 ? 1 : clamp(1 - (v - 8) * 0.0016, 0.9, 1),
          tireForce = grip.mu * drivenNormal * speedGrip;
        driveForce = Math.min(demandForce, tireForce);
        const spin = demandForce > tireForce ? (demandForce - tireForce) / Math.max(1, demandForce) : 0;
        wheelspinIntegral += spin * dt;
        tractionIntegral += dt;
      }
      const relativeAir = Math.max(0, v + headwind),
        aero = 0.5 * rho * cdA * relativeAir * relativeAir,
        rolling = grip.tire.rolling * mass * g * (1 + v * 0.006),
        net = driveForce - aero - rolling,
        a = Math.max(-1.5, net / mass);
      v = Math.max(0, v + a * dt);
      x += v * dt;
      t += dt;
      aPrev = a;
      const mark = (key, dist) => {
        if (milestones[key] == null && x >= dist) milestones[key] = { time: t, speedKmh: v * 3.6 };
      };
      mark('m18', 18.288);
      mark('m100', 100.584);
      mark('m201', 201.168);
      mark('m305', 304.8);
      mark('m402', 402.336);
      if (milestones.zero100 == null && v * 3.6 >= 100) milestones.zero100 = t;
      traceClock += dt;
      if (traceClock >= 0.04) {
        traceClock = 0;
        trace.push({ time: t, distanceM: x, speedKmh: v * 3.6, gear: gear + 1, rpm, accelerationG: a / g });
      }
    }
    if (!milestones.m402) throw new Error('De combinatie bereikte de finish niet binnen 25 seconden.');
    const wheelspinPct = clamp((wheelspinIntegral / Math.max(0.001, tractionIntegral)) * 100, 0, 99),
      rt = Number.isFinite(config.reactionTime) ? config.reactionTime : 0.09,
      redLight = rt < 0;
    return {
      valid: !redLight,
      redLight,
      reactionTime: rt,
      sixtyFt: milestones.m18?.time || null,
      threeThirty: milestones.m100?.time || null,
      eighth: milestones.m201?.time || null,
      eighthKmh: milestones.m201?.speedKmh || null,
      thousandFt: milestones.m305?.time || null,
      quarter: milestones.m402.time,
      trapKmh: milestones.m402.speedKmh,
      zeroTo100: milestones.zero100,
      wheelspinPct,
      shifts,
      drivetrain: drive.name,
      tireName: grip.tire.name,
      tireSize: `${vehicle.tireWidthMm}/${vehicle.aspectRatio} R${vehicle.rimDiameterIn}`,
      wheelSpec: `${vehicle.rimDiameterIn}×${Number(vehicle.rimWidthIn).toFixed(1)} in`,
      tireDiameterMm: grip.geometry.diameterMm,
      totalMassKg: mass,
      finishTotalTime: milestones.m402.time + Math.max(0, rt),
      trace,
      setup: {
        mu: grip.mu,
        pressurePenalty: grip.pressurePenalty,
        driveLoss: drive.loss,
        tireTempC: grip.tireTempC,
        airDensityKgM3: rho,
        densityAltitudeM: densityAltitude(vehicle),
        headwindKmh: vehicle.headwindKmh,
        shiftRpm
      }
    };
  }

  // ---- Anti-lag (ALS) -------------------------------------------------------
  // ALS retards ignition, enriches and opens a throttle bypass while the driver is
  // off the throttle (or on the two-step) so combustion continues in the exhaust
  // manifold. That energy spins the turbine: boost is kept, at the price of EGT,
  // manifold pressure, fuel and turbo/manifold/valve life.
  const ANTI_LAG_PRESETS = Object.freeze({
    mild: { targetRpm: 3800, targetBoostBar: 0.5, retardDeg: 12, extraFuelPct: 6, bypassPct: 6, aggressiveness: 25, maxEgtC: 950, maxShaftPct: 88, timeoutS: 2.5, cooldownS: 6 },
    street: { targetRpm: 4000, targetBoostBar: 0.9, retardDeg: 18, extraFuelPct: 10, bypassPct: 10, aggressiveness: 40, maxEgtC: 980, maxShaftPct: 90, timeoutS: 3, cooldownS: 6 },
    rally: { targetRpm: 4300, targetBoostBar: 1.3, retardDeg: 28, extraFuelPct: 18, bypassPct: 18, aggressiveness: 70, maxEgtC: 1050, maxShaftPct: 94, timeoutS: 5, cooldownS: 5 },
    drag: { targetRpm: 4600, targetBoostBar: 1.8, retardDeg: 34, extraFuelPct: 24, bypassPct: 24, aggressiveness: 90, maxEgtC: 1100, maxShaftPct: 97, timeoutS: 3.5, cooldownS: 8 }
  });
  const ANTI_LAG_MODES = ['off', 'mild', 'street', 'rally', 'drag', 'custom'];
  const ANTI_LAG_LIMITS = Object.freeze({
    targetRpm: [2500, 7000],
    targetBoostBar: [0, 3.5],
    retardDeg: [0, 45],
    extraFuelPct: [0, 40],
    bypassPct: [0, 40],
    aggressiveness: [0, 100],
    maxEgtC: [850, 1250],
    maxShaftPct: [70, 110],
    timeoutS: [0.5, 15],
    cooldownS: [0, 30]
  });
  function defaultAntiLag() {
    return { mode: 'off', ...ANTI_LAG_PRESETS.street };
  }
  // What the installed ECU and bypass hardware allow.
  function antiLagCapability(inputState) {
    const s = normalizeState(inputState),
      ecu = getPart(s, 'ecu'),
      spool = getPart(s, 'spool');
    const ecuLevel = ecu.id === 'med17' ? 'none' : ecu.id === 'custom_med17' ? 'limited' : 'full';
    const bypassMaxPct = spool.id === 'hard_als' ? 32 : spool.id === 'mild_als' ? 20 : 10;
    return { ecuLevel, ecuName: ecu.name, bypassMaxPct, maxAggressiveness: ecuLevel === 'limited' ? 45 : ecuLevel === 'none' ? 0 : 100, flatShift: ecuLevel !== 'none' };
  }
  function resolveAntiLag(inputState) {
    const s = normalizeState(inputState),
      cfg = { ...defaultAntiLag(), ...(s.tune.als || {}) },
      mode = ANTI_LAG_MODES.includes(cfg.mode) ? cfg.mode : 'off',
      cap = antiLagCapability(s),
      notes = [];
    const raw = mode === 'custom' ? cfg : mode === 'off' ? cfg : ANTI_LAG_PRESETS[mode];
    const params = {};
    for (const [k, [lo, hi]] of Object.entries(ANTI_LAG_LIMITS)) params[k] = clamp(Number(raw[k] ?? defaultAntiLag()[k]), lo, hi);
    if (params.bypassPct > cap.bypassMaxPct) {
      params.bypassPct = cap.bypassMaxPct;
      notes.push(`Bypass begrensd tot ${cap.bypassMaxPct}% door de luchtbypass-hardware.`);
    }
    if (params.aggressiveness > cap.maxAggressiveness) {
      params.aggressiveness = cap.maxAggressiveness;
      notes.push(cap.ecuLevel === 'none' ? `${cap.ecuName} ondersteunt geen anti-lag.` : `${cap.ecuName} staat slechts beperkte anti-lag toe.`);
    }
    const enabled = mode !== 'off' && cap.ecuLevel !== 'none' && params.aggressiveness > 0;
    return { enabled, mode, params, capability: cap, notes };
  }

  // Visible exhaust flame for a combustion event, from the unburnt fuel that
  // reaches the tailpipe and the gas temperature there. Returns intensity 0..1;
  // nothing is visible when the conditions do not support ignition.
  function exhaustFlameEvent(ev) {
    const egtC = Number(ev.egtC) || 0,
      tailC = egtC - 230,
      fuelGps = Math.max(0, Number(ev.fuelGps) || 0),
      unburntG = fuelGps * Math.max(0, Number(ev.cutS) || 0) * clamp(Number(ev.unburntFraction ?? 0.6), 0, 1) + Math.max(0, Number(ev.unburntG) || 0),
      heat = clamp((tailC - 520) / 330, 0, 1),
      fuelTerm = clamp(unburntG / 1.6, 0, 1),
      severity = clamp(Number(ev.severity) || 0, 0, 1),
      intensity = clamp(heat * fuelTerm * (0.55 + 0.45 * severity), 0, 1);
    return {
      kind: ev.kind || 'event',
      visible: intensity > 0.04,
      intensity,
      unburntG,
      tailpipeC: tailC,
      durationMs: Math.round(60 + intensity * 380),
      sizeScale: 0.35 + intensity * 1.25,
      color: tailC > 860 ? 'blue-white' : tailC > 720 ? 'orange' : 'red'
    };
  }

  // Realtime turbo state for staging and the drag run. It keeps shaft speed,
  // boost, EGT and ALS state between frames and uses the same compressor/turbine
  // maps as the dyno; engine airflow comes from the completed dyno samples.
  function createTurboRuntime(inputState, options = {}) {
    const state = normalizeState(inputState),
      dyno = options.dyno || state.lastDyno;
    if (!isCompletedDyno(dyno)) throw new Error('Een volledige dynometing is vereist.');
    const turbo = getPart(state, 'turbo'),
      air = getPart(state, 'air'),
      exhaust = getPart(state, 'exhaust'),
      boostControl = getPart(state, 'boostControl'),
      fuel = getPart(state, 'fuel'),
      map = Turbo.getMap(turbo.id),
      chargeAir = Turbo.DATA.chargeAir[air.id] || Turbo.DATA.chargeAir.oem_air,
      exhaustSystem = Turbo.DATA.exhaust[exhaust.id] || Turbo.DATA.exhaust.oem_exhaust,
      wastegate = Turbo.DATA.wastegate[boostControl.id] || Turbo.DATA.wastegate.oem_internal,
      stoichAfr = Turbo.DATA.fuelStoichAfr[fuel.id] || 14.7,
      vehicle = state.vehicle,
      baroBar = 1.01325 * Math.exp(-Math.max(-200, Number(vehicle.altitudeM || 0)) / 8434.5),
      ambientK = Number(vehicle.ambientTempC ?? 20) + 273.15,
      als = resolveAntiLag(state),
      p = als.params,
      samples = dyno.samples,
      lambdaBase = Number(state.tune.lambda) || 0.8;
    const rt = {
      t: 0,
      shaftRpm: 0.12 * map.maxShaftRpm,
      boostBar: 0,
      egtC: 560,
      empBar: 0,
      alsActive: false,
      alsIntensity: 0,
      alsHeldS: 0,
      alsLockoutS: 0,
      alsLimitedBy: '',
      alsSeconds: 0,
      wear: { turbo: 0, manifold: 0, valves: 0, engine: 0 },
      damage: { turbo: 0, engine: 0 },
      fuelUsedG: 0,
      maxEgtC: 0,
      maxShaftPct: 0,
      maxEmpBar: 0,
      last: null
    };
    function step(dt, input = {}) {
      dt = clamp(Number(dt) || 0, 0, 0.1);
      rt.t += dt;
      const rpm = clamp(Number(input.rpm) || 900, 700, samples[samples.length - 1].rpm + 400),
        throttle = clamp(Number(input.throttle ?? 1), 0, 1),
        twoStep = !!input.twoStep,
        s = interpolateCurve(samples, clamp(rpm, samples[0].rpm, samples[samples.length - 1].rpm)),
        idleScale = rpm < samples[0].rpm ? rpm / samples[0].rpm : 1,
        bSteady = Number(s.boostBar) || 0,
        manSteadyK = (Number(s.iatC) || 30) + 273.15;
      // ALS gate: requested, enabled, above its minimum rpm and not timed out.
      if (rt.alsLockoutS > 0) rt.alsLockoutS = Math.max(0, rt.alsLockoutS - dt);
      const wantAls = als.enabled && !!input.alsRequest && rt.alsLockoutS <= 0 && rpm >= p.targetRpm * 0.6;
      let k = wantAls ? p.aggressiveness / 100 : 0,
        limitedBy = '';
      if (wantAls) {
        if (rt.egtC > p.maxEgtC - 40) { k *= clamp((p.maxEgtC - rt.egtC) / 40, 0, 1); limitedBy = 'EGT-limiet'; }
        const shaftPct = (rt.shaftRpm / map.maxShaftRpm) * 100;
        if (shaftPct > p.maxShaftPct - 3) { k *= clamp((p.maxShaftPct - shaftPct) / 3, 0, 1); limitedBy = 'as-limiet'; }
        if (rt.boostBar > p.targetBoostBar - 0.1) { k *= clamp((p.targetBoostBar + 0.1 - rt.boostBar) / 0.2, 0, 1); limitedBy = limitedBy || 'boost-target'; }
        rt.alsHeldS += dt;
        if (rt.alsHeldS > p.timeoutS) { rt.alsLockoutS = p.cooldownS; rt.alsHeldS = 0; k = 0; limitedBy = 'timeout'; }
      } else rt.alsHeldS = Math.max(0, rt.alsHeldS - dt * 2);
      rt.alsActive = wantAls && rt.alsLockoutS <= 0;
      rt.alsIntensity = rt.alsActive ? k : 0;

      if (rt.alsActive) rt.alsSeconds += dt;
      // Engine airflow relative to the WOT dyno sample at this rpm.
      let airFactor = (0.06 + 0.94 * throttle) * idleScale;
      if (twoStep) airFactor = Math.max(airFactor, 0.7 * idleScale);
      if (rt.alsActive) airFactor = Math.max(airFactor, (0.3 + (p.bypassPct / 100) * 1.6 * k) * idleScale);
      const lambdaAls = lambdaBase * (1 - (p.extraFuelPct / 100) * k),
        lambda = rt.alsActive ? lambdaAls : lambdaBase;
      const airflowAt = (B, tK) =>
        ((Number(s.airflowLbMin) || 1) / Turbo.LBMIN_PER_KGS) * airFactor * ((baroBar + B) / (baroBar + bSteady)) * (manSteadyK / tK);
      const load = Math.max(throttle, twoStep ? 0.7 : 0);
      const exhaustTempK = B => 273.15 + 600 + ((Number(s.egtC) || 850) - 600) * (0.3 + 0.7 * load) + (B - bSteady) * 40 * load;
      const chargeCooling = (t2K, flowLb) => {
        const eps = (0.55 + 0.45 * air.cooling) * clamp(1 - 0.35 * Math.max(0, flowLb / chargeAir.refFlowLbMin - 1), 0.4, 1);
        return ambientK + 2 + (t2K - ambientK) * (1 - eps) * (1 - fuel.fuelCooling);
      };
      // Exhaust energy: ALS burns a retarded/rich charge in the manifold; the two-step
      // alone releases a smaller amount through its ignition cut.
      const airKgS = airflowAt(rt.boostBar, manSteadyK),
        fuelKgS = airKgS / (stoichAfr * lambda),
        burnable = Math.min(1, lambda),
        alsFraction = rt.alsActive ? clamp(0.1 + p.retardDeg / 55 + 0.2 * k, 0, 0.8) * k : 0,
        twoStepFraction = twoStep && !rt.alsActive ? 0.05 : 0,
        exhaustKgS = airKgS + fuelKgS,
        // The ALS controller caps its energy so turbine-inlet temperature stays at maxEgtC.
        alsKwCap = rt.alsActive ? Math.max(0, ((p.maxEgtC + 273.15 - exhaustTempK(rt.boostBar)) * exhaustKgS * 1150) / 1000) : Infinity,
        extraExhaustKw = Math.min(fuelKgS * 43000 * burnable * alsFraction, alsKwCap) + fuelKgS * 43000 * burnable * twoStepFraction;
      if (rt.alsActive && fuelKgS * 43000 * burnable * alsFraction > alsKwCap + 1e-9) limitedBy = 'EGT-limiet';
      const target = rt.alsActive ? p.targetBoostBar : Number.isFinite(input.targetBoostBar) ? input.targetBoostBar : bSteady * (twoStep ? 0.8 : 1) * throttle;
      const tp = Turbo.matchEngine(
        {
          map,
          baroBar,
          ambientK,
          airflowAt,
          exhaustTempK,
          chargeCooling,
          stoichAfr,
          lambda,
          chargeAir,
          exhaust: exhaustSystem,
          wastegate,
          protectShaftSpeed: !!(state.tune.overboostCut || wastegate.shaftSpeedSensor),
          extraExhaustKw
        },
        { targetBoostBar: Math.max(0, target), prevShaftRpm: rt.shaftRpm, dtS: dt }
      );
      rt.alsLimitedBy = rt.alsLockoutS > 0 ? 'cooldown' : limitedBy;
      // Spool-up is inertia-limited inside matchEngine; spool-down is limited by the
      // rotor inertia against the compressor load, while boost bleeds off quickly.
      const inertiaScale = Math.pow(map.inertia / 6e-5, 0.3);
      if (tp.shaftRpm < rt.shaftRpm) rt.shaftRpm += (tp.shaftRpm - rt.shaftRpm) * (1 - Math.exp(-dt / (0.9 * inertiaScale)));
      else rt.shaftRpm = tp.shaftRpm;
      rt.boostBar += (tp.boostBar - rt.boostBar) * (tp.boostBar < rt.boostBar ? 1 - Math.exp(-dt / 0.12) : 1);
      rt.egtC += (tp.t3C - rt.egtC) * (1 - Math.exp(-dt / 0.35));
      rt.empBar = tp.empBarAbs - baroBar;
      const shaftPct = (rt.shaftRpm / map.maxShaftRpm) * 100;
      // Wear (percent of component life) and damage from what this step actually did.
      const hot = Math.max(0, (rt.egtC - 950) / 100),
        vHot = Math.max(0, (rt.egtC - 980) / 100);
      rt.wear.turbo += (0.02 * hot * hot + 0.05 * Math.max(0, shaftPct - 95) / 5 + (tp.surge ? 0.02 : 0)) * dt;
      rt.wear.manifold += 0.03 * vHot * vHot * dt;
      rt.wear.valves += 0.02 * hot * Math.max(1, rt.empBar / 2) * dt;
      rt.wear.engine += (rt.alsActive ? 0.004 * k : 0) * dt;
      if (rt.egtC > 1150) rt.damage.turbo += 0.6 * ((rt.egtC - 1150) / 50) * dt;
      if (shaftPct > 112) rt.damage.turbo += 2.5 * dt;
      rt.fuelUsedG += fuelKgS * 1000 * dt;
      rt.maxEgtC = Math.max(rt.maxEgtC, rt.egtC);
      rt.maxShaftPct = Math.max(rt.maxShaftPct, shaftPct);
      rt.maxEmpBar = Math.max(rt.maxEmpBar, rt.empBar);
      // Continuous ALS pops: rich burn that is still going when it reaches the tailpipe.
      // Pop size follows the ALS strategy (retard + enrichment) and how hard it is firing now.
      const aggr = p.aggressiveness / 100;
      const flame = rt.alsActive
        ? exhaustFlameEvent({
            kind: 'als',
            egtC: rt.egtC,
            fuelGps: fuelKgS * 1000,
            cutS: 0.14,
            unburntFraction: clamp(1 - lambda + 0.3 * aggr + p.retardDeg / 150, 0, 0.9),
            severity: 0.5 * aggr + 0.5 * k
          })
        : { visible: false, intensity: 0 };
      rt.last = {
        rpm,
        boostBar: rt.boostBar,
        targetBoostBar: target,
        shaftRpm: rt.shaftRpm,
        shaftPct,
        egtC: rt.egtC,
        empBar: rt.empBar,
        limitedBy: tp.limitedBy,
        surge: tp.surge,
        alsActive: rt.alsActive,
        alsIntensity: rt.alsIntensity,
        alsLimitedBy: rt.alsLimitedBy,
        alsLockoutS: rt.alsLockoutS,
        fuelGps: fuelKgS * 1000,
        lambda,
        flame,
        popRateHz: rt.alsActive ? 4 + 18 * k : 0,
        steadyBoostBar: bSteady
      };
      return rt.last;
    }
    return { state: rt, als, map, step };
  }

  // Stationary ALS hold at the ALS target rpm (tune-page test), sampled every 0.1 s.
  function simulateAntiLagHold(inputState, options = {}) {
    const state = normalizeState(inputState),
      rt = createTurboRuntime(state, options),
      seconds = clamp(Number(options.seconds) || 4, 0.5, 20),
      rpm = Number(options.rpm) || rt.als.params.targetRpm,
      trace = [];
    for (let t = 0; t < seconds - 1e-9; t += 0.05) {
      const snap = rt.step(0.05, { rpm, throttle: 0, twoStep: true, alsRequest: options.als !== false });
      if (Math.round(t * 20) % 2 === 0) trace.push({ t: round(t + 0.05, 2), ...snap, flame: undefined, flameIntensity: snap.flame.intensity });
    }
    const s = rt.state;
    return { als: rt.als, rpm, seconds, trace, wear: { ...s.wear }, damage: { ...s.damage }, fuelUsedG: s.fuelUsedG, maxEgtC: s.maxEgtC, maxShaftPct: s.maxShaftPct, maxEmpBar: s.maxEmpBar, finalBoostBar: s.boostBar, alsSeconds: s.alsSeconds };
  }

  // Applies wear/damage accumulated by a realtime turbo runtime to the canonical state.
  function applyRuntimeWear(inputState, runtimeState) {
    const state = normalizeState(inputState),
      w = runtimeState.wear || {},
      d = runtimeState.damage || {};
    state.wear.turbo = clamp(state.wear.turbo + (w.turbo || 0), 0, 100);
    state.wear.manifold = clamp(state.wear.manifold + (w.manifold || 0), 0, 100);
    state.wear.valves = clamp(state.wear.valves + (w.valves || 0), 0, 100);
    state.wear.engine = clamp(state.wear.engine + (w.engine || 0), 0, 100);
    state.damage.turbo = clamp(state.damage.turbo + (d.turbo || 0), 0, 100);
    state.damage.engine = clamp(state.damage.engine + (d.engine || 0), 0, 100);
    return state;
  }

  function diagnoseDyno(result) {
    if (!result) return [];
    const out = [];
    const add = (system, severity, observation, action) => out.push({ system, severity, observation, action });
    if (result.status === DYNO_STATUS.FAILED_TO_START)
      add('Run', 'danger', `Pull niet gestart: ${result.abortReason}`, 'Herstel de motor voordat opnieuw wordt gemeten.');
    else if (result.status === DYNO_STATUS.ABORTED)
      add(
        'Run',
        result.abortKind === 'operator' ? 'warn' : 'danger',
        `Pull afgebroken bij ${result.abortRpm} rpm: ${result.abortReason} Alle waarden hieronder zijn partieel (tot ${result.abortRpm} rpm).`,
        result.abortKind === 'operator'
          ? 'Voer een volledige pull uit voor een geldige meting.'
          : 'Herstel de oorzaak en virtuele schade voordat opnieuw wordt gemeten.'
      );
    if (result.maxFuelDuty > 88)
      add(
        'Brandstof',
        result.maxFuelDuty > 102 ? 'danger' : 'warn',
        `Maximale duty ${Math.round(result.maxFuelDuty)}%.`,
        `Vergroot de flowmarge of verlaag de vraag; controleer de raildrukcurve.`
      );
    if (result.maxTurboLoad > 92)
      add(
        'Turbo',
        result.maxTurboLoad > 112 ? 'danger' : 'warn',
        `Turbo-load ${Math.round(result.maxTurboLoad)}% en geschatte as ${Math.round(result.maxTurboShaftRpm / 1000)}k rpm.`,
        'Gebruik minder druk buiten het efficiënte gebied, meer turbine/wastegateflow of een passend compressorframe.'
      );
    if (result.maxKnockRisk > 0.55)
      add(
        'Verbranding',
        result.maxKnockRisk > 1 ? 'danger' : 'warn',
        `Knock-index piekte op ${result.maxKnockRisk.toFixed(2)}.`,
        'Vergroot brandstof-, temperatuur- en ontstekingsmarge; controleer mechanische noktiming.'
      );
    if (result.maxIatC > 50)
      add(
        'Inlaatlucht',
        'warn',
        `IAT bereikte ${Math.round(result.maxIatC)}°C.`,
        'Verbeter koeling, ventilator/ice-tank of verminder heat-soak en compressorbelasting.'
      );
    const minOil = result.minOilPressureBar;
    if ((minOil !== null && minOil < 2.8) || result.maxOilTempC > 135)
      add(
        'Olie',
        minOil !== null && minOil < 2.1 ? 'danger' : 'warn',
        `Min ${minOil === null ? '—' : minOil.toFixed(1)} bar, max ${Math.round(result.maxOilTempC)}°C, aeratie ${Math.round(result.maxOilAerationPct)}%.`,
        'Controleer vulniveau, clearances, pickup/cartercontrole, viscositeit en koeling.'
      );
    if (result.camTiming?.applicable && result.camTiming.score < 0.88)
      add(
        'Nokken',
        'warn',
        `Timingmatch ${Math.round(result.camTiming.score * 100)}%.`,
        'Meet opnieuw op overlap-TDC en herstel de mechanische basisstand voordat de map wordt beoordeeld.'
      );
    if (result.assembly?.score < 0.85)
      add(
        'Montage',
        result.assembly.score < 0.68 ? 'danger' : 'warn',
        `Montagescore ${Math.round(result.assembly.score * 100)}%.`,
        'Controleer ringgap, lagerclearance, bougiegap, priming en montageprocedure.'
      );
    if (!out.length)
      add(
        'Resultaat',
        'good',
        'Geen hoofdafwijking in de gemodelleerde kanalen.',
        'Bewaar de run als referentie en vergelijk herhaalbaarheid bij dezelfde condities.'
      );
    return out;
  }

  function applyPreset(inputState, presetId) {
    const state = normalizeState(inputState),
      p = PRESETS[presetId];
    if (!p) throw new Error(`Unknown preset ${presetId}`);
    state.buildName = p.name;
    state.selections = { ...state.selections, ...deepClone(p.selections) };
    state.tune = { ...state.tune, ...deepClone(p.tune) };
    if (p.assembly) state.assembly = { ...state.assembly, ...deepClone(p.assembly) };
    if (p.service) state.service = { ...state.service, ...deepClone(p.service) };
    if (p.dynoConfig) state.dynoConfig = { ...state.dynoConfig, ...deepClone(p.dynoConfig) };
    if (p.vehicle) state.vehicle = { ...state.vehicle, ...deepClone(p.vehicle) };
    state.bench = { results: {} };
    return state;
  }
  function createInitialState() {
    let state = blankState(),
      result = simulateEngine(state, { noise: false });
    state.lastDyno = result;
    state.lastDynoSignature = engineSignature(state);
    state.dynoRuns = [{ ...result, label: 'Referentierun Randy JE83 K04' }];
    state.history = [
      { type: 'dyno', label: 'Referentierun Randy JE83 K04', at: new Date().toISOString(), hp: result.peakHp, nm: result.peakTorqueNm }
    ];
    return state;
  }
  function totalPartsPrice(state) {
    return CATEGORIES.reduce((sum, cat) => sum + getPart(state, cat.id).price, 0);
  }
  function evaluateChallenges(inputState) {
    const s = normalizeState(inputState),
      r = s.lastDyno,
      d = s.lastDrag,
      b = benchConfidence(s),
      turbo = getPart(s, 'turbo'),
      ok = isCompletedDyno(r);
    return {
      first_pull: ok,
      safe500: !!(ok && r.peakHp >= 500 && r.reliabilityScore >= 80),
      k04_hero: !!(ok && ['k04', 'k04_hybrid'].includes(turbo.id) && r.peakHp >= 500),
      bench_master: b.complete && b.failed === 0,
      fwd11: !!(d && d.valid && s.vehicle.drivetrain === 'FWD' && d.quarter < 12),
      fwd10: !!(d && d.valid && s.vehicle.drivetrain === 'FWD' && d.quarter < 11),
      seven_hundred: !!(ok && r.peakHp >= 700 && r.reliabilityScore >= 68),
      four_digits: !!(ok && r.peakHp >= 1000),
      big_turbo_survivor: !!(ok && turbo.compressorMm >= 98 && r.reliabilityScore >= 55)
    };
  }

  function selfTest() {
    const checks = [],
      add = (name, ok, value) => checks.push({ name, ok: !!ok, value });
    let stock = applyPreset(blankState(), 'stock');
    stock.service.oilId = '5w40_502';
    const stockR = simulateEngine(stock, { noise: false });
    add('OEM vermogen plausibel', stockR.peakHp > 165 && stockR.peakHp < 250, round(stockR.peakHp));
    const randyState = blankState(),
      randy = simulateEngine(randyState, { noise: false }),
      rg = engineGeometry(randyState);
    add('Randy JE83 cilinderinhoud', rg.displacementCc > 2005 && rg.displacementCc < 2012, round(rg.displacementCc, 1));
    add('Randy K04 band', randy.peakHp > 420 && randy.peakHp < 590, round(randy.peakHp));
    const big = applyPreset(blankState(), 'pro98');
    big.selections.spool = 'none';
    big.tune.boostLowBar = 1.6;
    big.tune.boostMidBar = 2.6;
    const bigNo = simulateEngine(big, { noise: false });
    big.selections.spool = 'n2o_150';
    const bigYes = simulateEngine(big, { noise: false }),
      pNo = bigNo.samples.find(p => p.rpm === 4500)?.boostBar || 0,
      pYes = bigYes.samples.find(p => p.rpm === 4500)?.boostBar || 0;
    add('98-mm spool assistance werkt', pYes > pNo * 1.2 + 0.3, `${pNo.toFixed(2)}→${pYes.toFixed(2)} bar @4500`);
    const lowOil = blankState();
    lowOil.service.liters = 3.7;
    const lowR = simulateEngine(lowOil, { noise: false });
    add(
      'Laag oliepeil verlaagt marge',
      lowR.reliabilityScore < randy.reliabilityScore,
      `${lowR.reliabilityScore}<${randy.reliabilityScore}`
    );
    const badAssembly = blankState();
    badAssembly.assembly.topRingGapMm = 0.3;
    const badR = simulateEngine(badAssembly, { noise: false });
    add(
      'Krappe ringgap verlaagt marge',
      badR.reliabilityScore < randy.reliabilityScore,
      `${badR.reliabilityScore}<${randy.reliabilityScore}`
    );
    const tg = tireGeometry(blankState().vehicle);
    add('Bandomtrek', tg.diameterMm > 640 && tg.diameterMm < 680, round(tg.diameterMm, 1));
    const bt = runBenchTest(blankState(), 'compression');
    add('Benchtest werkt', bt.values.length === 4 && bt.score > 0, `${bt.score}/100`);
    try {
      const drag = simulateDrag(blankState(), randy, { reactionTime: 0.08 });
      add(
        'Quarter-mile integratie',
        drag.quarter > 7 && drag.quarter < 18 && drag.trapKmh > 120,
        `${drag.quarter.toFixed(3)} s @ ${drag.trapKmh.toFixed(1)}`
      );
    } catch (e) {
      add('Quarter-mile integratie', false, e.message);
    }
    return { ok: checks.every(c => c.ok), checks };
  }

  const Core = {
    CATEGORIES,
    CATEGORY_MAP,
    OILS,
    OIL_MAP,
    FILTERS,
    FILTER_MAP,
    TIRE_COMPOUNDS,
    TIRE_MAP,
    DRIVETRAINS,
    PRESETS,
    BENCH_TESTS,
    CHALLENGES,
    blankState,
    normalizeState,
    createInitialState,
    getPart,
    engineSignature,
    benchSignature,
    engineGeometry,
    camTimingHealth,
    assemblyTargets,
    assemblyHealth,
    runBenchTest,
    benchConfidence,
    isDynoCurrent,
    tireGeometry,
    wheelFitment,
    gripFactor,
    airDensity,
    densityAltitude,
    oilHealth,
    simulateEngine,
    commitDynoResult,
    isCompletedDyno,
    summarizeDynoSamples,
    dynoWearFromSamples,
    sanitizeDynoResult,
    DYNO_STATUS,
    DYNO_RESULT_VERSION,
    DYNO_MIN_PARTIAL_SAMPLES,
    simulateDrag,
    ANTI_LAG_PRESETS,
    ANTI_LAG_MODES,
    ANTI_LAG_LIMITS,
    defaultAntiLag,
    antiLagCapability,
    resolveAntiLag,
    exhaustFlameEvent,
    createTurboRuntime,
    simulateAntiLagHold,
    applyRuntimeWear,
    interpolateCurve,
    diagnoseDyno,
    applyPreset,
    totalPartsPrice,
    evaluateChallenges,
    selfTest,
    clamp,
    lerp,
    round
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.EA888Core = Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
