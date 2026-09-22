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
      chokeFlow,
      shaftRpm: (w, pr) => Math.max(0, w > wHi || pr > prHi ? shaftRaw(w, pr) : grid(gN, w, pr)),
      efficiency: (w, pr) => clamp(w > wHi || pr > prHi ? effRaw(w, pr) : grid(gE, w, pr), 0.4, src.peakEfficiency),
      efficiencyExact: effRaw,
      shaftRpmExact: shaftRaw,
      turbineFlow,
      turbineFlowMax: tMax,
      turbineNozzle: er => (tMax * nozzle(er)) / nozzle(4),
      turbineEfficiency: er => src.turbine.maxEfficiency * clamp(0.55 + (0.45 * (er - 1)) / 0.8, 0.55, 1) * (src.turbine.twinScroll ? 1.03 : 1),
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
        return (map.turbineFlow(er) + u * wg.flowRatio * map.turbineNozzle(er)) * corr(p3);
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
    // 4. surge: the compressor cannot hold a PR left of the surge line
    const stable = b => { const c = ev.compressor(b); return c.correctedFlowLbMin >= c.surgeFlowLbMin; };
    let surge = false;
    if (!stable(B)) { surge = true; B = bisectMax(0, B, stable); limitedBy = 'surge'; }
    // 5. wastegate creep: even fully open the turbine over-drives the compressor
    if (limitedBy === 'target' && ev.surplus(B, 1) > 0) {
      const creep = bisectMax(B, B + 2.5, b => ev.surplus(b, 1) > 0 && choked(b) && (!ctx.protectShaftSpeed || underSpeed(b)));
      if (creep > B + 0.005) { B = creep; limitedBy = 'wastegate-creep'; }
    }
    const steady = ev.compressor(B);
    let shaftRpm = steady.shaftRpm, transient = false;
    // 6. rotor inertia: energy balance from the previous shaft speed
    if (Number.isFinite(target.prevShaftRpm) && target.dtS > 0 && target.prevShaftRpm < steady.shaftRpm - 1) {
      const I = map.inertia, steps = 4, dt = target.dtS / steps;
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

  const Turbo = { DATA, getMap, compressorPoint, matchEngine, makeEvaluator, COMP_REF, TURB_REF, LBMIN_PER_KGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Turbo;
  root.EA888Turbo = Turbo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
