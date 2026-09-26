/* EA888 Lab turbo matching model.
 * Compressor map lookup (corrected flow, pressure ratio -> shaft speed, efficiency,
 * surge/choke margin), turbine flow/power from the turbine flow curve, wastegate
 * split, charge-air losses and rotor inertia. Engineering game model, not a
 * turbo-matching tool: see data/turbo/ for provenance of every map.
 */
(function (root) {
  'use strict';
  const DATA = typeof module !== 'undefined' && module.exports ? require('./turbo-data.js') : root.EA888_TURBO_DATA;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const K_AIR = 0.2857; // (gamma-1)/gamma, air
  const K_EXH = 0.248; // (gamma-1)/gamma, exhaust gas (gamma 1.33)
  const CP_AIR = 1005;
  const CP_EXH = 1150;
  const MECH_EFF = 0.95;
  // Effective inertia multiplier for spool transients: the rotor alone would spool
  // unrealistically fast because exhaust-manifold filling and thermal lag are not
  // modeled explicitly. 1.35 puts a K04 on a 2.0 L within ~300 rpm of its steady
  // boost threshold in a 550 rpm/s dyno sweep (Bell: a matched street turbo lags a
  // few hundred rpm in a load-controlled pull, ~0.3-0.6 s).
  const TRANSIENT_INERTIA_FACTOR = 1.35;
  const LBMIN_PER_KGS = 132.277;
  const COMP_REF = { tK: 302.6, pBar: 0.9618 }; // Garrett compressor reference, 545 R / 13.95 psia
  const TURB_REF = { tK: 288.3, pBar: 1.01325 }; // turbine flow correction, 519 R / 14.696 psia

  // ---- geometry helpers ---------------------------------------------------
  function interp1(points, x) {
    // points sorted by [0]; linear, clamped at the ends
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i][0]) {
        const a = points[i - 1], b = points[i];
        return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-9, b[0] - a[0]);
      }
    }
    return points[points.length - 1][1];
  }
  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function polyDist(x, y, poly, closed) {
    let d = Infinity;
    const n = poly.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      d = Math.min(d, segDist(x, y, a[0], a[1], b[0], b[1]));
    }
    return d;
  }

  // ---- compiled compressor map -------------------------------------------
  const compiled = {};
  function compileMap(id) {
    const src = DATA.turbos[id];
    if (!src) return null;
    const wMax = Math.max(...src.chokeLine.map(p => p[0]));
    const prTop = Math.max(...src.surgeLine.map(p => p[1]), ...src.chokeLine.map(p => p[1]));
    const nx = w => w / wMax, ny = pr => (pr - 1) / (prTop - 1);
    const norm = list => list.map(([w, pr]) => [nx(w), ny(pr)]);
    // Surge and choke flow as functions of PR (both boundaries are single-valued in PR).
    const surgeByPr = [[1, 0], ...src.surgeLine.map(([w, pr]) => [pr, w])].sort((a, b) => a[0] - b[0]);
    const chokeSorted = src.chokeLine.map(([w, pr]) => [pr, w]).sort((a, b) => a[0] - b[0]);
    const c0 = chokeSorted[0], c1 = chokeSorted[1];
    const chokeSlope = (c1[1] - c0[1]) / Math.max(1e-6, c1[0] - c0[0]);
    const surgeFlow = pr => interp1(surgeByPr, pr);
    // The surge line read the other way: the highest pressure ratio this flow can hold stably. The line is
    // single-valued and rising in both directions, so the same table inverts.
    const surgeByFlow = surgeByPr.map(([pr, w]) => [w, pr]).sort((a, b) => a[0] - b[0]);
    const surgePr = w => interp1(surgeByFlow, w);
    const chokeFlow = pr => (pr < c0[0] ? Math.max(c0[1] * 0.3, c0[1] - chokeSlope * (c0[0] - pr)) : interp1(chokeSorted, pr));
    const lines = src.speedLines.slice().sort((a, b) => a.rpm - b.rpm);
    const lineN = norm(src.surgeLine), chokeN = norm(src.chokeLine);
    const islands = src.efficiencyIslands.slice().sort((a, b) => b.efficiency - a.efficiency).map(i => ({ eff: i.efficiency, poly: norm(i.polygon) }));

    function linePr(line, w) {
      const p = line.points;
      if (w <= p[0][0]) return p[0][1];
      const last = p[p.length - 1];
      if (w >= last[0]) return last[1] - 0.25 * (w - last[0]); // past choke the line drops steeply
      return interp1(p, w);
    }
    function shaftRaw(w, pr) {
      const prs = [];
      let prev = 1;
      for (const l of lines) { prev = Math.max(prev + 1e-4, linePr(l, w)); prs.push(prev); }
      const work = x => Math.max(0, Math.pow(Math.max(1, x), K_AIR) - 1);
      if (pr <= prs[0]) return lines[0].rpm * Math.sqrt(work(pr) / Math.max(1e-6, work(prs[0])));
      for (let i = 1; i < lines.length; i++)
        if (pr <= prs[i]) return lines[i - 1].rpm + ((lines[i].rpm - lines[i - 1].rpm) * (pr - prs[i - 1])) / (prs[i] - prs[i - 1]);
      const top = lines[lines.length - 1];
      return top.rpm * Math.sqrt(work(pr) / Math.max(1e-6, work(prs[prs.length - 1])));
    }
    function effRaw(w, pr) {
      const x = nx(w), y = ny(pr);
      let j = -1;
      for (let i = 0; i < islands.length; i++) if (pointInPolygon(x, y, islands[i].poly)) { j = i; break; }
      if (j === 0) return islands[0].eff;
      if (j > 0) {
        const dOut = polyDist(x, y, islands[j].poly, true), dIn = polyDist(x, y, islands[j - 1].poly, true);
        return islands[j].eff + ((islands[j - 1].eff - islands[j].eff) * dOut) / Math.max(1e-9, dOut + dIn);
      }
      const dS = polyDist(x, y, lineN, false), dC = polyDist(x, y, chokeN, false);
      const eB = (src.boundaryEfficiency.surge * dC + src.boundaryEfficiency.choke * dS) / Math.max(1e-9, dS + dC);
      const outer = islands[islands.length - 1];
      const dI = polyDist(x, y, outer.poly, true);
      const sW = surgeFlow(pr), cW = chokeFlow(pr);
      if (w < sW || w > cW) return clamp(eB - 0.9 * Math.min(dS, dC), 0.45, eB); // outside the map
      // Efficiency falls off much faster toward choke than toward surge (the vendor
      // contours bunch up near choke), so the choke side uses a steeper profile.
      const dB = Math.min(dS, dC), chokeSide = dS / Math.max(1e-9, dS + dC);
      const f = dB / Math.max(1e-9, dB + dI);
      return eB + (outer.eff - eB) * Math.pow(f, 1 + 1.2 * chokeSide);
    }
    // Precompute a lookup grid; bilinear interpolation at runtime.
    const GW = 64, GP = 64, wHi = wMax * 1.25, prHi = 1 + (prTop - 1) * 1.2;
    const gN = new Float64Array((GW + 1) * (GP + 1)), gE = new Float64Array((GW + 1) * (GP + 1));
    for (let i = 0; i <= GW; i++)
      for (let k = 0; k <= GP; k++) {
        const w = (wHi * i) / GW, pr = 1 + ((prHi - 1) * k) / GP;
        gN[i * (GP + 1) + k] = shaftRaw(w, pr);
        gE[i * (GP + 1) + k] = effRaw(w, pr);
      }
    function grid(g, w, pr) {
      const fi = clamp((w / wHi) * GW, 0, GW - 1e-9), fk = clamp(((pr - 1) / (prHi - 1)) * GP, 0, GP - 1e-9);
      const i = Math.floor(fi), k = Math.floor(fk), a = fi - i, b = fk - k, s = GP + 1;
      return (g[i * s + k] * (1 - a) + g[(i + 1) * s + k] * a) * (1 - b) + (g[i * s + k + 1] * (1 - a) + g[(i + 1) * s + k + 1] * a) * b;
    }
    const tc = src.turbine.flowCurve.slice().sort((a, b) => a[0] - b[0]);
    const tMax = Math.max(...tc.map(p => p[1]));
    const t0 = tc[0];
    const nozzle = er => Math.sqrt(Math.max(0, 1 - 1 / (er * er)));
    function turbineFlow(er) {
      // corrected lb/min at expansion ratio er; below the first digitized point
      // the flow follows the nozzle law down to zero at er = 1
      if (er <= 1) return 0;
      if (er < t0[0]) return (t0[1] * nozzle(er)) / nozzle(t0[0]);
      return interp1(tc, er);
    }
    const map = {
      id,
      source: src,
      wMax,
      prTop,
      maxShaftRpm: src.maxShaftRpm,
      peakEfficiency: src.peakEfficiency,
      surgeFlow,
      surgePr,
      chokeFlow,
      shaftRpm: (w, pr) => Math.max(0, w > wHi || pr > prHi ? shaftRaw(w, pr) : grid(gN, w, pr)),
      efficiency: (w, pr) => clamp(w > wHi || pr > prHi ? effRaw(w, pr) : grid(gE, w, pr), 0.4, src.peakEfficiency),
      efficiencyExact: effRaw,
      shaftRpmExact: shaftRaw,
      turbineFlow,
      turbineFlowMax: tMax,
      turbineNozzle: er => (tMax * nozzle(er)) / nozzle(4),
      // wastegate valve: an orifice with its own flow capacity, same nozzle law
      wastegateFlow: (er, wg) => ((wg.flowLbMin ?? (wg.flowRatio || 0) * tMax) * nozzle(er)) / nozzle(4),
      // total-to-static efficiency vs expansion ratio, shaped on Garrett turbine maps: ~88 % of peak at ER 1.3,
      // ~95 % at 1.5, the peak from ER ~1.8 (pulse flow from a twin-scroll housing adds ~3 %)
      turbineEfficiency: er => src.turbine.maxEfficiency * clamp(0.74 + (0.26 * (er - 1)) / 0.8, 0.74, 1) * (src.turbine.twinScroll ? 1.03 : 1),
      inertia: src.rotorInertiaKgM2
    };
    return map;
  }
  function getMap(id) {
    if (!(id in compiled)) compiled[id] = compileMap(id);
    return compiled[id];
  }

  function compressorPoint(map, w, pr) {
    const surgeW = map.surgeFlow(pr), chokeW = map.chokeFlow(pr);
    return {
      shaftRpm: map.shaftRpm(w, pr),
      efficiency: map.efficiency(w, pr),
      surgeFlowLbMin: surgeW,
      chokeFlowLbMin: chokeW,
      surgeMarginPct: ((w - surgeW) / Math.max(1e-6, surgeW)) * 100,
      chokeMarginPct: ((chokeW - w) / Math.max(1e-6, chokeW)) * 100
    };
  }

  // ---- engine/turbo matching ----------------------------------------------
  // ctx: { map, baroBar, ambientK, airflowAt(boostBar, manifoldK) -> kg/s,
  //   exhaustTempK(boostBar) -> K, chargeCooling(T2K, flowLbMin) -> manifold K,
  //   stoichAfr, lambda, chargeAir, exhaust, wastegate, protectShaftSpeed,
  //   extraExhaustKw, extraExhaustKgS }
  function makeEvaluator(ctx) {
    const { map, baroBar, ambientK } = ctx;
    const ca = ctx.chargeAir, ex = ctx.exhaust, wg = ctx.wastegate;
    const compCache = new Map();
    function compressor(B) {
      const key = Math.round(B * 1e5);
      if (compCache.has(key)) return compCache.get(key);
      let tMan = ambientK + 10, m = 0, lb = 0, p1 = baroBar, p2 = baroBar, pr = 1, wc = 0, eff = map.peakEfficiency, t2 = ambientK;
      for (let it = 0; it < 4; it++) {
        m = Math.max(1e-4, ctx.airflowAt(B, tMan));
        lb = m * LBMIN_PER_KGS;
        const q = lb / ca.refFlowLbMin;
        p1 = baroBar - ca.filterLossBarAtRef * q * q;
        p2 = baroBar + B + ca.lossBarAtRef * q * q;
        pr = Math.max(1, p2 / p1);
        wc = (lb * Math.sqrt(ambientK / COMP_REF.tK)) / (p1 / COMP_REF.pBar);
        eff = map.efficiency(wc, pr);
        t2 = ambientK * (1 + (Math.pow(pr, K_AIR) - 1) / eff);
        tMan = ctx.chargeCooling(t2, lb);
      }
      const pt = compressorPoint(map, wc, pr);
      const out = {
        boostBar: B, massFlowKgS: m, massFlowLbMin: lb, p1Bar: p1, p2Bar: p2, pressureRatio: pr, correctedFlowLbMin: wc,
        efficiency: eff, compressorOutK: t2, manifoldK: tMan, compressorKw: (m * CP_AIR * ambientK * (Math.pow(pr, K_AIR) - 1)) / eff / 1000,
        ...pt
      };
      compCache.set(key, out);
      return out;
    }
    // Turbine inlet pressure and shaft power for wastegate opening u (0 closed .. 1 fully open).
    function turbine(c, u) {
      const mExh = c.massFlowKgS * (1 + 1 / (ctx.stoichAfr * ctx.lambda)) + (ctx.extraExhaustKgS || 0);
      const lbExh = mExh * LBMIN_PER_KGS;
      const t3 = ctx.exhaustTempK(c.boostBar) + ((ctx.extraExhaustKw || 0) * 1000) / (mExh * CP_EXH);
      const p4 = baroBar + (2757 * ex.restriction * lbExh * lbExh) / Math.pow(ex.pipeMm, 4);
      const corr = p3 => p3 / TURB_REF.pBar / Math.sqrt(t3 / TURB_REF.tK);
      const flowAt = p3 => {
        const er = p3 / p4;
        return (map.turbineFlow(er) + u * map.wastegateFlow(er, wg)) * corr(p3);
      };
      let lo = p4 * 1.0005, hi = p4 * 9;
      if (flowAt(hi) < lbExh) lo = hi;
      else for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (flowAt(mid) < lbExh) lo = mid; else hi = mid; }
      const p3 = 0.5 * (lo + hi), er = p3 / p4;
      const turbLb = map.turbineFlow(er) * corr(p3);
      const turbKgS = Math.min(mExh, turbLb / LBMIN_PER_KGS);
      const kw = (map.turbineEfficiency(er) * turbKgS * CP_EXH * t3 * (1 - Math.pow(er, -K_EXH))) / 1000;
      return { p3Bar: p3, p4Bar: p4, expansionRatio: er, turbineKw: kw, turbineFlowKgS: turbKgS, exhaustFlowKgS: mExh, t3K: t3, wastegateFlowKgS: mExh - turbKgS };
    }
    const surplus = (B, u) => {
      const c = compressor(B);
      return MECH_EFF * turbine(c, u).turbineKw - c.compressorKw;
    };
    return { compressor, turbine, surplus };
  }

  // Largest B in [lo, hi] with pred(B) true, assuming pred is true at lo.
  function bisectMax(lo, hi, pred, iters = 22) {
    if (pred(hi)) return hi;
    for (let i = 0; i < iters; i++) { const mid = 0.5 * (lo + hi); if (pred(mid)) lo = mid; else hi = mid; }
    return lo;
  }

  // Steady-state operating point for a boost target, then (optionally) the
  // rotor-inertia-limited transient from prevShaftRpm over dtS seconds.
  function matchEngine(ctx, target) {
    const map = ctx.map;
    const ev = makeEvaluator(ctx);
    const B0 = Math.max(0, target.targetBoostBar);
    let B = B0, limitedBy = 'target';
    const nMax = map.maxShaftRpm;
    // 1. turbine power (spool): wastegate closed must be able to drive the compressor
    if (ev.surplus(B, 0) < 0) { B = bisectMax(0, B, b => ev.surplus(b, 0) >= 0); limitedBy = 'spool'; }
    // 2. choke: corrected flow cannot exceed the choke line at this PR
    const choked = b => { const c = ev.compressor(b); return c.correctedFlowLbMin <= c.chokeFlowLbMin; };
    if (!choked(B)) { B = bisectMax(0, B, choked); limitedBy = 'choke'; }
    // 3. shaft speed limit, when the controller can see it (or the tune enforces it)
    const underSpeed = b => ev.compressor(b).shaftRpm <= nMax * 0.98;
    if (ctx.protectShaftSpeed && !underSpeed(B)) { B = bisectMax(0, B, underSpeed); limitedBy = 'shaft-limit'; }
    // 4. surge. The surge line is a minimum flow at a given pressure ratio, so a compressor that surges at
    // the target does not get better by being asked for less boost - the flow falls with it and the margin
    // gets worse. bisectMax assumes a predicate that is true low and false high, so it used to drive the
    // boost down to where the compressor genuinely surged: a PT10603 on this engine came back at 0.80 bar
    // with the surge flag set, where at full flow it sits 18 % to the right of its own surge line. One
    // surging sample low down then poisoned the whole pull through the rotor-inertia chain, which is why an
    // oversized turbo made 350 pk instead of spooling late and pulling hard.
    // What surge does cost is pressure: in surge the flow breaks down and the compressor cannot hold more
    // than its own surge line allows at the flow it has. That is a ceiling on PR, which does fall with b,
    // so it can be bisected honestly.
    const stable = b => { const c = ev.compressor(b); return c.correctedFlowLbMin >= c.surgeFlowLbMin; };
    let surge = !stable(B);
    if (surge) {
      const prCap = map.surgePr(ev.compressor(B).correctedFlowLbMin);
      const withinLine = b => ev.compressor(b).pressureRatio <= prCap;
      if (!withinLine(B)) B = bisectMax(0, B, withinLine, 14);
      limitedBy = 'surge';
    }
    // 5. wastegate creep: even fully open the turbine over-drives the compressor
    if (limitedBy === 'target' && ev.surplus(B, 1) > 0) {
      const creep = bisectMax(B, B + 2.5, b => ev.surplus(b, 1) > 0 && choked(b) && (!ctx.protectShaftSpeed || underSpeed(b)));
      if (creep > B + 0.005) { B = creep; limitedBy = 'wastegate-creep'; }
    }
    const steady = ev.compressor(B);
    let shaftRpm = steady.shaftRpm, transient = false;
    // 6. rotor inertia: energy balance from the previous shaft speed
    if (Number.isFinite(target.prevShaftRpm) && target.dtS > 0 && target.prevShaftRpm < steady.shaftRpm - 1) {
      const I = map.inertia * TRANSIENT_INERTIA_FACTOR, steps = 4, dt = target.dtS / steps;
      let n = target.prevShaftRpm;
      const boostAtShaft = rpm => bisectMax(0, B, b => ev.compressor(b).shaftRpm <= rpm, 18);
      for (let s = 0; s < steps && n < steady.shaftRpm; s++) {
        const b = boostAtShaft(n);
        const surplusKw = Math.max(0, ev.surplus(b, 0));
        const w = (n * 2 * Math.PI) / 60;
        const e = 0.5 * I * w * w + surplusKw * 1000 * dt;
        n = Math.min(steady.shaftRpm, (Math.sqrt((2 * e) / I) * 60) / (2 * Math.PI));
      }
      if (n < steady.shaftRpm - 1) { B = boostAtShaft(n); shaftRpm = n; transient = true; limitedBy = 'spool-transient'; }
    }
    const c = ev.compressor(B);
    if (!transient) shaftRpm = c.shaftRpm;
    // Wastegate opening that balances the shaft at this point.
    let u = 0;
    if (limitedBy === 'wastegate-creep') u = 1;
    else if (limitedBy !== 'spool' && limitedBy !== 'spool-transient') {
      if (ev.surplus(B, 1) >= 0) u = 1;
      else if (ev.surplus(B, 0) > 0) { let lo = 0, hi = 1; for (let i = 0; i < 18; i++) { const mid = 0.5 * (lo + hi); if (ev.surplus(B, mid) > 0) lo = mid; else hi = mid; } u = 0.5 * (lo + hi); }
    }
    const t = ev.turbine(c, u);
    return {
      boostBar: B,
      targetBoostBar: B0,
      limitedBy,
      surge,
      shaftRpm,
      shaftSpeedPct: (shaftRpm / nMax) * 100,
      pressureRatio: c.pressureRatio,
      correctedFlowLbMin: c.correctedFlowLbMin,
      massFlowLbMin: c.massFlowLbMin,
      massFlowKgS: c.massFlowKgS,
      compressorEff: c.efficiency,
      compressorOutC: c.compressorOutK - 273.15,
      manifoldC: c.manifoldK - 273.15,
      surgeMarginPct: c.surgeMarginPct,
      chokeMarginPct: c.chokeMarginPct,
      compressorKw: c.compressorKw,
      turbineKw: t.turbineKw,
      empBarAbs: t.p3Bar,
      turbineOutBarAbs: t.p4Bar,
      expansionRatio: t.expansionRatio,
      wastegatePct: u * 100,
      wastegateFlowKgS: t.wastegateFlowKgS,
      exhaustFlowKgS: t.exhaustFlowKgS,
      t3C: t.t3K - 273.15
    };
  }

  // ---- compound (series) turbocharging ----------------------------------------
  // A small high-pressure (HP) turbo in series with the main low-pressure (LP) turbo:
  //   air:     filter -> LP compressor -> interstage duct -> HP compressor -> intercooler -> manifold
  //   exhaust: manifold -> HP turbine (+ bypass valve) -> LP turbine (+ wastegate) -> exhaust system
  // The pressure ratios multiply (PR = PR_lp * PR_hp, less the interstage loss). The HP compressor breathes
  // the hot, dense LP outlet air: the higher inlet pressure lowers its corrected flow (why a small wheel can
  // pass the flow), the interstage temperature raises its work. All exhaust passes both turbine stages: the
  // HP turbine expands from the manifold to the interstage pressure, the LP turbine from there to the
  // exhaust. The LP turbine sets the interstage pressure; its power sets the LP pressure ratio (its shaft
  // balances), the rest of the pressure ratio is the HP stage's job. Controller: the HP turbine bypass is
  // shut while spooling and modulates at the target; when the LP turbo alone can hold the target, the HP
  // compressor bypass (check valve) opens and the exhaust passes the open HP bypass (a small restriction).
  // No interstage intercooler is modeled (typical for gasoline compound kits).
  // empCapRatio: the controller keeps the manifold pressure below this multiple of the boost pressure (both
  // absolute) by opening the HP turbine bypass; a small HP turbine would otherwise choke the exhaust.
  const COMPOUND = { interstageLossBarAtRef: 0.035, hpBypassFlowRatio: 2.4, bypassVsLpFlow: 2.4, empCapRatio: 1.9 };
  const nozzleLaw = er => Math.sqrt(Math.max(0, 1 - 1 / (er * er)));
  function makeSeriesEvaluator(ctx, hp) {
    const lp = ctx.map, { baroBar, ambientK } = ctx, ca = ctx.chargeAir, ex = ctx.exhaust, wg = ctx.wastegate;
    const stageK = (tIn, pr, eff) => tIn * (1 + (Math.pow(pr, K_AIR) - 1) / eff);
    // the HP turbine bypass is sized for the full exhaust flow (at least the LP turbine's capacity)
    // The bypass is a port, not a turbine nozzle: wide open it must pass the whole exhaust with little
    // pressure drop. Sized at 1.1 x the LP turbine's flow it did not - at 6000 rpm it sat 100 % open and
    // still left EMP at 3.4 bar where the LP turbo alone makes 2.3, so the compound lost 45 Nm up top and
    // the setup only ever looked worse than the single turbo.
    const bypassLbMin = er => (Math.max(COMPOUND.hpBypassFlowRatio * hp.turbineFlowMax, COMPOUND.bypassVsLpFlow * lp.turbineFlowMax) * nozzleLaw(er)) / nozzleLaw(4);
    // pressure p (bar abs) where flow(p) = lb, flow increasing in p
    // (Illinois regula falsi: the flow curves are smooth and monotonic, ~6 evaluations to 1e-5)
    const solveP = (flow, lb, pOut) => {
      let a = pOut * 1.0005, b = pOut * 9, fa = flow(a) - lb, fb = flow(b) - lb, side = 0;
      if (fb < 0) return b;
      if (fa >= 0) return a;
      for (let i = 0; i < 30; i++) {
        const c = (a * fb - b * fa) / (fb - fa), fc = flow(c) - lb;
        if (Math.abs(fc) < lb * 1e-5 || Math.abs(b - a) < pOut * 1e-6) return c;
        if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
        else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
      }
      return (a * fb - b * fa) / (fb - fa);
    };
    // Air side at total boost B with the LP pressure ratio x (x = null: the full ratio on the LP stage).
    function air(B, m, x) {
      const lb = m * LBMIN_PER_KGS, q = lb / ca.refFlowLbMin;
      const p1 = baroBar - ca.filterLossBarAtRef * q * q, p2 = baroBar + B + ca.lossBarAtRef * q * q;
      const dpInt = COMPOUND.interstageLossBarAtRef * q * q;
      const xFull = Math.max(1, (p2 + dpInt) / p1);
      const xl = x == null ? xFull : clamp(x, 1, xFull);
      const wcLp = (lb * Math.sqrt(ambientK / COMP_REF.tK)) / (p1 / COMP_REF.pBar), effLp = lp.efficiency(wcLp, xl);
      const tI = stageK(ambientK, xl, effLp), pI = p1 * xl, pHi = Math.max(0.3, pI - dpInt), prHp = Math.max(1, p2 / pHi);
      const wcHp = (lb * Math.sqrt(tI / COMP_REF.tK)) / (pHi / COMP_REF.pBar), effHp = hp.efficiency(wcHp, prHp);
      const t2 = prHp > 1.0005 ? stageK(tI, prHp, effHp) : tI;
      const lpKw = (m * CP_AIR * ambientK * (Math.pow(xl, K_AIR) - 1)) / effLp / 1000;
      const hpKw = prHp > 1.0005 ? (m * CP_AIR * tI * (Math.pow(prHp, K_AIR) - 1)) / effHp / 1000 : 0;
      return { m, lb, p1, p2, pI, pHi, x: xl, xFull, prHp, wcLp, wcHp, effLp, effHp, tI, t2, lpKw, hpKw };
    }
    // Exhaust side for the engine flow m at boost B: HP turbine (bypass uHp) into the LP turbine (wastegate uLp).
    function exhaust(B, m, uHp, uLp) {
      const mExh = m * (1 + 1 / (ctx.stoichAfr * ctx.lambda)) + (ctx.extraExhaustKgS || 0), lbExh = mExh * LBMIN_PER_KGS;
      const t3 = ctx.exhaustTempK(B) + ((ctx.extraExhaustKw || 0) * 1000) / (mExh * CP_EXH);
      const p4 = baroBar + (2757 * ex.restriction * lbExh * lbExh) / Math.pow(ex.pipeMm, 4);
      const corr = (p, t) => p / TURB_REF.pBar / Math.sqrt(t / TURB_REF.tK);
      let tI = t3, pI = p4, p3 = p4, hpKw = 0, hpKgS = 0, erH = 1;
      for (let it = 0; it < 2; it++) {
        pI = solveP(p => (lp.turbineFlow(p / p4) + uLp * lp.wastegateFlow(p / p4, wg)) * corr(p, tI), lbExh, p4);
        p3 = solveP(p => (hp.turbineFlow(p / pI) + uHp * bypassLbMin(p / pI)) * corr(p, t3), lbExh, pI);
        erH = p3 / pI;
        hpKgS = Math.min(mExh, (hp.turbineFlow(erH) * corr(p3, t3)) / LBMIN_PER_KGS);
        hpKw = (hp.turbineEfficiency(erH) * hpKgS * CP_EXH * t3 * (1 - Math.pow(erH, -K_EXH))) / 1000;
        tI = t3 - (hpKw * 1000) / (mExh * CP_EXH);
      }
      const erL = pI / p4, lpKgS = Math.min(mExh, (lp.turbineFlow(erL) * corr(pI, tI)) / LBMIN_PER_KGS);
      const lpKw = (lp.turbineEfficiency(erL) * lpKgS * CP_EXH * tI * (1 - Math.pow(erL, -K_EXH))) / 1000;
      return { mExh, t3, p3, pI, p4, tI, erH, erL, hpKw, lpKw, hpKgS, lpKgS, bypassKgS: mExh - hpKgS, wastegateKgS: mExh - lpKgS };
    }
    const cache = new Map();
    // Steady point at boost B: the LP shaft balances (its turbine power sets x), the HP shaft surplus is left.
    function point(B, uHp = 0, uLp = 0) {
      const key = `${Math.round(B * 1e5)}|${Math.round(uHp * 1e4)}|${Math.round(uLp * 1e4)}`;
      if (cache.has(key)) return cache.get(key);
      let tMan = ambientK + 10, a = null, e = null, lpAlone = false;
      for (let it = 0; it < 2; it++) {
        const m = Math.max(1e-4, ctx.airflowAt(B, tMan));
        e = exhaust(B, m, uHp, uLp);
        const avail = MECH_EFF * e.lpKw, full = air(B, m, null);
        // The first stage is held to the right of its own surge line. Its corrected flow is set by the
        // engine's mass flow and its inlet pressure, not by how the ratio is split, so the highest ratio it
        // can hold stably is simply the surge line read at that flow. Without this the LP took every ratio
        // its turbine could drive, so a compressor sized for 2500 pk of airflow sat deep in surge at 5000
        // rpm and the solver answered with nonsense. The controller opens the LP wastegate instead, and the
        // HP stage makes up the rest of the ratio - which is the whole reason for a second stage.
        const xCap = Math.max(1.0001, Math.min(full.xFull, lp.surgePr(full.wcLp)));
        if (avail >= full.lpKw && full.xFull <= xCap + 1e-6) { a = full; lpAlone = true; }
        else {
          // LP pressure ratio its turbine power can drive: x^k = 1 + P eff / (m cp T), eff from the map
          let x = Math.max(1.0001, Math.min(xCap, full.x));
          const wr = (m * CP_AIR * ambientK) / 1000;
          for (let i = 0; i < 4; i++) x = clamp(Math.pow(1 + (avail * air(B, m, x).effLp) / wr, 1 / K_AIR), 1, xCap);
          a = air(B, m, x); lpAlone = false;
        }
        tMan = ctx.chargeCooling(a.t2, a.lb);
      }
      const out = { B, uHp, uLp, a, e, tMan, lpAlone, hpSurplusKw: MECH_EFF * e.hpKw - a.hpKw,
        lpShaftRpm: lp.shaftRpm(a.wcLp, a.x), hpShaftRpm: a.prHp > 1.0005 ? hp.shaftRpm(a.wcHp, a.prHp) : 0 };
      cache.set(key, out);
      return out;
    }
    // Rotor-speed-limited point (transient): each compressor makes what its current shaft speed allows.
    function atSpeeds(B, nLp, nHp) {
      const m = Math.max(1e-4, ctx.airflowAt(B, ambientK + 25));
      const full = air(B, m, null);
      let lo = 1, hi = Math.max(1.0001, Math.min(full.xFull, lp.surgePr(full.wcLp)));
      for (let i = 0; i < 14; i++) { const mid = 0.5 * (lo + hi); if (lp.shaftRpm(full.wcLp, mid) <= nLp) lo = mid; else hi = mid; }
      const a = air(B, m, lo);
      return { a, ok: a.prHp <= 1.0005 || hp.shaftRpm(a.wcHp, a.prHp) <= nHp, m };
    }
    return { point, atSpeeds, air, exhaust, hpPassthrough: (m, B, uLp) => exhaust(B, m, 1, uLp) };
  }

  // Engine airflow is smooth in boost (quadratic to <0.1 %) and scales with a power of the manifold
  // temperature; the series solver asks for it a few hundred times per call, so it is fitted from four
  // exact evaluations (checked against the exact model in tests/test_phase9.js).
  function airflowFit(ctx, span) {
    const f = ctx.airflowAt, tR = ctx.ambientK + 25, S = Math.max(0.3, span);
    const n0 = f(0, tR), n1 = f(S / 2, tR), n2 = f(S, tR), hot = f(S, tR + 40);
    const e = Math.log(n2 / Math.max(1e-9, hot)) / Math.log((tR + 40) / tR);
    return (B, tK) => {
      const x = (2 * B) / S;
      const m = (n0 * (1 - x) * (2 - x)) / 2 + n1 * x * (2 - x) + (n2 * x * (x - 1)) / 2;
      return Math.max(1e-5, m * Math.pow(tR / tK, e));
    };
  }
  function matchCompound(ctx, hpMap, target) {
    const lpMap = ctx.map;
    const single = matchEngine(ctx, target);
    const t3Memo = new Map(), t3 = B => { const k = Math.round(B * 1e4); if (!t3Memo.has(k)) t3Memo.set(k, ctx.exhaustTempK(B)); return t3Memo.get(k); };
    const ev = makeSeriesEvaluator({ ...ctx, airflowAt: airflowFit(ctx, target.targetBoostBar), exhaustTempK: t3 }, hpMap);
    const B0 = Math.max(0, target.targetBoostBar);
    // LP turbo alone (HP compressor bypassed, HP turbine bypass open): the exhaust still passes the HP stage.
    const lpOnly = () => {
      const pass = ev.hpPassthrough(single.massFlowKgS, single.boostBar, single.wastegatePct / 100);
      const extraEmp = Math.max(0, pass.p3 - pass.pI);
      return { ...single, empBarAbs: single.empBarAbs + extraEmp, expansionRatio: single.expansionRatio, compoundStage: 'lp', hpShaftRpm: 0, hpShaftPct: 0,
        hpBypassPct: 100, prLp: single.pressureRatio, prHp: 1, interstageBarAbs: null, interstageC: null };
    };
    // The HP stage used to be bypassed whenever the LP turbo was not spool-limited, which made a compound a
    // spool aid and nothing else: a turbo held back by its own shaft speed or map got no help from a second
    // stage, so two compressors in series could not reach a pressure ratio one of them cannot. That is the
    // whole point of compounding. The series solution is worked out below and compared with the LP-only one
    // on what actually comes out.
    // Smallest HP bypass opening that keeps the manifold pressure under the cap (EMP / MAP, absolute).
    const empOk = (b, u) => ev.point(b, u, 0).e.p3 <= COMPOUND.empCapRatio * (ctx.baroBar + b);
    const uMinMemo = new Map();
    const uMin = b => {
      const k = Math.round(b * 1e4);
      if (uMinMemo.has(k)) return uMinMemo.get(k);
      // The bypass is shut unless the manifold pressure needs relief. It used to be scheduled open as the HP
      // compressor approached choke, on the idea that the LP turbine needed the energy early; that made boost
      // fall away at the handover (1.02 bar at 5000 rpm, 0.63 at 6000) because no boost controller gives up
      // pressure it is still making. The handover falls out of the shaft balance below instead: the bypass
      // opens exactly as fast as the HP stage stops earning its exhaust energy.
      let u = 0;
      if (!empOk(b, u)) {
        if (!empOk(b, 1)) u = 1;
        else { let lo = u, hi = 1; for (let i = 0; i < 8; i++) { const mid = 0.5 * (lo + hi); if (empOk(b, mid)) hi = mid; else lo = mid; } u = hi; }
      }
      uMinMemo.set(k, u);
      return u;
    };
    const worksAt = (b, u) => { const p = ev.point(b, u, 0); return empOk(b, u) && (p.lpAlone || p.hpSurplusKw >= 0); };
    const works = b => worksAt(b, uMin(b));
    let B = B0, limitedBy = 'target', surge = false, wideOpen = false;
    if (!works(B)) {
      // Boost controller. Shut, the HP turbine takes its share of the exhaust; once the HP compressor has run
      // out of flow that share buys nothing and only slows the LP turbine, so the controller also tries the
      // bypass wide open and keeps whichever setting holds the most boost. That is what makes the handover:
      // the bypass opens as the HP stage stops earning its energy, and nothing has to schedule it.
      const shut = bisectMax(0, B, works, 14);
      const open = worksAt(B, 1) ? B : bisectMax(0, B, b => worksAt(b, 1), 14);
      if (open > shut + 1e-3) { B = open; wideOpen = true; } else B = shut;
      limitedBy = 'spool';
    }
    // past its choke line the HP wheel loses efficiency fast (map efficiency), which the shaft balance feels;
    // only the LP compressor has a hard choke limit here
    const uFloor = b => (wideOpen ? 1 : uMin(b));
    const chokeOk = b => { const { a } = ev.point(b, uFloor(b), 0); return a.wcLp <= lpMap.chokeFlow(a.x); };
    if (!chokeOk(B)) { B = bisectMax(0, B, chokeOk, 14); limitedBy = 'choke'; }
    const speedOk = b => { const p = ev.point(b, 0, 0); return p.lpShaftRpm <= lpMap.maxShaftRpm * 0.98 && p.hpShaftRpm <= hpMap.maxShaftRpm * 0.98; };
    if (ctx.protectShaftSpeed && !speedOk(B)) { B = bisectMax(0, B, speedOk, 14); limitedBy = 'shaft-limit'; }
    const stableOk = b => { const { a } = ev.point(b, 0, 0); return a.wcLp >= lpMap.surgeFlow(a.x) && (a.prHp <= 1.0005 || a.wcHp >= hpMap.surgeFlow(a.prHp)); };
    if (!stableOk(B)) {
      // Same as matchEngine step 4: surge is a flow floor. Cap each stage at the PR its own surge line
      // allows at the flow it has, instead of searching downwards for a boost that surges harder.
      surge = true;
      const a0 = ev.point(B, uFloor(B), 0).a;
      const prCapLp = lpMap.surgePr(a0.wcLp);
      const prCapHp = a0.prHp > 1.0005 ? hpMap.surgePr(a0.wcHp) : Infinity;
      const withinLines = b => { const { a } = ev.point(b, uFloor(b), 0); return a.prLp <= prCapLp && (a.prHp <= 1.0005 || a.prHp <= prCapHp); };
      if (!withinLines(B)) B = bisectMax(0, B, withinLines, 14);
      limitedBy = 'surge';
    }
    // The LP-only answer is kept only when it is genuinely the better one. Reaching the same boost is not the
    // same thing as being the same: with both stages sharing the ratio the LP runs lower on its map, nearer
    // its best efficiency, so the charge can be cooler and denser for the same manifold pressure - but a
    // small HP wheel past its choke line does the opposite, restricting the intake for nothing. Which of the
    // two it is, is decided below on the mass flow each actually delivers, once the series point is known.
    // Deciding it on "could the LP have coped" alone put a cliff in the map: on one 8.9 L build 2.97 bar gave
    // 3961 pk LP-only and 2.98 bar gave 4398 in series, off the same hardware.
    if (single.boostBar > B + 1e-3) return lpOnly();
    // controller: open the HP turbine bypass until the HP shaft balances at the target
    const u0 = uFloor(B);
    let uHp = u0;
    if (limitedBy === 'target') {
      if (ev.point(B, 1, 0).hpSurplusKw >= 0) uHp = 1;
      else if (ev.point(B, u0, 0).hpSurplusKw > 0) {
        let lo = u0, hi = 1;
        for (let i = 0; i < 10; i++) { const mid = 0.5 * (lo + hi); if (ev.point(B, mid, 0).hpSurplusKw > 0) lo = mid; else hi = mid; }
        uHp = 0.5 * (lo + hi);
      }
    }
    let P = ev.point(B, uHp, 0), a = P.a, nLp = P.lpShaftRpm, nHp = P.hpShaftRpm, transient = false;
    // Same boost, so what separates the two is charge temperature: at a given manifold pressure the cooler
    // charge is the denser one and makes the power. Two stages sharing the ratio each run lower on their
    // maps and can come out cooler than one stage doing all of it; a small HP wheel past its choke line does
    // the opposite and heats the charge for nothing. The mass flows cannot be compared directly here - the
    // single and the series evaluator are built on different airflow fits - but the temperatures can.
    if (single.boostBar >= B - 1e-3 && single.manifoldC + 273.15 <= P.tMan) return lpOnly();
    // rotor inertia: both rotors accelerate on their own surplus from their previous speeds
    const pL = target.prevShaftRpm, pH = target.prevHpShaftRpm;
    if (Number.isFinite(pL) && target.dtS > 0 && (pL < nLp - 1 || (Number.isFinite(pH) && pH < nHp - 1))) {
      const IL = lpMap.inertia * TRANSIENT_INERTIA_FACTOR, IH = hpMap.inertia * TRANSIENT_INERTIA_FACTOR, steps = 4, dt = target.dtS / steps;
      let nl = Math.min(pL, nLp), nh = Number.isFinite(pH) ? pH : 0, Bt = 0;
      const hpCap = hpMap.maxShaftRpm * (ctx.protectShaftSpeed ? 0.98 : 1.15);
      for (let s = 0; s < steps; s++) {
        Bt = bisectMax(0, B, b => ev.atSpeeds(b, nl, nh).ok, 11);
        const q = ev.atSpeeds(Bt, nl, nh), e = ev.exhaust(Bt, q.m, uMin(Bt), 0);
        const sl = MECH_EFF * e.lpKw - q.a.lpKw, sh = MECH_EFF * e.hpKw - q.a.hpKw;
        const step = (n, I, kw) => { const w = (n * 2 * Math.PI) / 60; return (Math.sqrt(Math.max(0, w * w + (2 * kw * 1000 * dt) / I)) * 60) / (2 * Math.PI); };
        nl = Math.min(nLp, step(nl, IL, sl));
        nh = Math.min(hpCap, step(nh, IH, sh));
      }
      Bt = bisectMax(0, B, b => ev.atSpeeds(b, nl, nh).ok, 12);
      if (Bt < B - 1e-3) {
        transient = true; limitedBy = 'spool-transient'; B = Bt; uHp = uMin(Bt);
        const q = ev.atSpeeds(B, nl, nh);
        P = { ...ev.point(B, uHp, 0), a: q.a };
        a = q.a; nLp = nl; nh = Math.max(nh, 0); nHp = nh;
      }
    }
    const e = P.e, tMan = P.tMan;
    if (!transient) { nLp = P.lpShaftRpm; nHp = P.hpShaftRpm; }
    const prTotal = a.p2 / a.p1;
    const ptL = compressorPoint(lpMap, a.wcLp, a.x), ptH = compressorPoint(hpMap, a.wcHp, Math.max(1, a.prHp));
    const overallEff = (ctx.ambientK * (Math.pow(prTotal, K_AIR) - 1)) / Math.max(1e-6, a.t2 - ctx.ambientK);
    return {
      boostBar: B,
      targetBoostBar: B0,
      limitedBy,
      surge,
      shaftRpm: nLp,
      shaftSpeedPct: (nLp / lpMap.maxShaftRpm) * 100,
      hpShaftRpm: nHp,
      hpShaftPct: (nHp / hpMap.maxShaftRpm) * 100,
      pressureRatio: prTotal,
      prLp: a.x,
      prHp: a.prHp,
      interstageBarAbs: a.pI,
      interstageC: a.tI - 273.15,
      correctedFlowLbMin: a.wcLp,
      hpCorrectedFlowLbMin: a.wcHp,
      massFlowLbMin: a.lb,
      massFlowKgS: a.m,
      compressorEff: clamp(overallEff, 0.3, 0.9),
      compressorOutC: a.t2 - 273.15,
      manifoldC: tMan - 273.15,
      surgeMarginPct: Math.min(ptL.surgeMarginPct, ptH.surgeMarginPct),
      // past its choke line the HP wheel stops adding pressure and the bypass carries the flow: that is lost
      // efficiency (the shaft balance feels it), not a load limit; the HP stage's load is its shaft speed
      chokeMarginPct: ptL.chokeMarginPct,
      hpChokeMarginPct: ptH.chokeMarginPct,
      compressorKw: a.lpKw + a.hpKw,
      turbineKw: e.lpKw + e.hpKw,
      empBarAbs: e.p3,
      interstageExhaustBarAbs: e.pI,
      turbineOutBarAbs: e.p4,
      expansionRatio: e.p3 / e.p4,
      wastegatePct: 0,
      hpBypassPct: uHp * 100,
      wastegateFlowKgS: e.bypassKgS,
      exhaustFlowKgS: e.mExh,
      t3C: e.t3 - 273.15,
      compoundStage: 'series'
    };
  }

  const Turbo = { DATA, getMap, compressorPoint, matchEngine, matchCompound, makeEvaluator, makeSeriesEvaluator, airflowFit, COMPOUND, COMP_REF, TURB_REF, LBMIN_PER_KGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Turbo;
  root.EA888Turbo = Turbo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
