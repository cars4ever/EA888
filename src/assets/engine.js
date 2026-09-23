/* EA888 Lab engine model (phase 4).
 * Mean-value breathing + zero-dimensional closed-cycle combustion per operating point:
 *   - trapped air from a volumetric-efficiency model: inlet Mach index (Taylor), cam/runner tuning,
 *     backpressure (Heywood ideal-cycle), residual gas and overlap scavenging;
 *   - single-zone pressure/temperature from IVC to EVO: Wiebe heat release, Woschni wall heat loss,
 *     temperature-dependent ratio of specific heats;
 *   - end-gas auto-ignition from the Douaud-Eyzat induction-time correlation with the Kalghatgi
 *     octane index (RON - K*S), so boost, charge temperature, octane, ethanol cooling, rpm and
 *     residuals decide the knock limit;
 *   - friction (Chen-Flynn), pumping work from manifold and exhaust pressure, fuel-pump drive work;
 *   - exhaust temperature from the cycle state at exhaust valve opening.
 * It is used by the dyno, the realtime race and the rival alike. Engineering game model: calibrated to
 * public reference points (see data/engine/), not a validated engine simulation.
 */
(function (root) {
  'use strict';
  const DATA = typeof module !== 'undefined' && module.exports ? require('./engine-data.js') : root.EA888_ENGINE_DATA;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const R_AIR = 287.05;
  const CP_AIR = 1005;
  const ATM = 1.01325;
  const WIEBE_A = 5;
  const WIEBE_M = 2;
  // Fraction of the Wiebe duration between 10 % and 90 % burned (a = 5, m = 2).
  const WIEBE_10_90 = Math.pow(Math.log(10) / WIEBE_A, 1 / (WIEBE_M + 1)) - Math.pow(-Math.log(0.9) / WIEBE_A, 1 / (WIEBE_M + 1));
  const K = DATA.calibration;

  // ---- fuels ---------------------------------------------------------------
  // Blend properties from the pure components. Octane numbers blend linearly in molar fraction
  // (Anderson et al., SAE 2012-01-1274); energy, stoichiometry and heat of vaporisation by mass.
  function fuelBlend(spec) {
    const comp = DATA.fuelComponents;
    const parts = Object.entries(spec.volume || { gasoline: 1 }).filter(([, v]) => v > 0);
    const totalV = parts.reduce((s, [, v]) => s + v, 0) || 1;
    let mass = 0, moles = 0;
    const acc = { lhv: 0, afr: 0, hfg: 0, ron: 0, mon: 0 };
    const rows = parts.map(([id, v]) => {
      const c = id === 'gasoline' ? { ...comp.gasoline, ron: spec.gasolineRon ?? comp.gasoline.ron, mon: spec.gasolineMon ?? comp.gasoline.mon } : comp[id];
      const m = (v / totalV) * c.densityKgL;
      const n = m / c.molarMass;
      mass += m;
      moles += n;
      return { c, m, n };
    });
    for (const { c, m, n } of rows) {
      acc.lhv += c.lhvMJkg * m;
      acc.afr += c.afrSt * m;
      acc.hfg += c.hfgKJkg * m;
      acc.ron += c.ron * n;
      acc.mon += c.mon * n;
    }
    const ethanol = rows.find(r => r.c === comp.ethanol);
    const methanol = rows.find(r => r.c === comp.methanol);
    const oxy = (ethanol ? ethanol.m : 0) + (methanol ? methanol.m : 0);
    return {
      lhvMJkg: acc.lhv / mass,
      afrSt: acc.afr / mass,
      hfgKJkg: acc.hfg / mass,
      ron: spec.ronOverride ?? acc.ron / moles,
      mon: spec.monOverride ?? acc.mon / moles,
      densityKgL: mass,
      ethanolMassFrac: ethanol ? ethanol.m / mass : 0,
      alcoholMassFrac: oxy / mass,
      // laminar flame speed relative to gasoline: alcohols burn faster
      flameSpeed: 1 + 0.12 * (oxy / mass) + (methanol ? 0.06 * (methanol.m / mass) : 0)
    };
  }

  // Kalghatgi octane index OI = RON - K*S. K becomes negative in boosted, low end-gas-temperature
  // conditions (K ~ -0.5 .. -1 measured on modern turbo DI engines): high-sensitivity fuels such as
  // ethanol then resist knock better than their RON suggests.
  function octaneIndex(fuel, mapBarAbs) {
    const k = clamp(K.kalghatgiK0 + K.kalghatgiKPerBar * (mapBarAbs - ATM), -1.1, 0.4);
    return { oi: fuel.ron - k * (fuel.ron - fuel.mon), k };
  }

  // Saturation vapour pressure over water (Buck 1981), kPa.
  function saturationKpa(tC) {
    return 0.61121 * Math.exp((18.678 - tC / 234.5) * (tC / (257.14 + tC)));
  }
  // Dry-air partial pressure: only the oxygen in dry air burns fuel.
  function dryAirBar(baroBar, tC, humidityPct) {
    return baroBar - (clamp(humidityPct, 0, 100) / 100) * saturationKpa(tC) / 100;
  }

  // ---- geometry --------------------------------------------------------------
  function makeGeometry(g) {
    const B = g.boreMm / 1000, S = g.strokeMm / 1000, L = (g.rodMm || 144) / 1000, a = S / 2;
    const area = (Math.PI / 4) * B * B;
    const vd = area * S, vc = vd / (g.compressionRatio - 1);
    const cyl = g.cylinders || 4;
    const vol = th => {
      const s = Math.sin(th), c = Math.cos(th);
      return vc + area * (L + a - (a * c + Math.sqrt(L * L - a * a * s * s)));
    };
    const wallArea = th => 2 * area * 1.08 + Math.PI * B * ((vol(th) - vc) / area + (vc / area));
    return { B, S, L, a, area, vd, vc, cyl, vol, wallArea, displacementL: vd * cyl * 1000, rc: g.compressionRatio };
  }

  // ---- breathing ---------------------------------------------------------------
  // Air volumetric efficiency relative to manifold density.
  function breathing(p) {
    const { head, geo, rpm, mapBarAbs, empBarAbs, manifoldK } = p;
    const camAdv = Number(p.camAdvanceDeg) || 0;
    const sp = (2 * geo.S * rpm) / 60;
    const a0 = Math.sqrt(1.4 * R_AIR * manifoldK);
    // Taylor inlet Mach index: Z = (B/Di)^2 Sp / (Ci a); VE falls off above Z ~ 0.5.
    const z = ((geo.B * geo.B) / (head.intakeValves * Math.pow(head.intakeValveMm / 1000, 2))) * sp / (head.ci * a0);
    const fMach = 1 - K.machK * Math.pow(Math.max(0, z - 0.5), 1.5);
    // Cam / runner tuning: advancing the intake cam closes the valve earlier, which traps more at low
    // rpm and less at high rpm.
    const tune = head.tuneRpm - K.camRpmPerDeg * (camAdv - head.camRefDeg);
    const lo = Math.max(0, (tune - rpm) / tune), hi = Math.max(0, (rpm - tune) / tune);
    const fDyn = 1 - head.kLow * lo * lo - head.kHigh * hi * hi;
    // Backpressure: ideal-cycle volumetric efficiency (Heywood eq. 5.x), normalised to pe = pi.
    const g = 1.35, rc = geo.rc, pr = empBarAbs / mapBarAbs;
    const ideal = x => (g - 1) / g + (rc - x) / (g * (rc - 1));
    let fBp = ideal(pr) / ideal(1);
    // Overlap: with pi > pe fresh charge scavenges the clearance volume (twin-scroll pulse effect);
    // with pe > pi exhaust flows back into the intake.
    const overlap = clamp(head.overlap + K.overlapPerCamDeg * (camAdv - head.camRefDeg), 0, 1.5);
    const rpmOverlapWeight = clamp(1.25 - rpm / 6000, 0.1, 1);
    if (pr < 1) fBp += K.scavengeGain * overlap * rpmOverlapWeight * (1 - pr) * (p.twinScroll ? 1.35 : 1);
    const ve = Math.max(0.2, head.vePeak * fMach * fDyn * fBp);
    // Residual burned-gas mass fraction: clearance-volume residual plus overlap backflow.
    const tExh = p.exhaustK || 1150;
    const xr = clamp((pr / rc) * (manifoldK / tExh) * K.residualScale + K.backflow * overlap * rpmOverlapWeight * Math.max(0, pr - 1), 0.01, 0.3);
    // Effective compression: the intake valve closes after BDC; advancing the cam closes it earlier.
    const ivcDeg = head.ivcAbdcDeg - camAdv;
    return { ve, z, fMach, fDyn, fBp, xr, overlap, ivcDeg, meanPistonSpeed: sp, tuneRpm: tune };
  }

  // ---- combustion --------------------------------------------------------------
  function burnDuration(p) {
    // 10-90 % burn angle, crank degrees. Turbulent flame speed scales roughly with rpm, so the
    // duration in crank angle grows slowly; rich mixtures burn fastest, residual gas and water slow it.
    const rpmF = Math.pow(Math.max(800, p.rpm) / 2000, K.burnRpmExp);
    const lam = p.lambda;
    const lamF = 1 + 1.5 * Math.pow(lam - 0.88, 2) + (lam > 1.05 ? 2.5 * (lam - 1.05) : 0);
    const dil = 1 + K.burnDilution * p.xr + 2.2 * (p.waterPerAir || 0);
    const dens = Math.pow(Math.max(0.5, p.densityRatio || 1), 0.08);
    return (K.burn1090At2000 * p.head.burnFactor * rpmF * lamF * dil * dens) / p.fuel.flameSpeed;
  }

  // Heat released per unit of stoichiometric fuel energy vs lambda: fuel-limited when lean; air-limited
  // when rich with a small gain from the extra charge cooling / molar expansion (maximum power around
  // lambda 0.85) and losses from wall wetting when very rich.
  function heatReleaseFactor(lambda) {
    if (lambda >= 1) return 0.985 / lambda;
    return 0.985 + 0.045 * (1 - Math.exp(-(1 - lambda) / 0.05)) - 0.5 * Math.pow(Math.max(0, 0.84 - lambda), 1.5);
  }

  const gammaAt = T => clamp(1.38 - 7.5e-5 * (T - 300), 1.24, 1.38);

  // One closed cycle IVC -> EVO. Returns gross IMEP, peak pressure, knock index, exhaust state.
  function cycle(p) {
    const geo = p.geo, rpm = p.rpm;
    const d2r = Math.PI / 180;
    const thIvc = -180 + p.ivcDeg, thEvo = 180 - p.head.evoBbdcDeg;
    const step = p.stepDeg || 1;
    const vIvc = geo.vol(thIvc * d2r);
    // Trapped mass: fresh air from VE, fuel vapour, residual gas.
    const rhoMan = (p.mapBarAbs * 1e5) / (R_AIR * p.manifoldK);
    const mAir = p.ve * rhoMan * geo.vd * (p.dryFraction ?? 1);
    const mFuel = mAir / (p.fuel.afrSt * p.lambda);
    const mRes = mAir * p.xr / (1 - p.xr);
    const mWater = mAir * (p.waterPerAir || 0);
    const m = mAir + mFuel + mRes + mWater;
    // Charge temperature at IVC: wall heating in the port, hot residual gas, then evaporative cooling
    // of the fuel (and water) that evaporates in the cylinder.
    const tRes = p.exhaustK || 1150;
    const tFresh = p.manifoldK + K.portHeatingK * clamp(1.3 - p.meanPistonSpeed / 25, 0.5, 1.3);
    const tMixed = (tFresh * (mAir + mFuel) + tRes * mRes * 1.1) / (mAir + mFuel + mRes * 1.1);
    const evap = (p.evapFraction ?? K.diEvapFraction) * (mFuel * p.fuel.hfgKJkg * 1000) + (p.waterEvapFraction ?? 0.7) * mWater * (p.waterHfgKJkg || 2300) * 1000;
    const tIvc = Math.max(p.manifoldK - 40, tMixed - evap / (m * 1000));
    const pIvc = (m * R_AIR * tIvc) / vIvc;
    const lhv = p.fuel.lhvMJkg * 1e6;
    const qTotal = mAir / p.fuel.afrSt * lhv * heatReleaseFactor(p.lambda) * (p.combustionEff ?? 1);
    const dur1090 = p.burn1090Deg;
    const durTot = dur1090 / WIEBE_10_90;
    const thSoc = -p.sparkDeg + (p.ignitionDelayDeg ?? K.ignitionDelayDeg);
    const xb = th => (th <= thSoc ? 0 : 1 - Math.exp(-WIEBE_A * Math.pow((th - thSoc) / durTot, WIEBE_M + 1)));
    const oi = p.octaneIndex;
    const tauScale = K.knockTauScale * 17.68 * Math.pow(oi / 100, 3.402);
    const dtPerDeg = 1 / (6 * rpm);
    const sp = p.meanPistonSpeed;
    const tWall = K.wallK;
    let P = pIvc, V = vIvc, T = tIvc, x = 0;
    let pMot = pIvc, pMax = P, thPmax = thIvc, work = 0, qLoss = 0, knockInt = 0, knockAt = null, xbAtKnock = 1;
    const tuRef = tIvc, puRef = pIvc;
    const gU = gammaAt(tIvc);
    for (let th = thIvc; th < thEvo - 1e-9; th += step) {
      const th2 = Math.min(thEvo, th + step);
      const V2 = geo.vol(th2 * d2r), dV = V2 - V;
      const x2 = xb(th2), dQ = qTotal * (x2 - x);
      const g = gammaAt(T);
      // Woschni: w = C1 Sp + C2 Vd T1/(p1 V1) (p - p_mot) during combustion.
      const w = 2.28 * sp + (th > thSoc ? 3.24e-3 * (geo.vd * tIvc / (pIvc * vIvc)) * Math.max(0, P - pMot) : 0);
      const h = K.woschniScale * 3.26 * Math.pow(geo.B, -0.2) * Math.pow(P / 1000, 0.8) * Math.pow(T, -0.55) * Math.pow(w, 0.8);
      const dQw = h * geo.wallArea(th * d2r) * (T - tWall) * dtPerDeg * step;
      const P2 = Math.max(1e3, P + ((g - 1) / V) * (dQ - dQw) - (g * P * dV) / V);
      pMot = pMot * Math.pow(V / V2, gammaAt(pMot * V / (m * R_AIR)));
      work += 0.5 * (P + P2) * dV;
      qLoss += dQw;
      P = P2; V = V2; x = x2;
      T = (P * V) / (m * R_AIR);
      if (P > pMax) { pMax = P; thPmax = th2; }
      // End gas: unburned zone compressed isentropically; Douaud-Eyzat induction time (ms).
      if (x < 0.9 && knockAt === null) {
        // Wall heat loss from the end gas (ignored by a single-zone isentropic estimate) grows with the time
        // since intake valve closing: slow cycles give the unburned gas more time to cool.
        const elapsedMs = (th2 - thIvc) * dtPerDeg * 1000;
        const tu = tuRef * Math.pow(P / puRef, (gU - 1) / gU) - (K.endGasCoolKPerMs || 0) * elapsedMs;
        const tauMs = tauScale * Math.pow(P / 101325, -1.7) * Math.exp((K.knockActivationK || 3800) / tu);
        knockInt += (dtPerDeg * step * 1000) / tauMs;
        if (knockInt >= 1) { knockAt = th2; xbAtKnock = x; }
      }
    }
    const imepGross = work / geo.vd / 1e5;
    // Exhaust: isentropic blowdown from EVO to the exhaust manifold pressure plus the push-out stroke.
    const gE = gammaAt(T);
    const tBlow = T * Math.pow(Math.max(0.2, (p.empBarAbs * 1e5) / P), (gE - 1) / gE);
    const exhaustK = tBlow * K.exhaustMixing - K.exhaustPortLossK;
    const ca50 = thSoc + durTot * Math.pow(Math.log(2) / WIEBE_A, 1 / (WIEBE_M + 1));
    return {
      imepGrossBar: imepGross,
      pMaxBar: pMax / 1e5,
      thetaPmaxDeg: thPmax,
      ca50Deg: ca50,
      burn1090Deg: dur1090,
      knockIndex: knockInt,
      knockOnsetDeg: knockAt,
      endGasFraction: knockAt === null ? 0 : 1 - xbAtKnock,
      tIvcK: tIvc,
      pIvcBar: pIvc / 1e5,
      tEvoK: T,
      pEvoBar: P / 1e5,
      exhaustK,
      heatLossFrac: qLoss / Math.max(1, qTotal),
      mAirKg: mAir,
      mFuelKg: mFuel,
      qTotalJ: qTotal
    };
  }

  // ---- friction ------------------------------------------------------------------
  // Chen-Flynn FMEP (bar): A + B*Pmax + C*Sp + D*Sp^2; viscous terms scale with oil viscosity.
  function frictionBar(p) {
    const visc = p.viscosityFactor ?? 1;
    return K.fmepA + K.fmepB * p.pMaxBar + visc * (K.fmepC * p.meanPistonSpeed + K.fmepD * p.meanPistonSpeed * p.meanPistonSpeed) + (p.extraFmepBar || 0);
  }

  // ---- spark search ----------------------------------------------------------------
  function sparkSweep(base, fn) {
    // golden-section maximum of the gross IMEP over spark advance (deg BTDC)
    let lo = -10, hi = 55;
    const phi = (Math.sqrt(5) - 1) / 2;
    let x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo);
    let f1 = fn(x1), f2 = fn(x2);
    for (let i = 0; i < 16; i++) {
      if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + phi * (hi - lo); f2 = fn(x2); }
      else { hi = x2; x2 = x1; f2 = f1; x1 = hi - phi * (hi - lo); f1 = fn(x1); }
    }
    return 0.5 * (lo + hi);
  }

  // Complete operating point: breathing, MBT and knock-limited spark, the actual cycle at the ECU's
  // spark, pumping, friction, brake torque and exhaust state.
  // op: { geo, head, rpm, mapBarAbs, manifoldK, empBarAbs, lambda, fuel, sparkCmdDeg (null = MBT),
  //       camAdvanceDeg, twinScroll, exhaustK (previous estimate), waterPerAir, dryFraction,
  //       viscosityFactor, extraFmepBar, knockControl: {enabled, marginDeg}, combustionEff }
  function operatingPoint(op) {
    const br = breathing(op);
    const fuel = op.fuel;
    const rhoRatio = ((op.mapBarAbs * 1e5) / (R_AIR * op.manifoldK)) / 1.18;
    const base = {
      ...op,
      ve: br.ve * (op.veScale ?? 1),
      xr: br.xr,
      ivcDeg: br.ivcDeg,
      meanPistonSpeed: br.meanPistonSpeed,
      octaneIndex: octaneIndex(fuel, op.mapBarAbs).oi
    };
    base.burn1090Deg = burnDuration({ ...base, densityRatio: rhoRatio });
    const run = spark => cycle({ ...base, sparkDeg: spark, stepDeg: op.stepDeg || 2 });
    const mbt = op.mbtDeg ?? sparkSweep(base, s => run(s).imepGrossBar);
    // Knock-limited spark advance: highest advance whose end gas does not auto-ignite.
    let klsa = null;
    if (op.findKnockLimit !== false) {
      if (run(mbt).knockIndex < 1) klsa = Math.max(mbt, 55);
      else {
        let lo = -15, hi = mbt;
        if (run(lo).knockIndex >= 1) klsa = lo;
        else { for (let i = 0; i < 14; i++) { const mid = 0.5 * (lo + hi); if (run(mid).knockIndex < 1) lo = mid; else hi = mid; } klsa = lo; }
      }
    }
    const cmd = Number.isFinite(op.sparkCmdDeg) ? op.sparkCmdDeg : mbt;
    let spark = cmd, knockRetardDeg = 0;
    const kc = op.knockControl || {};
    if (kc.enabled && klsa !== null && cmd > klsa - (kc.marginDeg ?? 1)) {
      spark = Math.max(cmd - (kc.maxRetardDeg ?? 15), klsa - (kc.marginDeg ?? 1));
      knockRetardDeg = cmd - spark;
    }
    const c = cycle({ ...base, sparkDeg: spark, stepDeg: op.stepDeg || 1 });
    const cMbt = cycle({ ...base, sparkDeg: mbt, stepDeg: op.stepDeg || 2 });
    // Pumping: exhaust pressure against manifold pressure plus valve flow losses at high piston speed.
    const flowLoss = K.valveLossBar * Math.pow(br.meanPistonSpeed / 20, 2) * Math.pow(K.referenceCi / op.head.ci, 2);
    const pmep = op.empBarAbs - op.mapBarAbs + flowLoss;
    const fmep = frictionBar({ pMaxBar: c.pMaxBar, meanPistonSpeed: br.meanPistonSpeed, viscosityFactor: op.viscosityFactor, extraFmepBar: op.extraFmepBar });
    const bmep = c.imepGrossBar - pmep - fmep;
    const geo = op.geo;
    const torqueNm = (bmep * 1e5 * geo.vd * geo.cyl) / (4 * Math.PI);
    const cyclesPerS = op.rpm / 120;
    const airKgS = c.mAirKg * geo.cyl * cyclesPerS;
    const fuelKgS = c.mFuelKg * geo.cyl * cyclesPerS;
    const kw = (torqueNm * op.rpm * 2 * Math.PI) / 60 / 1000;
    return {
      rpm: op.rpm,
      torqueNm,
      kw,
      hp: kw * 1.341022,
      ps: kw * 1.359622,
      imepBar: c.imepGrossBar,
      pmepBar: pmep,
      fmepBar: fmep,
      bmepBar: bmep,
      pMaxBar: c.pMaxBar,
      thetaPmaxDeg: c.thetaPmaxDeg,
      ca50Deg: c.ca50Deg,
      burn1090Deg: c.burn1090Deg,
      sparkDeg: spark,
      sparkCmdDeg: cmd,
      mbtDeg: mbt,
      klsaDeg: klsa,
      knockRetardDeg,
      knockIndex: c.knockIndex,
      knockOnsetDeg: c.knockOnsetDeg,
      endGasFraction: c.endGasFraction,
      sparkEfficiency: c.imepGrossBar / Math.max(0.01, cMbt.imepGrossBar),
      ve: base.ve,
      residualFrac: br.xr,
      machIndex: br.z,
      meanPistonSpeed: br.meanPistonSpeed,
      ivcDeg: br.ivcDeg,
      tIvcC: c.tIvcK - 273.15,
      exhaustK: c.exhaustK,
      egtC: c.exhaustK - 273.15,
      heatLossFrac: c.heatLossFrac,
      airKgS,
      fuelKgS,
      bsfcGkWh: kw > 0.5 ? (fuelKgS * 3.6e6) / kw : null,
      octaneIndex: base.octaneIndex,
      lambda: op.lambda
    };
  }

  // ---- fuel delivery ------------------------------------------------------------------
  // sys: data/engine/fuel-systems.json entry (resolved). Returns what the hardware delivers for the
  // requested fuel mass flow: the rail pressure falls when the pump cannot keep up, direct injection
  // is limited by the time window per cycle, port injection by duty and the low-pressure pump.
  function fuelDelivery(sys, q) {
    const rho = q.fuel.densityKgL; // kg/L = g/cc
    const demandCcS = (q.demandKgS * 1000) / rho;
    const rps = q.rpm / 60;
    const pumps = DATA.pumps, inj = DATA.injectors;
    const hp = sys.hpfp ? pumps[sys.hpfp] : null, di = sys.di ? inj[sys.di] : null;
    const mpi = sys.mpi ? inj[sys.mpi] : null, lp = sys.lpfp ? pumps[sys.lpfp] : null, mech = sys.mechanical ? pumps[sys.mechanical] : null;
    const lpCcS = lp ? (lp.lphAt5Bar * 1000) / 3600 : Infinity;
    const railTarget = hp ? Math.min(q.railTargetBar || hp.maxRailBar, hp.maxRailBar) : 0;
    const hpfpCcS = p => (hp ? hp.ccPerRev * rps * clamp(1 - 0.0011 * p, 0.5, 1) : 0);
    const window = (sys.injectionWindowDeg || 0) / 720; // fraction of the cycle a DI injector may inject
    const diCcS = p => (di ? 4 * (di.ccMinAt100Bar / 60) * Math.sqrt(Math.max(0, p - q.mapBarAbs) / 100) * window : 0);
    // Port injection: static flow at its regulated pressure (rising-rate: above manifold pressure), 90 % duty.
    const mpiCcS = mpi ? (sys.mpiCount || 4) * (mpi.ccMinAt3Bar / 60) * Math.sqrt((sys.mpiPressureBar || 4) / 3) * 0.9 : 0;
    const mechCcS = mech ? ((mech.lphPer1000Rpm * (sys.mechanicalScale || 1) * q.rpm) / 1000) * (1000 / 3600) : Infinity;
    // ECU split: direct injection first (up to 85 % of its capacity when port injectors exist), port injection on top.
    let rail = railTarget, diCc = 0, mpiCc = 0, limitedBy = '';
    if (di) {
      const diShare = mpi ? Math.min(demandCcS, 0.85 * Math.min(diCcS(railTarget), hpfpCcS(railTarget))) : demandCcS;
      // Rail pressure: highest pressure at which the pump still supplies what the injectors draw.
      for (let p = railTarget; p >= 30; p -= 2) {
        rail = p;
        const need = Math.min(diShare, diCcS(p));
        if (hpfpCcS(p) >= need - 1e-9) break;
      }
      diCc = Math.min(diShare, diCcS(rail), hpfpCcS(rail));
      if (diCc < diShare - 1e-6) limitedBy = hpfpCcS(rail) <= diCcS(rail) ? 'hpfp' : 'di-window';
    }
    if (mpi) {
      mpiCc = Math.min(Math.max(0, demandCcS - diCc), mpiCcS, mech ? mechCcS : Infinity);
      if (diCc + mpiCc < demandCcS - 1e-6 && !limitedBy) limitedBy = mech && mechCcS < mpiCcS ? 'mech-pump' : 'mpi';
    }
    let total = diCc + mpiCc;
    if (total > lpCcS) { total = lpCcS; limitedBy = 'lpfp'; }
    const diCycleCc = di && q.rpm > 0 ? diCc / 4 / (q.rpm / 120) : 0;
    const diFlowAtRail = di ? (di.ccMinAt100Bar / 60) * Math.sqrt(Math.max(0, rail - q.mapBarAbs) / 100) : 0;
    const diPulseMs = diFlowAtRail > 0 ? (diCycleCc / diFlowAtRail) * 1000 : 0;
    const cycleMs = q.rpm > 0 ? 120000 / q.rpm : 0;
    return {
      deliveredKgS: (total * rho) / 1000,
      demandKgS: q.demandKgS,
      shortfallPct: demandCcS > 0 ? Math.max(0, (1 - total / demandCcS) * 100) : 0,
      railBar: di ? rail : null,
      railTargetBar: di ? railTarget : null,
      diDutyPct: di && window > 0 ? (diPulseMs / (cycleMs * window)) * 100 : 0,
      diPulseMs,
      hpfpDutyPct: hp ? (diCc / Math.max(1e-9, hpfpCcS(rail))) * 100 : 0,
      mpiDutyPct: mpi ? (mpiCc / Math.max(1e-9, mpiCcS / 0.9)) * 100 : 0,
      diShareCcS: diCc,
      mpiShareCcS: mpiCc,
      capacityCcS: Math.min((di ? Math.min(diCcS(rail), hpfpCcS(rail)) : 0) + (mpi ? Math.min(mpiCcS, mechCcS) : 0), lpCcS),
      limitedBy,
      dutyPct: demandCcS > 0 ? (demandCcS / Math.max(1e-9, Math.min((di ? Math.min(diCcS(railTarget), hpfpCcS(railTarget)) : 0) + (mpi ? Math.min(mpiCcS, mechCcS) : 0), lpCcS))) * 100 : 0
    };
  }

  // Engine air mass flow for the turbo matcher at a boost/manifold state (kg/s), without a cycle.
  function airflowKgS(op) {
    const br = breathing(op);
    const rhoMan = (op.mapBarAbs * 1e5) / (R_AIR * op.manifoldK);
    return br.ve * (op.veScale ?? 1) * rhoMan * op.geo.vd * op.geo.cyl * (op.rpm / 120) * (op.dryFraction ?? 1);
  }

  const Engine = {
    DATA,
    fuelBlend,
    octaneIndex,
    saturationKpa,
    dryAirBar,
    makeGeometry,
    breathing,
    burnDuration,
    heatReleaseFactor,
    cycle,
    frictionBar,
    operatingPoint,
    fuelDelivery,
    airflowKgS,
    WIEBE_10_90
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  root.EA888Engine = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
