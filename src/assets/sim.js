/* EA888 Lab v0.9.0 — deterministic engine, bench and drag simulation core.
 * Offline and dependency-free. This is an engineering game model, not workshop
 * certification, an ECU calibration or a substitute for measurements on a real engine.
 */
(function (root) {
  'use strict';
  const Turbo = typeof module !== 'undefined' && module.exports ? require('./turbo.js') : root.EA888Turbo;
  const Engine = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.EA888Engine;

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
  const RAW_CATEGORIES = [{"id":"block","label":"Onderblok","short":"Blok","items":[{"id":"oem_block","name":"OEM CAWB onderblok","detail":"Gietijzeren Gen-1 blok met standaard zuigers en drijfstangen. Een vroege koppelpiek en knock zijn de echte vijanden.","specs":"1984 cc · 82,5 × 92,8 mm · 9,6:1","price":0,"hpLimit":380,"torqueLimit":520,"rpmLimit":7500,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"oem"},{"id":"rods","name":"Gesmede drijfstangen","detail":"Gesmede drijfstangen met OEM-zuigers. De ringlands en zuigers blijven de volgende grens.","specs":"H-beam · ARP-bouten · 82,5 mm boring","price":1650,"hpLimit":520,"torqueLimit":700,"rpmLimit":7900,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"rods"},{"id":"forged","name":"Forged zuigers + drijfstangen","detail":"Gebalanceerde forged set met passende spelingen, lagers en gecontroleerde compressieverhouding.","specs":"2618 zuigers · H-beam rods · gebalanceerd","price":4800,"hpLimit":780,"torqueLimit":930,"rpmLimit":8400,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.3,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"forged"},{"id":"randy_je83","name":"Randy JE 83,00 mm shortblock","detail":"De bekende CAWB-basis: JE Ultra 83,00 mm 9,6:1, gesmede drijfstangen, ACL-lagers, ARP rod bolts en volledig gebalanceerde roterende delen.","specs":"2008 cc · JE Ultra 83,00 mm · 9,6:1 · ACL · ARP","price":5850,"hpLimit":850,"torqueLimit":980,"rpmLimit":8600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":7,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":83,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"closed_deck","name":"Closed-deck race shortblock","detail":"Closed-deck versterking, forged internals, bedplate-brace en volledig dynamisch gebalanceerd.","specs":"Closed deck · 83,0 mm forged · brace · 9,0:1","price":9500,"hpLimit":1120,"torqueLimit":1200,"rpmLimit":9100,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":8,"massDeltaKg":8,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":83,"strokeMm":92.8,"compressionRatio":9,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"closed"},{"id":"billet_block","name":"Billet/filled drag shortblock","detail":"Extreme sleeved/billet dragconstructie. Onderhoudsintensief en niet bedoeld als normale straatmotor.","specs":"Ductile sleeves · billet mains · dry-deck","price":18500,"hpLimit":1500,"torqueLimit":1500,"rpmLimit":9800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":7,"massDeltaKg":16,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":83.5,"strokeMm":92.8,"compressionRatio":8.8,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"billet"},{"id":"promod_block","name":"Promod dry-deck billet block","detail":"Volledig billet/dry-deck onderblok met ductile sleeves, vaste mains en externe koelwaterroute. Onderhoud na korte race-intervallen.","specs":"83,5 mm · dry deck · billet mains · drag-only","price":31500,"hpLimit":2350,"torqueLimit":2250,"rpmLimit":10600,"reliabilityBonus":10,"massDeltaKg":24,"boreMm":83.5,"strokeMm":92.8,"compressionRatio":8.5,"visualKey":"promod"}]},{"id":"crank","label":"Krukas & demper","short":"Krukas","items":[{"id":"oem_crank","name":"OEM krukas + poelie","detail":"OEM krukas en rubberdemper. Vermijd langdurig extreem toerental en abrupte koppelpulsen.","specs":"92,8 mm slag · OEM demper","price":0,"hpLimit":700,"torqueLimit":820,"rpmLimit":8000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_balanced_crank","name":"Randy OEM krukas — gebalanceerd","detail":"Originele CAWB-krukas, gecontroleerd en samen met de nieuwe roterende delen dynamisch gebalanceerd.","specs":"OEM 92,8 mm · gemeten · dynamisch gebalanceerd","price":1450,"hpLimit":880,"torqueLimit":1000,"rpmLimit":8600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.72,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"fluidampr","name":"OEM krukas + Fluidampr","detail":"Geïnspecteerd, gemeten en gebalanceerd met viskeuze torsiedemper.","specs":"Scheurcontrole · dynamic balance · viscous damper","price":1350,"hpLimit":850,"torqueLimit":970,"rpmLimit":8400,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.74,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":2,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_crank","name":"Race-prep OEM krukas + brace","detail":"Nitreren/polijsten, dynamisch balanceren, brace en motorsportdemper.","specs":"Nitrided journals · bedplate brace","price":3200,"hpLimit":980,"torqueLimit":1100,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.88,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":3,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"billet_crank","name":"Billet krukas + race damper","detail":"Voor extreme cilinderdruk en toerental. Alleen logisch als de rest van de motor hetzelfde niveau heeft.","specs":"Billet steel · heavy-duty damper","price":7900,"hpLimit":1500,"torqueLimit":1550,"rpmLimit":9800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.99,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":8,"massDeltaKg":5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_crank","name":"Promod billet krukas + tuned damper","detail":"Billet krukas, heavy-duty damper en volledig gematchte roterende groep voor zeer hoge BMEP en toerental.","specs":"Billet steel · tuned damper · matched bobweight","price":13900,"hpLimit":2350,"torqueLimit":2300,"rpmLimit":10600,"harmonicControl":1.04,"reliabilityBonus":11,"massDeltaKg":6}]},{"id":"oiling","label":"Oliehuishouding","short":"Olie","items":[{"id":"wet_sump","name":"OEM nat carter","detail":"Standaard carter en pickup. Harde launches, remmen en lang hoog toerental kunnen drukschommelingen geven.","specs":"OEM pomp · standaard pickup · ±4,6 L","price":0,"hpLimit":650,"torqueLimit":900,"rpmLimit":7600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.3,"oilCooling":0.15,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"baffled","name":"Baffled sump + oliekoeler","detail":"Schotten, verbeterde pickup en thermostatische oliekoeler voor herhaalbare straat- en dragruns.","specs":"Baffled pan · 19-row cooler · thermostat","price":950,"hpLimit":850,"torqueLimit":1020,"rpmLimit":8300,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.73,"oilCooling":0.63,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"accusump","name":"Accusump + grote oliekoeler","detail":"Drukbuffer tijdens launch en shifts, plus veel meer thermische reserve.","specs":"3 qt accumulator · 25-row cooler","price":2250,"hpLimit":1030,"torqueLimit":1160,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.89,"oilCooling":0.81,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dry_sump","name":"Dry-sump race systeem","detail":"Externe pomp, tank en scavenging. Maximale drukcontrole bij extreme acceleratie.","specs":"4-stage pump · remote tank · crank vacuum","price":6800,"hpLimit":1600,"torqueLimit":1700,"rpmLimit":10000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.995,"oilCooling":0.95,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":10,"massDeltaKg":10,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_drysump","name":"5-stage Promod dry-sump","detail":"Grote scavengecapaciteit, geregelde carterdruk en externe olievoorraad voor herhaalde dragpulls.","specs":"5-stage pump · vacuum regulation · 12 L tank","price":12800,"hpLimit":2450,"torqueLimit":2450,"rpmLimit":10800,"oilControl":1.1,"oilCooling":1.35,"reliabilityBonus":12,"massDeltaKg":15}]},{"id":"crankcase","label":"Carterventilatie & vacuüm","short":"PCV","items":[{"id":"oem_pcv","name":"OEM PCV-systeem","detail":"Gesloten OEM carterventilatie. Goed voor standaard gebruik; bij hoge boost kan oliedamp de inlaat en knockmarge beïnvloeden.","specs":"OEM membraan · retour naar inlaat","price":0,"crankcaseControl":0.58,"oilVaporPenalty":0.055,"vacuumKpa":0,"reliabilityBonus":0},{"id":"catch_can","name":"Gesloten catch-can systeem","detail":"Afscheiding van olie/nevel met retour naar de inlaat. Geschikt voor straatgebruik wanneer slangen en terugslagkleppen correct zijn uitgevoerd.","specs":"Baffled can · check valves · gesloten circuit","price":480,"crankcaseControl":0.82,"oilVaporPenalty":0.025,"vacuumKpa":0,"reliabilityBonus":2},{"id":"vented_can","name":"Race catch-can / atmosferisch","detail":"Grote ontluchting voor racegebruik. Minder oliedamp in de inlaat, maar niet emissie- of straatgericht.","specs":"-10AN/-12AN ontluchting · drain","price":780,"crankcaseControl":0.92,"oilVaporPenalty":0.012,"vacuumKpa":0,"reliabilityBonus":3},{"id":"vacuum_pump","name":"Externe vacuümpomp","detail":"Geregeld cartervacuüm vermindert windage en helpt ringseal. Vereist drukregeling en betrouwbare olieafscheiding.","specs":"Externe pomp · regulator · catch tank","price":2450,"crankcaseControl":1.02,"oilVaporPenalty":0.004,"vacuumKpa":-10,"powerMultiplier":1.012,"reliabilityBonus":5,"massDeltaKg":3}]},{"id":"head","label":"Kop & nokkenassen","short":"Kop","items":[{"id":"oem_head","name":"OEM kop & nokkenassen","detail":"Sterk onderin en middengebied; boven circa 6500 rpm neemt de massaflow af.","specs":"OEM lift/duur · variabele inlaatnok","price":0,"hpLimit":850,"torqueLimit":1100,"rpmLimit":7300,"powerMultiplier":1,"lowRpmMultiplier":1.03,"highRpmMultiplier":0.91,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_catcams","name":"Randy Cat Cams / Bar-Tek kop","detail":"Custom Cat Cams met inlaat-VVT en de opgegeven overlap-TDC meetwaarden. Verkeerde mechanische timing kost flow en verhoogt het knockrisico.","specs":"Uitlaat 0,85 mm @ overlap-TDC · inlaat 0,25 mm @ overlap-TDC","price":3750,"hpLimit":1120,"torqueLimit":1320,"rpmLimit":8700,"powerMultiplier":1.075,"lowRpmMultiplier":0.95,"highRpmMultiplier":1.19,"headFlow":1.1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":0.85,"targetIntakeTdcMm":0.25,"visualKey":"randy"},{"id":"mild_cams","name":"Milde 260° cams","detail":"Meer gebied onder de curve zonder alle lage-toerenrespons op te offeren.","specs":"±260° · straatlift · VVT behouden","price":1450,"hpLimit":930,"torqueLimit":1170,"rpmLimit":7900,"powerMultiplier":1.035,"lowRpmMultiplier":0.99,"highRpmMultiplier":1.08,"headFlow":1.04,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"high_lift","name":"11,75/11,00 mm high-lift cams","detail":"Lange duur en hoge lift. Minder onderin, veel sterker bovenin wanneer turbo en kop kunnen volgen.","specs":"High lift · lange duur · instelbare timing","price":2350,"hpLimit":1080,"torqueLimit":1250,"rpmLimit":8500,"powerMultiplier":1.08,"lowRpmMultiplier":0.9,"highRpmMultiplier":1.2,"headFlow":1.1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"ported_head","name":"CNC ported race head","detail":"Grote poorten, zetelwerk, aangepaste kamers en high-lift cams voor maximale massaflow.","specs":"CNC ports · oversize valves · race cams","price":6900,"hpLimit":1320,"torqueLimit":1450,"rpmLimit":9300,"powerMultiplier":1.15,"lowRpmMultiplier":0.85,"highRpmMultiplier":1.3,"headFlow":1.21,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_head","name":"Promod billet-port cylinder head","detail":"Zwaar geporte kop met grote zittingen, korte runners en race-spec nokken voor top-end flow boven 9000 rpm.","specs":"Billet-port · oversized seats · drag cams","price":18600,"hpLimit":2300,"torqueLimit":2300,"rpmLimit":10600,"powerMultiplier":1.2,"lowRpmMultiplier":0.74,"highRpmMultiplier":1.36,"headFlow":1.29,"reliabilityBonus":6,"visualKey":"promod"}]},{"id":"valvetrain","label":"Kleppentrein","short":"Kleppen","items":[{"id":"oem_valves","name":"OEM kleppentrein","detail":"OEM veren, kleppen en retainers. Valve-float wordt waarschijnlijk bij agressief hoog toerental.","specs":"Hydraulisch · OEM veren","price":0,"hpLimit":850,"torqueLimit":1250,"rpmLimit":7050,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_ferrea","name":"Ferrea / Bar-Tek high-boost kleppentrein","detail":"Ferrea kleppen en veren met retainers en keepers uit de high-boost kopset. Geometrie en installed height blijven bepalend.","specs":"Ferrea valves · high-boost springs · retainers/keepers","price":3150,"hpLimit":1280,"torqueLimit":1520,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":7,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"springs","name":"Versterkte veren & retainers","detail":"Meer seat/open pressure met lichte retainers en gecontroleerde installed height.","specs":"Dual springs · lightweight retainers","price":950,"hpLimit":980,"torqueLimit":1350,"rpmLimit":7900,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_valves","name":"Race valves + veren","detail":"Versterkte kleppen, veren en retainers voor serieuze high-lift/high-rpm bouw.","specs":"Inconel exhaust · stainless intake","price":2650,"hpLimit":1230,"torqueLimit":1500,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"solid_lifter","name":"Solid-lifter race setup","detail":"Voor extreem toerental. Vereist periodieke lash-controle en is geen rustige straatoplossing.","specs":"Solid buckets · shimmed lash","price":5500,"hpLimit":1550,"torqueLimit":1650,"rpmLimit":10000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_valvetrain","name":"Promod solid valvetrain","detail":"Solid buckets, DLC followers, titanium retainers en raceveren met zeer korte inspectie-intervallen.","specs":"Solid bucket · DLC · Ti retainers · 10.7k rpm","price":11800,"hpLimit":2350,"torqueLimit":2350,"rpmLimit":10700,"reliabilityBonus":7}]},{"id":"turbo","label":"Turbo & spruitstuk","short":"Turbo","items":[{"id":"k03","name":"OEM K03/IHI-frame","detail":"Zeer snelle spool. Buiten zijn efficiënte gebied maakt extra boost vooral hitte en turbospeed.","specs":"Compressor 41 mm · OEM manifold","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":250,"turboSpoolRpm":1650,"turboEfficiency":0.84,"turboMaxBoost":1.15,"compressorMm":41,"turbineMm":45,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"k04","name":"K04-064","detail":"Snelle straatupgrade met directe respons en beperkte top-end.","specs":"Compressor 46 mm · twin-scroll OEM-frame","price":2250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":395,"turboSpoolRpm":2450,"turboEfficiency":0.88,"turboMaxBoost":1.85,"compressorMm":46,"turbineMm":50,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0.5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"k04_hybrid","name":"Randy K04-064 hybrid 500","detail":"De compacte 2,5-bar K04-hybrid uit de bekende build. Sterk middengebied, maar turbine-backpressure en turbospeed blijven de echte grens.","specs":"±52 mm compressor · compact K04-frame · 2,5 bar rating","price":3450,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":520,"turboSpoolRpm":3000,"turboEfficiency":0.86,"turboMaxBoost":2.5,"compressorMm":52,"turbineMm":52,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":1,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy-k04"},{"id":"g25","name":"G25-660 twin-scroll","detail":"Modern compact frame voor een breed bereik en goede transient response.","specs":"54 mm inducer · ball-bearing · twin-scroll","price":4950,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":680,"turboSpoolRpm":3500,"turboEfficiency":0.925,"turboMaxBoost":2.8,"compressorMm":54,"turbineMm":54,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":2,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt5558","name":"Precision Gen2 PT5558","detail":"Kleinste Precision Gen2 CEA ball-bearing: vroege spool, prima straat-top-end op 2.0 liter.","specs":"55 mm inducer · 58 mm turbine · 650 pk rating · kaart gemodelleerd","price":1770,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":650,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":55,"turbineMm":58,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":4,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"g30","name":"G30-770 twin-scroll","detail":"Meer top-end dan G25, nog bruikbaar op een goed gebouwde 2.0-liter.","specs":"58 mm inducer · 0.83 A/R","price":5250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":790,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":58,"turbineMm":60,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":3,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt5862","name":"Precision Gen2 PT5862","detail":"Iets grotere 58-mm Gen2: meer top-end dan de 5558 met nog steeds goede spool.","specs":"58 mm inducer · 62 mm turbine · 700 pk rating · kaart gemodelleerd","price":1770,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":700,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":58,"turbineMm":62,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":4,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt6062","name":"Precision Gen2 PT6062","detail":"Gen2 CEA met echte Precision compressorkaart (CM-60). Sterke allround keuze boven 600 pk.","specs":"60.4 mm inducer · 62 mm turbine · 750 pk rating · Precision kaart CM-60","price":1780,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":750,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":60,"turbineMm":62,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt6466","name":"Precision Gen2 PT6466","detail":"Gen2 CEA 6466 met echte Precision kaart (CM-64). Ruim 800 pk airflow, later in de toeren vol.","specs":"64.4 mm inducer · 66 mm turbine · 900 pk rating · Precision kaart CM-64","price":2070,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":900,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":64,"turbineMm":66,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":6,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hx52","name":"Randy HX52 67-mm twin-scroll","detail":"De grote HX52-combinatie met 67-mm inducer, 11-cm² twin-scroll huis en twee wastegates. Op circa 2,0 liter komt het bruikbare gebied duidelijk later.","specs":"67 mm inducer · 11 cm² twin-scroll · dual wastegate","price":3900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":900,"turboSpoolRpm":4650,"turboEfficiency":0.885,"turboMaxBoost":3.15,"compressorMm":67,"turbineMm":70,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":9,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy-hx52"},{"id":"pt6870","name":"Precision Gen2 PT6870","detail":"Gen2 CEA 6870 met echte Precision kaart (CM-68). Drag/high-rpm op 2.0 liter.","specs":"68.02 mm inducer · 70 mm turbine · 1100 pk rating · Precision kaart CM-68","price":2380,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1100,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":68,"turbineMm":70,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":7,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt7675","name":"Precision 7675 CEA","detail":"7675 CEA met echte Precision kaart (CM-76). Grote drag-turbo; op 2.0 liter alleen met veel toeren en spool-hulp.","specs":"76.5 mm inducer · 75 mm turbine · 1250 pk rating · Precision kaart CM-76","price":3080,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1250,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":76,"turbineMm":75,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":9,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt8085","name":"Precision Next Gen Sportsman 8085","detail":"Next Gen Sportsman 8085. Geen publieke kaart: afgeleid van CM-76. Extreem op 2.0 liter.","specs":"80 mm inducer · 85 mm turbine · 1600 pk rating · kaart gemodelleerd","price":4700,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1600,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":80,"turbineMm":85,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":11,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt8685","name":"Precision Next Gen Sportsman 8685","detail":"Next Gen Sportsman 8685. Geen publieke kaart: afgeleid van CM-76.","specs":"86 mm inducer · 85 mm turbine · 1800 pk rating · kaart gemodelleerd","price":4970,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1800,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":86,"turbineMm":85,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":12,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt9103","name":"Precision Gen2 PT9103 Pro Mod","detail":"Gen2 Pro Mod 9103. Geen publieke kaart: afgeleid van CM-76. Pro Mod-klasse.","specs":"91 mm inducer · 103 mm turbine · 1725 pk rating · kaart gemodelleerd","price":4240,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":1725,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":91,"turbineMm":103,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":15,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt9803","name":"Precision Gen2 PT9803 Pro Mod","detail":"Gen2 Pro Mod 9803. Geen publieke kaart: afgeleid van CM-76.","specs":"98 mm inducer · 103 mm turbine · 2100 pk rating · kaart gemodelleerd","price":4350,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":2100,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":98,"turbineMm":103,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":16,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"pt10603","name":"Precision Gen2 PT10603 Pro Mod","detail":"Gen2 Pro Mod 10603, grootste Precision in deze selectie. Geen publieke kaart: afgeleid van CM-76.","specs":"106 mm inducer · 103 mm turbine · 2500 pk rating · kaart gemodelleerd","price":6390,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":2500,"turboSpoolRpm":3950,"turboEfficiency":0.93,"turboMaxBoost":3,"compressorMm":106,"turbineMm":103,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":17,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""}]},{"id":"boostControl","label":"Wastegate & boostregeling","short":"WG","items":[{"id":"oem_internal","name":"OEM interne wastegate","detail":"Snelle respons en compacte montage. Regelautoriteit wordt beperkt bij hoge flow en lage gewenste boost.","specs":"Interne klep · OEM actuator","price":0,"boostControlQuality":0.66,"boostHardwareMaxBar":1.55,"wastegateFlow":0.72},{"id":"uprated_internal","name":"Versterkte interne wastegate","detail":"Zwaardere actuator en betere klepgeometrie voor een K04/hybrid-setup.","specs":"Uprated actuator · ported flap","price":520,"boostControlQuality":0.82,"boostHardwareMaxBar":2.35,"wastegateFlow":0.86,"reliabilityBonus":1},{"id":"single_44","name":"Enkele 44-mm externe wastegate","detail":"Meer bypass-flow en stabielere regeling op een degelijk gescheiden spruitstuk.","specs":"44 mm · boost solenoid · dump/recirc","price":920,"boostControlQuality":0.92,"boostHardwareMaxBar":3.25,"wastegateFlow":1.0,"reliabilityBonus":2},{"id":"dual_44","name":"Dubbele 44-mm wastegates","detail":"Twin-scroll regeling met één wastegate per scroll. Past bij de bekende HX52-opzet met twee gates.","specs":"2×44 mm · twin-scroll · 4-port control","price":1780,"boostControlQuality":0.975,"boostHardwareMaxBar":4.25,"wastegateFlow":1.17,"reliabilityBonus":4,"visualKey":"randy"},{"id":"co2_dome","name":"CO₂ dome pressure control","detail":"Zeer hoge regelautoriteit en herhaalbaarheid voor draggebruik. Foutieve strategie kan juist extreme overboost geven.","specs":"Dome pressure · dual gate · closed-loop","price":3650,"boostControlQuality":0.995,"boostHardwareMaxBar":5.5,"wastegateFlow":1.24,"reliabilityBonus":4,"massDeltaKg":5},{"id":"dual_60_co2","name":"Dubbele 60-mm CO₂ wastegates","detail":"Twee grote wastegates en dome pressure control voor zeer hoge turbineflow en stabiele boost ramps.","specs":"2×60 mm · dome CO₂ · shaft-speed limit","price":6900,"boostControlQuality":0.998,"boostHardwareMaxBar":6.2,"wastegateFlow":1.45,"reliabilityBonus":6,"massDeltaKg":7}]},{"id":"air","label":"Inlaat & koeling","short":"Koeling","items":[{"id":"oem_air","name":"OEM airbox & intercooler","detail":"Stil, maar snel heat-soaked bij herhaalde pulls.","specs":"OEM core · OEM throttle · gesloten airbox","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.28,"flow":0.96,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fmic","name":"High-flow inlaat + FMIC","detail":"Lagere drukval en voldoende koeling voor een sterke straatsetup.","specs":"76 mm intake · grote bar-and-plate FMIC","price":1150,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.62,"flow":1.035,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"wmi","name":"Grote FMIC + WMI","detail":"Grote intercooler en water/meth met echte flow-/drukfailsafe.","specs":"1000 cc/min WMI · failsafe · large FMIC","price":2100,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.82,"flow":1.075,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"ice_tank","name":"Drag ice tank + race plenum","detail":"Maximale korte-run koeling, grote plenum/throttle en minimale restrictie.","specs":"Water-to-air · ice tank · 90 mm throttle","price":4600,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0.93,"flow":1.13,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":12,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_ice_system","name":"Promod ice-water charge system","detail":"Grote water/ijs-tank, high-flow core en gecontroleerde pompflow voor een korte, reproduceerbare dragpass.","specs":"30 L ice tank · dual pump · race core","price":8900,"cooling":0.985,"flow":1.21,"reliabilityBonus":4,"massDeltaKg":23}]},{"id":"manifold","label":"Inlaatspruitstuk & gasklep","short":"Inlaat","items":[{"id":"oem_manifold","name":"OEM inlaatspruitstuk","detail":"Lange runners en goede lage-toerenrespons. De plenum- en gasklepflow worden beperkend op extreme top-end.","specs":"OEM kunststof runners · OEM gasklep","price":0,"intakeFlow":1.0,"lowRpmMultiplier":1.025,"highRpmMultiplier":0.965,"throttleMm":68,"plenumL":2.4},{"id":"ported_oem","name":"Geport OEM spruitstuk + 76 mm","detail":"Behoudt runnerlengte en respons, met minder lokale restrictie.","specs":"Geport runners · 76-mm gasklep","price":780,"intakeFlow":1.045,"lowRpmMultiplier":1.015,"highRpmMultiplier":1.025,"throttleMm":76,"plenumL":2.6,"reliabilityBonus":1},{"id":"cast_plenum","name":"Cast race plenum + 80 mm","detail":"Groter plenum en kortere runners voor hogere massaflow. Iets minder respons onderin.","specs":"Cast aluminium · 80-mm gasklep","price":1650,"intakeFlow":1.085,"lowRpmMultiplier":0.98,"highRpmMultiplier":1.075,"throttleMm":80,"plenumL":3.4},{"id":"billet_plenum","name":"Billet plenum + 90 mm","detail":"Gelijke runnerverdeling, grote gasklep en MAP/IAT-poorten voor hoog vermogen.","specs":"Billet plenum · bellmouth runners · 90 mm","price":3250,"intakeFlow":1.125,"lowRpmMultiplier":0.94,"highRpmMultiplier":1.12,"throttleMm":90,"plenumL":4.2,"reliabilityBonus":2},{"id":"sheetmetal_105","name":"Drag sheet-metal plenum + 105 mm","detail":"Zeer groot plenum en korte runners. Bedoeld voor hoog toerental en enorme compressorflow.","specs":"Sheet metal · 105-mm throttle · burst panel","price":5450,"intakeFlow":1.17,"lowRpmMultiplier":0.86,"highRpmMultiplier":1.17,"throttleMm":105,"plenumL":5.4,"reliabilityBonus":1},{"id":"billet_120","name":"Billet drag plenum + 120 mm","detail":"Groot plenum, korte gelijke runners, burst panel en 120-mm gasklep voor extreme top-end massaflow.","specs":"Billet runners · 120-mm throttle · burst panel","price":8900,"intakeFlow":1.25,"lowRpmMultiplier":0.74,"highRpmMultiplier":1.25,"throttleMm":120,"plenumL":6.6,"reliabilityBonus":2}]},{"id":"fuelSystem","label":"Brandstofsysteem","short":"Brandstof","items":[{"id":"oem_fuel","name":"OEM DI-systeem","detail":"OEM HPFP en injectoren. Duty en raildruk worden snel de grens.","specs":"OEM HPFP · OEM DI · 150 bar","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":255,"maxRailBar":150,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hpfp","name":"HPFP internals","detail":"Meer pompvolume, maar OEM-injectoren blijven de volgende beperking.","specs":"Vergrote plunjer · OEM injectoren","price":780,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":345,"maxRailBar":170,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_nostrum_rsx","name":"Nostrum HPFP + Bar-Tek RSX injectoren","detail":"De bekende DI-combinatie uit de build. Correcte injector-karakterisatie en CAWB-HPFP-aansturing zijn essentieel; 100% duty is geen normale regelstrategie.","specs":"Nostrum HPFP ±650 pk · RSX/Bar-Tek DI · gekarakteriseerd","price":3650,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":650,"maxRailBar":195,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"nostrum","name":"Grote HPFP + HDEV5 injectoren","detail":"Grote DI-capaciteit met correcte aansturing en karakterisatie.","specs":"High-flow HPFP · calibrated DI","price":3250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":575,"maxRailBar":190,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"di_mpi","name":"DI + MPI staged","detail":"Direct injection plus poortinjectie voor meer flow en betere verdeling.","specs":"DI + 4× MPI · flex-fuel compatible","price":4900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":900,"maxRailBar":195,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_fuel","name":"Race DI + dubbel MPI","detail":"Surge tank, dubbele rails, grote pompen en motorsportdrukregeling.","specs":"Dual brushless pumps · DI + 8× MPI","price":8800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":1280,"maxRailBar":215,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":9,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"methanol_fuel","name":"Mechanische methanol-injectie","detail":"Drag-only systeem met enorme volumeflow. Vereist volledig aangepaste start- en warmupstrategie.","specs":"Mechanical pump · 16 injectors · return system","price":14500,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":3500,"maxRailBar":230,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":14,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_methanol_fuel","name":"Promod staged methanol system","detail":"Meervoudige mechanische injectoren met staged nozzles en onafhankelijke brandstofdrukbewaking.","specs":"16 injectors · belt pump · staged control","price":24900,"fuelSystemHp":5200,"maxRailBar":250,"reliabilityBonus":7,"massDeltaKg":19}]},{"id":"fuel","label":"Brandstof","short":"Fuel","items":[{"id":"ron95","name":"Euro 95","detail":"Lage knockmarge bij hoge cilinderdruk.","specs":"95 RON · stoich 14,7:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":95,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"ron98","name":"Euro 98","detail":"Goede basis voor een conservatieve straatkalibratie.","specs":"98 RON · stoich 14,7:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":98,"fuelCooling":0.01,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"blend_wmi","name":"98 + ethanolblend + WMI","detail":"Hoge effectieve knockmarge, mits flow/drukbewaking echt ingrijpt.","specs":"Effectief ±105 RON · WMI","price":650,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":105,"fuelCooling":0.1,"fuelFlowFactor":0.96,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"e30","name":"E30","detail":"Sterke knock- en charge-coolingmarge met minder volumeverbruik dan E85.","specs":"±103 RON · stoich ±12,7:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":103,"fuelCooling":0.06,"fuelFlowFactor":0.91,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"e85","name":"E85","detail":"Zeer goede knockmarge en koeling; vraagt veel meer volumeflow.","specs":"±109 RON · stoich ±9,8:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":109,"fuelCooling":0.12,"fuelFlowFactor":0.73,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"flex","name":"Flex-fuel + ethanolsensor","detail":"Ethanolsensor en flex-calibratie: de ECU rekent stoichiometrie, injectie en ontsteking met het gemeten ethanolgehalte. Het gehalte stel je in bij Tunen → Brandstof.","specs":"E0–E100 · continental flexsensor · blend-tabellen","price":480,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":105,"fuelCooling":0.1,"fuelFlowFactor":0.78,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_fuel_type","name":"Race ethanol / C16-equivalent","detail":"Motorsportbrandstof met grote knockmarge.","specs":"Effectief 116 RON · gecontroleerde samenstelling","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":116,"fuelCooling":0.1,"fuelFlowFactor":0.8,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":2,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"methanol","name":"M1 methanol","detail":"Enorme charge cooling en knockmarge, maar ongeveer dubbel volumeverbruik en corrosief onderhoud.","specs":"M1 · stoich 6,45:1","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0.22,"fuelFlowFactor":0.49,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""}]},{"id":"exhaust","label":"Uitlaat","short":"Uitlaat","items":[{"id":"oem_exhaust","name":"OEM katalysator & uitlaat","detail":"Hoge backpressure bij grote massaflow.","specs":"OEM cat · OEM diameter","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":0.91,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"catted_3","name":"3-inch high-flow catted","detail":"Straatgerichte downpipe en uitlaat met lagere tegendruk.","specs":"76 mm · high-flow catalyst","price":1450,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.025,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"race_3","name":"3-inch race exhaust","detail":"Minimale restrictie voor circuit/dragconfiguratie.","specs":"76 mm · straight-through","price":1850,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.075,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"side_35","name":"3,5-inch side exit","detail":"Maximale turbine-uitlaatflow voor grote turbo en korte runs.","specs":"89 mm · side/hood exit","price":2400,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.13,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":-8,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hood_4","name":"4-inch hood exit","detail":"Drag-only. Extreem lage tegendruk, zeer luid en niet straatgericht.","specs":"102 mm · short hood exit","price":3200,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1.18,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":-12,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""}]},{"id":"ecu","label":"ECU & beveiliging","short":"ECU","items":[{"id":"med17","name":"OEM MED17","detail":"OEM knock-, lambda- en railregeling; beperkte flexibiliteit voor grote hardwarewijzigingen.","specs":"Torque model · OEM safeties","price":0,"hpLimit":700,"torqueLimit":900,"rpmLimit":7000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.52,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"custom_med17","name":"Custom MED17","detail":"Boost, load, torque model en brandstof aangepast met basisbeveiligingen behouden.","specs":"Custom calibration · datalogging","price":850,"hpLimit":870,"torqueLimit":1070,"rpmLimit":7700,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.69,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_syvecs","name":"Syvecs SGDI-TSI-DF PnP","detail":"De gekozen standalone voor de CAWB: DI-regeling, speed-density, individuele knockstrategie, logging en flexibele beveiligingen.","specs":"SGDI-TSI-DF · PnP · CAN · motorsport logging","price":5200,"hpLimit":1320,"torqueLimit":1460,"rpmLimit":9200,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.94,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"syvecs","name":"Syvecs SGDI basis","detail":"Speed-density, DI-aansturing, flex-fuel, logging en flexibele strategieën.","specs":"Standalone · SGDI · CAN","price":4500,"hpLimit":1180,"torqueLimit":1320,"rpmLimit":8800,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.85,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"syvecs_full","name":"Syvecs full safeties","detail":"Knock per cilinder, raildrukcut, lambda/EGT, meth-failsafe, oliedruk en boost-by-gear.","specs":"Motorsport sensors · full failsafes","price":5800,"hpLimit":1450,"torqueLimit":1550,"rpmLimit":9600,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.985,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":8,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_ecu","name":"Promod motorsport ECU + PDM","detail":"Volledige staged fuel/ignition/boost-regeling met turbospeed, individuele EGT/lambda en harde shutdowns.","specs":"Dual ECU/PDM · cylinder trim · 2 kHz logging","price":14900,"hpLimit":2400,"torqueLimit":2400,"rpmLimit":10800,"safetyQuality":0.998,"reliabilityBonus":11}]},{"id":"sensors","label":"Sensoren & datalogging","short":"Sensors","items":[{"id":"oem_sensors","name":"OEM sensoren","detail":"OEM MAP, lambda, knock en druksignalen. Voldoende voor standaard en milde builds, minder dekking voor extreme hardware.","specs":"OEM MAP · wideband · knock · rail","price":0,"sensorQuality":0.64,"diagnosticConfidence":0.6,"measurementNoise":0.03},{"id":"street_sensor_pack","name":"Uitgebreid street sensorpakket","detail":"Extra 4-bar MAP, brandstofdruk, oliedruk en olietemperatuur.","specs":"4-bar MAP · fuel/oil pressure · oil temp","price":680,"sensorQuality":0.8,"diagnosticConfidence":0.78,"measurementNoise":0.02,"reliabilityBonus":2},{"id":"motorsport_sensors","name":"Motorsport safety sensorpakket","detail":"EGT, flex-fuel, WMI-flow, backpressure en redundante drukbewaking voor echte failsafes.","specs":"EGT · flex · WMI flow · EMP · pressure","price":1950,"sensorQuality":0.94,"diagnosticConfidence":0.93,"measurementNoise":0.01,"reliabilityBonus":5,"visualKey":"randy"},{"id":"pro_instrumentation","name":"Pro instrumentation + turbospeed","detail":"Turbospeed, vier EGT-kanalen, krukasdruk, individuele lambda en hoge-snelheidslogging.","specs":"Shaft speed · 4× EGT · crank pressure · 1 kHz log","price":4950,"sensorQuality":0.992,"diagnosticConfidence":0.99,"measurementNoise":0.004,"reliabilityBonus":7}]},{"id":"ignition","label":"Ontsteking","short":"Vonk","items":[{"id":"oem_ignition","name":"OEM bobines & bougies","detail":"Prima bij OEM boost; spark blow-out wordt waarschijnlijk bij hoge druk.","specs":"OEM coil energy · OEM heat range","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":0.96,"sparkBoostLimit":1.55,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fresh_coils","name":"High-output OEM-style coils","detail":"Nieuwe coils, koudere bougies en correcte gap.","specs":"Colder plugs · 0,55–0,65 mm gap","price":320,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":2.2,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"smart_coils","name":"Motorsport smart coils","detail":"Meer dwell- en spark-energy marge voor hoge boost.","specs":"Smart coils · ECU dwell control","price":950,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1.025,"sparkBoostLimit":3.2,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"cdi","name":"CDI extreme boost ignition","detail":"Voor zeer hoge cilinderdruk en racegebruik.","specs":"Capacitive discharge · shielded loom","price":2400,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1.045,"sparkBoostLimit":4.5,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":4,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dual_cdi","name":"Dual-channel CDI ignition","detail":"Dubbele CDI en afgeschermde loom voor methanol en zeer hoge cilinderdruk.","specs":"Dual CDI · crank-trigger · shielded harness","price":6800,"sparkQuality":1.065,"sparkBoostLimit":6.2,"reliabilityBonus":6}]},{"id":"sealing","label":"Koppakking & studs","short":"Sealing","items":[{"id":"oem_bolts","name":"OEM koppakking & bouten","detail":"OEM clamp load. Head-lift wordt reëel bij hoge BMEP of knock.","specs":"OEM MLS · stretch bolts","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":29,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fresh_mls","name":"Nieuwe MLS + OEM bouten","detail":"Vlakke oppervlakken en correcte montage geven wat extra marge.","specs":"Fresh MLS · measured flatness","price":480,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":34,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":1,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_cometic_arp","name":"Cometic MLS + ARP head studs","detail":"De afdichting uit de bekende motor. Oppervlaktefinish, vlakheid, aanhaalmethode en echte knockcontrole blijven bepalend.","specs":"Cometic MLS · ARP studs · gemeten vlakheid","price":1280,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":54,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"studs","name":"MLS + head studs","detail":"Hogere en herhaalbare klemkracht voor serieuze boost.","specs":"High-tensile studs · MLS","price":980,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":50,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"fire_ring","name":"Fire-ring/O-ring race sealing","detail":"Voor extreme cilinderdruk; blok/kopbewerking en nauwkeurige montage vereist.","specs":"Receiver grooves · fire rings","price":2900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":74,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":6,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dry_deck","name":"Dry-deck + copper/O-ring","detail":"Drag-only afdichting met externe koelwaterroute en maximale clamp load.","specs":"Dry deck · copper gasket · receiver grooves","price":5900,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":92,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":5,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"receiver_ring_extreme","name":"Receiver-ring dry-deck sealing","detail":"Dry-deck kop/blok, koperpakking en receiver rings met hoge en gelijkmatige clamp load.","specs":"Copper · receiver rings · external coolant","price":9800,"headClampBmep":124,"reliabilityBonus":9}]},{"id":"transmission","label":"Versnellingsbak","short":"Bak","items":[{"id":"oem_6mt","name":"OEM 6MT + OEM koppeling","detail":"Relatief laag verlies; koppeling en tandwielen begrenzen het koppel.","specs":"6-speed H-pattern · open/OEM diff","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":440,"shiftSeconds":0.34,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"randy_o2q","name":"Randy versterkte O2Q + Quaife","detail":"Versterkte handbak met extra beugels, Quaife ATB-sper en stijve aandrijflijnmontage. Tractie en koppelpieken blijven belangrijk.","specs":"O2Q 6MT · Quaife ATB · verstevigingen · performance clutch","price":5350,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":840,"shiftSeconds":0.245,"transEfficiency":0.915,"reliabilityBonus":5,"massDeltaKg":3,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":"randy"},{"id":"built_6mt","name":"Built 6MT + twin-disc","detail":"Versterkte bak, sper en twin-disc koppeling.","specs":"Plate LSD · dog synchros · twin-disc","price":4200,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":780,"shiftSeconds":0.24,"transEfficiency":0.91,"reliabilityBonus":3,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.08,2.05,1.5,1.17,0.94,0.78],"finalDrive":4.06,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"dq250","name":"DQ250 Stage 3","detail":"Snelle, consistente shifts. Clutch packs, koeling en koppelmanagement zijn essentieel.","specs":"Wet DCT · upgraded clutches","price":5800,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":860,"shiftSeconds":0.115,"transEfficiency":0.875,"reliabilityBonus":4,"massDeltaKg":18,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.46,2.15,1.46,1.08,0.86,0.72],"finalDrive":3.45,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"sequential","name":"6-speed sequential dogbox","detail":"Zeer snelle racebak met weinig vermogensonderbreking.","specs":"Straight-cut · dog engagement","price":12500,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":1180,"shiftSeconds":0.065,"transEfficiency":0.925,"reliabilityBonus":5,"massDeltaKg":-5,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[2.75,1.95,1.52,1.24,1.05,0.91],"finalDrive":4.1,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"liberty","name":"4-speed drag dogbox","detail":"Drag-only verhoudingen voor enorme vermogens en minder shifts.","specs":"4-speed · clutchless/dog · spool diff","price":21000,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":1700,"shiftSeconds":0.05,"transEfficiency":0.94,"reliabilityBonus":3,"massDeltaKg":4,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[2.45,1.68,1.27,1],"finalDrive":3.7,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"promod_5speed","name":"5-speed Promod drag transmission","detail":"Clutchless vijfversnellingsbak, spool/dragdiff en verhoudingen voor een smalle high-rpm powerband.","specs":"5-speed clutchless · straight-cut · spool","price":36500,"transTorque":2450,"shiftSeconds":0.038,"transEfficiency":0.945,"reliabilityBonus":5,"massDeltaKg":8,"gearRatios":[2.56,1.78,1.36,1.1,0.92],"finalDrive":3.55}]},{"id":"spool","label":"Spool assistance","short":"Spool","items":[{"id":"none","name":"Geen spool assistance","detail":"Turbo bouwt uitsluitend op uitlaatenergie op. Het meest voorspelbaar en minst belastend.","specs":"Geen anti-lag · geen nitrous","price":0,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":0,"nitrousHp":0,"spoolHeat":0,"wearFactor":0,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"mild_als","name":"Milde rolling anti-lag","detail":"Retard en extra lucht/brandstof houden de turbine op snelheid. Meer EGT en onderhoud.","specs":"Rolling ALS · EGT-limited","price":850,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":350,"nitrousHp":0,"spoolHeat":0.18,"wearFactor":0.08,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"hard_als","name":"Drag anti-lag","detail":"Agressieve ignition cut/retard. Sneller op boost, zwaar voor turbine, spruitstuk en kleppen.","specs":"Hard ALS · launch/rolling modes","price":1650,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":700,"nitrousHp":0,"spoolHeat":0.45,"wearFactor":0.22,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_50","name":"50 hp nitrous spool shot","detail":"Kleine droge/natte shot die afbouwt zodra boost binnenkomt.","specs":"50 hp · pressure switch · progressive cut","price":1250,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":550,"nitrousHp":50,"spoolHeat":0.1,"wearFactor":0.09,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_100","name":"100 hp nitrous spool shot","detail":"Duidelijk snellere spool; brandstof- en ontstekingsstrategie moeten kloppen.","specs":"100 hp · progressive controller","price":1750,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":950,"nitrousHp":100,"spoolHeat":0.18,"wearFactor":0.17,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_150","name":"150 hp nitrous spool shot","detail":"Race-only. Grote cilinderdrukpuls voordat de turbo volledig meedoet.","specs":"150 hp · staged progressive","price":2350,"hpLimit":10000,"torqueLimit":10000,"rpmLimit":20000,"powerMultiplier":1,"lowRpmMultiplier":1,"highRpmMultiplier":1,"headFlow":1,"turboMaxHp":10000,"turboSpoolRpm":0,"turboEfficiency":1,"turboMaxBoost":10,"compressorMm":0,"turbineMm":0,"cooling":0,"flow":1,"fuelSystemHp":10000,"maxRailBar":250,"octane":120,"fuelCooling":0,"fuelFlowFactor":1,"exhaustFlow":1,"oilControl":0.5,"oilCooling":0.2,"harmonicControl":0.2,"safetyQuality":0.5,"sparkQuality":1,"sparkBoostLimit":10,"headClampBmep":60,"transTorque":10000,"shiftSeconds":0.2,"transEfficiency":0.9,"reliabilityBonus":0,"massDeltaKg":0,"spoolShiftRpm":1300,"nitrousHp":150,"spoolHeat":0.26,"wearFactor":0.29,"gearRatios":[3.36,2.09,1.47,1.1,0.86,0.72],"finalDrive":3.94,"boreMm":82.5,"strokeMm":92.8,"compressionRatio":9.6,"targetExhaustTdcMm":null,"targetIntakeTdcMm":null,"visualKey":""},{"id":"n2o_250","name":"250 hp staged nitrous spool system","detail":"Meervoudig progressief spoolshot voor extreem grote turbo’s. Vereist passende brandstof-, ontstekings- en cilinderdrukmarge.","specs":"250 hp staged · boost-referenced cut · race-only","price":3850,"spoolShiftRpm":1900,"nitrousHp":250,"spoolHeat":0.38,"wearFactor":0.44}]}];
  // Stroker/destroker kits: crank + matching rods (the pistons keep their compression height). A longer stroke
  // gives displacement and low-rpm torque but raises piston speed (lower safe rpm); a shorter one revs.
  const crankCat = RAW_CATEGORIES.find(c => c.id === 'crank');
  crankCat.items.push(
    { id: 'stroker_96', name: 'Stroker kit 96 mm (2,05 L)', detail: 'Gesmede 96 mm krukas met kortere H-beam drijfstangen: meer cilinderinhoud en koppel onderin, hogere zuigersnelheid. Toerental blijft beperkt.', specs: '96 mm slag · stang 142,4 mm · gesmeed 4340', price: 4900, hpLimit: 1050, torqueLimit: 1150, rpmLimit: 7800, strokeMm: 96, harmonicControl: 0.75, massDeltaKg: 0.6, visualKey: 'race' },
    { id: 'stroker_100', name: 'Stroker kit 100 mm (2,14 L)', detail: 'Billet 100 mm krukas en korte stangen: het meeste koppel en spool, maar de zuigersnelheid beperkt het toerental duidelijk en de stangverhouding wordt ongunstiger.', specs: '100 mm slag · stang 140,4 mm · billet', price: 6900, hpLimit: 1250, torqueLimit: 1350, rpmLimit: 7300, strokeMm: 100, harmonicControl: 0.8, massDeltaKg: 0.9, visualKey: 'race' },
    { id: 'destroke_86', name: 'Destroke kit 86 mm (1,84 L)', detail: 'Korte 86 mm billet krukas en lange stangen: minder inhoud en koppel onderin, maar lage zuigersnelheid en een gunstige stangverhouding: gemaakt om hoog te toeren met veel boost.', specs: '86 mm slag · stang 147,4 mm · billet', price: 6200, hpLimit: 1400, torqueLimit: 1000, rpmLimit: 9600, strokeMm: 86, harmonicControl: 0.85, massDeltaKg: -0.4, visualKey: 'race' },
    { id: 'destroke_82', name: 'Destroke kit 82 mm (1,75 L)', detail: 'Extreem korte slag voor 10.000+ rpm: klein en lui onderin, dus alleen zinvol met een grote turbo, veel boost en een klepmechaniek dat mee kan.', specs: '82 mm slag · stang 149,4 mm · billet · race', price: 8400, hpLimit: 1600, torqueLimit: 950, rpmLimit: 10400, strokeMm: 82, harmonicControl: 0.9, massDeltaKg: -0.7, visualKey: 'race' }
  );
  // A head welded to the block: no gasket, so no head lift at any cylinder pressure, but the engine can no
  // longer be split: a rebuild means machining the whole assembly, and the weld itself is a heat risk.
  RAW_CATEGORIES.find(c => c.id === 'sealing').items.push(
    { id: 'welded_head', name: 'Kop aan blok gelast (one-piece)', detail: 'Kop en blok zijn aan elkaar gelast: er is geen pakking meer die kan lichten, dus geen head-lift bij extreme boost. Nadelen: niet meer demonteerbaar (revisie kost fors meer) en lasspanning geeft iets minder koelmarge.', specs: 'Gelaste naad · geen pakking · niet demonteerbaar · drag only', price: 3400, headClampBmep: 999, reliabilityBonus: -2, cooling: -0.03, rebuildExtra: 6500, visualKey: 'race' }
  );
  // Compound boost: a small high-pressure turbo in series ahead of the main turbo (Turbo.matchCompound).
  // Driver-activated nitrous (the N2O button in the race), separate from the automatic spool shot in 'spool'.
  RAW_CATEGORIES.push({ id: 'nitrous', label: 'Lachgas (race-knop)', short: 'N2O', items: [
    { id: 'no_n2o', name: 'Geen lachgas', detail: 'Geen N2O-systeem.', specs: '—', price: 0, shotHp: 0, n2oType: 'none', progressiveS: 0, bottleKg: 0, visualKey: 'oem' },
    { id: 'dry_75', name: 'Dry kit 75 pk (1 nozzle)', detail: 'Alleen lachgas in de inlaat; de ECU spuit de extra brandstof via de injectoren. Goedkoop, maar het brandstofsysteem moet de extra vraag aankunnen, anders loopt de motor arm.', specs: 'Dry nozzle · ECU-verrijking · 4,5 kg fles', price: 900, shotHp: 75, n2oType: 'dry', progressiveS: 0, bottleKg: 4.5, visualKey: 'race' },
    { id: 'wet_100', name: 'Wet plate 100 pk', detail: 'Plaat tussen spruitstuk en kop met eigen brandstofsolenoid: N2O én brandstof samen, onafhankelijk van de injectoren.', specs: 'Wet plate · eigen brandstofpomp · 4,5 kg fles', price: 1650, shotHp: 100, n2oType: 'wet', progressiveS: 0, bottleKg: 4.5, visualKey: 'race' },
    { id: 'wet_150_prog', name: 'Wet 150 pk progressive', detail: 'Wet systeem met progressive controller: de shot loopt in 1,2 s op, zodat de banden het houden en de klap op de aandrijflijn kleiner is.', specs: 'Wet · progressive 1,2 s · 6,8 kg fles', price: 2600, shotHp: 150, n2oType: 'wet', progressiveS: 1.2, bottleKg: 6.8, visualKey: 'race' },
    { id: 'port_250', name: 'Direct port 250 pk (4 nozzles)', detail: 'Een nozzle per cilinder met eigen brandstof: gelijke verdeling, grote shots. Progressive over 1,5 s. Vraagt om gesmede internals en een sterke kop-afdichting.', specs: 'Direct port 4x · progressive 1,5 s · 6,8 kg fles', price: 4800, shotHp: 250, n2oType: 'port', progressiveS: 1.5, bottleKg: 6.8, visualKey: 'race' },
    { id: 'port_400', name: 'Direct port 400 pk race', detail: 'Twee-traps direct port: brute shot, alleen voor volledig gesmede motoren met veel ontstekingsmarge en een verstevigde aandrijflijn.', specs: 'Direct port 2-stage · progressive 2 s · 2x 6,8 kg', price: 7900, shotHp: 400, n2oType: 'port', progressiveS: 2, bottleKg: 13.6, visualKey: 'race' }
  ] });
  // Engine/gearbox mounts and bushings: how stiff and how well damped the engine/gearbox sits against its
  // roll under drive torque (for a transverse engine that roll winds the drive shafts). They decide whether a
  // hard launch settles or breaks into wheel hop (sim.js HOP). nvhWear: extra wear from the vibration a hard
  // mount passes into the car. Modeled values.
  RAW_CATEGORIES.push({ id: 'mounts', label: 'Motorsteunen & bussen', short: 'Steunen', items: [
    { id: 'oem_mounts', name: 'OEM hydrosteunen + rubber pendelsteun', detail: 'Comfortabel en stil, maar de motor rolt ver weg onder koppel: bij een harde launch op grip kunnen de wielen gaan stuiteren (wheel hop).', specs: 'Hydro motorsteun · rubber pendelsteun · OEM subframebussen', price: 0, hopStiffness: 1, hopDamping: 1, nvhWear: 0, visualKey: 'oem' },
    { id: 'dogbone_insert', name: 'Pendelsteun-insert (dogbone) poly', detail: 'Vult de rubber pendelsteun op: de motor rolt minder weg en de eerste stuiter wordt gedempt. Goedkoop, iets meer trilling stationair.', specs: 'Polyurethaan 80A insert · OEM motor- en baksteunen', price: 120, hopStiffness: 1.8, hopDamping: 2.4, nvhWear: 0.02, visualKey: 'oem' },
    { id: 'poly_mounts', name: 'Poly motor/bak-steunen + subframebussen', detail: 'Motor-, bak- en pendelsteun in poly en stijvere subframe- en draagarmbussen: de aandrijflijn blijft op zijn plek, wheel hop dooft uit.', specs: 'Poly 80A/90A · subframe + draagarmbussen · pendelsteun 90A', price: 520, hopStiffness: 2.8, hopDamping: 4.2, nvhWear: 0.05, visualKey: 'oem' },
    { id: 'solid_race', name: 'Massieve race-steunen + gelaste subframemounts', detail: 'Geen rubber meer: de motor staat vast en hop krijgt geen kans, maar elke trilling gaat de carrosserie en de bak in.', specs: 'Aluminium/massief · solid subframe · race-only', price: 1180, hopStiffness: 5, hopDamping: 7, nvhWear: 0.12, visualKey: 'oem' }
  ] });
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
  const PRESETS = {"stock":{"name":"OEM CAWB 200","selections":{"block":"oem_block","crank":"oem_crank","oiling":"wet_sump","head":"oem_head","valvetrain":"oem_valves","turbo":"k03","air":"oem_air","fuelSystem":"oem_fuel","fuel":"ron98","exhaust":"oem_exhaust","ecu":"med17","ignition":"oem_ignition","sealing":"oem_bolts","transmission":"oem_6mt","spool":"none","crankcase":"oem_pcv","boostControl":"oem_internal","manifold":"oem_manifold","sensors":"oem_sensors"},"tune":{"boostLowBar":1.0,"boostMidBar":1.0,"boostHighBar":0.74,"lambda":0.82,"ignitionTrimDeg":0,"revLimitRpm":6500,"railTargetBar":150,"intakeCamAdvanceDeg":18,"launchRpm":3000,"firstGearBoostPct":76,"secondGearBoostPct":90}},"k04":{"name":"K04 straat","selections":{"block":"rods","crank":"fluidampr","oiling":"baffled","head":"mild_cams","valvetrain":"springs","turbo":"k04","air":"fmic","fuelSystem":"nostrum","fuel":"ron98","exhaust":"catted_3","ecu":"custom_med17","ignition":"fresh_coils","sealing":"studs","transmission":"built_6mt","spool":"none","crankcase":"catch_can","boostControl":"uprated_internal","manifold":"ported_oem","sensors":"street_sensor_pack"},"tune":{"boostLowBar":1.15,"boostMidBar":1.7,"boostHighBar":1.25,"lambda":0.8,"ignitionTrimDeg":-0.5,"revLimitRpm":7200,"railTargetBar":170,"intakeCamAdvanceDeg":12,"launchRpm":3800,"firstGearBoostPct":62,"secondGearBoostPct":82}},"randy":{"name":"Randy CAWB JE83 K04","selections":{"block":"randy_je83","crank":"randy_balanced_crank","oiling":"baffled","head":"randy_catcams","valvetrain":"randy_ferrea","turbo":"k04_hybrid","air":"wmi","fuelSystem":"randy_nostrum_rsx","fuel":"blend_wmi","exhaust":"race_3","ecu":"randy_syvecs","ignition":"fresh_coils","sealing":"randy_cometic_arp","transmission":"randy_o2q","spool":"none","crankcase":"catch_can","boostControl":"uprated_internal","manifold":"ported_oem","sensors":"motorsport_sensors"},"tune":{"boostLowBar":0.95,"boostMidBar":1.88,"boostHighBar":1.72,"lambda":0.79,"ignitionTrimDeg":-0.5,"revLimitRpm":8000,"railTargetBar":175,"intakeCamAdvanceDeg":8,"exhaustTdcLiftMm":0.85,"intakeTdcLiftMm":0.25,"vvtEnabled":true,"launchRpm":4200,"firstGearBoostPct":55,"secondGearBoostPct":78,"knockControl":true,"railPressureCut":true,"lambdaProtection":true,"methFailsafe":true,"oilPressureProtection":true,"overboostCut":true}},"hx52":{"name":"HX52 high-rpm","selections":{"block":"randy_je83","crank":"randy_balanced_crank","oiling":"baffled","head":"randy_catcams","valvetrain":"randy_ferrea","turbo":"hx52","air":"wmi","fuelSystem":"race_fuel","fuel":"e85","exhaust":"side_35","ecu":"randy_syvecs","ignition":"fresh_coils","sealing":"fire_ring","transmission":"sequential","spool":"mild_als","crankcase":"vented_can","boostControl":"dual_44","manifold":"cast_plenum","sensors":"motorsport_sensors"},"tune":{"boostLowBar":0.3,"boostMidBar":1.1,"boostHighBar":2.2,"lambda":0.78,"ignitionTrimDeg":-1,"revLimitRpm":8400,"railTargetBar":185,"intakeCamAdvanceDeg":4,"launchRpm":5000,"firstGearBoostPct":48,"secondGearBoostPct":72}},"pro98":{"name":"Pro Mod 2.0 · PT8685 methanol","selections":{"block":"promod_block","crank":"promod_crank","oiling":"promod_drysump","head":"ported_head","valvetrain":"solid_lifter","turbo":"pt8685","air":"ice_tank","fuelSystem":"promod_methanol_fuel","fuel":"methanol","exhaust":"hood_4","ecu":"promod_ecu","ignition":"dual_cdi","sealing":"receiver_ring_extreme","transmission":"promod_5speed","spool":"n2o_150","crankcase":"vacuum_pump","boostControl":"dual_60_co2","manifold":"sheetmetal_105","sensors":"pro_instrumentation"},"tune":{"boostLowBar":0.6,"boostMidBar":1.6,"boostHighBar":3.6,"lambda":0.74,"ignitionTrimDeg":-2,"revLimitRpm":9500,"railTargetBar":225,"intakeCamAdvanceDeg":0,"launchRpm":6800,"firstGearBoostPct":72,"secondGearBoostPct":88,"als":{"mode":"drag"}},"service":{"oilId":"10w60_race","liters":5.0,"filterId":"motorsport","oilAgeKm":0,"oilRuns":0},"assembly":{"topRingGapMm":0.56,"secondRingGapMm":0.62,"rodClearanceMm":0.06,"mainClearanceMm":0.058,"sparkGapMm":0.52,"balanceQualityPct":100,"deckSealQualityPct":100,"fastenerProcedurePct":100,"oilPrimed":true}},"outlaw106":{"name":"Outlaw 2.0 · PT8085 methanol","selections":{"block":"promod_block","crank":"promod_crank","oiling":"promod_drysump","head":"ported_head","valvetrain":"solid_lifter","turbo":"pt8085","air":"ice_tank","fuelSystem":"promod_methanol_fuel","fuel":"methanol","exhaust":"hood_4","ecu":"promod_ecu","ignition":"dual_cdi","sealing":"receiver_ring_extreme","transmission":"promod_5speed","spool":"n2o_150","crankcase":"vacuum_pump","boostControl":"dual_60_co2","manifold":"sheetmetal_105","sensors":"pro_instrumentation"},"tune":{"boostLowBar":0.7,"boostMidBar":1.9,"boostHighBar":3.3,"lambda":0.74,"ignitionTrimDeg":-2.5,"revLimitRpm":9200,"railTargetBar":225,"intakeCamAdvanceDeg":-1,"launchRpm":7200,"firstGearBoostPct":72,"secondGearBoostPct":88,"als":{"mode":"drag"}},"service":{"oilId":"10w60_race","liters":5.0,"filterId":"motorsport","oilAgeKm":0,"oilRuns":0},"assembly":{"topRingGapMm":0.57,"secondRingGapMm":0.63,"rodClearanceMm":0.06,"mainClearanceMm":0.058,"sparkGapMm":0.5,"balanceQualityPct":100,"deckSealQualityPct":100,"fastenerProcedurePct":100,"oilPrimed":true}},"unlimited":{"name":"Unlimited 2.0 · PT8685 + promod head","selections":{"block":"promod_block","crank":"promod_crank","oiling":"promod_drysump","crankcase":"vacuum_pump","head":"promod_head","valvetrain":"promod_valvetrain","turbo":"pt8685","boostControl":"dual_60_co2","air":"promod_ice_system","manifold":"billet_120","fuelSystem":"promod_methanol_fuel","fuel":"methanol","exhaust":"hood_4","ecu":"promod_ecu","sensors":"pro_instrumentation","ignition":"dual_cdi","sealing":"receiver_ring_extreme","transmission":"promod_5speed","spool":"n2o_250"},"tune":{"boostLowBar":0.6,"boostMidBar":1.8,"boostHighBar":4.2,"lambda":0.72,"ignitionTrimDeg":-3.0,"revLimitRpm":10000,"railTargetBar":225,"intakeCamAdvanceDeg":-2,"launchRpm":7800,"firstGearBoostPct":72,"secondGearBoostPct":88,"als":{"mode":"drag"}},"assembly":{"topRingGapMm":0.58,"secondRingGapMm":0.64,"rodClearanceMm":0.062,"mainClearanceMm":0.06,"sparkGapMm":0.49,"balanceQualityPct":100,"deckSealQualityPct":100,"fastenerProcedurePct":100,"oilPrimed":true},"service":{"oilId":"10w60_race","liters":5.0,"filterId":"motorsport","oilAgeKm":0,"oilRuns":0}}};

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

  const LEGACY_TURBO_IDS = Object.freeze({ 6466: 'pt6466', 6870: 'pt6870', 7275: 'pt7675', 7685: 'pt7675', 8285: 'pt8085', 8685: 'pt8685', 8891: 'pt8685', 9488: 'pt9103', 9894: 'pt9803', '106mm': 'pt10603', '118mm': 'pt10603', '127mm': 'pt10603' });
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
      tractionControl: true,
      nitrousRetardPer50: 2,
      ethanolPct: 85,
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
      dynoConfig: { rampRpmPerSec: 550, fanSpeedPct: 85, ambientTempC: 20, baroKpa: 101.3, humidityPct: 50, gear: 4, correction: 'din70020' },
      dynoThermal: { soakK: 0, at: 0 },
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
        burnoutRpm: 5000,
        burnoutLimiter: false,
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
      career: defaultCareer(),
      buildSlots: [null, null, null],
      settings: { sound: true, haptics: true, reducedMotion: false, graphics3d: true, engineSound: 'synth', mix: { engine: 100, turbo: 100, als: 100, tyre: 100, rival: 100, ui: 100 } },
      history: []
    };
  }

  // Compound turbocharging: a second turbo from the turbo list as the high-pressure (HP) stage in series
  // with the main (LP) turbo (selections.turboHp, '' = single turbo). The kit is the HP exhaust manifold,
  // interstage piping, the HP turbine bypass valve and the HP compressor bypass (check) valve. The HP
  // stage must be the smaller turbo: it breathes pre-compressed air and must spool first.
  const COMPOUND_KIT = { price: 2600, massKg: 14, name: 'Compound-kit (HP-spruitstuk, interstage, turbine- en compressorbypass)' };
  function compoundHp(state) {
    const id = state.selections && state.selections.turboHp;
    if (!id) return null;
    const hp = CATEGORY_MAP.turbo.items.find(i => i.id === id), lp = getPart(state, 'turbo');
    if (!hp) return null;
    const valid = Number(hp.compressorMm) > 0 && Number(hp.compressorMm) < Number(lp.compressorMm || 0) && hp.id !== lp.id;
    return { item: hp, valid, reason: valid ? '' : `${hp.name} is niet kleiner dan de hoofdturbo ${lp.name}: de HP-trap moet de kleinere turbo zijn.` };
  }
  function compoundHpMap(state) {
    const c = compoundHp(state);
    return c && c.valid ? Turbo.getMap(c.item.id) : null;
  }
  function getPart(state, categoryId) {
    const cat = CATEGORY_MAP[categoryId];
    if (!cat) throw new Error(`Unknown category ${categoryId}`);
    return cat.items.find(x => x.id === state.selections[categoryId]) || cat.items[0];
  }
  function normalizeState(input, opts = {}) {
    const base = blankState();
    if (!input || typeof input !== 'object') return opts.noEcu ? base : withEcu(base);
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
      'dynoThermal',
      'records',
      'achievements',
      'career'
    ])
      s[k] = { ...base[k], ...(input[k] || {}) };
    s.tune.als = { ...defaultAntiLag(), ...((input.tune && input.tune.als) || {}) };
    s.bench = { ...base.bench, ...(input.bench || {}), results: { ...(base.bench.results || {}), ...((input.bench || {}).results || {}) } };
    s.dynoRuns = Array.isArray(input.dynoRuns) ? input.dynoRuns.slice(0, 20).map(sanitizeDynoResult).filter(Boolean) : [];
    s.lastDyno = sanitizeDynoResult(input.lastDyno);
    s.dragRuns = Array.isArray(input.dragRuns) ? input.dragRuns.slice(0, 30) : [];
    s.history = Array.isArray(input.history) ? input.history.slice(0, 60) : [];
    s.version = 12;
    // v1.3.0 generic turbos were replaced by the Precision catalogue: map old ids to the nearest model.
    if (LEGACY_TURBO_IDS[s.selections.turbo]) s.selections.turbo = LEGACY_TURBO_IDS[s.selections.turbo];
    for (const cat of CATEGORIES) if (!cat.items.some(x => x.id === s.selections[cat.id])) s.selections[cat.id] = cat.items[0].id;
    // 1.12 compound kits (a separate category) became a second turbo from the turbo list
    if (s.selections.compound) {
      const legacy = { compound_k04: 'k04', compound_g25: 'g25' }[s.selections.compound];
      if (legacy && !s.selections.turboHp) s.selections.turboHp = legacy;
      delete s.selections.compound;
    }
    if (typeof s.selections.turboHp !== 'string' || (s.selections.turboHp && !CATEGORY_MAP.turbo.items.some(x => x.id === s.selections.turboHp))) s.selections.turboHp = '';
    if (!OIL_MAP[s.service.oilId]) s.service.oilId = base.service.oilId;
    if (!FILTER_MAP[s.service.filterId]) s.service.filterId = base.service.filterId;
    if (!TIRE_MAP[s.vehicle.tireCompound]) s.vehicle.tireCompound = base.vehicle.tireCompound;
    if (!DRIVETRAINS[s.vehicle.drivetrain]) s.vehicle.drivetrain = base.vehicle.drivetrain;
    return opts.noEcu ? s : withEcu(s);
  }
  // The ECU calibration tables are part of the canonical state; builds without them (older saves,
  // presets, a blank state) get tables derived from their quick-setup values and a base spark map.
  function withEcu(s) {
    if (!validEcu(s.tune.ecu)) s.tune.ecu = buildEcu(s, { previous: s.tune.ecu });
    else if (s.tune.ecu.quickKey !== quickSetupKey(s.tune)) {
      // Quick setup changed: tables that were not edited by hand follow it (spark map stays as calibrated).
      const e = s.tune.ecu, t = s.tune;
      s.tune.ecu = {
        ...e,
        boost: e.edited?.boost ? e.boost : legacyBoostTable(t),
        lambda: e.edited?.lambda ? e.lambda : legacyLambdaTable(t),
        cam: e.edited?.cam ? e.cam : legacyCamTable(t),
        quickKey: quickSetupKey(t)
      };
    }
    return s;
  }
  function quickSetupKey(t) {
    return [t.boostLowBar, t.boostMidBar, t.boostHighBar, t.firstGearBoostPct, t.secondGearBoostPct, t.revLimitRpm, t.lambda, t.intakeCamAdvanceDeg, t.vvtEnabled].map(v => (typeof v === 'number' ? round(v, 4) : String(v))).join('|');
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
      // Anti-lag and traction control act only in the race, never in a WOT dyno pull.
      tune: { ...compactObject({ ...t, als: undefined, tractionControl: undefined }, 3), revLimitRpm: Math.round(t.revLimitRpm) },
      assembly: compactObject(s.assembly, 3),
      oil: { id: s.service.oilId, liters: round(s.service.liters, 2), filter: s.service.filterId },
      dyno: compactObject(s.dynoConfig, 2)
    });
  }
  function benchSignature(inputState) {
    const s = normalizeState(inputState, { noEcu: true });
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
    const s = normalizeState(inputState, { noEcu: true }),
      block = getPart(s, 'block'),
      crank = getPart(s, 'crank');
    // A stroker/destroker crank sets the stroke; the rods change so the deck height stays (half the stroke
    // difference) and the combustion chamber stays, so the compression ratio follows the swept volume.
    const boreMm = Number(block.boreMm || 82.5),
      baseStroke = Number(block.strokeMm || 92.8),
      strokeMm = Number(crank.strokeMm || baseStroke),
      rodMm = 144 - (strokeMm - baseStroke) / 2,
      cylinders = 4;
    const swept = s => ((Math.PI / 4) * boreMm * boreMm * s) / 1000; // cc per cylinder
    const baseCr = Number(block.compressionRatio || 9.6), clearance = swept(baseStroke) / (baseCr - 1);
    const displacementCc = swept(strokeMm) * cylinders;
    return {
      boreMm,
      strokeMm,
      rodMm,
      cylinders,
      displacementCc,
      displacementL: displacementCc / 1000,
      compressionRatio: round((swept(strokeMm) + clearance) / clearance, 2)
    };
  }
  function camTimingHealth(inputState) {
    const s = normalizeState(inputState, { noEcu: true }),
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
    const s = normalizeState(inputState, { noEcu: true }),
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
    const s = normalizeState(inputState, { noEcu: true }),
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
    const s = normalizeState(inputState, { noEcu: true }),
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
    const s = normalizeState(inputState, { noEcu: true }),
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
  // Mechanical rpm limits, weakest first. The ECU is not in this chain: an ECU that cannot command a
  // higher limiter caps the revs (fuel/spark cut), it does not float valves.
  const RPM_LIMIT_PARTS = {
    valvetrain: rpm => `Valve-float: de klepveren/kleppen houden boven ~${rpm} rpm de nok niet meer bij.`,
    head: rpm => `Valve-float: de nokkenassen/kop zijn niet gemaakt voor meer dan ~${rpm} rpm (nokprofiel en kleppen verliezen contact).`,
    block: rpm => `Mechanische over-rev: zuigers/drijfstangen van het onderblok zijn gemaakt voor ~${rpm} rpm (massakrachten).`,
    crank: rpm => `Mechanische over-rev: de krukas/demper is gemaakt voor ~${rpm} rpm (torsietrilling).`,
    oiling: rpm => `Over-rev van het oliesysteem: boven ~${rpm} rpm schuimt/cavitert de olie en droogt het lager.`
  };
  function rpmLimitChain(inputState) {
    const state = normalizeState(inputState);
    const parts = Object.keys(RPM_LIMIT_PARTS).map(cat => { const p = getPart(state, cat); return { category: cat, id: p.id, name: p.name, rpm: Number(p.rpmLimit) || Infinity }; })
      .sort((a, b) => a.rpm - b.rpm);
    const ecu = getPart(state, 'ecu');
    return { weakest: parts[0], parts, ecu: { id: ecu.id, name: ecu.name, rpm: Number(ecu.rpmLimit) || Infinity } };
  }
  // The limiter the ECU actually runs: the tune value, capped by what the ECU can command.
  function effectiveRevLimit(state) {
    const tuneRev = clamp(Math.round(Number(state.tune.revLimitRpm || 8000) / 100) * 100, 5000, 10500);
    const ecuMax = Number(getPart(state, 'ecu').rpmLimit) || Infinity;
    return Math.min(tuneRev, Math.floor(ecuMax / 100) * 100);
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
      rpmLimiter,
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
    if (point.rpm > componentRpmLimit * 1.04) {
      const w = rpmLimiter || { category: 'valvetrain', name: 'kleppentrein', rpm: componentRpmLimit };
      const ev = fail('overrev', 'engine', `${RPM_LIMIT_PARTS[w.category](Math.round(w.rpm))} Begrenzer: ${w.name}.`, over(point.rpm, componentRpmLimit * 1.04, 0.1));
      ev.limitCategory = w.category;
      ev.limitPartId = w.id;
      return ev;
    }
    if (point.bmepBar > sealing.headClampBmep * 1.15)
      return fail('head_lift', 'engine', 'Head-lift: cilinderdruk overschreed de sealingmarge.', over(point.bmepBar, sealing.headClampBmep * 1.15));
    if (point.fuelDutyPct > 113 && !tune.railPressureCut)
      return fail('lean_out', 'engine', 'Brandstofsysteem liep leeg: lean-out onder boost.', over(point.fuelDutyPct, 113));
    if (point.shaftSpeedPct > 112)
      return fail('turbo_overspeed', 'turbo', 'Turbo overspeed: asoptoerental boven de compressorgrens.', over(point.shaftSpeedPct, 112, 0.15));
    if (point.hpShaftPct > 112)
      return fail('turbo_overspeed', 'turbo', 'Overspeed van de HP-turbo (compound): de kleine trap draait boven zijn asgrens.', over(point.hpShaftPct, 112, 0.15));
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
  // 5.0: physical engine model (engine.js), ECU tables, fuel-system hardware; power is quoted in pk (PS).
  const ENGINE_MODEL_VERSION = '5.0';
  // Vehicle model revision (tyres, burnout): part of the rival pass cache key, not of the dyno signature.
  const VEHICLE_MODEL_VERSION = '2';
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

  // ---- Engine hardware and ECU calibration (phase 4) ------------------------------
  // The physical engine model (engine.js) needs geometry, head breathing data, the fuel blend and the
  // fuel system. The ECU holds the calibration as tables, exactly as a calibrator sees it:
  //   boost target (bar, gauge) per gear x rpm; spark advance (deg BTDC), lambda target and intake-cam
  //   advance per MAP (bar abs) x rpm; plus a global spark trim, IAT spark compensation and knock control.
  const ECU_RPM_AXIS = Object.freeze([1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10000, 10500]);
  const ECU_LOAD_AXIS = Object.freeze([1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]);
  const ECU_GEARS = 6;
  const ECU_VERSION = 1;
  function axisPos(axis, v) {
    if (v <= axis[0]) return [0, 0, 0];
    const n = axis.length - 1;
    if (v >= axis[n]) return [n, n, 0];
    let i = 0;
    while (axis[i + 1] < v) i++;
    return [i, i + 1, (v - axis[i]) / (axis[i + 1] - axis[i])];
  }
  // Bilinear lookup with clamping at the table edges (what every ECU does).
  function tableLookup(table, rowAxis, colAxis, rowValue, colValue) {
    const [r0, r1, fr] = axisPos(rowAxis, rowValue), [c0, c1, fc] = axisPos(colAxis, colValue);
    const a = table[r0][c0] * (1 - fc) + table[r0][c1] * fc, b = table[r1][c0] * (1 - fc) + table[r1][c1] * fc;
    return a * (1 - fr) + b * fr;
  }
  function fuelSpecFor(state) {
    const s = state, grade = Engine.DATA.fuelGrades[s.selections.fuel] || Engine.DATA.fuelGrades.ron98;
    if (!grade.flex) return grade;
    const e = clamp(Number(s.tune.ethanolPct ?? 85), 0, 100) / 100;
    return { ...grade, volume: { gasoline: 1 - e, ethanol: e } };
  }
  function engineHardware(inputState) {
    const s = normalizeState(inputState, { noEcu: true }),
      block = getPart(s, 'block'),
      head = getPart(s, 'head'),
      manifold = getPart(s, 'manifold'),
      air = getPart(s, 'air'),
      turbo = getPart(s, 'turbo'),
      oil = OIL_MAP[s.service.oilId],
      crankcase = getPart(s, 'crankcase');
    const geometry = engineGeometry(s);
    const geo = Engine.makeGeometry({ boreMm: geometry.boreMm, strokeMm: geometry.strokeMm, rodMm: geometry.rodMm, compressionRatio: geometry.compressionRatio, cylinders: 4 });
    const headData = Engine.DATA.heads[head.id] || Engine.DATA.heads.oem_head;
    const fuelSpec = fuelSpecFor(s);
    const fuel = Engine.fuelBlend(fuelSpec);
    const fuelSys = Engine.DATA.fuelSystems[s.selections.fuelSystem] || Engine.DATA.fuelSystems.oem_fuel;
    const turboMap = Turbo.getMap(turbo.id);
    return {
      geo,
      head: headData,
      fuel,
      fuelSpec,
      fuelLabel: fuelSpec.label,
      ethanolPct: Math.round((fuelSpec.volume?.ethanol || 0) * 100),
      fuelSys,
      twinScroll: !!turboMap?.source?.turbine?.twinScroll || /twin-scroll/i.test(`${turbo.specs} ${turbo.name}`),
      // runners/plenum raise VE a little beyond the head's own breathing
      veScale: 1 + (Number(manifold.intakeFlow || 1) - 1) * 0.45,
      // hot viscosity relative to a 5W-40, plus crankcase vacuum (less windage and ring drag)
      viscosityFactor: (oil ? oil.hotViscosity / 0.94 : 1),
      extraFmepBar: crankcase.vacuumKpa < 0 ? -0.08 : 0,
      wmi: s.selections.air === 'wmi' ? { ccMin: 1000, ratio: 0.18, methanolFrac: 0.5 } : null,
      assumedIatC: 45 - 25 * clamp(Number(air.cooling || 0.3), 0, 1),
      block
    };
  }
  // Boost targets from the quick-setup points (low/mid/high and the gear percentages).
  function legacyBoostRow(tune, gearPct) {
    const rev = clamp(Math.round(Number(tune.revLimitRpm || 8000) / 100) * 100, 5000, 10500);
    return ECU_RPM_AXIS.map(rpm => round(Math.max(0, requestedBoostAt(tune, rpm, rev) * gearPct), 3));
  }
  function legacyBoostTable(tune) {
    const g1 = clamp(Number(tune.firstGearBoostPct ?? 100), 0, 100) / 100, g2 = clamp(Number(tune.secondGearBoostPct ?? 100), 0, 100) / 100;
    return Array.from({ length: ECU_GEARS }, (_, g) => legacyBoostRow(tune, g === 0 ? g1 : g === 1 ? g2 : 1));
  }
  // Lambda: near stoichiometric off boost, enriching to the full-load target (component protection).
  function legacyLambdaTable(tune) {
    const wot = clamp(Number(tune.lambda || 0.8), 0.6, 1.05);
    return ECU_LOAD_AXIS.map(load => ECU_RPM_AXIS.map(rpm => round(load <= 1.1 ? 0.98 : load >= 1.9 ? wot : 0.98 + (wot - 0.98) * ((load - 1.1) / 0.8), 3)));
  }
  function legacyCamTable(tune) {
    const adv = tune.vvtEnabled === false ? 0 : clamp(Number(tune.intakeCamAdvanceDeg ?? 8), -5, 42);
    return ECU_LOAD_AXIS.map(() => ECU_RPM_AXIS.map(() => adv));
  }
  // Base spark map: at every cell the lower of MBT and the knock-limited advance minus a margin, for
  // the installed hardware and fuel at an assumed charge temperature. This is what a calibrator delivers
  // as a safe starting map; power left between it and the knock limit is for the player to find.
  const baseMapCache = new Map();
  function generateSparkMap(inputState, ecu, options = {}) {
    const s = normalizeState(inputState, { noEcu: true }), hw = engineHardware(s);
    const margin = Number.isFinite(options.marginDeg) ? options.marginDeg : 2;
    const key = JSON.stringify({ sel: s.selections, eth: hw.ethanolPct, lam: ecu.lambda, cam: ecu.cam, margin, v: ENGINE_MODEL_VERSION });
    if (baseMapCache.has(key)) return baseMapCache.get(key).map(r => r.slice());
    const iatK = hw.assumedIatC + 273.15;
    const map = ECU_LOAD_AXIS.map((load, li) =>
      ECU_RPM_AXIS.map((rpm, ci) => {
        const op = Engine.operatingPoint({
          geo: hw.geo, head: hw.head, rpm, mapBarAbs: load, manifoldK: iatK, empBarAbs: load * (load > 1.5 ? 1.35 : 1.1),
          lambda: ecu.lambda[li][ci], fuel: hw.fuel, camAdvanceDeg: ecu.cam[li][ci], twinScroll: hw.twinScroll, exhaustK: 1180,
          veScale: hw.veScale, waterPerAir: hw.wmi && load > 1.6 ? (hw.wmi.ratio * 0.5) / (hw.fuel.afrSt * ecu.lambda[li][ci]) : 0,
          stepDeg: 3
        });
        const klsa = op.klsaDeg ?? op.mbtDeg;
        return round(clamp(Math.min(op.mbtDeg, klsa - margin), -10, 45), 1);
      })
    );
    baseMapCache.set(key, map);
    if (baseMapCache.size > 40) baseMapCache.delete(baseMapCache.keys().next().value);
    return map.map(r => r.slice());
  }
  function defaultKnockSettings() {
    return { maxRetardDeg: 10, iatRetardDegPerC: 0.12, iatRetardFromC: 45 };
  }
  // Builds the ECU from the quick-setup fields. Spark is generated for the current hardware.
  function buildEcu(inputState, options = {}) {
    const s = inputState;
    const t = s.tune;
    const ecu = {
      version: ECU_VERSION,
      rpmAxis: ECU_RPM_AXIS.slice(),
      loadAxis: ECU_LOAD_AXIS.slice(),
      boost: legacyBoostTable(t),
      lambda: legacyLambdaTable(t),
      cam: legacyCamTable(t),
      spark: null,
      sparkTrimDeg: 0,
      knock: defaultKnockSettings(),
      edited: { boost: false, spark: false, lambda: false, cam: false },
      baseMapFor: null,
      quickKey: quickSetupKey(t)
    };
    const prev = options.previous;
    if (prev && prev.version === ECU_VERSION) {
      for (const k of ['boost', 'lambda', 'cam', 'spark']) if (prev.edited?.[k] && Array.isArray(prev[k])) { ecu[k] = prev[k]; ecu.edited[k] = true; }
      if (!options.regenerateSpark && Array.isArray(prev.spark)) ecu.spark = prev.spark;
      ecu.knock = { ...ecu.knock, ...(prev.knock || {}) };
      ecu.baseMapFor = prev.baseMapFor;
    }
    if (!ecu.spark) {
      ecu.spark = generateSparkMap({ ...s, tune: { ...t, ecu } }, ecu, { marginDeg: options.marginDeg });
      const hw = engineHardware({ ...s, tune: { ...t, ecu } });
      ecu.baseMapFor = { fuel: s.selections.fuel, ethanolPct: hw.ethanolPct, head: s.selections.head, block: s.selections.block, label: `${hw.fuelLabel}${hw.ethanolPct && Engine.DATA.fuelGrades[s.selections.fuel]?.flex ? ` E${hw.ethanolPct}` : ''}` };
      ecu.edited.spark = false;
    }
    return ecu;
  }
  function validEcu(ecu) {
    const okTable = (t, rows, cols) => Array.isArray(t) && t.length === rows && t.every(r => Array.isArray(r) && r.length === cols && r.every(Number.isFinite));
    return !!ecu && ecu.version === ECU_VERSION && okTable(ecu.boost, ECU_GEARS, ECU_RPM_AXIS.length) && okTable(ecu.spark, ECU_LOAD_AXIS.length, ECU_RPM_AXIS.length) &&
      okTable(ecu.lambda, ECU_LOAD_AXIS.length, ECU_RPM_AXIS.length) && okTable(ecu.cam, ECU_LOAD_AXIS.length, ECU_RPM_AXIS.length);
  }
  // Quick setup changed (boost points, gear %, lambda, cam): rewrite the tables that are not hand-edited.
  function syncEcuFromQuickSetup(inputState) {
    const s = normalizeState(inputState, { noEcu: true });
    s.tune.ecu = buildEcu(s, { previous: s.tune.ecu });
    return s;
  }
  // Generates a fresh base spark map for the current hardware and fuel (the "tuner's base map").
  function regenerateBaseMap(inputState, options = {}) {
    const s = normalizeState(inputState, { noEcu: true });
    const prev = { ...s.tune.ecu, edited: { ...(s.tune.ecu?.edited || {}), spark: false } };
    s.tune.ecu = buildEcu(s, { previous: prev, regenerateSpark: true, marginDeg: options.marginDeg });
    return s;
  }
  function ecuBoostTarget(ecu, gearIndex, rpm) {
    const row = ecu.boost[clamp(Math.round(gearIndex), 0, ECU_GEARS - 1)];
    const [c0, c1, f] = axisPos(ECU_RPM_AXIS, rpm);
    return row[c0] * (1 - f) + row[c1] * f;
  }
  function ecuCell(ecu, name, mapBarAbs, rpm) {
    return tableLookup(ecu[name], ECU_LOAD_AXIS, ECU_RPM_AXIS, mapBarAbs, rpm);
  }
  // Knock-control behaviour of the installed ECU: better ECUs/sensors hold closer to the limit.
  function knockControlFor(state, ecuPart, sensors) {
    const q = clamp(ecuPart.safetyQuality * (0.78 + sensors.sensorQuality * 0.22), 0, 1);
    return { enabled: state.tune.knockControl !== false, marginDeg: 0.4 + (1 - q) * 2.6, maxRetardDeg: clamp(Number(state.tune.ecu?.knock?.maxRetardDeg ?? 10), 2, 20), boostProtection: state.tune.knockControl !== false };
  }

  // ---- Dyno correction standards --------------------------------------------------------------
  // Power measured in the cell's air is converted to reference conditions. The formulas are the published
  // ones; they were written for naturally aspirated engines, so on a turbo engine (whose boost control
  // already compensates part of the air density) they tend to over-correct in hot or thin air, as real
  // dyno reports do.
  const DYNO_CORRECTIONS = Object.freeze({
    none: { label: 'Ongecorrigeerd', short: 'ruw' },
    din70020: { label: 'DIN 70020', short: 'DIN' },
    iso1585: { label: 'ISO 1585 / EWG 80/1269', short: 'ISO' },
    sae_j1349: { label: 'SAE J1349', short: 'SAE' }
  });
  function correctionFactor(standard, tempC, baroKpa, humidityPct) {
    const T = tempC + 273.15, pTot = baroKpa, pDry = Engine.dryAirBar(baroKpa / 100, tempC, humidityPct) * 100;
    if (standard === 'din70020') return (101.3 / pTot) * Math.sqrt(T / 293.15);
    if (standard === 'iso1585') return Math.pow(99 / pDry, 1.2) * Math.pow(T / 298.15, 0.6);
    if (standard === 'sae_j1349') return 1.18 * ((99 / pDry) * Math.sqrt(T / 298.15)) - 0.18;
    return 1;
  }
  // Chassis-dyno losses between crank and roller in the pull gear: gearbox/differential (proportional),
  // tyre rolling on the rollers and bearing/spin losses (with roller speed). Maha-style measurement adds
  // the coast-down drag power back to the wheel power to state engine power.
  function dynoLossKw(state, rpm, engineKw, gearIndex) {
    const trans = getPart(state, 'transmission'), drive = DRIVETRAINS[state.vehicle.drivetrain] || DRIVETRAINS.FWD;
    const r = tireGeometry(state.vehicle).radiusM;
    const ratio = (trans.gearRatios[clamp(gearIndex, 0, trans.gearRatios.length - 1)] || 1) * trans.finalDrive;
    const v = (rpm / 60) * 2 * Math.PI * r / ratio;
    const eta = trans.transEfficiency * (1 - drive.loss * 0.34);
    const axleN = buildMassKg(state) * 9.80665 * (state.vehicle.drivetrain === 'RWD' ? 1 - drive.frontStatic : state.vehicle.drivetrain === 'AWD' ? 1 : drive.frontStatic);
    const rollerKw = (0.015 * axleN * v) / 1000;
    const spinKw = 0.0022 * v * v;
    return { lossKw: Math.max(0, engineKw) * (1 - eta) + rollerKw + spinKw, speedKmh: v * 3.6 };
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
    const revLimit = effectiveRevLimit(state),
      rpmChain = rpmLimitChain(state),
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
      componentRpmLimit = rpmChain.weakest.rpm;
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
    const rand = mulberry32(fnv1a(engineSignature(state) + '|' + (Number(options.pullIndex) || 0))),
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
      hw = engineHardware(state),
      ecuCal = state.tune.ecu,
      stoichAfr = hw.fuel.afrSt,
      humidity = Number(state.dynoConfig.humidityPct ?? 50),
      baroBar = baro / 100,
      dryFraction = Engine.dryAirBar(baroBar, ambient, humidity) / baroBar,
      ambientK = ambient + 273.15,
      dtSample = DYNO_STEP_RPM / ramp,
      dynoGear = clamp(Math.round(Number(state.dynoConfig.gear || 4)), 1, 6) - 1,
      // Heat soak from previous pulls: the intercooler core and intake still hold heat (from the app's thermal state).
      soakK = clamp(Number(options.soakK) || 0, 0, 60),
      correction = DYNO_CORRECTIONS[state.dynoConfig.correction] ? state.dynoConfig.correction : 'din70020',
      corrFactor = correctionFactor(correction, ambient, baro, humidity),
      knockCtl = knockControlFor(state, ecu, sensors),
      // Blow-by and worn rings lose trapped charge; assembly quality and plug gap decide combustion quality.
      ringSeal = (0.94 + assembly.ringScore * 0.06 - assembly.ringWideRisk * 0.025) * wearFactor,
      assemblyPower = 0.965 + assembly.score * 0.035,
      camTimingVe = camTiming.applicable ? 0.9 + 0.1 * camTiming.score : 1;
    // Compound: the HP turbo's map when a second turbo is fitted in series (Turbo.matchCompound).
    const hpMap = compoundHpMap(state);
    const matchBoost = (ctx, target) => (hpMap ? Turbo.matchCompound(ctx, hpMap, target) : Turbo.matchEngine(ctx, target));
    let prevShaftRpm = NaN,
      prevHpShaftRpm = NaN,
      prevSpoolFrac = 0,
      empRatio = 1.25,
      t3K = 1150,
      prevBoost = 0,
      prevFuelKw = 0;
    for (let rpm = DYNO_START_RPM; !abort && rpm <= revLimit; rpm += DYNO_STEP_RPM) {
      const desired = ecuBoostTarget(ecuCal, dynoGear, rpm);
      const controlRipple = (1 - boostControl.boostControlQuality) * (0.04 * Math.sin(rpm / 285) + 0.025 * (rand() - 0.5)),
        hardwareLimit = boostControl.boostHardwareMaxBar,
        requestedRatio = desired / Math.max(0.15, hardwareLimit);
      // Boost the controller asks for; what the turbo can deliver follows from the map.
      let targetBoost = desired * (1 + controlRipple);
      if (tune.overboostCut && requestedRatio > 1.03) targetBoost = Math.min(targetBoost, hardwareLimit * 1.04);
      else if (requestedRatio > 1) targetBoost *= 1 + Math.min(0.18, (requestedRatio - 1) * 0.16);
      targetBoost = Math.max(0, targetBoost);
      const meanPistonSpeed = (2 * (geometry.strokeMm / 1000) * rpm) / 60;
      // Intercooler: effectiveness falls once flow exceeds the core rating; fan and ramp decide heat soak.
      const chargeCooling = (t2K, flowLb) => {
        const eps = (0.55 + 0.45 * air.cooling) * clamp(1 - 0.35 * Math.max(0, flowLb / chargeAir.refFlowLbMin - 1), 0.4, 1);
        return ambientK + 2 + (t2K - ambientK) * (1 - eps) * (1.18 - 0.48 * fan) * heatSoak + spoolAssist.spoolHeat * 22 + soakK;
      };
      // Spool shot: armed in its rpm window (from 3000 rpm), fading out as the turbo comes up.
      const nitrousTaper =
        spoolAssist.nitrousHp > 0 && rpm >= 3000 ? clamp((0.93 - prevSpoolFrac) / 0.58, 0, 1) * clamp((revLimit - rpm + 800) / 2200, 0, 1) * clamp((rpm - 3000) / 400, 0, 1) : 0;
      // Rolling anti-lag / spool strategy: part of the fuel energy is released in the manifold (retarded
      // combustion) while the turbo is still coming up; that energy is taken from the crank, not created.
      const alsSpoolShare = spoolAssist.spoolHeat * 0.12 * clamp(1 - prevSpoolFrac, 0, 1);
      // Nitrous spool shot: N2O + its fuel (about 0.06 lb/min per hp of shot) burn in the cylinder; the exhaust
      // carries roughly the same heat as the added shaft power.
      const extraExhaustKw = alsSpoolShare * prevFuelKw + spoolAssist.nitrousHp * 0.7457 * 0.9 * nitrousTaper;
      const matchAt = (boostTarget, camDeg) => {
        const airflowAt = (B, tK) =>
          Engine.airflowKgS({ geo: hw.geo, head: hw.head, rpm, mapBarAbs: baroBar + B, manifoldK: tK, empBarAbs: (baroBar + B) * empRatio, exhaustK: t3K,
            camAdvanceDeg: camDeg, twinScroll: hw.twinScroll, veScale: hw.veScale * ringSeal * camTimingVe, dryFraction });
        const exhaustTempK = B => t3K + 45 * (B - prevBoost);
        return matchBoost(
          { map: turboMap, baroBar, ambientK, airflowAt, exhaustTempK, chargeCooling, stoichAfr, lambda: ecuCell(ecuCal, 'lambda', baroBar + boostTarget, rpm),
            chargeAir, exhaust: exhaustSystem, wastegate, protectShaftSpeed: !!(tune.overboostCut || wastegate.shaftSpeedSensor), extraExhaustKw,
            extraExhaustKgS: (spoolAssist.nitrousHp * 0.06 * nitrousTaper) / Turbo.LBMIN_PER_KGS },
          { targetBoostBar: boostTarget, prevShaftRpm, prevHpShaftRpm, dtS: dtSample }
        );
      };
      // One pass = turbo match, fuel delivery, combustion. Exhaust pressure and temperature feed back into
      // breathing, so the pass is repeated with the updated values; ECU protections may lower the target.
      let tp, op, fd, mapAbs, lambdaTarget, actualLambda, camDeg, sparkCmd, protectedBy = '', boostCmd = targetBoost;
      for (let pass = 0; pass < 4; pass++) {
        camDeg = tune.vvtEnabled === false ? 0 : ecuCell(ecuCal, 'cam', baroBar + boostCmd, rpm);
        tp = matchAt(boostCmd, camDeg);
        mapAbs = baroBar + tp.boostBar;
        lambdaTarget = ecuCell(ecuCal, 'lambda', mapAbs, rpm);
        camDeg = tune.vvtEnabled === false ? 0 : ecuCell(ecuCal, 'cam', mapAbs, rpm);
        const manifoldK = tp.manifoldC + 273.15;
        fd = Engine.fuelDelivery(hw.fuelSys, { rpm, demandKgS: tp.massFlowKgS / (stoichAfr * lambdaTarget), fuel: hw.fuel, railTargetBar: tune.railTargetBar, mapBarAbs: mapAbs });
        actualLambda = tp.massFlowKgS / Math.max(1e-9, stoichAfr * fd.deliveredKgS);
        // Spark: table + global trim, retarded for hot charge air.
        const iatC = tp.manifoldC;
        sparkCmd = ecuCell(ecuCal, 'spark', mapAbs, rpm) + Number(ecuCal.sparkTrimDeg || 0) + Number(tune.ignitionTrimDeg || 0) -
          Math.max(0, iatC - (ecuCal.knock?.iatRetardFromC ?? 45)) * (ecuCal.knock?.iatRetardDegPerC ?? 0.12);
        const water = hw.wmi && tp.boostBar > 0.8 ? (hw.wmi.ratio * 0.5) / (stoichAfr * lambdaTarget) : 0;
        op = Engine.operatingPoint({
          geo: hw.geo, head: hw.head, rpm, mapBarAbs: mapAbs, manifoldK, empBarAbs: tp.empBarAbs, lambda: clamp(actualLambda, 0.55, 1.6), fuel: hw.fuel,
          sparkCmdDeg: sparkCmd, camAdvanceDeg: camDeg, twinScroll: hw.twinScroll, exhaustK: t3K, waterPerAir: water, dryFraction,
          veScale: hw.veScale * ringSeal * camTimingVe, viscosityFactor: hw.viscosityFactor, extraFmepBar: hw.extraFmepBar,
          combustionEff: assemblyPower, knockControl: knockCtl, stepDeg: 2
        });
        empRatio = tp.empBarAbs / mapAbs;
        t3K = op.exhaustK;
        // ECU protections: lean (fuel system saturated) or knock beyond the retard limit lower the boost target.
        const lean = actualLambda > lambdaTarget + 0.04 && tp.boostBar > 0.3;
        const knockLimit = knockCtl.boostProtection && op.knockIndex > 1.0 && tp.boostBar > 0.3;
        if (lean && tune.lambdaProtection) { protectedBy = 'fuel'; boostCmd = Math.max(0, tp.boostBar - 0.12 - (actualLambda - lambdaTarget) * 3); continue; }
        if (knockLimit) { protectedBy = 'knock'; boostCmd = Math.max(0, tp.boostBar - 0.15); continue; }
        if (pass >= 1) break;
      }
      prevShaftRpm = tp.shaftRpm;
      prevHpShaftRpm = tp.hpShaftRpm || NaN;
      prevBoost = tp.boostBar;
      const actualBoost = tp.boostBar,
        spool = targetBoost > 0.05 ? clamp(actualBoost / targetBoost, 0, 1) : 1;
      prevSpoolFrac = spool;
      prevFuelKw = fd.deliveredKgS * hw.fuel.lhvMJkg * 1000;
      let torque = op.torqueNm * (1 - alsSpoolShare * 2.2);
      let spark = ignition.sparkQuality * (0.91 + assembly.sparkScore * 0.09);
      if (actualBoost > ignition.sparkBoostLimit) spark *= clamp(1 - (actualBoost - ignition.sparkBoostLimit) * 0.1, 0.7, 1);
      torque *= clamp(spark, 0.6, 1.02);
      if (spoolAssist.nitrousHp > 0) torque += ((spoolAssist.nitrousHp * 7023) / Math.max(2600, rpm)) * nitrousTaper;
      // Measurement repeatability of the dyno (load cell / roller), then pk (PS) from torque.
      torque *= baseDynoFactor;
      const rawHp = (torque * rpm) / 7023;
      const loss = dynoLossKw(state, rpm, rawHp / 1.359622, dynoGear);
      const wheelHp = Math.max(0, rawHp - loss.lossKw * 1.359622);
      const fuelDutyPct = Math.max(fd.dutyPct, fd.diDutyPct, fd.hpfpDutyPct, fd.mpiDutyPct);
      const railBar = fd.railBar ?? (hw.fuelSys.mpiPressureBar || 4);
      const turboLoadPct = Math.max(tp.shaftSpeedPct, tp.hpShaftPct || 0, 100 - tp.chokeMarginPct),
        shaftLimit = turboMap.maxShaftRpm,
        turboShaftRpm = tp.shaftRpm,
        empBar = tp.empBarAbs - baroBar;
      const iatC = tp.manifoldC;
      // Turbine-inlet temperature: engine-out gas plus any spool-assist energy released in the manifold.
      const egtC = tp.t3C,
        bmepBar = op.bmepBar;
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
        // Reported (corrected) engine power and torque; observed values and wheel power are logged too.
        hp: rawHp * corrFactor,
        kw: (rawHp / 1.359622) * corrFactor,
        torqueNm: torque * corrFactor,
        hpObserved: rawHp,
        torqueObservedNm: torque,
        wheelHp: wheelHp * corrFactor,
        lossHp: loss.lossKw * 1.359622,
        rollerKmh: loss.speedKmh,
        boostBar: actualBoost,
        mapBarAbs: mapAbs,
        lambda: actualLambda,
        lambdaTarget,
        iatC,
        egtC,
        railBar,
        railTargetBar: fd.railTargetBar,
        fuelDutyPct,
        diDutyPct: fd.diDutyPct,
        hpfpDutyPct: fd.hpfpDutyPct,
        mpiDutyPct: fd.mpiDutyPct,
        diPulseMs: fd.diPulseMs,
        fuelLimitedBy: fd.limitedBy,
        fuelShortfallPct: fd.shortfallPct,
        fuelGps: fd.deliveredKgS * 1000,
        bsfcGkWh: op.bsfcGkWh,
        ethanolPct: hw.ethanolPct,
        turboLoadPct,
        turboShaftRpm,
        shaftLimitRpm: shaftLimit,
        empBar,
        bmepBar,
        imepBar: op.imepBar,
        pmepBar: op.pmepBar,
        fmepBar: op.fmepBar,
        pMaxBar: op.pMaxBar,
        ca50Deg: op.ca50Deg,
        burn1090Deg: op.burn1090Deg,
        sparkDeg: op.sparkDeg,
        sparkCmdDeg: sparkCmd,
        mbtDeg: op.mbtDeg,
        klsaDeg: op.klsaDeg,
        knockRetardDeg: op.knockRetardDeg,
        knockIndex: op.knockIndex,
        octaneIndex: op.octaneIndex,
        camAdvanceDeg: camDeg,
        residualPct: op.residualFrac * 100,
        meanPistonSpeed,
        // Knock index at the actual spark: 1.0 = end gas auto-ignites before the flame arrives.
        knockRisk: op.knockIndex,
        oilTempC,
        oilPressureBar,
        oilFilmRisk,
        oilAerationPct,
        spoolPct: spool * 100,
        airflowLbMin: tp.massFlowLbMin,
        boostTargetBar: targetBoost,
        boostLimitedBy: protectedBy ? `${protectedBy}-protection` : tp.limitedBy,
        shaftSpeedPct: tp.shaftSpeedPct,
        hpShaftPct: tp.hpShaftPct || 0,
        prLp: tp.prLp || tp.pressureRatio,
        prHp: tp.prHp || 1,
        interstageBar: tp.interstageBarAbs ? tp.interstageBarAbs - baroBar : 0,
        compoundStage: tp.compoundStage || '',
        compressorPr: tp.pressureRatio,
        correctedFlowLbMin: tp.correctedFlowLbMin,
        compressorEff: tp.compressorEff,
        compressorOutC: tp.compressorOutC,
        surgeMarginPct: tp.surgeMarginPct,
        chokeMarginPct: tp.chokeMarginPct,
        surge: tp.surge,
        wastegatePct: tp.wastegatePct,
        hpBypassPct: tp.hpBypassPct ?? 0,
        turbineKw: tp.turbineKw,
        compressorKw: tp.compressorKw,
        volumetricEff: op.ve
      };
      point.tS = (rpm - DYNO_START_RPM) / ramp;
      // Logged channels are stored at 3 decimals (well beyond a real dyno's resolution) to keep saves small.
      for (const k of Object.keys(point)) if (typeof point[k] === 'number') point[k] = round(point[k], 3);
      curve.push(point);
      // Mechanical limits see what the engine really produced, not the corrected figure.
      const event = criticalFailure({ ...point, hp: rawHp, torqueNm: torque }, {
        tune,
        mechanicalHpLimit,
        componentTorqueLimit,
        componentRpmLimit,
        rpmLimiter: rpmChain.weakest,
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
    const compound = compoundHp(state);
    addWarning(warnings, compound && !compound.valid, compound ? `${compound.reason} De compound werkt zo niet; de HP-turbo staat uit.` : '', 'danger', 'turbo');
    addWarning(
      warnings,
      Math.round(Number(tune.revLimitRpm) / 100) * 100 > revLimit,
      `${ecu.name} kan maximaal ${revLimit} rpm aansturen: de begrenzer staat hoger (${Math.round(Number(tune.revLimitRpm))} rpm) en wordt afgekapt.`,
      'warn',
      'ecu'
    );
    addWarning(
      warnings,
      rpmChain.weakest.rpm * 0.98 < revLimit,
      `Toerengrens: ${rpmChain.weakest.name} (${CATEGORY_MAP[rpmChain.weakest.category].label}) is gemaakt voor ~${Math.round(rpmChain.weakest.rpm)} rpm, de begrenzer staat op ${revLimit} rpm.`,
      rpmChain.weakest.rpm * 1.04 < revLimit ? 'danger' : 'warn',
      'motor'
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
        [`Toerental (${CATEGORY_MAP[rpmChain.weakest.category].label})`, rpmRatio],
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
      abortLimitCategory: abort && abort.limitCategory ? abort.limitCategory : null,
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
      correction: { standard: correction, label: DYNO_CORRECTIONS[correction].label, factor: round(corrFactor, 4) },
      peakWheelHp: quotePeak && curve.length ? Math.max(...curve.map(p => p.wheelHp)) : null,
      soakK,
      pullIndex: Number(options.pullIndex) || 0,
      measuredAt: new Date().toISOString()
    };
  }

  // Applies a finished (completed or aborted) pull to the canonical state:
  // it becomes the active measurement, and its sample-derived wear/damage is
  // added. Returns a new normalized state.
  // Heat soak between pulls: each pull leaves heat in the intercooler core and intake (more with little fan
  // air); it decays with a time constant of a few minutes of fan running.
  function dynoSoakAt(inputState, nowMs = Date.now()) {
    const th = inputState.dynoThermal || { soakK: 0, at: 0 };
    const fan = clamp(Number(inputState.dynoConfig?.fanSpeedPct || 85) / 100, 0.25, 1);
    const dtS = Math.max(0, (nowMs - (th.at || 0)) / 1000);
    return (th.soakK || 0) * Math.exp(-dtS / (150 + 250 * fan));
  }
  function advanceDynoThermal(inputState, result, nowMs = Date.now()) {
    const fan = clamp(Number(inputState.dynoConfig?.fanSpeedPct || 85) / 100, 0.25, 1);
    const durationS = Number(result?.wear?.durationS) || (result?.samples?.length || 0) * (100 / (inputState.dynoConfig?.rampRpmPerSec || 550));
    const peakKw = Number(result?.peakHp || 0) / 1.36;
    const add = durationS * (0.12 + peakKw / 1600) * (1.3 - 0.8 * fan);
    return { soakK: round(clamp(dynoSoakAt(inputState, nowMs) + add, 0, 45), 2), at: nowMs };
  }
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
    if (result.sampleCount > 0) state.dynoThermal = advanceDynoThermal(state, result, options.nowMs ?? Date.now());
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
  // Race mass: vehicle base weight (OEM parts, incl. driver and fluids) plus drivetrain layout, every selected
  // part's mass difference versus OEM (block, oiling, turbo, ice tank, gearbox, ...) and rotating wheel mass.
  function buildMassKg(state) {
    const vehicle = state.vehicle;
    const c = compoundHp(state);
    const parts = CATEGORIES.reduce((sum, cat) => sum + Number(getPart(state, cat.id)?.massDeltaKg || 0), 0) + (c ? COMPOUND_KIT.massKg + Number(c.item.massDeltaKg || 0) : 0);
    const wheelMassPenalty = Math.max(0, Number(vehicle.wheelMassKg || 0) - 7.5) * 4 * 1.35;
    return Math.max(750, Number(vehicle.massKg || 1350) + Number(DRIVETRAINS[vehicle.drivetrain]?.mass || 0) + parts + wheelMassPenalty);
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
      // the same temperature window the vehicle model uses (TYRE optC/windowC)
      tempFactor = tyreTempFactor(TYRE[tire.id] || TYRE.uhp, tireTemp);
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

  // Quarter mile on the realtime vehicle model with the automatic driver (quick pass, legacy callers).
  // The game rule stays: a completed pull for the current build is required.
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
    const vehicle = state.vehicle, grip = gripFactor(vehicle);
    const r = simulateRaceRun(state, { reactionTime: Number.isFinite(config.reactionTime) ? config.reactionTime : 0.09, tractionControl: state.tune.tractionControl !== false, driverSkill: config.driverSkill ?? 0.9 });
    return {
      ...r,
      tireSize: `${vehicle.tireWidthMm}/${vehicle.aspectRatio} R${vehicle.rimDiameterIn}`,
      wheelSpec: `${vehicle.rimDiameterIn}×${Number(vehicle.rimWidthIn).toFixed(1)} in`,
      tireDiameterMm: grip.geometry.diameterMm,
      setup: {
        mu: (TYRE[vehicle.tireCompound] || TYRE.uhp)[vehicle.preparedTrack ? 'muPrep' : 'mu'],
        pressurePenalty: grip.pressurePenalty,
        driveLoss: (DRIVETRAINS[vehicle.drivetrain] || DRIVETRAINS.FWD).loss,
        tireTempC: grip.tireTempC,
        airDensityKgM3: airDensity(vehicle),
        densityAltitudeM: densityAltitude(vehicle),
        headwindKmh: vehicle.headwindKmh,
        shiftRpm: r.shiftRpms?.[0]
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
    street: { targetRpm: 4000, targetBoostBar: 0.9, retardDeg: 18, extraFuelPct: 10, bypassPct: 10, aggressiveness: 40, maxEgtC: 980, maxShaftPct: 90, timeoutS: 4, cooldownS: 6 },
    rally: { targetRpm: 4300, targetBoostBar: 1.3, retardDeg: 28, extraFuelPct: 18, bypassPct: 18, aggressiveness: 70, maxEgtC: 1050, maxShaftPct: 94, timeoutS: 30, cooldownS: 5 },
    drag: { targetRpm: 4600, targetBoostBar: 1.8, retardDeg: 34, extraFuelPct: 24, bypassPct: 24, aggressiveness: 90, maxEgtC: 1100, maxShaftPct: 97, timeoutS: 15, cooldownS: 8 }
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
    timeoutS: [0.5, 60],
    cooldownS: [0, 30]
  });
  function defaultAntiLag() {
    return { mode: 'off', ...ANTI_LAG_PRESETS.street };
  }
  // What the installed ECU and bypass hardware allow.
  function antiLagCapability(inputState) {
    const s = normalizeState(inputState, { noEcu: true }),
      ecu = getPart(s, 'ecu'),
      spool = getPart(s, 'spool');
    const ecuLevel = ecu.id === 'med17' ? 'none' : ecu.id === 'custom_med17' ? 'limited' : 'full';
    const bypassMaxPct = spool.id === 'hard_als' ? 32 : spool.id === 'mild_als' ? 20 : 10;
    return { ecuLevel, ecuName: ecu.name, bypassMaxPct, maxAggressiveness: ecuLevel === 'limited' ? 45 : ecuLevel === 'none' ? 0 : 100, flatShift: ecuLevel !== 'none' };
  }
  function resolveAntiLag(inputState) {
    const s = normalizeState(inputState, { noEcu: true }),
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
  // ---- Engine map for realtime use (race, staging, rival) --------------------------------------
  // The combustion model evaluated once per build over rpm x MAP with the ECU's spark (incl. knock control),
  // lambda and cam tables, at a reference charge temperature and exhaust pressure equal to MAP. At runtime
  // the torque is corrected for the actual charge density and for the pumping work of the actual exhaust
  // pressure (both exact in the mean-value sense), so the race runs on the same physics as the dyno.
  const ENGINE_MAP_REF_K = 318.15;
  const engineMapCache = new Map();
  function buildEngineMap(inputState) {
    const state = normalizeState(inputState);
    const key = engineSignature(state);
    if (engineMapCache.has(key)) return engineMapCache.get(key);
    const hw = engineHardware(state), ecuCal = state.tune.ecu, ecuPart = getPart(state, 'ecu'), sensors = getPart(state, 'sensors');
    const revLimit = effectiveRevLimit(state);
    const rpmAxis = [700, 1000];
    for (let r = 1500; r <= revLimit + 500; r += 500) rpmAxis.push(r);
    const maxMap = Math.max(1.6, ...ecuCal.boost.flat()) + 1.013 + 0.6;
    const mapAxis = [0.3, 0.5, 0.7, 0.9, 1.0];
    for (let m = 1.25; m <= maxMap + 1e-9; m += 0.25) mapAxis.push(round(m, 2));
    const kc = knockControlFor(state, ecuPart, sensors);
    const grid = mapAxis.map(mapAbs => rpmAxis.map(rpm => {
      const lambda = ecuCell(ecuCal, 'lambda', Math.max(1, mapAbs), rpm);
      const cam = state.tune.vvtEnabled === false ? 0 : ecuCell(ecuCal, 'cam', Math.max(1, mapAbs), rpm);
      const spark = ecuCell(ecuCal, 'spark', Math.max(1, mapAbs), rpm) + Number(ecuCal.sparkTrimDeg || 0) + Number(state.tune.ignitionTrimDeg || 0);
      const water = hw.wmi && mapAbs > 1.8 ? (hw.wmi.ratio * 0.5) / (hw.fuel.afrSt * lambda) : 0;
      const op = Engine.operatingPoint({
        geo: hw.geo, head: hw.head, rpm, mapBarAbs: mapAbs, manifoldK: ENGINE_MAP_REF_K, empBarAbs: mapAbs, lambda, fuel: hw.fuel, sparkCmdDeg: spark,
        camAdvanceDeg: cam, twinScroll: hw.twinScroll, exhaustK: 1100, waterPerAir: water, veScale: hw.veScale, viscosityFactor: hw.viscosityFactor,
        extraFmepBar: hw.extraFmepBar, knockControl: kc, stepDeg: 3, mbtDeg: 50
      });
      const vd = hw.geo.vd * hw.geo.cyl;
      return {
        torqueNm: op.torqueNm,
        frictionNm: ((op.fmepBar + (op.pmepBar - (mapAbs - mapAbs))) * 1e5 * vd) / (4 * Math.PI),
        exhaustK: op.exhaustK,
        knockIndex: op.knockIndex,
        sparkDeg: op.sparkDeg,
        knockRetardDeg: op.knockRetardDeg,
        lambda,
        airKgS: op.airKgS,
        fuelKgS: op.fuelKgS
      };
    }));
    const em = { key, rpmAxis, mapAxis, grid, vdM3: hw.geo.vd * hw.geo.cyl, revLimit, hw, maxMap };
    engineMapCache.set(key, em);
    if (engineMapCache.size > 12) engineMapCache.delete(engineMapCache.keys().next().value);
    return em;
  }
  function engineMapLookup(em, rpm, mapAbs, manifoldK = ENGINE_MAP_REF_K, empAbs = mapAbs) {
    const [r0, r1, fr] = axisPos(em.mapAxis, mapAbs), [c0, c1, fc] = axisPos(em.rpmAxis, rpm);
    const g = em.grid, mix = k => (g[r0][c0][k] * (1 - fc) + g[r0][c1][k] * fc) * (1 - fr) + (g[r1][c0][k] * (1 - fc) + g[r1][c1][k] * fc) * fr;
    const base = mix('torqueNm'), fric = mix('frictionNm');
    // Charge density scales the indicated torque; exhaust pressure above MAP costs pumping work.
    const indicated = (base + fric) * (ENGINE_MAP_REF_K / Math.max(250, manifoldK));
    const pumpingNm = ((empAbs - mapAbs) * 1e5 * em.vdM3) / (4 * Math.PI);
    return {
      torqueNm: indicated - fric - pumpingNm,
      frictionNm: fric,
      exhaustK: mix('exhaustK'),
      knockIndex: mix('knockIndex'),
      sparkDeg: mix('sparkDeg'),
      knockRetardDeg: mix('knockRetardDeg'),
      lambda: mix('lambda'),
      airKgS: mix('airKgS') * (ENGINE_MAP_REF_K / Math.max(250, manifoldK)),
      fuelKgS: mix('fuelKgS') * (ENGINE_MAP_REF_K / Math.max(250, manifoldK))
    };
  }

  function createTurboRuntime(inputState, options = {}) {
    const state = normalizeState(inputState);
    const em = options.engineMap || buildEngineMap(state), hw = em.hw;
    const turbo = getPart(state, 'turbo'),
      air = getPart(state, 'air'),
      exhaust = getPart(state, 'exhaust'),
      boostControl = getPart(state, 'boostControl'),
      fuel = getPart(state, 'fuel'),
      map = Turbo.getMap(turbo.id),
      hpMap = compoundHpMap(state),
      matchBoostRt = (ctx, target) => (hpMap ? Turbo.matchCompound(ctx, hpMap, target) : Turbo.matchEngine(ctx, target)),
      chargeAir = Turbo.DATA.chargeAir[air.id] || Turbo.DATA.chargeAir.oem_air,
      exhaustSystem = Turbo.DATA.exhaust[exhaust.id] || Turbo.DATA.exhaust.oem_exhaust,
      wastegate = Turbo.DATA.wastegate[boostControl.id] || Turbo.DATA.wastegate.oem_internal,
      stoichAfr = hw.fuel.afrSt,
      vehicle = state.vehicle,
      baroBar = 1.01325 * Math.exp(-Math.max(-200, Number(vehicle.altitudeM || 0)) / 8434.5),
      ambientK = Number(vehicle.ambientTempC ?? 20) + 273.15,
      als = resolveAntiLag(state),
      p = als.params,
      ecuCal = state.tune.ecu,
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
      empRatio: 1.2,
      manifoldK: ambientK + 10,
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
      const rpm = clamp(Number(input.rpm) || 900, 700, em.revLimit + 400),
        throttle = clamp(Number(input.throttle ?? 1), 0, 1),
        twoStep = !!input.twoStep,
        gearIndex = clamp(Math.round(Number(input.gearIndex) || 0), 0, 5),
        // Boost the ECU asks for in this gear at this rpm (the table the dyno also uses).
        bSteady = ecuBoostTarget(ecuCal, gearIndex, rpm),
        cell = engineMapLookup(em, rpm, baroBar + rt.boostBar),
        idleScale = 1,
        manSteadyK = rt.manifoldK;
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
      // Engine airflow from the breathing model (VE, manifold state, exhaust pressure), scaled by throttle.
      const airflowAt = (B, tK) =>
        Engine.airflowKgS({ geo: hw.geo, head: hw.head, rpm, mapBarAbs: baroBar + B, manifoldK: tK, empBarAbs: (baroBar + B) * rt.empRatio, exhaustK: cell.exhaustK,
          camAdvanceDeg: state.tune.vvtEnabled === false ? 0 : ecuCell(ecuCal, 'cam', Math.max(1, baroBar + B), rpm), twinScroll: hw.twinScroll, veScale: hw.veScale }) * airFactor;
      const load = Math.max(throttle, twoStep ? 0.7 : 0);
      const exhaustTempK = B => 273.15 + 600 + (engineMapLookup(em, rpm, baroBar + B).exhaustK - 273.15 - 600) * (0.3 + 0.7 * load);
      const chargeCooling = (t2K, flowLb) => {
        const eps = (0.55 + 0.45 * air.cooling) * clamp(1 - 0.35 * Math.max(0, flowLb / chargeAir.refFlowLbMin - 1), 0.4, 1);
        return ambientK + 2 + (t2K - ambientK) * (1 - eps);
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
        extraExhaustKw = Math.min(fuelKgS * 43000 * burnable * alsFraction, alsKwCap) + fuelKgS * 43000 * burnable * twoStepFraction + Math.max(0, Number(input.extraExhaustKw) || 0);
      if (rt.alsActive && fuelKgS * 43000 * burnable * alsFraction > alsKwCap + 1e-9) limitedBy = 'EGT-limiet';
      const target = rt.alsActive ? p.targetBoostBar : Number.isFinite(input.targetBoostBar) ? input.targetBoostBar : bSteady * (twoStep ? 0.8 : 1) * throttle;
      const tp = matchBoostRt(
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
          extraExhaustKw,
          extraExhaustKgS: Math.max(0, Number(input.extraExhaustKgS) || 0)
        },
        { targetBoostBar: Math.max(0, target), prevShaftRpm: rt.shaftRpm, prevHpShaftRpm: rt.hpShaftRpm, dtS: dt }
      );
      rt.alsLimitedBy = rt.alsLockoutS > 0 ? 'cooldown' : limitedBy;
      // Spool-up is inertia-limited inside matchEngine; spool-down is limited by the
      // rotor inertia against the compressor load, while boost bleeds off quickly.
      const inertiaScale = Math.pow(map.inertia / 6e-5, 0.3);
      if (tp.shaftRpm < rt.shaftRpm) rt.shaftRpm += (tp.shaftRpm - rt.shaftRpm) * (1 - Math.exp(-dt / (0.9 * inertiaScale)));
      else rt.shaftRpm = tp.shaftRpm;
      rt.boostBar += (tp.boostBar - rt.boostBar) * (tp.boostBar < rt.boostBar ? 1 - Math.exp(-dt / 0.12) : 1);
      // compound: the HP stage's rotor keeps its own speed (it coasts down once the bypass opens)
      rt.hpShaftRpm = tp.hpShaftRpm ? tp.hpShaftRpm : (rt.hpShaftRpm || 0) * Math.exp(-dt / 0.8);
      rt.compoundStage = tp.compoundStage || '';
      rt.egtC += (tp.t3C - rt.egtC) * (1 - Math.exp(-dt / 0.35));
      rt.empBar = tp.empBarAbs - baroBar;
      rt.empRatio = clamp(tp.empBarAbs / Math.max(0.3, baroBar + tp.boostBar), 0.6, 4);
      rt.manifoldK += (tp.manifoldC + 273.15 - rt.manifoldK) * (1 - Math.exp(-dt / 0.6));
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
      // Bang rate: firing frequency (4 cylinders, 4-stroke: rpm / 30) times the fraction of events the ALS
      // strategy cuts/retards into the manifold. It follows the strategy, not the boost-hold trim k, so the
      // crackle keeps going while the controller only holds boost.
      const popRateHz = rt.alsActive && flame.visible ? (rpm / 30) * (0.04 + 0.12 * aggr) * (0.6 + 0.4 * k) : 0;
      // Consecutive flames overlap once rate x flame duration > 1: the tailpipe flame is then continuous.
      const flameSustain = popRateHz > 0 ? clamp((popRateHz * flame.durationMs) / 1000 - 0.6, 0, 1) * flame.intensity : 0;
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
        popRateHz,
        flameSustain,
        steadyBoostBar: bSteady,
        manifoldK: rt.manifoldK,
        mapBarAbs: baroBar + rt.boostBar,
        empBarAbs: baroBar + rt.empBar,
        baroBar
      };
      return rt.last;
    }
    return { state: rt, als, map, engineMap: em, baroBar, step };
  }

  // ---- Vehicle / drivetrain model for the race (player and rival alike) ----------------------------
  // 1 ms integration of engine speed, clutch, driven-wheel speed, tyre slip and vehicle speed:
  //   engine:  I_e dw_e/dt = T_engine - T_clutch
  //   clutch:  slips with T = capacity x engagement (x fade) while w_e != R w_w, locks otherwise
  //   wheels:  I_w dw_w/dt = T_clutch R eta - Fx r
  //   tyre:    Fx = mu Fz MF(kappa), kappa from a relaxation-length slip model (valid from standstill)
  //   body:    m dv/dt = Fx - aero - rolling; load transfer m a h / L follows with a suspension lag.
  // Shift phases per gearbox type: H-pattern (clutch, synchro), DSG (clutch-to-clutch handover),
  // sequential and dog boxes (ignition cut, dog engagement). Drivetrain data are modeled values.
  const DRIVELINE = Object.freeze({
    oem_6mt: { type: 'manual', clutchNm: 430, clutchKg: 5.5, engageS: 0.14, launchDumpS: 0.2 },
    randy_o2q: { type: 'manual', clutchNm: 780, clutchKg: 6.0, engageS: 0.12, launchDumpS: 0.16 },
    built_6mt: { type: 'manual', clutchNm: 900, clutchKg: 6.5, engageS: 0.1, launchDumpS: 0.14 },
    dq250: { type: 'dsg', clutchNm: 820, clutchKg: 7.0, engageS: 0.08, launchDumpS: 0.35 },
    sequential: { type: 'sequential', clutchNm: 1150, clutchKg: 5.0, engageS: 0.05, launchDumpS: 0.12 },
    liberty: { type: 'dog', clutchNm: 1700, clutchKg: 6.5, engageS: 0.04, launchDumpS: 0.1 },
    promod_5speed: { type: 'dog', clutchNm: 2500, clutchKg: 7.5, engageS: 0.035, launchDumpS: 0.1 }
  });
  // Peak friction coefficient (dry asphalt / prepared drag strip), slip ratio at the peak and
  // optimum grip temperature (tyreGripTempC) per compound. Drag compounds work best at ~50-65 C at the
  // launch (the 120-150 F that drag tyre makers quote); street tyres lower. Modeled values.
  const TYRE = Object.freeze({
    street: { mu: 1.0, muPrep: 1.12, peakSlip: 0.1, optC: 40, windowC: 60, relaxM: 0.35 },
    uhp: { mu: 1.1, muPrep: 1.28, peakSlip: 0.09, optC: 48, windowC: 58, relaxM: 0.32 },
    semislick: { mu: 1.22, muPrep: 1.52, peakSlip: 0.1, optC: 60, windowC: 52, relaxM: 0.3 },
    drag_radial: { mu: 1.25, muPrep: 1.95, peakSlip: 0.12, optC: 55, windowC: 45, relaxM: 0.3 },
    slick: { mu: 1.2, muPrep: 2.25, peakSlip: 0.15, optC: 60, windowC: 40, relaxM: 0.35 },
    pro_radial: { mu: 1.3, muPrep: 2.1, peakSlip: 0.12, optC: 58, windowC: 42, relaxM: 0.3 }
  });
  const ENGINE_INERTIA = 0.19; // kg m^2, crank + flywheel + clutch
  // Wheel hop (OEM parts): the drive shafts (~14 kNm/rad together) in series with the engine/gearbox roll
  // on hydro mounts and a rubber pendulum mount (~13.5 kNm/rad at the axle), with the driven wheels on it:
  // a torsional mode of ~8-10 Hz, lightly damped (5 %). Modeled values; the mounts parts scale the mount
  // stiffness and damping. floorRad: the twist the road texture always excites.
  const HOP = Object.freeze({ shaftNmRad: 14000, mountNmRad: 13500, dampingRatio: 0.05, floorRad: 0.002 });
  function magicFormula(kappa, peakSlip) {
    // Shape factor 1.45: a spinning tyre keeps ~75 % of its peak force (sin(C pi/2)), as measured tyres do.
    const C = 1.45, E = -0.2, B = 1.45 / peakSlip;
    const bk = B * kappa;
    return Math.sin(C * Math.atan(bk - E * (bk - Math.atan(bk))));
  }
  function tyreFor(state, startTempC) {
    const v = state.vehicle, t = TYRE[v.tireCompound] || TYRE.uhp, g = gripFactor(v);
    const base = v.preparedTrack ? t.muPrep : t.mu;
    // pressure, width, sidewall and fitment from the existing tyre setup model (not its base mu)
    const setup = g.pressurePenalty * g.widthFactor * g.sidewallFactor * g.fitmentScore;
    return { ...t, base, setup, tempC: Number.isFinite(startTempC) ? startTempC : g.tireTempC, rolling: g.tire.rolling, geometry: g.geometry };
  }
  // Grip versus tyre temperature (the one curve every grip calculation uses): full grip at the compound's
  // optimum, falling off quadratically either side, never below 62 % (cold or greasy rubber).
  function tyreTempFactor(ty, tempC) {
    return clamp(1 - Math.pow((tempC - ty.optC) / ty.windowC, 2) * 0.35, 0.62, 1);
  }
  function tyreMu(ty, tempC, fzRatio) {
    const temp = tyreTempFactor(ty, tempC);
    const load = clamp(1 - 0.1 * (fzRatio - 1), 0.8, 1.1); // load sensitivity
    return ty.base * ty.setup * temp * load;
  }

  // ---- Tyre temperatures ---------------------------------------------------------------------------
  // Two nodes per driven tyre: the tread surface (the thin rubber skin the road sees and a pyrometer
  // reads, ~0.25 kg) and the tread bulk under it (~3 kg of rubber and belts). Heat comes from the slip power
  // at the contact patch (about 70 % goes into the tyre, the rest into the track) and from rolling
  // hysteresis in the bulk. The surface loses heat into the bulk, to the air by convection (more with
  // speed) and into the track through the contact patch; the bulk loses a little to the air. Grip follows
  // a blend: the skin decides the friction, the bulk how long it lasts. Modeled values (no tyre data).
  const TYRE_THERMAL = Object.freeze({
    surfaceJK: 400,        // heat capacity of the surface skin per tyre, J/K (~0.25 kg x ~1700 J/kg K)
    bulkJK: 5500,          // tread bulk per tyre, J/K
    surfaceToBulkWK: 160,  // conduction skin -> bulk, W/K (time constant ~2.5 s)
    contactWK: 20,         // skin -> track through the contact patch, W/K
    areaM2: 0.22,          // tread band exposed to the air per tyre
    bulkAirWK: 3,          // bulk/sidewall -> air, W/K
    intoTyre: 0.7          // share of the slip power that heats the tyre
  });
  function tyreConvectionW(speedMs) { return (12 + 9 * Math.pow(Math.max(0, speedMs), 0.75)) * TYRE_THERMAL.areaM2; }
  function makeTyreThermal(start) {
    const c = Number.isFinite(start) ? start : 25;
    return { surfaceC: c, bulkC: c };
  }
  // One step of h seconds. slipPowerW: |Fx x slip speed| of the driven axle; tyres: number of driven tyres.
  function tyreThermalStep(th, h, { slipPowerW = 0, tyres = 2, speedMs = 0, ambientC = 20, trackC = 25, rollingW = 0 } = {}) {
    const T = TYRE_THERMAL, n = Math.max(1, tyres);
    const qIn = (Math.max(0, slipPowerW) * T.intoTyre) / n;
    const qSb = T.surfaceToBulkWK * (th.surfaceC - th.bulkC);
    const qAir = tyreConvectionW(speedMs) * (th.surfaceC - ambientC);
    const qTrack = T.contactWK * (th.surfaceC - trackC);
    const qBulkAir = T.bulkAirWK * (th.bulkC - ambientC);
    th.surfaceC += ((qIn - qSb - qAir - qTrack) / T.surfaceJK) * h;
    th.bulkC += ((qSb + Math.max(0, rollingW) / n - qBulkAir) / T.bulkJK) * h;
    return th;
  }
  // The temperature the grip curve uses.
  function tyreGripTempC(th) { return 0.6 * th.surfaceC + 0.4 * th.bulkC; }
  // Cool (or warm) the tyres for `seconds` at a standstill or rolling slowly (staging), returning a copy.
  function tyreThermalAfter(th, seconds, env = {}) {
    const out = { ...th };
    for (let t = 0; t < seconds; t += 0.05) tyreThermalStep(out, 0.05, env);
    return out;
  }
  // opts: { launchRpm, reactionTime, engineMap, turbo (runtime), driver: 'auto'|'player', shiftRpm[] }
  function createRaceRuntime(inputState, opts = {}) {
    const state = normalizeState(inputState);
    const em = opts.engineMap || buildEngineMap(state);
    const turbo = opts.turbo || createTurboRuntime(state, { engineMap: em });
    const trans = getPart(state, 'transmission'), dl = DRIVELINE[trans.id] || DRIVELINE.oem_6mt;
    const drive = DRIVETRAINS[state.vehicle.drivetrain] || DRIVETRAINS.FWD;
    const ty = tyreFor(state, opts.tyreTempC);
    // Tyre temperatures carry over from the burnout and staging when given; otherwise a uniform tyre.
    const th = opts.tyreThermal ? { surfaceC: Number(opts.tyreThermal.surfaceC), bulkC: Number(opts.tyreThermal.bulkC) } : makeTyreThermal(ty.tempC);
    const drivenTyres = state.vehicle.drivetrain === 'AWD' ? 4 : 2;
    const ambientC = Number(state.vehicle.ambientTempC ?? 20), trackC = Number(state.vehicle.trackTempC ?? 28);
    const r = ty.geometry.radiusM, mass = buildMassKg(state), g = 9.80665;
    const wheelbase = Number(state.vehicle.wheelbaseM || 2.58), cgh = Number(state.vehicle.cgHeightM || 0.51);
    // Steady load transfer is exactly m a h / L; the suspension setting decides how fast it builds up (pitch).
    const transferLagS = clamp(0.2 - (Number(state.vehicle.suspensionTransferPct || 60) / 100) * 0.14, 0.05, 0.2);
    const eta = trans.transEfficiency * (1 - drive.loss * 0.34);
    const wheelKg = Number(state.vehicle.wheelMassKg || 12.4) + 10; // rim + tyre
    const wheelI = wheelKg * r * r * 0.75;
    const drivenI = (state.vehicle.drivetrain === 'AWD' ? 4 : 2) * wheelI + 0.25;
    const freeI = (state.vehicle.drivetrain === 'AWD' ? 0 : 2) * wheelI;
    const rho = airDensity(state.vehicle), cdA = Number(state.vehicle.cdA || 0.68), headwind = Math.max(-20, Number(state.vehicle.headwindKmh || 0)) / 3.6;
    const gears = trans.gearRatios, fd = trans.finalDrive, revLimit = em.revLimit;
    const launchRpm = clamp(Number(opts.launchRpm ?? state.tune.launchRpm ?? 4200), 1500, revLimit - 300);
    const tcTarget = opts.tractionControl ? ty.peakSlip * 1.25 : 0;
    const spoolPart = getPart(state, 'spool'), nitrousHp = Number(spoolPart.nitrousHp || 0);
    // Nitrous spool shot, same rule as on the dyno: armed from 3000 rpm, fading out as boost reaches target.
    const nitrousTaper = () => {
      if (!nitrousHp || !s.launched || s.shift) return 0;
      const snap = s.turboSnap || {}, target = Math.max(0.05, Number(snap.targetBoostBar || 0.05));
      return clamp((0.93 - Number(snap.boostBar || 0) / target) / 0.58, 0, 1) * clamp((rpm() - 3000) / 400, 0, 1) * clamp((revLimit - rpm() + 800) / 2200, 0, 1);
    };
    const staticDriven = state.vehicle.drivetrain === 'FWD' ? drive.frontStatic : state.vehicle.drivetrain === 'RWD' ? 1 - drive.frontStatic : 1;
    const kc = knockControlFor(state, getPart(state, 'ecu'), getPart(state, 'sensors'));
    const kit = getPart(state, 'nitrous');
    const sealing = getPart(state, 'sealing'), displacementM3 = engineGeometry(state).displacementCc * 1e-6;
    const nitrousRetardPer50 = clamp(Number(state.tune.nitrousRetardPer50 ?? 2), 0, 6);
    const fuelCapHp = getPart(state, 'fuelSystem').fuelSystemHp * getPart(state, 'fuel').fuelFlowFactor;
    // Wheel hop as the driveline's torsional mode. Its damping is the mounts' damping minus what the tyre
    // takes away: past its peak the tyre force falls as the slip rises (negative damping, stronger at low
    // speed where a small speed change is a big slip change), filtered by the tyre's relaxation length at
    // the mode frequency. When the tyre wins, the twist grows until it saturates: the wheels hop, traction
    // drops and the shafts see torque peaks. Stiffer, better damped mounts move the mode up and damp it.
    // How precisely the clutch torque is metered to the grip at the launch (1 = exactly the tyre's peak):
    // a slip-controlled launch control (full motorsport ECU) aims just past the peak for the best
    // acceleration, the DSG's launch control limits torque, a two-step without slip control or a driver
    // dumping the clutch on a stock ECU overshoot the grip. Past the peak the tyre can start to hop.
    const ecuLevel = antiLagCapability(state).ecuLevel;
    const launchMetering = dl.type === 'dsg' ? 1.04 : ecuLevel === 'full' ? 1.06 : ecuLevel === 'limited' ? 1.15 : 1.28;
    const mounts = getPart(state, 'mounts');
    const wheelsI = (state.vehicle.drivetrain === 'AWD' ? 4 : 2) * wheelI;
    const hopK = 1 / (1 / HOP.shaftNmRad + 1 / (HOP.mountNmRad * mounts.hopStiffness));
    const hopW = Math.sqrt(hopK / wheelsI), hopZm = HOP.dampingRatio * mounts.hopDamping;
    const s = {
      hopA: 0, hopTh: 0, hopThd: 0, hopPhase: 0, hopI: 0, hopRingS: 0, hopTin: 0, hopZs: 0.05, hopMaxI: 0, hopS: 0, hopZeta: hopZm, hopPeakNm: 0,
      headLiftS: 0, n2oRamp: 0, bottleKg: Number.isFinite(opts.bottleKg) ? opts.bottleKg : kit.bottleKg, bottleStartKg: Number.isFinite(opts.bottleKg) ? opts.bottleKg : kit.bottleKg, n2oShotS: 0, n2oMaxHp: 0, n2oLeanS: 0,
      knockAcc: 0, knockEvents: 0, knockNow: 0, kcRetardDeg: 0, kcMaxDeg: 0, knockDamage: 0,
      t: 0, x: 0, v: 0, a: 0, gear: 0, we: (launchRpm * Math.PI) / 30, ww: 0, kappa: 0, engage: 0, launched: false, launchT: 0,
      transfer: 0, tyreC: tyreGripTempC(th), clutchC: Number(opts.clutchTempC ?? 60), clutchJ: 0, shift: null, cut: false, limiterS: 0,
      fx: 0, wheelspin: 0, maxWheelspin: 0, torqueNm: 0, clutchNm: 0, slipRpm: 0, turboSnap: null, turboClock: 1, knockMax: 0, fuelG: 0, shiftLog: []
    };
    const ratio = () => gears[s.gear] * fd;
    const rpm = () => (s.we * 30) / Math.PI;
    function engineTorque(throttleOpen) {
      const snap = s.turboSnap;
      const mapAbs = snap ? snap.mapBarAbs : 1.0, tK = snap ? snap.manifoldK : ENGINE_MAP_REF_K, emp = snap ? snap.empBarAbs : mapAbs;
      const cell = engineMapLookup(em, rpm(), throttleOpen ? mapAbs : Math.min(mapAbs, 0.35), tK, throttleOpen ? emp : Math.min(emp, 1.1));
      s.knockMax = Math.max(s.knockMax, throttleOpen ? cell.knockIndex : 0);
      s.fuelG += throttleOpen ? cell.fuelKgS * 1000 * 0.001 : 0;
      return cell;
    }
    // Start the launch (tree green + reaction): the driver dumps the clutch / releases the launch control.
    function launch() { if (!s.launched) { s.launched = true; s.launchT = s.t; } }
    function requestShift() {
      if (s.shift || s.gear >= gears.length - 1 || !s.launched) return false;
      const typ = dl.type;
      const dur = typ === 'manual' ? Math.max(0.12, trans.shiftSeconds) : typ === 'dsg' ? Math.max(0.08, trans.shiftSeconds) : Math.max(0.03, trans.shiftSeconds);
      s.shift = { from: s.gear, to: s.gear + 1, t: 0, dur, type: typ, fromRpm: rpm() };
      s.shiftLog.push({ at: s.t, from: s.gear + 1, to: s.gear + 2, rpm: rpm() });
      return true;
    }
    function substep(h, input) {
      s.t += h;
      const typ = dl.type;
      // --- control state: clutch engagement, ignition cut, throttle
      let throttleOpen = input.throttle !== false, cut = false, clutchCmd = 1, flat = !!input.flatShift;
      if (!s.launched) {
        // staged: clutch open, two-step holds launch rpm with an ignition cut
        clutchCmd = 0;
        cut = rpm() >= launchRpm;
      } else {
        const since = s.t - s.launchT;
        clutchCmd = typ === 'dsg' ? clamp(since / dl.launchDumpS, 0, 1) : clamp(since / (input.clutchDumpS ?? dl.launchDumpS), 0, 1);
      }
      if (s.shift) {
        const sh = s.shift;
        sh.t += h;
        const f = sh.t / sh.dur;
        if (sh.type === 'manual') {
          // clutch out (20 %), gate + synchro (60 %), clutch in (20 %); throttle lifted unless flat-shifting
          clutchCmd = f < 0.2 ? 1 - f / 0.2 : f < 0.8 ? 0 : (f - 0.8) / 0.2;
          if (f >= 0.2 && s.gear === sh.from) s.gear = sh.to;
          if (f < 0.8) { if (flat) cut = true; else throttleOpen = false; }
        } else if (sh.type === 'dsg') {
          // clutch-to-clutch: the other clutch takes the torque, ignition retard pulls the engine down
          if (s.gear === sh.from) s.gear = sh.to;
          clutchCmd = 1;
          if (f < 0.7) cut = 'half';
        } else {
          // sequential / dog: short ignition cut, the dogs engage and force the engine speed
          cut = true;
          if (f >= 0.5 && s.gear === sh.from) {
            s.gear = sh.to;
            const iTot = ENGINE_INERTIA + drivenI / (ratio() * ratio());
            // dog engagement: engine and wheels meet at the momentum-conserving speed
            const wwNew = (ENGINE_INERTIA * s.we * ratio() + drivenI * s.ww) / (ENGINE_INERTIA * ratio() * ratio() + drivenI);
            s.clutchJ += 0.5 * ENGINE_INERTIA * (s.we * s.we - Math.pow(wwNew * ratio(), 2)) * 0.2;
            s.ww = wwNew; s.we = wwNew * ratio();
            void iTot;
          }
        }
        if (sh.t >= sh.dur) s.shift = null;
      }
      // rev limiter (fuel cut) with 150 rpm hysteresis
      if (rpm() >= revLimit) s.cut = true; else if (rpm() < revLimit - 150) s.cut = false;
      if (s.cut) { cut = true; s.limiterS += h; }
      s.engage += (clutchCmd - s.engage) * clamp(h / 0.015, 0, 1);
      // --- engine torque
      const cell = engineTorque(throttleOpen);
      // Pedal (driver) and traction control (ECU): both scale the positive engine torque.
      let pedal = clamp(input.pedal ?? 1, 0, 1);
      // While the clutch slips off the line the driver (or launch control) holds the engine near launch rpm.
      if (s.launched && !s.lockedOnce && s.gear === 0) pedal = Math.min(pedal, clamp(1 - (rpm() - launchRpm - 250) / 900, 0.25, 1));
      if (tcTarget && s.launched && s.v > 0.5) {
        const over = s.kappa - tcTarget;
        s.tc = clamp((s.tc ?? 1) - (over > 0 ? over * 40 * h : -2.5 * h), 0.25, 1);
        pedal = Math.min(pedal, s.tc);
      }
      let tEng = cell.torqueNm > 0 ? cell.torqueNm * pedal - cell.frictionNm * (1 - pedal) * 0.3 : cell.torqueNm;
      // Knock events: the map gives the end-gas knock index at the ECU's spark (1.0 = auto-ignition before
      // the flame arrives). The ECU map keeps a margin to that limit, so a build that runs at its map does
      // not knock; single cycles start to knock above ~0.97 (cycle-to-cycle variation) when conditions are
      // worse than the map assumed. Knock control pulls 1.5 deg per knocking cycle and gives it back at
      // 1 deg/s; each degree lowers the index ~2.3 % and costs ~1.2 % torque. Without knock control every
      // knocking cycle is a pressure spike for pistons, rings and head gasket.
      const firing = throttleOpen && !cut && s.launched;
      // Driver nitrous (the N2O button): the shot ramps in over the kit's progressive time, draws on the
      // bottle (~0.85 g/s per hp; delivery falls as the bottle empties) and adds the torque of its extra
      // oxygen. Its cylinder pressure raises the knock index; the ECU's nitrous retard (deg per 50 hp) takes
      // that back at the cost of base torque. A dry kit's fuel comes through the injectors: past their
      // capacity the mixture goes lean (more knock, and damage while it lasts).
      const n2oWant = kit.shotHp > 0 && !!input.nitrous && firing && rpm() > 2500 && s.bottleKg > 0.02;
      s.n2oRamp = n2oWant ? Math.min(1, s.n2oRamp + h / Math.max(0.05, kit.progressiveS || 0.05)) : Math.max(0, s.n2oRamp - h / 0.05);
      const bottleFactor = clamp(s.bottleKg / Math.max(0.1, kit.bottleKg * 0.12), 0, 1);
      const shotHp = kit.shotHp * s.n2oRamp * bottleFactor;
      let n2oKnock = 0, n2oRetard = 0;
      if (shotHp > 0.5) {
        s.bottleKg = Math.max(0, s.bottleKg - shotHp * 0.00085 * h);
        s.n2oShotS += h; s.n2oMaxHp = Math.max(s.n2oMaxHp, shotHp);
        n2oRetard = nitrousRetardPer50 * shotHp / 50;
        n2oKnock = 0.1 * shotHp / 100 - 0.023 * n2oRetard;
        if (kit.n2oType === 'dry') {
          const need = (cell.torqueNm * rpm()) / 7023 + shotHp, over = need / Math.max(50, fuelCapHp) - 1;
          if (over > 0) { n2oKnock += Math.min(0.5, over * 2); s.n2oLeanS += h; s.knockDamage += over * 0.8 * h; }
        }
      }
      const knockIdx = cell.knockIndex + n2oKnock - 0.023 * s.kcRetardDeg;
      s.knockNow = firing ? clamp((knockIdx - 0.97) / 0.25, 0, 1) * clamp(pedal, 0, 1) : 0;
      if (firing && s.knockNow > 0) {
        s.knockAcc += (rpm() / 30) * h * s.knockNow;
        while (s.knockAcc >= 1) {
          s.knockAcc -= 1; s.knockEvents++;
          if (kc.enabled) s.kcRetardDeg = Math.min(kc.maxRetardDeg, s.kcRetardDeg + 1.5);
          else s.knockDamage += 0.004 * (1 + Math.max(0, knockIdx - 1) * 4);
        }
      }
      s.kcRetardDeg = Math.max(0, s.kcRetardDeg - h);
      s.kcMaxDeg = Math.max(s.kcMaxDeg, s.kcRetardDeg);
      if (tEng > 0) tEng *= 1 - 0.012 * (s.kcRetardDeg + n2oRetard);
      if (shotHp > 0.5) tEng += (shotHp * 7023) / Math.max(2600, rpm());
      // Head lift: cylinder pressure (as BMEP) past the head gasket's clamp margin lifts the head; a head
      // welded to the block has no gasket to lift.
      if (firing && tEng > 0) {
        const bmep = (tEng * 4 * Math.PI) / (displacementM3 * 1e5);
        const over = bmep / (sealing.headClampBmep * 1.15) - 1;
        if (over > 0) { s.headLiftS += h; s.knockDamage += over * 6 * h; }
      }
      const n2o = throttleOpen ? nitrousTaper() * pedal : 0;
      if (n2o > 0) { tEng += ((nitrousHp * 7023) / Math.max(2600, rpm())) * n2o; s.n2oS = (s.n2oS || 0) + h; }
      if (cut === true) tEng = -cell.frictionNm * 0.6;
      else if (cut === 'half') tEng = tEng * 0.45;
      if (!throttleOpen) tEng = Math.min(tEng, -cell.frictionNm * 0.8);
      s.torqueNm = tEng;
      // --- tyre force
      const fzStatic = mass * g * staticDriven;
      const targetTransfer = (mass * s.a * cgh) / wheelbase;
      s.transfer += (targetTransfer - s.transfer) * clamp(h / transferLagS, 0, 1);
      const fz = clamp(state.vehicle.drivetrain === 'FWD' ? fzStatic - s.transfer : state.vehicle.drivetrain === 'RWD' ? fzStatic + s.transfer : fzStatic, mass * g * 0.15, mass * g);
      const slipV = s.ww * r - s.v;
      s.kappa += ((slipV - Math.abs(s.v) * s.kappa) / ty.relaxM) * h;
      s.kappa = clamp(s.kappa, -1, 3);
      const mu = tyreMu(ty, s.tyreC, fz / fzStatic);
      let fx = mu * fz * magicFormula(s.kappa, ty.peakSlip);
      if (s.launched) {
        const vRef = Math.max(s.v, 0.5), d = 0.01;
        const slope = (magicFormula(s.kappa + d, ty.peakSlip) - magicFormula(Math.max(0, s.kappa - d), ty.peakSlip)) / (s.kappa + d - Math.max(0, s.kappa - d));
        const cTyre = -slope * mu * fz * r * r / vRef;                          // Nms/rad at the wheel, <0 = damping
        // lag of the tyre force behind the slip at the mode frequency: the longitudinal relaxation length is
        // ~40 % of the (lateral-scale) one the slip model uses
        const atten = 1 / Math.sqrt(1 + Math.pow((hopW * ty.relaxM * 0.4) / vRef, 2));
        s.hopZeta = hopZm - (cTyre * atten) / (2 * Math.sqrt(hopK * wheelsI));
        // a hopping tyre spends part of each cycle unloaded and sliding: less mean traction
        fx *= 1 - 0.3 * s.hopI;
      }
      s.fx = fx;
      // --- clutch / driveline
      const R = ratio();
      let cap = dl.clutchNm * s.engage * clamp(1 - Math.max(0, s.clutchC - 250) / 220, 0.5, 1);
      const slip = s.we - R * s.ww;
      // Launch: the driver (or launch control) slips the clutch to hold the engine near launch rpm until the
      // wheels catch up; after the first lock-up the clutch is simply engaged.
      if (s.launched && !s.lockedOnce && s.gear === 0) {
        const wTarget = (launchRpm * Math.PI) / 30;
        // never more clutch torque than the tyres can put down at their peak slip (plus the wheels' spin-up)
        const overSlip = Math.max(0, s.kappa - ty.peakSlip) / ty.peakSlip;
        const traction = ((mu * fz * r) / (R * eta)) * (input.launchClutchFactor ?? launchMetering) * clamp(1 - 0.8 * overSlip, 0.5, 1);
        cap = Math.min(cap, Math.max(0, tEng + (ENGINE_INERTIA * (s.we - wTarget)) / 0.04), traction);
        if (Math.abs(slip) < 3 && s.v > 0.5 && s.kappa < ty.peakSlip * 1.5) s.lockedOnce = true;
      }
      const wheelLoadTorque = fx * r + ty.rolling * fz * r;
      let tClutch;
      const lockedAccel = (tEng * R * eta - wheelLoadTorque) / (drivenI + ENGINE_INERTIA * R * R);
      const lockedClutch = tEng - ENGINE_INERTIA * R * lockedAccel;
      if (Math.abs(slip) < 2 && Math.abs(lockedClutch) <= cap) {
        // locked: engine and wheels turn together
        s.ww = Math.max(0, s.ww + lockedAccel * h);
        s.we = s.ww * R;
        tClutch = lockedClutch;
      } else {
        tClutch = Math.sign(slip || 1) * cap;
        const we2 = s.we + ((tEng - tClutch) / ENGINE_INERTIA) * h;
        const ww2 = Math.max(0, s.ww + ((tClutch * R * eta - wheelLoadTorque) / drivenI) * h);
        // slip heat into the clutch
        s.clutchJ += Math.abs(tClutch * slip) * h;
        if (Math.sign(we2 - R * ww2) !== Math.sign(slip) && s.engage > 0.5) { s.ww = ww2; s.we = ww2 * R; }
        else { s.we = Math.max((650 * Math.PI) / 30, we2); s.ww = ww2; }
      }
      s.clutchNm = tClutch;
      s.slipRpm = ((s.we - R * s.ww) * 30) / Math.PI;
      if (s.launched) {
        // the torsional mode driven by the torque the clutch passes (launch dump, shifts); its deviation from
        // the static wind-up is the hop, limited where the tyre lets go completely (limit cycle)
        // the clutch disc's damper springs filter the torque the mode sees (~15 ms)
        s.hopTin += (tClutch * R * eta - s.hopTin) * clamp(h / 0.015, 0, 1);
        const tIn = s.hopTin;
        const acc2 = (tIn - hopK * s.hopTh - 2 * s.hopZeta * hopW * wheelsI * s.hopThd) / wheelsI;
        s.hopThd += acc2 * h;
        s.hopTh += s.hopThd * h;
        // amplitude of the oscillation from the twist rate (a torque step rings with amplitude dT/k); hop is
        // that oscillation while the tyre works at its limit, in units of 30 % of the tyre's traction torque
        const ref = Math.max(200, 0.3 * mu * fz * r) / hopK;
        // instantaneous amplitude of the oscillation about the static wind-up
        const dev = s.hopTh - tIn / hopK;
        const amp = Math.hypot(dev, s.hopThd / hopW);
        if (amp > 1.2 * ref) { const k = (1.2 * ref) / amp; s.hopTh = tIn / hopK + dev * k; s.hopThd *= k; } // tyre lets go: limit cycle
        s.hopA = Math.min(amp, 1.2 * ref);
        // a torque step always rings once (driveline shunt); hop is an oscillation that keeps going for more
        // than 1.5 periods while the tyre works at its limit
        const working = clamp((s.kappa / ty.peakSlip - 0.6) / 0.3, 0, 1);
        // ...and only while the tyre cancels (nearly) all the mounts' damping: a ring that dies out is shunt
        s.hopZs += (s.hopZeta - s.hopZs) * clamp(h / 0.1, 0, 1);
        s.hopRingS = s.hopA > 0.35 * ref && s.hopZs < 0.035 ? s.hopRingS + h : 0;
        const sustained = clamp((s.hopRingS * hopW / (2 * Math.PI) - 1.5) / 1, 0, 1);
        s.hopI = clamp(s.hopA / ref - 0.1, 0, 1) * working * sustained;
        s.hopMaxI = Math.max(s.hopMaxI, s.hopI);
        if (s.hopI > 0.25) s.hopS += h;
        s.hopPhase = dev / ref;
        s.hopPeakNm = Math.max(s.hopPeakNm, Math.abs(hopK * s.hopTh));
      }
      if (!s.launched) { s.ww = 0; s.v = 0; s.kappa = 0; }
      // clutch temperature: slip energy into the pressure/friction plates, slow cooling
      const heatCap = dl.clutchKg * 460;
      s.clutchC += (Math.abs(tClutch * (s.we - R * s.ww)) * h * 0.85) / heatCap - (s.clutchC - 60) * 0.004 * h;
      // tyre temperatures from the slip power at the contact patch, rolling hysteresis and cooling
      if (s.launched) tyreThermalStep(th, h, { slipPowerW: Math.abs(fx * slipV), tyres: drivenTyres, speedMs: s.v, ambientC, trackC, rollingW: ty.rolling * fz * s.v * 0.5 });
      s.tyreC = tyreGripTempC(th);
      // --- body
      const air = Math.max(0, s.v + headwind);
      const aero = 0.5 * rho * cdA * air * air, roll = ty.rolling * mass * g * (1 + s.v * 0.006);
      const acc = s.launched ? (fx - aero - roll) / (mass + freeI / (r * r)) : 0;
      s.a = clamp(acc, -2 * g, 3 * g);
      s.v = Math.max(0, s.v + s.a * h);
      s.x += s.v * h;
      // wheelspin = tyre slip ratio (0.1 = 10 %), from the relaxation model so it is defined from standstill
      s.wheelspin = s.launched ? clamp(s.kappa, 0, 5) : 0;
      s.maxWheelspin = Math.max(s.maxWheelspin, Math.min(1, s.wheelspin));
    }
    // One frame: the turbo runtime at its own rate, the mechanics in 1 ms steps.
    function step(dt, input = {}) {
      dt = clamp(Number(dt) || 0, 0, 0.2);
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(0.001, left);
        left -= h;
        s.turboClock += h;
        if (s.turboClock >= 0.008 || !s.turboSnap) {
          const flatShift = !!input.flatShift;
          const shifting = !!s.shift;
          s.turboSnap = turbo.step(s.turboClock, {
            // on the two-step the pedal is floored: the rev limiter's ignition cut holds the rpm and builds boost
            rpm: rpm(), throttle: s.launched ? (shifting && !flatShift && dl.type === 'manual' ? 0 : 1) : 1, twoStep: !s.launched,
            gearIndex: s.gear, alsRequest: !!input.alsRequest || (!s.launched && !!input.launchAls) || (shifting && !!input.rollingAls),
            targetBoostBar: !s.launched ? undefined : ecuBoostTarget(state.tune.ecu, s.gear, rpm()),
            extraExhaustKw: nitrousHp * 0.7457 * 0.9 * nitrousTaper(),
            extraExhaustKgS: (nitrousHp * 0.06 * nitrousTaper()) / Turbo.LBMIN_PER_KGS
          });
          s.turboClock = 0;
        }
        substep(h, input);
      }
      return point();
    }
    function point() {
      const snap = s.turboSnap || {};
      return {
        t: s.t, distanceM: s.x, speedKmh: s.v * 3.6, v: s.v, a: s.a, accelerationG: s.a / g, rpm: rpm(), gear: s.gear + 1, gearIndex: s.gear,
        wheelspinPct: Math.min(1, s.wheelspin) * 100, slipRatio: s.kappa, boostBar: Number(snap.boostBar || 0), shaftPct: Number(snap.shaftPct || 0),
        egtC: Number(snap.egtC || 0), torqueNm: s.torqueNm, clutchNm: s.clutchNm, clutchSlipRpm: s.slipRpm, clutchTempC: s.clutchC, tyreTempC: s.tyreC, tyreSurfaceC: th.surfaceC, tyreBulkC: th.bulkC,
        n2oHp: s.n2oRamp * kit.shotHp * clamp(s.bottleKg / Math.max(0.1, kit.bottleKg * 0.12), 0, 1), bottleKg: s.bottleKg, n2oArmed: kit.shotHp > 0,
        hop: s.hopI, hopOsc: clamp(s.hopPhase, -1.2, 1.2), hopHz: hopW / (2 * Math.PI), hopZeta: s.hopZeta, hopS: s.hopS,
        knockNow: s.knockNow, knockEvents: s.knockEvents, kcRetardDeg: s.kcRetardDeg, knockDamagePct: s.knockDamage,
        engage: s.engage, shifting: !!s.shift, limiter: s.cut, limiterS: s.limiterS, knockIndexMax: s.knockMax, fuelG: s.fuelG, launched: s.launched
      };
    }
    return { state: s, step, launch, requestShift, point, turbo, engineMap: em, driveline: dl, tyre: ty, tyreThermal: th, massKg: mass, launchRpm, revLimit, gears, finalDrive: fd, radiusM: r };
  }

  // ---- Burnout -------------------------------------------------------------------------------------
  // The car is held on the brakes, first gear, clutch engaged: the driven wheels spin against the track.
  //   (I_e R^2 + I_w) dw_w/dt = T_engine R eta - Fx r,   Fx = mu(T) Fz MF(slip)
  // The driver holds the burnout rpm with the pedal; the slip power heats the tyres (tyreThermalStep) and
  // boils rubber off the hot skin (smoke). Boost comes from the same turbo runtime as the launch.
  function createBurnoutRuntime(inputState, opts = {}) {
    const state = normalizeState(inputState);
    const em = opts.engineMap || buildEngineMap(state);
    const turbo = opts.turbo || createTurboRuntime(state, { engineMap: em });
    const trans = getPart(state, 'transmission');
    const drive = DRIVETRAINS[state.vehicle.drivetrain] || DRIVETRAINS.FWD;
    const ty = tyreFor(state);
    const r = ty.geometry.radiusM, mass = buildMassKg(state), g = 9.80665;
    const R = trans.gearRatios[0] * trans.finalDrive, eta = trans.transEfficiency * (1 - drive.loss * 0.34);
    const wheelKg = Number(state.vehicle.wheelMassKg || 12.4) + 10, wheelI = wheelKg * r * r * 0.75;
    const tyres = state.vehicle.drivetrain === 'AWD' ? 4 : 2;
    const drivenI = tyres * wheelI + 0.25;
    const staticDriven = state.vehicle.drivetrain === 'FWD' ? drive.frontStatic : state.vehicle.drivetrain === 'RWD' ? 1 - drive.frontStatic : 1;
    const fz = mass * g * staticDriven;
    const ambientC = Number(state.vehicle.ambientTempC ?? 20), trackC = Number(state.vehicle.trackTempC ?? 28);
    const th = opts.tyreThermal ? { ...opts.tyreThermal } : makeTyreThermal(Number.isFinite(opts.startC) ? opts.startC : trackC);
    // The burnout runs without anti-lag. The driver's foot is the pedal: holding the button is full
    // throttle (no controller backs it off). vehicle.burnoutLimiter adds the ECU burnout limiter:
    // a spark/fuel cut at vehicle.burnoutRpm, like a launch limiter, with the pedal still flat. 'full'
    // (default) runs against the normal rev limiter. The clutch is dumped at the set burnout rpm.
    const mode = (opts.mode ?? (state.vehicle.burnoutLimiter ? 'limiter' : 'full')) === 'limiter' ? 'limiter' : 'full';
    const targetRpm = clamp(Number(opts.targetRpm ?? state.vehicle.burnoutRpm ?? 5000), 2500, em.revLimit - 300);
    const cutRpm = mode === 'limiter' ? targetRpm : em.revLimit;
    // The burnout starts in the water box: a wet tyre keeps ~45 % of its dry street grip (the track prep sits
    // under the water), which is what lets the engine break a sticky drag tyre loose. The spinning tyre
    // flings and boils the water off (dry after ~1 s at 60 kW of slip); a dry tyre on the burnout pad
    // grips ~80 % of dry street, heats fast and smokes.
    const streetGrip = ty.mu / ty.base;
    const clutchNm = (DRIVELINE[trans.id] || DRIVELINE.oem_6mt).clutchNm;
    const s = { t: 0, water: 1, we: (900 * Math.PI) / 30, ww: 0, pedal: 0, smoke: 0, slipPowerW: 0, fx: 0, torqueNm: 0, energyJ: 0, turboSnap: null, turboClock: 1, cut: false };
    const rpm = () => (s.we * 30) / Math.PI;
    function substep(h, throttle) {
      s.t += h;
      if (rpm() >= cutRpm) s.cut = true; else if (rpm() < cutRpm - 120) s.cut = false;
      const snap = s.turboSnap || {};
      const cell = engineMapLookup(em, rpm(), throttle ? Number(snap.mapBarAbs || 1) : 0.35, snap.manifoldK || ENGINE_MAP_REF_K, throttle ? Number(snap.empBarAbs || 1) : 1.05);
      // the foot goes to the pedal position in ~0.06 s (throttle body and foot)
      s.pedal += (throttle - s.pedal) * clamp(h / 0.06, 0, 1);
      let tEng = throttle ? cell.torqueNm * s.pedal - cell.frictionNm * (1 - s.pedal) * 0.3 : -cell.frictionNm * 0.8;
      if (s.cut) tEng = -cell.frictionNm * 0.6;
      s.torqueNm = tEng;
      if (throttle) {
        // Rev with the clutch in, then dump it: the clutch slips (capacity limited) until engine and wheels
        // turn together; locked, the car stands still, so the whole tyre surface speed is slip.
        if (!s.dumped && rpm() >= Math.min(targetRpm, cutRpm - 150)) s.dumped = true;
        s.engage = s.dumped ? Math.min(1, (s.engage || 0) + h / 0.15) : 0;
        const mu = tyreMu(ty, tyreGripTempC(th), 1) * streetGrip * (0.8 - 0.35 * s.water);
        const vSlip = s.ww * r;
        const grip = mu * fz;
        const fxRoll = vSlip < 0.02 ? 0 : grip * magicFormula(vSlip / 1.0, ty.peakSlip);
        const slip = s.we - R * s.ww;
        const cap = clutchNm * s.engage;
        if (s.engage > 0.5 && Math.abs(slip) < 2) {
          const acc = (tEng * R * eta - fxRoll * r) / (drivenI + ENGINE_INERTIA * R * R);
          s.ww = Math.max(0, s.ww + acc * h);
          s.we = Math.max((900 * Math.PI) / 30, s.ww * R);
          s.fx = fxRoll;
        } else {
          const tc = Math.sign(slip || 1) * cap;
          s.we = Math.max((900 * Math.PI) / 30, s.we + ((tEng - tc) / ENGINE_INERTIA) * h);
          // a standing tyre holds until the clutch torque at the wheels exceeds static grip
          const drive = tc * R * eta;
          const fx = s.ww * r < 0.02 && drive <= grip * r ? drive / r : fxRoll || grip;
          s.ww = Math.max(0, s.ww + ((drive - fx * r) / drivenI) * h);
          if (Math.sign(s.we - R * s.ww) !== Math.sign(slip) && s.engage > 0.5) s.we = s.ww * R;
          s.fx = fx;
        }
        s.slipPowerW = s.fx * s.ww * r;
      } else {
        // clutch in, wheels brake to a stop, engine back to idle
        s.dumped = false; s.engage = 0;
        s.ww = Math.max(0, s.ww - 40 * h);
        s.we += (((900 * Math.PI) / 30) - s.we) * clamp(h * 4, 0, 1);
        s.slipPowerW = 0; s.fx = 0;
      }
      s.water = Math.max(0, s.water - (s.slipPowerW / 60000) * h / 1.0);
      s.energyJ += s.slipPowerW * h;
      tyreThermalStep(th, h, { slipPowerW: s.slipPowerW, tyres, speedMs: 0, ambientC, trackC });
      // Smoke: oils and rubber vaporise off a skin above ~95 C, more with more slip power.
      const hot = clamp((th.surfaceC - 95) / 90, 0, 1);
      const want = hot * hot * (3 - 2 * hot) * clamp(s.slipPowerW / 60000, 0, 1.2);
      s.smoke += (want - s.smoke) * clamp(h * (want > s.smoke ? 4 : 1.2), 0, 1);
    }
    function step(dt, input = {}) {
      dt = clamp(Number(dt) || 0, 0, 0.2);
      const throttle = typeof input.throttle === 'number' ? clamp(input.throttle, 0, 1) : input.throttle ? 1 : 0;
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(0.002, left);
        left -= h;
        s.turboClock += h;
        if (s.turboClock >= 0.01 || !s.turboSnap) {
          s.turboSnap = turbo.step(s.turboClock, { rpm: rpm(), throttle: throttle ? s.pedal : 0, gearIndex: 0, twoStep: false, alsRequest: false });
          s.turboClock = 0;
        }
        substep(h, throttle);
      }
      return point();
    }
    function point() {
      const snap = s.turboSnap || {};
      return {
        t: s.t, rpm: rpm(), pedal: s.pedal, tyreSurfaceKmh: s.ww * r * 3.6, slipPowerKw: s.slipPowerW / 1000, energyKj: s.energyJ / 1000,
        tyreSurfaceC: th.surfaceC, tyreBulkC: th.bulkC, tyreGripC: tyreGripTempC(th), smoke: s.smoke,
        boostBar: Number(snap.boostBar || 0), egtC: Number(snap.egtC || 0), mapBarAbs: snap.mapBarAbs, lambda: snap.lambda, limiter: s.cut, torqueNm: s.torqueNm
      };
    }
    return { state: s, step, point, turbo, tyre: ty, tyreThermal: th, targetRpm, mode, cutRpm };
  }
  // The driveline's torsional (hop) mode for a build and mounts part: frequency and the mounts' damping.
  function hopMode(inputState, mountsId) {
    const state = normalizeState(inputState, { noEcu: true });
    const m = mountsId ? CATEGORY_MAP.mounts.items.find(x => x.id === mountsId) || getPart(state, 'mounts') : getPart(state, 'mounts');
    const g = gripFactor(state.vehicle).geometry, r = g.radiusM;
    const wheelI = (Number(state.vehicle.wheelMassKg || 12.4) + 10) * r * r * 0.75;
    const wheelsI = (state.vehicle.drivetrain === 'AWD' ? 4 : 2) * wheelI;
    const k = 1 / (1 / HOP.shaftNmRad + 1 / (HOP.mountNmRad * m.hopStiffness));
    return { hz: Math.sqrt(k / wheelsI) / (2 * Math.PI), zeta: HOP.dampingRatio * m.hopDamping, stiffnessNmRad: k };
  }
  // Driveline wear from one pass (percent of transmission/driveline life): hopping hammers CV joints,
  // shafts and mounts; a hard mount passes vibration into the gearbox on every pass.
  function hopWearPct(rtState, mounts) {
    return (rtState.hopS || 0) * (0.3 + 0.7 * (rtState.hopMaxI || 0)) * 0.4 + Number(mounts?.nvhWear || 0);
  }
  // Optimal upshift points from the engine map: shift where the next gear gives more wheel torque.
  function optimalShiftRpms(state, em) {
    const trans = getPart(state, 'transmission'), out = [];
    for (let gi = 0; gi < trans.gearRatios.length - 1; gi++) {
      const a = trans.gearRatios[gi], b = trans.gearRatios[gi + 1];
      let best = em.revLimit - 100;
      for (let rpm = 4000; rpm <= em.revLimit - 100; rpm += 50) {
        const mapAt = x => 1.013 + ecuBoostTarget(state.tune.ecu, gi, x);
        if (engineMapLookup(em, rpm * b / a, mapAt(rpm * b / a)).torqueNm * b >= engineMapLookup(em, rpm, mapAt(rpm)).torqueNm * a) { best = rpm; break; }
      }
      out.push(best);
    }
    return out;
  }
  // Headless quarter mile with a driver model (rival, tests, auto run): same runtime as the player.
  function simulateRaceRun(inputState, cfg = {}) {
    const state = normalizeState(inputState);
    const em = buildEngineMap(state);
    const rt = createRaceRuntime(state, { engineMap: em, tyreTempC: cfg.tyreTempC, launchRpm: cfg.launchRpm, tractionControl: cfg.tractionControl ?? state.tune.tractionControl !== false });
    const shiftRpm = cfg.shiftRpms || optimalShiftRpms(state, em);
    const reaction = Number.isFinite(cfg.reactionTime) ? cfg.reactionTime : 0.1;
    const milestones = {}, trace = [];
    // pre-stage: build boost on the two-step for 1.5 s
    const launchAls = cfg.launchAls ?? resolveAntiLag(state).enabled;
    for (let i = 0; i < 75; i++) rt.step(0.02, { launchAls });
    rt.state.t = 0;
    rt.launch();
    const dist = [['sixtyFt', 18.288], ['threeThirty', 100.584], ['eighth', 201.168], ['thousandFt', 304.8], ['quarter', 402.336]];
    let traceClock = 0, zero100 = null, pedal = 1;
    const skill = clamp(Number(cfg.driverSkill ?? 0.85), 0, 1);
    while (rt.state.t < 30 && rt.state.x < 402.336) {
      // Driver: feathers the throttle when the tyres go past their peak slip (a skilled driver reacts faster).
      const k = rt.state.kappa, target = rt.tyre.peakSlip * (1.6 - 0.4 * skill);
      pedal = clamp(pedal + (k > target ? -Math.min(0.5, k - target) * (2 + 4 * skill) : 0.8 + 1.5 * skill) * 0.01, 0.45, 1);
      // the auto driver fires the nitrous from second gear (the tyres cannot take it earlier)
      const p = rt.step(0.01, { flatShift: !!cfg.flatShift, clutchDumpS: cfg.clutchDumpS, pedal, nitrous: cfg.nitrous !== false && rt.state.gear >= 1 });
      if (!rt.state.shift && p.gearIndex < rt.gears.length - 1 && p.rpm >= shiftRpm[p.gearIndex]) rt.requestShift();
      for (const [k, d] of dist) if (milestones[k] == null && p.distanceM >= d) { milestones[k] = p.t; if (k === 'eighth') milestones.eighthKmh = p.speedKmh; if (k === 'quarter') milestones.trapKmh = p.speedKmh; }
      if (zero100 == null && p.speedKmh >= 100) zero100 = p.t;
      traceClock += 0.01;
      if (traceClock >= 0.04 - 1e-9) { traceClock = 0; trace.push({ time: p.t, distanceM: p.distanceM, speedKmh: p.speedKmh, gear: p.gear, rpm: p.rpm, accelerationG: p.accelerationG, boostBar: p.boostBar, wheelspinPct: p.wheelspinPct }); }
    }
    if (milestones.quarter == null) throw new Error('De combinatie bereikte de finish niet binnen 30 seconden.');
    return {
      valid: reaction >= 0, redLight: reaction < 0, reactionTime: reaction,
      sixtyFt: milestones.sixtyFt, threeThirty: milestones.threeThirty, eighth: milestones.eighth, eighthKmh: milestones.eighthKmh,
      thousandFt: milestones.thousandFt, quarter: milestones.quarter, trapKmh: milestones.trapKmh, zeroTo100: zero100,
      finishTotalTime: milestones.quarter + Math.max(0, reaction), wheelspinPct: rt.state.maxWheelspin * 100, shifts: rt.state.shiftLog.length,
      totalMassKg: rt.massKg, trace, shiftRpms: shiftRpm, maxClutchTempC: rt.state.clutchC, limiterTimeS: rt.state.limiterS,
      knockEvents: rt.state.knockEvents, kcMaxRetardDeg: rt.state.kcMaxDeg, knockDamagePct: rt.state.knockDamage,
      headLiftS: rt.state.headLiftS, n2oShotS: rt.state.n2oShotS, n2oMaxHp: rt.state.n2oMaxHp, n2oUsedKg: (rt.state.bottleStartKg ?? 0) - rt.state.bottleKg, n2oLeanS: rt.state.n2oLeanS,
      hopS: rt.state.hopS, hopMax: rt.state.hopMaxI, hopPeakShaftNm: rt.state.hopPeakNm, hopWearPct: hopWearPct(rt.state, getPart(state, 'mounts')),
      drivetrain: (DRIVETRAINS[state.vehicle.drivetrain] || DRIVETRAINS.FWD).name, tireName: (TIRE_MAP[state.vehicle.tireCompound] || {}).name
    };
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
    let key = '';
    const add = (system, severity, observation, action) => out.push({ key, system, severity, observation, action });
    key = result.status === DYNO_STATUS.ABORTED && result.abortKind !== 'operator' ? `abort:${result.abortCode || 'other'}` : 'run';
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
    key = 'fuel';
    if (result.maxFuelDuty > 88)
      add(
        'Brandstof',
        result.maxFuelDuty > 102 ? 'danger' : 'warn',
        `Maximale duty ${Math.round(result.maxFuelDuty)}%.`,
        `Vergroot de flowmarge of verlaag de vraag; controleer de raildrukcurve.`
      );
    key = 'turbo';
    if (result.maxTurboLoad > 92)
      add(
        'Turbo',
        result.maxTurboLoad > 112 ? 'danger' : 'warn',
        `Turbo-load ${Math.round(result.maxTurboLoad)}% en geschatte as ${Math.round(result.maxTurboShaftRpm / 1000)}k rpm.`,
        'Gebruik minder druk buiten het efficiënte gebied, meer turbine/wastegateflow of een passend compressorframe.'
      );
    // 1.0 = the end gas auto-ignites before the flame arrives; above ~0.93 the knock control margin is used
    // up and single cycles start to knock (the same threshold the race uses).
    key = 'knock';
    if (result.maxKnockRisk > 0.93)
      add(
        'Verbranding',
        result.maxKnockRisk > 1 ? 'danger' : 'warn',
        `Knock-index piekte op ${result.maxKnockRisk.toFixed(2)} (1,00 = klop): de ontsteking staat op de klopgrens.`,
        'Meer marge: minder ontsteking of boost, hoger octaan, koelere inlaatlucht.'
      );
    key = 'iat';
    if (result.maxIatC > 50)
      add(
        'Inlaatlucht',
        'warn',
        `IAT bereikte ${Math.round(result.maxIatC)}°C.`,
        'Verbeter koeling, ventilator/ice-tank of verminder heat-soak en compressorbelasting.'
      );
    key = 'oil';
    const minOil = result.minOilPressureBar;
    if ((minOil !== null && minOil < 2.8) || result.maxOilTempC > 135)
      add(
        'Olie',
        minOil !== null && minOil < 2.1 ? 'danger' : 'warn',
        `Min ${minOil === null ? '—' : minOil.toFixed(1)} bar, max ${Math.round(result.maxOilTempC)}°C, aeratie ${Math.round(result.maxOilAerationPct)}%.`,
        'Controleer vulniveau, clearances, pickup/cartercontrole, viscositeit en koeling.'
      );
    key = 'cam';
    if (result.camTiming?.applicable && result.camTiming.score < 0.88)
      add(
        'Nokken',
        'warn',
        `Timingmatch ${Math.round(result.camTiming.score * 100)}%.`,
        'Meet opnieuw op overlap-TDC en herstel de mechanische basisstand voordat de map wordt beoordeeld.'
      );
    key = 'assembly';
    if (result.assembly?.score < 0.85)
      add(
        'Montage',
        result.assembly.score < 0.68 ? 'danger' : 'warn',
        `Montagescore ${Math.round(result.assembly.score * 100)}%.`,
        'Controleer ringgap, lagerclearance, bougiegap, priming en montageprocedure.'
      );
    key = '';
    if (!out.length)
      add(
        'Resultaat',
        'good',
        'Geen hoofdafwijking in de gemodelleerde kanalen.',
        'Bewaar de run als referentie en vergelijk herhaalbaarheid bij dezelfde condities.'
      );
    return out;
  }


  // ---- Tuner advice ------------------------------------------------------------------------------
  // For a diagnosis the tuner tries concrete changes (a part, an exact setting, a service) on the same
  // simulation the dyno uses, without measurement noise, and reports what each one does to the problem
  // and to the power. Nothing here is a rule of thumb: every number is a simulated pull.
  const ADVICE_PRICE = 150; // euro per diagnosis: the tuner's hour
  const ADVICE_ISSUES = Object.freeze({
    fuel: { label: 'fuel duty', value: r => r.maxFuelDuty, ok: v => v <= 88, fmt: v => `${Math.round(v)}%` },
    turbo: { label: 'turbo-load', value: r => r.maxTurboLoad, ok: v => v <= 92, fmt: v => `${Math.round(v)}%` },
    knock: { label: 'knock-index', value: r => r.maxKnockRisk, ok: v => v <= 0.93, fmt: v => v.toFixed(2) },
    iat: { label: 'max IAT', value: r => r.maxIatC, ok: v => v <= 50, fmt: v => `${Math.round(v)} °C` },
    oil: { label: 'min oliedruk', value: r => (r.maxOilTempC > 135 ? Math.min(r.minOilPressureBar ?? 9, 2.79) : r.minOilPressureBar ?? 0), ok: v => v >= 2.8, fmt: v => `${v.toFixed(1)} bar` },
    cam: { label: 'nokkenmatch', value: r => (r.camTiming?.score ?? 1) * 100, ok: v => v >= 88, fmt: v => `${Math.round(v)}%` },
    assembly: { label: 'montagescore', value: r => (r.assembly?.score ?? 1) * 100, ok: v => v >= 85, fmt: v => `${Math.round(v)}%` },
    abort: { label: 'pull', value: r => (r.status === DYNO_STATUS.COMPLETED ? 1 : 0), ok: v => v === 1, fmt: v => (v ? 'voltooid' : 'afgebroken') }
  });
  function adviceIssue(key) { return ADVICE_ISSUES[String(key).startsWith('abort') ? 'abort' : key] || null; }
  // Change the boost where the build keeps it: the quick setup when the tables follow it, else every table cell.
  function adviceBoostPatch(state, delta) {
    const t = state.tune, edited = !!t.ecu?.edited?.boost;
    if (!edited) {
      const f = v => round(clamp(Number(v) + delta, 0.2, 4.5), 2);
      return { patch: { tune: { boostLowBar: f(t.boostLowBar), boostMidBar: f(t.boostMidBar), boostHighBar: f(t.boostHighBar) } },
        label: `Boost laag/midden/hoog ${t.boostLowBar.toFixed(2)}/${t.boostMidBar.toFixed(2)}/${t.boostHighBar.toFixed(2)} → ${f(t.boostLowBar).toFixed(2)}/${f(t.boostMidBar).toFixed(2)}/${f(t.boostHighBar).toFixed(2)} bar (Tune → Boost)` };
    }
    return { patch: { boostTableDelta: delta }, label: `Boosttabel ${delta > 0 ? '+' : ''}${delta.toFixed(1)} bar in elke cel (Tune → Tabellen → Boost)` };
  }
  function adviceCandidates(inputState, key) {
    const state = normalizeState(inputState), t = state.tune, out = [];
    const part = (cat, item) => ({ id: `part:${cat}:${item.id}`, kind: 'part', cost: item.price || 0,
      label: `Monteer ${item.name} (${CATEGORY_MAP[cat].label})`, patch: { selections: { [cat]: item.id } } });
    const nextParts = (cat, n, better = null) => {
      const cur = getPart(state, cat);
      return CATEGORY_MAP[cat].items.filter(i => i.id !== cur.id && (better ? better(i, cur) : i.price > cur.price))
        .sort((a, b) => (better ? 0 : a.price - b.price) || a.price - b.price).slice(0, n).map(i => part(cat, i));
    };
    const boost = d => { const b = adviceBoostPatch(state, d); return { id: `boost:${d}`, kind: 'setting', cost: 0, ...b }; };
    const spark = d => { const v = round(Number(t.ignitionTrimDeg || 0) + d, 1); return { id: `spark:${d}`, kind: 'setting', cost: 0, label: `Ontstekingstrim ${Number(t.ignitionTrimDeg || 0).toFixed(1)}° → ${v.toFixed(1)}° (Tune → Ontsteking)`, patch: { tune: { ignitionTrimDeg: v } } }; };
    const toggle = (name, label) => (t[name] ? null : { id: `on:${name}`, kind: 'setting', cost: 0, label: `${label} aan (Tune → Beveiliging)`, patch: { tune: { [name]: true } } });
    const byMetric = (cat, field, n) => nextParts(cat, n, (i, cur) => Number(i[field]) > Number(cur[field])).sort((a, b) => 0);
    const groups = {
      fuel: () => [...byMetric('fuelSystem', 'fuelSystemHp', 3), boost(-0.1), boost(-0.2)],
      turbo: () => [boost(-0.1), boost(-0.2), boost(-0.3), ...nextParts('boostControl', 2), ...byMetric('turbo', 'compressorMm', 2)],
      knock: () => [spark(-1), spark(-2), spark(-3), ...byMetric('fuel', 'octane', 3), ...byMetric('air', 'cooling', 2), boost(-0.1), boost(-0.2), toggle('knockControl', 'Knock control')],
      iat: () => [...byMetric('air', 'cooling', 3), boost(-0.2),
        state.dynoConfig.fanSpeedPct < 100 ? { id: 'fan:100', kind: 'setting', cost: 0, label: `Testcelfan ${Math.round(state.dynoConfig.fanSpeedPct)}% → 100% (Dyno → Testcel)`, patch: { dynoConfig: { fanSpeedPct: 100 } } } : null],
      oil: () => [...['10w50_ester', '10w60_race', '5w40_ester'].filter(id => id !== state.service.oilId && OIL_MAP[id]).map(id => ({ id: `oil:${id}`, kind: 'service', cost: OIL_MAP[id].price + FILTER_MAP[state.service.filterId].price, label: `Olie verversen naar ${OIL_MAP[id].name} (Service)`, patch: { service: { oilId: id, oilAgeKm: 0, oilRuns: 0 } } })),
        ...nextParts('oiling', 2), { id: 'rev:-300', kind: 'setting', cost: 0, label: `Toerenbegrenzer ${t.revLimitRpm} → ${t.revLimitRpm - 300} rpm (Tune)`, patch: { tune: { revLimitRpm: t.revLimitRpm - 300 } } }, toggle('oilPressureProtection', 'Oliedrukbeveiliging')],
      cam: () => { const c = camTimingHealth(state); return [{ id: 'cam:target', kind: 'setting', cost: 0, label: `Noktiming op TDC: uitlaat ${Number(t.exhaustTdcLiftMm).toFixed(2)} → ${c.targetExhaustTdcMm.toFixed(2)} mm, inlaat ${Number(t.intakeTdcLiftMm).toFixed(2)} → ${c.targetIntakeTdcMm.toFixed(2)} mm (Bouw → Nokken)`, patch: { tune: { exhaustTdcLiftMm: c.targetExhaustTdcMm, intakeTdcLiftMm: c.targetIntakeTdcMm } } }]; },
      assembly: () => { const a = assemblyHealth(state).targets, cur = state.assembly; const f = v => round(v, 3);
        return [{ id: 'assembly:target', kind: 'setting', cost: 0, label: `Montage op maat: ringgap ${cur.topRingGapMm}/${cur.secondRingGapMm} → ${f(a.topRingGapMm)}/${f(a.secondRingGapMm)} mm, lagers ${cur.rodClearanceMm}/${cur.mainClearanceMm} → ${f(a.rodClearanceMm)}/${f(a.mainClearanceMm)} mm, bougiegap ${cur.sparkGapMm} → ${f(a.sparkGapMm)} mm, procedure 99%, geprimed (Bouw → Montage)`,
          patch: { assembly: { topRingGapMm: f(a.topRingGapMm), secondRingGapMm: f(a.secondRingGapMm), rodClearanceMm: f(a.rodClearanceMm), mainClearanceMm: f(a.mainClearanceMm), sparkGapMm: f(a.sparkGapMm), balanceQualityPct: 99, deckSealQualityPct: 99, fastenerProcedurePct: 99, oilPrimed: true } } }]; }
    };
    const code = String(key).startsWith('abort:') ? key.slice(6) : '';
    let list;
    if (!code) list = (groups[key] || (() => []))();
    else if (code === 'knock') list = groups.knock();
    else if (code === 'lean_out') list = [...groups.fuel(), toggle('railPressureCut', 'Raildrukcut')];
    else if (code === 'turbo_overspeed') list = groups.turbo();
    else if (code.startsWith('oil')) list = groups.oil();
    else if (code === 'mechanical_power' || code === 'torque') list = [boost(-0.2), boost(-0.4), ...nextParts('block', 2), ...nextParts('crank', 1), ...(code === 'torque' ? nextParts('transmission', 1, (i, c) => i.transTorque > c.transTorque) : [])];
    else if (code === 'overrev') {
      // Upgrade the part that actually set the limit (and the next weakest if it sits close behind).
      const chain = rpmLimitChain(state), rev = effectiveRevLimit(state);
      const weak = chain.parts.filter(p => p.rpm * 1.04 < rev + 200);
      const safeRev = Math.floor(chain.weakest.rpm / 100) * 100;
      const up = cat => nextParts(cat, 1, (i, cur) => Number(i.rpmLimit) > rev && i.price > cur.price).sort((a, b) => a.cost - b.cost);
      list = [{ id: `rev:${safeRev}`, kind: 'setting', cost: 0, label: `Toerenbegrenzer ${t.revLimitRpm} → ${safeRev} rpm (Tune)`, patch: { tune: { revLimitRpm: safeRev } } }];
      const cats = (weak.length ? weak : [chain.weakest]).map(p => p.category);
      if (cats.length > 1) {
        const combo = cats.map(c => up(c)[0]).filter(Boolean);
        if (combo.length === cats.length) list.push({ id: `rpmset:${combo.map(x => x.id).join('+')}`, kind: 'part', cost: combo.reduce((a, x) => a + x.cost, 0),
          label: combo.map(x => x.label).join(' + '), patch: { selections: Object.assign({}, ...combo.map(x => x.patch.selections)) } });
      } else list.push(...up(cats[0]), ...nextParts(cats[0], 1, (i, cur) => Number(i.rpmLimit) > Number(cur.rpmLimit)));
    }
    else if (code === 'head_lift') list = [...nextParts('sealing', 2), boost(-0.2), boost(-0.4)];
    else if (code === 'misfire') list = [...nextParts('ignition', 2), boost(-0.2)];
    else if (code === 'ecu_control') list = [...nextParts('ecu', 1), ...nextParts('sensors', 1), boost(-0.3)];
    else if (code === 'ring_butt' || code === 'bearing_clearance' || code.includes('prime')) list = groups.assembly();
    else list = [boost(-0.2), spark(-2)];
    return list.filter(Boolean);
  }
  function applyAdvicePatch(inputState, patch) {
    const state = normalizeState(inputState);
    for (const k of ['selections', 'tune', 'service', 'assembly', 'dynoConfig']) if (patch[k]) state[k] = { ...state[k], ...deepClone(patch[k]) };
    if (Number.isFinite(patch.boostTableDelta)) {
      const ecu = deepClone(state.tune.ecu);
      ecu.boost = ecu.boost.map(row => row.map(v => round(Math.max(0, v + patch.boostTableDelta), 3)));
      state.tune.ecu = ecu;
    }
    return normalizeState(state);
  }
  // Baseline of the current build on the advice terms (no measurement noise, same conditions).
  // (at the heat soak of the measured pull: a prediction made on a cold cell would not match the next pull)
  function adviceBaseline(inputState, opts = {}) {
    const soakK = clamp(Number(opts.soakK) || 0, 0, 60);
    const r = simulateEngine(inputState, { noise: false, soakK });
    return { peakHp: r.peakHp, result: r, soakK };
  }
  function evaluateAdvice(inputState, key, candidate, baseline) {
    const issue = adviceIssue(key);
    const base = baseline || adviceBaseline(inputState);
    const next = applyAdvicePatch(inputState, candidate.patch);
    const r = simulateEngine(next, { noise: false, soakK: base.soakK || 0 });
    const before = issue.value(base.result), after = issue.value(r);
    const others = diagnoseDyno(r).filter(d => d.severity === 'danger' && d.key && !String(d.key).startsWith(String(key).split(':')[0]));
    return {
      id: candidate.id, kind: candidate.kind, label: candidate.label, cost: candidate.cost, patch: candidate.patch,
      metric: issue.label, before, after, beforeText: issue.fmt(before), afterText: issue.fmt(after),
      resolved: issue.ok(after) && r.status === DYNO_STATUS.COMPLETED && !others.length,
      improved: issue.label === 'pull' ? after > before : (issue.ok(1e9) ? after > before : after < before),
      hpBefore: base.peakHp, hpAfter: r.peakHp, completed: r.status === DYNO_STATUS.COMPLETED,
      sideEffects: others.map(d => `${d.system}: ${d.observation}`)
    };
  }
  // Best first: solutions before improvements; within those the lowest "price" where every percent of
  // power lost counts as EUR 500 (a free setting that costs 5 % is worse than a EUR 900 part that costs none).
  function advicePenalty(e) { return e.cost + Math.max(0, (e.hpBefore - e.hpAfter) / Math.max(1, e.hpBefore) * 100) * 500; }
  function rankAdvice(evals) {
    return evals.slice().sort((a, b) => (b.resolved - a.resolved) || (b.improved - a.improved) || (advicePenalty(a) - advicePenalty(b)));
  }
  // When no single change solves it: the two best improvements of different kinds together.
  function adviceCombination(evals) {
    const top = rankAdvice(evals).filter(e => e.improved && !e.resolved);
    const a = top[0], b = top.find(e => e.id !== a?.id && e.id.split(':')[0] !== a?.id.split(':')[0]);
    if (!a || !b) return null;
    return mergeAdvice([a, b]);
  }
  // Several chosen recommendations as one change (later ones win where they touch the same setting).
  function mergeAdvicePatches(list) {
    const out = {};
    for (const y of list) for (const k of Object.keys(y)) out[k] = y[k] && typeof y[k] === 'object' && !Array.isArray(y[k]) ? { ...(out[k] || {}), ...y[k] } : y[k];
    return out;
  }
  function mergeAdvice(list) {
    return { id: `combo:${list.map(e => e.id).join('+')}`, kind: 'combo', cost: list.reduce((a, e) => a + (e.cost || 0), 0),
      label: `Combinatie: ${list.map(e => e.label).join(' + ')}`, patch: mergeAdvicePatches(list.map(e => e.patch)) };
  }

  // ---- Optimised maps (paid tuner service) --------------------------------------------------------------
  // The tuner sits on the dyno and writes the quick-setup map (boost low/mid/high, spark trim, lambda, cam)
  // for this hardware: a coordinate search on the same dyno simulation, within the limits of the chosen
  // goal. Street: big margins (reliability, knock, EGT); race: the most power the engine survives.
  const MAP_TUNES = {
    street: { id: 'street', label: 'Straatmap (veilig)', price: 450, knockMax: 0.9, egtMaxC: 940, fuelDutyMax: 88, turboLoadMax: 94, torqueFrac: 0.88, clampFrac: 0.85, hpFrac: 0.9, budget: 22 },
    race: { id: 'race', label: 'Racemap (maximaal)', price: 950, knockMax: 0.98, egtMaxC: 990, fuelDutyMax: 95, turboLoadMax: 99, torqueFrac: 0.98, clampFrac: 0.95, hpFrac: 1.0, budget: 30 }
  };
  const MAP_PARAMS = [
    { key: 'boostMidBar', step: 0.15, min: 0, max: 4.2 },
    { key: 'boostHighBar', step: 0.15, min: 0, max: 4.5 },
    { key: 'boostLowBar', step: 0.15, min: 0, max: 4.2 },
    { key: 'ignitionTrimDeg', step: 1, min: -8, max: 7 },
    { key: 'lambda', step: 0.02, min: 0.7, max: 0.9 },
    { key: 'intakeCamAdvanceDeg', step: 4, min: -5, max: 30 }
  ];
  // Only the margins a map changes count (the reliability score also carries wear, oil and bench state).
  function mapLimits(state) {
    const parts = ['block', 'crank', 'oiling', 'head', 'valvetrain', 'ecu'].map(c => getPart(state, c));
    return {
      torqueNm: minPositive(...parts.map(p => p.torqueLimit), getPart(state, 'transmission').transTorque),
      hp: minPositive(...parts.map(p => p.hpLimit)),
      clampBmep: Number(getPart(state, 'sealing').headClampBmep) || 60
    };
  }
  function mapScore(r, goal, lim) {
    const done = r.status === DYNO_STATUS.COMPLETED;
    const v = (x, l) => Math.max(0, Number(x || 0) / l - 1);
    const viol = (done ? 0 : 3) + v(r.peakTorqueNm, lim.torqueNm * goal.torqueFrac) * 5 + v(r.peakHp, lim.hp * goal.hpFrac) * 5 + v(r.maxBmepBar, lim.clampBmep * goal.clampFrac) * 5 + v(r.maxKnockRisk, goal.knockMax) * 5 +
      v(r.maxEgtC, goal.egtMaxC) * 5 + v(r.maxFuelDuty, goal.fuelDutyMax) * 3 + v(r.maxTurboLoad, goal.turboLoadMax) * 3;
    const hp = Number(r.peakHp || 0), top = (r.samples || []).filter(p => p.rpm >= 3500);
    const area = top.length ? top.reduce((a, p) => a + p.hp, 0) / top.length : 0;
    return { ok: viol === 0, score: viol === 0 ? hp * 0.6 + area * 0.4 : -1000 - viol * 100 + hp * 0.01, hp, viol };
  }
  // Stepwise optimiser for the app (one dyno simulation per step()): { step() -> done, best, evals, total }
  function createMapOptimizer(inputState, goalId, opts = {}) {
    const goal = MAP_TUNES[goalId] || MAP_TUNES.street;
    const base = normalizeState(inputState);
    const hwMax = Number(getPart(base, 'boostControl').boostHardwareMaxBar) || 4.5;
    const soakK = clamp(Number(opts.soakK) || 0, 0, 60);
    const run = tune => simulateEngine(applyAdvicePatch(base, { tune: { ...tune, ecu: null } }), { noise: false, soakK });
    const pick = t => Object.fromEntries(MAP_PARAMS.map(p => [p.key, Number(t[p.key])]));
    const start = pick(base.tune);
    const baseRes = simulateEngine(base, { noise: false, soakK }), lim = mapLimits(base);
    let best = { tune: start, result: run(start) }; best.s = mapScore(best.result, goal, lim);
    const steps = Object.fromEntries(MAP_PARAMS.map(p => [p.key, p.step]));
    const queue = [];
    let evals = 1, improvedRound = false, rounds = 0;
    const refill = () => {
      rounds++;
      if (!improvedRound) for (const k of Object.keys(steps)) steps[k] /= 2;
      improvedRound = false;
      for (const p of MAP_PARAMS) for (const dir of [1, -1]) queue.push([p, dir]);
    };
    refill(); improvedRound = true;
    function step() {
      if (evals >= goal.budget) return true;
      if (!queue.length) { if (rounds > 4) return true; refill(); }
      const [p, dir] = queue.shift();
      const cap = /^boost/.test(p.key) ? Math.min(p.max, hwMax) : p.max;
      const v = round(clamp(best.tune[p.key] + dir * steps[p.key], p.min, cap), 3);
      if (v === best.tune[p.key]) return false;
      const tune = { ...best.tune, [p.key]: v };
      const result = run(tune);
      evals++;
      const sc = mapScore(result, goal, lim);
      if (sc.score > best.s.score + 0.2) { best = { tune, result, s: sc }; improvedRound = true; queue.unshift([p, dir]); }
      return evals >= goal.budget;
    }
    function summary() {
      const b0 = mapScore(baseRes, goal, lim);
      return { goal: goal.id, label: goal.label, price: goal.price, ok: best.s.ok, evals, before: { hp: baseRes.peakHp, reliability: baseRes.reliabilityScore, ok: b0.ok },
        after: { hp: best.result.peakHp, reliability: best.result.reliabilityScore, knock: best.result.maxKnockRisk, egtC: best.result.maxEgtC },
        tune: best.tune, changes: MAP_PARAMS.filter(p => Math.abs(best.tune[p.key] - start[p.key]) > 1e-6).map(p => ({ key: p.key, from: start[p.key], to: best.tune[p.key] })),
        patch: { tune: { ...best.tune, ecu: null } } };
    }
    return { step, summary, get evals() { return evals; }, total: goal.budget };
  }


  function applyPreset(inputState, presetId) {
    const state = normalizeState(inputState, { noEcu: true }),
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
    // A preset comes with its own calibration: tables from its quick setup and a base spark map for its hardware.
    state.tune.ecu = buildEcu(state);
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
    const c = compoundHp(state);
    return CATEGORIES.reduce((sum, cat) => sum + getPart(state, cat.id).price, 0) + (c ? c.item.price + COMPOUND_KIT.price : 0);
  }
  // ---- Career: events, class rules and bracket racing -----------------------------------------------
  // Events are knock-out ladders. Heads-up: first to the finish wins. Bracket (dial-in): each driver
  // declares an ET; the slower dial starts earlier by the difference, first to the finish wins, but running
  // quicker than your dial is a breakout and loses (both break out: the smaller breakout wins). A red
  // light always loses. These are the standard NHRA/ET bracket rules.
  const STREET_TYRES = ['street', 'uhp', 'semislick'];
  const PUMP_FUELS = ['ron95', 'ron98', 'blend_wmi', 'e30', 'e85', 'flex'];
  const CAREER_EVENTS = Object.freeze([
    { id: 'street_night', name: 'Straatavond', format: 'heads_up', rounds: 2, entry: 150, prize: 700, rep: 10, repRequired: 0, prep: false, rivals: ['club', 'club'],
      rules: { tyres: STREET_TYRES, fuels: PUMP_FUELS }, detail: 'Pompbrandstof en straatbanden op een ongeprepte strip.' },
    { id: 'bracket_friday', name: 'Bracket Friday', format: 'bracket', rounds: 3, entry: 200, prize: 1600, rep: 20, repRequired: 0, prep: true, rivals: ['club', 'street', 'street'],
      rules: { tyres: STREET_TYRES }, detail: 'Dial-in racen: consistentie wint, niet vermogen. Straatbanden verplicht.' },
    { id: 'fwd_challenge', name: 'FWD Challenge', format: 'heads_up', rounds: 3, entry: 450, prize: 3500, rep: 30, repRequired: 30, prep: true, rivals: ['street', 'street', 'pro'],
      rules: { drivetrain: ['FWD'] }, detail: 'Alleen voorwielaandrijving. Tractie is het hele verhaal.' },
    { id: 'pro_bracket', name: 'Pro Bracket', format: 'bracket', rounds: 4, entry: 800, prize: 6500, rep: 45, repRequired: 60, prep: true, rivals: ['street', 'pro', 'pro', 'outlaw'],
      rules: {}, detail: 'Open klasse met dial-in. Vier rondes, geen fouten toegestaan.' },
    { id: 'outlaw_20', name: 'Outlaw 2.0', format: 'heads_up', rounds: 3, entry: 1500, prize: 14000, rep: 80, repRequired: 110, prep: true, rivals: ['pro', 'outlaw', 'outlaw'],
      rules: { maxDisplacementCc: 2100 }, detail: 'Heads-up tegen de snelste 2.0-liters. Alles mag.' }
  ]);
  const CAREER_EVENT_MAP = Object.fromEntries(CAREER_EVENTS.map(e => [e.id, e]));
  function defaultCareer() {
    return { rep: 0, events: 0, eventWins: 0, roundWins: 0, earnings: 0, active: null, history: [] };
  }
  // Why a build may not enter an event (empty = eligible).
  function careerEligibility(inputState, eventId) {
    const s = normalizeState(inputState, { noEcu: true }), ev = CAREER_EVENT_MAP[eventId], out = [];
    if (!ev) return ['Onbekend evenement.'];
    const r = ev.rules || {}, c = s.career || defaultCareer();
    if ((c.rep || 0) < ev.repRequired) out.push(`Reputatie ${ev.repRequired} nodig (nu ${c.rep || 0}).`);
    if (r.tyres && !r.tyres.includes(s.vehicle.tireCompound)) out.push(`Banden: alleen ${r.tyres.map(t => TIRE_MAP[t]?.name || t).join(', ')}.`);
    if (r.fuels && !r.fuels.includes(s.selections.fuel)) out.push('Brandstof: alleen pompbrandstof (geen race-brandstof of methanol).');
    if (r.drivetrain && !r.drivetrain.includes(s.vehicle.drivetrain)) out.push(`Aandrijving: alleen ${r.drivetrain.join('/')}.`);
    if (r.maxDisplacementCc && engineGeometry(s).displacementCc > r.maxDisplacementCc) out.push(`Cilinderinhoud max ${r.maxDisplacementCc} cc.`);
    if ((s.bank || 0) < ev.entry) out.push(`Inschrijfgeld € ${ev.entry} (budget te laag).`);
    return out;
  }
  // Round opponent: a rival build with its own consistency. dial = what it declares in a bracket.
  function planCareerRound(eventId, roundIdx, seed, rivalPasses) {
    const ev = CAREER_EVENT_MAP[eventId], rivalId = ev.rivals[Math.min(roundIdx, ev.rivals.length - 1)];
    const rand = mulberry32(fnv1a(`${eventId}|${roundIdx}|${seed}`));
    const base = rivalPasses?.[rivalId];
    const skill = { club: 0.6, street: 0.8, pro: 0.9, outlaw: 0.97 }[rivalId] ?? 0.8;
    const spread = 0.02 + (1 - skill) * 0.12;
    const etScale = base ? 1 + ((rand() - 0.5) * 2 * spread) / base.quarter : 1;
    const reactionTime = clamp(0.02 + (1 - skill) * 0.25 + (rand() - 0.3) * 0.08, -0.02, 0.45);
    const dialIn = base ? round(base.quarter + 0.02 + rand() * 0.06, 2) : null;
    return { eventId, round: roundIdx, rivalId, etScale, reactionTime, dialIn };
  }
  // Outcome of one round from both drivers' reaction time and elapsed time (and dial-ins in a bracket).
  // Times are from each driver's own green; in a bracket the lanes' greens differ by the dial difference.
  function raceOutcome(fmt, p, o) {
    const pRed = p.reactionTime < 0, oRed = o.reactionTime < 0;
    const pInvalid = pRed || !p.valid, oInvalid = oRed || !o.valid;
    if (fmt !== 'bracket') {
      const pT = p.reactionTime + p.et, oT = o.reactionTime + o.et;
      if (pInvalid !== oInvalid) return { won: !pInvalid, reason: pRed ? 'rode lamp' : pInvalid ? 'ongeldige run' : oRed ? 'rivaal rode lamp' : 'rivaal ongeldig', marginS: oT - pT };
      if (pInvalid && oInvalid) return { won: pRed ? false : !oRed ? pT < oT : true, reason: 'beiden ongeldig', marginS: oT - pT };
      return { won: pT < oT, reason: pT < oT ? 'eerst over de finish' : 'rivaal eerst over de finish', marginS: oT - pT };
    }
    // bracket: the slower dial starts first by the difference
    const maxDial = Math.max(p.dialIn, o.dialIn);
    const pFinish = (maxDial - p.dialIn) + p.reactionTime + p.et, oFinish = (maxDial - o.dialIn) + o.reactionTime + o.et;
    const pBreak = p.et < p.dialIn, oBreak = o.et < o.dialIn;
    const pPackage = p.reactionTime + (p.et - p.dialIn), oPackage = o.reactionTime + (o.et - o.dialIn);
    const base = { marginS: oFinish - pFinish, pPackage, oPackage, pBreakout: pBreak, oBreakout: oBreak };
    if (pRed !== oRed) return { ...base, won: !pRed, reason: pRed ? 'rode lamp' : 'rivaal rode lamp' };
    if (pRed && oRed) return { ...base, won: p.reactionTime > o.reactionTime, reason: 'beiden rode lamp: de kleinste wint' };
    if (pInvalid !== oInvalid) return { ...base, won: !pInvalid, reason: pInvalid ? 'ongeldige run' : 'rivaal ongeldig' };
    if (pBreak && oBreak) {
      const won = p.dialIn - p.et < o.dialIn - o.et;
      return { ...base, won, reason: `beiden break-out: ${won ? 'jouw' : 'zijn'} break-out was kleiner` };
    }
    if (pBreak !== oBreak) return { ...base, won: !pBreak, reason: pBreak ? `break-out: ${(p.dialIn - p.et).toFixed(3)} s sneller dan je dial-in` : 'rivaal break-out' };
    return { ...base, won: pFinish < oFinish, reason: pFinish < oFinish ? 'eerst over de finish op je dial-in' : 'rivaal eerst over de finish' };
  }
  function startCareerEvent(inputState, eventId, nowIso = new Date().toISOString()) {
    const s = normalizeState(inputState), ev = CAREER_EVENT_MAP[eventId];
    const why = careerEligibility(s, eventId);
    if (why.length) throw new Error(why[0]);
    s.bank -= ev.entry;
    s.career = { ...defaultCareer(), ...(s.career || {}) };
    s.career.events += 1;
    s.career.active = { eventId, round: 0, seed: s.career.events, dialIn: null, results: [], startedAt: nowIso };
    return s;
  }
  // Applies a finished round. Win: next round or event win (prize + reputation). Loss: eliminated.
  function applyCareerRound(inputState, outcome, info = {}) {
    const s = normalizeState(inputState), c = s.career, a = c?.active;
    if (!a) return s;
    const ev = CAREER_EVENT_MAP[a.eventId];
    a.results.push({ round: a.round + 1, won: !!outcome.won, reason: outcome.reason, marginS: round(outcome.marginS || 0, 3), et: info.et, rt: info.rt, dialIn: info.dialIn, rival: info.rivalId, pPackage: outcome.pPackage });
    if (outcome.won) { c.roundWins += 1; c.rep += Math.round(ev.rep / ev.rounds); }
    const finished = !outcome.won || a.round + 1 >= ev.rounds;
    if (!finished) { a.round += 1; return s; }
    const champion = !!outcome.won;
    if (champion) { c.eventWins += 1; c.rep += ev.rep; s.bank += ev.prize; c.earnings += ev.prize; }
    c.history = [{ eventId: a.eventId, name: ev.name, champion, rounds: a.results.length, at: a.startedAt, results: a.results }, ...(c.history || [])].slice(0, 20);
    c.active = null;
    s.history = [{ type: 'career', at: new Date().toISOString(), label: champion ? `${ev.name} gewonnen (+€${ev.prize})` : `${ev.name}: uitgeschakeld in ronde ${a.results.length}` }, ...(s.history || [])].slice(0, 40);
    return s;
  }

  function evaluateChallenges(inputState) {
    const s = normalizeState(inputState, { noEcu: true }),
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
      pNo = bigNo.samples.find(p => p.rpm === 5500)?.boostBar || 0,
      pYes = bigYes.samples.find(p => p.rpm === 5500)?.boostBar || 0;
    add('98-mm spool assistance werkt', pYes > pNo * 2 + 0.3, `${pNo.toFixed(2)}→${pYes.toFixed(2)} bar @5500`);
    const lowOil = blankState();
    lowOil.service.liters = 3.9;
    const lowR = simulateEngine(lowOil, { noise: false });
    add(
      'Laag oliepeil verlaagt marge',
      lowR.status === 'completed' && lowR.reliabilityScore < randy.reliabilityScore,
      `${lowR.reliabilityScore}<${randy.reliabilityScore}`
    );
    const badAssembly = blankState();
    badAssembly.assembly.topRingGapMm = 0.3;
    const badR = simulateEngine(badAssembly, { noise: false });
    add(
      'Krappe ringgap verlaagt marge',
      badR.status === 'aborted' || (badR.reliabilityScore !== null && badR.reliabilityScore < randy.reliabilityScore),
      badR.status === 'aborted' ? `afgebroken @${badR.abortRpm}` : `${badR.reliabilityScore}<${randy.reliabilityScore}`
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
    buildMassKg,
    airDensity,
    densityAltitude,
    oilHealth,
    simulateEngine,
    engineHardware,
    buildEcu,
    validEcu,
    syncEcuFromQuickSetup,
    regenerateBaseMap,
    generateSparkMap,
    tableLookup,
    ecuBoostTarget,
    ecuCell,
    ECU_RPM_AXIS,
    ECU_LOAD_AXIS,
    ECU_GEARS,
    ENGINE_MODEL_VERSION,
    VEHICLE_MODEL_VERSION,
    Engine,
    DYNO_CORRECTIONS,
    CAREER_EVENTS,
    CAREER_EVENT_MAP,
    defaultCareer,
    careerEligibility,
    planCareerRound,
    raceOutcome,
    startCareerEvent,
    applyCareerRound,
    buildEngineMap,
    engineMapLookup,
    createRaceRuntime,
    createBurnoutRuntime,
    hopWearPct,
    hopMode,
    makeTyreThermal,
    tyreThermalStep,
    tyreThermalAfter,
    tyreGripTempC,
    tyreTempFactor,
    TYRE,
    TYRE_THERMAL,
    simulateRaceRun,
    optimalShiftRpms,
    DRIVELINE,
    TYRE,
    correctionFactor,
    dynoLossKw,
    dynoSoakAt,
    advanceDynoThermal,
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
    rpmLimitChain,
    effectiveRevLimit,
    COMPOUND_KIT,
    compoundHp,
    ADVICE_PRICE,
    adviceCandidates,
    applyAdvicePatch,
    adviceBaseline,
    evaluateAdvice,
    rankAdvice,
    adviceCombination,
    mergeAdvice,
    MAP_TUNES,
    createMapOptimizer,
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
