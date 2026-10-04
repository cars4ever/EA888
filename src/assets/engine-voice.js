// EA888 LAB engine voice: the engine sound is built sample by sample from the combustion events of the
// simulated engine instead of being played back from recordings.
//
//   crank angle -> per cylinder (firing order 1-3-4-2, 180 deg apart) a spark decision at TDC:
//     burn / late burn (retarded ignition, ALS) / spark cut (charge goes out unburnt) / fuel cut (air only)
//   exhaust valve opening (EVO) -> blowdown pulse whose size follows the cylinder pressure left at EVO
//     against the exhaust back pressure, plus jet noise from the valve curtain
//   runner delay per cylinder (unequal lengths) -> collector -> turbine (absorbs and smooths the pulses)
//   -> exhaust pipe as a digital waveguide (sound speed from the gas temperature, reflections at the
//      turbine and at the open tailpipe, wall losses) -> tailpipe radiation -> muffler
//   unburnt fuel collected in the exhaust ignites when the gas is hot enough: afterfire pops / ALS bangs
//   knock: a damped ring at the first circumferential chamber mode f = 1.84 c / (pi B) (Draper)
//   engine bay: intake pulses through the airbox, throttle hiss, DI injector and valvetrain ticks
//
// The same file is a plain script in the page (window.EA888EngineVoice), the AudioWorklet module (loaded
// from moduleSource() as a Blob) and a CommonJS module for the offline tests in tests/test_audio.js.
(function (root) {
  'use strict';

  function ea888EngineVoiceModule(scope) {
    const TAU = Math.PI * 2;
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const smooth01 = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

    // Exhaust systems of the parts catalog (exhaust category). lengthM: turbine outlet to tailpipe;
    // diaMm: pipe bore (wall losses); muffler: 0 = open dump .. 1 = OEM rear box (absorption and
    // low-pass); openEnd: reflection magnitude at the tailpipe.
    const EXHAUSTS = {
      oem_exhaust: { lengthM: 3.7, diaMm: 60, muffler: 1.0, openEnd: 0.72, fc: 950 },
      catted_3: { lengthM: 3.7, diaMm: 76, muffler: 0.62, openEnd: 0.8, fc: 1700 },
      race_3: { lengthM: 3.6, diaMm: 76, muffler: 0.36, openEnd: 0.84, fc: 2600 },
      side_35: { lengthM: 1.9, diaMm: 89, muffler: 0.18, openEnd: 0.86, fc: 3600 },
      hood_4: { lengthM: 0.75, diaMm: 102, muffler: 0.0, openEnd: 0.88, fc: 5200 }
    };
    // Firing order 1-3-4-2: slot i fires at 180 i degrees of the 720 degree cycle.
    const FIRING = [1, 3, 4, 2];
    // Exhaust runner length per cylinder (m): outer runners of a 4-into-1 cast manifold are longer.
    const RUNNER_M = { 1: 0.42, 2: 0.33, 3: 0.35, 4: 0.44 };
    const EVO_DEG = 132; // exhaust valve opening, degrees after firing TDC
    const IVO_DEG = 350; // intake valve opening
    const INJ_DEG = 420; // DI injection early in the intake stroke
    const GAMMA_EXH = 1.34, R_GAS = 287;

    // Fractional delay line (linear interpolation).
    class Delay {
      constructor(size) { this.buf = new Float32Array(size); this.mask = size - 1; this.w = 0; }
      write(x) { this.buf[this.w] = x; this.w = (this.w + 1) & this.mask; }
      read(d) {
        const p = this.w - 1 - d;
        const i = Math.floor(p), f = p - i;
        const a = this.buf[i & this.mask], b = this.buf[(i + 1) & this.mask];
        return a + (b - a) * f;
      }
    }

    // Exhaust pipe: bidirectional waveguide. Input enters at the turbine end; the returning wave reflects
    // at the turbine (partly closed end, positive reflection); at the open tailpipe the pressure wave
    // reflects inverted and low-passed (high frequencies radiate out better). Output: radiated pressure
    // (time derivative of the tailpipe volume velocity, softened) through the muffler.
    class Pipe {
      constructor(sr) {
        this.sr = sr; this.fwd = new Delay(2048); this.bwd = new Delay(2048);
        this.endLp = 0; this.lossLp = 0; this.u1 = 0; this.m1 = 0; this.m2 = 0;
        this.configure(EXHAUSTS.oem_exhaust);
        this.delay = 60;
      }
      configure(ex) {
        this.ex = ex;
        this.rTurb = 0.42;
        this.rOpen = -ex.openEnd;
        // wall friction/heat loss per pass: narrower and longer pipes lose more
        this.loss = clamp(1 - 0.05 * ex.lengthM * (60 / ex.diaMm), 0.6, 0.99);
        this.endA = Math.exp(-TAU * 2400 / this.sr);
        this.mA = Math.exp(-TAU * ex.fc / this.sr);
        this.mGain = 1 - 0.5 * ex.muffler;
      }
      setSoundSpeed(c) { this.delay = clamp(this.ex.lengthM / c * this.sr, 2, 2000); }
      process(x) {
        const back = this.bwd.read(this.delay);
        this.fwd.write(x + this.rTurb * back);
        const inc = this.fwd.read(this.delay);
        this.endLp = inc + (this.endLp - inc) * this.endA;
        const refl = this.rOpen * this.endLp;
        this.lossLp = refl * this.loss;
        this.bwd.write(this.lossLp);
        const u = inc - refl;                // tailpipe volume velocity (pressure units)
        const rad = u - 0.86 * this.u1;      // radiation: derivative with the lowest octave kept
        this.u1 = u;
        // muffler: two-pole low-pass whose corner and absorption follow the muffler type
        this.m1 = rad + (this.m1 - rad) * this.mA;
        this.m2 = this.m1 + (this.m2 - this.m1) * this.mA;
        const m = this.ex.muffler;
        return this.mGain * (m * this.m2 + (1 - m) * (0.3 * rad + 0.7 * this.m1));
      }
    }

    // Two-pole resonator (bandpass), used for the airbox, knock ring and ticks.
    class Reso {
      constructor(sr, f, q) { this.sr = sr; this.y1 = 0; this.y2 = 0; this.set(f, q); }
      set(f, q) {
        const w = TAU * clamp(f, 10, this.sr * 0.45) / this.sr;
        this.r = Math.exp(-w / (2 * q));
        this.a1 = 2 * this.r * Math.cos(w); this.a2 = -this.r * this.r;
        // unity gain at the resonance
        this.g = (1 - this.r) * Math.sqrt(1 - 2 * this.r * Math.cos(2 * w) + this.r * this.r);
      }
      process(x) { const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
    }

    class EngineVoice {
      constructor(sampleRate, seed = 12345) {
        this.sr = sampleRate;
        this.dt = 1 / sampleRate;
        this.seed = (seed >>> 0) || 1;
        this.p = {
          rpm: 850, load: 0.12, mapBar: NaN, boostBar: 0, egtC: NaN, knock: 0, retardDeg: 0, lambda: 1,
          cutFraction: 0, cutKind: 'fuel', alsActive: false, exhaust: 'oem_exhaust', boreMm: 82.5, turbo: true,
          running: true
        };
        this.rpm = 850; this.load = 0.12; this.map = 0.4; this.boost = 0; this.retard = 0;
        this.theta = 0;
        this.egtModelC = 420;
        this.unburntG = 0;
        this.afterburn = 0;
        this.cutAcc = 0;
        this.eventCut = null; // {kind, fraction, left (s)}
        this.t = 0;
        this.slots = FIRING.map(cyl => ({
          cyl, outcome: 'burn', amp: 0, age: 1, tau: 0.002, dispAmp: 0, dispTau: 0.006, jet: 0, jn: 0,
          runner: new Delay(256), runnerM: RUNNER_M[cyl], intakeAmp: 0, intakeAge: 1
        }));
        this.turbLp = 0;
        this.pipe = new Pipe(sampleRate);
        this.popPipe = new Pipe(sampleRate);
        this.airbox = new Reso(sampleRate, 115, 3.2);
        this.roar = new Reso(sampleRate, 620, 0.9);
        this.hiss = new Reso(sampleRate, 2600, 1.4);
        this.knockRing = new Reso(sampleRate, 7000, 38);
        this.knockRing2 = new Reso(sampleRate, 11600, 40);
        this.tick = new Reso(sampleRate, 4200, 9);
        this.valveTick = new Reso(sampleRate, 2900, 6);
        this.combLp = 0; this.combHp = 0;
        this.knockExc = 0; this.tickExc = 0; this.valveExc = 0; this.combExc = 0;
        this.pops = []; // pending/active pops: {delay, amp, age, tau, crackle}
        this.stats = { cycles: 0, fired: 0, late: 0, sparkCut: 0, fuelCut: 0, pops: 0, knocks: 0, peak: 0 };
        this.setExhaust('oem_exhaust');
      }

      rand() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
      noise() { return this.rand() * 2 - 1; }
      gauss() { return (this.rand() + this.rand() + this.rand() - 1.5) * 1.414; }

      setExhaust(id) {
        const ex = EXHAUSTS[id] || EXHAUSTS.oem_exhaust;
        this.exhaustId = EXHAUSTS[id] ? id : 'oem_exhaust';
        this.pipe.configure(ex); this.popPipe.configure(ex);
      }

      set(params) {
        if (!params) return;
        for (const k in params) if (params[k] !== undefined) this.p[k] = params[k];
        if (params.exhaust && params.exhaust !== this.exhaustId) this.setExhaust(params.exhaust);
        if (Number.isFinite(params.boreMm)) {
          // First circumferential mode of the chamber in the hot burnt gas (c ~ 1000 m/s at 2400 K).
          const cBurnt = Math.sqrt(1.3 * R_GAS * 2400);
          const f1 = 1.841 * cBurnt / (Math.PI * params.boreMm / 1000);
          this.knockRing.set(f1, 38); this.knockRing2.set(f1 * 3.054 / 1.841, 40);
          this.knockHz = f1;
        }
      }

      // Timed ignition/fuel cut from outside (shift torque intervention, flat shift).
      cut(kind, fraction, durationS) { this.eventCut = { kind, fraction: clamp(fraction, 0, 1), left: Math.max(0, durationS) }; }

      egtC() { return Number.isFinite(this.p.egtC) ? this.p.egtC : this.egtModelC; }

      // Pressure left in the cylinder at EVO (bar abs) per outcome. A burnt charge expands from roughly
      // 3.4x MAP at EVO; late combustion leaves more of it; a charge that did not burn expands back to
      // below its intake pressure (heat loss to the walls).
      evoPressure(outcome) {
        const m = this.map;
        if (outcome === 'burn') return m * (3.3 + 0.05 * this.retard);
        if (outcome === 'late') return m * (3.3 + 0.075 * Math.max(this.retard, 18));
        return m * 0.72;
      }

      decide(slot) {
        const p = this.p;
        this.stats.cycles++;
        let frac = clamp(Number(p.cutFraction) || 0, 0, 1), kind = p.cutKind === 'spark' ? 'spark' : 'fuel';
        if (this.eventCut && this.eventCut.left > 0 && this.eventCut.fraction >= frac) { frac = this.eventCut.fraction; kind = this.eventCut.kind; }
        let outcome = this.retard > 14 || p.alsActive ? 'late' : 'burn';
        if (!p.running) outcome = 'fuelcut';
        else if (frac > 0) {
          // ECU cut pattern: a rotating Bresenham pattern spreads the cut events over the cylinders.
          this.cutAcc += frac;
          if (this.cutAcc >= 1 - 1e-9) { this.cutAcc -= 1; outcome = kind === 'spark' ? 'sparkcut' : 'fuelcut'; }
        } else this.cutAcc = 0;
        // At closed throttle the fuel is cut on overrun (decel fuel cut above ~1500 rpm).
        if (outcome !== 'sparkcut' && this.load < 0.035 && this.rpm > 1500 && !p.alsActive) outcome = 'fuelcut';
        slot.outcome = outcome;
        const fuelG = 0.037 * this.map / clamp(Number(p.lambda) || 1, 0.6, 1.5);
        if (outcome === 'burn') this.stats.fired++;
        else if (outcome === 'late') {
          this.stats.late++;
          // Retarded ignition: part of the charge is still burning or unburnt at EVO; rich ALS fuelling adds CO/H2.
          // It keeps burning in the manifold (afterburn: heat and a crackling roar) rather than exploding.
          this.afterburn = Math.min(3, this.afterburn + (clamp((this.retard - 12) / 45, 0, 0.45) + Math.max(0, 1 - (Number(p.lambda) || 1)) * 0.6) * this.map);
        } else if (outcome === 'sparkcut') { this.stats.sparkCut++; this.unburntG += fuelG; }
        else this.stats.fuelCut++;
        // Knock: only a burning charge knocks; the probability per cycle is the knock intensity.
        if ((outcome === 'burn' || outcome === 'late') && p.knock > 0 && this.rand() < clamp(p.knock, 0, 1)) {
          this.knockExc = clamp(p.knock, 0.2, 1) * this.map * 0.9 * (0.6 + 0.4 * this.rand());
          this.stats.knocks++;
        }
        if (outcome === 'burn' || outcome === 'late') this.combExc = this.map * (outcome === 'late' ? 0.55 : 1);
      }

      openExhaust(slot) {
        const pEvo = this.evoPressure(slot.outcome);
        const pBack = 1.0 + (this.p.turbo ? 0.95 * this.boost + 0.06 * this.rpm / 1000 * this.map : 0.04 * this.rpm / 1000);
        const pr = pEvo / pBack;
        // Blowdown strength: pressure drop across the valve with the isentropic energy term; cycle-to-cycle
        // variation (COV of IMEP) is larger at idle and light load.
        const cov = 0.018 + 0.1 * Math.pow(1 - clamp(this.load, 0, 1), 2);
        const burnt = slot.outcome === 'burn' || slot.outcome === 'late';
        // pressure drop across the valve, compressed (mass flow through the curtain saturates as it chokes)
        let a = 0.3 * Math.pow(Math.max(0, pEvo - pBack), 0.8);
        a += 0.05 * this.map; // displacement of the cylinder contents even without a blowdown
        a *= 1 + (burnt ? cov : 0.02) * this.gauss();
        const degS = 6 * Math.max(300, this.rpm); // degrees per second
        const choke = clamp(pr, 1, 3);
        slot.amp = Math.max(0, a);
        slot.tau = (52 / degS) / (1.9 + 0.45 * (choke - 1));
        slot.dispAmp = 0.12 * this.map;
        slot.dispTau = 150 / degS;
        slot.jet = clamp((pr - 1.2) * 0.18, 0, 0.4);
        slot.age = 0;
        // Unburnt fuel in the manifold ignites on the hot blowdown gas (ALS) or later in the pipe.
        const egt = this.egtC();
        // A misfired charge needs its fuel mostly together to explode: at least a third of a cylinder fill.
        if (this.unburntG > 0.012 * this.map) {
          const ignite = smooth01((egt - 640) / 360) * (this.p.alsActive ? 0.95 : 0.65);
          if (this.rand() < ignite) {
            // the flame runs through the whole pocket of mixture: one misfired charge, one bang
            const g = this.unburntG;
            this.unburntG = 0;
            const amp = Math.sqrt(g / 0.037) * (0.55 + 0.25 * smooth01((egt - 750) / 300));
            const where = this.p.alsActive ? 0.0015 + this.rand() * 0.004 : 0.004 + this.rand() * 0.014;
            this.pops.push({ delay: where, amp, age: -1, tau: 0.0011 + 0.0012 * this.rand(), crackle: amp * (0.4 + 0.5 * this.rand()), crackleTau: 0.012 + 0.03 * this.rand() });
            this.stats.pops++;
          }
        }
      }

      openIntake(slot) {
        // Suction pulse: the charge drawn per cycle; the compressor damps it on a turbo engine.
        slot.intakeAmp = this.map * (this.p.turbo ? 0.35 : 1) * (0.9 + 0.2 * this.rand());
        slot.intakeAge = 0;
        this.valveExc = 0.35 + 0.65 * clamp(this.rpm / 7000, 0, 1.4);
      }

      crossed(prev, next, angle) {
        // true when the crank passed `angle` (0..720) in this sample, with wrap at 720
        if (next >= prev) return prev < angle && angle <= next;
        return angle > prev || angle <= next;
      }

      render(outExh, outBay, outPop, n) {
        const p = this.p, dt = this.dt;
        const kRpm = 1 - Math.exp(-dt / 0.012), kLoad = 1 - Math.exp(-dt / 0.02), kSlow = 1 - Math.exp(-dt / 0.08);
        const targetRpm = clamp(Number(p.rpm) || 0, 0, 11000);
        const targetLoad = clamp(Number(p.load) || 0, 0, 1.4);
        const targetMap = Number.isFinite(p.mapBar) ? clamp(p.mapBar, 0.2, 7) : clamp(0.28 + 0.74 * Math.min(1, targetLoad) + Math.max(0, Number(p.boostBar) || 0), 0.2, 7);
        // Exhaust gas temperature when the caller has no thermal model (burnout/idle scenes): steady state
        // from load, speed and ignition retard with a 1.2 s thermal lag.
        const egtSs = 360 + 540 * Math.pow(clamp(targetLoad, 0, 1.3), 0.6) * (0.5 + 0.5 * clamp(targetRpm / 6500, 0, 1.4)) + 8 * (Number(p.retardDeg) || 0) + (p.alsActive ? 180 : 0);
        this.egtModelC += (egtSs - this.egtModelC) * (dt * n) / 1.2;
        const egtK = this.egtC() + 273.15;
        // Mean gas temperature along the pipe falls towards the tail; manifold gas is at EGT.
        const cPipe = Math.sqrt(GAMMA_EXH * R_GAS * (300 + 0.55 * (egtK - 300)));
        const cMan = Math.sqrt(GAMMA_EXH * R_GAS * egtK);
        this.pipe.setSoundSpeed(cPipe); this.popPipe.setSoundSpeed(cPipe);
        const runnerD = this.slots.map(s => clamp(s.runnerM / cMan * this.sr, 1, 250));
        if (this.eventCut && this.eventCut.left > 0) this.eventCut.left -= n * dt;
        // turbine: absorbs part of the pulse energy and smooths the pulses; an open wastegate bypasses it
        const wg = Number.isFinite(p.wastegatePct) ? clamp(p.wastegatePct / 100, 0, 1) : clamp(this.boost / 1.6, 0, 1);
        const turbT = p.turbo ? 0.5 + 0.3 * wg : 1;
        const turbA = Math.exp(-TAU * (p.turbo ? 1900 : 6000) / this.sr);
        const unburntDecay = Math.exp(-dt / 0.06), abDecay = Math.exp(-dt / 0.012);
        const tickDecay = Math.exp(-dt / 0.0004), combDecay = Math.exp(-dt / 0.0009);
        let peak = this.stats.peak;
        for (let i = 0; i < n; i++) {
          this.rpm += (targetRpm - this.rpm) * kRpm;
          this.load += (targetLoad - this.load) * kLoad;
          this.map += (targetMap - this.map) * kLoad;
          this.boost += ((Number(p.boostBar) || 0) - this.boost) * kSlow;
          this.retard += ((Number(p.retardDeg) || 0) - this.retard) * kSlow;
          const prev = this.theta;
          let next = prev + 6 * this.rpm * dt;
          if (next >= 720) next -= 720;
          this.theta = next;
          let collector = 0, bay = 0;
          for (let s = 0; s < 4; s++) {
            const slot = this.slots[s];
            const tdc = 180 * s;
            if (this.rpm > 60) {
              if (this.crossed(prev, next, tdc === 0 ? 720 : tdc)) this.decide(slot);
              if (this.crossed(prev, next, tdc + EVO_DEG)) this.openExhaust(slot);
              if (this.crossed(prev, next, (tdc + IVO_DEG) % 720)) this.openIntake(slot);
              if (this.crossed(prev, next, (tdc + INJ_DEG) % 720) && slot.outcome !== 'fuelcut') this.tickExc = 0.5 + 0.5 * this.rand();
            }
            // port pressure: blowdown (x^2 e^(2(1-x)), peak 1 at x = 1) + displacement plateau + jet noise
            let port = 0;
            if (slot.age < 0.2) {
              const x = slot.age / slot.tau;
              const bd = x < 12 ? x * x * Math.exp(2 * (1 - x)) : 0;
              const disp = slot.age < slot.dispTau ? Math.sin(Math.PI * slot.age / slot.dispTau) : 0;
              slot.jn = slot.jn + (this.noise() - slot.jn) * 0.35; // jet noise, low-passed (~2.5 kHz)
              port = slot.amp * bd * (1 + slot.jet * slot.jn) + slot.dispAmp * disp;
              slot.age += dt;
            }
            slot.runner.write(port);
            collector += slot.runner.read(runnerD[s]);
            if (slot.intakeAge < 0.05) {
              const ti = slot.intakeAge / (30 / (6 * Math.max(300, this.rpm)));
              bay -= slot.intakeAmp * (ti < 10 ? ti * Math.exp(1 - ti) : 0);
              slot.intakeAge += dt;
            }
          }
          this.turbLp = collector + (this.turbLp - collector) * turbA;
          const exh = this.pipe.process(this.turbLp * turbT * 0.9);
          // pops and afterburn crackle: separate waveguide through the same pipe (linear, so separable)
          let popIn = 0;
          for (let k = this.pops.length - 1; k >= 0; k--) {
            const q = this.pops[k];
            if (q.age < 0) { q.delay -= dt; if (q.delay <= 0) q.age = 0; continue; }
            const x = q.age / q.tau;
            popIn += q.amp * (x < 14 ? x * Math.exp(1 - x) : 0) * (1 + 0.5 * this.noise());
            if (q.crackle > 0.001 && this.rand() < dt * 900 * Math.exp(-q.age / q.crackleTau)) popIn += q.crackle * this.noise() * 1.6;
            q.age += dt;
            if (q.age > 0.25) this.pops.splice(k, 1);
          }
          // afterburn of a late-burning (ALS) charge: dense small ignitions in the manifold
          if (this.afterburn > 0.01) { popIn += this.noise() * this.afterburn * (this.rand() < 0.08 ? 0.5 : 0.06); this.afterburn *= abDecay; }
          const pop = this.popPipe.process(popIn * 0.8);
          this.unburntG *= unburntDecay;
          // engine bay: airbox resonance + induction roar + throttle hiss + ticks + knock ring + combustion noise
          const flow = this.map * this.rpm / 6000;
          const vac = clamp(1 - this.map, 0, 1);
          let b = this.airbox.process(bay) * 3.2 + this.roar.process(this.noise() * flow) * 0.09;
          b += this.hiss.process(this.noise()) * vac * clamp(this.rpm / 5000, 0.1, 1.6) * 0.07;
          if (this.tickExc > 0.0005) { b += this.tick.process(this.tickExc * this.noise()) * 0.38; this.tickExc *= tickDecay; } else this.tick.process(0);
          if (this.valveExc > 0.0005) { b += this.valveTick.process(this.valveExc * this.noise()) * 0.12; this.valveExc *= tickDecay; } else this.valveTick.process(0);
          if (this.combExc > 0.0005) {
            const c = this.combExc * this.noise();
            this.combLp = c + (this.combLp - c) * 0.6; // crude high-pass: noise minus its low-passed part
            b += (c - this.combLp) * 0.05; this.combExc *= combDecay;
          }
          const kn = this.knockRing.process(this.knockExc * this.noise()) * 2.4 + this.knockRing2.process(this.knockExc * this.noise()) * 1.1;
          if (this.knockExc > 0.0005) this.knockExc *= Math.exp(-dt / 0.0011);
          b += kn;
          // output trims: exhaust ~0.25 rms at full load and 6500 rpm, engine bay about a quarter of that
          const e = exh * 8.6 + kn * 0.03;
          b *= 0.17;
          // pops: soft-limited, they are 20+ dB over the engine in reality
          const pp = pop * 2.2;
          outExh[i] = e; outBay[i] = b; outPop[i] = pp / (1 + Math.abs(pp) * 0.35);
          const m = Math.abs(e) + Math.abs(outPop[i]);
          if (m > peak) peak = m;
          this.t += dt;
        }
        this.stats.peak = peak;
        this.stats.egtC = this.egtC();
        this.stats.unburntG = this.unburntG;
        this.stats.rpm = this.rpm;
      }
    }

    if (typeof scope.registerProcessor === 'function' && typeof scope.AudioWorkletProcessor === 'function') {
      class EA888EngineProcessor extends scope.AudioWorkletProcessor {
        constructor(options) {
          super();
          const o = (options && options.processorOptions) || {};
          this.voice = new EngineVoice(scope.sampleRate, o.seed || 1);
          if (o.params) this.voice.set(o.params);
          this.alive = true;
          this.statClock = 0;
          this.port.onmessage = ev => {
            const m = ev.data || {};
            if (m.type === 'set') this.voice.set(m.p);
            else if (m.type === 'cut') this.voice.cut(m.kind, m.fraction, m.durationS);
            else if (m.type === 'stop') this.alive = false;
          };
        }
        process(inputs, outputs) {
          if (!this.alive) return false;
          const a = outputs[0] && outputs[0][0], b = outputs[1] && outputs[1][0], c = outputs[2] && outputs[2][0];
          if (!a || !b || !c) return true;
          this.voice.render(a, b, c, a.length);
          this.statClock += a.length;
          if (this.statClock >= scope.sampleRate / 5) {
            this.statClock = 0;
            this.port.postMessage({ type: 'stats', stats: this.voice.stats });
          }
          return true;
        }
      }
      scope.registerProcessor('ea888-engine', EA888EngineProcessor);
    }
    return { EngineVoice, EXHAUSTS, FIRING };
  }

  const api = ea888EngineVoiceModule(root);
  api.moduleSource = () => '(' + ea888EngineVoiceModule.toString() + ')(globalThis);';
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EA888EngineVoice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
