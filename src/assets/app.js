(function () {
  'use strict';

  const C = window.EA888Core;
  const STORAGE_KEY = 'ea888_lab_v120_state';
  const LEGACY_KEYS = ['ea888_lab_v110_state', 'ea888_lab_v100_state', 'ea888_lab_v090_state', 'ea888_lab_v080_state', 'ea888_lab_v070_state', 'ea888_lab_v060_state', 'ea888_lab_v050_state', 'ea888_lab_v040_state', 'ea888_lab_v030_state', 'ea888_lab_v020_state'];
  const APP_VERSION = '1.3.3';
  // Platform layer (build/web/platform.js): targeted DOM updates and the Android bridge. Without it (tests
  // that load the raw sources) the app falls back to replacing the markup and to browser APIs.
  const PLATFORM = window.EA888Platform || null;
  const NATIVE = PLATFORM?.native || null;
  function patchHtml(el, html) {
    if (!el) return;
    if (PLATFORM) PLATFORM.patchHtml(el, html);
    else el.innerHTML = html;
  }

  const NAV = [
    ['bank', 'garage', 'Garage'],
    ['build', 'engine', 'Motor'],
    ['tune', 'tune', 'Tune'],
    ['dyno', 'chart', 'Dyno'],
    ['drag', 'race', 'Race'],
    ['service', 'service', 'Service']
  ];

  const ICONS = {
    garage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7v9h-4v-6H7v6H3z"/><path d="M8 14h8v3H8z"/></svg>',
    engine: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h10l2 3h3v7h-3l-2 3H7l-2-3H2v-6h3z"/><path d="M8 4h6v3H8zM9 10h5v5H9z"/></svg>',
    tune: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M17 6h3M11 3v6M4 12h3M11 12h9M9 9v6M4 18h11M19 18h1M17 15v6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-7"/></svg>',
    race: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M6 5h12l-2 4 2 4H6z"/><path d="M9 5v8M14 5v8M6 9h12"/></svg>',
    service: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-3 3-3-3z"/></svg>',
    data: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-7 12h6l-1 8 7-12h-6z"/></svg>'
  };

  let state = loadState();
  let activeTab = 'bank';
  let activeCategory = 'turbo';
  let motorPanel = 'hardware';
  let engineView = 'realistic';
  let tunePanel = 'boost';
  let dynoChannel = 'power';
  let racePanel = 'tree';
  let partSearch = '';
  let pendingOilId = state.service.oilId;
  let pendingFilterId = state.service.filterId;
  let dynoRunning = null;
  let showAllChallenges = false;
  let dynoCompareIndex = 1; // run A for the A/B comparison (index in state.dynoRuns; run 0 is the active B)
  let dynoComparePinned = false; // an explicitly chosen A stays the same run when new pulls are added
  let treeMode = 'sportsman';
  let treeSession = null;
  let dragAnimation = null;
  let burnoutAnimation = null;
  let burnoutRuntime = null;
  let burnoutPointerId = null;
  let racePhase = 'burnout';
  let raceLivePoint = { rpm: 900, speedKmh: 0, gear: 1, boostBar: 0, accelerationG: 0, distanceM: 0 };
  let toastTimer = null;
  let engineVisualId = 0;
  let engineAudio = null;
  let importBuffer = '';
  let selectedSlot = 0;
  let raceGame = null;
  let raceGameRaf = null;
  let raceGameTimers = [];
  let raceGamePointer = { burnout:false, creep:false, throttle:false, steerLeft:false, steerRight:false, antilag:false };
  const raceGamePointerMap = new Map();
  let raceGameLastFrame = 0;
  let raceGameAuto = false;
  const v10TrackVisual = { canvas:null, ctx:null, width:0, height:0, dpr:1, horizonImage:null, horizonReady:false, lastDistance:0 };
  // Rivals are real builds: a preset with their own hardware, tyres and gearbox, run on the same vehicle
  // model as the player (sim.js createRaceRuntime) with a driver model of their skill.
  const RIVALS = Object.freeze({
    club: { id:'club', name:'Clubman Scirocco', tag:'CLUB', preset:'stock', mods:{ tune:{ boostLowBar:1.1, boostMidBar:1.1, boostHighBar:.85 }, selections:{ transmission:'dq250' } }, massKg:1370, reactionMin:.18, reactionMax:.28, skill:.6, prep:false, tire:'uhp', reward:250, color:'#f4c66d', description:'Stage-1 CAWB op DSG en straatbanden: een rustige instaprivaal.' },
    street: { id:'street', name:'Night Shift R', tag:'STREET', preset:'k04', mods:{ selections:{ transmission:'dq250' } }, massKg:1340, reactionMin:.11, reactionMax:.19, skill:.8, prep:true, tire:'semislick', reward:500, color:'#ff7c55', description:'K04-064 op DSG met semi-slicks: sterk en consistent.' },
    pro: { id:'pro', name:'Redline Works', tag:'PRO', preset:'randy', mods:{ selections:{ fuel:'e85', transmission:'sequential' }, rebaseMap:true }, massKg:1290, reactionMin:.055, reactionMax:.115, skill:.9, prep:true, tire:'drag_radial', reward:900, color:'#ff4f69', description:'K04-hybrid op E85 met sequentiële bak en drag radials.' },
    outlaw: { id:'outlaw', name:'Outlaw 2.0T', tag:'OUTLAW', preset:'hx52', mods:{ vehicle:{ drivetrain:'AWD' } }, massKg:1240, reactionMin:.025, reactionMax:.075, skill:.97, prep:true, tire:'pro_radial', reward:1500, color:'#d15cff', description:'HX52 op E85, vierwielaandrijving, licht en bijna foutloos.' }
  });
  const TELEMETRY_COLORS = Object.freeze({ speed:'#ffad20', rpm:'#f4f6f8', boost:'#4cc9ff', wheelspin:'#ff526b', lane:'#bd77ff' });

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const num = (value, decimals = 0) => Number(value || 0).toFixed(decimals);
  // Measured values: missing data is shown as '—', never as a fabricated 0.
  const mnum = (value, decimals = 0) => (Number.isFinite(value) ? Number(value).toFixed(decimals) : '—');
  const euro = value => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0);
  const clamp = C.clamp;

  function icon(name) { return ICONS[name] || ''; }

  function selectedRival() {
    return RIVALS[state.vehicle?.rivalLevel] || RIVALS.street;
  }

  function raceIsHeadsUp() {
    return (state.vehicle?.raceMode || 'heads_up') === 'heads_up';
  }

  function deterministicUnit(seedText) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < String(seedText).length; i++) {
      h ^= String(seedText).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h += 0x6D2B79F5;
    h = Math.imul(h ^ h >>> 15, h | 1);
    h ^= h + Math.imul(h ^ h >>> 7, h | 61);
    return ((h ^ h >>> 14) >>> 0) / 4294967296;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // The rival's pass does not depend on its reaction time (added on top), so it is simulated once per rival,
  // track and model version and cached (memory + storage): the race start never waits for it twice.
  const rivalCache = new Map();
  const RIVAL_CACHE_KEY = 'ea888.rivalCache.v1';
  function rivalConditions() {
    const v = state.vehicle || {};
    return { ambientTempC: v.ambientTempC, trackTempC: v.trackTempC, altitudeM: v.altitudeM, humidityPct: v.humidityPct, headwindKmh: v.headwindKmh };
  }
  function rivalState(profile) {
    let rs = C.applyPreset(C.blankState(), profile.preset);
    const m = profile.mods || {};
    rs.selections = { ...rs.selections, ...(m.selections || {}) };
    rs.tune = { ...rs.tune, ...(m.tune || {}) };
    rs.vehicle = { ...rs.vehicle, ...rivalConditions(), ...(m.vehicle || {}), raceMode:'solo', massKg:profile.massKg, tireCompound:profile.tire, preparedTrack:profile.prep, burnoutLevel:92,
      pressureBar: profile.tire === 'pro_radial' ? 1.05 : profile.tire === 'drag_radial' ? 1.25 : profile.tire === 'semislick' ? 1.75 : 2.05 };
    rs = m.rebaseMap ? C.regenerateBaseMap(rs) : C.normalizeState(rs);
    return rs;
  }
  function rivalPass(profile) {
    const key = JSON.stringify({ id: profile.id, model: C.ENGINE_MODEL_VERSION, vehicle: C.VEHICLE_MODEL_VERSION, c: rivalConditions() });
    if (rivalCache.has(key)) return rivalCache.get(key);
    try {
      const stored = JSON.parse(localStorage.getItem(RIVAL_CACHE_KEY) || '{}');
      if (stored[key]) { rivalCache.set(key, stored[key]); return stored[key]; }
    } catch (e) { /* storage unavailable */ }
    const rs = rivalState(profile);
    const dyno = C.simulateEngine(rs, { noise: false });
    // rivals do a good burnout: their tyres are at the compound's optimum at the launch
    const pass = C.simulateRaceRun(rs, { reactionTime: 0, driverSkill: profile.skill, tyreTempC: (C.TYRE[profile.tire] || C.TYRE.uhp).optC });
    const entry = { quarter: pass.quarter, trapKmh: pass.trapKmh, sixtyFt: pass.sixtyFt, eighth: pass.eighth, trace: pass.trace, peakHp: dyno.peakHp, peakTorqueNm: dyno.peakTorqueNm, massKg: pass.totalMassKg };
    rivalCache.set(key, entry);
    try {
      const stored = JSON.parse(localStorage.getItem(RIVAL_CACHE_KEY) || '{}');
      const keys = Object.keys(stored);
      if (keys.length > 12) delete stored[keys[0]];
      stored[key] = entry;
      localStorage.setItem(RIVAL_CACHE_KEY, JSON.stringify(stored));
    } catch (e) { /* storage full or unavailable */ }
    return entry;
  }
  // Warm the caches while the player is on the race page (engine map of the build, the selected rival's pass).
  function warmRaceCaches() {
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 60));
    idle(() => { try { if (currentCompletedDyno()) C.buildEngineMap(state); if (raceIsHeadsUp()) rivalPass(selectedRival()); } catch (e) { console.error('warm race caches', e); } });
  }
  // What is known about a rival: its build, and its measured numbers once its pass has been simulated.
  function rivalSpec(profile) {
    const key = JSON.stringify({ id: profile.id, model: C.ENGINE_MODEL_VERSION, vehicle: C.VEHICLE_MODEL_VERSION, c: rivalConditions() });
    let e = rivalCache.get(key);
    if (!e) { try { e = JSON.parse(localStorage.getItem(RIVAL_CACHE_KEY) || '{}')[key]; } catch (err) { e = null; } }
    return e ? `${Math.round(e.peakHp)} pk · ${e.quarter.toFixed(2)} s @ ${Math.round(e.trapKmh)} km/u` : profile.description;
  }
  function buildRivalSimulation() {
    const round = raceGame?.careerRound;
    if (round && currentCompletedDyno()) {
      // Career round: the planned rival with its own reaction and consistency; in a bracket the lanes start
      // apart by the dial difference (the slower dial goes first).
      const profile = RIVALS[round.plan.rivalId] || RIVALS.street;
      const pass = rivalPass(profile), k = round.plan.etScale || 1;
      const trace = (pass.trace || []).map(p => ({ ...p, time: p.time * k }));
      const quarter = pass.quarter * k, reactionTime = round.plan.reactionTime;
      const startOffset = round.format === 'bracket' ? round.dialIn - round.plan.dialIn : 0;
      return { profile, reactionTime, startOffset, result: { ...pass, quarter, trace, reactionTime, finishTotalTime: startOffset + reactionTime + quarter }, trace,
        current: { time: 0, distanceM: 0, speedKmh: 0, rpm: 900, gear: 1 }, finished: false };
    }
    if (!raceIsHeadsUp() || !currentCompletedDyno()) return null;
    const profile = selectedRival();
    const pass = rivalPass(profile);
    const runNumber = (state.dragRuns?.length || 0) + 1;
    const u = deterministicUnit(`${profile.id}|${runNumber}|${Math.round(state.lastDyno.peakHp || 0)}|${state.vehicle.drivetrain}`);
    const reactionTime = profile.reactionMin + (profile.reactionMax - profile.reactionMin) * u;
    const result = { ...pass, reactionTime, finishTotalTime: pass.quarter + reactionTime };
    return {
      profile,
      reactionTime,
      result,
      trace:pass.trace || [],
      current:{time:0,distanceM:0,speedKmh:0,rpm:900,gear:1},
      finished:false
    };
  }

  function tracePointAtTime(trace, time) {
    if (!Array.isArray(trace) || !trace.length || time <= 0) return {time:0,distanceM:0,speedKmh:0,rpm:900,gear:1,accelerationG:0};
    if (time >= trace[trace.length - 1].time) return {...trace[trace.length - 1]};
    let lo = 0, hi = trace.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (trace[mid].time <= time) lo = mid; else hi = mid;
    }
    const a = trace[lo], b = trace[hi];
    const f = clamp((time - a.time) / Math.max(.0001, b.time - a.time), 0, 1);
    return {
      time,
      distanceM:C.lerp(a.distanceM || 0,b.distanceM || 0,f),
      speedKmh:C.lerp(a.speedKmh || 0,b.speedKmh || 0,f),
      rpm:C.lerp(a.rpm || 900,b.rpm || 900,f),
      gear:f < .5 ? (a.gear || 1) : (b.gear || 1),
      accelerationG:C.lerp(a.accelerationG || 0,b.accelerationG || 0,f)
    };
  }


  const PART_VISUALS = Object.freeze({
    block: 'part-piston.webp', crank: 'part-piston.webp', oiling: 'part-piston.webp', crankcase: 'part-piston.webp', sealing: 'part-piston.webp',
    head: 'part-head.webp', valvetrain: 'part-head.webp', manifold: 'part-head.webp', ignition: 'part-head.webp',
    turbo: 'part-turbo.webp', boostControl: 'part-turbo.webp', spool: 'part-turbo.webp', exhaust: 'part-turbo.webp',
    air: 'part-intercooler.webp', cooling: 'part-intercooler.webp',
    fuelSystem: 'part-fuel.webp', fuel: 'part-fuel.webp', ecu: 'part-fuel.webp', sensors: 'part-fuel.webp',
    transmission: 'part-transmission.webp', clutch: 'part-transmission.webp'
  });

  function partVisual(catId) { return PART_VISUALS[catId] || 'engine-realistic.webp'; }

  function openCategoryTile(catId) {
    activeCategory = C.CATEGORY_MAP[catId] ? catId : 'turbo';
    motorPanel = 'hardware';
    partSearch = '';
    go('build');
  }

  function loadState() {
    let parsed = null;
    let sourceKey = STORAGE_KEY;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
      if (!parsed) {
        for (const key of LEGACY_KEYS) {
          const legacy = localStorage.getItem(key);
          if (legacy) { parsed = JSON.parse(legacy); sourceKey = key; break; }
        }
      }
    } catch (e) { parsed = null; }

    if (!parsed) {
      const fresh = C.createInitialState();
      fresh.version = 12;
      fresh.settings.sound = true;
      fresh.buildSlots = [null, null, null];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch (e) { /* no-op */ }
      return fresh;
    }

    const oldVersion = Number(parsed.version || 2);
    let loaded = C.normalizeState(parsed);
    loaded.version = 12;
    loaded.buildSlots = Array.isArray(parsed.buildSlots) ? parsed.buildSlots.slice(0, 3) : [null, null, null];
    while (loaded.buildSlots.length < 3) loaded.buildSlots.push(null);

    if (oldVersion < 12) {
      loaded.history = Array.isArray(loaded.history) ? loaded.history : [];
      loaded.history.unshift({
        at: new Date().toISOString(), type: 'update',
        label: `v1.2 Race Weekend + Telemetry-migratie vanuit ${sourceKey === STORAGE_KEY ? `v${oldVersion}` : 'een eerdere installatie'}`
      });
      loaded.lastDynoSignature = '';
      loaded.bench = { results: {} };
      loaded.settings = { ...loaded.settings, sound: true };
    }

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); } catch (e) { /* no-op */ }
    return C.normalizeState(loaded);
  }

  function saveState() {
    state = C.normalizeState(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage may be unavailable */ }
  }

  function pushHistory(entry) {
    state.history = Array.isArray(state.history) ? state.history : [];
    state.history.unshift({ at: new Date().toISOString(), ...entry });
    state.history = state.history.slice(0, 40);
  }

  function haptic(pattern = 12) {
    if (!state.settings?.haptics) return;
    if (NATIVE?.available) {
      // Patterns ([on, off, on, ...]) become their first pulse plus a short follow-up.
      const list = Array.isArray(pattern) ? pattern : [pattern];
      NATIVE.haptic(list[0] || 10);
      for (let i = 2, at = (list[0] || 0) + (list[1] || 0); i < list.length; at += (list[i] || 0) + (list[i + 1] || 0), i += 2) setTimeout(() => NATIVE.haptic(list[i]), at);
      return;
    }
    if (!navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
  }

  function syncAchievements() {
    const earned = C.evaluateChallenges(state);
    state.achievements = state.achievements || {};
    let changed = false;
    for (const challenge of C.CHALLENGES) {
      if (earned[challenge.id] && !state.achievements[challenge.id]) {
        state.achievements[challenge.id] = { unlockedAt: new Date().toISOString(), claimed: false };
        pushHistory({ type: 'achievement', label: `Challenge ontgrendeld: ${challenge.title}` });
        changed = true;
      }
    }
    if (changed) saveState();
    return earned;
  }

  function buildSnapshot() {
    return {
      version: 12, buildName: state.buildName, savedAt: new Date().toISOString(),
      selections: JSON.parse(JSON.stringify(state.selections)),
      tune: JSON.parse(JSON.stringify(state.tune)),
      assembly: JSON.parse(JSON.stringify(state.assembly)),
      service: JSON.parse(JSON.stringify(state.service)),
      vehicle: JSON.parse(JSON.stringify(state.vehicle)),
      dynoConfig: JSON.parse(JSON.stringify(state.dynoConfig))
    };
  }

  function saveBuildSlot(index) {
    state.buildSlots = Array.isArray(state.buildSlots) ? state.buildSlots.slice(0, 3) : [null, null, null];
    while (state.buildSlots.length < 3) state.buildSlots.push(null);
    state.buildSlots[index] = buildSnapshot();
    pushHistory({ type: 'slot', label: `Build opgeslagen in slot ${index + 1}: ${state.buildName}` });
    saveState(); haptic([12, 25, 12]); showToast(`Build opgeslagen in slot ${index + 1}.`); render();
  }

  function loadBuildSlot(index) {
    const slot = state.buildSlots?.[index];
    if (!slot) return showToast('Dit buildslot is nog leeg.');
    for (const key of ['selections','tune','assembly','service','vehicle','dynoConfig']) {
      if (slot[key]) state[key] = { ...state[key], ...JSON.parse(JSON.stringify(slot[key])) };
    }
    // slots saved by older versions may name retired parts (e.g. the generic 98-mm turbo): migrate them
    markOnboarding('built');
    const migrated = C.normalizeState(state);
    for (const key of ['selections','tune','assembly','service','vehicle','dynoConfig']) state[key] = migrated[key];
    state.buildName = slot.buildName || `Buildslot ${index + 1}`;
    state.bench = { results: {} };
    pushHistory({ type: 'slot', label: `Build geladen uit slot ${index + 1}` });
    saveState(); haptic([12, 25, 12]); showToast('Build geladen. Dynodata is nu ongetest.'); render();
  }

  function encodeBuildCode() {
    const payload = JSON.stringify({ app: 'EA888-LAB', version: 11, savedAt: new Date().toISOString(), state: buildSnapshot() });
    const bytes = new TextEncoder().encode(payload);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }

  function decodeBuildCode(code) {
    const clean = String(code || '').trim().replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.app !== 'EA888-LAB' || !payload.state) throw new Error('Geen geldige EA888 Lab-buildcode.');
    return payload.state;
  }

  // Full backup: the whole game (budget, history, dyno runs, wear, build slots), for reinstalls and new
  // phones. Written through the system file dialog on Android; a download in a browser.
  async function exportFullBackup() {
    const payload = JSON.stringify({ app: 'EA888-LAB', kind: 'full-backup', appVersion: APP_VERSION, savedAt: new Date().toISOString(), state }, null, 1);
    const day = new Date().toISOString().slice(0, 10);
    const saver = NATIVE ? NATIVE.saveFile.bind(NATIVE) : null;
    if (!saver) return showToast('Back-up naar bestand is niet beschikbaar in deze omgeving.');
    const ok = await saver(`ea888-lab-backup-${day}.json`, payload);
    if (ok) { pushHistory({ type: 'backup', label: 'Volledige back-up opgeslagen' }); saveState(); }
    showToast(ok ? 'Back-up opgeslagen.' : 'Back-up niet opgeslagen.');
  }

  function restoreFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('Het bestand is leeg.');
    if (raw.startsWith('{')) {
      const payload = JSON.parse(raw);
      if (payload.app !== 'EA888-LAB' || payload.kind !== 'full-backup' || !payload.state) throw new Error('Dit is geen EA888 LAB-back-up.');
      const slots = Array.isArray(payload.state.buildSlots) ? payload.state.buildSlots.slice(0, 3) : [null, null, null];
      state = C.normalizeState(payload.state);
      state.buildSlots = slots;
      while (state.buildSlots.length < 3) state.buildSlots.push(null);
      pushHistory({ type: 'backup', label: `Back-up teruggezet (${String(payload.appVersion || '?')}, ${String(payload.savedAt || '').slice(0, 10)})` });
      return 'Volledige back-up teruggezet.';
    }
    importBuffer = raw;
    confirmImport();
    return '';
  }

  async function importFullBackup() {
    if (!NATIVE) return showToast('Back-up openen is niet beschikbaar in deze omgeving.');
    const text = await NATIVE.openFile();
    if (text == null) return;
    try {
      const message = restoreFromText(text);
      if (message) { saveState(); pendingOilId = state.service.oilId; pendingFilterId = state.service.filterId; showToast(message); render(); }
    } catch (e) {
      showToast(`Terugzetten mislukt: ${e.message}`);
    }
  }

  // -------------------------------------------------------------------
  // V11 sampled EA888 audio engine
  // -------------------------------------------------------------------
  // The previous versions used a small oscillator stack. V11 loads an
  // original PCM sound bank rendered at several real engine speeds and
  // continuously crossfades/pitch-tracks those recordings. The context and
  // looping sources survive every pass so race two, three and later runs keep
  // their audio without a reload.
  let engineAudioGeneration = 0;
  let decodedAudioBankPromise = null;

  function selectedTransmissionId() {
    return String(state?.selections?.transmission || 'oem_6mt');
  }

  function selectedTransmission() {
    return C.getPart(state, 'transmission');
  }

  function isDsgTransmission() {
    return selectedTransmissionId() === 'dq250';
  }

  function base64AudioBuffer(base64) {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }

  function decodeAudioDataCompat(ctx, arrayBuffer) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = value => { if (!settled) { settled = true; resolve(value); } };
      const bad = error => { if (!settled) { settled = true; reject(error); } };
      try {
        const maybe = ctx.decodeAudioData(arrayBuffer.slice(0), ok, bad);
        if (maybe && typeof maybe.then === 'function') maybe.then(ok, bad);
      } catch (error) { bad(error); }
    });
  }

  function decodeSampleBank(ctx) {
    if (decodedAudioBankPromise?.ctx === ctx) return decodedAudioBankPromise.promise;
    const bank = window.EA888_AUDIO_BANK || {};
    const promise = Promise.all(Object.entries(bank).map(async ([name, meta]) => {
      const buffer = await decodeAudioDataCompat(ctx, base64AudioBuffer(meta.data));
      return [name, { ...meta, buffer }];
    })).then(entries => Object.fromEntries(entries));
    decodedAudioBankPromise = { ctx, promise };
    return promise;
  }

  function startLoopSource(ctx, buffer, output, initialRate = 1) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = initialRate;
    source.connect(output);
    source.start(0);
    return source;
  }

  function playSampleOneShot(audio, name, gainValue = .5, rate = 1, delay = 0) {
    if (!audio?.ready || !audio.buffers?.[name]?.buffer || audio.ctx?.state === 'closed') return null;
    try {
      const t = audio.ctx.currentTime + Math.max(0, delay);
      const source = audio.ctx.createBufferSource();
      const gain = audio.ctx.createGain();
      source.buffer = audio.buffers[name].buffer;
      source.playbackRate.value = clamp(rate, .55, 1.8);
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, gainValue), t + .006);
      const duration = source.buffer.duration / source.playbackRate.value;
      gain.gain.exponentialRampToValueAtTime(.0001, t + Math.max(.04, duration - .015));
      // ALS bangs/crackle on the ALS channel, the blow-off valve on the turbo channel, the rest on the engine
      const bus = name.startsWith('als_') ? audio.transientBus : name === 'blowoff' ? audio.mix?.turbo : audio.engineFx;
      source.connect(gain).connect(bus || audio.transientBus);
      audio.oneShots = audio.oneShots || new Set();
      audio.oneShots.add(source);
      source.onended = () => {
        audio.oneShots?.delete(source);
        try { source.disconnect(); gain.disconnect(); } catch (e) {}
      };
      source.start(t);
      source.stop(t + duration + .04);
      return source;
    } catch (e) { return null; }
  }

  // ---- Mixer, acoustics and the synthesized engine voice --------------------------------------------
  const MIX_CHANNELS = ['engine', 'turbo', 'als', 'tyre', 'rival', 'ui'];
  function mixLevel(name) {
    const v = Number(state.settings?.mix?.[name]);
    return Number.isFinite(v) ? clamp(v, 0, 150) / 100 : 1;
  }
  function applyMix(audio = engineAudio) {
    if (!audio?.mix || audio.ctx?.state === 'closed') return;
    const t = audio.ctx.currentTime;
    for (const name of MIX_CHANNELS) audio.mix[name]?.gain.setTargetAtTime(mixLevel(name), t, .03);
  }
  // Where the sound is heard: the garage (small concrete workshop), the dyno cell (absorptive test cell,
  // nearly dry) or the strip (open air: a ground bounce, then the pit wall and the grandstand as distinct
  // echoes). The impulse responses are generated here from those geometries, no recorded rooms.
  const ACOUSTICS = Object.freeze({
    garage: { lenS: 1.1, rt60: .85, wet: .5, lpHz: 5200, diffuse: .3, taps: [[.0062, .46], [.0105, .36], [.0148, .3], [.0213, .24], [.0287, .19], [.0342, .15]] },
    dyno: { lenS: .5, rt60: .26, wet: .22, lpHz: 7000, diffuse: .11, taps: [[.0041, .22], [.0093, .1]] },
    // ground bounce 2.5 ms, pit wall ~8.5 m (50 ms round trip), grandstand ~40 m (235 ms) and its second pass
    strip: { lenS: 1.3, rt60: .32, wet: .42, lpHz: 3800, diffuse: .05, taps: [[.0025, .42], [.051, .26], [.236, .18], [.412, .07]] }
  });
  function acousticScene() {
    if (dynoRunning || activeTab === 'dyno') return 'dyno';
    if (raceGame?.open || burnoutRuntime?.active || dragAnimation) return 'strip';
    return 'garage';
  }
  function makeImpulse(ctx, name) {
    const a = ACOUSTICS[name] || ACOUSTICS.garage, sr = ctx.sampleRate;
    const n = Math.round(a.lenS * sr), ir = ctx.createBuffer(2, n, sr);
    let seed = 7919 * name.length + 17;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
    const k = Math.exp(-2 * Math.PI * a.lpHz / sr), norm = Math.sqrt((1 + k) / (1 - k));
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, x = rnd();
        lp = x + (lp - x) * k;
        // diffuse tail: -60 dB after rt60, building up over the first 4 ms
        d[i] = lp * norm * a.diffuse * Math.exp(-6.91 * t / a.rt60) * Math.min(1, t / .004) * .25;
      }
      // discrete reflections: later (farther) ones are smeared and duller; left/right arrive slightly apart
      for (const [time, gain] of a.taps) {
        const at = Math.round((time + (ch ? .0003 : -.0002) * (1 + time * 20)) * sr), w = 1 + Math.round(time * 90);
        for (let j = 0; j < w; j++) if (at + j < n && at + j >= 0) d[at + j] += gain * (ch ? .94 : 1) / w * (1 - j / (w + 1)) * 2;
      }
    }
    return ir;
  }
  function applyScene(audio, name) {
    if (!audio?.convolver || audio.scene === name || audio.ctx.state === 'closed') return;
    audio.scene = name;
    const t = audio.ctx.currentTime;
    audio.wet.gain.cancelScheduledValues(t);
    audio.wet.gain.setTargetAtTime(.0001, t, .012);
    // swap the room while its return is muted (a convolver buffer change would click)
    setTimeout(() => {
      if (engineAudio !== audio || audio.ctx.state === 'closed' || audio.scene !== name) return;
      try {
        audio.impulses[name] = audio.impulses[name] || makeImpulse(audio.ctx, name);
        audio.convolver.buffer = audio.impulses[name];
        audio.wet.gain.setTargetAtTime(ACOUSTICS[name].wet, audio.ctx.currentTime, .06);
      } catch (e) {}
    }, 60);
  }
  function limiterCutKind() { return C.antiLagCapability(state).flatShift ? 'spark' : 'fuel'; }
  // Audible knock: a knock index of 1.0 means the end gas auto-ignites before the flame front arrives;
  // with cycle-to-cycle variation single cycles start to knock from about 0.9.
  function audibleKnock(index) { return clamp((Number(index) - .9) / .35, 0, 1); }
  // Two-step with the pedal floored: roughly 70 % of the events are cut to hold the unloaded engine at
  // the launch rpm; the rest (with retarded ignition) just overcomes friction and pumping.
  const TWO_STEP_CUT = .7;
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  function synthParams(audio, extras) {
    const x = extras || {};
    const rpm = audio.lastRpm;
    let cutFraction = fin(x.cutFraction) ? clamp(x.cutFraction, 0, 1) : 0;
    let cutKind = x.cutKind || limiterCutKind();
    let retardDeg = fin(x.retardDeg) ? Math.max(0, x.retardDeg) : 0;
    if (x.alsActive) {
      // ALS: the simulated bang rate is the firing frequency times the share of cut (misfired) events
      if (Number(x.popRateHz) > 0) cutFraction = Math.max(cutFraction, clamp(x.popRateHz / Math.max(1, rpm / 30), 0, 1));
      cutKind = 'spark';
      retardDeg = Math.max(retardDeg, Number(C.resolveAntiLag(state).params?.retardDeg || 0));
    } else if (x.twoStep) {
      cutFraction = Math.max(cutFraction, TWO_STEP_CUT); cutKind = limiterCutKind(); retardDeg = Math.max(retardDeg, 10);
    }
    return {
      rpm, load: audio.lastLoad, mapBar: fin(x.mapBar) ? x.mapBar : NaN, boostBar: Math.max(0, Number(x.boostBar) || 0),
      egtC: fin(x.egtC) && x.egtC > 0 ? x.egtC : NaN, wastegatePct: fin(x.wastegatePct) ? x.wastegatePct : NaN,
      knock: clamp(Number(x.knock) || 0, 0, 1), alsActive: !!x.alsActive, retardDeg, lambda: fin(x.lambda) && x.lambda > 0 ? x.lambda : 1,
      cutFraction, cutKind, exhaust: state.selections?.exhaust || 'oem_exhaust', boreMm: audio.boreMm, running: true
    };
  }
  function engineWorkletSupported(ctx) {
    return !synthBroken && !!(ctx?.audioWorklet && typeof AudioWorkletNode === 'function' && window.EA888EngineVoice?.moduleSource && state.settings?.engineSound !== 'samples');
  }
  function loadEngineWorklet(ctx) {
    if (!engineWorkletSupported(ctx)) return Promise.resolve(false);
    let url = '';
    try { url = URL.createObjectURL(new Blob([window.EA888EngineVoice.moduleSource()], { type: 'application/javascript' })); } catch (e) { return Promise.resolve(false); }
    return ctx.audioWorklet.addModule(url).then(() => true, error => { console.warn('EA888 engine worklet unavailable, using samples:', error?.message || error); return false; })
      .finally(() => { try { URL.revokeObjectURL(url); } catch (e) {} });
  }
  function createEngineVoiceNode(ctx, seed, params) {
    return new AudioWorkletNode(ctx, 'ea888-engine', { numberOfInputs: 0, numberOfOutputs: 3, outputChannelCount: [1, 1, 1], processorOptions: { seed, params } });
  }
  function createRivalVoice(audio, profile) {
    try {
      let exhaust = 'race_3';
      try { exhaust = rivalState(profile).selections.exhaust || exhaust; } catch (e) {}
      const ctx = audio.ctx;
      const node = createEngineVoiceNode(ctx, 991, { exhaust, rpm: 900, load: .1 });
      const sum = ctx.createGain(); sum.gain.value = 1;
      node.connect(sum, 0); node.connect(sum, 1); node.connect(sum, 2);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = .5;
      const gain = ctx.createGain(); gain.gain.value = .0001;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      sum.connect(lp).connect(gain);
      if (pan) gain.connect(pan).connect(audio.mix.rival); else gain.connect(audio.mix.rival);
      return { node, sum, lp, gain, pan, exhaust, profileId: profile.id };
    } catch (e) { return null; }
  }
  // The rival's own engine (same voice, its own build and exhaust), placed where it is on the strip:
  // the listener rides with the chase camera ~8 m behind the player; the rival runs in the lane 4.3 m right.
  function updateRivalAudio(run) {
    const audio = engineAudio;
    if (!audio?.synth || !audio.active || !run?.opponent || audio.ctx.state === 'closed') return;
    if (audio.rival && audio.rival.profileId !== run.opponent.profile.id) {
      try { audio.rival.node.port.postMessage({ type: 'stop' }); audio.rival.node.disconnect(); audio.rival.gain.disconnect(); } catch (e) {}
      audio.rival = null;
    }
    if (!audio.rival) audio.rival = createRivalVoice(audio, run.opponent.profile);
    const r = audio.rival;
    if (!r) return;
    const cur = run.opponent.current || {};
    const drive = run.t + run.reactionTime - run.opponent.reactionTime - (run.opponent.startOffset || 0);
    const staged = drive <= 0, done = !!run.opponent.finished;
    r.node.port.postMessage({ type: 'set', p: {
      rpm: staged ? 4000 : Number(cur.rpm || 900), load: staged ? .8 : done ? .05 : 1, boostBar: Math.max(0, Number(cur.boostBar) || 0),
      cutFraction: staged ? TWO_STEP_CUT : 0, cutKind: 'spark', retardDeg: staged ? 10 : 0, exhaust: r.exhaust, running: true
    } });
    const dx = 4.3 - Number(run.lateralM || 0), dz = Number(run.opponentGapM || 0) + 8.2;
    const d = Math.max(1.5, Math.hypot(dx, dz)), t = audio.ctx.currentTime;
    r.pan?.pan.setTargetAtTime(clamp(dx / d * 1.25, -1, 1), t, .05);
    r.gain.gain.setTargetAtTime(clamp(8 / d, .02, 1) * .75, t, .05);  // spherical spreading (1/r)
    r.lp.frequency.setTargetAtTime(clamp(14000 / (1 + d / 30), 700, 12000), t, .08); // air absorption / masking
    audio.rivalDistanceM = d;
  }

  let audioBrokenForTest = false;
  function applySampledAudio(audio, rpm, load, wheelSlip, extras = null) {
    if (audioBrokenForTest) throw new Error('test audio failure');
    if (!audio) return;
    audio.lastExtras = extras;
    audio.lastRpm = clamp(Number(rpm || 900), 650, 10800);
    audio.lastLoad = clamp(Number(load || 0), 0, 1.35);
    audio.lastSlip = clamp(Number(wheelSlip || 0), 0, 1);
    if (!audio.ready) return;

    const t = audio.ctx.currentTime;
    const boundedRpm = audio.lastRpm;
    const boundedLoad = audio.lastLoad;
    const slip = audio.lastSlip;
    const activeGain = audio.active ? 1 : 0;
    applyScene(audio, acousticScene());
    const alsHarsh = extras?.alsActive ? clamp(.35 + Number(extras.alsIntensity || 0) * .65, 0, 1) : 0;
    if (audio.synth) {
      // The voice builds the note, the limiter, cuts, knock and afterfire from these simulation values.
      if (audio.active) audio.synth.node.port.postMessage({ type: 'set', p: synthParams(audio, extras) });
    } else {
    const anchors = audio.layers.map(layer => layer.rpm);
    let lower = 0;
    while (lower < anchors.length - 1 && anchors[lower + 1] <= boundedRpm) lower++;
    const upper = Math.min(anchors.length - 1, lower + 1);
    const a = anchors[lower];
    const b = anchors[upper];
    const mix = a === b ? 0 : clamp((boundedRpm - a) / (b - a), 0, 1);
    const smooth = mix * mix * (3 - 2 * mix);
    const loadGain = .18 + Math.pow(clamp(boundedLoad, 0, 1), .72) * .82;

    audio.layers.forEach((layer, index) => {
      let weight = 0;
      if (index === lower) weight = 1 - smooth;
      if (index === upper) weight = Math.max(weight, smooth);
      if (lower === upper && index === lower) weight = 1;
      const rate = clamp(boundedRpm / layer.rpm, .64, 1.52);
      layer.source.playbackRate.setTargetAtTime(rate, t, .025);
      layer.gain.gain.setTargetAtTime(activeGain * loadGain * weight * .72 + .0001, t, .032);
    });

    // Throttle/load changes the acoustic opening of the exhaust and intake.
    audio.engineLowpass.frequency.setTargetAtTime(1100 + boundedRpm * .58 + boundedLoad * 2450, t, .045);
    audio.engineLowpass.Q.setTargetAtTime(.55 + boundedLoad * .5, t, .05);
    audio.bodyEq.frequency.setTargetAtTime(105 + boundedRpm * .008, t, .06);
    audio.bodyEq.gain.setTargetAtTime(6.5 - boundedRpm / 2800 + boundedLoad * 2.2, t, .07);
    audio.raspEq.frequency.setTargetAtTime(760 + boundedRpm * .12, t, .055);
    // ALS makes the note harsher: more rasp and a more open exhaust while it fires.
    audio.raspEq.gain.setTargetAtTime(-1 + boundedLoad * 4.4 + Math.max(0, boundedRpm - 4500) / 1700 + alsHarsh * 6.5, t, .06);
    }

    if (audio.turboSource) {
      // With a turbo runtime the whine follows the simulated shaft speed; otherwise rpm/load.
      const hasShaft = Number.isFinite(extras?.shaftPct);
      const spool = hasShaft ? clamp((extras.shaftPct - 25) / 70, 0, 1.1) : Math.max(0, boundedLoad - .18) * clamp((boundedRpm - 1500) / 5200, 0, 1);
      const rate = hasShaft ? .55 + clamp(extras.shaftPct, 0, 115) / 100 * 1.05 : .60 + boundedRpm / 7200 + boundedLoad * .24;
      audio.turboSource.playbackRate.setTargetAtTime(rate, t, .035);
      audio.turboGain.gain.setTargetAtTime(activeGain * spool * .17 + .0001, t, .05);
      audio.turboFilter.frequency.setTargetAtTime(hasShaft ? 1200 + extras.shaftPct * 42 : 1450 + boundedRpm * .48, t, .04);
    }
    // Two-step launch limiter: its own stutter one-shot (separate from the rev limiter).
    if (!audio.synth && extras?.twoStep && !extras.alsActive) {
      const nowTs = performance.now();
      if (nowTs - (audio.lastTwoStepMs || 0) > 380) {
        audio.lastTwoStepMs = nowTs;
        playSampleOneShot(audio, 'limiter', .22 + boundedLoad * .1, .9 + boundedRpm / 20000);
      }
    }
    // ALS bangs: their own one-shot layer at the simulated bang rate (firing frequency x cut fraction).
    // The misfire/retard pattern is irregular, so the spacing is jittered and the variant changes per bang;
    // an occasional heavier bang comes from a larger unburnt charge. The crackle bed carries the after-burn
    // in between and follows the sustained-flame strength.
    const alsOn = !audio.synth && !!extras?.alsActive && Number(extras.popRateHz) > 0;
    if (audio.alsBedGain) {
      const sustain = alsOn ? clamp(Number(extras.flameSustain || 0), 0, 1) : 0;
      audio.alsBedGain.gain.setTargetAtTime(activeGain * (alsOn ? .05 + sustain * .45 : 0) + .0001, t, alsOn ? .03 : .06);
      audio.alsBedSource?.playbackRate.setTargetAtTime(.88 + boundedRpm / 22000, t, .08);
    }
    if (alsOn) {
      const nowPop = performance.now();
      if (nowPop >= (audio.nextAlsBangMs || 0)) {
        audio.nextAlsBangMs = nowPop + (1000 / extras.popRateHz) * (.55 + Math.random() * .9);
        const fi = clamp(Number(extras.flameIntensity || 0), 0, 1);
        let v = 1 + Math.floor(Math.random() * 4);
        if (v === audio.lastAlsVariant) v = 1 + (v % 4);
        audio.lastAlsVariant = v;
        const heavy = Math.random() < .14 + fi * .1;
        audio.alsBangs = (audio.alsBangs || 0) + 1;
        playSampleOneShot(audio, `als_bang_${v}`, (.42 + fi * .55 + alsHarsh * .06) * (heavy ? 1.25 : 1), (heavy ? .86 : .93) + Math.random() * .15);
        // Duck the engine for the bang: the master compressor would otherwise squash the transient under the
        // steady engine drone. In a real car the bang dominates the note for a few tens of milliseconds.
        const eg = audio.engineBusGain.gain;
        eg.cancelScheduledValues(t);
        eg.setValueAtTime(Math.max(.3, eg.value), t);
        eg.setTargetAtTime(heavy ? .22 : .38, t + .002, .006);
        eg.setTargetAtTime(1, t + .045, .03);
      }
    } else audio.nextAlsBangMs = 0;
    if (audio.tyreSource) {
      audio.tyreSource.playbackRate.setTargetAtTime(.72 + slip * .86 + boundedRpm / 26000, t, .025);
      audio.tyreGain.gain.setTargetAtTime(activeGain * Math.pow(slip, .72) * (.12 + boundedLoad * .19) + .0001, t, .03);
    }

    // Samples: loudness follows load by gain; the synthesized voice is loud or quiet by its own physics.
    const output = audio.synth ? activeGain * .6 : activeGain * (.36 + boundedLoad * .30 + slip * .035);
    audio.master.gain.setTargetAtTime(output + .0001, t, .025);

    // The limiter is now a real sampled cut/stutter instead of a text-only cue.
    const limit = Number(state?.tune?.revLimitRpm || 8000);
    const nowMs = performance.now();
    if (!audio.synth && boundedLoad > .58 && boundedRpm >= limit - 75 && nowMs - audio.lastLimiterMs > 470) {
      playSampleOneShot(audio, 'limiter', .34 + boundedLoad * .12, .96 + Math.random() * .05);
      audio.lastLimiterMs = nowMs;
      audio.engineBusGain.gain.cancelScheduledValues(t);
      audio.engineBusGain.gain.setValueAtTime(Math.max(.25, audio.engineBusGain.gain.value), t);
      audio.engineBusGain.gain.setTargetAtTime(.25, t + .01, .015);
      audio.engineBusGain.gain.setTargetAtTime(1, t + .11, .045);
    }
  }

  function ensureEngineAudio(mode = 'engine') {
    if (!state.settings?.sound) return null;
    if (engineAudio?.ctx) {
      engineAudio.mode = mode;
      engineAudio.active = true;
      try { if (engineAudio.ctx.state !== 'running') engineAudio.ctx.resume(); } catch (e) {}
      applyScene(engineAudio, acousticScene());
      return engineAudio;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC({ latencyHint: 'interactive', sampleRate: 32000 });
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 10;
      compressor.ratio.value = 5.2;
      compressor.attack.value = .002;
      compressor.release.value = .11;
      compressor.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = .0001;
      master.connect(compressor);
      // Room: everything the car makes goes dry plus through the scene's impulse response.
      const sceneIn = ctx.createGain(); sceneIn.gain.value = 1;
      const dry = ctx.createGain(); dry.gain.value = 1;
      const wet = ctx.createGain(); wet.gain.value = .0001;
      const convolver = ctx.createConvolver();
      sceneIn.connect(dry).connect(master);
      sceneIn.connect(convolver).connect(wet).connect(master);
      // Mixer channels (settings): engine, turbo, ALS/afterfire, tyres, rival, UI.
      const mix = {};
      for (const name of MIX_CHANNELS) { mix[name] = ctx.createGain(); mix[name].gain.value = mixLevel(name); mix[name].connect(name === 'ui' ? master : sceneIn); }

      const engineBusGain = ctx.createGain();
      engineBusGain.gain.value = 1;
      const engineLowpass = ctx.createBiquadFilter();
      engineLowpass.type = 'lowpass'; engineLowpass.frequency.value = 3200; engineLowpass.Q.value = .75;
      const bodyEq = ctx.createBiquadFilter();
      bodyEq.type = 'peaking'; bodyEq.frequency.value = 118; bodyEq.Q.value = 1.05; bodyEq.gain.value = 7;
      const raspEq = ctx.createBiquadFilter();
      raspEq.type = 'peaking'; raspEq.frequency.value = 1250; raspEq.Q.value = .85; raspEq.gain.value = 2;
      engineBusGain.connect(engineLowpass).connect(bodyEq).connect(raspEq).connect(mix.engine);

      const turboFilter = ctx.createBiquadFilter();
      turboFilter.type = 'bandpass'; turboFilter.frequency.value = 2500; turboFilter.Q.value = 2.7;
      const turboGain = ctx.createGain(); turboGain.gain.value = .0001;
      turboFilter.connect(turboGain).connect(mix.turbo);

      const tyreFilter = ctx.createBiquadFilter();
      tyreFilter.type = 'bandpass'; tyreFilter.frequency.value = 1350; tyreFilter.Q.value = .9;
      const tyreGain = ctx.createGain(); tyreGain.gain.value = .0001;
      tyreFilter.connect(tyreGain).connect(mix.tyre);

      const transientBus = ctx.createGain();
      transientBus.gain.value = .78;
      transientBus.connect(mix.als);
      // engine one-shots of the sample fallback (limiter, launch, shift) sit on the engine channel
      const engineFx = ctx.createGain(); engineFx.gain.value = .78; engineFx.connect(mix.engine);
      // ALS after-burn crackle bed (loop); its level follows the simulated sustained flame.
      const alsBedGain = ctx.createGain(); alsBedGain.gain.value = .0001;
      alsBedGain.connect(transientBus);

      engineAudioGeneration += 1;
      const audio = engineAudio = {
        ctx, compressor, master, engineBusGain, engineLowpass, bodyEq, raspEq,
        turboFilter, turboGain, tyreFilter, tyreGain, transientBus, engineFx, alsBedGain,
        sceneIn, dry, wet, convolver, impulses: {}, scene: '', mix,
        layers: [], turboSource: null, tyreSource: null, alsBedSource: null, buffers: null, oneShots: new Set(),
        synth: null, rival: null, synthStats: null,
        boreMm: Number(C.engineGeometry(state)?.boreMm || 82.5),
        mode, active: true, ready: false, loading: true,
        generation: engineAudioGeneration, lastRpm: 900, lastLoad: .12, lastSlip: 0,
        lastLimiterMs: 0, model: 'EA888 PCM multisample v11'
      };
      applyScene(audio, acousticScene());

      audio.readyPromise = Promise.all([decodeSampleBank(ctx), loadEngineWorklet(ctx)]).then(([buffers, worklet]) => {
        if (engineAudio !== audio || ctx.state === 'closed') return audio;
        audio.buffers = buffers;
        if (worklet) {
          try {
            // Synthesized voice: exhaust and afterfire on their own mixer channels, the engine bay
            // (intake, injectors, valvetrain, knock) a little under the exhaust.
            const node = createEngineVoiceNode(ctx, 1 + (audio.generation % 97), synthParams(audio, null));
            const exh = ctx.createGain(); exh.gain.value = .55;
            const bay = ctx.createGain(); bay.gain.value = .45;
            const pops = ctx.createGain(); pops.gain.value = .6;
            node.connect(exh, 0); node.connect(bay, 1); node.connect(pops, 2);
            exh.connect(mix.engine); bay.connect(mix.engine); pops.connect(mix.als);
            node.port.onmessage = ev => { if (ev.data?.type === 'stats') audio.synthStats = ev.data.stats; };
            audio.synth = { node, exh, bay, pops };
            audio.model = 'EA888 combustion synth v1 (AudioWorklet)';
          } catch (error) { audio.synth = null; console.warn('EA888 engine voice failed, using samples:', error?.message || error); }
        }
        if (!audio.synth) audio.layers = Object.entries(buffers)
          .filter(([name, meta]) => name.startsWith('engine_') && Number(meta.rpm))
          .sort((a, b) => Number(a[1].rpm) - Number(b[1].rpm))
          .map(([name, meta]) => {
            const gain = ctx.createGain(); gain.gain.value = .0001; gain.connect(engineBusGain);
            const source = startLoopSource(ctx, meta.buffer, gain, 1);
            return { name, rpm: Number(meta.rpm), gain, source };
          });
        if (buffers.turbo?.buffer) audio.turboSource = startLoopSource(ctx, buffers.turbo.buffer, turboFilter, .8);
        if (buffers.tyre?.buffer) audio.tyreSource = startLoopSource(ctx, buffers.tyre.buffer, tyreFilter, 1);
        if (!audio.synth && buffers.als_crackle?.buffer) audio.alsBedSource = startLoopSource(ctx, buffers.als_crackle.buffer, alsBedGain, 1);
        audio.ready = true; audio.loading = false;
        applySampledAudio(audio, audio.lastRpm, audio.lastLoad, audio.lastSlip, audio.lastExtras);
        return audio;
      }).catch(error => {
        audio.loading = false;
        audio.error = String(error?.message || error || 'sample bank decode failed');
        console.error('EA888 sampled audio:', audio.error);
        return audio;
      });
      try { ctx.resume(); } catch (e) {}
      return audio;
    } catch (e) {
      engineAudio = null;
      return null;
    }
  }

  function startEngineAudio(mode = 'engine') {
    try {
      const audio = ensureEngineAudio(mode);
      if (!audio) return;
      audio.active = true;
      audio.mode = mode;
      try {
        if (audio.ctx.state !== 'running') audio.ctx.resume();
        const t = audio.ctx.currentTime;
        audio.master.gain.cancelScheduledValues(t);
        audio.engineBusGain.gain.cancelScheduledValues(t);
        audio.engineBusGain.gain.setValueAtTime(1, t);
      } catch (e) {}
      applySampledAudio(audio, audio.lastRpm || 900, mode === 'race' ? .62 : .15, 0);
    } catch (e) { audioFault(e); }
  }

  // extras (optional, from the turbo runtime): shaftPct, boostBar, alsActive, alsIntensity, flameIntensity, popRateHz
  function updateEngineAudio(rpm, load = .5, wheelSlip = 0, extras = null) {
    if (!state.settings?.sound) return;
    try {
      const audio = ensureEngineAudio(engineAudio?.mode || 'engine');
      if (!audio) return;
      applySampledAudio(audio, rpm, load, wheelSlip, extras);
    } catch (e) { audioFault(e); }
  }
  // Sound must never stop the simulation or the UI: a failing audio update is logged; after repeated
  // failures the synthesized voice is dropped for this session and the sample voice takes over.
  let audioFaults = 0, synthBroken = false;
  function audioFault(e) {
    logAppError('audio', e);
    if (audioBrokenForTest) return; // injected test failures say nothing about the synthesized voice
    if (++audioFaults >= 3 && engineAudio?.synth) { synthBroken = true; audioFaults = 0; try { stopEngineAudio({ hard: true }); } catch (err) {} }
  }

  function engineShiftPop(intensity = .6, shiftType = 'auto') {
    try {
      if (!state.settings?.sound) return;
      const audio = ensureEngineAudio('race');
      if (!audio) return;
      const dsg = shiftType === 'dsg' || (shiftType === 'auto' && isDsgTransmission());
      const t = audio.ctx.currentTime;
      const fire = () => {
        if (!audio.ready) return;
        if (audio.synth) {
          // DSG: the ECU cuts the ignition of about every other event while the clutches hand over (the
          // "burp" is that unburnt charge going off in the exhaust). Manual shifts are the throttle lift and
          // cut the race runtime reports; only the blow-off valve is a sample.
          if (dsg) audio.synth.node.port.postMessage({ type: 'cut', kind: 'spark', fraction: .5, durationS: .085 });
          playSampleOneShot(audio, 'blowoff', .16 * clamp(intensity, .3, 1.2), .9 + audio.lastLoad * .16, dsg ? .035 : .018);
          return;
        }
        const name = dsg ? 'shift_dsg' : 'shift_manual';
        playSampleOneShot(audio, name, (dsg ? .48 : .40) * clamp(intensity, .2, 1.3), dsg ? .98 : 1.02);
        playSampleOneShot(audio, 'blowoff', .16 * clamp(intensity, .3, 1.2), .9 + audio.lastLoad * .16, dsg ? .035 : .018);
        audio.engineBusGain.gain.cancelScheduledValues(t);
        audio.engineBusGain.gain.setValueAtTime(Math.max(.28, audio.engineBusGain.gain.value), t);
        audio.engineBusGain.gain.setTargetAtTime(dsg ? .18 : .08, t + .006, .012);
        audio.engineBusGain.gain.setTargetAtTime(1, t + (dsg ? .115 : .17), .042);
      };
      if (audio.ready) fire(); else audio.readyPromise?.then(fire);
    } catch (e) { audioFault(e); }
  }

  function playLaunchCrackle(intensity = .7) {
    try {
      if (!state.settings?.sound) return;
      const audio = ensureEngineAudio('stage');
      // The synthesized voice makes the launch from the two-step cut itself; the sample is the fallback.
      const fire = () => { if (!audio?.synth) playSampleOneShot(audio, 'launch', .36 * clamp(intensity, .2, 1.2), .97 + intensity * .04); };
      if (audio?.ready) fire(); else audio?.readyPromise?.then(fire);
    } catch (e) { audioFault(e); }
  }

  function silenceAudioGraph(audio, immediate = false) {
    if (!audio?.ctx || audio.ctx.state === 'closed') return;
    const t = audio.ctx.currentTime;
    const mute = param => {
      if (!param) return;
      try {
        param.cancelScheduledValues(t);
        if (immediate) param.setValueAtTime(.0001, t);
        else param.setTargetAtTime(.0001, t, .012);
      } catch (e) {}
    };
    mute(audio.master?.gain);
    mute(audio.engineBusGain?.gain);
    mute(audio.turboGain?.gain);
    mute(audio.tyreGain?.gain);
    mute(audio.alsBedGain?.gain);
    mute(audio.rival?.gain?.gain);
    for (const layer of audio.layers || []) mute(layer.gain?.gain);
  }

  function stopTrackedOneShots(audio) {
    if (!audio?.oneShots) return;
    for (const source of Array.from(audio.oneShots)) {
      try { source.onended = null; source.stop(); source.disconnect(); } catch (e) {}
    }
    audio.oneShots.clear();
  }

  function stopEngineAudio(options = {}) {
    try {
      if (!engineAudio) return;
      const audio = engineAudio;
      audio.active = false;
      audio.mode = 'idle';
      audio.lastRpm = 900;
      audio.lastLoad = 0;
      audio.lastSlip = 0;
      silenceAudioGraph(audio, !!options.hard);
      stopTrackedOneShots(audio);
      if (!options.hard) return;

      // Detach the old context before stopping its sources. Generic taps after a
      // finish can therefore never wake the last race sound back up.
      if (engineAudio === audio) engineAudio = null;
      if (decodedAudioBankPromise?.ctx === audio.ctx) decodedAudioBankPromise = null;
      for (const v of [audio.synth, audio.rival]) {
        if (!v?.node) continue;
        try { v.node.port.postMessage({ type: 'stop' }); v.node.port.onmessage = null; v.node.disconnect(); } catch (e) {}
      }
      audio.synth = null; audio.rival = null;
      try {
        for (const layer of audio.layers || []) { layer.source.onended = null; layer.source.stop(); layer.source.disconnect(); }
        audio.turboSource?.stop(); audio.tyreSource?.stop(); audio.alsBedSource?.stop();
        audio.turboSource?.disconnect(); audio.tyreSource?.disconnect(); audio.alsBedSource?.disconnect();
      } catch (e) {}
      try { audio.ctx.close(); } catch (e) {}
    } catch (e) { logAppError('audio stop', e); if (options.hard) engineAudio = null; }
  }

  function currentAudioSceneMode() {
    if (dynoRunning) return 'dyno';
    if (burnoutRuntime?.active) return 'burnout';
    if (dragAnimation) return 'race';
    if (raceGame?.open) {
      if (raceGame.phase === 'burnout') return 'burnout';
      if (raceGame.phase === 'stage') return 'stage';
      if (raceGame.phase === 'run') return 'race';
    }
    return '';
  }

  function resumeAudioContextOnly() {
    if (!state.settings?.sound || !engineAudio?.ctx || engineAudio.ctx.state === 'closed') return;
    try { if (engineAudio.ctx.state !== 'running') engineAudio.ctx.resume(); } catch (e) {}
  }

  function resumePersistentAudio() {
    try {
      if (!state.settings?.sound || !engineAudio?.ctx) return;
      resumeAudioContextOnly();
      const mode = currentAudioSceneMode();
      if (!mode) {
        engineAudio.active = false;
        silenceAudioGraph(engineAudio, true);
        return;
      }
      try {
        engineAudio.active = true;
        engineAudio.mode = mode;
        applySampledAudio(engineAudio, engineAudio.lastRpm || 900, engineAudio.lastLoad || .12, engineAudio.lastSlip || 0);
      } catch (e) {}
    } catch (e) { audioFault(e); }
  }

  function audioDiagnostics() {
    return {
      exists: !!engineAudio,
      generation: engineAudio?.generation || 0,
      contextState: engineAudio?.ctx?.state || 'none',
      active: !!engineAudio?.active,
      ready: !!engineAudio?.ready,
      loading: !!engineAudio?.loading,
      sampleLayers: engineAudio?.layers?.length || 0,
      model: engineAudio?.model || 'none',
      error: engineAudio?.error || '',
      mode: engineAudio?.mode || 'none',
      oneShots: engineAudio?.oneShots?.size || 0,
      alsBed: !!engineAudio?.alsBedSource,
      alsBangs: engineAudio?.alsBangs || 0,
      masterGain: Number(engineAudio?.master?.gain?.value || 0),
      alsBedGain: Number(engineAudio?.alsBedGain?.gain?.value || 0),
      sceneMode: currentAudioSceneMode() || 'none',
      synth: !!engineAudio?.synth,
      synthStats: engineAudio?.synthStats || null,
      acoustic: engineAudio?.scene || 'none',
      reverbWet: Number(engineAudio?.wet?.gain?.value || 0),
      rival: !!engineAudio?.rival,
      rivalGain: Number(engineAudio?.rival?.gain?.gain?.value || 0),
      rivalPan: Number(engineAudio?.rival?.pan?.pan?.value || 0),
      mix: engineAudio?.mix ? Object.fromEntries(MIX_CHANNELS.map(n => [n, Number(engineAudio.mix[n].gain.value.toFixed(3))])) : null,
      lastRpm: Math.round(engineAudio?.lastRpm || 0)
    };
  }

  // Error log (last 20): shown in the self-test so a problem on the phone can be reported.
  const appErrors = [];
  function logAppError(where, e) {
    const msg = `${where}: ${e?.message || e}`;
    console.error('EA888', msg, e);
    appErrors.push({ at: new Date().toISOString(), msg: msg.slice(0, 240) });
    if (appErrors.length > 20) appErrors.shift();
  }
  window.addEventListener('error', ev => logAppError('script', ev.error || ev.message));
  window.addEventListener('unhandledrejection', ev => logAppError('promise', ev.reason));

  function currentDyno() { return C.isDynoCurrent(state); }
  // Only a current AND completed pull may be presented as the build's result.
  function currentCompletedDyno() { return currentDyno() && C.isCompletedDyno(state.lastDyno); }
  function dynoIsPartial(r) { return !!r && !C.isCompletedDyno(r); }
  // Measured value text: completed runs show the value, aborted runs the
  // highest value observed before the abort (labelled), otherwise '—'.
  function dynoMetricText(r, key, unit, decimals = 0) {
    const v = r ? r[key] : null;
    if (!Number.isFinite(v)) return '—';
    return `${Number(v).toFixed(decimals)}${unit}${dynoIsPartial(r) ? '*' : ''}`;
  }
  function dynoHeadline(r) {
    if (!r) return 'Nog geen meting';
    if (r.status === C.DYNO_STATUS.FAILED_TO_START) return 'Pull niet gestart';
    if (r.status === C.DYNO_STATUS.ABORTED) return `Pull afgebroken @ ${r.abortRpm} rpm`;
    return `${Math.round(r.peakHp)} pk · ${Math.round(r.peakTorqueNm)} Nm`;
  }
  function dynoScopeLabel(r) {
    if (!r) return '';
    if (r.status === C.DYNO_STATUS.FAILED_TO_START) return 'geen data';
    if (r.status === C.DYNO_STATUS.ABORTED) return `* partieel: waargenomen t/m ${r.abortRpm} rpm`;
    return `volledig ${r.startRpm}–${r.targetRpm} rpm`;
  }

  function statusInfo() {
    const r = state.lastDyno;
    if (!r) return { label: 'ONGEMETEN', detail: 'Voer een dynopull uit', cls: 'stale' };
    if (!currentDyno()) return { label: 'ONGETEST', detail: 'Hardware, tune of olie gewijzigd', cls: 'stale' };
    if (r.status === C.DYNO_STATUS.FAILED_TO_START) return { label: 'START MISLUKT', detail: r.abortReason, cls: 'danger' };
    if (r.failureRpm) return { label: 'SCHADE', detail: `Pull afgebroken @ ${r.failureRpm} rpm`, cls: 'danger' };
    if (!C.isCompletedDyno(r)) return { label: 'ONVOLLEDIG', detail: `Pull afgebroken @ ${r.abortRpm} rpm`, cls: 'stale' };
    if (r.reliabilityScore >= 82) return { label: 'STERKE MARGE', detail: `${Math.round(r.peakHp)} pk · ${Math.round(r.peakTorqueNm)} Nm`, cls: 'good' };
    if (r.reliabilityScore >= 65) return { label: 'BEWAAK MARGE', detail: `${Math.round(r.peakHp)} pk · score ${r.reliabilityScore}/100`, cls: 'warn' };
    return { label: 'RISICOVOL', detail: `${Math.round(r.peakHp)} pk · score ${r.reliabilityScore}/100`, cls: 'danger' };
  }

  // Toast with an optional action (e.g. { label: 'Ongedaan', run: fn }): stays longer when it carries one.
  function showToast(message, action = null) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = '';
    const text = document.createElement('span');
    text.textContent = message;
    node.append(text);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'toast-action'; btn.textContent = action.label;
      btn.addEventListener('click', ev => { ev.stopPropagation(); node.classList.remove('show'); action.run(); });
      node.append(btn);
    }
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), action ? 5200 : 2800);
  }

  function go(tab) {
    if (![...NAV.map(n => n[0]), 'data'].includes(tab)) return;
    if (raceGame?.open && tab !== 'drag') closeDragGame({ silent: true, noRender: true });
    if (dynoRunning && tab !== 'dyno') {
      showToast('De dynopull loopt nog. Wacht tot de run klaar is.');
      return;
    }
    if (activeTab === 'drag' && tab !== 'drag') {
      stopBurnout({ silent: true });
      clearTreeTimers(); treeSession = null;
      if (dragAnimation) cancelAnimationFrame(dragAnimation);
      dragAnimation = null; stopEngineAudio({ hard: true }); racePhase = 'burnout';
    }
    activeTab = tab;
    render();
    window.scrollTo({ top: 0, behavior: state.settings?.reducedMotion ? 'auto' : 'smooth' });
  }

  function renderHeader() {
    const status = statusInfo();
    const dataActive = activeTab === 'data';
    patchHtml($('#topbar'), `
      <div class="topbar-inner">
        <div class="brand-block">
          <div class="brand-line"><span class="brand-mark">EA888</span><span class="brand-lab">LAB</span><span class="version-tag">v${APP_VERSION}</span></div>
          <div class="build-line">${esc(state.buildName)}</div>
        </div>
        <div class="topbar-actions">
          <div class="status-pill ${status.cls}"><b>${esc(status.label)}</b><span>${esc(status.detail)}</span></div>
          <button class="icon-button ${dataActive ? 'active' : ''}" data-go="data" aria-label="Open build sheet en data">${icon('data')}</button>
        </div>
      </div>`);
  }

  function renderNav() {
    patchHtml($('#bottom-nav'), NAV.map(([id, ico, label]) => `
      <button class="nav-btn ${activeTab === id ? 'active' : ''}" data-nav="${id}" aria-label="${label}">
        <span class="nav-icon">${icon(ico)}</span><span>${label}</span>
      </button>`).join(''));
  }

  function render() {
    renderHeader();
    renderNav();
    const pages = {
      bank: renderBank, build: renderBuild, tune: renderTune, dyno: renderDyno,
      drag: renderDrag, service: renderService, data: renderData
    };
    patchHtml($('#content'), pages[activeTab]());
    requestAnimationFrame(afterRender);
  }

  function afterRender() {
    if (activeTab === 'tune' && tunePanel === 'als') drawAlsTestChart();
    if (activeTab === 'dyno') {
      const canvas = $('#dyno-chart');
      if (dynoRunning) drawDynoChart(canvas, dynoRunning.result, 0, false, dynoChannel, null);
      else if (state.lastDyno) drawDynoChart(canvas, state.lastDyno, 1, !currentDyno(), dynoChannel, compareRun());
    }
    if (activeTab === 'drag') {
      warmRaceCaches();
      updateWheelReadout();
      setRacePhase(racePhase);
      if (racePanel === 'tree') {
        if (racePhase === 'burnout') updateBurnoutDom();
        else updateRaceHud(raceLivePoint);
      } else if (racePanel === 'telemetry' && state.lastDrag) {
        drawDragTelemetry($('#v12-telemetry-canvas'), state.lastDrag);
      }
    }
  }

  function staleNotice() {
    if (!state.lastDyno) return `<div class="notice stale"><strong>Nog geen meting.</strong> Monteer onderdelen, stel de tune in en voer een volledige dynopull uit.</div>`;
    return `<div class="notice stale"><strong>Ongeteste wijzigingen.</strong> De oude curve blijft zichtbaar als referentie, maar nieuw vermogen en koppel worden pas na de dynopull onthuld.</div>`;
  }

  // Guided first build: the three steps of the core loop with real completion signals. Players who already
  // raced (saves from before this version) never see it.
  function onboarding() {
    const o = state.settings.onboarding;
    if (o && typeof o === 'object') return o;
    const veteran = (state.dragRuns?.length || 0) > 0;
    return (state.settings.onboarding = { built: veteran, measured: veteran, raced: veteran, dismissed: veteran });
  }
  function markOnboarding(step) {
    const o = onboarding();
    if (o[step]) return;
    o[step] = true;
    // A pull only counts once there is a build of your own; a race only after a measured build.
    if (step === 'measured' && !o.built) o[step] = false;
    if (step === 'raced' && !o.measured) o[step] = false;
  }
  function onboardingCard() {
    const o = onboarding();
    if (o.dismissed) return '';
    const steps = [
      { key: 'built', title: 'Kies je build', text: 'Laad een referentiebuild of monteer zelf onderdelen in Motor.', go: 'build', cta: 'Naar Motor' },
      { key: 'measured', title: 'Meet op de dyno', text: 'Een volledige pull onthult vermogen en koppel en geeft de strip vrij.', go: 'dyno', cta: 'Naar Dyno' },
      { key: 'raced', title: 'Rijd de quarter mile', text: 'Burnout, stagen, boom, schakelen: je timeslip komt uit dezelfde simulatie.', go: 'drag', cta: 'Naar Race' }
    ];
    const next = steps.findIndex(x => !o[x.key]);
    if (next < 0) {
      return `<div class="card coach-card done"><div><span class="eyebrow">Eerste build · klaar</span><h3>Je kent de hele loop</h3><p>Bouwen, meten, racen. Vanaf hier draait het om tunen: kijk in Tune, vergelijk pulls A/B op de dyno en verbeter je timeslip.</p></div><button class="btn secondary small" data-action="coach-dismiss">Sluiten</button></div>`;
    }
    return `<div class="card coach-card">
      <div class="coach-head"><div><span class="eyebrow">Je eerste build · stap ${next + 1} van 3</span><h3>${esc(steps[next].title)}</h3></div><button class="text-button" data-action="coach-dismiss">Overslaan</button></div>
      <ol class="coach-steps">${steps.map((x, i) => `<li class="${o[x.key] ? 'done' : i === next ? 'current' : ''}"><i aria-hidden="true">${o[x.key] ? '✓' : i + 1}</i><div><b>${esc(x.title)}</b>${i === next ? `<small>${esc(x.text)}</small>` : ''}</div></li>`).join('')}</ol>
      <button class="btn" data-go="${steps[next].go}">${esc(steps[next].cta)}</button>
    </div>`;
  }

  function workflow() {
    const buildDone = true;
    const dynoDone = currentCompletedDyno();
    const dragDone = !!state.lastDrag && dynoDone;
    return `<div class="workflow" aria-label="Spelvoortgang">
      <button data-go="build" class="workflow-step ${buildDone ? 'done' : ''}"><span>1</span><b>Bouw</b><small>Hardware</small></button>
      <i></i>
      <button data-go="dyno" class="workflow-step ${dynoDone ? 'done' : ''}"><span>2</span><b>Meet</b><small>Dyno</small></button>
      <i></i>
      <button data-go="drag" class="workflow-step ${dragDone ? 'done' : ''}"><span>3</span><b>Race</b><small>402 m</small></button>
    </div>`;
  }

  function engineViewTabs() {
    return `<div class="engine-view-tabs v5-engine-tabs" aria-label="Motorweergave">
      <button class="${engineView === 'realistic' ? 'active' : ''}" data-engine-view="realistic"><span>3D</span> Render</button>
      <button class="${engineView === 'intake' ? 'active' : ''}" data-engine-view="intake"><span>01</span> Inlaatzijde</button>
      <button class="${engineView === 'turbo' ? 'active' : ''}" data-engine-view="turbo"><span>02</span> Turbozijde</button>
      <button class="${engineView === 'cutaway' ? 'active' : ''}" data-engine-view="cutaway"><span>03</span> Intern</button>
    </div>`;
  }

  function engineDefs(uid) {
    return `<defs>
      <linearGradient id="${uid}alu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2e8ee"/><stop offset=".25" stop-color="#9ba7b4"/><stop offset=".65" stop-color="#586575"/><stop offset="1" stop-color="#202a36"/></linearGradient>
      <linearGradient id="${uid}block" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#687482"/><stop offset=".45" stop-color="#343e4b"/><stop offset="1" stop-color="#171f29"/></linearGradient>
      <linearGradient id="${uid}black" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#252d37"/><stop offset=".4" stop-color="#10151b"/><stop offset="1" stop-color="#05080c"/></linearGradient>
      <linearGradient id="${uid}hot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f09451"/><stop offset=".3" stop-color="#9a4527"/><stop offset=".72" stop-color="#522314"/><stop offset="1" stop-color="#21110d"/></linearGradient>
      <linearGradient id="${uid}cold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6dee7"/><stop offset=".42" stop-color="#8795a6"/><stop offset="1" stop-color="#3e4a58"/></linearGradient>
      <linearGradient id="${uid}blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#42c5ff"/><stop offset=".5" stop-color="#0a78d0"/><stop offset="1" stop-color="#063763"/></linearGradient>
      <linearGradient id="${uid}gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe16b"/><stop offset=".5" stop-color="#e49d18"/><stop offset="1" stop-color="#7a4707"/></linearGradient>
      <filter id="${uid}shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="15" stdDeviation="13" flood-color="#000" flood-opacity=".72"/></filter>
      <filter id="${uid}glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <pattern id="${uid}grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#56677b" stroke-opacity=".12" stroke-width="1"/></pattern>
    </defs>`;
  }

  function benchStandSvg() {
    return `<g class="v4-bench">
      <path d="M90 492H810M145 492l-28 53M755 492l28 53M210 492v48M690 492v48"/>
      <path d="M105 545h112M683 545h112"/>
      <circle cx="145" cy="545" r="19"/><circle cx="755" cy="545" r="19"/>
      <path class="bench-cross" d="M215 472H685M245 472l-34-46M655 472l34-46"/>
    </g>`;
  }

  function engineIntakeSvg(uid, running) {
    const turbo = C.getPart(state, 'turbo');
    const geometry = C.engineGeometry(state);
    const head = C.getPart(state, 'head');
    const coils = [0,1,2,3].map(i => `<g class="v4-coil" transform="translate(${315 + i * 78} 88)"><rect x="0" y="0" width="44" height="72" rx="10"/><path d="M22 72v19"/><circle cx="22" cy="17" r="8"/></g>`).join('');
    const runners = [0,1,2,3].map(i => `<path class="v4-intake-runner" d="M${314 + i*74} 292c-4 46-20 75-49 104"/>`).join('');
    const railDrops = [0,1,2,3].map(i => `<path d="M${337 + i*78} 206v35"/>`).join('');
    return `<svg viewBox="0 0 900 580" role="img" aria-label="EA888 Gen 1 CAWB vanaf de inlaatzijde op een motortestbank">
      ${engineDefs(uid)}
      <rect width="900" height="580" fill="url(#${uid}grid)"/>
      <g class="v4-engine ${running ? 'is-running' : ''}" filter="url(#${uid}shadow)">
        <path class="v4-sump" d="M264 405h376l-38 76H296z"/>
        <path class="v4-block" fill="url(#${uid}block)" d="M246 248h404v176c0 24-18 42-42 42H287c-24 0-41-17-41-42z"/>
        <g class="v4-block-ribs">${[0,1,2,3,4,5,6].map(i=>`<path d="M${286+i*48} 275v135"/>`).join('')}</g>
        <path class="v4-head" fill="url(#${uid}alu)" d="M232 168h438c19 0 34 15 34 34v91H216v-91c0-19 8-34 16-34z"/>
        <path class="v4-valve-cover" fill="url(#${uid}black)" d="M263 64h357c25 0 43 17 43 42v82H244v-82c0-24 12-42 19-42z"/>
        <path class="v4-cover-ridge" d="M286 96h303M286 125h203M537 125h66M286 151h127"/>
        <text x="288" y="180" class="v4-cover-text">2.0 TFSI · EA888 GEN 1</text>
        <circle class="v4-oil-cap" cx="596" cy="98" r="22"/><path class="v4-oil-cap-mark" d="M585 100h22M589 92h14"/>
        <g class="v4-coils">${coils}</g>

        <g class="v4-hpfp">
          <circle cx="235" cy="166" r="35" fill="url(#${uid}alu)"/><circle cx="235" cy="166" r="13"/>
          <path d="M235 131v-27h24M210 166h-29M258 166h31M222 191l-12 24"/>
        </g>
        <g class="v4-fuel-rail"><rect x="276" y="198" width="330" height="18" rx="9" fill="url(#${uid}alu)"/>${railDrops}<circle cx="622" cy="207" r="16"/></g>

        <g class="v4-intake">
          <path class="v4-plenum" fill="url(#${uid}black)" d="M260 272h337c33 0 58 24 58 56v42H239v-42c0-32 9-56 21-56z"/>
          ${runners}
          <rect class="v4-throttle" x="651" y="291" width="78" height="69" rx="25" fill="url(#${uid}alu)"/>
          <circle cx="690" cy="325" r="24"/>
          <path class="v4-charge" d="M729 326c58 1 87-18 119-51" stroke="url(#${uid}blue)"/>
          <path class="v4-charge-highlight" d="M729 318c55 0 83-18 113-48"/>
        </g>

        <g class="v4-timing-cover">
          <path fill="url(#${uid}alu)" d="M170 174h92v268h-72c-29 0-45-26-39-53l31-175z"/>
          <circle class="v4-pulley crank-pulley" cx="203" cy="407" r="50"/><circle cx="203" cy="407" r="16"/>
          <circle class="v4-pulley cam-pulley" cx="217" cy="221" r="31"/>
          <path class="v4-belt" d="M217 190c-46 62-47 162-14 167 47 7 68-82 14-136"/>
        </g>
        <g class="v4-alternator"><circle cx="178" cy="322" r="42"/><circle cx="178" cy="322" r="20"/><path d="M145 299l66 45M145 344l65-47"/></g>
        <g class="v4-oil-module"><rect x="564" y="359" width="54" height="82" rx="20"/><path d="M572 373h38M572 387h38"/><path d="M618 377h33v22h-31"/></g>
        <g class="v4-coolant"><path d="M657 215h94v42h58"/><circle cx="662" cy="215" r="13"/><circle cx="811" cy="258" r="11"/></g>
        <g class="v4-wiring"><path d="M264 49c-57 7-79 32-86 76M663 83c72 2 102 30 109 77"/><circle cx="177" cy="130" r="8"/><circle cx="773" cy="164" r="8"/></g>
      </g>
      ${benchStandSvg()}
      <g class="v4-view-caption"><text x="34" y="42">INLAATZIJDE / FRONT</text><text x="34" y="61">CAWB transverse layout · ${Math.round(geometry.displacementCc)} cc · ${esc(head.name)}</text></g>
      <g class="v4-badge"><rect x="714" y="25" width="151" height="44" rx="13"/><text x="790" y="43">TURBO</text><text x="790" y="59">${esc(turbo.compressorMm || 'OEM')} MM</text></g>
    </svg>`;
  }

  function engineTurboSvg(uid, running) {
    const turbo = C.getPart(state, 'turbo');
    const boost = C.getPart(state, 'boostControl');
    const mm = Number(turbo.compressorMm || 45);
    const big = mm >= 67;
    const huge = mm >= 94;
    const r = clamp(54 + (mm - 45) * .62, 53, 104);
    const cx = huge ? 705 : big ? 682 : 650;
    const cy = big ? 316 : 300;
    const runners = big
      ? [0,1,2,3].map(i => `<path d="M${302+i*85} 241c${i<2?10:-8} 72 ${i<2?55:35} 82 ${cx-90} ${cy-18+i*7}"/>`).join('')
      : [0,1,2,3].map(i => `<path d="M${304+i*84} 242c6 42 28 58 ${cx-76} ${cy-20+i*5}"/>`).join('');
    const wg = boost.id.includes('dual') || boost.id.includes('co2') || big;
    return `<svg viewBox="0 0 900 580" role="img" aria-label="EA888 Gen 1 CAWB vanaf de turbozijde op een motortestbank">
      ${engineDefs(uid)}<rect width="900" height="580" fill="url(#${uid}grid)"/>
      <g class="v4-engine turbo-view ${running ? 'is-running' : ''}" filter="url(#${uid}shadow)">
        <path class="v4-sump" d="M246 410h390l-36 70H282z"/>
        <path class="v4-block" fill="url(#${uid}block)" d="M229 254h413v175c0 25-18 41-43 41H271c-24 0-42-17-42-41z"/>
        <g class="v4-block-ribs">${[0,1,2,3,4,5,6].map(i=>`<path d="M${270+i*48} 280v132"/>`).join('')}</g>
        <path class="v4-head" fill="url(#${uid}alu)" d="M217 165h442c22 0 38 16 38 37v69H205v-69c0-21 8-37 12-37z"/>
        <path class="v4-valve-cover" fill="url(#${uid}black)" d="M258 66h354c28 0 46 18 46 45v75H239v-75c0-26 12-45 19-45z"/>
        <path class="v4-cover-ridge" d="M283 99h302M283 129h179M512 129h78M283 155h131"/>
        <text x="284" y="177" class="v4-cover-text">EA888 · CAWB · EXHAUST SIDE</text>
        <circle class="v4-oil-cap" cx="588" cy="101" r="22"/><path class="v4-oil-cap-mark" d="M578 102h20M582 94h12"/>
        <g class="v4-exhaust-runners ${big ? 'tubular' : 'cast'}" fill="none">${runners}</g>
        <g class="v4-turbo-assembly ${huge ? 'huge' : big ? 'big' : 'compact'}">
          <circle class="v4-turbine" fill="url(#${uid}hot)" cx="${cx-r*.28}" cy="${cy}" r="${r}"/>
          <path class="v4-turbine-scroll" d="M${cx-r*.28} ${cy-r+14}c${r*.9} 2 ${r*1.08} ${r*.72} ${r*.66} ${r*1.17}-${r*.35} ${r*.38}-${r*.96} ${r*.18}-${r*.98}-${r*.36}"/>
          <circle class="v4-compressor" fill="url(#${uid}cold)" cx="${cx+r*.44}" cy="${cy-2}" r="${r*.72}"/>
          <circle class="v4-compressor-eye" cx="${cx+r*.44}" cy="${cy-2}" r="${r*.31}"/>
          <g class="v4-compressor-wheel" transform="translate(${cx+r*.44} ${cy-2})">${[0,60,120,180,240,300].map(a=>`<path transform="rotate(${a})" d="M0 0c10-27 30-25 40-13-18 1-27 8-40 13z"/>`).join('')}</g>
          <path class="v4-downpipe" d="M${cx-r*.9} ${cy+r*.38}c-48 42-43 91-16 130"/>
          <path class="v4-compressor-out" d="M${cx+r*.5} ${cy-r*.72}c57-32 116-7 131 46v61" stroke="url(#${uid}blue)"/>
          <path class="v4-charge-highlight" d="M${cx+r*.52} ${cy-r*.63}c51-26 103-4 116 43"/>
        </g>
        ${wg ? `<g class="v4-external-wg"><g transform="translate(${cx-r*.86} ${cy+100})"><circle r="23"/><path d="M0-23v-32M-13 19l-21 45"/></g><g transform="translate(${cx-r*.34} ${cy+119})"><circle r="23"/><path d="M0-23v-42M13 19l19 48"/></g></g>` : `<g class="v4-internal-wg"><rect x="${cx+15}" y="${cy+61}" width="86" height="25" rx="13"/><path d="M${cx+16} ${cy+73}l-48-23"/></g>`}
        <g class="v4-timing-cover rear"><path fill="url(#${uid}alu)" d="M156 180h85v258h-66c-27 0-43-24-37-50l27-168z"/><circle class="v4-pulley crank-pulley" cx="188" cy="405" r="48"/><circle cx="188" cy="405" r="15"/></g>
        <g class="v4-sensors"><circle cx="442" cy="271" r="10"/><path d="M442 261v-35M463 268h31"/><circle cx="504" cy="269" r="8"/></g>
      </g>
      ${benchStandSvg()}
      <g class="v4-view-caption"><text x="34" y="42">TURBOZIJDE / REAR</text><text x="34" y="61">${esc(turbo.name)} · ${esc(boost.name)} · ${big ? 'tubular/twin-scroll layout' : 'compact K04-frame layout'}</text></g>
      <g class="v4-badge"><rect x="714" y="25" width="151" height="44" rx="13"/><text x="790" y="43">COMPRESSOR</text><text x="790" y="59">${mm || 'OEM'} MM</text></g>
    </svg>`;
  }

  function engineCutawaySvg(uid, running) {
    const g = C.engineGeometry(state);
    const block = C.getPart(state, 'block');
    const crank = C.getPart(state, 'crank');
    const valve = C.getPart(state, 'valvetrain');
    const x = [285, 405, 525, 645];
    const pistonY = [304, 352, 352, 304];
    return `<svg viewBox="0 0 900 580" role="img" aria-label="Technische doorsnede van de EA888 Gen 1 met vier cilinders, zuigers en krukas">
      ${engineDefs(uid)}<rect width="900" height="580" fill="url(#${uid}grid)"/>
      <g class="v4-cutaway ${running ? 'is-running' : ''}" filter="url(#${uid}shadow)">
        <path class="v4-cut-head" d="M218 99h500v151H218z"/>
        <path class="v4-cut-block" d="M218 239h500v236H218z"/>
        <path class="v4-cut-sump" d="M246 474h445l-37 70H280z"/>
        <g class="v4-cams"><path d="M251 142h431"/><path d="M251 184h431"/>${x.map((cx,i)=>`<ellipse cx="${cx-18}" cy="142" rx="24" ry="13" transform="rotate(${i%2?28:-28} ${cx-18} 142)"/><ellipse cx="${cx+18}" cy="184" rx="24" ry="13" transform="rotate(${i%2?-28:28} ${cx+18} 184)"/>`).join('')}</g>
        <g class="v4-valves">${x.map(cx=>`<path d="M${cx-24} 160l-10 87M${cx+24} 200l10 47"/><path class="valve-head" d="M${cx-45} 247h23M${cx+22} 247h23"/>`).join('')}</g>
        <g class="v4-bores">${x.map(cx=>`<rect x="${cx-44}" y="247" width="88" height="177" rx="7"/><path d="M${cx-40} 261h80"/>`).join('')}</g>
        <g class="v4-pistons">${x.map((cx,i)=>`<g class="piston piston-${i+1}" style="--base-y:${pistonY[i]}px" transform="translate(0 ${pistonY[i]-304})"><path class="piston-crown" d="M${cx-38} 304h76v50h-76z"/><path class="ring ring-1" d="M${cx-37} 314h74"/><path class="ring ring-2" d="M${cx-37} 324h74"/><circle cx="${cx}" cy="343" r="9"/><path class="rod" d="M${cx} 352l${i%2?24:-24} 104"/></g>`).join('')}</g>
        <g class="v4-crank"><path class="crank-axis" d="M238 456h461"/>${x.map((cx,i)=>`<circle cx="${cx+(i%2?24:-24)}" cy="456" r="19"/><path d="M${cx+(i%2?24:-24)} 456h${i%2?-24:24}"/>`).join('')}<circle class="crank-end" cx="223" cy="456" r="38"/><circle class="crank-end" cx="716" cy="456" r="38"/></g>
        <g class="v4-oil-galleries"><path d="M246 432h444M260 432v-126M675 432V306"/>${x.map(cx=>`<path d="M${cx} 432v24"/>`).join('')}</g>
        <g class="v4-combustion">${x.map(cx=>`<path d="M${cx-43} 247l18-23h50l18 23"/>`).join('')}</g>
        <g class="v4-spark">${x.map(cx=>`<path d="M${cx} 102v117"/><path class="spark-flash" d="M${cx} 220l-8 11 13 1-7 12"/>`).join('')}</g>
      </g>
      <g class="v4-view-caption"><text x="34" y="42">INTERN / CUTAWAY</text><text x="34" y="61">${esc(block.name)} · ${esc(crank.name)} · ${esc(valve.name)}</text></g>
      <g class="v4-badge"><rect x="714" y="25" width="151" height="44" rx="13"/><text x="790" y="43">BORE × STROKE</text><text x="790" y="59">${g.boreMm.toFixed(2)} × ${g.strokeMm.toFixed(1)}</text></g>
    </svg>`;
  }

  function engineRealisticMarkup(running) {
    const geometry = C.engineGeometry(state);
    const turbo = C.getPart(state, 'turbo');
    const r = state.lastDyno;
    const clean = currentDyno();
    const hp = clean && r ? dynoMetricText(r, 'peakHp', ' pk') : '? pk';
    const nm = clean && r ? dynoMetricText(r, 'peakTorqueNm', ' Nm') : '? Nm';
    return `<div class="realistic-engine-scene ${running ? 'is-running' : ''}">
      <img class="realistic-engine-image" src="images/engine-realistic.webp" alt="Realistische 3D-render van de opgebouwde EA888 Gen 1 op een motortestbank">
      <div class="realistic-engine-vignette"></div>
      <div class="realistic-engine-title">
        <strong>EA888 GEN 1 · CAWB</strong>
        <span>${Math.round(geometry.displacementCc)} cc · ${geometry.boreMm.toFixed(2)} × ${geometry.strokeMm.toFixed(1)} · ${geometry.compressionRatio.toFixed(1)}:1</span>
      </div>
      <div class="realistic-turbo-card">
        <span class="mini-turbo-icon">◉</span>
        <div><strong>${esc(turbo.name)}</strong><small>${turbo.compressorMm || 'OEM'} mm compressor · ${!clean ? 'ongetest' : dynoIsPartial(r) ? 'pull onvolledig' : 'gemeten'}</small></div>
      </div>
      <div class="realistic-dyno-readout">
        <span><i>PK</i><b>${hp}</b></span>
        <span><i>NM</i><b>${nm}</b></span>
      </div>
      <div class="realistic-live-glow" aria-hidden="true"></div>
    </div>`;
  }

  function engineVisual(options = {}) {
    const uid = `eng${++engineVisualId}`;
    const geometry = C.engineGeometry(state);
    const turbo = C.getPart(state, 'turbo');
    const head = C.getPart(state, 'head');
    const view = options.view || engineView;
    const running = !!options.running;
    const compact = options.compact ? 'compact' : '';
    const mode = options.mode || 'bench';
    const visual = view === 'realistic' ? engineRealisticMarkup(running) : view === 'turbo' ? engineTurboSvg(uid, running) : view === 'cutaway' ? engineCutawaySvg(uid, running) : engineIntakeSvg(uid, running);
    const viewLabel = view === 'realistic' ? '3D GARAGE RENDER' : view === 'intake' ? 'INLAATZIJDE' : view === 'turbo' ? 'TURBOZIJDE' : 'DOORSNEDE';
    return `<div class="engine-visual v4-engine-visual v5-engine-visual ${running ? 'running' : ''} ${compact} mode-${mode} view-${view}" data-engine-visual data-view="${view}">
      <div class="engine-canvas v4-engine-canvas">${visual}
        <button class="engine-hotspot hotspot-head" data-engine-info="head" aria-label="Kop en nokken"><span>KOP / CAMS</span></button>
        <button class="engine-hotspot hotspot-block" data-engine-info="block" aria-label="Onderblok en krukas"><span>JE83 / KRUKAS</span></button>
        <button class="engine-hotspot hotspot-fuel" data-engine-info="fuel" aria-label="Brandstofsysteem"><span>DI / HPFP</span></button>
        <button class="engine-hotspot hotspot-turbo" data-engine-info="turbo" aria-label="Turbo en luchtpad"><span>${esc(turbo.compressorMm || 'OEM')} MM TURBO</span></button>
        <button class="engine-hotspot hotspot-ecu" data-engine-info="ecu" aria-label="ECU en beveiliging"><span>SYVECS / DATA</span></button>
      </div>
      <div class="engine-specbar">
        <span><b>${num(geometry.displacementCc, 0)} cc</b>${num(geometry.boreMm, 2)} × ${num(geometry.strokeMm, 1)} mm</span>
        <span><b>${num(geometry.compressionRatio, 1)}:1</b>compressie</span>
        <span><b>${esc(viewLabel)}</b>${esc(head.name)}</span>
      </div>
    </div>`;
  }

  function componentTile(catId, title, subtitle) {
    const part = C.getPart(state, catId);
    return `<button class="v5-component-tile" data-open-category="${catId}" aria-label="Open ${esc(title)}">
      <span class="v5-component-image"><img src="images/${partVisual(catId)}" alt=""></span>
      <span class="v5-component-copy"><b>${esc(title)}</b><small>${esc(subtitle || part.name)}</small></span>
      <span class="v5-component-arrow">›</span>
    </button>`;
  }

  function renderBank() {
    const earned = syncAchievements();
    const r = state.lastDyno;
    const clean = currentDyno();
    const geometry = C.engineGeometry(state);
    const turbo = C.getPart(state, 'turbo');
    const trans = C.getPart(state, 'transmission');
    const tire = C.TIRE_MAP[state.vehicle.tireCompound];
    const status = statusInfo();
    const bench = C.benchConfidence(state);
    const best = state.records?.[state.vehicle.drivetrain] || null;
    const unlocked = Object.values(state.achievements || {}).filter(Boolean).length;
    const oil = C.OIL_MAP[state.service.oilId];
    const oilPct = Math.round(C.oilHealth(state) * 100);
    const score = clean && r && Number.isFinite(r.reliabilityScore) ? r.reliabilityScore : null;
    const lastPass = clean && state.lastDrag?.valid ? state.lastDrag : null;
    const measuredHp = clean && r ? dynoMetricText(r, 'peakHp', ' pk') : '? pk';
    const measuredNm = clean && r ? dynoMetricText(r, 'peakTorqueNm', ' Nm') : '? Nm';
    const completed = clean && C.isCompletedDyno(r);

    return `<section class="page garage-page v5-garage-page">
      <div class="v5-garage-heading">
        <div><span class="eyebrow">BOUW · MEET · OVERLEEF · RACE</span><h1>EA888 Lab</h1><p>Een complete virtuele CAWB-workshop. Monteer onderdelen, controleer de motor, meet op de dyno en zet daarna pas een geldige quarter-mile neer.</p></div>
        <div class="v5-wallet"><span>WORKSHOP</span><b>${euro(state.bank)}</b></div>
      </div>
      ${onboardingCard()}

      <div class="v5-engine-dashboard">
        <div class="v5-engine-dashboard-head">
          <div><span>EA888 GEN 1 · RANDY CAWB</span><b>${Math.round(geometry.displacementCc)} cc · ${geometry.boreMm.toFixed(2)} × ${geometry.strokeMm.toFixed(1)}</b></div>
          <button class="v5-turbo-summary" data-open-category="turbo"><span>◉</span><div><b>${esc(turbo.name)}</b><small>${turbo.compressorMm || 'OEM'} mm · ${completed ? `${Math.round(r.peakHp)} pk gemeten` : clean ? 'pull onvolledig' : 'resultaat verborgen'}</small></div>${icon('chevron')}</button>
        </div>
        ${engineVisual({ mode: 'garage', view: engineView })}
      </div>

      ${engineViewTabs()}

      <div class="v5-component-dock" aria-label="Hoofdonderdelen">
        ${componentTile('block', 'Zuigers & drijfstangen', C.getPart(state,'block').name)}
        ${componentTile('head', 'Nokkenassen & kleppen', C.getPart(state,'head').name)}
        ${componentTile('turbo', 'Turbo', C.getPart(state,'turbo').name)}
        ${componentTile('air', 'Intercooler & inlaat', C.getPart(state,'air').name)}
        ${componentTile('fuelSystem', 'Brandstof', C.getPart(state,'fuelSystem').name)}
        ${componentTile('transmission', 'Transmissie & koppeling', C.getPart(state,'transmission').name)}
      </div>

      <div class="v5-status-grid">
        <button class="v5-status-card ${completed ? 'good' : clean ? 'danger' : 'stale'}" data-go="dyno">
          <span class="v5-status-icon">${icon('engine')}</span><div><small>BUILD STATUS</small><b>${completed ? 'GEMETEN BUILD' : clean ? 'PULL ONVOLLEDIG' : 'ONGETESTE BUILD'}</b><p>${completed ? `${measuredHp} · ${measuredNm}` : clean ? `${esc(dynoHeadline(r))} · ${esc(r.abortReason || '')}` : 'Vermogen verborgen tot een nieuwe dynorun.'}</p></div>${icon('chevron')}
        </button>
        <button class="v5-status-card ${score == null ? 'stale' : score >= 80 ? 'good' : score >= 65 ? 'warn' : 'danger'}" data-go="dyno">
          <span class="v5-status-icon">◇</span><div><small>BETROUWBAARHEID</small><b>${score == null ? '— / 100' : `${score} / 100`}</b><div class="v5-meter"><i style="--v:${score == null ? 0 : score}%"></i></div><p>${score == null ? (clean && r ? 'Geen score: de pull is niet voltooid.' : 'Pas zichtbaar na de meting.') : esc(r.bottleneck || '')}</p></div>${icon('chevron')}
        </button>
        <button class="v5-status-card ${oilPct >= 80 ? 'good' : oilPct >= 65 ? 'warn' : 'danger'}" data-go="service">
          <span class="v5-status-icon">${icon('service')}</span><div><small>OLIE & SERVICE</small><b>${oilPct >= 80 ? 'GOED' : oilPct >= 65 ? 'CONTROLEREN' : 'VERVANGEN'}</b><p>${esc(oil.name)} · ${state.service.liters.toFixed(1)} L · ${oilPct}% conditie</p></div>${icon('chevron')}
        </button>
        <button class="v5-status-card" data-go="drag">
          <span class="v5-status-icon">◎</span><div><small>TRACTIE</small><b>${esc(state.vehicle.drivetrain)} · ${esc(tire.name)}</b><p>${lastPass ? `${Math.round(lastPass.wheelspinPct)}% wheelspin gemeten` : `${state.vehicle.tireWidthMm}/${state.vehicle.aspectRatio} R${state.vehicle.rimDiameterIn} · nog geen geldige pass`}</p></div>${icon('chevron')}
        </button>
      </div>

      <div class="v5-car-card">
        <div class="v5-car-card-bg"></div>
        <div class="v5-car-copy">
          <span>JOUW AUTO</span><h2>Randy's Scirocco CAWB</h2><b>${measuredHp} · ${measuredNm}</b><p>${esc(state.vehicle.drivetrain)} · ${trans.name} · ${tire.name}</p>
          <button class="btn secondary" data-go="drag">Naar de dragstrip ${icon('chevron')}</button>
        </div>
        <img src="images/randy-scirocco-cutout.png" alt="Randy's blauwe Scirocco">
        <div class="v5-tree-mini" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i class="green"></i><i class="green"></i></div>
        <div class="v5-car-times"><span><small>0–100</small><b>${lastPass?.zeroTo100 ? `${lastPass.zeroTo100.toFixed(2)} s` : '—'}</b></span><span><small>1/4 MIJL</small><b>${lastPass ? `${lastPass.quarter.toFixed(3)} s` : best ? `${best.quarter.toFixed(3)} s` : '—'}</b></span></div>
      </div>

      ${workflow()}
      ${clean ? '' : staleNotice()}

      <div class="v5-main-actions">
        <button data-go="build"><span>${icon('engine')}</span><b>Onderdelen</b><small>Monteer echte combinaties</small></button>
        <button data-go="tune"><span>${icon('tune')}</span><b>Tune</b><small>Boost, brandstof en cams</small></button>
        <button data-go="dyno"><span>${icon('chart')}</span><b>Dyno</b><small>Meet de volledige curve</small></button>
        <button data-go="drag"><span>${icon('race')}</span><b>Race</b><small>Tree, setup en timeslip</small></button>
      </div>

      <div class="section-head"><div><span class="eyebrow">Build slots</span><h2>Drie projecten naast elkaar</h2></div></div>
      <div class="build-slots">${[0,1,2].map(i => buildSlotCard(i, state.buildSlots?.[i])).join('')}</div>

      <div class="section-head"><div><span class="eyebrow">Challenges</span><h2>${unlocked}/${C.CHALLENGES.length} ontgrendeld</h2></div></div>
      <div class="challenge-grid">${C.CHALLENGES.slice(0, showAllChallenges ? 6 : 3).map(ch => challengeCard(ch, earned[ch.id])).join('')}</div>
      <button class="btn ghost small show-more" data-action="toggle-challenges">${showAllChallenges ? 'Minder tonen' : `Alle ${Math.min(6, C.CHALLENGES.length)} challenges`}</button>

      <div class="section-head presets-head"><div><span class="eyebrow">Referentiebuilds</span><h2>Van OEM tot Unlimited</h2></div></div>
      <div class="preset-strip v4-preset-strip">
        ${presetCard('stock', 'OEM CAWB', 'Straatbasis', 'K03 · OEM internals')}
        ${presetCard('k04', 'K04 straat', 'Snelle respons', 'Rods · FMIC · 3-inch')}
        ${presetCard('randy', 'Randy exact', 'Jouw motorbasis', 'JE83 · Cat Cams · Syvecs', true)}
        ${presetCard('hx52', 'Randy HX52', '67-mm twin-scroll', '11 cm² · dual 44 mm WG')}
        ${presetCard('pro98', 'Precision 9803', 'Pro Mod drag', 'Dry-sump · methanol · 1.4k+')}
        ${presetCard('outlaw106', 'Precision 10603', 'Outlaw · smalle band', 'Promod support · staged spool')}
        ${presetCard('unlimited', 'PT10603 Unlimited', 'Extreme workbench', 'Full Promod support · 2k+')}
      </div>

      <div class="card build-summary-card">
        <div class="section-head small"><div><span class="eyebrow">Huidige setup</span><h3>Build sheet in één oogopslag</h3></div><button class="icon-button small" data-go="data" aria-label="Open alle data">${icon('data')}</button></div>
        <div class="summary-list">
          <div><span>Turbo</span><b>${esc(turbo.name)}</b></div>
          <div><span>Kop/nokken</span><b>${esc(C.getPart(state, 'head').name)}</b></div>
          <div><span>Brandstof</span><b>${esc(C.getPart(state, 'fuelSystem').name)}</b></div>
          <div><span>Olie</span><b>${esc(oil.name)} · ${num(state.service.liters,1)} L</b></div>
          <div><span>Onderdelenwaarde</span><b>${euro(C.totalPartsPrice(state))}</b></div>
          <div><span>Sensor confidence</span><b>${Math.round(C.getPart(state,'sensors').diagnosticConfidence*100)}%</b></div>
        </div>
      </div>
    </section>`;
  }

  function buildSlotCard(index, slot) {
    if (!slot) return `<article class="build-slot empty"><span>0${index + 1}</span><div><b>Leeg buildslot</b><small>Sla de huidige hardware, tune, montage en voertuigsetup op.</small></div><button class="btn small" data-save-slot="${index}">Opslaan</button></article>`;
    const turboId = slot.selections?.turbo;
    const turbo = C.CATEGORY_MAP.turbo.items.find(x => x.id === turboId);
    return `<article class="build-slot"><span>0${index + 1}</span><div><b>${esc(slot.buildName || `Build ${index + 1}`)}</b><small>${esc(turbo?.name || turboId || 'Onbekende turbo')} · ${new Date(slot.savedAt).toLocaleDateString('nl-NL')}</small></div><div class="slot-actions"><button class="btn ghost small" data-load-slot="${index}">Laden</button><button class="text-button" data-save-slot="${index}">Overschrijf</button></div></article>`;
  }

  function challengeCard(challenge, earnedNow) {
    const progress = state.achievements?.[challenge.id];
    const unlocked = !!progress || !!earnedNow;
    const claimed = !!progress?.claimed;
    return `<article class="challenge-card ${unlocked ? 'unlocked' : ''} ${claimed ? 'claimed' : ''}">
      <div class="challenge-icon">${unlocked ? icon('check') : '◈'}</div>
      <div><b>${esc(challenge.title)}</b><p>${esc(challenge.detail)}</p><small>Beloning ${euro(challenge.reward)}</small></div>
      ${unlocked && !claimed ? `<button class="btn small" data-claim-challenge="${challenge.id}">Claim</button>` : `<span class="challenge-state">${claimed ? 'GECLAIMD' : 'LOCKED'}</span>`}
    </article>`;
  }

  function presetCard(id, title, subtitle, detail, highlighted = false) {
    return `<article class="preset-card ${highlighted ? 'highlighted' : ''}">
      ${highlighted ? '<span class="randy-badge">RANDY SPEC</span>' : ''}
      <h3>${esc(title)}</h3><b>${esc(subtitle)}</b><p>${esc(detail)}</p>
      <button class="btn small" data-preset="${id}">Build laden</button>
    </article>`;
  }

  function isRandyPart(part) {
    return /^randy_/.test(part.id) || ['k04_hybrid', 'hx52'].includes(part.id);
  }

  function renderBuild() {
    const cat = C.CATEGORY_MAP[activeCategory] || C.CATEGORIES[0];
    const geometry = C.engineGeometry(state);
    const assembly = C.assemblyHealth(state);
    const bench = C.benchConfidence(state);
    let panel = '';
    if (motorPanel === 'assembly') panel = renderAssemblyPanel(assembly);
    else if (motorPanel === 'bench') panel = renderBenchPanel(bench);
    else panel = renderHardwarePanel(cat);

    return `<section class="page motor-page">
      <div class="page-title-row"><div><span class="eyebrow">Motor workbench</span><h1>Bouw hem zoals een echte motor</h1><p>Hardware, montageclearances en controles zijn afzonderlijke stappen. Vermogen blijft verborgen totdat de combinatie een volledige dynopull heeft afgerond.</p></div></div>

      ${engineViewTabs()}
      ${engineVisual({ compact: true, mode: 'build', view: engineView })}

      <div class="motor-status-strip">
        <div><span>Configuratie</span><b>${geometry.boreMm.toFixed(2)} × ${geometry.strokeMm.toFixed(1)} mm</b></div>
        <div><span>Montage</span><b class="${assembly.score >= .9 ? 'green' : assembly.score >= .72 ? 'accent' : 'red'}">${Math.round(assembly.score * 100)}%</b></div>
        <div><span>Benchtests</span><b>${bench.current}/${bench.total}</b></div>
        <div><span>Dynostatus</span><b>${currentDyno() ? 'Geldig' : 'Ongetest'}</b></div>
      </div>

      <div class="segment-control motor-segments">
        <button class="${motorPanel === 'hardware' ? 'active' : ''}" data-motor-panel="hardware">Onderdelen</button>
        <button class="${motorPanel === 'assembly' ? 'active' : ''}" data-motor-panel="assembly">Montage</button>
        <button class="${motorPanel === 'bench' ? 'active' : ''}" data-motor-panel="bench">Benchtests</button>
      </div>
      ${panel}

      <div class="sticky-action-card">
        <div><span>Volgende stap</span><b>${bench.complete && bench.failed === 0 ? 'De montagechecks zijn actueel. Kalibreer of meet.' : 'Benchtests zijn niet compleet; je kunt wel meten, maar met minder zekerheid.'}</b></div>
        <button class="btn secondary" data-go="tune">Tune</button>
        <button class="btn" data-go="dyno">Dyno</button>
      </div>
    </section>`;
  }

  function renderHardwarePanel(cat) {
    const selected = state.selections[cat.id];
    const query = partSearch.trim().toLowerCase();
    const items = cat.items.filter(p => !query || `${p.name} ${p.detail} ${p.specs}`.toLowerCase().includes(query));
    return `<div class="motor-panel hardware-panel">
      <div class="build-toolbar">
        <label class="search-box"><span>⌕</span><input id="part-search" value="${esc(partSearch)}" placeholder="Zoek in ${esc(cat.label.toLowerCase())}" autocomplete="off"></label>
        <div class="category-chips">
          ${C.CATEGORIES.map(c => `<button class="category-chip ${c.id === cat.id ? 'active' : ''}" data-cat="${c.id}"><span>${esc(c.short)}</span>${state.selections[c.id] ? '<i></i>' : ''}</button>`).join('')}
        </div>
      </div>
      <div class="category-heading">
        <div><span class="eyebrow">${esc(cat.label)}</span><h2>${items.length} beschikbare opties</h2></div>
        <div class="selection-chip">Gemonteerd: <b>${esc(C.getPart(state, cat.id).name)}</b></div>
      </div>
      <div class="notice"><strong>Geen vermogenspreview.</strong> Alleen fysieke specificaties zijn zichtbaar. De interactie tussen onderdelen wordt pas gemeten op de dyno.</div>
      <div class="parts-grid">${items.length ? items.map(p => partCard(cat, p, selected === p.id)).join('') : '<div class="empty-card">Geen onderdelen gevonden. Wis de zoekopdracht.</div>'}</div>
    </div>`;
  }

  function assemblySlider(name, label, min, max, step, value, unit, decimals, target, hint) {
    const delta = Number(value) - Number(target);
    const match = Math.abs(delta) <= step * 2;
    return `<div class="control assembly-control ${match ? 'matched' : ''}">
      <div class="control-head"><div><b>${esc(label)}</b><small>${esc(hint || '')}</small></div><output class="value-edit" tabindex="0" role="button" aria-label="Waarde intypen" data-value-for="assembly.${name}">${Number(value).toFixed(decimals)}${esc(unit)}</output></div>
      <div class="range-row"><button type="button" class="step-btn" data-step="-1" aria-label="Lager">−</button><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-assembly="${name}" data-unit="${esc(unit)}" data-decimals="${decimals}"><button type="button" class="step-btn" data-step="1" aria-label="Hoger">+</button></div>
      <div class="target-marker"><span>Modeldoel ${Number(target).toFixed(decimals)}${esc(unit)}</span><i style="--target:${clamp((target-min)/(max-min)*100,0,100)}%"></i></div>
    </div>`;
  }

  function renderAssemblyPanel(health) {
    const a = state.assembly;
    const t = health.targets;
    const warnings = [];
    if (health.ringTightRisk > .3) warnings.push('Topring-gap is krap voor de huidige boost- en temperatuurvraag.');
    if (health.ringWideRisk > .35) warnings.push('Topring-gap is ruim; blow-by en afdichtingsverlies nemen toe.');
    if (health.bearingTightRisk > .3) warnings.push('Drijfstanglagerclearance is krap voor het gekozen toerental.');
    if (health.bearingLooseRisk > .3) warnings.push('Hoofdlagerclearance is ruim; warme oliedruk kan dalen.');
    if (!a.oilPrimed) warnings.push('Oliesysteem staat niet als geprimed gemarkeerd.');
    return `<div class="motor-panel assembly-panel">
      <div class="assembly-hero card">
        <div class="assembly-score" style="--score:${Math.round(health.score*100)}"><b>${Math.round(health.score*100)}</b><span>/100 montage</span></div>
        <div><span class="eyebrow">Montageblad</span><h2>Clearances en procedure</h2><p>Het doel verschuift met boring, toerental en maximale gevraagde boost. Een score is geen werkplaatsmaat; hij maakt de consequenties in het spel zichtbaar.</p></div>
      </div>
      <div class="assembly-grid">
        <div class="card">
          <span class="eyebrow">Zuigers & lagers</span><h2>Meetwaarden</h2>
          ${assemblySlider('topRingGapMm','Topring-gap',.28,.80,.01,a.topRingGapMm,' mm',2,t.topRingGapMm,'Warmte- en boostmarge')}
          ${assemblySlider('secondRingGapMm','Tweede ring-gap',.32,.88,.01,a.secondRingGapMm,' mm',2,t.secondRingGapMm,'Ondersteunt drukontlasting')}
          ${assemblySlider('rodClearanceMm','Drijfstanglagerclearance',.035,.080,.001,a.rodClearanceMm,' mm',3,t.rodClearanceMm,'Viscositeit, rpm en warme film')}
          ${assemblySlider('mainClearanceMm','Hoofdlagerclearance',.038,.082,.001,a.mainClearanceMm,' mm',3,t.mainClearanceMm,'Warme oliedruk versus film')}
          ${assemblySlider('sparkGapMm','Bougiegap',.38,.82,.01,a.sparkGapMm,' mm',2,t.sparkGapMm,'Vonkmarge onder cilinderdruk')}
        </div>
        <div class="card">
          <span class="eyebrow">Werkplaatsprocedure</span><h2>Uitvoering</h2>
          ${assemblySlider('balanceQualityPct','Balanskwaliteit',75,100,1,a.balanceQualityPct,'%',0,100,'Krukas, vliegwiel en bobweight')}
          ${assemblySlider('deckSealQualityPct','Deck & sealing',75,100,1,a.deckSealQualityPct,'%',0,100,'Vlakheid, finish en pakkingscontrole')}
          ${assemblySlider('fastenerProcedurePct','Fastener-procedure',75,100,1,a.fastenerProcedurePct,'%',0,100,'Schroefdraad, lube en torque sequence')}
          <div class="switch-row"><div><b>Oliesysteem geprimed</b><small>Virtuele oliedruk opgebouwd vóór belasting.</small></div><button class="switch ${a.oilPrimed ? 'on' : ''}" data-assembly-switch="oilPrimed" aria-pressed="${a.oilPrimed}"><i></i></button></div>
          <button class="btn secondary" data-action="apply-assembly-targets">Modeldoelen overnemen</button>
        </div>
      </div>
      ${warnings.length ? `<div class="warning-list">${warnings.map(x => `<div class="warning-item"><span>!</span><p>${esc(x)}</p></div>`).join('')}</div>` : '<div class="notice success"><strong>Montagewaarden liggen rond de huidige modeldoelen.</strong></div>'}
    </div>`;
  }

  function renderBenchPanel(confidence) {
    const signature = C.benchSignature(state);
    const tests = C.BENCH_TESTS.map(test => {
      const result = state.bench?.results?.[test.id];
      const current = result && result.signature === signature;
      const status = current ? result.status : 'stale';
      return `<article class="bench-test-card ${status}">
        <div class="bench-test-head"><span class="test-status">${status === 'pass' ? icon('check') : status === 'warn' ? '!' : status === 'fail' ? '×' : '○'}</span><div><b>${esc(test.name)}</b><p>${esc(test.detail)}</p></div></div>
        ${current ? `<div class="bench-result"><strong>${esc(result.summary)}</strong>${result.values.map(v => `<span><i>${esc(v[0])}</i><b>${esc(v[1])}</b></span>`).join('')}</div>` : '<div class="bench-stale">Niet uitgevoerd of niet meer actueel voor deze combinatie.</div>'}
        <button class="btn ${current ? 'ghost' : 'small'}" data-run-bench="${test.id}">${current ? 'Opnieuw testen' : 'Test uitvoeren'}</button>
      </article>`;
    }).join('');
    return `<div class="motor-panel bench-panel">
      <div class="bench-overview card">
        <div class="bench-confidence"><b>${confidence.score || 0}</b><span>confidence</span></div>
        <div><span class="eyebrow">Pre-dyno checklist</span><h2>${confidence.current}/${confidence.total} actuele tests</h2><p>Een benchtest toont compressie, leak-down, oliedruk, brandstofflow, camtiming of ontstekingsmarge. Hij voorspelt geen pk.</p></div>
        <button class="btn" data-action="run-all-bench">Alle tests draaien</button>
      </div>
      ${confidence.failed ? `<div class="notice danger"><strong>${confidence.failed} test(s) gefaald.</strong> Los de oorzaak op voordat je een zware pull doet.</div>` : ''}
      <div class="bench-test-grid">${tests}</div>
    </div>`;
  }

  // Compact part row: name, key spec, price and the mount button always visible; the description and the
  // compressor meter fold out. Open rows are remembered so a re-render never folds them away.
  const openPartRows = new Set();
  function partCard(cat, part, selected) {
    const randy = isRandyPart(part);
    const key = `${cat.id}:${part.id}`;
    const turboMeta = cat.id === 'turbo' ? `<div class="part-meter"><span>Compressor</span><b>${part.compressorMm || 'OEM'} mm</b><i style="--fill:${clamp(((part.compressorMm || 45)-40)/80*100,8,100)}%"></i></div>` : '';
    return `<article class="part-card part-row ${selected ? 'selected' : ''}" data-part-row="${key}">
      <details ${openPartRows.has(key) ? 'open' : ''} data-part-details="${key}">
        <summary>
          <span class="part-row-state" aria-hidden="true">${selected ? icon('check') : ''}</span>
          <span class="part-row-main"><b>${esc(part.name)}${randy ? ' <em class="randy-badge">RANDY SPEC</em>' : ''}</b><small>${esc(part.specs)}</small></span>
          <span class="part-row-price">${part.price ? euro(part.price) : 'OEM'}</span>
        </summary>
        <div class="part-row-body"><p>${esc(part.detail)}</p>${turboMeta}</div>
      </details>
      ${selected ? '<span class="part-row-mounted">Gemonteerd</span>' : `<button class="btn small" data-part-cat="${cat.id}" data-part-id="${part.id}">Monteren</button>`}
    </article>`;
  }
  document.addEventListener('toggle', ev => {
    const key = ev.target?.dataset?.partDetails;
    if (!key) return;
    if (ev.target.open) openPartRows.add(key); else openPartRows.delete(key);
  }, true);

  function slider(name, label, min, max, step, value, unit, decimals = 1, hint = '', group = 'tune') {
    return `<div class="control">
      <div class="control-head"><div><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div><output class="value-edit" tabindex="0" role="button" aria-label="Waarde intypen" data-value-for="${group}.${name}">${Number(value).toFixed(decimals)}${esc(unit)}</output></div>
      <div class="range-row"><button type="button" class="step-btn" data-step="-1" aria-label="Lager">−</button><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-${group}="${name}" data-unit="${esc(unit)}" data-decimals="${decimals}"><button type="button" class="step-btn" data-step="1" aria-label="Hoger">+</button></div>
      <div class="range-scale"><span>${min}</span><span>${max}${esc(unit)}</span></div>
    </div>`;
  }

  function switchRow(name, label, detail, target = 'tune') {
    const on = !!state[target][name];
    const attr = target === 'vehicle' ? 'data-vehicle-switch' : target === 'settings' ? 'data-setting-switch' : 'data-switch';
    return `<div class="switch-row"><div><b>${esc(label)}</b><small>${esc(detail)}</small></div><button class="switch ${on ? 'on' : ''}" ${attr}="${name}" aria-pressed="${on}"><i></i></button></div>`;
  }

  function tuneTabs() {
    return `<div class="segment-control tune-segments six">
      <button class="${tunePanel === 'boost' ? 'active' : ''}" data-tune-panel="boost">Boost</button>
      <button class="${tunePanel === 'tables' ? 'active' : ''}" data-tune-panel="tables">Tabellen</button>
      <button class="${tunePanel === 'als' ? 'active' : ''}" data-tune-panel="als">Anti-lag</button>
      <button class="${tunePanel === 'fuel' ? 'active' : ''}" data-tune-panel="fuel">Brandstof</button>
      <button class="${tunePanel === 'cams' ? 'active' : ''}" data-tune-panel="cams">Nokken</button>
      <button class="${tunePanel === 'safety' ? 'active' : ''}" data-tune-panel="safety">Failsafes</button>
    </div>`;
  }

  const ALS_MODE_LABELS = { off: ['Uit', 'geen anti-lag'], mild: ['Mild', 'kort, koel'], street: ['Street', 'launch-hulp'], rally: ['Rally', 'boost vasthouden'], drag: ['Drag', 'agressief'], custom: ['Custom', 'eigen waarden'] };
  let alsTestResult = null;
  function alsSlider(key, label, min, max, step, value, unit, decimals, hint) {
    return `<div class="control">
      <div class="control-head"><div><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div><output class="value-edit" tabindex="0" role="button" aria-label="Waarde intypen" data-value-for="als.${key}">${Number(value).toFixed(decimals)}${esc(unit)}</output></div>
      <div class="range-row"><button type="button" class="step-btn" data-step="-1" aria-label="Lager">−</button><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-als="${key}" data-unit="${esc(unit)}" data-decimals="${decimals}"><button type="button" class="step-btn" data-step="1" aria-label="Hoger">+</button></div>
      <div class="range-scale"><span>${min}</span><span>${max}${esc(unit)}</span></div>
    </div>`;
  }
  function renderAntiLagPanel() {
    const resolved = C.resolveAntiLag(state);
    const cap = resolved.capability;
    const p = resolved.params;
    const mode = resolved.mode;
    const canTest = currentCompletedDyno() && resolved.enabled;
    const testWhy = !resolved.enabled ? (cap.ecuLevel === 'none' ? `${cap.ecuName} ondersteunt geen anti-lag.` : 'Kies eerst een ALS-modus.') : !currentCompletedDyno() ? 'Standtest vraagt een volledige, actuele dynopull (luchtstroom en EGT komen uit die meting).' : '';
    const r = alsTestResult && alsTestResult.key === JSON.stringify(resolved.params) + mode ? alsTestResult : null;
    return `<div class="tune-layout als-layout">
      <div class="card tune-card als-card">
        <div class="card-title"><span>${icon('bolt')}</span><div><span class="eyebrow">Anti-lag systeem</span><h2>Boost vasthouden zonder gas</h2></div></div>
        <p class="als-intro">ALS vertraagt de ontsteking, verrijkt en opent een luchtbypass zodat er in het spruitstuk wordt verbrand. De turbo blijft draaien, maar EGT, uitlaatdruk, brandstofverbruik en slijtage van turbo, spruitstuk en kleppen stijgen sterk.</p>
        <div class="als-mode-grid">${C.ANTI_LAG_MODES.map(m => `<button class="als-mode ${mode === m ? 'active' : ''} ${m === 'drag' ? 'danger' : ''}" data-als-mode="${m}"><b>${ALS_MODE_LABELS[m][0]}</b><small>${ALS_MODE_LABELS[m][1]}</small></button>`).join('')}</div>
        <div class="als-cap ${cap.ecuLevel}"><span>ECU <b>${esc(cap.ecuName)}</b> · ${cap.ecuLevel === 'full' ? 'volledige ALS' : cap.ecuLevel === 'limited' ? 'beperkte ALS' : 'geen ALS'}</span><span>Luchtbypass max <b>${cap.bypassMaxPct}%</b> (${esc(C.getPart(state, 'spool').name)})</span>${resolved.notes.map(n => `<span class="note">${esc(n)}</span>`).join('')}</div>
        ${mode !== 'custom' && mode !== 'off' ? '<div class="tune-note"><b>Preset actief</b><p>Een schuif verplaatsen maakt er een Custom-instelling van met deze waarden als start.</p></div>' : ''}
        ${alsSlider('targetRpm', 'ALS target rpm', 2500, 7000, 100, p.targetRpm, ' rpm', 0, 'Tweestaps-/ALS-toerental; onder 60% hiervan schakelt ALS niet in.')}
        ${alsSlider('targetBoostBar', 'ALS target boost', 0, 3.5, 0.05, p.targetBoostBar, ' bar', 2, 'De regelaar neemt terug zodra deze druk staat.')}
        ${alsSlider('retardDeg', 'Ontstekingsvertraging', 0, 45, 1, p.retardDeg, '°', 0, 'Meer vertraging = meer verbranding in het spruitstuk.')}
        ${alsSlider('extraFuelPct', 'Extra brandstof', 0, 40, 1, p.extraFuelPct, '%', 0, 'Verrijking tijdens ALS (lambda omlaag).')}
        ${alsSlider('bypassPct', 'Gasklep/bypass', 0, 40, 1, p.bypassPct, '%', 0, 'Beperkt door de luchtbypass-hardware.')}
        ${alsSlider('aggressiveness', 'Agressiviteit', 0, 100, 1, p.aggressiveness, '', 0, 'Schaal van de ALS-ingreep; hoger is harder en duurder.')}
      </div>
      <div class="card tune-card">
        <div class="card-title"><span>${icon('service')}</span><div><span class="eyebrow">ALS-bescherming</span><h2>Grenzen & timeout</h2></div></div>
        ${alsSlider('maxEgtC', 'Maximale EGT', 850, 1250, 10, p.maxEgtC, ' °C', 0, 'Regelaar beperkt de ALS-energie op deze turbine-inlaattemperatuur.')}
        ${alsSlider('maxShaftPct', 'Maximale turbo-as', 70, 110, 1, p.maxShaftPct, '%', 0, 'Percentage van het maximale asoptoerental van de kaart.')}
        ${alsSlider('timeoutS', 'Timeout', 0.5, 15, 0.5, p.timeoutS, ' s', 1, 'Na deze tijd ononderbroken ALS schakelt het systeem uit.')}
        ${alsSlider('cooldownS', 'Cooldown', 0, 30, 1, p.cooldownS, ' s', 0, 'Wachttijd voordat ALS weer mag na een timeout.')}
        <div class="als-test">
          <button class="btn secondary als-test-button" data-action="als-test" ${canTest ? '' : 'disabled'}>${icon('bolt')} ALS-standtest (4 s op ${Math.round(p.targetRpm)} rpm)</button>
          ${canTest ? '<small>De test belast de motor echt: slijtage wordt opgeslagen.</small>' : `<small class="why">${esc(testWhy)}</small>`}
        </div>
        ${r ? `<div class="als-result">
          <canvas id="als-test-chart" aria-label="ALS-standtest: boost, turbo-as en EGT"></canvas>
          <div class="technical-grid">
            <div><span>Boost na 1 s / eind</span><b>${num(r.boostAt1,2)} / ${num(r.finalBoostBar,2)} bar</b></div>
            <div><span>Max turbo-as</span><b>${num(r.maxShaftPct,0)}%</b></div>
            <div><span>Max EGT · EMP</span><b>${num(r.maxEgtC,0)} °C · ${num(r.maxEmpBar,2)} bar</b></div>
            <div><span>Brandstof</span><b>${num(r.fuelUsedG,0)} g in ${num(r.seconds,1)} s</b></div>
            <div><span>Slijtage turbo / spruitstuk / kleppen</span><b>+${num(r.wear.turbo,3)} / +${num(r.wear.manifold,3)} / +${num(r.wear.valves,3)}%</b></div>
            <div><span>Schade turbo</span><b class="${r.damage.turbo > 0 ? 'bad' : ''}">${r.damage.turbo > 0 ? `+${num(r.damage.turbo,2)}%` : 'geen'}</b></div>
          </div>
        </div>` : ''}
      </div>
    </div>`;
  }
  function runAlsTest() {
    if (!currentCompletedDyno()) return showToast('Voer eerst een volledige dynopull uit.');
    const resolved = C.resolveAntiLag(state);
    if (!resolved.enabled) return showToast('Anti-lag staat uit of wordt niet ondersteund.');
    const h = C.simulateAntiLagHold(state, { seconds: 4 });
    state = C.applyRuntimeWear(state, { wear: h.wear, damage: h.damage });
    pushHistory({ type: 'als', label: `ALS-standtest ${ALS_MODE_LABELS[resolved.mode][0]}: ${h.finalBoostBar.toFixed(2)} bar, EGT ${Math.round(h.maxEgtC)} °C` });
    saveState();
    alsTestResult = { key: JSON.stringify(resolved.params) + resolved.mode, ...h, boostAt1: (h.trace.find(p => Math.abs(p.t - 1) < 0.051) || h.trace[0]).boostBar };
    haptic([20, 20, 40]);
    render();
  }
  function drawAlsTestChart() {
    const canvas = $('#als-test-chart');
    if (!canvas || !alsTestResult) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = Math.max(260, canvas.getBoundingClientRect().width || 320), h = 160;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0b1119'; ctx.fillRect(0, 0, w, h);
    const tr = alsTestResult.trace, T = alsTestResult.seconds, pad = { l: 8, r: 8, t: 22, b: 16 };
    const X = t => pad.l + (t / T) * (w - pad.l - pad.r), Y = f => pad.t + (1 - clamp(f, 0, 1.05)) * (h - pad.t - pad.b);
    const series = [['boostBar', '#36b8ff', Math.max(1, alsTestResult.als.params.targetBoostBar * 1.3), 'BOOST'], ['shaftPct', '#48db9c', 110, 'AS %'], ['egtC', '#ff654d', 1250, 'EGT']];
    series.forEach(([key, color, max, label], i) => {
      ctx.beginPath(); tr.forEach((p, j) => (j ? ctx.lineTo(X(p.t), Y(p[key] / max)) : ctx.moveTo(X(p.t), Y(p[key] / max))));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = color; ctx.font = '800 9px system-ui,sans-serif'; ctx.fillText(label, pad.l + i * 60, 13);
    });
    tr.forEach(p => { if (p.alsLimitedBy === 'cooldown') { ctx.fillStyle = 'rgba(255,83,101,.12)'; ctx.fillRect(X(p.t) - 2, pad.t, 4, h - pad.t - pad.b); } });
  }

  // ---- ECU tables (phase 4) ------------------------------------------------------------------------
  // The calibration as tables: boost target per gear x rpm; spark, lambda and intake cam per MAP x rpm.
  // Cells the last pull passed through are marked; spark cells where knock control had to retard are red.
  const ECU_TABLES = Object.freeze({
    boost: { label: 'Boost', title: 'Boosttarget', unit: ' bar', decimals: 2, step: 0.05, min: 0, max: 5, rows: 'gear', hint: 'Doeldruk (bar overdruk) per versnelling en toerental. De dyno meet in de ingestelde dynoversnelling.' },
    spark: { label: 'Ontsteking', title: 'Ontstekingstabel', unit: '°', decimals: 1, step: 0.5, min: -15, max: 50, rows: 'load', hint: 'Voorontsteking (° voor TDC) per inlaatdruk (MAP, bar absoluut) en toerental. Meer is sterker tot MBT, maar dichter bij knock.' },
    lambda: { label: 'Lambda', title: 'Lambdatarget', unit: '', decimals: 2, step: 0.01, min: 0.6, max: 1.1, rows: 'load', hint: 'Doelmengsel per MAP en toerental. Rijker koelt en beschermt, maar kost brandstof en boven ~0,75 ook koppel.' },
    cam: { label: 'Nokken', title: 'Inlaatnok-advance', unit: '°', decimals: 0, step: 1, min: -5, max: 42, rows: 'load', hint: 'Gevraagde inlaatfasering (krukasgraden). Advance vult beter onderin en vergroot de overlap; bij hoge uitlaatdruk kost overlap juist vulling.' }
  });
  let ecuView = { table: 'spark', sel: null, anchor: null, range: false };
  function ecuTableInfo(name) { return ECU_TABLES[name] || ECU_TABLES.spark; }
  function ecuRows(name) {
    const e = state.tune.ecu;
    return ecuTableInfo(name).rows === 'gear' ? e.boost.map((_, i) => `${i + 1}e`) : e.loadAxis.map(v => num(v, 2));
  }
  // Cells visited by the last dyno pull (and knock retard there), from the logged samples.
  function ecuTrace(name) {
    const d = state.lastDyno, e = state.tune.ecu, hits = new Map();
    if (!d?.samples?.length) return hits;
    const nearest = (axis, v) => axis.reduce((best, a, i) => (Math.abs(a - v) < Math.abs(axis[best] - v) ? i : best), 0);
    const gear = clamp(Number(d.dynoConfig?.gear || 4), 1, 6) - 1;
    for (const p of d.samples) {
      const c = nearest(e.rpmAxis, p.rpm);
      const r = ecuTableInfo(name).rows === 'gear' ? gear : nearest(e.loadAxis, Number(p.mapBarAbs ?? (1.013 + p.boostBar)));
      const key = `${r},${c}`, prev = hits.get(key) || { n: 0, knock: 0 };
      hits.set(key, { n: prev.n + 1, knock: Math.max(prev.knock, Number(p.knockRetardDeg || 0)) });
    }
    return hits;
  }
  function ecuInSel(r, c) {
    const s = ecuView.sel;
    return !!s && r >= Math.min(s.r0, s.r1) && r <= Math.max(s.r0, s.r1) && c >= Math.min(s.c0, s.c1) && c <= Math.max(s.c0, s.c1);
  }
  function renderEcuTable() {
    const e = state.tune.ecu, name = ecuView.table, info = ecuTableInfo(name), table = e[name];
    const rows = ecuRows(name), trace = ecuTrace(name);
    const flat = table.flat(), lo = Math.min(...flat), hi = Math.max(...flat);
    const dynoCurrent = C.isDynoCurrent(state);
    const cells = table.map((row, r) => `<tr><th scope="row" data-ecu-row="${r}">${esc(rows[r])}</th>${row.map((v, c) => {
      const h = hi > lo ? (v - lo) / (hi - lo) : 0.5, t = trace.get(`${r},${c}`);
      const cls = [ecuInSel(r, c) ? 'sel' : '', t ? 'hit' : '', t && name === 'spark' && t.knock > 0.4 ? 'knock' : ''].filter(Boolean).join(' ');
      return `<td class="${cls}" style="--h:${h.toFixed(3)}" data-ecu-cell="${r},${c}" ${t && name === 'spark' && t.knock > 0.4 ? `title="knockretard ${num(t.knock, 1)}°"` : ''}>${Number(v).toFixed(info.decimals)}</td>`;
    }).join('')}</tr>`).join('');
    const selCount = ecuView.sel ? (Math.abs(ecuView.sel.r1 - ecuView.sel.r0) + 1) * (Math.abs(ecuView.sel.c1 - ecuView.sel.c0) + 1) : 0;
    const selText = ecuView.sel ? (selCount === 1 ? `${rows[ecuView.sel.r0]} · ${e.rpmAxis[ecuView.sel.c0]} rpm` : `${selCount} cellen`) : 'Tik een cel';
    const hw = C.engineHardware(state), base = e.baseMapFor;
    const fuelChanged = name === 'spark' && base && (base.fuel !== state.selections.fuel || (base.ethanolPct ?? hw.ethanolPct) !== hw.ethanolPct || base.head !== state.selections.head || base.block !== state.selections.block);
    const edited = !!e.edited?.[name];
    const knockCells = name === 'spark' ? [...trace.values()].filter(t => t.knock > 0.4).length : 0;
    return `<div class="card tune-card ecu-card">
      <div class="card-title"><span>${icon('tune')}</span><div><span class="eyebrow">ECU-tabel${edited ? ' · handmatig aangepast' : ''}</span><h2>${esc(info.title)}</h2></div></div>
      <div class="segment-control ecu-table-tabs">${Object.entries(ECU_TABLES).map(([k, t]) => `<button class="${k === name ? 'active' : ''}" data-ecu-table="${k}">${esc(t.label)}</button>`).join('')}</div>
      <p class="ecu-hint">${esc(info.hint)}</p>
      ${name === 'spark' ? `<div class="notice ${fuelChanged ? 'danger' : ''}"><strong>${fuelChanged ? 'Hardware of brandstof gewijzigd sinds de basismap.' : `Basismap voor ${esc(base?.label || hw.fuelLabel)}.`}</strong> ${fuelChanged ? 'De knockregeling moet nu terugnemen of er is ontsteking over; maak een nieuwe basismap of pas de cellen aan.' : 'Veilige start: 2° onder de knockgrens bij een koele inlaat. Wat daartussen zit vind je op de dyno.'}</div>` : ''}
      ${name === 'spark' && knockCells ? `<div class="notice danger"><strong>Knockretard in ${knockCells} cel${knockCells === 1 ? '' : 'len'} tijdens de laatste pull.</strong> Rood omrande cellen: daar nam de knockregeling ontsteking terug.</div>` : ''}
      <div class="ecu-grid-wrap" data-scroll-x><table class="ecu-grid ${name}"><thead><tr><th data-ecu-all title="Alles selecteren">${info.rows === 'gear' ? 'versn.' : 'MAP'}</th>${e.rpmAxis.map((v, c) => `<th data-ecu-col="${c}">${v >= 10000 ? `${v / 1000}k` : v}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div>
      <div class="ecu-legend"><span><i class="hit"></i>geraakt in laatste pull${dynoCurrent ? '' : ' (verouderde meting)'}</span>${name === 'spark' ? '<span><i class="knock"></i>knockretard</span>' : ''}<span>${info.rows === 'gear' ? 'rijen: versnelling' : 'rijen: MAP bar abs'} · kolommen: rpm</span></div>
      <div class="ecu-toolbar">
        <div class="ecu-sel"><b>${esc(selText)}</b><small>${ecuView.range ? 'Bereik: tik de tegenoverliggende hoek' : 'Tik = cel · vasthouden en slepen = vak · kop = rij/kolom'}</small></div>
        <button class="btn ghost small ${ecuView.range ? 'armed' : ''}" data-action="ecu-range" aria-pressed="${ecuView.range}">Bereik</button>
        <button class="btn ghost small" data-action="ecu-step" data-dir="-1" ${ecuView.sel ? '' : 'disabled'} aria-label="Lager">−${info.step}</button>
        <button class="btn ghost small" data-action="ecu-step" data-dir="1" ${ecuView.sel ? '' : 'disabled'} aria-label="Hoger">+${info.step}</button>
        <button class="btn ghost small" data-action="ecu-set" ${ecuView.sel ? '' : 'disabled'}>Waarde…</button>
        <button class="btn ghost small" data-action="ecu-smooth" ${selCount > 1 ? '' : 'disabled'}>Glad</button>
        <button class="btn ghost small" data-action="ecu-interp" ${selCount > 2 ? '' : 'disabled'}>Interpoleer</button>
        ${name === 'boost' ? `<button class="btn ghost small" data-action="ecu-copy-gears" ${ecuView.sel ? '' : 'disabled'}>Naar alle versn.</button>` : ''}
      </div>
      <div class="ecu-actions">
        ${name === 'spark' ? '<button class="btn secondary" data-action="ecu-basemap">Nieuwe basismap</button>' : `<button class="btn ghost" data-action="ecu-follow-quick" ${edited ? '' : 'disabled'}>Volg snelinstelling</button>`}
        <button class="btn" data-go="dyno">Meten op de dyno</button>
      </div>
    </div>`;
  }
  // Edits: every change records the whole ECU before it, so "Ongedaan" restores exactly that edit.
  function ecuEdit(label, mutate) {
    const before = cloneJson(state.tune.ecu);
    const name = ecuView.table, info = ecuTableInfo(name);
    const t = state.tune.ecu[name].map(r => r.slice());
    mutate(t, info);
    for (const row of t) for (let c = 0; c < row.length; c++) row[c] = Math.round(clamp(row[c], info.min, info.max) / info.step * 1e6) / 1e6 * info.step, row[c] = Number(row[c].toFixed(4));
    state.tune.ecu[name] = t;
    state.tune.ecu.edited = { ...(state.tune.ecu.edited || {}), [name]: true };
    saveState();
    render();
    showToast(label, { label: 'Ongedaan', run: () => { state.tune.ecu = before; saveState(); render(); showToast('ECU-wijziging teruggezet.'); } });
  }
  function ecuSelBounds() {
    const s = ecuView.sel;
    return s ? { r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1), c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1) } : null;
  }
  function ecuForSel(t, fn) {
    const b = ecuSelBounds();
    if (!b) return;
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) t[r][c] = fn(t[r][c], r, c, b);
  }
  function ecuCellTap(r, c) {
    if (ecuView.range && ecuView.sel) ecuView.sel = { ...ecuView.sel, r1: r, c1: c };
    else ecuView.sel = { r0: r, c0: c, r1: r, c1: c };
    haptic(4);
    render();
  }
  function ecuAction(action, btn) {
    const info = ecuTableInfo(ecuView.table);
    if (action === 'ecu-range') { ecuView.range = !ecuView.range; return render(); }
    if (action === 'ecu-step') {
      const dir = Number(btn?.dataset.dir || 1);
      return ecuEdit(`${info.title}: ${dir > 0 ? '+' : '−'}${info.step}${info.unit} op selectie`, t => ecuForSel(t, v => v + dir * info.step));
    }
    if (action === 'ecu-set') {
      const b = ecuSelBounds(); if (!b) return;
      const v = state.tune.ecu[ecuView.table][b.r0][b.c0];
      showModal(esc(info.title),
        `<label class="value-editor"><span>Waarde voor de selectie${info.unit.trim() ? ` (${esc(info.unit.trim())})` : ''}</span><input id="ecu-value-field" type="number" inputmode="decimal" min="${info.min}" max="${info.max}" step="${info.step}" value="${v}"></label><p class="modal-copy">Bereik ${info.min} – ${info.max}${esc(info.unit)}, stap ${info.step}.</p>`,
        '<button class="btn ghost" data-action="close-modal">Annuleren</button><button class="btn" data-action="ecu-set-apply">Toepassen</button>');
      setTimeout(() => { const f = $('#ecu-value-field'); f?.focus(); f?.select(); }, 60);
      return;
    }
    if (action === 'ecu-set-apply') {
      const raw = Number(String($('#ecu-value-field')?.value ?? '').replace(',', '.'));
      closeModal();
      if (!Number.isFinite(raw)) return showToast('Geen geldig getal.');
      return ecuEdit(`${info.title}: selectie op ${num(raw, info.decimals)}${info.unit}`, t => ecuForSel(t, () => raw));
    }
    if (action === 'ecu-smooth') return ecuEdit(`${info.title}: selectie gladgemaakt`, t => {
      const src = t.map(r => r.slice());
      ecuForSel(t, (v, r, c) => {
        let sum = 0, n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const x = src[r + dr]?.[c + dc]; if (Number.isFinite(x)) { sum += x * (dr || dc ? 1 : 2); n += dr || dc ? 1 : 2; } }
        return sum / n;
      });
    });
    if (action === 'ecu-interp') return ecuEdit(`${info.title}: lineair geïnterpoleerd`, t => {
      const b = ecuSelBounds();
      // Bilinear between the four corner cells of the selection.
      const q = (r, c) => t[r][c], a = q(b.r0, b.c0), bb = q(b.r0, b.c1), cc = q(b.r1, b.c0), d = q(b.r1, b.c1);
      ecuForSel(t, (v, r, c) => {
        const fr = b.r1 > b.r0 ? (r - b.r0) / (b.r1 - b.r0) : 0, fc = b.c1 > b.c0 ? (c - b.c0) / (b.c1 - b.c0) : 0;
        return (a * (1 - fc) + bb * fc) * (1 - fr) + (cc * (1 - fc) + d * fc) * fr;
      });
    });
    if (action === 'ecu-copy-gears') return ecuEdit('Boost: rij gekopieerd naar alle versnellingen', t => {
      const b = ecuSelBounds();
      for (let r = 0; r < t.length; r++) if (r !== b.r0) for (let c = b.c0; c <= b.c1; c++) t[r][c] = t[b.r0][c];
    });
    if (action === 'ecu-follow-quick') {
      const before = cloneJson(state.tune.ecu);
      state.tune.ecu.edited = { ...state.tune.ecu.edited, [ecuView.table]: false };
      state.tune.ecu.quickKey = '';
      saveState(); render();
      return showToast(`${info.title} volgt weer de snelinstelling.`, { label: 'Ongedaan', run: () => { state.tune.ecu = before; saveState(); render(); } });
    }
    if (action === 'ecu-basemap') {
      const hw = C.engineHardware(state);
      return showModal('Nieuwe basismap',
        `<p class="modal-copy">De ontstekingstabel wordt opnieuw berekend voor de gemonteerde kop, compressieverhouding en <b>${esc(hw.fuelLabel)}${hw.ethanolPct ? ` (E${hw.ethanolPct})` : ''}</b>: per cel 2° onder de knockgrens, nooit voorbij MBT. Handmatige wijzigingen in de ontsteking gaan verloren (ongedaan maken kan).</p>`,
        '<button class="btn ghost" data-action="close-modal">Annuleren</button><button class="btn" data-action="ecu-basemap-apply">Berekenen</button>');
    }
    if (action === 'ecu-basemap-apply') {
      closeModal();
      const before = cloneJson(state.tune.ecu);
      state = C.regenerateBaseMap(state);
      saveState(); render();
      return showToast('Basismap berekend voor de huidige hardware.', { label: 'Ongedaan', run: () => { state.tune.ecu = before; saveState(); render(); } });
    }
  }
  // Drag selection. Touch: a quick swipe keeps scrolling the table; hold ~0.25 s and drag to select a block
  // (the table then auto-scrolls at its edges). Mouse/pen: drag at once. The DOM is only repainted during the
  // drag; the page re-renders when the finger lifts.
  let ecuDrag = null, ecuSuppressClick = false;
  function ecuCellAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-ecu-cell]');
    return el ? el.dataset.ecuCell.split(',').map(Number) : null;
  }
  function paintEcuSel() {
    $$('.ecu-grid td[data-ecu-cell]').forEach(td => { const [r, c] = td.dataset.ecuCell.split(',').map(Number); td.classList.toggle('sel', ecuInSel(r, c)); });
    const b = ecuSelBounds(), label = $('.ecu-sel b');
    if (b && label) {
      const n = (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1), e = state.tune.ecu;
      label.textContent = n === 1 ? `${ecuRows(ecuView.table)[b.r0]} · ${e.rpmAxis[b.c0]} rpm` : `${n} cellen · ${e.rpmAxis[b.c0]}–${e.rpmAxis[b.c1]} rpm`;
    }
  }
  function ecuDragBegin() {
    if (!ecuDrag) return;
    ecuDrag.active = true;
    ecuView.sel = { r0: ecuDrag.r, c0: ecuDrag.c, r1: ecuDrag.r, c1: ecuDrag.c };
    paintEcuSel();
    haptic(8);
  }
  document.addEventListener('pointerdown', ev => {
    const cell = ev.target.closest?.('[data-ecu-cell]');
    if (!cell || ev.button > 0) return;
    const [r, c] = cell.dataset.ecuCell.split(',').map(Number);
    ecuDrag = { id: ev.pointerId, r, c, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, active: false, moved: false, timer: 0 };
    if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') ecuDrag.mouse = true;
    else ecuDrag.timer = setTimeout(() => { if (ecuDrag && !ecuDrag.moved) ecuDragBegin(); }, 250);
  });
  document.addEventListener('pointermove', ev => {
    if (!ecuDrag || ev.pointerId !== ecuDrag.id) return;
    ecuDrag.x = ev.clientX; ecuDrag.y = ev.clientY;
    if (!ecuDrag.active) {
      const far = Math.hypot(ev.clientX - ecuDrag.x0, ev.clientY - ecuDrag.y0) > 8;
      if (far && ecuDrag.mouse) ecuDragBegin();
      else if (far) { ecuDrag.moved = true; clearTimeout(ecuDrag.timer); return; }
      else return;
    }
    const at = ecuCellAt(ev.clientX, ev.clientY);
    if (at && (at[0] !== ecuView.sel.r1 || at[1] !== ecuView.sel.c1)) { ecuView.sel = { ...ecuView.sel, r1: at[0], c1: at[1] }; paintEcuSel(); }
    // auto-scroll the table when the finger nears its left/right edge
    const wrap = $('.ecu-grid-wrap'), rect = wrap?.getBoundingClientRect();
    if (rect) { if (ev.clientX > rect.right - 36) wrap.scrollLeft += 14; else if (ev.clientX < rect.left + 70) wrap.scrollLeft -= 14; }
  });
  // While a drag-select is active the finger must not scroll the page or the table.
  document.addEventListener('touchmove', ev => { if (ecuDrag?.active) ev.preventDefault(); }, { passive: false });
  function ecuDragEnd(ev) {
    if (!ecuDrag || (ev && ev.pointerId !== ecuDrag.id)) return;
    clearTimeout(ecuDrag.timer);
    const wasActive = ecuDrag.active;
    ecuDrag = null;
    if (wasActive) { ecuSuppressClick = true; setTimeout(() => { ecuSuppressClick = false; }, 350); render(); }
  }
  document.addEventListener('pointerup', ecuDragEnd);
  document.addEventListener('pointercancel', ev => { if (ecuDrag && !ecuDrag.active) { clearTimeout(ecuDrag.timer); ecuDrag = null; } else ecuDragEnd(ev); });
  document.addEventListener('click', ev => {
    const cell = ev.target.closest?.('[data-ecu-cell]');
    if (cell) { if (ecuSuppressClick) { ecuSuppressClick = false; return; } const [r, c] = cell.dataset.ecuCell.split(',').map(Number); ecuCellTap(r, c); return; }
    const e = state.tune?.ecu, name = ecuView.table;
    const rowHead = ev.target.closest?.('[data-ecu-row]'), colHead = ev.target.closest?.('[data-ecu-col]'), all = ev.target.closest?.('[data-ecu-all]');
    if (e && (rowHead || colHead || all)) {
      const rows = e[name].length - 1, cols = e.rpmAxis.length - 1;
      if (rowHead) { const r = Number(rowHead.dataset.ecuRow); ecuView.sel = { r0: r, r1: r, c0: 0, c1: cols }; }
      else if (colHead) { const c = Number(colHead.dataset.ecuCol); ecuView.sel = { r0: 0, r1: rows, c0: c, c1: c }; }
      else ecuView.sel = { r0: 0, r1: rows, c0: 0, c1: cols };
      haptic(6); render(); return;
    }
    const tab = ev.target.closest?.('[data-ecu-table]');
    if (tab) { ecuView = { table: tab.dataset.ecuTable, sel: null, anchor: null, range: false }; haptic(6); render(); }
  });

  function renderTune() {
    const t = state.tune;
    const turbo = C.getPart(state, 'turbo');
    const boostHardware = C.getPart(state, 'boostControl');
    const fuelSystem = C.getPart(state, 'fuelSystem');
    const fuel = C.getPart(state, 'fuel');
    const ecu = C.getPart(state, 'ecu');
    const sensors = C.getPart(state, 'sensors');
    const ignition = C.getPart(state, 'ignition');
    const cam = C.camTimingHealth(state);
    const camPct = Math.round(cam.score * 100);
    const requestedPeak = Math.max(t.boostLowBar, t.boostMidBar, t.boostHighBar);
    const boostHeadroom = boostHardware.boostHardwareMaxBar - requestedPeak;
    let content = '';

    if (tunePanel === 'boost') {
      content = `<div class="tune-layout">
        <div class="card tune-card">
          <div class="card-title"><span>${icon('bolt')}</span><div><span class="eyebrow">Boostcurve</span><h2>${esc(turbo.name)}</h2></div></div>
          <div class="hardware-readout"><span>Compressor <b>${turbo.compressorMm || 'OEM'} mm</b></span><span>Regeling <b>${esc(boostHardware.name)}</b></span><span>Hardwarelimiet <b>${num(boostHardware.boostHardwareMaxBar,2)} bar</b></span></div>
          ${turboMapProvenance(turbo.id)}
          ${slider('boostLowBar', 'Laagtoerig target', 0, 4.2, .05, t.boostLowBar, ' bar', 2, 'Rond 2500–3200 rpm; de turbo moet dit eerst werkelijk kunnen leveren.')}
          ${slider('boostMidBar', 'Middentoeren target', 0, 4.2, .05, t.boostMidBar, ' bar', 2, 'Rond 4500–5200 rpm; hier ontstaat meestal de hoogste cilinderdruk.')}
          ${slider('boostHighBar', 'Hoogtoerig target', 0, 4.5, .05, t.boostHighBar, ' bar', 2, 'Richting de rev limiter; airflow, as-toerental en EMP bepalen wat overblijft.')}
          <div class="margin-bar ${boostHeadroom < 0 ? 'danger' : boostHeadroom < .25 ? 'warn' : 'good'}"><span>Regelmarge</span><b>${boostHeadroom >= 0 ? '+' : ''}${num(boostHeadroom,2)} bar</b><i style="--margin:${clamp((boostHeadroom + .5) / 1.5 * 100, 0, 100)}%"></i></div>
        </div>
        <div class="card tune-card">
          <div class="card-title"><span>${icon('race')}</span><div><span class="eyebrow">Launch & tractie</span><h2>Boost-by-gear</h2></div></div>
          ${slider('launchRpm', 'Launch rpm', 2200, 8200, 100, t.launchRpm, ' rpm', 0, 'Moet passen bij turbo, koppelomvormer/koppeling, banden en aandrijving.')}
          ${slider('firstGearBoostPct', 'Boost eerste versnelling', 20, 100, 1, t.firstGearBoostPct, '%', 0, 'Beperkt de eerste tractie- en aslastpiek.')}
          ${slider('secondGearBoostPct', 'Boost tweede versnelling', 30, 100, 1, t.secondGearBoostPct, '%', 0, 'Bepaalt hoeveel van de gemeten curve in twee beschikbaar is.')}
          <div class="tune-note"><b>Geen vermogensvoorspelling</b><p>Targets veranderen alleen de ongeteste configuratie. De werkelijke drukcurve, turbo-efficiëntie en het resultaat verschijnen pas tijdens de dynopull.</p></div>
        </div>
      </div>`;
    } else if (tunePanel === 'fuel') {
      // Fuel: the blend's real properties and what the installed hardware can deliver on it.
      const hw = C.engineHardware(state), fp = hw.fuel, E = C.Engine;
      const flexFuel = !!E.DATA.fuelGrades[state.selections.fuel]?.flex;
      const cap = rpm => E.fuelDelivery(hw.fuelSys, { rpm, demandKgS: 1, fuel: fp, railTargetBar: t.railTargetBar, mapBarAbs: 2.8 });
      const capMid = cap(3500), capTop = cap(6500);
      // pk the delivered fuel can feed at a typical full-load brake efficiency of 31 %.
      const pkFor = kgS => kgS * fp.lhvMJkg * 1000 * 0.31 * 1.3596;
      const parts = [hw.fuelSys.hpfp && `HPFP ${E.DATA.pumps[hw.fuelSys.hpfp].ccPerRev.toFixed(2)} cc/omw`, hw.fuelSys.di && `DI ${E.DATA.injectors[hw.fuelSys.di].ccMinAt100Bar} cc/min @100 bar`, hw.fuelSys.mpi && `${hw.fuelSys.mpiCount}× MPI ${E.DATA.injectors[hw.fuelSys.mpi].ccMinAt3Bar} cc/min`, hw.fuelSys.mechanical && 'mechanische pomp', hw.fuelSys.lpfp && `LPFP ${E.DATA.pumps[hw.fuelSys.lpfp].lphAt5Bar} L/u`].filter(Boolean);
      const limitText = { hpfp: 'hogedrukpomp', 'di-window': 'injectievenster', mpi: 'poortinjectoren', lpfp: 'lagedrukpomp', 'mech-pump': 'mechanische pomp' };
      content = `<div class="tune-layout">
        <div class="card tune-card">
          <div class="card-title"><span>${icon('engine')}</span><div><span class="eyebrow">Verbranding</span><h2>Lambda & ontsteking</h2></div></div>
          ${slider('lambda', 'Lambda vollast', .66, .94, .01, t.lambda, ' λ', 2, 'Rijker is niet onbeperkt veiliger; te rijk kost verbrandingsefficiëntie en kan de olie verdunnen.')}
          ${slider('ignitionTrimDeg', 'Ontstekingstrim', -8, 7, .25, t.ignitionTrimDeg, '°', 2, 'Globale correctie bovenop de ontstekingstabel (Tunen → Tabellen).')}
          ${slider('revLimitRpm', 'Rev limiter', 5500, 10500, 100, t.revLimitRpm, ' rpm', 0, 'Met 92,8-mm slag loopt de gemiddelde zuigersnelheid snel op.')}
          <div class="hardware-readout"><span>Brandstof <b>${esc(fuel.name)}</b></span><span>Ontsteking <b>${esc(ignition.name)}</b></span><span>ECU <b>${esc(ecu.name)}</b></span></div>
        </div>
        <div class="card tune-card">
          <div class="card-title"><span>${icon('service')}</span><div><span class="eyebrow">Brandstof</span><h2>${esc(hw.fuelLabel)}${flexFuel ? ` · E${hw.ethanolPct}` : ''}</h2></div></div>
          ${flexFuel ? slider('ethanolPct', 'Ethanolgehalte (flexsensor)', 0, 100, 1, t.ethanolPct ?? 85, '%', 0, 'Pomp-E85 is in de winter vaak E70. Meer ethanol: hogere octaanindex en koeling, maar ~40 % meer brandstofvolume.') : ''}
          <div class="fuel-props">
            <div><span>RON / MON</span><b>${num(fp.ron, 1)} / ${num(fp.mon, 1)}</b></div>
            <div><span>Stoich AFR</span><b>${num(fp.afrSt, 2)}</b></div>
            <div><span>Verbrandingswaarde</span><b>${num(fp.lhvMJkg, 1)} MJ/kg</b></div>
            <div><span>Verdampingswarmte</span><b>${Math.round(fp.hfgKJkg)} kJ/kg</b></div>
          </div>
          ${slider('railTargetBar', 'Raildruktarget', 110, 230, 1, t.railTargetBar, ' bar', 0, 'Hogere druk: meer flow per injector (√Δp), maar de pomp levert minder per slag.')}
          <div class="capacity-panel">
            <div><span>Levering @ 3500 rpm</span><b>${Math.round(capMid.deliveredKgS * 3600)} kg/u · ~${Math.round(pkFor(capMid.deliveredKgS))} pk</b></div>
            <div><span>Levering @ 6500 rpm</span><b>${Math.round(capTop.deliveredKgS * 3600)} kg/u · ~${Math.round(pkFor(capTop.deliveredKgS))} pk</b></div>
            <div><span>Begrenzer midden / top</span><b>${esc(limitText[capMid.limitedBy] || '—')} / ${esc(limitText[capTop.limitedBy] || '—')}</b></div>
            <div><span>Hardware</span><b>${esc(parts.join(' · '))}</b></div>
          </div>
          <div class="notice"><strong>Hardwarecapaciteit, geen vermogensbelofte.</strong> Een nokgedreven HPFP levert per omwenteling een vaste slag: bij lage toeren en veel koppel raakt hij het eerst vol. Direct injection heeft per cyclus maar een beperkt injectievenster: bovenin raken de injectoren vol. De dynolog toont raildruk en duty.</div>
        </div>
      </div>`;
    } else if (tunePanel === 'cams') {
      content = `<div class="tune-layout">
        <div class="card tune-card cam-card ${camPct < 85 ? 'warning' : 'matched'}">
          <div class="cam-score"><div style="--score:${camPct}"><b>${camPct}%</b><span>timingmatch</span></div></div>
          <div class="cam-copy"><span class="eyebrow">Custom Cat Cams</span><h2>Overlap-TDC afstelling</h2><p>Gemeten kleplift op cilinder 1 bij overlap-TDC. Jouw opgegeven doelen zijn uitlaat 0,85 mm en inlaat 0,25 mm.</p></div>
          ${slider('exhaustTdcLiftMm', 'Uitlaatkleplift @ TDC', 0, 1.50, .01, t.exhaustTdcLiftMm, ' mm', 2, 'Mechanisch instellen aan het verstelbare uitlaattandwiel.')}
          ${slider('intakeTdcLiftMm', 'Inlaatkleplift @ TDC', 0, 1.00, .01, t.intakeTdcLiftMm, ' mm', 2, 'Met de VVT-poelie in de gecontroleerde basispositie meten.')}
          <div class="target-row"><span>Uitlaatfout <b>${num(cam.exhaustErrorMm,2)} mm</b></span><span>Inlaatfout <b>${num(cam.intakeErrorMm,2)} mm</b></span></div>
        </div>
        <div class="card tune-card">
          <div class="card-title"><span>${icon('tune')}</span><div><span class="eyebrow">VVT-strategie</span><h2>Inlaatfasering</h2></div></div>
          ${switchRow('vvtEnabled', 'Inlaat-VVT aangesloten', 'Uit schakelen fixeert de basispositie en verandert het bruikbare toerentalgebied.')}
          ${slider('intakeCamAdvanceDeg', 'Gevraagde inlaat-advance', -5, 30, 1, t.intakeCamAdvanceDeg, '°', 0, 'Meer advance helpt vaak onderin maar kan overlap en top-end verslechteren.')}
          <div class="notice ${camPct < 72 ? 'danger' : camPct < 88 ? 'stale' : 'success'}"><strong>${camPct >= 88 ? 'Mechanische basis ligt dicht bij de doeldata.' : 'Timing eerst mechanisch corrigeren.'}</strong> ECU-fasering kan een verkeerde mechanische basisstand niet netjes repareren.</div>
        </div>
      </div>`;
    } else if (tunePanel === 'als') {
      content = renderAntiLagPanel();
    } else if (tunePanel === 'tables') {
      content = `<div class="tune-layout ecu-layout">${renderEcuTable()}</div>`;
    } else {
      content = `<div class="tune-layout">
        <div class="card tune-card">
          <div class="card-title"><span>${icon('service')}</span><div><span class="eyebrow">Motorbeveiliging</span><h2>Failsafes</h2></div></div>
          ${switchRow('knockControl', 'Knock control', 'Cilinderselectieve correctie waar ECU en sensoren dit ondersteunen.')}
          ${switchRow('railPressureCut', 'Raildrukcut', 'Koppel en boost terugnemen wanneer druk of duty instort.')}
          ${switchRow('lambdaProtection', 'Lambdabeveiliging', 'Ingrijpen wanneer de gemeten widebandwaarde van het target afwijkt.')}
          ${switchRow('methFailsafe', 'WMI-failsafe', 'Alleen zinvol met echte flow- of druksensorbewaking.')}
          ${switchRow('oilPressureProtection', 'Oliedrukbeveiliging', 'RPM-afhankelijke minimumdruk met koppelreductie of motorcut.')}
          ${switchRow('overboostCut', 'Overboostcut', 'Beschermt turbo en motor wanneer wastegate of regeling de vraag niet beheerst.')}
          ${switchRow('tractionControl', 'Tractiecontrole (ASR/TC)', 'Neemt koppel terug zodra de aangedreven banden voorbij hun piekslip gaan. Uit: jij en de banden, niets ertussen.')}
        </div>
        <div class="card safety-readout">
          <span class="eyebrow">Controleketen</span><h2>${esc(ecu.name)}</h2>
          <div class="safety-score"><b>${Math.round(ecu.safetyQuality * sensors.sensorQuality * 100)}%</b><span>ECU × sensor authority</span></div>
          <div class="safety-grid">
            <div><span>Sensorpakket</span><b>${esc(sensors.name)}</b></div>
            <div><span>Boostcontrol</span><b>${esc(boostHardware.name)}</b></div>
            <div><span>Brandstof</span><b>${esc(fuelSystem.name)}</b></div>
            <div><span>Ontsteking</span><b>${esc(ignition.name)}</b></div>
          </div>
          <div class="notice stale"><strong>Failsafes zijn een laatste vangnet.</strong> De dyno beoordeelt daarnaast raildruk, lambda, knock, EGT, oliedruk, turbospeed, EMP, BMEP, aeratie en kleppentrein.</div>
        </div>
      </div>`;
    }

    return `<section class="page tune-page">
      <div class="page-title-row"><div><span class="eyebrow">Syvecs-calibratie</span><h1>Map de hardware</h1><p>Stel targets en beveiligingen in zonder vooraf te zien hoeveel vermogen ze opleveren. Alleen de instrumented dynopull onthult de nieuwe curve.</p></div></div>
      ${turbo.compressorMm >= 94 ? `<div class="notice danger"><strong>${turbo.compressorMm}-mm turbo op circa 2,0 liter.</strong> Zonder passende kop, turbine, wastegates, toerental en spool assistance is de bruikbare vermogensband extreem laat en smal.</div>` : ''}
      ${tuneTabs()}
      ${content}
      <div class="sticky-action-card"><div><span>Na elke wijziging</span><b>Benchcheck optioneel, dynometing verplicht.</b></div><button class="btn ghost" data-action="reset-tune">OEM-map</button><button class="btn" data-go="dyno">Naar dyno</button></div>
    </section>`;
  }

  function dynoConfigRange(name, label, min, max, step, value, unit, decimals = 0, hint = '') {
    return slider(name, label, min, max, step, value, unit, decimals, hint, 'dyno-config');
  }

  function dynoChannelTabs() {
    const channels = [['power','PK / Nm'],['spark','Ontsteking'],['air','Lucht'],['map','Turbokaart'],['fuel','Brandstof'],['cyl','Cilinder'],['thermal','Thermisch'],['risk','Risico']];
    return `<div class="dyno-channel-tabs">${channels.map(([id,label]) => `<button class="${dynoChannel === id ? 'active' : ''}" data-dyno-channel="${id}">${label}</button>`).join('')}</div>`;
  }

  function renderDyno() {
    const clean = currentDyno();
    const r = state.lastDyno;
    const active = !!dynoRunning;
    const point = active
      ? dynoRunning.result.samples[0] || null
      : !r?.samples?.length ? null
      : C.isCompletedDyno(r) ? C.interpolateCurve(r.samples, r.peakHpRpm)
      : r.samples[r.samples.length - 1];
    const bench = C.benchConfidence(state);
    const previous = state.dynoRuns?.[1] || null;
    const cfg = state.dynoConfig;

    return `<section class="page dyno-page">
      <div class="page-title-row"><div><span class="eyebrow">Instrumented engine dyno</span><h1>Meet, log en diagnoseer</h1><p>Ramp rate, luchtcondities en koeling beïnvloeden de meting. De nieuwe curve wordt pas zichtbaar wanneer de pull werkelijk loopt.</p></div></div>
      ${!clean ? staleNotice()
        : C.isCompletedDyno(r) ? '<div class="notice success"><strong>Curve is geldig.</strong> Hardware, montage, tune, olie en dynocondities komen overeen met deze meting.</div>'
        : `<div class="notice danger"><strong>Geen geldige meting.</strong> De laatste pull is ${r.status === C.DYNO_STATUS.FAILED_TO_START ? 'niet gestart' : `afgebroken @ ${r.abortRpm} rpm`}. Alleen partiële telemetrie is beschikbaar; de dragstrip blijft gesloten tot een volledige pull.</div>`}

      <div class="dyno-preflight">
        <div class="preflight-card ${bench.failed ? 'danger' : bench.complete ? 'good' : 'warn'}"><span>BENCH CONFIDENCE</span><b>${bench.score || 0}/100</b><small>${bench.current}/${bench.total} actueel · ${bench.failed} fail</small></div>
        <div class="preflight-card"><span>RAMP RATE</span><b>${Math.round(cfg.rampRpmPerSec)} rpm/s</b><small>${cfg.rampRpmPerSec < 400 ? 'langzame heat-soak pull' : cfg.rampRpmPerSec > 800 ? 'snelle inertial pull' : 'gebalanceerde pull'}</small></div>
        <div class="preflight-card"><span>CORRECTIECONDITIE</span><b>${num(cfg.ambientTempC,0)}°C · ${num(cfg.baroKpa,1)} kPa</b><small>fan ${Math.round(cfg.fanSpeedPct)}%</small></div>
      </div>

      <div class="card dyno-config-card">
        <div class="section-head small"><div><span class="eyebrow">Testcelconfiguratie</span><h3>Condities vóór de pull</h3></div><button class="text-button" data-go="build">Benchtests ${icon('chevron')}</button></div>
        <div class="dyno-config-grid">
          ${dynoConfigRange('rampRpmPerSec','Ramp rate',250,1000,25,cfg.rampRpmPerSec,' rpm/s',0,'Langzamer geeft meer thermische belasting; sneller kan spool maskeren.')}
          ${dynoConfigRange('fanSpeedPct','Testcelfan',25,100,1,cfg.fanSpeedPct,'%',0,'Beïnvloedt intercooler- en radiatorluchtstroom.')}
          ${dynoConfigRange('ambientTempC','Omgevingstemperatuur',0,45,1,cfg.ambientTempC,'°C',0,'Werkelijke inlaatlucht start bij deze conditie.')}
          ${dynoConfigRange('baroKpa','Barometrische druk',82,104,.1,cfg.baroKpa,' kPa',1,'Luchtdichtheid en compressorbelasting reageren op hoogte en weer.')}
          ${dynoConfigRange('humidityPct','Luchtvochtigheid',0,100,1,cfg.humidityPct ?? 50,'%',0,'Waterdamp verdringt zuurstof: alleen droge lucht verbrandt brandstof.')}
          ${dynoConfigRange('gear','Dynoversnelling',1,6,1,cfg.gear ?? 4,'e',0,'Chassisdyno in deze versnelling; de boosttabel van deze versnelling geldt.')}
        </div>
        <div class="dyno-correction"><span>Correctienorm</span><div class="segment-control">${Object.entries(C.DYNO_CORRECTIONS).map(([k, c]) => `<button class="${(cfg.correction || 'din70020') === k ? 'active' : ''}" data-dyno-correction="${k}">${esc(c.short)}</button>`).join('')}</div>
          <small>${esc(C.DYNO_CORRECTIONS[cfg.correction || 'din70020'].label)} · factor ${num(C.correctionFactor(cfg.correction || 'din70020', cfg.ambientTempC, cfg.baroKpa, cfg.humidityPct ?? 50), 3)} bij deze condities${C.dynoSoakAt(state) > 0.5 ? ` · heat soak +${num(C.dynoSoakAt(state), 1)} °C inlaat (laat de fan draaien)` : ''}</small></div>
      </div>

      <div class="dyno-console ${active ? 'running' : ''}">
        <div class="dyno-engine-panel">
          ${engineVisual({ compact: true, mode: 'dyno', labels: false, running: active, view: engineView })}
          <div class="dyno-watermark">MOTORENTESTBANK · CAWB · ${esc(engineView.toUpperCase())}</div>
        </div>
        <div class="live-gauges v4-live-gauges">
          <div><span>RPM</span><b id="live-rpm">${point ? Math.round(point.rpm) : 1500}</b></div>
          <div><span>BOOST</span><b id="live-boost">${point ? num(point.boostBar,2) : '0.00'}<small> bar</small></b></div>
          <div><span>VERMOGEN</span><b id="live-hp">${point ? Math.round(point.hp) : '—'}<small> pk</small></b></div>
          <div><span>EGT</span><b id="live-egt">${point ? Math.round(point.egtC) : '—'}<small> °C</small></b></div>
          <div><span>OLIEDRUK</span><b id="live-oil">${point ? num(point.oilPressureBar,1) : '—'}<small> bar</small></b></div>
          <div><span>RAIL</span><b id="live-rail">${point ? Math.round(point.railBar) : '—'}<small> bar</small></b></div>
        </div>
        ${dynoChannelTabs()}
        <div class="dyno-chart-wrap"><canvas id="dyno-chart" aria-label="Dynografiek voor geselecteerde datakanalen; tik voor de waarden bij een toerental"></canvas></div>
        <div class="log-actions"><small>Tik op de grafiek voor alle kanalen bij dat toerental.</small><button class="btn ghost small" data-action="export-dyno-log" ${state.lastDyno?.samples?.length ? '' : 'disabled'}>Datalog (CSV)</button></div>
        <div class="dyno-progress"><i id="dyno-progress"></i><span id="dyno-live-status">${active ? 'PULL START' : !clean ? 'WACHT OP NIEUWE PULL' : C.isCompletedDyno(r) ? 'LAATSTE VOLLEDIGE PULL' : r.status === C.DYNO_STATUS.FAILED_TO_START ? 'PULL NIET GESTART' : `AFGEBROKEN @ ${r.abortRpm} RPM · PARTIËLE DATA`}</span></div>
      </div>

      <div class="dyno-action-row">
        <button class="btn dyno-start ${active ? 'running' : ''}" data-action="start-dyno" ${active ? 'disabled' : ''}><span>${icon('chart')}</span>${active ? 'DYNO LOOPT…' : 'START VOLLEDIGE DYNO PULL'}</button>
        ${active ? '<button class="btn danger" data-action="abort-dyno">PULL AFBREKEN</button>' : previous ? `<button class="btn ghost" data-action="toggle-compare">Vergelijking: ${state.settings?.dynoCompare === false ? 'uit' : 'aan'}</button>` : ''}
      </div>

      ${renderDynoCompare()}
      ${r ? renderDynoResult(r, clean) : '<div class="card empty-card">Nog geen dynometing opgeslagen.</div>'}
      ${renderDynoHistory()}
    </section>`;
  }

  function scoreBadge(r) {
    const score = r ? r.reliabilityScore : null;
    if (!Number.isFinite(score)) return '<div class="score-badge none" title="Geen betrouwbaarheidsscore: de pull is niet voltooid"><b>—</b><span>n.v.t.</span></div>';
    return `<div class="score-badge ${score >= 82 ? 'good' : score >= 65 ? 'warn' : 'danger'}"><b>${score}</b><span>/100</span></div>`;
  }

  function renderDynoResult(r, clean) {
    const warnings = (r.warnings || []).map(w => `<div class="warning-item ${w.severity === 'danger' ? 'danger' : ''}"><span>!</span><p>${esc(w.text || w)}</p></div>`).join('');
    const cam = r.camTiming || C.camTimingHealth(state);
    const diagnostics = C.diagnoseDyno(r);
    const bench = r.benchConfidence || C.benchConfidence(state);
    const completed = C.isCompletedDyno(r);
    const failedStart = r.status === C.DYNO_STATUS.FAILED_TO_START;
    const peakLabel = completed ? 'Piek' : 'Hoogst waargenomen';
    const at = rpm => (Number.isFinite(rpm) ? `@ ${rpm} rpm` : 'onvoldoende data');
    const eyebrow = !clean ? 'Historische configuratie' : completed ? 'Gemeten resultaat' : failedStart ? 'Geen meting' : 'Partiële meting';
    return `<div class="result-card v4-result-card ${completed ? '' : 'failed partial'} ${!clean ? 'old' : ''}" data-dyno-status="${esc(r.status)}">
      <div class="result-head"><div><span class="eyebrow">${eyebrow}</span><h2>${esc(dynoHeadline(r))}</h2><p>${esc(r.rating || '')}${completed ? '' : ` · ${esc(dynoScopeLabel(r))}`}</p></div>${scoreBadge(r)}</div>
      ${completed ? '' : `<div class="notice danger dyno-abort-notice"><strong>${failedStart ? 'Pull niet gestart.' : `Afgebroken @ ${r.abortRpm} rpm${r.abortKind === 'operator' ? ' (handmatig)' : ''}.`}</strong> ${esc(r.abortReason)} ${failedStart ? '' : `Waarden hieronder zijn alleen waargenomen tot ${r.abortRpm} rpm en zijn geen volledige meting. Er is geen betrouwbaarheidsscore.`}</div>`}
      ${r.legacyMigrated && !completed ? '<div class="notice stale"><strong>Oude meting gecorrigeerd.</strong> Data boven het afbreekpunt uit een eerdere versie is verwijderd.</div>' : ''}
      <div class="result-metrics v4-result-metrics">
        <div><span>${peakLabel} vermogen</span><b>${dynoMetricText(r, 'peakHp', ' pk')}</b><small>${at(r.peakHpRpm)}</small></div>
        <div><span>${peakLabel} koppel</span><b>${dynoMetricText(r, 'peakTorqueNm', ' Nm')}</b><small>${at(r.peakTorqueRpm)}</small></div>
        <div><span>Wielvermogen</span><b>${Number.isFinite(r.peakWheelHp) ? `${Math.round(r.peakWheelHp)} pk` : '—'}</b><small>${r.correction ? `${esc(r.correction.label)} · CF ${num(r.correction.factor, 3)}` : 'ongecorrigeerd'}</small></div>
        <div><span>Airflow</span><b>${r.samples?.length ? num(Math.max(...r.samples.map(p => p.airflowLbMin || 0)), 1) : '—'} lb/min</b><small>${num(r.airDensityKgM3,3)} kg/m³${r.soakK > 0.5 ? ` · soak +${num(r.soakK, 1)} °C` : ''}</small></div>
        <div><span>Turbo-as</span><b>${Number.isFinite(r.maxTurboShaftRpm) ? `${Math.round(r.maxTurboShaftRpm/1000)}k` : '—'} rpm</b><small>${mnum(r.maxEmpBar,2)} bar max EMP</small></div>
        <div><span>Fuel duty</span><b>${mnum(r.maxFuelDuty,0)}%</b><small>${mnum(r.maxIatC,0)}°C max IAT</small></div>
        <div><span>Bench confidence</span><b>${bench.score || 0}/100</b><small>${bench.current}/${bench.total} test(s) vóór de pull</small></div>
      </div>
      <div class="technical-grid">
        <div><span>${completed ? 'Zwakste schakel' : 'Oorzaak'}</span><b>${esc(r.bottleneck)}</b></div>
        <div><span>Motor</span><b>${num(r.displacementCc,0)} cc · ${num(r.boreMm,2)} × ${num(r.strokeMm,1)} · ${num(r.compressionRatio,1)}:1</b></div>
        <div><span>Nokkenmatch</span><b>${Math.round((cam.score || 1)*100)}% · fout ${num(cam.exhaustErrorMm,2)} / ${num(cam.intakeErrorMm,2)} mm</b></div>
        <div><span>Mechanisch</span><b>${mnum(r.maxBmepBar,1)} bar BMEP · ${mnum(r.maxMeanPistonSpeed,1)} m/s zuigersnelheid</b></div>
        <div><span>Thermisch</span><b>EGT ${mnum(r.maxEgtC,0)}°C · olie ${mnum(r.maxOilTempC,0)}°C</b></div>
        <div><span>Oliesysteem</span><b>min ${mnum(r.minOilPressureBar,1)} bar · aeratie ${mnum(r.maxOilAerationPct,0)}%</b></div>
        ${r.wear ? `<div><span>Slijtage van deze pull</span><b>motor +${num(r.wear.engine,2)}% · turbo +${num(r.wear.turbo,2)}% · ${num(r.wear.durationS,1)} s belast${r.damage && (r.damage.engine || r.damage.turbo) ? ` · schade motor +${num(r.damage.engine,0)}% / turbo +${num(r.damage.turbo,0)}%` : ''}</b></div>` : ''}
      </div>
      <div class="section-head small diagnostic-title"><div><span class="eyebrow">Automatische diagnose</span><h3>${completed ? 'Wat begrenst deze combinatie?' : 'Waarom stopte de pull?'}</h3></div></div>
      <div class="diagnostic-grid">${diagnostics.map(d => `<article class="diagnostic-card ${d.severity}"><span>${esc(d.system)}</span><b>${esc(d.observation)}</b><p>${esc(d.action)}</p></article>`).join('')}</div>
      ${warnings ? `<div class="warning-list">${warnings}</div>` : completed ? '<div class="notice success"><strong>Geen extra hoofdwaarschuwingen.</strong> De run bleef binnen de gemodelleerde systeemgrenzen.</div>' : ''}
    </div>`;
  }

  function compareOn() { return state.settings?.dynoCompare !== false; }
  function compareRun() {
    const runs = state.dynoRuns || [];
    if (!compareOn() || runs.length < 2) return null;
    if (!runs[dynoCompareIndex]) dynoCompareIndex = 1;
    return runs[dynoCompareIndex] || null;
  }
  // A/B: differences only where BOTH runs actually measured (an aborted run has no data above its abort rpm).
  function dynoDelta(a, b) {
    if (!a?.samples?.length || !b?.samples?.length) return null;
    const lo = Math.max(a.samples[0].rpm, b.samples[0].rpm), hi = Math.min(a.samples.at(-1).rpm, b.samples.at(-1).rpm);
    if (hi - lo < 500) return null;
    const rows = [];
    const stepRpm = hi - lo > 4000 ? 1000 : 500;
    for (let rpm = Math.ceil(lo / stepRpm) * stepRpm; rpm <= hi; rpm += stepRpm) {
      const pa = C.interpolateCurve(a.samples, rpm), pb = C.interpolateCurve(b.samples, rpm);
      rows.push({ rpm, hpA: pa.hp, hpB: pb.hp, nmA: pa.torqueNm, nmB: pb.torqueNm, boostA: pa.boostBar, boostB: pb.boostBar });
    }
    const peak = (r, key) => r.samples.reduce((m, p) => p.rpm >= lo && p.rpm <= hi ? Math.max(m, p[key]) : m, 0);
    return { lo, hi, rows, hpA: peak(a, 'hp'), hpB: peak(b, 'hp'), nmA: peak(a, 'torqueNm'), nmB: peak(b, 'torqueNm') };
  }
  function renderDynoCompare() {
    const a = compareRun(), b = state.lastDyno;
    if (!a || !b || dynoRunning) return '';
    const d = dynoDelta(a, b);
    const idx = dynoCompareIndex + 1;
    const sign = v => { const r = Math.round(v); return r === 0 ? '0' : `${r > 0 ? '+' : '−'}${Math.abs(r)}`; };
    const signBar = v => { const r = Math.round(v * 100) / 100; return r === 0 ? '0.00' : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}`; };
    const cls = v => Math.abs(v) < .5 ? '' : v > 0 ? 'up' : 'down';
    const cfgA = a.dynoConfig || {}, cfgB = b.dynoConfig || {};
    const sameCell = Math.abs((cfgA.ambientTempC ?? 0) - (cfgB.ambientTempC ?? 0)) < .5 && Math.abs((cfgA.baroKpa ?? 0) - (cfgB.baroKpa ?? 0)) < .2 && Math.abs((cfgA.rampRpmPerSec ?? 0) - (cfgB.rampRpmPerSec ?? 0)) < 1;
    if (!d) return `<div class="card ab-card"><div class="section-head small"><div><span class="eyebrow">A/B-vergelijking</span><h3>Run ${String(idx).padStart(2, '0')} → actuele run</h3></div></div><p class="why">Te weinig gemeenschappelijk gemeten toerenbereik om te vergelijken.</p></div>`;
    return `<div class="card ab-card">
      <div class="section-head small"><div><span class="eyebrow">A/B-vergelijking</span><h3>Run ${String(idx).padStart(2, '0')} (A) → actuele run (B)</h3></div><button class="text-button" data-action="toggle-compare">Uit</button></div>
      <div class="ab-peaks">
        <div><span>Piekvermogen</span><b class="${cls(d.hpB - d.hpA)}">${sign(d.hpB - d.hpA)} pk</b><small>${Math.round(d.hpA)} → ${Math.round(d.hpB)} pk</small></div>
        <div><span>Piekkoppel</span><b class="${cls(d.nmB - d.nmA)}">${sign(d.nmB - d.nmA)} Nm</b><small>${Math.round(d.nmA)} → ${Math.round(d.nmB)} Nm</small></div>
      </div>
      <div class="ab-table" role="table" aria-label="Verschil per toerental">
        <div class="ab-row head" role="row"><span>rpm</span><span>ΔPK</span><span>ΔNm</span><span>Δboost</span></div>
        ${d.rows.map(r => `<div class="ab-row" role="row"><span>${r.rpm}</span><span class="${cls(r.hpB - r.hpA)}">${sign(r.hpB - r.hpA)}</span><span class="${cls(r.nmB - r.nmA)}">${sign(r.nmB - r.nmA)}</span><span>${signBar(r.boostB - r.boostA)}</span></div>`).join('')}
      </div>
      <p class="why">Vergeleken tussen ${d.lo} en ${d.hi} rpm: het bereik dat beide runs echt gemeten hebben.${sameCell ? '' : ' Let op: andere testcelcondities (temperatuur, luchtdruk of ramp rate) tussen A en B.'}</p>
    </div>`;
  }

  function renderDynoHistory() {
    const runs = Array.isArray(state.dynoRuns) ? state.dynoRuns.slice(0, 8) : [];
    if (!runs.length) return '';
    const summary = r => C.isCompletedDyno(r)
      ? `${Math.round(r.peakHp)} pk<br><small>${Math.round(r.peakTorqueNm)} Nm · ${r.reliabilityScore}/100</small>`
      : `${dynoMetricText(r, 'peakHp', ' pk')}<br><small>${r.status === C.DYNO_STATUS.FAILED_TO_START ? 'niet gestart' : `partieel t/m ${r.abortRpm} rpm`}</small>`;
    return `<div class="card history-card"><div class="section-head small"><div><span class="eyebrow">Dynohistorie</span><h3>Laatste runs</h3></div><span class="history-hint">run 01 = B (actueel) · kies een run als A · * = partieel</span></div>
      <div class="run-table">${runs.map((r, i) => `<div class="run-row ${i === 0 ? 'current' : ''} ${C.isCompletedDyno(r) ? '' : 'partial'}"><span>${String(i + 1).padStart(2,'0')}</span><div><b>${esc(r.label || 'Dynopull')}</b><small>${new Date(r.measuredAt || Date.now()).toLocaleString('nl-NL')} · ${r.dynoConfig ? `${Math.round(r.dynoConfig.rampRpmPerSec)} rpm/s · ${Math.round(r.dynoConfig.ambientTempC)}°C` : 'oude meting'}</small></div><strong>${summary(r)}</strong>${i === 0 ? '<em class="ab-tag b">B</em>' : `<button class="ab-pick ${i === dynoCompareIndex && compareOn() ? 'active' : ''}" data-compare-run="${i}" aria-pressed="${i === dynoCompareIndex && compareOn()}">${i === dynoCompareIndex && compareOn() ? 'A' : 'Vergelijk'}</button>`}</div>`).join('')}</div>
    </div>`;
  }

  function chartSeries(channel) {
    const defs = {
      power: [
        { key:'hp', label:'PK', color:'#ffad17', unit:'pk' },
        { key:'torqueNm', label:'NM', color:'#36b8ff', unit:'Nm' },
        { key:'wheelHp', label:'WIEL-PK', color:'#b98cff', unit:'pk' }
      ],
      // Spark log: what the table asked, what the ECU fired after knock control, and the physical limits.
      spark: [
        { key:'sparkCmdDeg', label:'TABEL', color:'#8290a4', unit:'°' },
        { key:'sparkDeg', label:'ONTSTEKING', color:'#ffad17', unit:'°' },
        { key:'mbtDeg', label:'MBT', color:'#48db9c', unit:'°' },
        { key:'knockRetardDeg', label:'KNOCKRETARD', color:'#ff5365', unit:'°' }
      ],
      cyl: [
        { key:'pMaxBar', label:'PMAX', color:'#ff654d', unit:'bar' },
        { key:'bmepBar', label:'BMEP', color:'#ffad17', unit:'bar' },
        { key:'volumetricEff', label:'VE', color:'#36b8ff', unit:'' },
        { key:'ca50Deg', label:'CA50', color:'#b98cff', unit:'°' }
      ],
      air: [
        { key:'boostBar', label:'BOOST', color:'#36b8ff', unit:'bar' },
        { key:'empBar', label:'EMP', color:'#ff775a', unit:'bar' },
        { key:'spoolPct', label:'SPOOL', color:'#b98cff', unit:'%' },
        { key:'shaftSpeedPct', label:'AS', color:'#48db9c', unit:'%' }
      ],
      fuel: [
        { key:'fuelDutyPct', label:'DUTY', color:'#ffad17', unit:'%' },
        { key:'railBar', label:'RAIL', color:'#36b8ff', unit:'bar' },
        { key:'lambda', label:'LAMBDA', color:'#48db9c', unit:'λ' },
        { key:'lambdaTarget', label:'λ-DOEL', color:'#2b7a58', unit:'λ' }
      ],
      thermal: [
        { key:'egtC', label:'EGT', color:'#ff654d', unit:'°C' },
        { key:'iatC', label:'IAT', color:'#36b8ff', unit:'°C' },
        { key:'oilTempC', label:'OLIE', color:'#ffad17', unit:'°C' }
      ],
      risk: [
        { key:'turboLoadPct', label:'TURBO', color:'#b98cff', unit:'%' },
        { key:'knockRisk', label:'KNOCK', color:'#ff5365', unit:'idx' },
        { key:'oilFilmRisk', label:'OLIEFILM', color:'#ffad17', unit:'idx' },
        { key:'oilAerationPct', label:'AERATIE', color:'#36b8ff', unit:'%' }
      ]
    };
    return defs[channel] || defs.power;
  }

  function turboMapProvenance(turboId) {
    const d = window.EA888Turbo?.DATA?.turbos?.[turboId];
    if (!d) return '';
    const vendor = d.mapType !== 'modeled';
    return `<div class="map-provenance ${vendor ? 'vendor' : 'modeled'}"><b>${vendor ? 'FABRIEKSKAART' : 'GEMODELLEERDE KAART'}</b><span>${vendor ? `${esc(d.name)} · gedigitaliseerd uit de gepubliceerde compressor- en turbinekaart` : 'Geen betrouwbare publieke kaart: benadering, geen fabrieksdata'} · max as ${Math.round(d.maxShaftRpm / 1000)}k rpm · max η ${Math.round(d.peakEfficiency * 100)}%</span></div>`;
  }

  // Compressor map with the pull's operating line (only the samples revealed so far).
  function drawCompressorMap(canvas, result, progress = 1, faded = false) {
    const T = window.EA888Turbo;
    const d = T?.DATA?.turbos?.[result.turboId];
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, rect.width || 360);
    const height = width < 450 ? 300 : 340;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0b1119'; ctx.fillRect(0, 0, width, height);
    if (!d) { ctx.fillStyle = '#8290a4'; ctx.font = '700 12px system-ui,sans-serif'; ctx.fillText('Geen turbokaart voor deze meting', 16, 30); return; }
    const pad = { l: 40, r: 12, t: 40, b: 30 }, plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
    const samples = (result.samples || []).slice(0, Math.max(1, Math.round(1 + ((result.samples || []).length - 1) * clamp(progress, 0, 1))));
    const wMax = Math.max(...d.chokeLine.map(p => p[0]), ...samples.map(p => p.correctedFlowLbMin || 0)) * 1.08;
    const prMax = Math.max(...d.surgeLine.map(p => p[1]), ...d.chokeLine.map(p => p[1]), ...samples.map(p => p.compressorPr || 1)) * 1.05;
    const X = w => pad.l + (w / wMax) * plotW, Y = pr => pad.t + plotH - ((pr - 1) / (prMax - 1)) * plotH;
    ctx.strokeStyle = '#1f2a37'; ctx.lineWidth = 1; ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#728094';
    const wStep = wMax > 150 ? 50 : wMax > 60 ? 20 : 10;
    for (let w = 0; w <= wMax; w += wStep) { ctx.beginPath(); ctx.moveTo(X(w), pad.t); ctx.lineTo(X(w), pad.t + plotH); ctx.stroke(); ctx.fillText(String(w), X(w) - 6, height - 12); }
    for (let pr = 1; pr <= prMax; pr += 0.5) { ctx.beginPath(); ctx.moveTo(pad.l, Y(pr)); ctx.lineTo(width - pad.r, Y(pr)); ctx.stroke(); ctx.fillText(pr.toFixed(1), 6, Y(pr) + 3); }
    ctx.fillText('lb/min gecorrigeerd', width - pad.r - 112, pad.t + plotH - 6);
    const poly = (pts, close) => { ctx.beginPath(); pts.forEach(([w, pr], i) => (i ? ctx.lineTo(X(w), Y(pr)) : ctx.moveTo(X(w), Y(pr)))); if (close) ctx.closePath(); };
    ctx.globalAlpha = faded ? 0.4 : 1;
    d.efficiencyIslands.slice().sort((a, b) => a.efficiency - b.efficiency).forEach((isl, i, all) => {
      poly(isl.polygon, true); ctx.fillStyle = `rgba(72,219,156,${0.05 + (0.1 * i) / Math.max(1, all.length - 1)})`; ctx.fill();
      ctx.strokeStyle = 'rgba(72,219,156,.55)'; ctx.stroke();
    });
    ctx.strokeStyle = '#3c4a5c'; ctx.lineWidth = 1;
    d.speedLines.forEach(l => { poly(l.points); ctx.stroke(); const e = l.points[l.points.length - 1]; ctx.fillStyle = '#5d6b7e'; ctx.fillText(`${Math.round(l.rpm / 1000)}k`, X(e[0]) + 3, Y(e[1]) + 3); });
    ctx.lineWidth = 2; ctx.strokeStyle = '#ff5365'; poly(d.surgeLine); ctx.stroke();
    ctx.strokeStyle = '#ffad17'; poly(d.chokeLine); ctx.stroke();
    // operating line
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#36b8ff'; ctx.beginPath();
    samples.forEach((p, i) => (i ? ctx.lineTo(X(p.correctedFlowLbMin), Y(p.compressorPr)) : ctx.moveTo(X(p.correctedFlowLbMin), Y(p.compressorPr)))); ctx.stroke();
    samples.forEach((p, i) => {
      const warn = p.surge || p.chokeMarginPct < 3 || p.shaftSpeedPct > 97;
      if (!warn && i % 5 && i !== samples.length - 1) return;
      ctx.fillStyle = p.surge ? '#ff5365' : warn ? '#ffad17' : '#36b8ff';
      ctx.beginPath(); ctx.arc(X(p.correctedFlowLbMin), Y(p.compressorPr), warn ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    });
    const last = samples[samples.length - 1];
    if (last && Number.isFinite(last.correctedFlowLbMin)) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(last.correctedFlowLbMin), Y(last.compressorPr), 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = '800 10px system-ui,sans-serif';
    ctx.fillStyle = '#ff5365'; ctx.fillText('SURGE', pad.l + 4, 16);
    ctx.fillStyle = '#ffad17'; ctx.fillText('CHOKE / MAX AS', pad.l + 52, 16);
    ctx.fillStyle = '#48db9c'; ctx.fillText('η-EILANDEN', pad.l + 150, 16);
    ctx.fillStyle = '#36b8ff'; ctx.fillText('WERKLIJN', pad.l + 222, 16);
    ctx.fillStyle = d.mapType === 'modeled' ? '#b98cff' : '#48db9c'; ctx.font = '700 9px system-ui,sans-serif';
    ctx.fillText(d.mapType === 'modeled' ? `${d.name} · GEMODELLEERDE KAART` : `${d.name} · FABRIEKSKAART (gedigitaliseerd)`, pad.l + 4, 31);
    if (last && Number.isFinite(last.compressorEff)) {
      ctx.fillStyle = '#dfe6ee'; ctx.font = '800 10px system-ui,sans-serif';
      const txt = `${last.rpm} rpm · PR ${last.compressorPr.toFixed(2)} · η ${Math.round(last.compressorEff * 100)}% · as ${Math.round(last.turboShaftRpm / 1000)}k · ${last.boostLimitedBy}`;
      ctx.fillText(txt, Math.max(pad.l, width - pad.r - ctx.measureText(txt).width), pad.t + 12);
    }
  }

  // progress = fraction of the result's own samples to draw. The axis always
  // spans the planned pull; scales use only the samples drawn so far, so a live
  // pull never reveals values it has not reached yet.
  function drawDynoChart(canvas, result, progress = 1, faded = false, channel = dynoChannel, comparison = null) {
    if (!canvas || !result) return;
    if (channel === 'map') return drawCompressorMap(canvas, result, progress, faded);
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, rect.width || 360);
    const height = width < 450 ? 270 : 320;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const pad = { l: 45, r: 15, t: 46, b: 31 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const samples = Array.isArray(result.samples) ? result.samples : [];
    const limit = samples.length ? Math.max(1, Math.round(1 + (samples.length - 1) * clamp(progress, 0, 1))) : 0;
    const visible = samples.slice(0, limit);
    const rpmMin = Number(result.startRpm) || samples[0]?.rpm || 1500;
    const rpmMax = Math.max(rpmMin + 500, Number(result.targetRpm) || samples[samples.length - 1]?.rpm || 8000);
    const x = rpm => pad.l + (rpm - rpmMin) / Math.max(1, rpmMax - rpmMin) * plotW;
    const defs = chartSeries(channel);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#101722'); bg.addColorStop(1, '#06090e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    const vignette = ctx.createRadialGradient(width*.55,height*.35,10,width*.55,height*.35,width*.7);
    vignette.addColorStop(0,'rgba(50,113,171,.08)'); vignette.addColorStop(1,'rgba(0,0,0,.35)'); ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);

    ctx.strokeStyle = '#24303d'; ctx.lineWidth = 1; ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#728094';
    for (let i=0;i<=4;i++) { const yy = pad.t + plotH - i/4*plotH; ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(width-pad.r,yy);ctx.stroke();ctx.fillText(`${i*25}%`,4,yy+3); }
    for (let rpm = Math.ceil(rpmMin / 1000) * 1000; rpm <= rpmMax; rpm += 1000) { const xx=x(rpm);ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,pad.t+plotH);ctx.stroke();ctx.fillText(`${rpm/1000}k`,xx-8,height-9); }

    if (!visible.length) {
      ctx.fillStyle = '#ff5365'; ctx.font = '800 13px system-ui,sans-serif';
      ctx.fillText(result.status === C.DYNO_STATUS.FAILED_TO_START ? 'PULL NIET GESTART · GEEN DATA' : 'GEEN DATA', pad.l + 10, pad.t + plotH / 2);
      return;
    }

    const extents = {};
    defs.forEach(def => {
      const vals = visible.map(p => Number(p[def.key])).filter(Number.isFinite);
      let min = Math.min(...vals), max = Math.max(...vals);
      if (def.key === 'hp' || def.key === 'torqueNm' || def.key === 'wheelHp') { min = 0; max = Math.max(100, Math.ceil(Math.max(...visible.map(p => Math.max(p.hp || 0, p.torqueNm || 0)))/100)*100); }
      else if (['sparkCmdDeg', 'sparkDeg', 'mbtDeg'].includes(def.key)) { min = -10; max = Math.max(40, Math.ceil(Math.max(...visible.map(p => Math.max(p.mbtDeg || 0, p.sparkCmdDeg || 0))) / 5) * 5); }
      else if (def.key === 'knockRetardDeg') { min = 0; max = 15; }
      else if (def.key === 'pMaxBar' || def.key === 'bmepBar') { min = 0; max = Math.max(60, Math.ceil(Math.max(...visible.map(p => p.pMaxBar || 0)) / 20) * 20); }
      else if (def.key === 'volumetricEff') { min = 0.5; max = 1.2; }
      else if (def.key === 'ca50Deg') { min = 0; max = 40; }
      else if (def.key === 'lambdaTarget') { min = .65; max = 1.0; }
      else if (def.key === 'boostBar' || def.key === 'empBar') { min=0; max=Math.max(1,Math.ceil(Math.max(...visible.map(p=>Math.max(p.boostBar||0,p.empBar||0)))*2)/2); }
      else if (def.key === 'railBar') { min=0; max=Math.max(200,Math.ceil(max/25)*25); }
      else if (def.key === 'fuelDutyPct' || def.key === 'turboLoadPct' || def.key === 'spoolPct' || def.key === 'shaftSpeedPct' || def.key === 'oilAerationPct') { min=0; max=Math.max(100,Math.ceil(max/25)*25); }
      else if (def.key === 'lambda') { min=.65; max=1.0; }
      else if (def.key === 'egtC') { min=500; max=Math.max(1000,Math.ceil(max/100)*100); }
      else if (def.key === 'iatC') { min=0; max=Math.max(80,Math.ceil(max/20)*20); }
      else if (def.key === 'oilTempC') { min=60; max=Math.max(160,Math.ceil(max/20)*20); }
      else if (def.key === 'knockRisk' || def.key === 'oilFilmRisk') { min=0; max=Math.max(1.5,Math.ceil(max*4)/4); }
      if (!(max>min)) max=min+1;
      extents[def.key]={min,max};
    });
    const yFor=(def,v)=>{const ex=extents[def.key];return pad.t+plotH-clamp((Number(v)-ex.min)/(ex.max-ex.min),0,1)*plotH;};

    const drawRun=(run,alpha=.25,dashed=true)=>{
      if(!run?.samples?.length)return;
      ctx.save();ctx.globalAlpha=alpha;if(dashed)ctx.setLineDash([6,6]);
      defs.forEach(def=>{ctx.beginPath();run.samples.forEach((p,i)=>{const xx=x(p.rpm),yy=yFor(def,p[def.key]);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});ctx.strokeStyle=def.color;ctx.lineWidth=1.6;ctx.stroke();});ctx.restore();
    };
    const showComparison = !!(comparison?.samples?.length && state.settings?.dynoCompare !== false && progress >= 1);
    if (showComparison) drawRun(comparison,.22,true);

    defs.forEach(def => {
      ctx.beginPath(); visible.forEach((p,i)=>{const xx=x(p.rpm),yy=yFor(def,p[def.key]);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});
      ctx.globalAlpha=faded?.30:.16;ctx.strokeStyle=def.color;ctx.lineWidth=9;ctx.stroke();
      ctx.globalAlpha=faded?.38:1;ctx.strokeStyle=def.color;ctx.lineWidth=2.7;ctx.stroke();ctx.globalAlpha=1;
    });

    // Abort point: telemetry ends here; the rest of the planned pull was never run.
    if (result.status === C.DYNO_STATUS.ABORTED && progress >= 1 && Number.isFinite(result.abortRpm)) {
      const ax = x(result.abortRpm);
      ctx.save();
      ctx.fillStyle = 'rgba(255,60,80,.10)'; ctx.fillRect(ax, pad.t, width - pad.r - ax, plotH);
      ctx.strokeStyle = '#ff3c50'; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ax, pad.t); ctx.lineTo(ax, pad.t + plotH); ctx.stroke();
      ctx.fillStyle = '#ff3c50'; ctx.beginPath(); ctx.arc(ax, pad.t + 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.font = '800 10px system-ui,sans-serif';
      const text = `ABORT ${result.abortRpm} RPM`;
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, Math.min(ax + 6, width - pad.r - tw - 2), pad.t + 16);
      ctx.fillStyle = 'rgba(255,120,130,.7)'; ctx.font = '700 9px system-ui,sans-serif';
      if (width - pad.r - ax > 70) ctx.fillText('NIET GEMETEN', ax + 6, pad.t + plotH - 8);
      ctx.restore();
    }

    let lx=pad.l; ctx.font='800 10px system-ui,sans-serif';
    defs.forEach(def=>{const vals=visible.map(p=>Number(p[def.key])).filter(Number.isFinite);const last=vals[vals.length-1]||0;ctx.fillStyle=def.color;const precision=Math.abs(last)<10?2:0;const text=`${def.label} ${last.toFixed(precision)} ${def.unit}`;ctx.fillText(text,lx,22);lx+=ctx.measureText(text).width+14;});
    ctx.fillStyle='#8290a4';ctx.font='700 9px system-ui,sans-serif';ctx.fillText(channel.toUpperCase(),pad.l,37);
    if (faded) { ctx.fillStyle='#aab4c2';ctx.font='800 11px system-ui,sans-serif';ctx.fillText('OUDE CONFIGURATIE',width-142,37); }
    else if (dynoIsPartial(result) && progress >= 1) { ctx.fillStyle='#ff7c8a';ctx.font='800 11px system-ui,sans-serif';ctx.fillText('PARTIËLE DATA',width-116,37); }
    if (showComparison) { ctx.fillStyle='#8290a4';ctx.font='700 9px system-ui,sans-serif';ctx.fillText('- - VORIGE RUN',pad.l+8,pad.t+plotH-6); }
    // Log cursor: tap the chart to read every channel of this view at the nearest logged sample.
    if (Number.isFinite(dynoCursorRpm) && progress >= 1 && channel === dynoChannel) {
      const sp = visible.reduce((best, p) => (Math.abs(p.rpm - dynoCursorRpm) < Math.abs(best.rpm - dynoCursorRpm) ? p : best), visible[0]);
      const cx = x(sp.rpm);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, pad.t + plotH); ctx.stroke(); ctx.setLineDash([]);
      const lines = [`${sp.rpm} rpm`, ...defs.map(def => { const v = Number(sp[def.key]); return `${def.label} ${Number.isFinite(v) ? v.toFixed(Math.abs(v) < 10 ? 2 : 0) : '—'} ${def.unit}`; })];
      ctx.font = '700 10px ui-monospace, monospace';
      const bw = Math.max(...lines.map(t => ctx.measureText(t).width)) + 14, bh = lines.length * 14 + 8;
      const bx = cx + bw + 8 > width - pad.r ? cx - bw - 8 : cx + 8, by = pad.t + 6;
      ctx.fillStyle = 'rgba(6,9,14,.9)'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = '#2a3746'; ctx.strokeRect(bx, by, bw, bh);
      lines.forEach((t, i) => { ctx.fillStyle = i === 0 ? '#f4f6f8' : defs[i - 1].color; ctx.fillText(t, bx + 7, by + 16 + i * 14); });
      ctx.restore();
    }
  }
  let dynoCursorRpm = null;
  document.addEventListener('click', ev => {
    const cv = ev.target.closest?.('#dyno-chart');
    if (!cv || dynoRunning || !state.lastDyno?.samples?.length || dynoChannel === 'map') return;
    const r = cv.getBoundingClientRect(), res = state.lastDyno;
    const rpmMin = Number(res.startRpm) || 1500, rpmMax = Math.max(rpmMin + 500, Number(res.targetRpm) || 8000);
    const rpm = rpmMin + clamp((ev.clientX - r.left - 45) / Math.max(1, r.width - 60), 0, 1) * (rpmMax - rpmMin);
    dynoCursorRpm = Number.isFinite(dynoCursorRpm) && Math.abs(dynoCursorRpm - rpm) < 60 ? null : rpm;
    drawDynoChart(cv, res, 1, !currentDyno(), dynoChannel, compareRun());
  });
  // Datalog export: every logged channel of a pull (or a race) as CSV, for your own analysis.
  function logCsv(rows, preferred = []) {
    if (!rows?.length) return '';
    const keys = [...new Set([...preferred, ...Object.keys(rows[0])])].filter(k => rows.some(r => typeof r[k] === 'number' || typeof r[k] === 'string' || typeof r[k] === 'boolean'));
    const cell = v => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v == null ? '' : String(v));
    return [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n');
  }
  async function exportLog(kind) {
    const saver = NATIVE ? NATIVE.saveFile.bind(NATIVE) : null;
    const src = kind === 'race' ? state.lastDrag?.trace : state.lastDyno?.samples;
    if (!saver) return showToast('Exporteren is niet beschikbaar in deze omgeving.');
    if (!src?.length) return showToast(kind === 'race' ? 'Nog geen race om te exporteren.' : 'Nog geen dynopull om te exporteren.');
    const csv = logCsv(src, kind === 'race' ? ['time', 'distanceM', 'speedKmh', 'rpm', 'gear'] : ['rpm', 'tS', 'hp', 'torqueNm', 'boostBar', 'sparkDeg', 'knockRetardDeg', 'lambda', 'railBar', 'egtC', 'iatC']);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const ok = await saver(`ea888-${kind === 'race' ? 'race' : 'dyno'}-log-${stamp}.csv`, csv);
    showToast(ok ? `Datalog opgeslagen (${src.length} regels).` : 'Datalog niet opgeslagen.');
  }

  // The pull is simulated up front but revealed sample by sample at the
  // configured ramp rate; an aborted pull stops being revealed at its abort
  // sample, so the display never runs ahead of what the engine reached.
  function startDyno() {
    if (dynoRunning) return;
    activeTab = 'dyno';
    haptic([18, 40, 18]);
    const result = C.simulateEngine(state, { soakK: C.dynoSoakAt(state), pullIndex: state.dynoRuns?.length || 0 });
    const planned = Math.max(2, result.plannedSampleCount || result.samples.length);
    const fullDuration = state.settings?.reducedMotion ? 1450 : 5600;
    dynoRunning = { result, start: performance.now(), msPerSample: fullDuration / (planned - 1), shown: 0 };
    if (!result.samples.length) { finishDyno(result); return; }
    render();
    startEngineAudio();
    requestAnimationFrame(() => {
      // The pull is driven by elapsed time; nothing drawn or heard may stop it. A failing frame is logged
      // and the next one runs, so the pull always reaches its end and gets saved.
      const tick = now => {
        if (!dynoRunning) return;
        const samples = dynoRunning.result.samples;
        const idx = Math.min(samples.length - 1, Math.floor((now - dynoRunning.start) / dynoRunning.msPerSample));
        dynoRunning.shown = idx;
        dynoRunning.lastTickAt = now;
        if (idx >= samples.length - 1) {
          try { finishDyno(dynoRunning.result); }
          catch (e) { logAppError('dyno finish', e); dynoRunning = null; stopEngineAudio({ hard: true }); render(); }
          return;
        }
        cancelAnimationFrame(dynoRunning.raf);
        dynoRunning.raf = requestAnimationFrame(tick);
        try { dynoFrame(samples, idx); } catch (e) { logAppError('dyno frame', e); }
      };
      dynoRunning.tick = tick;
      dynoRunning.raf = requestAnimationFrame(tick);
      // Watchdog: if the WebView stops delivering animation frames, a timer keeps the pull going.
      const run = dynoRunning;
      run.watchdog = setInterval(() => {
        if (dynoRunning !== run) { clearInterval(run.watchdog); return; }
        const now = performance.now();
        if (now - (run.lastTickAt || run.start) > 400) tick(now);
      }, 250);
    });
  }

  function dynoFrame(samples, idx) {
    const point = samples[idx];
    drawDynoChart($('#dyno-chart'), dynoRunning.result, samples.length > 1 ? idx / (samples.length - 1) : 1, false, dynoChannel, null);
    // the measured sample drives the voice: MAP, EGT, lambda, wastegate, retard from MBT and knock
    updateEngineAudio(point.rpm, point.turboLoadPct / 100, 0, { mapBar: point.mapBarAbs, boostBar: point.boostBar, egtC: point.egtC, lambda: point.lambda,
      wastegatePct: point.wastegatePct, retardDeg: Math.max(0, Number(point.mbtDeg) - Number(point.sparkDeg)) || 0, knock: audibleKnock(point.knockIndex), shaftPct: point.shaftSpeedPct });
    const set = (id, value) => { const n = $(id); if (n) n.innerHTML = value; };
    set('#live-rpm', Math.round(point.rpm));
    set('#live-boost', `${num(point.boostBar,2)}<small> bar</small>`);
    set('#live-hp', `${Math.round(point.hp)}<small> pk</small>`);
    set('#live-egt', `${Math.round(point.egtC)}<small> °C</small>`);
    set('#live-oil', `${num(point.oilPressureBar,1)}<small> bar</small>`);
    set('#live-rail', `${Math.round(point.railBar)}<small> bar</small>`);
    const planned = Math.max(2, dynoRunning.result.plannedSampleCount || samples.length);
    const bar = $('#dyno-progress'); if (bar) bar.style.width = `${clamp(idx / (planned - 1), 0, 1) * 100}%`;
    const status = $('#dyno-live-status');
    if (status) status.textContent = `${Math.round(point.torqueNm)} Nm · λ ${num(point.lambda,2)} · duty ${Math.round(point.fuelDutyPct)}% · as ${Math.round(point.turboShaftRpm/1000)}k`;
  }

  // Operator abort: the pull is re-simulated up to the last revealed sample
  // (same seed, so identical samples) and stored as a partial measurement.
  function abortDyno() {
    if (!dynoRunning) return;
    if (dynoRunning.raf) cancelAnimationFrame(dynoRunning.raf);
    const reached = dynoRunning.result.samples[dynoRunning.shown || 0];
    const partial = reached ? C.simulateEngine(state, { stopAtRpm: reached.rpm, soakK: C.dynoSoakAt(state), pullIndex: state.dynoRuns?.length || 0 }) : null;
    haptic([40,30,40]);
    if (partial && partial.status !== C.DYNO_STATUS.COMPLETED) finishDyno(partial);
    else if (partial) finishDyno(dynoRunning.result);
    else { dynoRunning = null; stopEngineAudio({ hard: true }); render(); }
  }

  function finishDyno(result) {
    stopEngineAudio({ hard: true });
    state = C.commitDynoResult(state, result);
    if (C.isCompletedDyno(result)) markOnboarding('measured');
    if (dynoComparePinned) dynoCompareIndex = Math.min(dynoCompareIndex + 1, (state.dynoRuns?.length || 2) - 1);
    saveState();
    dynoRunning = null;
    syncAchievements();
    const completed = C.isCompletedDyno(result);
    haptic(completed ? [30, 30, 30] : [80, 50, 80]);
    showToast(completed ? 'Dynometing opgeslagen. De dragstrip is vrijgegeven.'
      : result.status === C.DYNO_STATUS.FAILED_TO_START ? 'Pull niet gestart: herstel eerst de motor.'
      : result.abortKind === 'operator' ? `Pull handmatig afgebroken @ ${result.abortRpm} rpm: partiële data en slijtage opgeslagen.`
      : `Pull afgebroken @ ${result.abortRpm} rpm: virtuele schade geregistreerd.`);
    render();
  }

  function vehicleRange(name, label, min, max, step, value, unit, decimals = 0, hint = '') {
    return `<div class="control compact-control"><div class="control-head"><div><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div><output class="value-edit" tabindex="0" role="button" aria-label="Waarde intypen" data-value-for="vehicle.${name}">${Number(value).toFixed(decimals)}${esc(unit)}</output></div><div class="range-row"><button type="button" class="step-btn" data-step="-1" aria-label="Lager">−</button><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-vehicle="${name}" data-unit="${esc(unit)}" data-decimals="${decimals}"><button type="button" class="step-btn" data-step="1" aria-label="Hoger">+</button></div></div>`;
  }

  // Burnout targets come from the tyre model (C.TYRE): the optimum is the grip temperature at the launch,
  // "caution" where the grip has fallen ~12 % from overheating. heatPerLevel is the slope of the stored-
  // warmth setup slider (gripFactor); heatRate only feeds the legacy quick burnout.
  function burnoutProfile() {
    const id = state.vehicle.tireCompound;
    const t = C.TYRE[id] || C.TYRE.uhp;
    const heatPerLevel = { street: .28, uhp: .42, semislick: .55 }[id] ?? .72;
    const heatRate = { street: 9.5, uhp: 11.5, semislick: 13.5, drag_radial: 16.5, slick: 17.5 }[id] ?? 18.5;
    return { id, tyre: t, targetC: t.optC, cautionC: Math.round(t.optC + t.windowC * .6), minStageC: Math.round(t.optC - t.windowC * .5),
      heatPerLevel, heatRate, trackC: Number(state.vehicle.trackTempC || 25), ambientC: Number(state.vehicle.ambientTempC ?? 20) };
  }
  // Seconds from the end of the burnout to the launch (roll to the line, stage, tree): the cooling the
  // burnout prediction assumes. The staging scene then simulates the real time taken.
  const BURNOUT_TO_LAUNCH_S = 20;
  function predictedLaunchTyreC(th) {
    const p = burnoutProfile();
    return C.tyreGripTempC(C.tyreThermalAfter(th, BURNOUT_TO_LAUNCH_S, { ambientC: p.ambientC, trackC: p.trackC, speedMs: 1 }));
  }

  function ensureBurnoutRuntime(forceReset = false) {
    const profile = burnoutProfile();
    const key = `${profile.id}:${profile.trackC}:${state.vehicle.drivetrain}`;
    if (forceReset || !burnoutRuntime || burnoutRuntime.key !== key) {
      const measured = C.gripFactor(state.vehicle).tireTempC;
      burnoutRuntime = {
        key, tempC: clamp(measured, profile.trackC, profile.cautionC + 12), rpm: 900,
        active: false, smoke: 0, wheelSlip: 0, startedAt: 0, lastAt: 0, elapsed: 0
      };
    }
    return burnoutRuntime;
  }

  // Score = the grip the tyre temperature gives at the launch (the vehicle model's own curve): 100 at the
  // optimum, 0 at 10 % less grip (a drag launch is decided by a few percent).
  function burnoutAssessment(tempC = ensureBurnoutRuntime().tempC) {
    const profile = burnoutProfile();
    const difference = tempC - profile.targetC;
    const score = Math.round(clamp(100 * (1 - (1 - C.tyreTempFactor(profile.tyre, tempC)) / .1), 0, 100));
    let label = 'KOUD', cls = 'cold';
    if (tempC > profile.cautionC) { label = 'TE HEET'; cls = 'hot'; }
    else if (score >= 84) { label = 'OPTIMAAL'; cls = 'good'; }
    else if (difference < 0) { label = score >= 58 ? 'BIJNA OP TEMP' : 'KOUD'; cls = score >= 58 ? 'warn' : 'cold'; }
    else { label = score >= 58 ? 'WARM' : 'TE WARM'; cls = score >= 58 ? 'warn' : 'hot'; }
    return { ...profile, score, label, cls, difference };
  }

  function syncBurnoutLevel(tempC) {
    const profile = burnoutProfile();
    state.vehicle.burnoutLevel = clamp((Number(tempC) - profile.trackC) / profile.heatPerLevel, 0, 100);
  }

  function dragTreeMarkup() {
    return `<div class="tree v6-tree" id="tree" aria-label="Drag race startboom">
      <i class="bulb pre" data-bulb="preL"></i><i class="bulb pre" data-bulb="preR"></i>
      <i class="bulb stage" data-bulb="stageL"></i><i class="bulb stage" data-bulb="stageR"></i>
      <i class="bulb amber" data-bulb="a1L"></i><i class="bulb amber" data-bulb="a1R"></i>
      <i class="bulb amber" data-bulb="a2L"></i><i class="bulb amber" data-bulb="a2R"></i>
      <i class="bulb amber" data-bulb="a3L"></i><i class="bulb amber" data-bulb="a3R"></i>
      <i class="bulb green" data-bulb="gL"></i><i class="bulb green" data-bulb="gR"></i>
      <i class="bulb red" data-bulb="rL"></i><i class="bulb red" data-bulb="rR"></i>
    </div>`;
  }

  function tachometerMarkup(point) {
    const maxRpm = Math.max(7000, Number(state.tune.revLimitRpm || 8000));
    const rpm = clamp(Number(point.rpm || 0), 0, maxRpm);
    const frac = clamp(rpm / maxRpm, 0, 1);
    const needle = -126 + frac * 252;
    const tachDeg = frac * 252;
    return `<div class="v6-tach" id="race-tach" style="--needle-angle:${needle}deg;--tach-deg:${tachDeg}deg">
      <div class="v6-tach-scale"><i></i></div>
      <span class="v6-tach-needle"></span>
      <div class="v6-tach-center"><b id="race-rpm">${Math.round(rpm)}</b><small>RPM</small><strong id="race-gear">${point.gear || 1}</strong></div>
      <div class="v6-shift-lights" id="shift-lights">${Array.from({ length: 10 }, (_, i) => `<i class="${frac > (i + 1) / 11 ? 'on' : ''}"></i>`).join('')}</div>
    </div>`;
  }

  function telemetryValue(trace, key, fallback = 0) {
    if (!Array.isArray(trace) || !trace.length) return fallback;
    return trace.reduce((m,p) => Math.max(m, Number(p[key] || 0)), fallback);
  }

  function renderDragTelemetryPanel() {
    const run = state.lastDrag;
    if (!run?.trace?.length) {
      return `<div class="v12-telemetry-empty"><span class="eyebrow">Runanalyse</span><h2>Nog geen telemetrie</h2><p>Voltooi een realtime kwartmijl. Daarna zie je snelheid, toerental, boost, wheelspin, rijlijn en aandrijflijntemperaturen over de volledige 402 meter.</p><button class="btn" data-race-panel="tree">NAAR DRAG EXPERIENCE</button></div>`;
    }
    const maxSpeed = telemetryValue(run.trace,'speedKmh');
    const maxRpm = telemetryValue(run.trace,'rpm');
    const maxBoost = telemetryValue(run.trace,'boostBar');
    const maxSpin = telemetryValue(run.trace,'wheelspinPct');
    const maxLane = run.maxLaneOffsetM || telemetryValue(run.trace,'lateralM');
    const outcome = run.raceMode === 'heads_up'
      ? `<div class="v12-analysis-card ${run.won ? 'win' : 'loss'}"><span>HEADS-UP</span><b>${run.won ? 'GEWONNEN' : 'VERLOREN'}</b><small>${esc(run.opponentName || 'Rivaal')} · ${Number(Math.abs(run.raceDeltaS || 0)).toFixed(3)} s ${run.won ? 'voorsprong' : 'achterstand'}</small></div>`
      : `<div class="v12-analysis-card"><span>RUNMODUS</span><b>SOLO TEST</b><small>Geen rivaal gekoppeld aan deze timeslip.</small></div>`;
    return `<div class="v12-telemetry-panel">
      <div class="section-head"><div><span class="eyebrow">Post-run data</span><h2>402 meter telemetrie</h2><p>De lijnen volgen de werkelijk gesimuleerde run, inclusief schakelmomenten, boostopbouw en stuurcorrecties.</p></div><div class="setup-badge"><span>LAATSTE PASS</span><b>${run.quarter.toFixed(3)} s</b></div></div>
      <div class="v12-telemetry-chart-card">
        <canvas id="v12-telemetry-canvas" aria-label="Grafiek van dragtelemetrie"></canvas>
        <div class="v12-chart-legend">
          <span style="--legend:${TELEMETRY_COLORS.speed}">Snelheid</span><span style="--legend:${TELEMETRY_COLORS.rpm}">RPM</span><span style="--legend:${TELEMETRY_COLORS.boost}">Boost</span><span style="--legend:${TELEMETRY_COLORS.wheelspin}">Wheelspin</span><span style="--legend:${TELEMETRY_COLORS.lane}">Rijlijn</span>
        </div>
      </div>
      <div class="v12-analysis-grid">
        ${outcome}
        <div class="v12-analysis-card"><span>PIEKWAARDEN</span><b>${Math.round(maxSpeed)} km/u</b><small>${Math.round(maxRpm)} rpm · ${maxBoost.toFixed(2)} bar</small></div>
        <div class="v12-analysis-card"><span>TRACTIE</span><b>${maxSpin.toFixed(0)}% spin</b><small>${Number(run.burnoutTempC || 0).toFixed(0)}°C band bij launch · ${Number(run.sixtyFt || 0).toFixed(3)} s 60 ft</small></div>
        ${Number.isFinite(run.knockEvents) ? `<div class="v12-analysis-card ${run.knockDamagePct > 0 ? 'loss' : ''}"><span>KLOP</span><b>${run.knockEvents} cycli</b><small>${run.knockDamagePct > 0 ? `zonder knock control · schade +${run.knockDamagePct.toFixed(2)}%` : run.kcMaxRetardDeg > .05 ? `knock control max −${run.kcMaxRetardDeg.toFixed(1)}°` : 'geen klop'}</small></div>` : ''}
        <div class="v12-analysis-card"><span>RIJLIJN</span><b>${Number(maxLane || 0).toFixed(2)} m</b><small>${run.lineTouches || 0} correcties · ${run.laneDnf ? 'run ongeldig' : 'binnen de strip'}</small></div>
        <div class="v12-analysis-card"><span>AANDRIJFLIJN</span><b>${Number(run.maxClutchTempC || 0).toFixed(0)}°C koppeling</b><small>${Number(run.maxGearboxTempC || 0).toFixed(0)}°C bak · stress ${Number(run.drivelineStress || 0).toFixed(0)}%</small></div>
        <div class="v12-analysis-card"><span>BEGRENZER</span><b>${Number(run.limiterTimeS || 0).toFixed(2)} s</b><small>Schakelscore ${run.shiftScore || 0}/100 · ${run.transmissionMode || '—'}</small></div>
      </div>
      <div class="log-actions"><small>Alle racekanalen (snelheid, rpm, boost, slip, koppeling, koppel, EGT, rijlijn) per 35 ms.</small><button class="btn ghost small" data-action="export-race-log">Racelog (CSV)</button></div>
      <div class="v12-telemetry-note">Telemetrie is een fysisch gamemodel, geen vervanging voor echte ECU-, CAN- of dynologs.</div>
    </div>`;
  }

  function drawDragTelemetry(canvas, run) {
    if (!canvas || !run?.trace?.length) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.max(320, Math.round(rect.width || 720));
    const height = Math.max(230, Math.round(rect.height || 320));
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const pad = {l:38,r:16,t:20,b:32};
    const cw = width-pad.l-pad.r, ch = height-pad.t-pad.b;
    const bg = ctx.createLinearGradient(0,0,0,height); bg.addColorStop(0,'#101823'); bg.addColorStop(1,'#05080d'); ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='rgba(157,177,201,.16)';ctx.lineWidth=1;
    for(let i=0;i<=4;i++){const y=pad.t+ch*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(width-pad.r,y);ctx.stroke();}
    for(let i=0;i<=4;i++){const x=pad.l+cw*i/4;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,height-pad.b);ctx.stroke();ctx.fillStyle='#748297';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(`${Math.round(402.336*i/4)} m`,x,height-11);}
    const trace=run.trace;
    const maxSpeed=Math.max(180,telemetryValue(trace,'speedKmh')*1.08);
    const maxRpm=Math.max(6500,Number(state.tune.revLimitRpm||8000));
    const maxBoost=Math.max(1,telemetryValue(trace,'boostBar')*1.15);
    const lines=[
      {key:'speedKmh',color:TELEMETRY_COLORS.speed,norm:v=>clamp(v/maxSpeed,0,1)},
      {key:'rpm',color:TELEMETRY_COLORS.rpm,norm:v=>clamp(v/maxRpm,0,1)},
      {key:'boostBar',color:TELEMETRY_COLORS.boost,norm:v=>clamp(v/maxBoost,0,1)},
      {key:'wheelspinPct',color:TELEMETRY_COLORS.wheelspin,norm:v=>clamp(v/100,0,1)},
      {key:'lateralM',color:TELEMETRY_COLORS.lane,norm:v=>clamp(.5+v/2.1,0,1)}
    ];
    for(const line of lines){ctx.beginPath();let started=false;for(const p of trace){const x=pad.l+clamp(Number(p.distanceM||0)/402.336,0,1)*cw;const y=pad.t+(1-line.norm(Number(p[line.key]||0)))*ch;if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.strokeStyle=line.color;ctx.lineWidth=line.key==='lateralM'?2.2:2.5;ctx.shadowColor=line.color;ctx.shadowBlur=4;ctx.stroke();ctx.shadowBlur=0;}
    ctx.fillStyle='#9aa8ba';ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillText(`${Math.round(maxSpeed)} km/u`,5,pad.t+5);ctx.fillText('0',18,height-pad.b+3);
  }

  // ---- Career ---------------------------------------------------------------------------------------
  function careerSuggestedDial() {
    const valid = (state.dragRuns || []).filter(r => r.valid && !r.redLight && Number.isFinite(r.quarter)).slice(0, 5).map(r => r.quarter);
    if (!valid.length) return null;
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    return Math.round((mean + 0.04) * 100) / 100;
  }
  function renderCareerPanel() {
    const c = state.career || C.defaultCareer(), a = c.active, ready = currentCompletedDyno();
    const bank = euro(state.bank);
    let activeCard = '';
    if (a) {
      const ev = C.CAREER_EVENT_MAP[a.eventId], plan = careerPlan();
      const rival = RIVALS[plan.rivalId];
      const dial = a.dialIn ?? careerSuggestedDial() ?? 13;
      activeCard = `<div class="card career-active">
        <div class="section-head small"><div><span class="eyebrow">${esc(ev.name)} · ronde ${a.round + 1}/${ev.rounds}</span><h3>${ev.format === 'bracket' ? 'Bracket: dial-in' : 'Heads-up'} tegen ${esc(rival.name)}</h3></div><span class="setup-badge"><span>WINNAAR</span><b>${euro(ev.prize)}</b></span></div>
        <p class="muted">${esc(rival.description)} ${esc(rivalSpec(rival))}.${ev.format === 'bracket' ? ` Rivaal dial-in <b>${plan.dialIn?.toFixed(2)} s</b>.` : ''} Strip ${ev.prep ? 'geprept' : 'niet geprept'}.</p>
        ${a.results.length ? `<div class="career-results">${a.results.map(r => `<span class="${r.won ? 'win' : 'loss'}">R${r.round} ${r.won ? 'W' : 'L'} · ${esc(r.reason)}</span>`).join('')}</div>` : ''}
        ${ev.format === 'bracket' ? `<div class="control"><div class="control-head"><div><b>Jouw dial-in</b><small>Voorspel je ET. Langzamer dan je dial wint niet; sneller is een break-out en verliest. Laatste geldige passes gemiddeld +0,04 s: ${careerSuggestedDial()?.toFixed(2) ?? '—'} s.</small></div><output class="value-edit" tabindex="0" role="button" data-value-for="career.dialIn">${dial.toFixed(2)} s</output></div><div class="range-row"><button type="button" class="step-btn" data-step="-1" aria-label="Lager">−</button><input type="range" min="6" max="20" step="0.01" value="${dial}" data-career-dial data-unit=" s" data-decimals="2"><button type="button" class="step-btn" data-step="1" aria-label="Hoger">+</button></div></div>` : ''}
        <div class="career-actions"><button class="btn ghost" data-action="career-forfeit">Opgeven</button><button class="btn" data-action="career-race" ${ready ? '' : 'disabled'}>${ready ? `Start ronde ${a.round + 1}` : 'Eerst een geldige dynopull'}</button></div>
      </div>`;
    }
    const events = C.CAREER_EVENTS.map(ev => {
      const why = C.careerEligibility(state, ev.id);
      return `<article class="career-event ${why.length ? 'locked' : ''}">
        <div><span class="eyebrow">${ev.format === 'bracket' ? 'BRACKET · DIAL-IN' : 'HEADS-UP'} · ${ev.rounds} rondes</span><h3>${esc(ev.name)}</h3><p>${esc(ev.detail)}</p>
        <small>Inschrijven ${euro(ev.entry)} · winnaar ${euro(ev.prize)} · +${ev.rep} reputatie${ev.repRequired ? ` · vanaf ${ev.repRequired} rep` : ''}</small>
        ${why.length ? `<small class="why">${esc(why.join(' '))}</small>` : ''}</div>
        <button class="btn ${why.length || a ? 'ghost' : ''}" data-career-enter="${ev.id}" ${why.length || a ? 'disabled' : ''}>${a ? 'Evenement bezig' : why.length ? 'Niet toegestaan' : 'Inschrijven'}</button>
      </article>`;
    }).join('');
    return `<div class="career-panel">
      <div class="career-stats"><div><span>Reputatie</span><b>${c.rep}</b></div><div><span>Evenementen gewonnen</span><b>${c.eventWins}/${c.events}</b></div><div><span>Rondes gewonnen</span><b>${c.roundWins}</b></div><div><span>Prijzengeld</span><b>${euro(c.earnings)}</b></div></div>
      ${activeCard}
      <div class="section-head small"><div><span class="eyebrow">Kalender · budget ${bank}</span><h3>Evenementen</h3></div></div>
      <div class="career-events">${events}</div>
      ${(c.history || []).length ? `<div class="card history-card"><div class="section-head small"><div><span class="eyebrow">Carrière</span><h3>Uitslagen</h3></div></div><div class="run-table">${c.history.slice(0, 8).map(h => `<div class="run-row ${h.champion ? '' : 'partial'}"><span>${h.champion ? '🏆' : '—'}</span><div><b>${esc(h.name)}</b><small>${new Date(h.at).toLocaleDateString('nl-NL')} · ${h.rounds} ronde${h.rounds === 1 ? '' : 's'}</small></div><strong>${h.champion ? 'KAMPIOEN' : `ronde ${h.rounds}`}</strong></div>`).join('')}</div></div>` : ''}
    </div>`;
  }
  function careerPlan() {
    const a = state.career?.active;
    if (!a) return null;
    const ev = C.CAREER_EVENT_MAP[a.eventId], rivalId = ev.rivals[Math.min(a.round, ev.rivals.length - 1)];
    return C.planCareerRound(a.eventId, a.round, a.seed, { [rivalId]: rivalPass(RIVALS[rivalId]) });
  }
  function careerEnter(eventId) {
    try {
      const ev = C.CAREER_EVENT_MAP[eventId];
      state = C.startCareerEvent(state, eventId);
      state.career.active.dialIn = careerSuggestedDial();
      saveState(); haptic([12, 20, 12]); render();
      showToast(`Ingeschreven voor ${ev.name} (−${euro(ev.entry)}).`);
    } catch (e) { showToast(e.message); }
  }
  function careerRace() {
    const a = state.career?.active;
    if (!a) return;
    const ev = C.CAREER_EVENT_MAP[a.eventId];
    const plan = careerPlan();
    const dialIn = ev.format === 'bracket' ? Number(a.dialIn ?? careerSuggestedDial() ?? 13) : null;
    startDragGame(false);
    if (raceGame) { raceGame.careerRound = { eventId: a.eventId, round: a.round, format: ev.format, plan, dialIn }; raceGame.rivalProfile = RIVALS[plan.rivalId]; }
  }
  function careerForfeit() {
    const a = state.career?.active;
    if (!a) return;
    state = C.applyCareerRound(state, { won: false, reason: 'opgegeven', marginS: 0 }, {});
    saveState(); render(); showToast('Evenement opgegeven.');
  }

  function renderDrag() {
    const ready = currentCompletedDyno();
    const v = state.vehicle;
    const fit = C.wheelFitment(v);
    const last = state.lastDrag;
    const da = C.densityAltitude(v);
    const tire = C.TIRE_MAP[v.tireCompound];
    const rival = selectedRival();
    const headsUp = raceIsHeadsUp();
    const record = state.records?.[v.drivetrain];
    const runs = Array.isArray(state.dragRuns) ? state.dragRuns.slice(0, 10) : [];
    let panel = '';

    if (racePanel === 'setup') {
      panel = `<div class="race-setup-panel v7-setup-panel">
        <div class="section-head"><div><span class="eyebrow">Chassis & banden</span><h2>Dragsetup</h2><p>Wielmaat, druk, massa, temperatuur en aandrijving worden rechtstreeks in de kwartmijlsimulatie gebruikt.</p></div><div class="setup-badge"><span>DENSITY ALTITUDE</span><b>${Math.round(da)} m</b></div></div>
        <div class="v12-race-weekend-card">
          <div><span class="eyebrow">Raceweekend</span><h3>${headsUp ? 'Heads-up duel' : 'Solo testpass'}</h3><p>${headsUp ? `Tegen ${esc(rival.name)} · ${esc(rival.description)}` : 'Rijd zonder tegenstander en focus volledig op setup, schakelen en rijlijn.'}</p></div>
          <div class="v12-mode-toggle"><button class="${!headsUp?'active':''}" data-race-mode="solo">SOLO</button><button class="${headsUp?'active':''}" data-race-mode="heads_up">HEADS-UP</button></div>
        </div>
        <div class="v12-rival-picker ${headsUp?'':'disabled'}">
          ${Object.values(RIVALS).map(r=>`<button class="${rival.id===r.id?'active':''}" data-rival-level="${r.id}" ${headsUp?'':'disabled'}><span>${r.tag}</span><b>${esc(r.name)}</b><small>${esc(rivalSpec(r))} · RT ${r.reactionMin.toFixed(3)}–${r.reactionMax.toFixed(3)} · winst ${euro(r.reward)}</small></button>`).join('')}
        </div>
        <div class="vehicle-grid v4-vehicle-grid">
          <div class="card">
            <span class="eyebrow">Aandrijflijn</span><h3>Platform & massa</h3>
            <label class="field-label">Aandrijving<select data-vehicle-select="drivetrain">${Object.keys(C.DRIVETRAINS).map(k => `<option value="${k}" ${v.drivetrain === k ? 'selected' : ''}>${esc(C.DRIVETRAINS[k].name)}</option>`).join('')}</select></label>
            <label class="field-label">Bandcompound<select data-vehicle-select="tireCompound">${C.TIRE_COMPOUNDS.map(t => `<option value="${t.id}" ${v.tireCompound === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
            ${vehicleRange('massKg', 'Rijklaar gewicht', 900, 1900, 10, v.massKg, ' kg', 0, 'Basisauto met OEM-onderdelen, incl. bestuurder en vloeistoffen. Gekozen onderdelen tellen hun gewichtsverschil hierbij op.')}
            ${vehicleRange('pressureBar', 'Bandenspanning', .65, 3.2, .05, v.pressureBar, ' bar', 2, `Compoundoptimum rond ${num(tire.optimumBar,2)} bar.`)}
            ${switchRow('preparedTrack', 'Geprepareerde baan', 'Meer bruikbare grip, vooral met drag radial, slick of pro radial.', 'vehicle')}
          </div>
          <div class="card">
            <span class="eyebrow">Wielen</span><h3>Maat & roterende massa</h3>
            ${vehicleRange('rimDiameterIn', 'Velgdiameter', 15, 22, 1, v.rimDiameterIn, '″', 0)}
            ${vehicleRange('rimWidthIn', 'Velgbreedte', 6.5, 13, .5, v.rimWidthIn, '″', 1)}
            ${vehicleRange('tireWidthMm', 'Bandbreedte', 185, 355, 5, v.tireWidthMm, ' mm', 0)}
            ${vehicleRange('aspectRatio', 'Hoogteverhouding', 20, 65, 5, v.aspectRatio, '%', 0)}
            ${vehicleRange('wheelMassKg', 'Massa per wiel', 6, 22, .2, v.wheelMassKg, ' kg', 1)}
          </div>
          <div class="card">
            <span class="eyebrow">Start & chassis</span><h3>Launchgedrag</h3>
            ${vehicleRange('burnoutLevel', 'Opgeslagen bandwarmte', 0, 100, 1, v.burnoutLevel, '%', 0, 'De interactieve burnout overschrijft dit met de werkelijk behaalde temperatuur.')}
            ${vehicleRange('suspensionTransferPct', 'Gewichtsoverdracht', 25, 100, 1, v.suspensionTransferPct, '%', 0, 'FWD wil minder achterwaartse transfer; RWD profiteert van gecontroleerde squat.')}
            ${vehicleRange('shiftRpm', 'Schakeltoerental', 4500, 10000, 100, v.shiftRpm, ' rpm', 0, 'De game geeft een shiftcue rond dit toerental.')}
            ${vehicleRange('steeringSensitivityPct', 'Stuurgevoeligheid', 60, 150, 1, v.steeringSensitivityPct, '%', 0, 'Hoger reageert sneller, maar maakt de auto nerveuzer op hoge snelheid.')}
            ${vehicleRange('steeringAssistPct', 'Middenassistent', 0, 60, 1, v.steeringAssistPct, '%', 0, 'Lichte zelfcentrering; 0% is volledig handmatig.')}
            <div class="setup-summary"><span>Launch map</span><b>${state.tune.launchRpm} rpm · G1 ${state.tune.firstGearBoostPct}% · G2 ${state.tune.secondGearBoostPct}%</b></div>
          </div>
          <div class="card">
            <span class="eyebrow">Baan & weer</span><h3>Omstandigheden</h3>
            ${vehicleRange('ambientTempC', 'Luchttemperatuur', -5, 45, 1, v.ambientTempC, '°C', 0)}
            ${vehicleRange('trackTempC', 'Baantemperatuur', 0, 65, 1, v.trackTempC, '°C', 0)}
            ${vehicleRange('altitudeM', 'Hoogte', -50, 1800, 10, v.altitudeM, ' m', 0)}
            ${vehicleRange('humidityPct', 'Luchtvochtigheid', 0, 100, 1, v.humidityPct, '%', 0)}
            ${vehicleRange('headwindKmh', 'Tegenwind', -20, 35, 1, v.headwindKmh, ' km/u', 0, 'Negatief betekent rugwind.')}
          </div>
        </div>
        <div id="wheel-readout" class="wheel-readout"></div>
        ${fit.warnings.length ? `<div class="warning-list">${fit.warnings.map(x => `<div class="warning-item"><span>!</span><p>${esc(x)}</p></div>`).join('')}</div>` : '<div class="notice success"><strong>Wiel-/bandcombinatie valt binnen de gemodelleerde fitmentmarge.</strong></div>'}
      </div>`;
    } else if (racePanel === 'telemetry') {
      panel = renderDragTelemetryPanel();
    } else if (racePanel === 'career') {
      panel = renderCareerPanel();
    } else if (racePanel === 'history') {
      panel = `<div class="race-history-panel v7-history-panel">
        <div class="record-grid">${['FWD','RWD','AWD'].map(key => { const rec=state.records?.[key]; return `<article class="record-card ${key===v.drivetrain?'active':''}"><span>${key} RECORD</span><b>${rec ? `${rec.quarter.toFixed(3)} s` : '—'}</b><small>${rec ? `${rec.trapKmh.toFixed(1)} km/u · ${new Date(rec.at || Date.now()).toLocaleDateString('nl-NL')}` : 'nog geen geldige pass'}</small></article>`; }).join('')}</div>
        <div class="card history-card"><div class="section-head small"><div><span class="eyebrow">Runhistorie</span><h3>Laatste timeslips</h3></div></div>
          ${runs.length ? `<div class="run-table">${runs.map((r,i)=>`<div class="run-row ${r.redLight?'invalid':''}"><span>${String(i+1).padStart(2,'0')}</span><div><b>${r.redLight?'Rood licht':r.raceMode==='heads_up'?`${r.won?'WIN':'LOSS'} · ${r.opponentName}`:`${r.drivetrain} · ${r.tireName}`}</b><small>${new Date(r.measuredAt || r.at || Date.now()).toLocaleString('nl-NL')} · RT ${r.reactionTime>=0?'+':''}${r.reactionTime.toFixed(3)}${r.shiftPenalty ? ` · shift +${r.shiftPenalty.toFixed(3)}` : ''}</small></div><strong>${r.quarter.toFixed(3)} s<br><small>${r.trapKmh.toFixed(1)} km/u</small></strong></div>`).join('')}</div>` : '<p class="muted">Nog geen opgeslagen passes.</p>'}
        </div>
      </div>`;
    } else {
      const lastSummary = last ? `${last.quarter.toFixed(3)} s @ ${last.trapKmh.toFixed(1)} km/u` : 'Nog geen geldige pass';
      panel = `<div class="v7-race-overview">
        <div class="v7-overview-scene">
          <div class="v7-overview-track"></div>
          <div class="v7-overview-light light-a"></div><div class="v7-overview-light light-b"></div>
          <img class="v7-overview-car" src="images/randy-scirocco-rear.svg" alt="Randy's blauwe Scirocco van achteren op de dragstrip">
          <div class="v7-overview-tree">${v7TreeMarkup('preview')}</div>
          <div class="v7-overview-copy"><span>${headsUp?'HEADS-UP RACEWEEKEND':'SOLO TESTPASS'}</span><h2>Burnout → staging → tree → run</h2><p>${headsUp?`Je rijdt naast ${esc(rival.name)}. Beide auto’s krijgen een eigen reactie, acceleratiecurve en finishmoment.`:'Focus op de perfecte pass zonder rivaal; alle physics en telemetrie blijven actief.'}</p></div>
          ${headsUp?`<div class="v12-overview-rival"><img src="images/rival-scirocco.svg" alt="Graphite Scirocco-rivaal"><span>${rival.tag}</span><b>${esc(rival.name)}</b><small>${esc(rivalSpec(rival))} · ${euro(rival.reward)} winstpremie</small></div>`:''}
          <div class="v7-overview-best"><span>${record ? `${v.drivetrain} RECORD` : 'LAATSTE RUN'}</span><b>${record ? `${record.quarter.toFixed(3)} s` : lastSummary}</b><small>${record ? `${record.trapKmh.toFixed(1)} km/u` : `${v.drivetrain} · ${esc(tire.name)}`}</small></div>
        </div>
        <div class="v7-overview-actions">
          <button class="btn v7-start-button" data-action="open-drag-game" ${ready ? '' : 'disabled'}><span class="v7-flag">🏁</span><b>START DRAG EXPERIENCE</b><small>Volledig scherm · echte rivaal, sturen, launch, shifts en telemetrie</small></button>
          <button class="btn ghost" data-action="auto-drag-game" ${ready ? '' : 'disabled'}>SNELTEST / AUTO PASS</button>
        </div>
        <div class="v7-flow-cards">
          <article><span>01</span><b>Burnout</b><small>Houd gas in de groene rpm-zone en bouw de juiste bandentemperatuur op.</small></article>
          <article><span>02</span><b>Stage</b><small>Kruip door pre-stage naar de stagebeam zonder te diep te gaan.</small></article>
          <article><span>03</span><b>Launch</b><small>Houd launch-rpm vast en reageer op de Sportsman- of Pro-tree.</small></article>
          <article><span>04</span><b>${headsUp?'Heads-up':'Shift'}</b><small>${headsUp?'Versla de rivaal op totale tijd: reactie plus ET.':'Schakel op de cue. Vroeg, laat en begrenzer beïnvloeden de acceleratie.'}</small></article>
        </div>
        <div class="v7-timeslip-overview">
          <div><span class="eyebrow">Laatste timeslip</span><pre>${last ? esc(timeslipText(last)) : 'NOG GEEN RUN\nStart de drag experience om een volledige timeslip te zetten.'}</pre></div>
          <div class="v7-race-specs"><span><b>${v.drivetrain}</b>${Math.round(C.buildMassKg(state))} kg</span><span><b>${v.tireWidthMm}/${v.aspectRatio} R${v.rimDiameterIn}</b>${esc(tire.name)}</span><span><b>${state.tune.launchRpm} rpm</b>launch target</span><span><b>${Math.round(v.trackTempC)}°C</b>baantemperatuur</span></div>
        </div>
      </div>`;
    }

    return `<section class="page drag-page v7-drag-page">
      <div class="page-title-row v7-drag-title"><div><span class="eyebrow">EA888 LAB DRAG MODE</span><h1>Van burnoutbox naar finish</h1><p>Een losse spelmodus met verschillende fullscreen scènes. De overzichtspagina blijft alleen voor setup, records en de laatste timeslip.</p></div></div>
      ${ready ? `<div class="notice success"><strong>Auto vrijgegeven.</strong> ${Math.round(state.lastDyno.peakHp)} pk / ${Math.round(state.lastDyno.peakTorqueNm)} Nm is de actieve meetcurve.</div>` : `<div class="notice danger"><strong>Race geblokkeerd.</strong> ${!currentDyno() || !state.lastDyno ? 'Meet de gewijzigde build eerst opnieuw op de dyno.' : state.lastDyno.failureRpm ? `De laatste pull brak af @ ${state.lastDyno.failureRpm} rpm. Herstel de schade en voer een volledige dynopull uit.` : 'De laatste pull is niet voltooid. Voer een volledige dynopull uit.'}</div>`}
      <div class="segment-control race-segments v7-race-segments v12-race-segments"><button class="${racePanel==='tree'?'active':''}" data-race-panel="tree">Race</button><button class="${racePanel==='setup'?'active':''}" data-race-panel="setup">Setup</button><button class="${racePanel==='telemetry'?'active':''}" data-race-panel="telemetry">Telemetrie</button><button class="${racePanel==='career'?'active':''}" data-race-panel="career">Carrière</button><button class="${racePanel==='history'?'active':''}" data-race-panel="history">Records</button></div>
      ${panel}
    </section>`;
  }

  function timeslipText(r) {
    const f = (v, d = 3) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
    const status = r.redLight ? 'ROOD LICHT' : r.laneDnf ? 'BUITEN DE BAAN' : r.valid === false ? 'RUN ONGELDIG' : r.raceMode === 'heads_up' ? (r.won ? 'HEADS-UP WIN' : 'HEADS-UP LOSS') : 'GELDIGE RUN';
    const shiftLine = r.transmissionMode === 'DSG AUTO'
      ? `${r.shifts || 0} DSG shifts · automatisch`
      : `${r.shifts || 0} shifts · ${r.perfectShifts || 0} perfect · ${r.earlyShifts || 0} vroeg · ${r.lateShifts || 0} laat`;
    const duel = r.raceMode === 'heads_up' && r.opponentName
      ? `\nRivaal   ${r.opponentName}\nHun tijd ${f(r.opponentFinishTotalTime)} s totaal · ET ${f(r.opponentQuarter)}\nDelta    ${r.won?'+':'-'}${f(Math.abs(r.raceDeltaS))} s ${r.won?'voorsprong':'achterstand'}${r.reward?` · +${euro(r.reward)}`:''}`
      : '';
    return `${status}\n` +
      `RT       ${r.reactionTime >= 0 ? '+' : ''}${f(r.reactionTime)} s\n` +
      `60 ft    ${f(r.sixtyFt)} s\n` +
      `330 ft   ${f(r.threeThirty)} s\n` +
      `1/8      ${f(r.eighth)} s  @ ${f(r.eighthKmh,1)} km/u\n` +
      `1000 ft  ${f(r.thousandFt)} s\n` +
      `1/4      ${f(r.quarter)} s  @ ${f(r.trapKmh,1)} km/u\n` +
      `Totaal   ${f(r.finishTotalTime)} s incl. reactie\n` +
      `0–100    ${f(r.zeroTo100)} s${duel}\n` +
      `Wheelspin ${f(r.wheelspinPct,0)}% · ${shiftLine}\n` +
      `Rijlijn  ${f(r.maxLaneOffsetM,2)} m max · ${r.lineTouches || 0} correcties\n` +
      `Driveline ${f(r.maxClutchTempC,0)}°C clutch · ${f(r.maxGearboxTempC,0)}°C bak · ${f(r.drivelineStress,0)}% stress\n` +
      `Limiter  ${f(r.limiterTimeS,2)} s\n` +
      (r.turbo ? `Turbo    as max ${f(r.turbo.maxShaftPct,0)}% · EGT max ${f(r.turbo.maxEgtC,0)}°C · EMP ${f(r.turbo.maxEmpBar,2)} bar\nALS      ${f(r.turbo.alsSeconds,1)} s · brandstof ${f(r.turbo.fuelUsedG,0)} g · ${r.flames || 0} vlammen\n` : '') +
      `${r.drivetrain || state.vehicle.drivetrain} · ${r.tireName || C.TIRE_MAP[state.vehicle.tireCompound]?.name}\n${r.tireSize || ''} op ${r.wheelSpec || ''} · Ø ${f(r.tireDiameterMm,0)} mm`;
  }

  function setRacePhase(phase) {
    racePhase = phase;
    const stage = $('#race-stage');
    if (stage) {
      stage.classList.remove('phase-burnout','phase-staged','phase-running','phase-finished');
      stage.classList.add(`phase-${phase}`);
    }
    const steps = $$('#race-stepper > div');
    const index = phase === 'burnout' ? 0 : phase === 'staged' ? 1 : phase === 'running' ? 2 : 3;
    steps.forEach((node, i) => {
      node.classList.toggle('active', index < 3 && i === index);
      node.classList.toggle('done', index >= 3 || i < index);
    });
    const split = $('#live-split');
    if (split) {
      const label = phase === 'burnout' ? 'BURNOUT BOX' : phase === 'staged' ? 'STAGED' : phase === 'running' ? 'RUNNING' : 'FINISH';
      const span = $('span', split); if (span) span.textContent = label;
    }
  }

  function updateRaceHud(point = raceLivePoint, enginePoint = null) {
    const rpm = clamp(Number(point.rpm || 0), 0, Math.max(7000, Number(state.tune.revLimitRpm || 8000)));
    const maxRpm = Math.max(7000, Number(state.tune.revLimitRpm || 8000));
    const frac = clamp(rpm / maxRpm, 0, 1);
    const boost = Number(point.boostBar ?? enginePoint?.boostBar ?? 0);
    raceLivePoint = {
      rpm, speedKmh: Number(point.speedKmh || 0), gear: Number(point.gear || 1), boostBar: boost,
      accelerationG: Number(point.accelerationG || 0), distanceM: Number(point.distanceM || 0)
    };
    const tach = $('#race-tach');
    if (tach) {
      tach.style.setProperty('--needle-angle', `${-126 + frac * 252}deg`);
      tach.style.setProperty('--tach-deg', `${frac * 252}deg`);
      tach.classList.toggle('shift-now', frac > .925);
    }
    const rpmNode = $('#race-rpm'); if (rpmNode) rpmNode.textContent = Math.round(rpm);
    const gearNode = $('#race-gear'); if (gearNode) gearNode.textContent = point.gear || 1;
    const speedNode = $('#race-speed'); if (speedNode) speedNode.textContent = Math.round(point.speedKmh || 0);
    const distNode = $('#race-distance'); if (distNode) distNode.textContent = `${Math.round(point.distanceM || 0)} m`;
    const boostNode = $('#race-boost'); if (boostNode) boostNode.textContent = num(boost,2);
    const boostBar = $('.v6-boost-gauge i');
    if (boostBar) boostBar.style.setProperty('--boost', `${clamp(boost/Math.max(1, state.tune.peakBoostBar || 2.5),0,1)*100}%`);
    const lights = $$('#shift-lights i');
    lights.forEach((light, i) => light.classList.toggle('on', frac > (i + 1) / 11));
    const board = $('#speed-board');
    if (board) board.innerHTML = `<span>${Math.round(point.speedKmh || 0)} km/u</span><b>G${point.gear || 1} · ${Math.round(rpm)} rpm</b><small>${num(boost,2)} bar · ${num(point.accelerationG || 0,2)} g</small>`;
  }

  function updateBurnoutDom() {
    const runtime = ensureBurnoutRuntime();
    const assessment = burnoutAssessment(runtime.tempC);
    const tempPct = clamp(runtime.tempC / Math.max(1, assessment.cautionC + 18), 0, 1) * 100;
    const tempNode = $('#tire-temp-value'); if (tempNode) tempNode.textContent = `${Math.round(runtime.tempC)}°C`;
    const bar = $('#tire-temp-bar'); if (bar) bar.style.width = `${tempPct}%`;
    const quality = $('#burnout-quality');
    if (quality) { quality.textContent = assessment.label; quality.className = assessment.cls; }
    const score = $('#burnout-score'); if (score) score.textContent = `${assessment.score}% gripvenster`;
    const card = $('#burnout-card');
    if (card) { card.classList.remove('cold','warn','good','hot'); card.classList.add(assessment.cls); }
    const rig = $('#drag-car-rig'); if (rig) rig.classList.toggle('burnout-active', !!runtime.active);
    const strip = $('#drag-strip');
    if (strip) {
      strip.style.setProperty('--smoke', runtime.active ? clamp(runtime.smoke,0,1) : clamp(runtime.smoke*.3,0,.35));
      strip.style.setProperty('--motion', runtime.active ? .16 : 0);
    }
    const rpm = runtime.active ? runtime.rpm : Math.max(900, runtime.rpm * .78);
    const boost = clamp((rpm - 2300) / 2400, 0, state.tune.peakBoostBar || 2.5) * .45;
    updateRaceHud({ rpm, speedKmh: 0, gear: 1, boostBar: boost, accelerationG: 0, distanceM: 0 });
    const split = $('#live-split');
    if (split) {
      const span = $('span', split); const b = $('b', split);
      if (span) span.textContent = runtime.active ? 'BURNOUT ACTIEF' : 'BURNOUT BOX';
      if (b) b.textContent = `${assessment.label} · ${Math.round(runtime.tempC)}°C / ${assessment.targetC}°C`;
    }
  }

  function startBurnout(pointerId = null) {
    if (activeTab !== 'drag' || racePanel !== 'tree') return;
    if (!currentCompletedDyno()) return showToast('Voer eerst een volledige, geldige dynopull uit.');
    if (racePhase === 'running') return;
    clearTreeTimers(); resetTreeBulbs();
    if (dragAnimation) { cancelAnimationFrame(dragAnimation); dragAnimation = null; }
    setRacePhase('burnout');
    const runtime = ensureBurnoutRuntime();
    if (runtime.active) return;
    runtime.active = true;
    runtime.startedAt = performance.now(); runtime.lastAt = runtime.startedAt;
    runtime.elapsed = 0; runtime.smoke = Math.max(.12, runtime.smoke || 0);
    burnoutPointerId = pointerId;
    startEngineAudio('burnout');
    haptic(16);
    const tick = now => {
      if (!runtime.active) return;
      const dt = clamp((now - runtime.lastAt) / 1000, 0, .055);
      runtime.lastAt = now; runtime.elapsed += dt;
      const profile = burnoutProfile();
      const targetRpm = clamp(Math.max(4300, Number(state.tune.launchRpm || 4200) + 1050), 4200, Number(state.tune.revLimitRpm || 8000) - 320);
      const pulse = Math.sin(runtime.elapsed * 9.3) * 85 + Math.sin(runtime.elapsed * 17.2) * 34;
      runtime.rpm += (targetRpm + pulse - runtime.rpm) * clamp(dt * 5.8, 0, 1);
      const rpmFactor = clamp((runtime.rpm - 2800) / 2800, .25, 1.2);
      const pressureFactor = clamp(1.25 - Math.abs(state.vehicle.pressureBar - (C.TIRE_MAP[state.vehicle.tireCompound]?.optimumBar || 2.2)) * .12, .78, 1.15);
      runtime.tempC = clamp(runtime.tempC + profile.heatRate * rpmFactor * pressureFactor * dt, profile.trackC, profile.cautionC + 26);
      runtime.smoke = clamp((runtime.rpm - 3000) / 2800 * (.58 + runtime.elapsed * .13), .08, 1);
      runtime.wheelSlip = clamp(.72 + runtime.smoke * .25, 0, 1);
      syncBurnoutLevel(runtime.tempC);
      updateEngineAudio(runtime.rpm, .92, runtime.wheelSlip);
      updateBurnoutDom();
      burnoutAnimation = requestAnimationFrame(tick);
    };
    burnoutAnimation = requestAnimationFrame(tick);
  }

  function stopBurnout({ silent = false } = {}) {
    const runtime = burnoutRuntime;
    if (!runtime?.active) return;
    runtime.active = false;
    if (burnoutAnimation) cancelAnimationFrame(burnoutAnimation);
    burnoutAnimation = null; burnoutPointerId = null;
    runtime.rpm = Math.max(1000, runtime.rpm * .72);
    runtime.smoke = Math.min(runtime.smoke, .35);
    syncBurnoutLevel(runtime.tempC);
    saveState();
    updateEngineAudio(1050, .12, 0);
    setTimeout(() => { if (!burnoutRuntime?.active && (!raceGame?.open || raceGame.phase === 'burnout') && racePhase === 'burnout') stopEngineAudio(); }, 420);
    updateBurnoutDom();
    if (!silent) {
      const assessment = burnoutAssessment(runtime.tempC);
      haptic(assessment.score >= 84 ? [18,28,18] : 9);
      showToast(`${assessment.label}: ${Math.round(runtime.tempC)}°C · gripvenster ${assessment.score}%.`);
    }
  }

  function idealBurnout() {
    const runtime = ensureBurnoutRuntime();
    const profile = burnoutProfile();
    runtime.active = false; runtime.tempC = profile.targetC; runtime.rpm = 1200; runtime.smoke = .18;
    syncBurnoutLevel(runtime.tempC); saveState(); updateBurnoutDom();
  }

  function resetRaceSession() {
    clearTreeTimers(); resetTreeBulbs();
    if (dragAnimation) cancelAnimationFrame(dragAnimation);
    if (burnoutAnimation) cancelAnimationFrame(burnoutAnimation);
    dragAnimation = null; burnoutAnimation = null; treeSession = null;
    stopEngineAudio({ hard: true });
    racePhase = 'burnout';
    raceLivePoint = { rpm: 900, speedKmh: 0, gear: 1, boostBar: 0, accelerationG: 0, distanceM: 0 };
    burnoutRuntime = null;
    render();
    showToast('Nieuwe run klaar. Begin met de burnout.');
  }

  function updateLiveSplit(point, result) {
    const node = $('#live-split'); if (!node) return;
    const span = $('span', node); const b = $('b', node);
    if (!span || !b) return;
    const d = Number(point.distanceM || 0);
    if (d < 18.288) { span.textContent = 'LAUNCH'; b.textContent = `${num(point.accelerationG,2)} g · ${Math.round(point.speedKmh)} km/u`; }
    else if (d < 100.584) { span.textContent = '60 FT'; b.textContent = `${result.sixtyFt.toFixed(3)} s`; }
    else if (d < 201.168) { span.textContent = '330 FT'; b.textContent = `${result.threeThirty.toFixed(3)} s`; }
    else if (d < 304.8) { span.textContent = '1/8 MIJL'; b.textContent = `${result.eighth.toFixed(3)} s · ${result.eighthKmh.toFixed(1)} km/u`; }
    else if (d < 402.336) { span.textContent = '1000 FT'; b.textContent = `${result.thousandFt.toFixed(3)} s`; }
    else { span.textContent = result.redLight ? 'ROOD LICHT' : 'FINISH'; b.textContent = `${result.quarter.toFixed(3)} s · ${result.trapKmh.toFixed(1)} km/u`; }
  }

  function finishRaceAnimation(result, point) {
    setRacePhase('finished');
    stopEngineAudio({ hard: true });
    const rig = $('#drag-car-rig'); if (rig) rig.classList.remove('running','launching');
    const strip = $('#drag-strip'); if (strip) { strip.style.setProperty('--motion', '0'); strip.style.setProperty('--smoke', '0'); }
    updateLiveSplit({ ...point, distanceM: 402.336 }, result);
    haptic(result.redLight ? [60,50,60] : [20,20,45]);
    showToast(result.redLight ? 'Rood licht — ET is wel gemeten.' : `${result.quarter.toFixed(3)} s @ ${result.trapKmh.toFixed(1)} km/u`);
  }

  function clearTreeTimers() {
    if (treeSession?.timers) treeSession.timers.forEach(clearTimeout);
  }
  function resetTreeBulbs() { $$('.bulb').forEach(b => b.classList.remove('on')); }
  function bulbs(names, on = true) { names.forEach(n => $(`[data-bulb="${n}"]`)?.classList.toggle('on', on)); }

  function stageTree(auto = false) {
    if (!currentCompletedDyno()) return showToast('Voer eerst een volledige, geldige dynopull uit.');
    if (auto) idealBurnout();
    else stopBurnout({ silent: true });
    clearTreeTimers(); resetTreeBulbs(); haptic(18);
    setRacePhase('staged');
    bulbs(['preL','preR','stageL','stageR']);
    const rig = $('#drag-car-rig');
    if (rig) { rig.classList.remove('burnout-active','running','wheelspin'); rig.classList.add('staged'); rig.style.transform = 'translate3d(3%,0,0)'; }
    const launchRpm = Number(state.tune.launchRpm || 4200);
    const launchEngine = C.interpolateCurve(state.lastDyno.samples, launchRpm);
    updateRaceHud({ rpm: launchRpm, speedKmh: 0, gear: 1, boostBar: Math.max(0, (launchEngine?.boostBar || 0) * state.tune.firstGearBoostPct / 100), accelerationG: 0, distanceM: 0 }, launchEngine);
    startEngineAudio('staged');
    updateEngineAudio(launchRpm, .72, 0);
    const baseDelay = 750 + Math.random() * 650;
    const now = performance.now();
    const plannedGreen = now + baseDelay + (treeMode === 'pro' ? 400 : 1500);
    treeSession = { plannedGreen, launched: false, timers: [] };
    const set = (delay, fn) => treeSession.timers.push(setTimeout(fn, delay));
    if (treeMode === 'pro') {
      set(baseDelay, () => { bulbs(['a1L','a1R','a2L','a2R','a3L','a3R']); updateEngineAudio(launchRpm, .90, 0); haptic(10); });
      set(baseDelay + 400, () => { bulbs(['a1L','a1R','a2L','a2R','a3L','a3R'], false); bulbs(['gL','gR']); haptic(24); });
    } else {
      set(baseDelay, () => { bulbs(['a1L','a1R']); haptic(8); });
      set(baseDelay + 500, () => { bulbs(['a1L','a1R'], false); bulbs(['a2L','a2R']); haptic(8); });
      set(baseDelay + 1000, () => { bulbs(['a2L','a2R'], false); bulbs(['a3L','a3R']); updateEngineAudio(launchRpm, .92, 0); haptic(8); });
      set(baseDelay + 1500, () => { bulbs(['a3L','a3R'], false); bulbs(['gL','gR']); haptic(24); });
    }
    showToast(auto ? 'Auto pass: banden op temperatuur en auto staged.' : 'Staged — druk LAUNCH op groen.');
    if (auto) set(plannedGreen - now + 55 + Math.random() * 75, () => launchTree(true));
  }

  function launchTree(auto = false) {
    if (!treeSession || treeSession.launched) return showToast('Druk eerst op STAGE / START TREE.');
    treeSession.launched = true;
    const rt = (performance.now() - treeSession.plannedGreen) / 1000;
    if (rt < 0) {
      clearTreeTimers();
      bulbs(['a1L','a1R','a2L','a2R','a3L','a3R','gL','gR'], false);
      bulbs(['rL','rR']); haptic([70,40,70]);
    } else haptic(30);
    runDrag(rt);
  }

  function runDrag(reactionTime) {
    try {
      stopBurnout({ silent: true });
      const result = C.simulateDrag(state, state.lastDyno, { reactionTime });
      const burn = burnoutAssessment(ensureBurnoutRuntime().tempC);
      result.burnoutTempC = ensureBurnoutRuntime().tempC;
      result.burnoutScore = burn.score;
      result.measuredAt = new Date().toISOString();
      state.lastDrag = result;
      markOnboarding('raced');
      state.dragRuns = Array.isArray(state.dragRuns) ? state.dragRuns : [];
      state.dragRuns.unshift({ ...result });
      state.dragRuns = state.dragRuns.slice(0, 30);
      const key = state.vehicle.drivetrain;
      if (result.valid && (!state.records?.[key] || result.quarter < state.records[key].quarter)) {
        state.records = state.records || { FWD:null, RWD:null, AWD:null };
        state.records[key] = { ...result, at: result.measuredAt };
        pushHistory({ type:'record', label:`Nieuw ${key}-record: ${result.quarter.toFixed(3)} s`, et:result.quarter, trap:result.trapKmh });
      }
      state.wear.engine = clamp(state.wear.engine + .05 + Math.max(0, result.quarter < 10 ? .08 : 0), 0, 100);
      state.wear.transmission = clamp(state.wear.transmission + .10 + result.wheelspinPct * .002, 0, 100);
      state.service.oilAgeKm += 35;
      pushHistory({ type: 'drag', label: result.redLight ? 'Rood licht' : 'Quarter-mile pass', et: result.quarter, trap: result.trapKmh });
      saveState(); syncAchievements();
      const box = $('#timeslip-box'); if (box) box.textContent = timeslipText(result);
      startEngineAudio('race');
      animateDrag(result);
    } catch (e) { stopEngineAudio(); showToast(e.message); }
  }

  function animateDrag(result) {
    if (dragAnimation) cancelAnimationFrame(dragAnimation);
    const strip = $('#drag-strip'), rig = $('#drag-car-rig');
    const rearWheel = $('#wheel-rear'), frontWheel = $('#wheel-front');
    if (!rig || !strip) { dragAnimation = null; return; }
    setRacePhase('running');
    rig.classList.remove('staged','burnout-active');
    rig.classList.add('running','launching');
    rig.style.transform = 'translate3d(3%,0,0)';
    strip.style.setProperty('--track-x', '0px');
    strip.style.setProperty('--motion', '.1');
    const start = performance.now();
    const reactionDelay = Math.max(0, result.reactionTime) * 1000;
    const finalPoint = result.trace[result.trace.length - 1];

    const applyPoint = point => {
      const frac = clamp(point.distanceM / 402.336, 0, 1);
      const enginePoint = C.interpolateCurve(state.lastDyno.samples, point.rpm);
      const boost = enginePoint?.boostBar || 0;
      const bob = Math.sin(point.distanceM * .22) * Math.min(1.1, point.speedKmh / 150) * .7;
      const pitch = clamp(-point.accelerationG * .75, -1.2, .7);
      rig.style.transform = `translate3d(${3 + frac * 10}%,${bob}px,0) rotate(${pitch}deg) scale(${1 + clamp(point.accelerationG,0,1.5)*.012})`;
      strip.style.setProperty('--track-x', `${-point.distanceM * 7.4}px`);
      strip.style.setProperty('--motion', `${clamp(point.speedKmh / 285, 0, 1)}`);
      const launchSmoke = point.distanceM < 52 ? clamp(result.wheelspinPct / 42 * (1 - point.distanceM/52),0,.8) : 0;
      strip.style.setProperty('--smoke', `${launchSmoke}`);
      rig.classList.toggle('wheelspin', launchSmoke > .18);
      const circumference = Math.max(.4, C.wheelFitment(state.vehicle).circumferenceM);
      const rotation = (point.distanceM / circumference * 360) % 360;
      if (rearWheel) rearWheel.style.transform = `rotate(${rotation}deg)`;
      if (frontWheel) frontWheel.style.transform = `rotate(${rotation}deg)`;
      updateRaceHud({ ...point, boostBar: boost }, enginePoint);
      updateLiveSplit(point, result);
      updateEngineAudio(point.rpm, Math.max(.18, (enginePoint?.turboLoadPct || 20) / 100), launchSmoke);
    };

    if (state.settings?.reducedMotion) {
      applyPoint(finalPoint);
      strip.style.setProperty('--track-x', `${-402.336 * 7.4}px`);
      dragAnimation = null;
      finishRaceAnimation(result, finalPoint);
      return;
    }

    const scale = .48;
    let lastGear = 1;
    const frame = now => {
      const elapsed = now - start;
      if (elapsed < reactionDelay) {
        const launchRpm = Number(state.tune.launchRpm || 4200);
        const shake = Math.sin(elapsed * .045) * .65;
        rig.style.transform = `translate3d(3%,${shake}px,0)`;
        updateEngineAudio(launchRpm, .88, 0);
        dragAnimation = requestAnimationFrame(frame);
        return;
      }
      const raceT = (elapsed - reactionDelay) / 1000 / scale;
      let point = finalPoint;
      for (let i = 0; i < result.trace.length; i++) { if (result.trace[i].time >= raceT) { point = result.trace[i]; break; } }
      applyPoint(point);
      if (point.gear !== lastGear) {
        haptic(12); engineShiftPop(clamp(.45 + point.gear * .08, .45, 1)); lastGear = point.gear;
        rig.classList.remove('launching');
      }
      if (raceT < result.quarter) dragAnimation = requestAnimationFrame(frame);
      else {
        dragAnimation = null;
        applyPoint(finalPoint);
        finishRaceAnimation(result, finalPoint);
      }
    };
    dragAnimation = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------
     V7 FULLSCREEN DRAG GAME
     Separate scenes: side-view burnout, rear-view staging/tree, rear chase run.
     ------------------------------------------------------------------ */
  function v7TreeMarkup(preview = false) {
    const names = ['preL','preR','stageL','stageR','a1L','a1R','a2L','a2R','a3L','a3R','gL','gR','rL','rR'];
    return `<div class="v7-tree ${preview ? 'preview' : ''}" aria-label="Drag race startboom">${names.map((name,index) => {
      const type = index < 2 ? 'pre' : index < 4 ? 'stage' : index < 10 ? 'amber' : index < 12 ? 'green' : 'red';
      const previewOn = preview && (index < 4 || index === 10 || index === 11);
      return `<i class="v7-bulb ${type} ${previewOn ? 'on' : ''}" ${preview ? '' : `data-v7-bulb="${name}"`}></i>`;
    }).join('')}</div>`;
  }

  function v7TachMarkup(prefix, rpm = 900, gear = 1, maxRpm = null) {
    const limit = Math.max(6500, Number(maxRpm || state.tune.revLimitRpm || 8000));
    const fraction = clamp(Number(rpm || 0) / limit, 0, 1);
    return `<div class="v7-tach" id="${prefix}-tach" style="--rpm-frac:${fraction};--tach-angle:${fraction * 252}deg;--limit:${limit}">
      <div class="v7-tach-ring"></div>
      <div class="v7-tach-numbers"><span>0</span><span>2</span><span>4</span><span>6</span><span>8</span></div>
      <div class="v7-tach-readout"><b id="${prefix}-rpm">${Math.round(rpm)}</b><small>RPM</small><strong id="${prefix}-gear">${gear}</strong></div>
      <div class="v7-shift-strip" id="${prefix}-shift-strip">${Array.from({length:12},(_,i)=>`<i data-shift-light="${i}"></i>`).join('')}</div>
    </div>`;
  }

  function v7GameHeader(label, step, hint = '') {
    const dyno = currentCompletedDyno() ? state.lastDyno : null;
    const hp = dyno ? Math.round(dyno.peakHp) : '?';
    const nm = dyno ? Math.round(dyno.peakTorqueNm) : '?';
    return `<header class="v8-game-header">
      <div class="v8-game-brand"><strong>EA888 <em>LAB</em></strong><small>BOUW · MEET · OVERLEEF · RACE</small></div>
      <div class="v8-game-output"><span>${hp} pk</span><span>${nm} Nm</span></div>
      <div class="v8-game-actions"><button data-action="toggle-v7-audio" aria-label="Geluid aan of uit">${state.settings?.sound ? '🔊' : '🔇'}</button><button data-action="close-drag-game" aria-label="Sluit drag mode">${icon('back')}</button></div>
      <div class="v8-phase-title"><span>${step}/3</span><b>${esc(label)}</b><small>${esc(hint)}</small></div>
    </header>`;
  }

  function v7GameProgress(active) {
    const labels = ['BURNOUT','STAGE','RACE'];
    return `<div class="v8-game-progress">${labels.map((label,i)=>`<span class="${i < active ? 'done' : i === active ? 'active' : ''}"><i>${i+1}</i><b>${label}</b></span>`).join('<em>›</em>')}</div>`;
  }

  function renderV7BurnoutScene() {
    const p = burnoutProfile();
    const rival = raceGame?.rivalProfile;
    const b = raceGame.burn;
    const targetLeft = clamp((p.targetC - 8) / (p.cautionC + 18) * 100, 0, 100);
    const targetWidth = clamp(18 / (p.cautionC + 18) * 100, 8, 24);
    return `<div class="v8-game v8-burnout-game drive-${String(state.vehicle.drivetrain).toLowerCase()}">
      <div class="v8-scene-plate v8-burnout-plate"></div><canvas id="race3d-canvas" class="race3d-canvas" aria-hidden="true"></canvas><div class="v8-cinematic-shade"></div>
      ${v7GameHeader('BURNOUT', 1, 'Warm de aangedreven banden op zonder ze te oververhitten')}
      <main class="v8-burnout-scene">
        <section class="v8-burnout-hud">
          ${v7TachMarkup('v7-burn', b.rpm, 1)}
          <div class="v8-round-gauge"><span>BOOST</span><b id="v8-burn-boost">0.00</b><small>bar</small><i></i></div>
          <div class="v8-temp-card"><span>BAND OPPERVLAK</span><b id="v7-burn-temp">${Math.round(b.surfaceC ?? b.tempC)}°C</b><small id="v7-burn-temp-sub">launch ≈ ${Math.round(b.tempC)}°C · doel ${p.targetC}°C</small><div><i id="v7-temp-fill"></i><em id="v7-temp-marker"></em><strong style="left:${targetLeft}%;width:${targetWidth}%"></strong></div></div>
          <div class="v8-wheelspin-card"><span>BAND SLIP</span><b id="v8-burn-wheelspin">0 km/u</b><small id="v7-burn-time">${b.timeLeft.toFixed(1)} s over</small></div>
        </section>
        <div class="v8-burn-smoke" id="v8-burn-smoke">${Array.from({length:14},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>
        ${rival ? `<div class="v12-event-opponent"><img src="images/rival-scirocco.svg" alt="Rivaal"><span>VOLGENDE: ${rival.tag}</span><b>${esc(rival.name)}</b></div>` : ''}
        <div class="v8-burnout-status" id="v7-burn-instruction"><b>HOUD VAST VOOR BURNOUT</b><span>Laat los om te stoppen. Houd rpm in de oranje zone en mik op de groene temperatuurband.</span></div>
        <div class="v8-burn-score"><b id="v7-burn-label">KOUD</b><span id="v7-burn-score">0% gripvenster</span></div>
        <button class="v8-burnout-button" id="v7-burn-throttle" data-v7-control="burnout"><span>HOUD VAST VOOR BURNOUT</span><small>LAAT LOS OM TE STOPPEN</small></button>
      </main>
      ${v7GameProgress(0)}
    </div>`;
  }

  function renderV7StageScene() {
    const s = raceGame.stage;
    const rival = raceGame?.rivalProfile;
    const ready = s.staged && !s.deep;
    const launchLabel = s.green ? 'LAAT LOS!' : s.treeStarted ? 'HOUD VAST' : ready ? 'HOUD VOOR LAUNCH' : 'LAUNCH VERGRENDELD';
    return `<div class="v8-game v8-stage-game ${ready ? 'is-staged' : ''} ${rival?'has-rival':''}">
      <div class="v8-scene-plate v8-stage-plate"></div><canvas id="race3d-canvas" class="race3d-canvas" aria-hidden="true"></canvas><div class="v8-cinematic-shade"></div>
      ${v7GameHeader('STAGE & TREE', 2, treeMode === 'pro' ? 'Pro tree · release op groen' : 'Sportsman tree · release op groen')}
      <main class="v8-stage-scene">
        <section class="v8-stage-hud">
          ${v7TachMarkup('v7-stage', s.rpm, 1)}
          <div class="v8-round-gauge"><span>BOOST</span><b id="v8-stage-boost">0.00</b><small>bar</small><i></i></div>
        </section>
        <div class="v13-turbo-hud" id="v13-stage-turbo"><span>TURBO<b id="v13-stage-shaft">0k</b></span><span>EGT<b id="v13-stage-egt">—</b></span><span>ALS<b id="v13-stage-als">${raceGame?.alsInfo?.enabled ? 'GEREED' : 'UIT'}</b></span><span>SLIJTAGE<b id="v13-stage-wear">+0.000%</b></span><span>BAND<b id="v13-stage-tyre">—</b></span></div>
        <div class="v8-tree-wrap"><div class="v8-tree-copy"><span>PRE-STAGE</span><span>STAGE</span></div>${v7TreeMarkup(false)}</div>
        ${rival ? `<div class="v12-stage-rival"><img src="images/rival-scirocco.svg" alt="${esc(rival.name)}"><span>${rival.tag}</span><b>${esc(rival.name)}</b><small>RT-venster ${rival.reactionMin.toFixed(3)}–${rival.reactionMax.toFixed(3)} s</small></div>` : ''}
        <div class="v8-stage-message"><span id="v7-stage-status">KRUIP NAAR PRE-STAGE</span><b id="v7-stage-depth">${Math.round(s.progress)}%</b></div>
        <div class="v8-rpm-hold"><span>HOUD TOERENTAL VAST</span><div><i id="v8-stage-rpm-fill"></i><em></em></div><b><strong id="v8-stage-rpm-number">${Math.round(s.rpm)}</strong> RPM</b></div>
        <div class="v8-stage-beam"><i class="pre-zone"></i><i class="stage-zone"></i><em id="v7-stage-marker" style="left:${s.progress}%"></em></div>
        <div class="v8-stage-actions with-als">
          <button class="v8-stage-button creep" data-v7-control="creep"><span>↕</span><b>CREEP / STAGE</b><small>HOUD KORT VAST</small></button>
        ${(() => {
          const als = raceGame?.alsInfo;
          const why = !als ? '' : als.capability.ecuLevel === 'none' ? `${als.capability.ecuName}: geen anti-lag` : als.mode === 'off' ? 'Anti-lag staat uit (Tune → Anti-lag)' : '';
          return `<button class="v8-stage-button v13-als-button ${als?.enabled ? '' : 'off'}" id="v13-als-button" data-v7-control="antilag" ${als?.enabled ? '' : 'disabled'}><span>ALS</span><b>HOLD ANTILAG</b><small>${als?.enabled ? `${esc(ALS_MODE_LABELS[als.mode][0])} · doel ${als.params.targetBoostBar.toFixed(1)} bar · max EGT ${Math.round(als.params.maxEgtC)} °C` : esc(why)}</small></button>`;
        })()}

          <button class="v8-stage-button launch ${ready ? 'ready' : ''} ${s.treeStarted ? 'armed' : ''} ${s.green ? 'go' : ''}" id="v7-launch-button" data-v7-control="throttle" ${ready && !s.launched ? '' : 'disabled'}><span>»</span><b>${launchLabel}</b><small>${ready ? 'vasthouden voor rpm · loslaten om te gaan' : 'rij eerst volledig in stage'}</small></button>
        </div>
        ${s.deep ? '<button class="v8-reset-stage" data-action="v7-reset-stage">TE DIEP GESTAGED · OPNIEUW</button>' : ''}
      </main>
      <div class="ea-flame-layer" id="ea-stage-flame-layer" aria-hidden="true"><div class="ea-flame-host stage" id="ea-stage-flames"><span class="ea-flame-sustain left"></span><span class="ea-flame-sustain right"></span><span class="v7-flame left"></span><span class="v7-flame right"></span></div></div>
      ${v7GameProgress(1)}
    </div>`;
  }

  function renderV7RunScene() {
    const r = raceGame.run;
    const point = r?.point || {rpm:state.tune.launchRpm,gear:1,speedKmh:0,distanceM:0,boostBar:0,lateralM:0};
    const dsg = !!r?.autoShift;
    const shiftControl = dsg
      ? `<div class="v9-dsg-control v10-dsg-control" id="v7-dsg-status"><small>TRANSMISSIE</small><span>DSG AUTO</span><b id="v7-shift-cue">VOL AUTOMATISCH</b></div>`
      : `<button class="v8-shift-button v9-shift-button v10-shift-button" id="v7-shift-button" data-action="v7-shift"><small>TIK OM TE SCHAKELEN</small><span>SHIFT</span><b id="v7-shift-cue">WACHT</b></button>`;
    const opponent = r?.opponent;
    const raceSubtitle = opponent ? `Heads-up tegen ${opponent.profile.name} · stuur en schakel onder druk` : (dsg ? 'DSG schakelt zelf · stuur tussen de lijnen' : 'Schakel zelf · stuur tussen de lijnen');
    return `<div class="v8-game v8-run-game v9-realtime-race v10-realtime-race v12-heads-up-race ${opponent?'has-rival':'solo-run'}" data-transmission-mode="${dsg ? 'dsg-auto' : 'manual'}">
      <div class="v10-track-stage" id="v10-track-stage" aria-label="Realtime dragstrip">
        <div class="v10-track-horizon"></div>
        <canvas id="v10-track-canvas" class="v10-track-canvas"></canvas>
        <canvas id="race3d-canvas" class="race3d-canvas" aria-hidden="true"></canvas>
        <div class="v10-track-vignette"></div>
      </div>
      ${v7GameHeader(opponent ? 'HEADS-UP QUARTER MILE' : 'REAL-TIME QUARTER MILE', 3, raceSubtitle)}
      <main class="v8-run-scene v9-run-scene v10-run-scene" id="v7-run-scene">
        <section class="v8-run-hud v9-run-hud v10-run-hud">
          ${v7TachMarkup('v7-run', point.rpm, point.gear)}
          <div class="v8-round-gauge v10-boost"><span>BOOST</span><b id="v7-run-boost">0.00</b><small>bar</small><i id="v7-run-boost-bar"></i></div>
          <div class="v8-speed-card v10-speed"><span>SNELHEID</span><b id="v7-run-speed">0</b><small>km/u</small></div>
          <div class="v8-timer-card v10-timer"><span>TIJD</span><b id="v7-run-et">0.000</b><small>s</small></div>
        </section>
        <div class="v8-split-board v9-split-board v10-split-board"><span><i id="v8-split-60"></i>60 FT <b id="v8-time-60">—</b></span><span><i id="v8-split-330"></i>330 FT <b id="v8-time-330">—</b></span><span><i id="v8-split-8"></i>1/8 MIJL <b id="v8-time-8">—</b></span><span><i id="v8-split-4"></i>1/4 MIJL <b id="v8-time-4">—</b></span></div>
        ${opponent ? `<div class="v12-rival-hud" id="v12-rival-hud"><span>${opponent.profile.tag} RIVAAL</span><b>${esc(opponent.profile.name)}</b><small id="v12-rival-gap">TREE: ${opponent.reactionTime.toFixed(3)} s</small></div><div class="v12-rival-car" id="v12-rival-car"><img src="images/rival-scirocco.svg" alt="Graphite Scirocco-rivaal"><i></i></div>` : ''}
        <div class="v9-live-car v10-live-car" id="v7-run-car"><img src="images/randy-scirocco-race-v10.png" alt="Randy's blauwe Scirocco van achteren"><span class="ea-flame-sustain left"></span><span class="ea-flame-sustain right"></span><span class="v7-flame left"></span><span class="v7-flame right"></span><b class="v9-car-smoke"></b></div>
        <div class="v7-speed-lines v10-speed-lines" id="v7-speed-lines"></div>
        <div class="v8-run-progress v9-run-progress v10-run-progress"><i id="v7-run-progress"></i><span id="v7-run-distance">0 m</span><b id="v7-run-split">LAUNCH</b><em>402 m</em></div>
        <div class="v9-lane-status v10-lane-status" id="v9-lane-status"><span>LIJNPOSITIE</span><b>IN LIJN</b><div><i id="v9-lane-marker"></i></div></div>
        <div class="v7-shift-feedback v9-shift-feedback v10-shift-feedback" id="v7-shift-feedback">HOUD HEM TUSSEN DE LIJNEN</div>
        <div class="v9-drive-controls v10-drive-controls">
          <button class="v9-steer-button v10-steer-button left" data-v7-control="steerLeft"><span>◀</span><b>LINKS</b></button>
          ${shiftControl}
          <button class="v9-steer-button v10-steer-button right" data-v7-control="steerRight"><b>RECHTS</b><span>▶</span></button>
        </div>
        <div class="v8-run-telemetry v9-run-telemetry v10-run-telemetry"><span><b id="v7-run-g">0.00 g</b>acceleratie</span><span><b id="v7-run-wheelspin">0%</b>wheelspin</span><span><b id="v13-run-shaft">—</b>turbo-as</span><span><b id="v13-run-egt">—</b>EGT</span></div>
        <div class="v12-driveline-hud"><span><b id="v12-clutch-temp">58°C</b>koppeling</span><span><b id="v12-gearbox-temp">66°C</b>bak</span><span><b id="v12-stress">0%</b>stress</span></div>
      </main>
    </div>`;
  }

  function renderV7FinishScene() {
    const r = raceGame.finishResult || raceGame.run?.finalResult || state.lastDrag;
    const invalid = !!(r?.redLight || r?.laneDnf || r?.valid === false);
    const headsUp = r?.raceMode === 'heads_up' && r?.opponentName;
    const shiftText = r?.transmissionMode === 'DSG AUTO'
      ? 'DQ250 automatisch'
      : `${r?.perfectShifts || 0} perfect · ${r?.earlyShifts || 0} vroeg · ${r?.lateShifts || 0} laat`;
    const status = r?.redLight ? 'ROOD LICHT' : r?.laneDnf ? 'BUITEN DE BAAN' : r?.valid === false ? 'RUN ONGELDIG' : headsUp ? (r.won ? 'HEADS-UP GEWONNEN' : 'HEADS-UP VERLOREN') : 'GELDIGE RUN';
    const outcomeClass = invalid ? 'invalid' : headsUp ? (r.won ? 'win' : 'loss') : 'valid';
    const delta = headsUp ? `${Math.abs(Number(r.raceDeltaS || 0)).toFixed(3)} s ${r.won ? 'voorsprong' : 'achterstand'}` : '';
    return `<div class="v8-game v8-finish-game v12-finish-game ${invalid ? 'redlight' : ''} ${outcomeClass}">
      <div class="v8-scene-plate v8-race-plate finish"></div><div class="v8-cinematic-shade finish"></div>
      ${v7GameHeader(status, 3, headsUp ? `${r.opponentName} · ${delta}` : 'De echte timeslip en rijlijn worden opgeslagen')}
      <main class="v8-finish-scene">
        <div class="v8-finish-card v12-finish-card">
          <span>${esc(status)}</span>
          <h1>${r ? r.quarter.toFixed(3) : '—'} <small>s</small></h1>
          <h2>${r ? r.trapKmh.toFixed(1) : '—'} km/u</h2>
          ${r?.career ? `<div class="career-round-line ${r.career.won ? 'win' : 'loss'}"><b>Ronde ${r.career.round} · ${r.career.won ? 'door' : 'uitgeschakeld'}</b><span>${esc(r.career.reason)}${r.career.format === 'bracket' ? ` · dial ${r.career.dialIn.toFixed(2)} / ET ${r.quarter.toFixed(3)}` : ''}</span></div>` : ''}
          ${headsUp ? `<div class="v12-duel-result"><section><small>JIJ</small><b>${r.finishTotalTime.toFixed(3)} s</b><span>RT ${r.reactionTime.toFixed(3)} · ET ${r.quarter.toFixed(3)}</span></section><em>VS</em><section><small>${esc(r.opponentName)}</small><b>${r.opponentFinishTotalTime.toFixed(3)} s</b><span>RT ${r.opponentReactionTime.toFixed(3)} · ET ${r.opponentQuarter.toFixed(3)}</span></section></div>` : ''}
          <div class="v12-finish-data"><b>Reactietijd</b><span>${r ? `${r.reactionTime >= 0 ? '+' : ''}${r.reactionTime.toFixed(3)} s` : '—'}</span><b>60 ft</b><span>${r ? `${r.sixtyFt.toFixed(3)} s` : '—'}</span><b>1/8 mijl</b><span>${r ? `${r.eighth.toFixed(3)} s` : '—'}</span><b>Schakelen</b><span>${esc(shiftText)}</span><b>Rijlijn</b><span>${r ? `${Number(r.maxLaneOffsetM || 0).toFixed(2)} m max · ${r.lineTouches || 0} correcties` : '—'}</span><b>Aandrijflijn</b><span>${r ? `${Number(r.maxClutchTempC||0).toFixed(0)}°C koppeling · ${Number(r.maxGearboxTempC||0).toFixed(0)}°C bak` : '—'}</span>${r?.reward ? `<b>Winstpremie</b><span class="reward">+${euro(r.reward)}</span>` : ''}</div>
          <div class="v13-finish-actions">
            ${replayAvailable() ? '<button class="v8-finish-button secondary" data-action="finish-replay">BEKIJK REPLAY</button>' : ''}
            <button class="v8-finish-button" data-action="finish-to-overview">NAAR RACEOVERZICHT</button>
          </div>
        </div>
      </main>
      ${raceGame?.replayOpen ? '' : v7GameProgress(3)}
      ${raceGame?.replayOpen ? `<div class="v13-replay" role="dialog" aria-label="Replay">
        <canvas id="race3d-replay" class="v13-replay-canvas"></canvas>
        <div class="v13-replay-top"><span class="v13-replay-tag" id="replay-state">REPLAY · ${r ? r.quarter.toFixed(3) + ' s' : ''}</span></div>
        <div class="v13-replay-bottom">
          <div class="v13-replay-track"><i id="replay-progress"></i></div>
          <div class="v13-replay-buttons">
            <button class="v8-finish-button secondary" data-action="replay-restart">OPNIEUW</button>
            <button class="v8-finish-button" data-action="replay-close">SLUIT REPLAY</button>
          </div>
        </div>
      </div>` : ''}
    </div>`;
  }

  function renderRaceGame() {
    const root = $('#race-game-root');
    if (!root) return;
    if (!raceGame?.open) { root.innerHTML = ''; document.body.classList.remove('race-game-open'); return; }
    document.body.classList.add('race-game-open');
    if (raceGame.phase === 'burnout' || raceGame.phase === 'burnout-result') root.innerHTML = renderV7BurnoutScene();
    else if (raceGame.phase === 'stage') root.innerHTML = renderV7StageScene();
    else if (raceGame.phase === 'run') root.innerHTML = renderV7RunScene();
    else if (raceGame.phase === 'finish') root.innerHTML = renderV7FinishScene();
    requestAnimationFrame(() => {
      if (!raceGame?.open) return;
      if (raceGame.phase.startsWith('burnout')) { startPreRace3D(); updateV7BurnoutDom(); }
      else if (raceGame.phase === 'stage') { startPreRace3D(); positionStageFlames(); updateV7StageDom(); }
      else if (raceGame.phase === 'run') updateV7RunDom(raceGame.run?.point || null);
    });
  }

  function clearRaceGameTimers() {
    raceGameTimers.forEach(id => clearTimeout(id));
    raceGameTimers = [];
  }

  // Exhaust flames are only drawn for simulated combustion events (C.exhaustFlameEvent).
  function emitExhaustFlame(host, fe) {
    if (!host || !fe?.visible) return false;
    if ((host.id === 'v7-run-car' || host.id === 'ea-stage-flames') && raceGame?.r3d) raceGame.r3d.flame(fe);
    if (host.id === 'v7-run-car' && raceGame?.phase === 'run' && raceGame.run) (raceGame.run.replayFlames = raceGame.run.replayFlames || []).push({ t: raceGame.run.t, fe });
    const flames = $$('.v7-flame', host);
    flames.forEach((f, i) => {
      f.style.setProperty('--flame-scale', (fe.sizeScale * (i % 2 ? 1.08 : .94)).toFixed(3));
      f.style.setProperty('--flame-ms', `${fe.durationMs}ms`);
      f.dataset.color = fe.color;
      f.classList.remove('fire'); void f.offsetWidth; f.classList.add('fire');
    });
    if (raceGame) {
      raceGame.flameLog = raceGame.flameLog || [];
      raceGame.flameLog.push({ kind: fe.kind, intensity: +fe.intensity.toFixed(3), color: fe.color, phase: raceGame.phase });
      if (raceGame.flameLog.length > 200) raceGame.flameLog.shift();
    }
    return true;
  }
  function makeRaceTurbo() {
    try { return C.createTurboRuntime(state); } catch (e) { return null; }
  }
  // Continuous ALS pops at the simulated pop rate while ALS fires.
  // Sustained ALS flame: bangs that follow each other faster than a flame dies out overlap into one
  // continuous flame (snap.flameSustain from the runtime); it flickers, the pops ride on top.
  function setFlameSustain(host, snap) {
    if (!host) return;
    const k = snap?.alsActive ? clamp(Number(snap.flameSustain || 0), 0, 1) : 0;
    const color = snap?.flame?.color || 'orange';
    if ((host.id === 'v7-run-car' || host.id === 'ea-stage-flames') && raceGame?.r3d) raceGame.r3d.sustain(k, color);
    $$('.ea-flame-sustain', host).forEach((n, i) => {
      n.style.setProperty('--sustain', k.toFixed(3));
      n.style.setProperty('--sustain-scale', (.5 + Number(snap?.flame?.sizeScale || 0) * .5 * (i % 2 ? 1.06 : .95)).toFixed(3));
      if (n.dataset.color !== color) n.dataset.color = color;
      n.classList.toggle('on', k > .02);
    });
  }
  function tickAlsFlames(snap, dt, host) {
    setFlameSustain(host, snap);
    if (!raceGame || !snap?.alsActive || !snap.flame?.visible) { if (raceGame) raceGame.popClock = 0; return; }
    raceGame.popClock = (raceGame.popClock || 0) + dt * snap.popRateHz;
    if (raceGame.popClock >= 1) { raceGame.popClock = 0; emitExhaustFlame(host, snap.flame); }
  }
  function positionStageFlames() {
    const plate = $('#ea-stage-flame-layer') || $('.v8-stage-plate'), host = $('#ea-stage-flames');
    if (!plate || !host) return;
    const pw = plate.offsetWidth, ph = plate.offsetHeight, ar = 941 / 1672;
    const iw = pw / ph > ar ? pw : ph * ar, ih = pw / ph > ar ? pw / ar : ph;
    const ox = (pw - iw) / 2, oy = (ph - ih) / 2;
    [[.291, .612], [.708, .612]].forEach(([x, y], i) => {
      const w = iw * .11;
      for (const f of [$$('.v7-flame', host)[i], $$('.ea-flame-sustain', host)[i]]) {
        if (!f) continue;
        f.style.width = `${w}px`; f.style.height = `${w}px`;
        f.style.left = `${ox + x * iw - w / 2}px`; f.style.top = `${oy + y * ih - w / 2}px`;
      }
    });
  }
  function alsStatusText(snap) {
    const als = raceGame?.alsInfo;
    if (!als?.enabled) return 'UIT';
    if (!snap) return 'GEREED';
    if (snap.alsLockoutS > 0) return `COOLDOWN ${Math.ceil(snap.alsLockoutS)} s`;
    if (snap.alsActive) return snap.alsLimitedBy === 'EGT-limiet' ? 'EGT-LIMIET' : snap.alsLimitedBy === 'as-limiet' ? 'AS-LIMIET' : `ACTIEF ${Math.round(snap.alsIntensity * 100)}%`;
    return 'GEREED';
  }
  function applyRaceTurboWear() {
    if (!raceGame?.turbo || raceGame.turboWearApplied) return;
    raceGame.turboWearApplied = true;
    state = C.applyRuntimeWear(state, raceGame.turbo.state);
    if (raceGame.turbo.state.alsSeconds > 0.2) pushHistory({ type: 'als', label: `Anti-lag ${raceGame.turbo.state.alsSeconds.toFixed(1)} s · EGT max ${Math.round(raceGame.turbo.state.maxEgtC)} °C` });
  }

  function startDragGame(auto = false) {
    if (!currentCompletedDyno()) return showToast('Voer eerst een volledige, geldige dynopull uit.');
    closeDragGame({ silent:true, noRender:true });
    const profile = burnoutProfile();
    const startingTemp = clamp(profile.trackC + 2, profile.trackC, profile.targetC - 8);
    burnoutRuntime = { key:`${profile.id}:${profile.trackC}:${state.vehicle.drivetrain}`, tempC:startingTemp, rpm:900, active:false, smoke:0, wheelSlip:0, startedAt:0, lastAt:0, elapsed:0 };
    raceGameAuto = !!auto;
    raceGamePointer = { burnout:false, creep:false, throttle:false, steerLeft:false, steerRight:false, antilag:false };
    raceGame = {
      open:true,
      phase:'burnout',
      startedAt:performance.now(),
      burn:{
        rpm:900, tempC:startingTemp, timeLeft:state.settings?.reducedMotion ? (auto ? .9 : 3.5) : 8.0,
        duration:state.settings?.reducedMotion ? (auto ? .9 : 3.5) : 8.0, started:false, done:false,
        smoke:0, elapsed:0, qualityIntegral:0, qualityTime:0, score:0, label:'KOUD'
      },
      stage:{ progress:0, rpm:900, staged:false, deep:false, treeStarted:false, plannedGreen:0, green:false, launched:false, stagedSince:0, launchArmed:false },
      run:null,
      finishResult:null,
      rivalProfile:raceIsHeadsUp() ? selectedRival() : null,
      turbo:makeRaceTurbo(),
      alsInfo:C.resolveAntiLag(state),
      flameLog:[],
      popClock:0,
      turboWearApplied:false
    };
    // Burnout on the vehicle model; the tyres start at the track temperature (the car rolled in cold).
    try {
      raceGame.burnRt = C.createBurnoutRuntime(state, { turbo: raceGame.turbo, targetRpm: 5000, startC: profile.trackC });
      raceGame.tyreThermal = { ...raceGame.burnRt.tyreThermal };
      Object.assign(raceGame.burn, { surfaceC: profile.trackC, bulkC: profile.trackC, tempC: predictedLaunchTyreC(raceGame.burnRt.tyreThermal) });
    } catch (e) { logAppError('burnout', e); }
    raceGameLastFrame = performance.now();
    renderRaceGame();
    startEngineAudio('burnout');
    updateEngineAudio(900,.12,0);
    haptic([16,25,16]);
    startRaceGameLoop();
  }

  function closeDragGame(options = {}) {
    if (raceGame?.turbo && !raceGame.turboWearApplied) { applyRaceTurboWear(); saveState(); }
    if (raceGameRaf) cancelAnimationFrame(raceGameRaf);
    raceGameRaf = null;
    disposeRace3D();
    disposeReplay();
    clearRaceGameTimers();
    raceGamePointer = { burnout:false, creep:false, throttle:false, steerLeft:false, steerRight:false, antilag:false };
    raceGamePointerMap.clear();
    stopEngineAudio({ hard: true });
    raceGame = null;
    raceGameAuto = false;
    document.body.classList.remove('race-game-open');
    const root = $('#race-game-root'); if (root) root.innerHTML = '';
    if (!options.silent) showToast('Drag mode gesloten.');
    if (!options.noRender && activeTab === 'drag') render();
  }

  function startRaceGameLoop() {
    if (raceGameRaf) cancelAnimationFrame(raceGameRaf);
    raceGameLastFrame = performance.now();
    const frame = now => {
      if (!raceGame?.open) { raceGameRaf = null; return; }
      const dt = clamp((now - raceGameLastFrame) / 1000, 0, .05);
      raceGameLastFrame = now;
      if (raceGame.phase === 'burnout') updateV7BurnoutGame(dt, now);
      else if (raceGame.phase === 'burnout-result') updatePreRace3D('burnout', dt); // the smoke clears
      else if (raceGame.phase === 'stage') updateV7StageGame(dt, now);
      else if (raceGame.phase === 'run') updateV7RunGame(dt, now);
      raceGameRaf = requestAnimationFrame(frame);
    };
    raceGameRaf = requestAnimationFrame(frame);
  }

  function updateV7Tach(prefix, rpm, gear = 1) {
    const limit = Math.max(6500, Number(state.tune.revLimitRpm || 8000));
    const fraction = clamp(Number(rpm || 0) / limit, 0, 1);
    const tach = $(`#${prefix}-tach`); if (tach) { tach.style.setProperty('--rpm-frac', fraction); tach.style.setProperty('--tach-angle', `${fraction * 252}deg`); }
    const rpmNode = $(`#${prefix}-rpm`); if (rpmNode) rpmNode.textContent = Math.round(rpm);
    const gearNode = $(`#${prefix}-gear`); if (gearNode) gearNode.textContent = gear;
    $$(`#${prefix}-shift-strip i`).forEach((node,i) => {
      node.classList.toggle('on', fraction > .54 + i * .035);
      node.classList.toggle('red', fraction > .91 && i > 8);
    });
  }

  function updateV7BurnoutGame(dt, now) {
    const b = raceGame.burn;
    const profile = burnoutProfile();
    const rt = raceGame.burnRt;
    let throttle = !!raceGamePointer.burnout;
    // auto driver: until the tyre is on course for the optimum at the launch
    if (raceGameAuto) throttle = !b.done && predictedLaunchTyreC(rt.tyreThermal) < profile.targetC - 1;
    if (throttle && !b.started) { b.started = true; b.startAt = now; raceGameTone(520,.06,.025); }
    // Physical burnout (sim.js createBurnoutRuntime): engine, clutch, spinning tyres, slip power, tyre heat.
    const p = rt.step(dt, { throttle });
    b.rpm = p.rpm; b.surfaceC = p.tyreSurfaceC; b.bulkC = p.tyreBulkC; b.smoke = p.smoke;
    b.slipKmh = p.tyreSurfaceKmh; b.slipKw = p.slipPowerKw; b.boostBar = p.boostBar;
    // what counts is the grip temperature expected at the launch after rolling to the line and staging
    b.tempC = predictedLaunchTyreC(rt.tyreThermal);
    if (b.started) b.timeLeft = Math.max(0, b.timeLeft - dt);
    b.elapsed += dt;
    const slip = clamp(p.tyreSurfaceKmh / 45, 0, 1);
    burnoutRuntime.rpm = b.rpm; burnoutRuntime.tempC = b.tempC; burnoutRuntime.smoke = b.smoke; burnoutRuntime.active = throttle; burnoutRuntime.wheelSlip = slip;
    updateEngineAudio(b.rpm, throttle ? Math.max(.2, p.pedal) : .12, slip, { boostBar: p.boostBar, mapBar: p.mapBarAbs, egtC: p.egtC, lambda: p.lambda, cutFraction: p.limiter ? 1 : 0, cutKind: limiterCutKind() });
    updateV7BurnoutDom();
    updatePreRace3D('burnout', dt);
    if (b.started && b.timeLeft <= 0 && !b.done) finishV7Burnout();
  }

  function updateV7BurnoutDom() {
    if (!raceGame?.burn) return;
    const b = raceGame.burn;
    const assessment = burnoutAssessment(b.tempC);
    const profile = burnoutProfile();
    const tempPct = clamp((b.tempC - Math.min(0,profile.trackC)) / Math.max(1,profile.cautionC+18) * 100,0,100);
    const combined = assessment.score;
    b.score = combined;
    b.label = assessment.label;

    updateV7Tach('v7-burn', b.rpm, 1);
    const time = $('#v7-burn-time');
    if (time) time.textContent = `${Math.round(b.slipKw || 0)} kW slip · ${b.timeLeft.toFixed(1)} s`;
    const temp = $('#v7-burn-temp');
    if (temp) temp.textContent = `${Math.round(b.surfaceC ?? b.tempC)}°C`;
    const tempSub = $('#v7-burn-temp-sub');
    if (tempSub) tempSub.textContent = `kern ${Math.round(b.bulkC ?? b.tempC)}° · launch ≈ ${Math.round(b.tempC)}° · doel ${profile.targetC}°`;
    const fill = $('#v7-temp-fill');
    if (fill) fill.style.width = `${tempPct}%`;
    const marker = $('#v7-temp-marker');
    if (marker) marker.style.left = `${tempPct}%`;
    const label = $('#v7-burn-label');
    if (label) { label.textContent = assessment.label; label.className = assessment.cls; }
    const score = $('#v7-burn-score');
    if (score) score.textContent = `${combined}% gripvenster`;

    // boost from the turbo runtime; tyre surface speed and slip power from the burnout model
    const boostNode = $('#v8-burn-boost');
    if (boostNode) boostNode.textContent = Math.max(0, Number(b.boostBar || 0)).toFixed(2);
    const slipNode = $('#v8-burn-wheelspin');
    if (slipNode) slipNode.textContent = `${Math.round(b.slipKmh || 0)} km/u`;

    const smoke = $('#v8-burn-smoke');
    if (smoke) {
      smoke.style.setProperty('--smoke', b.smoke);
      smoke.classList.toggle('active', b.smoke > .08);
    }
    const screen = $('.v8-burnout-game');
    if (screen) {
      screen.style.setProperty('--burn-shake', `${Math.sin(performance.now()*.027) * b.smoke * 1.1}px`);
      screen.classList.toggle('burning', b.smoke > .08);
      screen.classList.toggle('perfect-temp', assessment.score > 82);
    }
    const button = $('#v7-burn-throttle');
    if (button) button.classList.toggle('active', !!raceGamePointer.burnout || (raceGameAuto && !b.done));
    const instruction = $('#v7-burn-instruction');
    if (instruction && b.started) {
      const title = assessment.score > 82 ? 'OP TEMPERATUUR' : b.tempC > profile.cautionC ? 'TE HEET · LAAT LOS' : b.tempC > profile.targetC ? 'WARM · BIJNA TE HEET' : 'BLIJF SPINNEN';
      const line = assessment.score > 82 ? 'Laat nu los: na het stagen zit de band in zijn grip-venster.' : b.tempC > profile.targetC ? 'Het oppervlak koelt af tijdens het stagen, de kern niet: stop op tijd.' : 'De band warmt op door de slip; het oppervlak koelt snel af, de kern houdt de warmte vast.';
      instruction.innerHTML = `<b>${title}</b><span>${line}</span>`;
      instruction.classList.toggle('good', assessment.score > 82);
      instruction.classList.toggle('warn', b.tempC > profile.cautionC);
    }
  }

  function finishV7Burnout() {
    const b = raceGame.burn;
    b.done = true; raceGame.phase = 'burnout-result';
    raceGamePointer.burnout = false;
    // the tyres leave the burnout with this state; staging cools them further (updateV7StageGame)
    if (raceGame.burnRt) raceGame.tyreThermal = { ...raceGame.burnRt.tyreThermal };
    syncBurnoutLevel(b.tempC);
    const assessment = burnoutAssessment(b.tempC);
    const instruction=$('#v7-burn-instruction');
    if(instruction){instruction.classList.add(assessment.score>=78?'good':'warn');instruction.innerHTML=`<b>${assessment.score>=84?'PERFECT GRIP':assessment.score>=60?'BRUIKBARE GRIP':'SLECHTE BURNOUT'}</b><span>launch ≈ ${Math.round(b.tempC)}°C · grip ${assessment.score}/100 · door naar staging</span>`;}
    const pedal=$('#v7-burn-throttle'); if(pedal){pedal.disabled=true;pedal.innerHTML='<span>NAAR STAGE</span><small>camera wisselt naar achteraanzicht</small>'; pedal.classList.add('complete');}
    haptic(assessment.score>=80?[18,18,35]:[45,25,20]);
    engineShiftPop(.65);
    const delay = state.settings?.reducedMotion ? 80 : 1050;
    raceGameTimers.push(setTimeout(enterV7Stage, delay));
  }

  function enterV7Stage() {
    if (!raceGame?.open) return;
    clearRaceGameTimers();
    raceGame.phase='stage';
    raceGame.stage={progress:0,rpm:900,staged:false,deep:false,treeStarted:false,plannedGreen:0,green:false,launched:false,stagedSince:0,launchArmed:false};
    raceGamePointer={burnout:false,creep:false,throttle:false,steerLeft:false,steerRight:false,antilag:false};
    renderRaceGame();
    updateEngineAudio(900,.12,0);
    haptic(18);
  }

  function updateV7StageGame(dt, now) {
    const s = raceGame.stage;
    let creep = !!raceGamePointer.creep;
    let throttle = !!raceGamePointer.throttle;
    if (raceGameAuto) {
      creep = !s.treeStarted && s.progress < 67;
      throttle = s.progress > 52 && !s.launched;
    }
    if (creep && !s.treeStarted && !s.deep) {
      s.progress += dt * (state.settings?.reducedMotion ? 125 : 34);
      if (s.progress > 92) {
        s.progress = 94;
        s.deep = true;
        s.staged = false;
        raceGamePointer.creep = false;
        haptic([45,25,45]);
      }
    }
    s.staged = s.progress >= 56 && s.progress <= 82 && !s.deep;
    const target = Number(state.tune.launchRpm || 4200);
    // Launch ALS: with anti-lag armed (Tune -> Anti-lag not off) the two-step itself fires the ALS, as on a
    // Syvecs-style launch strategy. HOLD ANTILAG additionally builds boost without the two-step.
    const launchAls = !!raceGame.alsInfo?.enabled && throttle && s.staged;
    const alsHeld = (!!raceGamePointer.antilag || launchAls) && !!raceGame.alsInfo?.enabled;
    // Held ALS raises revs itself (bypass/throttle kick); the two-step caps them at launch rpm.
    const targetRpm = throttle && s.staged ? target : alsHeld ? raceGame.alsInfo.params.targetRpm * .92 : 900;
    s.rpm += (targetRpm - s.rpm) * Math.min(1, dt * (throttle ? 4.25 : 5.2));
    s.rpm += throttle && s.staged ? Math.sin(now * .017) * 42 : 0;
    s.rpm = clamp(s.rpm, 850, Number(state.tune.revLimitRpm || 8000));

    // Auto-start system (as at the strip): once fully staged the tree activates after a random 0.5-5 s,
    // whether or not the driver is on the two-step. Rolling out of stage or going deep resets it.
    if (!s.treeStarted && s.staged) {
      if (!s.stagedSince) { s.stagedSince = now; s.autoStartMs = state.settings?.reducedMotion ? 500 : 500 + Math.random() * 4500; }
      if (now - s.stagedSince >= s.autoStartMs) startV7Tree();
    } else if (!s.treeStarted) {
      s.stagedSince = 0;
    }

    const snap = raceGame.turbo ? raceGame.turbo.step(dt, { rpm: s.rpm, throttle: 0, twoStep: throttle && s.staged, alsRequest: alsHeld }) : null;
    raceGame.turboSnap = snap;
    // the tyres cool while rolling to the line and waiting on the tree
    if (raceGame.tyreThermal) { const pr = burnoutProfile(); C.tyreThermalStep(raceGame.tyreThermal, dt, { speedMs: creep ? 1.2 : 0, ambientC: pr.ambientC, trackC: pr.trackC }); }
    tickAlsFlames(snap, dt, $('#ea-stage-flames'));
    // Two-step without ALS: spark-cut launch limiter (tuned ECUs) pops small flames when hot enough.
    const twoStep = throttle && s.staged;
    if (snap && twoStep && !snap.alsActive) {
      raceGame.twoStepClock = (raceGame.twoStepClock || 0) + dt * 8;
      if (raceGame.twoStepClock >= 1) {
        raceGame.twoStepClock = 0;
        emitExhaustFlame($('#ea-stage-flames'), C.exhaustFlameEvent({ kind: '2step', egtC: snap.egtC, fuelGps: snap.fuelGps, cutS: .06, unburntFraction: C.antiLagCapability(state).flatShift ? .6 : .05, severity: .45 }));
      }
    }
    updateEngineAudio(s.rpm, twoStep ? .82 : alsHeld ? .6 : .12, 0, snap ? { shaftPct: snap.shaftPct, boostBar: snap.boostBar, mapBar: snap.mapBarAbs, egtC: snap.egtC, lambda: snap.lambda, alsActive: snap.alsActive, alsIntensity: snap.alsIntensity, flameIntensity: snap.flame?.intensity || 0, flameSustain: snap.flameSustain || 0, popRateHz: snap.popRateHz, twoStep } : { twoStep });
    updateV7StageDom();
    updatePreRace3D('stage', dt);
  }

  function updateV7StageDom() {
    if (!raceGame?.stage) return;
    const s = raceGame.stage;
    const target = Number(state.tune.launchRpm || 4200);
    updateV7Tach('v7-stage', s.rpm, 1);

    const marker = $('#v7-stage-marker');
    if (marker) marker.style.left = `${clamp(s.progress,0,100)}%`;
    const depth = $('#v7-stage-depth');
    if (depth) depth.textContent = `${Math.round(s.progress)}%`;

    let status = 'KRUIP NAAR PRE-STAGE';
    if (s.progress >= 25) status = 'PRE-STAGE · NOG IETS VOORUIT';
    if (s.staged && !s.treeStarted) status = raceGamePointer.throttle ? (raceGame.alsInfo?.enabled ? 'GESTAGED · TWO-STEP + ANTILAG · TREE START VANZELF' : 'GESTAGED · TWO-STEP · TREE START VANZELF') : 'GESTAGED · TREE START VANZELF';
    if (s.deep) status = 'TE DIEP · BEAM GEMIST';
    if (s.treeStarted) status = s.launchArmed ? (s.green ? 'GROEN · LAAT LOS!' : 'TREE LOOPT · HOUD TOERENTAL') : (s.green ? 'GROEN · DRUK LAUNCH!' : 'TREE LOOPT · DRUK OP GROEN');
    const st = $('#v7-stage-status');
    if (st) { st.textContent = status; st.className = s.deep ? 'bad' : s.green ? 'go' : s.staged ? 'good' : ''; }

    v7SetBulbs(['preL','preR'], s.progress >= 25);
    v7SetBulbs(['stageL','stageR'], s.staged || s.treeStarted);

    const launch = $('#v7-launch-button');
    if (launch) {
      const ready = s.staged && !s.deep && !s.launched;
      launch.disabled = !ready;
      launch.classList.toggle('ready', ready && !s.treeStarted);
      launch.classList.toggle('armed', ready && s.treeStarted && !s.green);
      launch.classList.toggle('go', ready && s.green);
      const label = $('b', launch);
      const hint = $('small', launch);
      const pedal = s.treeStarted && !s.launchArmed;
      if (label) label.textContent = !ready ? 'LAUNCH VERGRENDELD' : pedal ? (s.green ? 'DRUK!' : 'DRUK OP GROEN') : s.green ? 'LAAT LOS!' : s.treeStarted ? 'HOUD VAST' : 'HOUD VOOR LAUNCH';
      if (hint) hint.textContent = !ready ? 'rij eerst volledig in stage' : pedal ? 'geen two-step: launch vanaf huidig toerental' : s.treeStarted ? 'release bepaalt je reactietijd' : 'tree start vanzelf (0,5–5 s) · vasthouden = two-step';
    }

    const rpmNumber = $('#v8-stage-rpm-number');
    if (rpmNumber) rpmNumber.textContent = Math.round(s.rpm);
    const rpmFill = $('#v8-stage-rpm-fill');
    if (rpmFill) rpmFill.style.width = `${clamp(s.rpm / Math.max(1,target),0,1.22) * 82}%`;
    // Boost, turbo speed and EGT come from the realtime turbo runtime, never from a lookup.
    const snap = raceGame.turboSnap;
    const boostNode = $('#v8-stage-boost');
    if (boostNode) boostNode.textContent = snap ? Math.max(0, snap.boostBar).toFixed(2) : '—';
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    if (snap) {
      set('#v13-stage-shaft', `${Math.round(snap.shaftRpm / 1000)}k · ${Math.round(snap.shaftPct)}%`);
      set('#v13-stage-egt', `${Math.round(snap.egtC)} °C`);
      const w = raceGame.turbo.state.wear;
      set('#v13-stage-wear', `+${(w.turbo + w.manifold + w.valves).toFixed(3)}%`);
      const egtNode = $('#v13-stage-egt'); if (egtNode) egtNode.className = snap.egtC > 1050 ? 'bad' : snap.egtC > 950 ? 'warn' : '';
    }
    set('#v13-stage-als', alsStatusText(snap));
    if (raceGame.tyreThermal) {
      const g = C.tyreGripTempC(raceGame.tyreThermal), pr = burnoutProfile();
      set('#v13-stage-tyre', `${Math.round(g)}°C`);
      const tn = $('#v13-stage-tyre'); if (tn) tn.className = Math.abs(g - pr.targetC) < 8 ? 'good' : g > pr.cautionC ? 'bad' : 'warn';
    }
    const alsBtn = $('#v13-als-button');
    if (alsBtn) {
      alsBtn.classList.toggle('active', !!snap?.alsActive);
      alsBtn.classList.toggle('lockout', !!(snap && snap.alsLockoutS > 0));
    }

    const screen = $('.v8-stage-game');
    if (screen) {
      screen.classList.toggle('is-staged', s.staged && !s.deep);
      screen.classList.toggle('tree-running', s.treeStarted && !s.green);
      screen.classList.toggle('green', !!s.green);
    }
    const plate = $('.v8-stage-plate');
    if (plate) {
      const scale = 1.015 + clamp(s.progress/100,0,1) * .025;
      plate.style.transform = `scale(${scale}) translateY(${clamp(s.progress/100,0,1) * -5}px)`;
      // The flame layer sits above the panels but must track the tailpipes in the zooming plate.
      const layer = $('#ea-stage-flame-layer');
      if (layer) layer.style.transform = plate.style.transform;
    }
  }

  function v7SetBulbs(names,on=true){names.forEach(n=>{const el=$(`[data-v7-bulb="${n}"]`,$('#race-game-root'));if(el)el.classList.toggle('on',!!on);});}
  function v7ResetBulbs(){$$('[data-v7-bulb]',$('#race-game-root')).forEach(el=>el.classList.remove('on'));}

  function resetV7Stage() {
    if(!raceGame?.open)return;
    clearRaceGameTimers();
    raceGame.stage={progress:0,rpm:900,staged:false,deep:false,treeStarted:false,plannedGreen:0,green:false,launched:false,stagedSince:0,launchArmed:false};
    raceGamePointer.creep=false;raceGamePointer.throttle=false;
    renderRaceGame();
    showToast('Staging opnieuw begonnen.');
  }

  function startV7Tree() {
    if(!raceGame?.stage||raceGame.stage.treeStarted)return;
    const s=raceGame.stage;
    if(!s.staged||s.deep)return showToast('Zet de auto eerst correct in stage.');
    s.treeStarted=true;s.green=false;s.launched=false;
    // On the two-step when the tree drops: release launches. Otherwise a press launches from the current rpm.
    s.launchArmed=!!raceGamePointer.throttle||raceGameAuto;
    playLaunchCrackle(.48);
    clearRaceGameTimers();v7ResetBulbs();v7SetBulbs(['preL','preR','stageL','stageR'],true);
    const base=state.settings?.reducedMotion?90:650+Math.random()*620;
    const now=performance.now();
    const greenDelay=treeMode==='pro'?base+400:base+1500;
    s.plannedGreen=now+greenDelay;
    const later=(ms,fn)=>raceGameTimers.push(setTimeout(()=>{if(raceGame?.phase==='stage')fn();},ms));
    if(treeMode==='pro'){
      later(base,()=>{v7SetBulbs(['a1L','a1R','a2L','a2R','a3L','a3R'],true);raceGameTone(620,.08,.035);haptic(9);});
      later(base+400,()=>{v7SetBulbs(['a1L','a1R','a2L','a2R','a3L','a3R'],false);v7SetBulbs(['gL','gR'],true);s.green=true;raceGameTone(980,.12,.05);haptic(26);});
    }else{
      later(base,()=>{v7SetBulbs(['a1L','a1R'],true);raceGameTone(520,.06,.025);haptic(8);});
      later(base+500,()=>{v7SetBulbs(['a1L','a1R'],false);v7SetBulbs(['a2L','a2R'],true);raceGameTone(620,.06,.025);haptic(8);});
      later(base+1000,()=>{v7SetBulbs(['a2L','a2R'],false);v7SetBulbs(['a3L','a3R'],true);raceGameTone(720,.06,.03);haptic(8);});
      later(base+1500,()=>{v7SetBulbs(['a3L','a3R'],false);v7SetBulbs(['gL','gR'],true);s.green=true;raceGameTone(1020,.12,.05);haptic(28);});
    }
    if(raceGameAuto)later(greenDelay+72,()=>launchV7Race(true));
    updateV7StageDom();
  }

  function launchV7Race(auto=false) {
    if(!raceGame?.stage||!raceGame.stage.treeStarted||raceGame.stage.launched)return showToast('Start eerst de tree.');
    const s=raceGame.stage;s.launched=true;
    // Two-step launch leaves at the launch-control rpm; a pedal launch leaves from what the engine was doing.
    const launchTarget=Number(state.tune.launchRpm||4200);
    s.launchFromRpm=s.launchArmed?launchTarget:clamp(Math.max(s.rpm,2200),2200,launchTarget);
    const reactionTime=(performance.now()-s.plannedGreen)/1000;
    if(reactionTime<0){clearRaceGameTimers();v7SetBulbs(['a1L','a1R','a2L','a2R','a3L','a3R','gL','gR'],false);v7SetBulbs(['rL','rR'],true);haptic([70,40,70]);raceGameTone(180,.22,.06);}else haptic(30);
    startV7Run(reactionTime,auto);
  }

  function raceTransmissionInfo() {
    const part = selectedTransmission();
    return {
      id: selectedTransmissionId(),
      part,
      isDsg: selectedTransmissionId() === 'dq250',
      gears: Array.isArray(part.gearRatios) ? part.gearRatios.slice() : [3.36,2.09,1.47,1.10,.86,.72],
      finalDrive: Number(part.finalDrive || 3.94),
      shiftSeconds: Math.max(.035, Number(part.shiftSeconds || .25)),
      efficiency: clamp(Number(part.transEfficiency || .9), .75, .98)
    };
  }

  function buildRealtimeShiftTargets(transInfo) {
    const targets = [];
    const curve = state.lastDyno?.samples || [];
    const revLimit = Number(state.tune.revLimitRpm || 8000);
    const launch = Number(state.tune.launchRpm || 4200);
    for (let gearIndex = 0; gearIndex < transInfo.gears.length - 1; gearIndex++) {
      const currentRatio = transInfo.gears[gearIndex];
      const nextRatio = transInfo.gears[gearIndex + 1];
      let target = revLimit - 130;
      for (let rpm = Math.max(4300, launch + 350); rpm <= revLimit - 100; rpm += 50) {
        const nextRpm = rpm * nextRatio / currentRatio;
        const currentPoint = C.interpolateCurve(curve, rpm);
        const nextPoint = C.interpolateCurve(curve, nextRpm);
        const currentWheelTorque = Number(currentPoint?.torqueNm || 0) * currentRatio;
        const nextWheelTorque = Number(nextPoint?.torqueNm || 0) * nextRatio;
        if (nextRpm > 1700 && nextWheelTorque >= currentWheelTorque * .992) {
          target = rpm;
          break;
        }
      }
      targets.push(clamp(target, Math.max(4800, launch + 450), revLimit - 80));
    }
    return targets;
  }

  function createRealtimeRun(reactionTime, auto = false) {
    const transInfo = raceTransmissionInfo();
    const drive = C.DRIVETRAINS[state.vehicle.drivetrain];
    const grip = C.gripFactor(state.vehicle);
    const geometry = C.engineGeometry(state);
    const mass = C.buildMassKg(state);
    const rho = C.airDensity(state.vehicle);
    const dynoRho = Number(state.lastDyno?.airDensityKgM3 || 1.204);
    const burnout = burnoutAssessment(raceGame.burn.tempC);
    const actualTempFactor = clamp(.80 + (raceGame.burn.score || burnout.score) / 100 * .24, .76, 1.04);
    const opponent = buildRivalSimulation();
    // One vehicle model for the whole race (sim.js): engine map from the combustion model, the staging turbo
    // runtime (shaft speed built on the two-step carries over), clutch, tyres and load transfer.
    const engineMap = C.buildEngineMap(state);
    const launchFromRpm = Number(raceGame.stage?.launchFromRpm || state.tune.launchRpm || 4200);
    const eventTrack = raceGame?.careerRound ? { ...state, vehicle: { ...state.vehicle, preparedTrack: !!C.CAREER_EVENT_MAP[raceGame.careerRound.eventId]?.prep } } : state;
    const vehicleRt = C.createRaceRuntime(eventTrack, { engineMap, turbo: raceGame?.turbo || makeRaceTurbo(), tyreTempC: raceGame.burn.tempC, tyreThermal: raceGame.tyreThermal, launchRpm: launchFromRpm, tractionControl: state.tune.tractionControl !== false });
    vehicleRt.state.we = launchFromRpm * Math.PI / 30;
    vehicleRt.launch();
    const run = {
      reactionTime: Number(reactionTime || 0), redLight: Number(reactionTime || 0) < 0,
      valid: Number(reactionTime || 0) >= 0, auto: !!auto,
      transInfo, autoShift: transInfo.isDsg, driverAssist: !!auto,
      shiftTargets: C.optimalShiftRpms(state, engineMap),
      rt: vehicleRt,
      shiftHistory: [], perfect: 0, good: 0, early: 0, late: 0, missed: 0,
      limiterFlags: new Set(), shifting: null,
      t: 0, x: 0, v: 0, a: 0, rpm: Number(raceGame.stage?.launchFromRpm || state.tune.launchRpm || 4200), gearIndex: 0,
      startRpm: Number(raceGame.stage?.launchFromRpm || state.tune.launchRpm || 4200),
      boostFactor: .80, wheelspin: 0, peakWheelspin: 0, zeroTo100: null,
      clutchTempC:58, gearboxTempC:66, maxClutchTempC:58, maxGearboxTempC:66, limiterTime:0, drivelineStress:0,
      lateralM: 0, lateralVelocity: 0, laneWarning: false, laneDnf: false, offTrackTime: 0, lineTouches: 0,
      mass, rho, dynoRho, airPowerFactor: clamp(Math.pow(rho / dynoRho, .35), .86, 1.05),
      drive, grip, actualTempFactor, geometry,
      radius: Math.max(.18, Number(grip.geometry.radiusM || .327)),
      cdA: Number(state.vehicle.cdA || .68),
      wheelbase: Number(state.vehicle.wheelbaseM || 2.58),
      cgHeight: Number(state.vehicle.cgHeightM || .51),
      transEff: transInfo.efficiency * (1 - Number(drive.loss || .1) * .34),
      headwind: Math.max(-20, Number(state.vehicle.headwindKmh || 0)) / 3.6,
      transferScale: clamp(.55 + Number(state.vehicle.suspensionTransferPct || 60) / 100 * .85, .55, 1.40),
      milestones: {}, trace: [], lastTraceT: -.1,
      feedback: 'LAUNCH', feedbackUntil: 0, point: null,
      finished: false, finishReason: '', startMs: performance.now(),
      timeScale: auto ? (state.settings?.reducedMotion ? 6.0 : 2.15) : 1,
      // tyre grip temperature at the launch (after the burnout and the staging)
      burnoutTempC: raceGame.tyreThermal ? C.tyreGripTempC(raceGame.tyreThermal) : raceGame.burn.tempC, burnoutScore: raceGame.burn.score || burnout.score,
      raceMode:opponent ? 'heads_up' : 'solo', opponent, opponentGapM:0, opponentFinishShown:false,
      // The staging turbo runtime carries on: shaft speed built on ALS/two-step is kept at launch.
      turbo: vehicleRt.turbo, turboSnap:null, pendingFlames:[], limiterFlameClock:0,
      alsRolling: (() => { const a = raceGame?.alsInfo || C.resolveAntiLag(state); return !!(a.enabled && (a.mode === 'rally' || a.mode === 'drag' || (a.mode === 'custom' && a.params.aggressiveness >= 50))); })(),
      flatShift: C.antiLagCapability(state).flatShift
    };
    run.point = realtimePoint(run, 0, 0);
    return run;
  }

  function realtimePoint(run, boostBar = 0, turboLoad = 0) {
    return {
      time: run.t,
      distanceM: run.x,
      speedKmh: run.v * 3.6,
      rpm: run.rpm,
      gear: run.gearIndex + 1,
      accelerationG: run.a / 9.80665,
      wheelspinPct: run.wheelspin * 100,
      boostBar,
      turboLoadPct: turboLoad,
      lateralM: run.lateralM,
      laneWarning: run.laneWarning,
      laneDnf: run.laneDnf,
      clutchTempC:run.clutchTempC,
      gearboxTempC:run.gearboxTempC,
      limiterTimeS:run.limiterTime,
      drivelineStress:run.drivelineStress,
      opponentDistanceM:Number(run.opponent?.current?.distanceM || 0),
      opponentSpeedKmh:Number(run.opponent?.current?.speedKmh || 0),
      opponentGapM:Number(run.opponentGapM || 0),
      engineTorqueNm:Number(run.rt?.state.torqueNm || 0),
      clutchSlipRpm:Number(run.rt?.state.slipRpm || 0),
      tyreTempC:Number(run.rt?.state.tyreC || 0),
      egtC:Number(run.turboSnap?.egtC || 0)
    };
  }

  function completeRealtimeShift(run) {
    if (!run.shifting) return;
    const shift = run.shifting;
    run.gearboxTempC += run.autoShift ? 1.4 : 2.2;
    run.drivelineStress += shift.grade === 'perfect' ? .8 : shift.grade === 'good' ? 1.3 : 2.4;
    run.shifting = null;
    const type = run.autoShift ? 'dsg' : 'manual';
    engineShiftPop(shift.grade === 'perfect' ? 1 : shift.grade === 'late' ? .82 : .68, type);
    const car = $('#v7-run-car');
    if (car) { car.classList.remove('shift-pop'); void car.offsetWidth; car.classList.add('shift-pop'); setTimeout(() => car.classList.remove('shift-pop'), 150); }
  }

  function requestRealtimeShift(source = 'manual') {
    const run = raceGame?.run;
    if (!run || raceGame.phase !== 'run' || run.finished || run.shifting) return false;
    if (run.gearIndex >= run.transInfo.gears.length - 1) {
      showV7ShiftFeedback('HOOGSTE VERSNELLING', 'warn');
      return false;
    }
    if (source === 'manual' && run.autoShift) return false;
    const target = Number(run.shiftTargets[run.gearIndex] || (state.tune.revLimitRpm - 150));
    const delta = run.rpm - target;
    let label = 'GOEDE SHIFT', grade = 'good';
    if (Math.abs(delta) <= 145) { label = 'PERFECT SHIFT'; grade = 'perfect'; run.perfect++; }
    else if (delta < -650) { label = 'TE VROEG · RPM VALT'; grade = 'early'; run.early++; }
    else if (delta < -145) { label = 'VROEGE SHIFT'; grade = 'good'; run.good++; }
    else if (delta > 420) { label = 'TE LAAT · BEGRENZER'; grade = 'late'; run.late++; }
    else { label = 'GOEDE SHIFT'; grade = 'good'; run.good++; }
    if (source === 'dsg') { label = 'DSG SHIFT'; grade = 'perfect'; run.perfect++; }
    if (source === 'ai' && grade !== 'perfect') { label = 'AI SHIFT'; grade = 'good'; run.good++; }
    const duration = run.transInfo.shiftSeconds * (grade === 'late' ? 1.05 : grade === 'early' ? 1.08 : 1);
    run.gearboxTempC += grade === 'late' ? 2.2 : grade === 'early' ? 1.6 : .8;
    run.drivelineStress += grade === 'late' ? 1.8 : grade === 'early' ? 1.2 : .4;
    // The vehicle runtime performs the shift (clutch, synchro / DSG handover / dog engagement) and its duration.
    if (run.rt && !run.rt.requestShift()) return false;
    const rtShift = run.rt?.state.shift;
    run.shifting = { from: run.gearIndex, to: run.gearIndex + 1, remaining: rtShift?.dur ?? duration, duration: rtShift?.dur ?? duration, grade, source, rpm: run.rpm, target };
    // Shift flame: DSG ignition-cut burp or flat-shift spark cut sends unburnt fuel into the
    // exhaust; a late shift near the limiter carries more fuel and heat. A throttle lift on an
    // ECU without flat-shift cuts fuel instead, so there is little to ignite.
    const snap = run.turboSnap;
    if (snap) {
      const cutS = (run.autoShift ? .035 : run.flatShift ? .08 : .02) * (grade === 'late' ? 1.8 : 1);
      const unburnt = run.flatShift || run.autoShift ? (grade === 'late' ? .75 : .5) : .12;
      run.pendingFlames.push(C.exhaustFlameEvent({ kind: grade === 'late' ? 'shift-late' : 'shift', egtC: snap.egtC, fuelGps: snap.fuelGps, cutS, unburntFraction: unburnt, severity: grade === 'late' ? .85 : grade === 'early' ? .3 : .2 }));
    }
    run.shiftHistory.push({ at: run.t, from: run.gearIndex + 1, to: run.gearIndex + 2, rpm: run.rpm, targetRpm: target, grade, source });
    showV7ShiftFeedback(label, grade === 'perfect' ? 'perfect' : grade === 'late' || grade === 'early' ? 'warn' : 'good');
    haptic(grade === 'perfect' ? [9,10,18] : 13);
    return true;
  }

  function recordRealtimeMilestones(run) {
    const defs = [
      ['sixtyFt', 18.288], ['threeThirty', 100.584], ['eighth', 201.168], ['thousandFt', 304.8], ['quarter', 402.336]
    ];
    for (const [key, meters] of defs) {
      if (run.milestones[key] == null && run.x >= meters) {
        run.milestones[key] = run.t;
        if (key === 'eighth') run.milestones.eighthKmh = run.v * 3.6;
        if (key === 'quarter') run.milestones.trapKmh = run.v * 3.6;
      }
    }
    if (run.zeroTo100 == null && run.v >= 27.7778) run.zeroTo100 = run.t;
  }

  function stepRealtimePhysics(run, dt) {
    const g = 9.80665;
    const maxStep = .006;
    let remaining = dt;
    while (remaining > 1e-7 && !run.finished) {
      const h = Math.min(maxStep, remaining);
      remaining -= h;
      // Longitudinal physics: the shared vehicle model (engine, turbo, clutch, tyres, shifts).
      const p = run.rt.step(h, { flatShift: !!run.flatShift, rollingAls: !!run.alsRolling });
      run.t = p.t;
      run.x = p.distanceM; run.v = p.v; run.a = p.a; run.rpm = p.rpm; run.gearIndex = p.gearIndex;
      run.wheelspin = clamp(p.slipRatio, 0, .95);
      run.peakWheelspin = Math.max(run.peakWheelspin, run.wheelspin);
      run.clutchTempC = p.clutchTempC;
      run.turboSnap = run.rt.state.turboSnap;
      const snap = run.turboSnap;
      const boostBar = Math.max(0, p.boostBar), turboLoad = p.shaftPct;
      if (run.shifting && !p.shifting) completeRealtimeShift(run);

      const targetShift = Number(run.shiftTargets[run.gearIndex] || Number(state.tune.revLimitRpm || 8000) - 90);
      if (!run.shifting && run.gearIndex < run.transInfo.gears.length - 1) {
        if (run.autoShift && run.rpm >= targetShift) requestRealtimeShift('dsg');
        else if (run.driverAssist && run.rpm >= targetShift) requestRealtimeShift('ai');
      }
      if (p.limiter) {
        run.limiterTime = p.limiterS;
        // Spark-cut limiter (tuned ECUs) dumps unburnt fuel into a hot exhaust: bangs and flames.
        run.limiterFlameClock += h * 11;
        if (run.limiterFlameClock >= 1 && snap) {
          run.limiterFlameClock = 0;
          run.pendingFlames.push(C.exhaustFlameEvent({ kind: 'limiter', egtC: snap.egtC, fuelGps: snap.fuelGps, cutS: .09, unburntFraction: run.flatShift ? .75 : .08, severity: .8 }));
        }
        run.gearboxTempC += h * .9;
        run.drivelineStress += h * 1.9;
        if (!run.autoShift && !run.limiterFlags.has(run.gearIndex)) {
          run.limiterFlags.add(run.gearIndex); run.missed++;
          showV7ShiftFeedback('BEGRENZER · SCHAKEL!', 'bad');
          haptic([10,8,10]);
        }
      }
      run.gearboxTempC += Math.abs(p.torqueNm) / 900 * h * (run.shifting ? 1.6 : .34);
      run.gearboxTempC += (66 - run.gearboxTempC) * h * .010;
      run.maxClutchTempC = Math.max(run.maxClutchTempC, run.clutchTempC);
      run.maxGearboxTempC = Math.max(run.maxGearboxTempC, run.gearboxTempC);
      run.drivelineStress += (Math.max(0, run.wheelspin - .15) * 1.2 + Math.max(0, run.a / g - .75) * .22) * h;

      if (run.opponent) {
        const greenElapsed = run.t + run.reactionTime;
        const opponentDriveTime = greenElapsed - run.opponent.reactionTime - (run.opponent.startOffset || 0);
        run.opponent.current = tracePointAtTime(run.opponent.trace, opponentDriveTime);
        run.opponentGapM = Number(run.opponent.current.distanceM || 0) - run.x;
        run.opponent.finished = greenElapsed >= run.opponent.result.finishTotalTime;
      }

      const manualSteer = (raceGamePointer.steerRight ? 1 : 0) - (raceGamePointer.steerLeft ? 1 : 0);
      const sensitivity = clamp(Number(state.vehicle.steeringSensitivityPct || 100) / 100, .60, 1.50);
      const assist = clamp(Number(state.vehicle.steeringAssistPct || 0) / 100, 0, .60);
      const centerAssist = -run.lateralM * 1.55 * assist - run.lateralVelocity * .72 * assist;
      const steer = run.driverAssist ? clamp(-run.lateralM * 1.9 - run.lateralVelocity * .95, -1, 1) : clamp(manualSteer * sensitivity + centerAssist, -1.35, 1.35);
      const driveBias = state.vehicle.drivetrain === 'FWD' ? .22 : state.vehicle.drivetrain === 'RWD' ? -.07 : .045;
      const torqueSteer = driveBias * clamp(run.a / g, 0, 1.25) + (state.vehicle.drivetrain === 'FWD' ? run.wheelspin * .24 : run.wheelspin * Math.sin(run.t * 5.2) * .16);
      const roadCrown = .050 + Math.sin(run.t * .73 + run.x * .018) * .038;
      const targetLatVelocity = steer * (.42 + run.v * .0075);
      const lateralAccel = (targetLatVelocity - run.lateralVelocity) * 3.4 + torqueSteer + roadCrown;
      run.lateralVelocity += lateralAccel * h;
      run.lateralM += run.lateralVelocity * h;
      run.laneWarning = Math.abs(run.lateralM) > .54;
      if (run.laneWarning && !run._lineWasWarning) run.lineTouches++;
      run._lineWasWarning = run.laneWarning;
      if (Math.abs(run.lateralM) > .93) run.offTrackTime += h; else run.offTrackTime = Math.max(0, run.offTrackTime - h * 1.8);
      if (run.offTrackTime > .48 && !run.laneDnf) {
        run.laneDnf = true; run.valid = false; run.finishReason = 'BUITEN DE BAAN';
        showV7ShiftFeedback('BUITEN DE LIJN · RUN ONGELDIG', 'bad'); haptic([55,30,55]);
      }
      if (Math.abs(run.lateralM) > 1.22) {
        run.lateralM = Math.sign(run.lateralM) * 1.22;
        run.lateralVelocity *= -.18;
        run.rt.state.v *= .982; // scrubbing the wall costs speed in the vehicle model itself
      }

      recordRealtimeMilestones(run);
      const point = realtimePoint(run, boostBar, turboLoad);
      run.point = point;
      if (run.t - run.lastTraceT >= .035) { run.trace.push(point); run.lastTraceT = run.t; }
      if (run.x >= 402.336 || run.t >= 35 || (run.laneDnf && run.offTrackTime > 1.25)) break;
    }
  }

  // ---- 3D race view (build/web/race3d.js). The simulation stays in this file; the renderer only draws it.
  // Falls back to the 2D canvas when WebGL is missing, the renderer fails, or 3D is switched off.
  function race3DEnabled() { return state.settings?.graphics3d !== false && !!window.EA888Race3D?.supported?.(); }
  function startRace3D() {
    disposeRace3D();
    const run = raceGame?.run;
    const canvas = $('#race3d-canvas');
    if (!run || !canvas || !race3DEnabled()) return;
    const ghostData = !run.opponent && state.ghost?.drivetrain === state.vehicle.drivetrain && Array.isArray(state.ghost.trace) ? state.ghost.trace : null;
    try {
      raceGame.r3d = window.EA888Race3D.create(canvas, {
        headsUp: !!run.opponent,
        drivetrain: state.vehicle.drivetrain,
        rivalColor: run.opponent ? parseInt(String(run.opponent.profile.color || '#6b1a1a').replace('#', ''), 16) : undefined,
        ghost: ghostData,
        reducedMotion: !!state.settings?.reducedMotion
      });
    } catch (e) {
      console.error('race3d', e);
      raceGame.r3d = null;
    }
    raceGame.r3dLast = performance.now();
    $('.v8-run-game')?.classList.toggle('has-3d', !!raceGame.r3d);
  }
  function updateRace3D(run, point) {
    const r3d = raceGame?.r3d;
    if (!r3d) return false;
    const now = performance.now();
    const dt = (now - (raceGame.r3dLast || now)) / 1000;
    raceGame.r3dLast = now;
    try {
      r3d.update({ ...point, t: run.t, lateralVelocity: run.lateralVelocity }, dt);
    } catch (e) {
      console.error('race3d', e);
      disposeRace3D();
      $('.v8-run-game')?.classList.remove('has-3d');
      return false;
    }
    return true;
  }
  let preRace3DOff = false; // test hook: timing-based smoke checks run the burnout/staging in 2D
  // Burnout and staging in 3D: the same renderer as the run, drawing the burnout and staging state.
  function startPreRace3D() {
    disposeRace3D();
    const canvas = $('#race3d-canvas');
    if (!raceGame?.open || !canvas || !race3DEnabled() || preRace3DOff) return;
    const rival = raceGame.rivalProfile;
    try {
      raceGame.r3d = window.EA888Race3D.create(canvas, {
        headsUp: !!rival,
        drivetrain: state.vehicle.drivetrain,
        rivalColor: rival ? parseInt(String(rival.color || '#6b1a1a').replace('#', ''), 16) : undefined,
        reducedMotion: !!state.settings?.reducedMotion
      });
    } catch (e) {
      console.error('race3d', e);
      raceGame.r3d = null;
    }
    raceGame.r3dLast = performance.now();
    raceGame.burnWheelKmh = 0;
    $('#race-game-root .v8-game')?.classList.toggle('has-3d', !!raceGame.r3d);
  }
  // Driven tyre surface speed with the clutch locked in first gear (the car is held on the brakes).
  function firstGearTyreKmh(rpm) {
    const t = C.getPart(state, 'transmission');
    const overall = Number(t.gearRatios?.[0] || 3.36) * Number(t.finalDrive || 3.94);
    return rpm / overall / 60 * 2 * Math.PI * .323 * 3.6;
  }
  function updatePreRace3D(mode, dt) {
    const r3d = raceGame?.r3d;
    if (!r3d) return;
    const now = performance.now();
    const frameDt = (now - (raceGame.r3dLast || now)) / 1000;
    raceGame.r3dLast = now;
    let frame;
    if (mode === 'burnout') {
      const b = raceGame.burn;
      const target = burnoutRuntime?.active ? firstGearTyreKmh(b.rpm) : 0;
      raceGame.burnWheelKmh += (target - raceGame.burnWheelKmh) * Math.min(1, (dt || frameDt) * 5);
      frame = { scene: 'burnout', rpm: b.rpm, wheelSpeedKmh: raceGame.burnWheelKmh, smoke: b.smoke, tyreTempC: b.tempC, lights: [] };
    } else {
      const s = raceGame.stage;
      frame = { scene: 'stage', rpm: s.rpm, stageProgress: s.progress, lights: $$('[data-v7-bulb].on', $('#race-game-root')).map(n => n.dataset.v7Bulb) };
    }
    try { r3d.update(frame, frameDt); }
    catch (e) {
      console.error('race3d', e);
      disposeRace3D();
      $('#race-game-root .v8-game')?.classList.remove('has-3d');
    }
  }
  function disposeRace3D() {
    if (!raceGame?.r3d) return;
    try { raceGame.r3d.dispose(); } catch (e) { /* context already gone */ }
    raceGame.r3d = null;
  }
  // Ghost: the trace of the fastest valid run per drivetrain, sampled at 20 Hz ([t, distance, lateral]).
  function recordGhostSample(run, force = false) {
    run.trace = run.trace || [];
    const lastT = run.trace.length ? run.trace[run.trace.length - 1][0] : -1;
    if (run.t - lastT >= .05) run.trace.push([+run.t.toFixed(3), +run.x.toFixed(2), +run.lateralM.toFixed(3)]);
    // Replay: the full simulated state at ~30 Hz; the replay only plays back these samples.
    run.replayFrames = run.replayFrames || [];
    const lastR = run.replayFrames.length ? run.replayFrames[run.replayFrames.length - 1].t : -1;
    const p = run.point;
    if (p && (force || run.t - lastR >= 1 / 30)) run.replayFrames.push({ t: run.t, d: run.x, lat: run.lateralM, latV: run.lateralVelocity || 0, v: p.speedKmh, g: p.accelerationG, ws: p.wheelspinPct, od: p.opponentDistanceM || 0 });
  }

  // ---- Replay of the last run (finish screen). Plays back the recorded samples and flame events in a fresh
  // renderer with director cameras; nothing is re-simulated.
  function replayAvailable() { return !!(raceGame?.run?.replayFrames?.length > 10 && race3DEnabled()); }
  function startReplay() {
    const run = raceGame?.run;
    if (!replayAvailable()) { showToast('Replay niet beschikbaar (3D-racebeeld uit of geen opname).'); return; }
    clearRaceGameTimers();
    raceGame.replayOpen = true;
    raceGame.replayProgress = 0;
    raceGame.replayDone = false;
    renderRaceGame();
    const canvas = $('#race3d-replay');
    if (!canvas) return;
    disposeReplay();
    try {
      raceGame.replay3d = window.EA888Race3D.create(canvas, {
        headsUp: !!run.opponent,
        drivetrain: state.vehicle.drivetrain,
        rivalColor: run.opponent ? parseInt(String(run.opponent.profile.color || '#6b1a1a').replace('#', ''), 16) : undefined,
        reducedMotion: !!state.settings?.reducedMotion
      });
    } catch (e) {
      console.error('race3d replay', e);
      raceGame.replay3d = null;
      closeReplay();
      showToast('Replay kon niet starten (WebGL).');
      return;
    }
    const bar = () => $('#replay-progress');
    raceGame.replay3d.replay(run.replayFrames, run.replayFlames || [], {
      onProgress: k => { if (raceGame) raceGame.replayProgress = k; const b = bar(); if (b) b.style.transform = `scaleX(${k.toFixed(4)})`; },
      onEnd: () => { if (!raceGame) return; raceGame.replayDone = true; $('#replay-state')?.replaceChildren(document.createTextNode('EINDE REPLAY')); }
    });
  }
  function disposeReplay() {
    if (!raceGame?.replay3d) return;
    try { raceGame.replay3d.dispose(); } catch (e) { /* context already gone */ }
    raceGame.replay3d = null;
  }
  function closeReplay() {
    disposeReplay();
    if (!raceGame) return;
    raceGame.replayOpen = false;
    renderRaceGame();
  }

  function startV7Run(reactionTime, auto = false) {
    clearRaceGameTimers();
    try {
      stopBurnout({silent:true});
      raceGame.phase = 'run';
      raceGame.run = createRealtimeRun(reactionTime, auto);
      renderRaceGame();
      startRace3D();
      startEngineAudio('race');
      updateEngineAudio(raceGame.run.rpm, .92, .25);
      playLaunchCrackle(.95);
    } catch (e) {
      showToast(e.message); closeDragGame({silent:true}); render();
    }
  }

  function handleV7Shift() {
    const run = raceGame?.run;
    if (!run || raceGame.phase !== 'run' || run.finished) return;
    if (run.autoShift) { showV7ShiftFeedback('DSG SCHAKELT AUTOMATISCH', 'good'); return; }
    requestRealtimeShift('manual');
  }

  function showV7ShiftFeedback(text, cls = '') {
    const run = raceGame?.run;
    if (run) { run.feedback = text; run.feedbackUntil = performance.now() + 820; }
    const node = $('#v7-shift-feedback');
    if (node) { node.textContent = text; node.className = `v7-shift-feedback v9-shift-feedback ${cls}`; }
  }

  function updateV7RunGame(dt, now) {
    const run = raceGame?.run;
    if (!run || run.finished) return;
    const scaledDt = clamp(dt * run.timeScale, 0, .18);
    stepRealtimePhysics(run, scaledDt);
    recordGhostSample(run);
    updateV7RunDom(run.point);
    const carHost = $('#v7-run-car');
    while (run.pendingFlames.length) emitExhaustFlame(carHost, run.pendingFlames.shift());
    const snap = run.turboSnap;
    tickAlsFlames(snap, scaledDt, carHost);
    const egtNode = $('#v13-run-egt'); if (egtNode && snap) egtNode.textContent = `${Math.round(snap.egtC)}°C`;
    const shaftNode = $('#v13-run-shaft'); if (shaftNode && snap) shaftNode.textContent = `${Math.round(snap.shaftPct)}%${snap.alsActive ? ' ALS' : ''}`;
    const load = run.shifting ? .15 : 1;
    // Cuts come from the vehicle runtime: the rev limiter, and the ignition cut of a flat/dog shift.
    const pt = run.point || {};
    const shiftCut = pt.shifting && !run.autoShift && (run.flatShift || selectedTransmissionId() === 'sequential');
    const cutFraction = pt.limiter ? 1 : shiftCut ? 1 : 0;
    const cutKind = pt.limiter ? limiterCutKind() : 'spark';
    const knock = Number(pt.knockNow || 0);
    updateEngineAudio(run.rpm, Math.max(.22, load), run.wheelspin, snap ? { shaftPct: snap.shaftPct, boostBar: snap.boostBar, mapBar: snap.mapBarAbs, egtC: snap.egtC, lambda: snap.lambda, alsActive: snap.alsActive, alsIntensity: snap.alsIntensity, flameIntensity: snap.flame?.intensity || 0, flameSustain: snap.flameSustain || 0, popRateHz: snap.popRateHz, cutFraction, cutKind, knock } : { cutFraction, cutKind, knock });
    try { updateRivalAudio(run); } catch (e) { audioFault(e); }
    if (run.x >= 402.336 || run.t >= 35 || (run.laneDnf && run.offTrackTime > 1.25)) finishV7Run();
  }

  function v10EnsureTrackSurface() {
    const canvas = $('#v10-track-canvas');
    if (!canvas) return null;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || window.innerWidth || 360));
    const height = Math.max(520, Math.round(rect.height || window.innerHeight || 720));
    if (canvas !== v10TrackVisual.canvas || width !== v10TrackVisual.width || height !== v10TrackVisual.height || dpr !== v10TrackVisual.dpr) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      v10TrackVisual.canvas = canvas;
      v10TrackVisual.ctx = canvas.getContext('2d', { alpha:true, desynchronized:true });
      v10TrackVisual.width = width; v10TrackVisual.height = height; v10TrackVisual.dpr = dpr;
      v10TrackVisual.ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    return v10TrackVisual.ctx;
  }

  function v10Projection(distanceAhead, width, height) {
    const horizonY = height * .355;
    const roadBottomY = height * .925;
    const viewDistance = 205;
    const normalized = clamp(distanceAhead / viewDistance, 0, 1);
    const near = Math.pow(1 - normalized, 1.72);
    const y = horizonY + (roadBottomY - horizonY) * near;
    const roadHalf = width * (.052 + .56 * Math.pow(near, 1.18));
    return { y, roadHalf, near, horizonY, roadBottomY };
  }

  function v10DrawOpponent(ctx, x, y, scale, glow = 1) {
    const w = 54 * scale, h = 29 * scale;
    ctx.save(); ctx.translate(x,y);
    ctx.shadowColor = `rgba(255,45,35,${.55*glow})`; ctx.shadowBlur = 12*scale;
    ctx.fillStyle = '#080b10';
    ctx.beginPath(); ctx.roundRect(-w*.5,-h*.72,w,h*.72,5*scale); ctx.fill();
    ctx.fillStyle = '#121820';
    ctx.beginPath(); ctx.moveTo(-w*.32,-h*.72); ctx.lineTo(-w*.18,-h); ctx.lineTo(w*.18,-h); ctx.lineTo(w*.33,-h*.72); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ff2f2f'; ctx.fillRect(-w*.36,-h*.55,w*.22,3*scale); ctx.fillRect(w*.14,-h*.55,w*.22,3*scale);
    ctx.fillStyle='rgba(255,50,35,.22)'; ctx.fillRect(-w*.38,-h*.18,w*.76,2*scale);
    ctx.restore();
  }

  function drawV10Track(point) {
    const ctx = v10EnsureTrackSurface();
    if (!ctx || !raceGame?.run) return;
    const run = raceGame.run;
    const w = v10TrackVisual.width, h = v10TrackVisual.height;
    const speed = clamp(Number(point.speedKmh || 0) / 310, 0, 1);
    const distance = Number(point.distanceM || 0);
    const laneCamera = clamp(Number(point.lateralM || 0) / 1.22, -1, 1) * w * .028;
    // Heads-up: a two-lane strip. The camera follows the player's lane; the strip centre line (between the
    // lanes) lies at the player's right lane line and the rival's lane is to the right. Ratios are in units of
    // the projected half-width; `off` is the strip centre relative to the player's lane centre.
    const headsUp = !!run.opponent;
    const off = headsUp ? .48 : 0, half = headsUp ? 1.06 : 1;
    const laneRatios = headsUp ? [-.96, 0, .96] : [-.48, 0, .48];
    const farP = v10Projection(205, w, h), nearP = v10Projection(0, w, h);
    const X = (p, ratio) => w * .5 + laneCamera + p.roadHalf * (off + ratio);
    ctx.clearRect(0,0,w,h);

    // Night sky and distant flood-light haze.
    const sky = ctx.createLinearGradient(0,0,0,h*.52);
    sky.addColorStop(0,'rgba(1,5,12,.40)'); sky.addColorStop(.58,'rgba(3,10,20,.20)'); sky.addColorStop(1,'rgba(8,14,23,.04)');
    ctx.fillStyle=sky; ctx.fillRect(0,0,w,h*.52);
    const horizonY=h*.355, bottomY=h*.925;
    for (let side of [-1,1]) {
      for (let i=0;i<9;i++) {
        const x=w*.5+side*(w*.12+i*w*.055);
        const glow=ctx.createRadialGradient(x,horizonY+3,0,x,horizonY+3,28+i*1.6);
        glow.addColorStop(0,'rgba(255,239,188,.72)'); glow.addColorStop(.12,'rgba(255,211,105,.34)'); glow.addColorStop(1,'rgba(255,180,50,0)');
        ctx.fillStyle=glow; ctx.fillRect(x-34,horizonY-31,68,68);
      }
    }

    // Perspective asphalt.
    const asphalt=ctx.createLinearGradient(0,horizonY,0,bottomY);
    asphalt.addColorStop(0,'rgba(27,33,43,.88)'); asphalt.addColorStop(.38,'rgba(18,23,31,.96)'); asphalt.addColorStop(1,'rgba(5,8,12,1)');
    ctx.fillStyle=asphalt; ctx.beginPath(); ctx.moveTo(X(farP,-half),horizonY); ctx.lineTo(X(farP,half),horizonY); ctx.lineTo(X(nearP,half),bottomY); ctx.lineTo(X(nearP,-half),bottomY); ctx.closePath(); ctx.fill();

    // Wet reflective centre and rubbered-in grooves.
    const wet=ctx.createLinearGradient(0,horizonY,0,bottomY);
    wet.addColorStop(0,'rgba(102,137,171,.05)'); wet.addColorStop(.62,'rgba(74,104,133,.13)'); wet.addColorStop(1,'rgba(15,33,50,.27)');
    ctx.fillStyle=wet; ctx.beginPath(); ctx.moveTo(w*.47+laneCamera,horizonY);ctx.lineTo(w*.53+laneCamera,horizonY);ctx.lineTo(w*.77+laneCamera,bottomY);ctx.lineTo(w*.23+laneCamera,bottomY);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=Math.max(2,w*.012);
    ctx.beginPath();ctx.moveTo(w*.485+laneCamera,horizonY);ctx.lineTo(w*.38+laneCamera,bottomY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(w*.515+laneCamera,horizonY);ctx.lineTo(w*.62+laneCamera,bottomY);ctx.stroke();
    if(headsUp)for(const g of [-.2,.2]){ctx.beginPath();ctx.moveTo(X(farP,.48+g),horizonY);ctx.lineTo(X(nearP,.48+g),bottomY);ctx.stroke();}

    const section=18;
    const phase=((distance%section)+section)%section;
    for(let i=0;i<15;i++){
      const ahead=i*section-phase+4;
      if(ahead<1||ahead>205)continue;
      const p=v10Projection(ahead,w,h), p2=v10Projection(Math.min(205,ahead+5.4),w,h);
      const lineW=Math.max(1.2,p.near*9);
      // Central divider and lane edge strips visibly rush underneath the car.
      ctx.fillStyle=`rgba(241,246,251,${.23+p.near*.54})`;
      for(const ratio of laneRatios){
        const x1=X(p,ratio), x2=X(p2,ratio);
        ctx.beginPath();ctx.moveTo(x1-lineW*.5,p.y);ctx.lineTo(x1+lineW*.5,p.y);ctx.lineTo(x2+lineW*.26,p2.y);ctx.lineTo(x2-lineW*.26,p2.y);ctx.closePath();ctx.fill();
      }
      // Lane light reflections.
      for(const side of [-1,1]){
        const bx=X(p,side*half*1.02);
        const alpha=.18+p.near*.75;
        ctx.fillStyle=`rgba(255,184,65,${alpha})`;ctx.beginPath();ctx.arc(bx,p.y,Math.max(1.2,p.near*4.5),0,Math.PI*2);ctx.fill();
        const rg=ctx.createLinearGradient(bx,p.y,bx,p.y+55*p.near);
        rg.addColorStop(0,`rgba(255,148,34,${alpha*.36})`);rg.addColorStop(1,'rgba(255,80,20,0)');ctx.fillStyle=rg;ctx.fillRect(bx-Math.max(1,p.near*2),p.y,Math.max(2,p.near*4),55*p.near);
      }
    }

    // Solid barriers and repeating posts.
    for(const side of [-1,1]){
      ctx.strokeStyle='rgba(205,216,227,.64)';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(X(farP,side*half*1.15),horizonY);ctx.lineTo(X(nearP,side*half*1.08),bottomY);ctx.stroke();
      for(let i=0;i<18;i++){
        const ahead=i*14-((distance*1.02)%14)+2;if(ahead<1||ahead>205)continue;
        const p=v10Projection(ahead,w,h);const x=X(p,side*half*1.055);
        const postH=5+p.near*40;
        ctx.fillStyle=`rgba(191,202,214,${.22+p.near*.62})`;ctx.fillRect(x-side*Math.max(1,p.near*2),p.y-postH,Math.max(1.3,p.near*3),postH);
        if(i%3===0){
          const lampY=p.y-postH;
          const glow=ctx.createRadialGradient(x,lampY,0,x,lampY,5+p.near*21);
          glow.addColorStop(0,'rgba(255,244,205,.92)');glow.addColorStop(.16,'rgba(255,199,92,.52)');glow.addColorStop(1,'rgba(255,164,52,0)');ctx.fillStyle=glow;ctx.fillRect(x-26*p.near,lampY-26*p.near,52*p.near,52*p.near);
        }
      }
    }

    // Distance boards and finish gantry are tied to real metres remaining.
    const markers=[[18.288,'60 FT'],[100.584,'330 FT'],[201.168,'1/8'],[304.8,'1000 FT'],[402.336,'FINISH']];
    for(const [at,label] of markers){
      const ahead=at-distance;if(ahead<2||ahead>205)continue;
      const p=v10Projection(ahead,w,h);const bx=X(p,half*1.08);
      const bw=34+p.near*62,bh=12+p.near*20;
      ctx.fillStyle=label==='FINISH'?'rgba(238,132,15,.92)':'rgba(7,12,18,.9)';ctx.strokeStyle='rgba(255,188,62,.8)';ctx.lineWidth=Math.max(1,p.near*2);
      ctx.fillRect(bx-bw*.5,p.y-bh,bw,bh);ctx.strokeRect(bx-bw*.5,p.y-bh,bw,bh);
      ctx.fillStyle='#f8fbff';ctx.font=`900 ${Math.max(6,7+p.near*10)}px system-ui`;ctx.textAlign='center';ctx.fillText(label,bx,p.y-bh*.31);
      if(label==='FINISH'){
        const gy=p.y-bh-8*p.near;ctx.strokeStyle='rgba(235,241,247,.9)';ctx.lineWidth=Math.max(1.2,p.near*4);ctx.beginPath();ctx.moveTo(X(p,-half),gy);ctx.lineTo(X(p,half),gy);ctx.stroke();
      }
    }

    // Speed-linked streaks and track texture.
    if(speed>.16){
      ctx.save();ctx.globalCompositeOperation='screen';
      for(let i=0;i<18;i++){
        const seed=(i*71.33+distance*8.2)%997;const x=(seed%1000)/1000*w;const y=h*(.52+((seed*1.7)%430)/1000);const len=(10+speed*68)*(0.3+((i*37)%100)/100);
        ctx.strokeStyle=`rgba(${i%3===0?'255,151,36':'191,220,255'},${.025+speed*.11})`;ctx.lineWidth=.6+speed*1.4;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(x-w*.5)*.018*len,y+len);ctx.stroke();
      }
      ctx.restore();
    }
    v10TrackVisual.lastDistance=distance;
  }

  // The rival drives in the lane to the right. It is placed with the same perspective as the track canvas:
  // depth = the player's car depth on the canvas + the simulated gap, so it sits on the asphalt, shrinks with
  // distance and leaves the frame when it falls far enough behind the camera.
  function v10DepthAtY(y, h) {
    const horizonY = h * .355, bottomY = h * .925;
    const near = clamp((y - horizonY) / (bottomY - horizonY), 0, 1);
    return 205 * (1 - Math.pow(near, 1 / 1.72));
  }
  function placeV10Rival(node, gapM, point) {
    const canvas = $('#v10-track-canvas'), car = $('#v7-run-car'), parent = node.offsetParent;
    const w = v10TrackVisual.width, h = v10TrackVisual.height;
    if (!canvas || !car || !parent || !w || !h) return;
    const cr = canvas.getBoundingClientRect(), pr = parent.getBoundingClientRect();
    // Tyre contact line of the player's car (the image has ~6 % shadow margin below the tyres).
    const carTop = car.offsetTop, carH = car.offsetHeight;
    const contactY = carTop + carH * .94 + pr.top - cr.top;
    const carDepth = v10DepthAtY(contactY, h);
    const depth = carDepth + gapM;
    if (depth < .6) { node.style.opacity = '0'; return; }
    const pCar = v10Projection(carDepth, w, h), p = v10Projection(Math.min(depth, 205), w, h);
    const laneCamera = clamp(Number(point.lateralM || 0) / 1.22, -1, 1) * w * .028;
    const x = w * .5 + laneCamera + p.roadHalf * .96 + cr.left - pr.left;
    const y = p.y + cr.top - pr.top;
    // Sized to its own lane (the player's car art is drawn larger than its lane): 92 % of the lane width.
    const width = pCar.roadHalf * .96 * .92, height = width / 1.61;
    if (node.style.width !== `${width}px`) node.style.width = `${width}px`;
    const scale = clamp(p.roadHalf / pCar.roadHalf, .05, 1.6);
    node.style.transform = `translate3d(${x - width / 2}px,${y - height * .96}px,0) scale(${scale.toFixed(4)})`;
    node.style.opacity = depth > 205 ? '.35' : '1';
  }

  function updateV7RunDom(point) {
    if (!point || !raceGame?.run) return;
    const run = raceGame.run;
    const frac = clamp(point.distanceM / 402.336, 0, 1);
    if (!updateRace3D(run, point)) drawV10Track(point);
    updateV7Tach('v7-run', point.rpm, point.gear);

    const speed = $('#v7-run-speed'); if (speed) speed.textContent = Math.round(point.speedKmh);
    const dist = $('#v7-run-distance'); if (dist) dist.textContent = `${Math.round(point.distanceM)} m`;
    const distCopy = $('#v8-run-distance-copy'); if (distCopy) distCopy.textContent = `${Math.round(point.distanceM)} / 402 m`;
    const boostNode = $('#v7-run-boost'); if (boostNode) boostNode.textContent = Number(point.boostBar || 0).toFixed(2);
    const boostBar = $('#v7-run-boost-bar'); if (boostBar) boostBar.style.width = `${clamp(Number(point.boostBar || 0) / Math.max(1, state.tune.peakBoostBar || 2.5), 0, 1) * 100}%`;
    const progress = $('#v7-run-progress'); if (progress) progress.style.width = `${frac * 100}%`;
    const g = $('#v7-run-g'); if (g) g.textContent = `${Number(point.accelerationG || 0).toFixed(2)} g`;
    const ws = $('#v7-run-wheelspin'); if (ws) ws.textContent = `${Math.round(point.wheelspinPct || 0)}%`;
    const et = $('#v7-run-et'); if (et) et.textContent = run.t.toFixed(3);
    const clutchTemp = $('#v12-clutch-temp'); if (clutchTemp) clutchTemp.textContent = `${Math.round(run.clutchTempC)}°C`;
    const gearboxTemp = $('#v12-gearbox-temp'); if (gearboxTemp) gearboxTemp.textContent = `${Math.round(run.gearboxTempC)}°C`;
    const stress = $('#v12-stress'); if (stress) stress.textContent = `${Math.round(clamp(run.drivelineStress,0,100))}%`;
    const rivalCar = $('#v12-rival-car');
    const rivalGap = $('#v12-rival-gap');
    const rivalHud = $('#v12-rival-hud');
    if (run.opponent && rivalCar) {
      const gapM = Number(run.opponentGapM || 0);
      placeV10Rival(rivalCar, gapM, point);
      rivalCar.classList.toggle('ahead',gapM>.8);
      rivalCar.classList.toggle('behind',gapM<-.8);
      rivalCar.classList.toggle('finished',!!run.opponent.finished);
      if (rivalGap) rivalGap.textContent = run.opponent.finished && point.distanceM < 402.336 ? 'RIVAAL GEFINISHT' : Math.abs(gapM)<.7 ? 'DEUR AAN DEUR' : gapM>0 ? `RIVAAL +${gapM.toFixed(1)} m` : `JIJ +${Math.abs(gapM).toFixed(1)} m`;
      if (rivalHud) { rivalHud.classList.toggle('ahead',gapM>.7); rivalHud.classList.toggle('player-ahead',gapM<-.7); }
    }
    const split = $('#v7-run-split');
    if (split) { const d = point.distanceM; split.textContent = d < 18.288 ? 'LAUNCH' : d < 100.584 ? '60 FT' : d < 201.168 ? '330 FT' : d < 304.8 ? '1/8 MIJL' : d < 402.336 ? '1000 FT' : 'FINISH'; }

    const splitDefs = [
      ['60','sixtyFt'], ['330','threeThirty'], ['8','eighth'], ['4','quarter']
    ];
    for (const [id,key] of splitDefs) {
      const value = run.milestones[key];
      const dot = $(`#v8-split-${id}`); const time = $(`#v8-time-${id}`);
      if (dot) dot.classList.toggle('on', value != null);
      if (time) time.textContent = value != null ? `${Number(value).toFixed(3)} s` : '—';
    }

    const scene = $('#v7-run-scene');
    if (scene) {
      scene.style.setProperty('--speed', clamp(point.speedKmh / 310, 0, 1));
      scene.style.setProperty('--distance', point.distanceM);
      scene.style.setProperty('--road-shift', `${(point.distanceM * 10) % 900}px`);
      scene.style.setProperty('--car-x', `${clamp(point.lateralM / 1.22, -1, 1) * 31}vw`);
    }
    const road = $('#v9-road-flow');
    if (road) {
      const shift = (point.distanceM * 12) % 720;
      road.style.backgroundPosition = `center ${shift}px`;
      road.style.opacity = `${.18 + clamp(point.speedKmh / 260, 0, 1) * .62}`;
    }
    const lines = $('#v7-speed-lines'); if (lines) lines.style.opacity = clamp((point.speedKmh - 45) / 190, 0, .72);
    const car = $('#v7-run-car');
    if (car) {
      const shake = Math.sin(performance.now() * .047) * clamp(point.speedKmh / 190, 0, 1) * 1.6;
      const squat = clamp(point.accelerationG, 0, 1.4) * 3.5;
      const lateralPx = clamp(point.lateralM / 1.22, -1, 1) * Math.min(window.innerWidth * .29, 150);
      car.style.transform = `translate3d(calc(-50% + ${lateralPx + shake}px),${squat}px,0) rotate(${clamp(-run.lateralVelocity * 2.2,-3.5,3.5)}deg) scale(${1 + clamp(point.speedKmh / 330,0,1)*.035})`;
      car.classList.toggle('wheelspin', point.wheelspinPct > 8 && point.distanceM < 80);
      car.classList.toggle('lane-warning', run.laneWarning);
      car.classList.toggle('lane-dnf', run.laneDnf);
    }

    const lane = $('#v9-lane-status');
    const laneMarker = $('#v9-lane-marker');
    if (laneMarker) laneMarker.style.left = `${50 + clamp(point.lateralM / .93, -1, 1) * 46}%`;
    if (lane) {
      const direction = point.lateralM > .15 ? 'STUUR LINKS' : point.lateralM < -.15 ? 'STUUR RECHTS' : 'IN LIJN';
      const label = $('b', lane);
      if (label) label.textContent = run.laneDnf ? 'RUN ONGELDIG' : run.laneWarning ? direction : 'IN LIJN';
      lane.classList.toggle('warn', run.laneWarning && !run.laneDnf);
      lane.classList.toggle('bad', run.laneDnf);
    }
    const left = $('[data-v7-control="steerLeft"]'); const right = $('[data-v7-control="steerRight"]');
    if (left) left.classList.toggle('active', !!raceGamePointer.steerLeft);
    if (right) right.classList.toggle('active', !!raceGamePointer.steerRight);

    const cue = $('#v7-shift-cue'); const button = $('#v7-shift-button');
    if (run.autoShift) {
      if (cue) cue.textContent = run.shifting ? `NAAR ${run.shifting.to + 1}` : `DSG · G${run.gearIndex + 1}`;
      const dsg = $('#v7-dsg-status'); if (dsg) dsg.classList.toggle('shifting', !!run.shifting);
    } else if (run.gearIndex >= run.transInfo.gears.length - 1) {
      if (cue) cue.textContent = 'HOOGSTE VERSNELLING';
      if (button) button.className = 'v8-shift-button v9-shift-button done';
    } else {
      const target = Number(run.shiftTargets[run.gearIndex] || state.tune.revLimitRpm - 100);
      const delta = target - run.rpm;
      let text = 'WACHT', cls = '';
      if (run.shifting) { text = `NAAR G${run.shifting.to + 1}`; cls = 'armed'; }
      else if (delta <= 170 && delta >= -260) { text = 'SHIFT!'; cls = 'ready'; }
      else if (delta < -260) { text = 'TE LAAT'; cls = 'late'; }
      else if (delta < 620) { text = 'KLAAR'; cls = 'armed'; }
      if (cue) cue.textContent = text;
      if (button) button.className = `v8-shift-button v9-shift-button ${cls}`;
    }
    if (run.feedbackUntil && performance.now() > run.feedbackUntil) {
      const fb = $('#v7-shift-feedback');
      if (fb) { fb.textContent = run.laneWarning ? (run.lateralM > 0 ? 'STUUR LINKS' : 'STUUR RECHTS') : run.autoShift ? 'DSG AUTO · BLIJF IN DE LIJN' : 'SCHAKEL OP DE GROENE CUE'; fb.className = 'v7-shift-feedback v9-shift-feedback'; }
      run.feedbackUntil = 0;
    }
  }

  function buildRealtimeResult(run) {
    const fallback = run.t;
    const quarter = Number(run.milestones.quarter ?? fallback);
    const playerFinishTotal = quarter + Math.max(0, Number(run.reactionTime || 0));
    const opponentFinishTotal = run.opponent ? Number(run.opponent.result.finishTotalTime || 99) : null;
    const playerValid = !!run.valid && !run.redLight && !run.laneDnf && run.x >= 402.336;
    const won = run.opponent ? playerValid && playerFinishTotal < opponentFinishTotal : null;
    if (!run.trace.length || Number(run.trace[run.trace.length-1].distanceM || 0) < run.x) run.trace.push(realtimePoint(run,run.point?.boostBar || 0,run.point?.turboLoadPct || 0));
    const result = {
      valid: playerValid,
      redLight: !!run.redLight,
      laneDnf: !!run.laneDnf,
      failureReason: run.redLight ? 'ROOD LICHT' : run.laneDnf ? 'BUITEN DE BAAN' : run.x < 402.336 ? 'RUN AFGEBROKEN' : '',
      reactionTime: Number(run.reactionTime || 0),
      sixtyFt: Number(run.milestones.sixtyFt ?? fallback),
      threeThirty: Number(run.milestones.threeThirty ?? fallback),
      eighth: Number(run.milestones.eighth ?? fallback),
      eighthKmh: Number(run.milestones.eighthKmh || run.v * 3.6),
      thousandFt: Number(run.milestones.thousandFt ?? fallback),
      quarter,
      trapKmh: Number(run.milestones.trapKmh || run.v * 3.6),
      zeroTo100: Number(run.zeroTo100 ?? fallback),
      wheelspinPct: Math.round(run.peakWheelspin * 1000) / 10,
      finishTotalTime: playerFinishTotal,
      trace: run.trace.slice(),
      burnoutTempC: run.burnoutTempC,
      burnoutScore: run.burnoutScore,
      shiftPenalty: 0,
      perfectShifts: run.perfect,
      goodShifts: run.good,
      missedShifts: run.missed,
      earlyShifts: run.early,
      lateShifts: run.late,
      shiftScore: run.autoShift ? 100 : Math.round(clamp(100 + run.perfect * 3 - run.early * 12 - run.late * 14 - run.missed * 18, 0, 100)),
      shiftHistory: run.shiftHistory.slice(),
      shifts: run.shiftHistory.length,
      drivetrain: state.vehicle.drivetrain,
      tireName: C.TIRE_MAP[state.vehicle.tireCompound]?.name || state.vehicle.tireCompound,
      tireSize: `${state.vehicle.tireWidthMm}/${state.vehicle.aspectRatio} R${state.vehicle.rimDiameterIn}`,
      wheelSpec: `${Number(state.vehicle.rimWidthIn || 0).toFixed(1)}Jx${state.vehicle.rimDiameterIn}`,
      tireDiameterMm: C.wheelFitment(state.vehicle).diameterMm,
      transmissionId: run.transInfo.id,
      transmissionMode: run.autoShift ? 'DSG AUTO' : 'HANDMATIG',
      lineTouches: run.lineTouches,
      maxLaneOffsetM: Math.max(...run.trace.map(p => Math.abs(Number(p.lateralM || 0))), Math.abs(run.lateralM)),
      maxClutchTempC:Number(run.maxClutchTempC || run.clutchTempC || 0),
      maxGearboxTempC:Number(run.maxGearboxTempC || run.gearboxTempC || 0),
      limiterTimeS:Number(run.limiterTime || 0),
      knockEvents:Number(run.rt?.state.knockEvents || 0), kcMaxRetardDeg:Number(run.rt?.state.kcMaxDeg || 0), knockDamagePct:Number(run.rt?.state.knockDamage || 0),
      launchTyreC:Number(run.burnoutTempC || 0),
      drivelineStress:Math.round(clamp(Number(run.drivelineStress || 0),0,1000)*10)/10,
      raceMode:run.opponent ? 'heads_up' : 'solo',
      opponentId:run.opponent?.profile?.id || null,
      opponentName:run.opponent?.profile?.name || null,
      opponentQuarter:run.opponent ? Number(run.opponent.result.quarter || 0) : null,
      opponentTrapKmh:run.opponent ? Number(run.opponent.result.trapKmh || 0) : null,
      opponentReactionTime:run.opponent ? Number(run.opponent.reactionTime || 0) : null,
      opponentFinishTotalTime:opponentFinishTotal,
      raceDeltaS:run.opponent ? opponentFinishTotal - playerFinishTotal : null,
      won,
      reward:run.opponent && won && !run.auto && !raceGame?.careerRound ? Number(run.opponent.profile.reward || 0) : 0,
      autoPass:!!run.auto,
      turbo: run.turbo ? {
        maxEgtC: Math.round(run.turbo.state.maxEgtC), maxShaftPct: Math.round(run.turbo.state.maxShaftPct),
        maxEmpBar: +run.turbo.state.maxEmpBar.toFixed(2), alsSeconds: +run.turbo.state.alsSeconds.toFixed(2),
        fuelUsedG: Math.round(run.turbo.state.fuelUsedG), mapType: C.getPart(state, 'turbo') && window.EA888Turbo?.DATA?.turbos?.[C.getPart(state, 'turbo').id]?.mapType || null
      } : null,
      flames: (raceGame?.flameLog || []).length,
      measuredAt: new Date().toISOString()
    };
    return result;
  }

  function commitV7DragResult(result){
    applyRaceTurboWear();
    // knocking cycles without knock control: engine damage from what this pass actually did
    if (result.knockDamagePct > 0) {
      state.damage.engine = clamp(Number(state.damage.engine || 0) + result.knockDamagePct, 0, 100);
      state.wear.engine = clamp(Number(state.wear.engine || 0) + result.knockDamagePct * .5, 0, 100);
      pushHistory({ type: 'knock', label: `Klop in de race: ${result.knockEvents} cycli · motorschade +${result.knockDamagePct.toFixed(2)}%` });
    }
    state.lastDrag=result; markOnboarding('raced');
    state.dragRuns=Array.isArray(state.dragRuns)?state.dragRuns:[];state.dragRuns.unshift({...result});state.dragRuns=state.dragRuns.slice(0,30);
    const key=state.vehicle.drivetrain;
    if(result.valid&&(!state.records?.[key]||result.quarter<state.records[key].quarter)){
      state.records=state.records||{FWD:null,RWD:null,AWD:null};state.records[key]={...result,at:result.measuredAt};
      const trace=raceGame?.run?.trace;
      if(Array.isArray(trace)&&trace.length>20)state.ghost={drivetrain:key,quarter:result.quarter,at:result.measuredAt,trace:trace.slice(0,900)};
      pushHistory({type:'record',label:`Nieuw ${key}-record: ${result.quarter.toFixed(3)} s`,et:result.quarter,trap:result.trapKmh});
    }
    state.wear.engine=clamp(state.wear.engine+.05+Math.max(0,result.quarter < 10 ? .08 : 0)+Number(result.limiterTimeS||0)*.025,0,100);
    state.wear.transmission=clamp(state.wear.transmission+.10+result.wheelspinPct*.002+result.missedShifts*.025+Number(result.drivelineStress||0)*.003+Math.max(0,Number(result.maxGearboxTempC||0)-115)*.001,0,100);
    state.service.oilAgeKm+=35;
    if (result.reward > 0) {
      state.bank += result.reward;
      pushHistory({type:'reward',label:`Heads-up winst tegen ${result.opponentName}: +${euro(result.reward)}`});
    }
    const raceLabel = result.redLight ? 'Rood licht' : result.laneDnf ? 'Run ongeldig: buiten de baan' : result.raceMode === 'heads_up' ? `${result.won?'Heads-up winst':'Heads-up verlies'} tegen ${result.opponentName}` : 'Solo quarter-mile pass';
    pushHistory({type:'drag',label:raceLabel,et:result.quarter,trap:result.trapKmh});
    saveState();syncAchievements();
  }

  let holdFinishForTest = false;   // smoke test: keep the finish screen up (slow software WebGL)
  function finishV7Run(){
    const run = raceGame?.run;
    if (!run || run.finished) return;
    run.finished = true;
    recordGhostSample(run, true);   // the replay must end on the finish sample itself
    disposeRace3D();
    const result = buildRealtimeResult(run);
    run.finalResult = result;
    raceGame.finishResult = result;
    const round = raceGame.careerRound;
    if (round && run.opponent && !run.auto) {
      const o = run.opponent;
      const outcome = C.raceOutcome(round.format,
        { reactionTime: result.reactionTime, et: result.quarter, dialIn: round.dialIn, valid: !!result.valid || (result.redLight && !result.laneDnf) },
        { reactionTime: o.reactionTime, et: o.result.quarter, dialIn: round.plan.dialIn, valid: true });
      result.won = outcome.won;
      result.career = { eventId: round.eventId, round: round.round + 1, format: round.format, dialIn: round.dialIn, rivalDialIn: round.plan.dialIn, ...outcome };
    }
    commitV7DragResult(result);
    if (result.career) {
      state = C.applyCareerRound(state, result.career, { et: result.quarter, rt: result.reactionTime, dialIn: round.dialIn, rivalId: round.plan.rivalId });
      saveState();
    }
    raceGame.phase = 'finish';
    stopEngineAudio({ hard: true });
    haptic(result.redLight || result.laneDnf ? [70,40,70] : [18,18,45]);
    renderRaceGame();
    const delay = state.settings?.reducedMotion ? 220 : 3000;
    if (!holdFinishForTest) raceGameTimers.push(setTimeout(() => finishV7ToOverview(true), delay));
  }

  function finishV7ToOverview(auto=false){
    if(!raceGame?.open)return;
    const result=raceGame.finishResult;
    closeDragGame({silent:true,noRender:true});
    render();window.scrollTo({top:0,behavior:'auto'});
    if(result){
      if (result.career) racePanel = 'career';
      const message = result.career ? `Ronde ${result.career.round}: ${result.career.won ? 'GEWONNEN' : 'VERLOREN'} · ${result.career.reason}`
        : result.redLight ? `Rood licht · ${result.quarter.toFixed(3)} s gemeten`
        : result.laneDnf ? 'Run ongeldig · buiten de baan'
        : result.raceMode === 'heads_up' ? `${result.won?'GEWONNEN':'VERLOREN'} van ${result.opponentName} · ${Math.abs(result.raceDeltaS).toFixed(3)} s`
        : `${result.quarter.toFixed(3)} s @ ${result.trapKmh.toFixed(1)} km/u`;
      showToast(message);
    }
  }

  function raceGameTone(frequency=700,duration=.08,gainValue=.035){
    if(!state.settings?.sound)return;
    startEngineAudio('race');
    if(!engineAudio)return;
    try{
      const {ctx,master}=engineAudio;const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type='square';osc.frequency.value=frequency;gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(gainValue,ctx.currentTime+.008);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);osc.connect(gain).connect(engineAudio.mix?.ui||master);engineAudio.oneShots=engineAudio.oneShots||new Set();engineAudio.oneShots.add(osc);osc.onended=()=>{engineAudio?.oneShots?.delete(osc);try{osc.disconnect();gain.disconnect();}catch(e){}};osc.start();osc.stop(ctx.currentTime+duration+.02);
    }catch(e){}
  }

  function toggleV7Audio(){
    state.settings.sound=!state.settings.sound;
    if(state.settings.sound){startEngineAudio('race');const rpm=raceGame?.phase==='burnout'?raceGame.burn.rpm:raceGame?.phase==='stage'?raceGame.stage.rpm:raceGame?.run?.point?.rpm||900;updateEngineAudio(rpm,.35,0);}else stopEngineAudio({ hard: true });
    saveState();
    $$('[data-action="toggle-v7-audio"]', $('#race-game-root')).forEach(button => { button.textContent = state.settings.sound ? '🔊' : '🔇'; });
  }

  function updateWheelReadout() {
    const node = $('#wheel-readout');
    if (!node) return;
    const g = C.wheelFitment(state.vehicle);
    node.innerHTML = `<div><span class="eyebrow">Berekende maat</span><b>${state.vehicle.tireWidthMm}/${state.vehicle.aspectRatio} R${state.vehicle.rimDiameterIn} op ${num(state.vehicle.rimWidthIn,1)}J</b></div>
      <div><span>Diameter</span><b>${num(g.diameterMm,1)} mm</b></div><div><span>Omtrek</span><b>${num(g.circumferenceM,3)} m</b></div><div><span>Afwijking</span><b>${g.diameterDeltaPct >= 0 ? '+' : ''}${num(g.diameterDeltaPct,1)}%</b></div><div><span>Fitment</span><b>${Math.round(g.score*100)}%</b></div>`;
  }

  function serviceRange(name, label, min, max, step, value, unit, decimals) {
    return slider(name, label, min, max, step, value, unit, decimals, '', 'service');
  }

  function renderService() {
    const oil = C.OIL_MAP[state.service.oilId];
    const pendingOil = C.OIL_MAP[pendingOilId] || oil;
    const filter = C.FILTER_MAP[state.service.filterId];
    const health = C.oilHealth(state);
    const healthPct = Math.round(health * 100);
    const changeCost = pendingOil.price + C.FILTER_MAP[pendingFilterId].price;
    return `<section class="page service-page">
      <div class="page-title-row"><div><span class="eyebrow">Werkplaats</span><h1>Olie, slijtage & herstel</h1><p>Vulniveau, warme viscositeit, clearances, temperatuur, aeratie en ouderdom beïnvloeden oliedruk en filmsterkte.</p></div></div>

      <div class="service-overview v4-service-overview">
        <div class="oil-dial" style="--health:${healthPct}"><div><b>${healthPct}%</b><span>olieconditie</span></div></div>
        <div class="oil-copy"><span class="eyebrow">Huidige vulling</span><h2>${esc(oil.name)}</h2><p>${num(state.service.liters,1)} liter · ${esc(filter.name)} · ${Math.round(state.service.oilAgeKm)} km-equivalent · ${state.service.oilRuns} zware runs</p><div class="oil-tags"><span>Film ${num(oil.film*100,0)}%</span><span>Koudflow ${num(oil.coldFlow*100,0)}%</span><span>Warm-visc ${num(oil.hotViscosity*100,0)}%</span><span>Temp ${oil.tempTolerance}°C</span></div></div>
        <div class="service-budget"><span>WERKPLAATSBUDGET</span><b>${euro(state.bank)}</b></div>
      </div>

      <div class="section-head"><div><span class="eyebrow">Olie kiezen</span><h2>${C.OILS.length} verschillende profielen</h2></div><div class="selection-chip">Voorbereid: <b>${esc(pendingOil.name)}</b></div></div>
      <div class="oil-grid v4-oil-grid">
        ${C.OILS.map(o => `<button class="oil-card ${pendingOilId === o.id ? 'selected' : ''}" data-oil-id="${o.id}"><span>${pendingOilId === o.id ? icon('check') : ''}</span><div><b>${esc(o.name)}</b><small>${esc(o.detail)}</small><div class="oil-mini-bars"><i style="--v:${o.film*80}%">film</i><i style="--v:${o.coldFlow*80}%">koud</i><i style="--v:${Math.min(1.2,o.hotViscosity)/1.2*80}%">warm</i></div><em>${euro(o.price)}</em></div></button>`).join('')}
      </div>

      <div class="service-grid">
        <div class="card">
          <span class="eyebrow">Vulling & filter</span><h2>Oliebeurt voorbereiden</h2>
          ${serviceRange('liters', 'Vulvolume', 3.5, 5.4, .1, state.service.liters, ' L', 1)}
          <label class="field-label">Oliefilter<select data-service-select="filter">${C.FILTERS.map(f => `<option value="${f.id}" ${pendingFilterId === f.id ? 'selected' : ''}>${esc(f.name)} · ${euro(f.price)}</option>`).join('')}</select></label>
          <div class="service-order"><span>Nieuwe vulling</span><b>${esc(pendingOil.name)} + ${esc(C.FILTER_MAP[pendingFilterId].name)}</b><strong>${euro(changeCost)}</strong></div>
          <button class="btn" data-action="oil-change">OLIE + FILTER VERVANGEN</button>
        </div>

        <div class="card">
          <span class="eyebrow">Conditie</span><h2>Slijtage en schade</h2>
          <p class="wear-legend">Slijtage en schade: 0% = nieuw/heel, 100% = versleten/kapot.</p>
          <div class="wear-row"><span>Slijtage motor</span><b>${num(state.wear.engine,1)}%</b><i style="--wear:${state.wear.engine}%"></i></div>
          <div class="wear-row"><span>Slijtage turbo</span><b>${num(state.wear.turbo,1)}%</b><i style="--wear:${state.wear.turbo}%"></i></div>
          <div class="wear-row"><span>Slijtage spruitstuk</span><b>${num(state.wear.manifold,2)}%</b><i style="--wear:${state.wear.manifold}%"></i></div>
          <div class="wear-row"><span>Slijtage uitlaatkleppen</span><b>${num(state.wear.valves,2)}%</b><i style="--wear:${state.wear.valves}%"></i></div>
          <div class="wear-row"><span>Slijtage versnellingsbak</span><b>${num(state.wear.transmission,1)}%</b><i style="--wear:${state.wear.transmission}%"></i></div>
          <div class="wear-row danger"><span>Schade motor</span><b>${num(state.damage.engine,1)}%</b><i style="--wear:${state.damage.engine}%"></i></div>
          <div class="wear-row danger"><span>Schade turbo</span><b>${num(state.damage.turbo,1)}%</b><i style="--wear:${state.damage.turbo}%"></i></div>
          <button class="btn secondary" data-action="open-rebuild">Inspecteren / reviseren</button>
        </div>
      </div>

      <div class="card settings-card">
        <span class="eyebrow">Spelervaring</span><h2>Interface & feedback</h2>
        ${switchRow('sound', 'Motorgeluid', 'Synthesiseert toerental- en loadfeedback tijdens dyno en drag.', 'settings')}
        ${switchRow('haptics', 'Trillingsfeedback', 'Trilling bij schakelen, tree-lampen, fouten en dynostart.', 'settings')}
        ${switchRow('reducedMotion', 'Minder animatie', 'Versnelt dyno- en raceanimaties en beperkt beweging.', 'settings')}
        ${switchRow('graphics3d', '3D-racebeeld', window.EA888Race3D?.supported?.() ? 'Realtime 3D-baan met je Scirocco, rook en vlammen. Uit = de lichtere 2D-weergave.' : 'Niet beschikbaar: dit toestel ondersteunt geen WebGL.', 'settings')}
      </div>
      <div class="card settings-card sound-mixer-card">
        <span class="eyebrow">Geluid</span><h2>Motorgeluid & mixer</h2>
        <div class="segment-control engine-sound-mode" role="group" aria-label="Soort motorgeluid">
          <button class="${state.settings.engineSound !== 'samples' ? 'active' : ''}" data-engine-sound="synth">Synthese</button>
          <button class="${state.settings.engineSound === 'samples' ? 'active' : ''}" data-engine-sound="samples">Opnames</button>
        </div>
        <p class="muted small-copy">${state.settings.engineSound === 'samples'
          ? 'Eerdere opname-lagen per toerental. Werkt ook op toestellen zonder AudioWorklet.'
          : 'Elke verbrandingsslag (1-3-4-2) wordt live opgebouwd: uitlaatpulsen door jouw uitlaat, cuts van limiter, two-step en schakelen, knock en naverbranding. Zonder AudioWorklet valt de app terug op opnames.'}</p>
        <div class="mixer-grid">
          ${[['engine','Motor & uitlaat'],['turbo','Turbo & blow-off'],['als','Anti-lag & knallen'],['tyre','Banden'],['rival','Rivaal'],['ui','Interface']].map(([k, label]) => slider(k, label, 0, 150, 5, Number(state.settings.mix?.[k] ?? 100), '%', 0, '', 'mix')).join('')}
        </div>
      </div>
    </section>`;
  }

  function renderData() {
    const r = state.lastDyno;
    const clean = currentDyno();
    const geometry = C.engineGeometry(state);
    const cam = C.camTimingHealth(state);
    const assembly = C.assemblyHealth(state);
    const bench = C.benchConfidence(state);
    const buildRows = C.CATEGORIES.map(cat => `<tr><td>${esc(cat.label)}</td><td>${esc(C.getPart(state, cat.id).name)}<small>${esc(C.getPart(state, cat.id).specs)}</small></td></tr>`).join('');
    const history = (state.history || []).slice(0, 22).map(h => `<div class="log-row"><i></i><div><b>${esc(h.label || h.type)}</b><small>${new Date(h.at).toLocaleString('nl-NL')}${Number.isFinite(h.hp) ? ` · ${Math.round(h.hp)} pk / ${Math.round(h.nm)} Nm${h.partial ? ' (partieel)' : ''}` : ''}${h.et ? ` · ${h.et.toFixed(3)} s @ ${h.trap.toFixed(1)} km/u` : ''}</small></div></div>`).join('');
    return `<section class="page data-page">
      <div class="data-back"><button class="text-button" data-go="bank">${icon('back')} Terug naar garage</button></div>
      <div class="page-title-row"><div><span class="eyebrow">Build sheet & datalog</span><h1>Volledige technische status</h1><p>Hardware, montage, benchtests, metingen, service, records en overdraagbare buildcode bij elkaar.</p></div></div>
      ${clean ? '<div class="notice success"><strong>Configuratie en dynodata komen overeen.</strong></div>' : staleNotice()}

      <div class="build-name-card card"><label><span class="eyebrow">Projectnaam</span><input id="build-name-input" value="${esc(state.buildName)}" maxlength="52" aria-label="Buildnaam"></label><div><button class="btn secondary small" data-action="export-build">Build exporteren</button><button class="btn ghost small" data-action="open-import">Build importeren</button></div></div>
      <div class="card backup-card"><div><span class="eyebrow">Volledige back-up</span><p>Alles in één bestand: budget, historie, dynoruns, slijtage en buildslots. Maak er een vóór je de app verwijdert of van telefoon wisselt.</p></div><div class="backup-actions"><button class="btn small" data-action="backup-save" ${NATIVE ? '' : 'disabled'}>Back-up opslaan</button><button class="btn ghost small" data-action="backup-open" ${NATIVE ? '' : 'disabled'}>Back-up openen</button></div>${NATIVE ? '' : '<small class="why">Beschikbaar in de Android-app of de gebouwde webversie.</small>'}</div>

      <div class="data-kpis v4-data-kpis">
        <div><span>Motor</span><b>${num(geometry.displacementCc,0)} cc</b><small>${num(geometry.boreMm,2)} × ${num(geometry.strokeMm,1)} mm</small></div>
        <div><span>Montagescore</span><b>${Math.round(assembly.score*100)}%</b><small>rings, lagers, gap en procedure</small></div>
        <div><span>Bench confidence</span><b>${bench.score || 0}%</b><small>${bench.current}/${bench.total} actueel · ${bench.failed} fail</small></div>
        <div><span>Laatste dyno</span><b>${r ? dynoMetricText(r, 'peakHp', ' pk') : '—'}</b><small>${!r ? 'niet gemeten' : C.isCompletedDyno(r) ? `${Math.round(r.peakTorqueNm)} Nm · ${r.reliabilityScore}/100` : esc(dynoScopeLabel(r))}</small></div>
        <div><span>FWD-record</span><b>${state.records?.FWD ? `${state.records.FWD.quarter.toFixed(3)} s` : '—'}</b><small>${state.records?.FWD ? `${state.records.FWD.trapKmh.toFixed(1)} km/u` : 'geen geldige pass'}</small></div>
        <div><span>AWD-record</span><b>${state.records?.AWD ? `${state.records.AWD.quarter.toFixed(3)} s` : '—'}</b><small>${state.records?.AWD ? `${state.records.AWD.trapKmh.toFixed(1)} km/u` : 'geen geldige pass'}</small></div>
      </div>

      ${r ? `<div class="card"><div class="section-head small"><div><span class="eyebrow">Laatste dynolog</span><h2>${esc(dynoHeadline(r))}</h2></div>${scoreBadge(r)}</div>
        <div class="technical-grid"><div><span>Status</span><b>${esc(r.rating || '')}${dynoIsPartial(r) ? ` · ${esc(dynoScopeLabel(r))}` : ''}</b></div><div><span>Turbo</span><b>${esc(r.turboName)} · ${r.compressorMm} mm</b></div><div><span>Knock-index</span><b>${num(r.maxKnockRisk,2)}</b></div><div><span>Fuel duty</span><b>${num(r.maxFuelDuty,1)}%</b></div><div><span>Turbo-load / as</span><b>${num(r.maxTurboLoad,1)}% · ${Math.round(r.maxTurboShaftRpm/1000)}k rpm</b></div><div><span>Thermisch</span><b>${num(r.maxIatC,0)} / ${num(r.maxEgtC,0)} / ${num(r.maxOilTempC,0)} °C</b></div></div>
      </div>` : ''}

      <div class="card assembly-data-card"><span class="eyebrow">Montageblad</span><h2>Actuele meetwaarden</h2><div class="technical-grid"><div><span>Top / tweede ring</span><b>${num(state.assembly.topRingGapMm,2)} / ${num(state.assembly.secondRingGapMm,2)} mm</b></div><div><span>Rod / main clearance</span><b>${num(state.assembly.rodClearanceMm,3)} / ${num(state.assembly.mainClearanceMm,3)} mm</b></div><div><span>Bougiegap</span><b>${num(state.assembly.sparkGapMm,2)} mm</b></div><div><span>Nokken-TDC</span><b>${num(state.tune.exhaustTdcLiftMm,2)} / ${num(state.tune.intakeTdcLiftMm,2)} mm</b></div><div><span>Balans / sealing</span><b>${state.assembly.balanceQualityPct}% / ${state.assembly.deckSealQualityPct}%</b></div><div><span>Geprimed</span><b>${state.assembly.oilPrimed ? 'ja' : 'nee'}</b></div></div></div>

      <details class="card build-table-card fold-card"><summary><span><span class="eyebrow">Gemonteerde hardware</span><b>${C.CATEGORIES.length} onderdelen · ${euro(C.totalPartsPrice(state))}</b></span><i aria-hidden="true">${icon('chevron')}</i></summary><h2>${esc(state.buildName)}</h2><table class="build-table">${buildRows}<tr class="total"><td>Totaal onderdelen</td><td>${euro(C.totalPartsPrice(state))}</td></tr></table></details>
      <div class="card"><span class="eyebrow">Logboek</span><h2>Laatste gebeurtenissen</h2><div class="log-list">${history || '<p class="muted">Nog geen logboekitems.</p>'}</div></div>
      <div class="card model-card"><span class="eyebrow">Modelgrenzen</span><h2>Engineering-game, geen ECU-map</h2><p>Het model combineert airflow, spool, wastegatecontrole, EMP, brandstofcapaciteit, BMEP, knock, EGT, turbospeed, zuigersnelheid, oliedruk, aeratie, oliefilm, clearances en componentgrenzen. De dragintegratie gebruikt vervolgens de gemeten curve, gearing, wielradius, roterende massa, tractie, luchtweerstand en gewichtsverplaatsing.</p><p>Een veilige score in het spel is nooit een bouwgarantie. Een echte motor moet worden gevalideerd met raildruk, lambda, knock, EGT, turbospeed, cilinderdruk, carterdruk en oliedruk.</p></div>
      <div class="button-row"><button class="btn secondary" data-action="self-test">Interne zelftest</button><button class="btn danger" data-action="open-reset">Alles resetten</button></div>
    </section>`;
  }

  function showExportModal() {
    const code = encodeBuildCode();
    importBuffer = code;
    showModal('Buildcode exporteren', `<p class="modal-copy">Deze offline code bevat hardware, tune, montage, olie, voertuigsetup en dynocondities. Dyno- en raceuitslagen worden niet meegestuurd.</p><textarea id="build-code-output" class="build-code-area" readonly>${esc(code)}</textarea><small class="code-meta">${code.length.toLocaleString('nl-NL')} tekens · EA888 Lab v6</small>`, '<button class="btn ghost" data-action="close-modal">Sluiten</button><button class="btn" data-action="copy-build-code">Code kopiëren</button>');
  }

  function showImportModal() {
    importBuffer = '';
    showModal('Buildcode importeren', '<p class="modal-copy">Plak een EA888 Lab-buildcode. De huidige hardware, tune, montage, servicekeuze, voertuigsetup en dynocondities worden vervangen. Historie, budget en records blijven behouden.</p><textarea id="build-code-input" class="build-code-area" placeholder="Plak hier de buildcode…"></textarea><div id="import-feedback" class="import-feedback"></div>', '<button class="btn ghost" data-action="close-modal">Annuleren</button><button class="btn" data-action="confirm-import">Importeren</button>');
  }

  async function copyBuildCode() {
    const code = ($('#build-code-output')?.value || importBuffer || encodeBuildCode()).trim();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else { const area=$('#build-code-output'); area?.focus(); area?.select(); document.execCommand('copy'); }
      haptic(12); showToast('Buildcode gekopieerd.');
    } catch (e) {
      const area=$('#build-code-output'); if(area){area.focus();area.select();}
      showToast('Selecteer de code en kopieer hem handmatig.');
    }
  }

  function confirmImport() {
    try {
      const snap = decodeBuildCode(importBuffer || $('#build-code-input')?.value || '');
      for (const key of ['selections','tune','assembly','service','vehicle','dynoConfig']) {
        if (snap[key]) state[key] = { ...state[key], ...JSON.parse(JSON.stringify(snap[key])) };
      }
      state.buildName = String(snap.buildName || 'Geïmporteerde EA888-build').slice(0,52);
      markOnboarding('built');
      state.bench = { results:{} };
      state.lastDynoSignature = '';
      pendingOilId = state.service.oilId;
      pendingFilterId = state.service.filterId;
      pushHistory({ type:'import', label:`Build geïmporteerd: ${state.buildName}` });
      saveState(); closeModal(); haptic([12,25,12]); showToast('Build geïmporteerd. Voer benchtests en een nieuwe dynopull uit.'); render();
    } catch (e) {
      const feedback=$('#import-feedback'); if(feedback) feedback.innerHTML=`<div class="notice danger"><strong>Import mislukt.</strong> ${esc(e.message)}</div>`;
      else showToast(`Import mislukt: ${e.message}`);
    }
  }

  function runBench(id) {
    try {
      const result = C.runBenchTest(state, id);
      state.bench = state.bench || { results:{} };
      state.bench.results = state.bench.results || {};
      state.bench.results[id] = result;
      pushHistory({ type:'bench', label:`${C.BENCH_TESTS.find(x=>x.id===id)?.name || id}: ${result.status.toUpperCase()}` });
      saveState(); haptic(result.status==='fail'?[45,25,45]:[10,20,10]); showToast(`${result.summary} · ${result.score}/100`); render();
    } catch (e) { showToast(e.message); }
  }

  function runAllBench() {
    for (const test of C.BENCH_TESTS) {
      const result = C.runBenchTest(state, test.id);
      state.bench.results[test.id] = result;
    }
    pushHistory({ type:'bench', label:'Volledige benchtestreeks uitgevoerd' });
    saveState(); syncAchievements(); haptic([12,20,12]); showToast('Alle zes benchtests zijn uitgevoerd.'); render();
  }

  function claimChallenge(id) {
    const earned = C.evaluateChallenges(state);
    const challenge = C.CHALLENGES.find(ch=>ch.id===id);
    if (!challenge || !earned[id]) return showToast('Deze challenge is nog niet behaald.');
    state.achievements = state.achievements || {};
    const progress = state.achievements[id] || { unlockedAt:new Date().toISOString(), claimed:false };
    if (progress.claimed) return showToast('Beloning is al geclaimd.');
    progress.claimed = true; state.achievements[id] = progress; state.bank += challenge.reward;
    pushHistory({ type:'reward', label:`Challenge geclaimd: ${challenge.title} (+${euro(challenge.reward)})` });
    saveState(); haptic([20,25,20,25,30]); showToast(`${challenge.title}: ${euro(challenge.reward)} toegevoegd.`); render();
  }

  function showEngineInfo(key) {
    const map = {
      head: ['Kop, nokken & kleppentrein', [C.getPart(state,'head'), C.getPart(state,'valvetrain'), C.getPart(state,'manifold')]],
      block: ['Onderblok, krukas & olie', [C.getPart(state,'block'), C.getPart(state,'crank'), C.getPart(state,'oiling'), C.getPart(state,'crankcase'), C.getPart(state,'sealing')]],
      fuel: ['Brandstofsysteem', [C.getPart(state,'fuelSystem'), C.getPart(state,'fuel'), C.getPart(state,'ignition')]],
      turbo: ['Turbo, wastegates & luchtpad', [C.getPart(state,'turbo'), C.getPart(state,'boostControl'), C.getPart(state,'air'), C.getPart(state,'exhaust'), C.getPart(state,'spool')]],
      ecu: ['ECU, sensoren & beveiliging', [C.getPart(state,'ecu'), C.getPart(state,'sensors'), C.getPart(state,'ignition')]]
    };
    const entry = map[key]; if (!entry) return;
    showModal(entry[0], `<div class="modal-part-list">${entry[1].map(p => `<article><b>${esc(p.name)}</b><p>${esc(p.detail)}</p><small>${esc(p.specs)}</small></article>`).join('')}</div>`);
  }

  function showModal(title, body, actions = '') {
    $('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-handle"></div><span class="eyebrow">EA888 Lab v${APP_VERSION}</span><h2 id="modal-title">${esc(title)}</h2>${body}<div class="modal-actions">${actions || '<button class="btn" data-action="close-modal">Sluiten</button>'}</div></div></div>`;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function doOilChange() {
    state.service.oilId = pendingOilId;
    state.service.filterId = pendingFilterId;
    state.service.oilAgeKm = 0;
    state.service.oilRuns = 0;
    state.service.lastChangeLabel = new Date().toLocaleDateString('nl-NL');
    state.bank -= (C.OIL_MAP[pendingOilId].price + C.FILTER_MAP[pendingFilterId].price);
    pushHistory({ type: 'service', label: `Olie gewisseld: ${C.OIL_MAP[pendingOilId].name}` });
    saveState(); haptic([18,30,18]);
    showToast('Olie en filter vervangen. Een nieuwe dynometing is vereist.');
    render();
  }

  function doRebuild() {
    // A rebuild renews the engine incl. exhaust valves; the manifold is inspected and resurfaced.
    state.wear = { engine: 0, turbo: Math.max(0, state.wear.turbo - 10), transmission: Math.max(0, state.wear.transmission - 5), valves: 0, manifold: Math.max(0, state.wear.manifold - 25) };
    state.damage = { engine: 0, turbo: 0, transmission: 0 };
    state.bank -= 6500;
    state.lastDynoSignature = '';
    pushHistory({ type: 'service', label: 'Motor geïnspecteerd en gereviseerd' });
    saveState(); closeModal(); haptic([30,30,30]);
    showToast('Revisie voltooid; voer een nieuwe dynopull uit.'); render();
  }

  function doReset() {
    state = C.createInitialState();
    state.version = 12;
    pendingOilId = state.service.oilId; pendingFilterId = state.service.filterId;
    saveState(); closeModal(); haptic(35);
    showToast('EA888 Lab teruggezet naar de Randy JE83 K04-referentie.'); render();
  }

  // ---- Controls: steppers, tap-to-type, safe-limit confirmation and undo --------------------------------
  // Every range control edits one state path (data-tune / data-assembly / data-als / data-dyno-config /
  // data-vehicle / data-service). An edit records the old value of just that path, so "Ongedaan" restores
  // exactly what was changed and never rolls back anything else (a dyno pull done since, money, wear).
  const RANGE_PATHS = [['tune', 'tune'], ['assembly', 'assembly'], ['dynoConfig', 'dynoConfig'], ['vehicle', 'vehicle'], ['service', 'service']];
  function rangePath(el) {
    if (el.dataset.als) return ['tune', 'als'];
    for (const [attr, group] of RANGE_PATHS) if (el.dataset[attr]) return [group, el.dataset[attr]];
    return null;
  }
  const readPath = ([g, k]) => cloneJson(g === '__root' ? state[k] : state[g]?.[k]);
  function writePath([g, k], value) { if (g === '__root') state[k] = cloneJson(value); else if (state[g]) state[g][k] = cloneJson(value); }
  function rangeText(el, value = el.value) { return `${Number(value).toFixed(Number(el.dataset.decimals || 0))}${el.dataset.unit || ''}`; }
  function rangeLabel(el) { return el.closest('.control')?.querySelector('.control-head b')?.textContent?.trim() || 'Waarde'; }

  let rangeEdit = null; // { el, path, before, fromValue }
  function beginRangeEdit(el) {
    const path = rangePath(el);
    if (!path || rangeEdit?.el === el) return;
    rangeEdit = { el, path, before: readPath(path), fromValue: el.dataset.committed ?? el.getAttribute('value') ?? el.value };
  }
  document.addEventListener('input', ev => { if (ev.target.matches?.('input[type="range"]')) beginRangeEdit(ev.target); }, true);

  // Hardware limits that deserve a confirmation when a value is pushed past them.
  function safeLimit(path) {
    const [g, k] = path;
    if (g === 'tune' && /^boost(Low|Mid|High)Bar$/.test(k)) {
      const bc = C.getPart(state, 'boostControl');
      return { value: Number(bc.boostHardwareMaxBar), text: `${num(bc.boostHardwareMaxBar, 2)} bar`, why: `de limiet van ${bc.name}` };
    }
    if (g === 'tune' && k === 'revLimitRpm') {
      const lim = Math.min(...['block', 'crank', 'oiling', 'head', 'valvetrain', 'ecu'].map(id => Number(C.getPart(state, id)?.rpmLimit) || Infinity));
      return Number.isFinite(lim) ? { value: lim, text: `${Math.round(lim)} rpm`, why: 'de toerengrens van de zwakste gemonteerde component' } : null;
    }
    if (g === 'tune' && k === 'ignitionTrimDeg') return { value: 3, text: '+3,0°', why: 'de knockmarge van de basiskaart' };
    return null;
  }
  function alsLimit(key, value) {
    if (key === 'maxEgtC' && value > 1100) return { text: '1100 °C', why: 'de temperatuurgrens van spruitstuk en turbinehuis' };
    if (key === 'maxShaftPct' && value > 100) return { text: '100 %', why: 'het maximum toerental van de turbo-as' };
    return null;
  }

  function commitRangeEdit(el) {
    const edit = rangeEdit?.el === el ? rangeEdit : null;
    rangeEdit = null;
    if (!edit) return;
    const from = edit.fromValue, to = el.value;
    el.dataset.committed = to;
    if (Number(from) === Number(to)) return;
    markOnboarding('built');
    saveState();
    const label = rangeLabel(el);
    const undo = () => { writePath(edit.path, edit.before); saveState(); render(); showToast(`${label} teruggezet naar ${rangeText(el, from)}.`); };
    const lim = el.dataset.als ? alsLimit(el.dataset.als, Number(to)) : safeLimit(edit.path);
    const crossed = lim && (el.dataset.als ? true : Number(to) > lim.value && Number(from) <= lim.value);
    if (crossed && (!el.dataset.als || !alsLimit(el.dataset.als, Number(from)))) {
      showModal('Boven de veilige grens',
        `<p class="modal-copy"><b>${esc(label)}</b> staat nu op <b>${esc(rangeText(el, to))}</b>, boven ${esc(lim.why)} (${esc(lim.text)}). Dat vergroot de kans op schade tijdens de pull en op de strip.</p>`,
        '<button class="btn" data-action="limit-revert" autofocus>Terugzetten</button><button class="btn ghost" data-action="limit-accept">Toch doorgaan</button>');
      pendingLimit = { undo, label, text: `${label} ${rangeText(el, from)} → ${rangeText(el, to)}` };
      haptic([20, 30, 20]);
      return;
    }
    showToast(`${label} ${rangeText(el, from)} → ${rangeText(el, to)}`, { label: 'Ongedaan', run: undo });
  }
  let pendingLimit = null;
  document.addEventListener('change', ev => { if (ev.target.matches?.('input[type="range"]')) commitRangeEdit(ev.target); });

  // Stepper buttons: one step per tap; hold to repeat, speeding up after a dozen steps.
  let stepHold = null;
  function stepRange(input, dir, mult = 1) {
    const min = Number(input.min), max = Number(input.max), step = Number(input.step) || 1;
    const v = clamp(Math.round((Number(input.value) + dir * step * mult) / step) * step, min, max);
    const text = String(Number(v.toFixed(6)));
    if (input.value === text) return false;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  function endStepHold() {
    if (!stepHold) return;
    clearTimeout(stepHold.timer);
    const { input } = stepHold;
    stepHold = null;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.addEventListener('pointerdown', ev => {
    const btn = ev.target.closest?.('.step-btn');
    if (!btn || btn.disabled || raceGame?.open) return;
    const input = btn.closest('.range-row')?.querySelector('input[type="range"]');
    if (!input) return;
    ev.preventDefault();
    endStepHold();
    const dir = Number(btn.dataset.step) || 1;
    if (stepRange(input, dir)) haptic(4);
    const repeat = () => {
      if (!stepHold) return;
      stepHold.count += 1;
      stepRange(input, dir, stepHold.count > 12 ? 5 : 1);
      stepHold.timer = setTimeout(repeat, stepHold.count > 6 ? 45 : 90);
    };
    stepHold = { input, count: 0, timer: setTimeout(repeat, 420) };
  }, { passive: false });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => document.addEventListener(type, ev => { if (stepHold && (type !== 'pointerleave' || ev.target.closest?.('.step-btn'))) endStepHold(); }, true));
  document.addEventListener('keydown', ev => {
    const btn = ev.target.closest?.('.step-btn');
    if (btn && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      const input = btn.closest('.range-row')?.querySelector('input[type="range"]');
      if (input && stepRange(input, Number(btn.dataset.step) || 1)) input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const out = ev.target.closest?.('.value-edit');
    if (out && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openValueEditor(out); }
  });

  // Tap the value to type it exactly.
  let valueEditorInput = null;
  function openValueEditor(output) {
    const input = output.closest('.control')?.querySelector('input[type="range"]');
    if (!input || input.disabled) return;
    valueEditorInput = input;
    const unit = (input.dataset.unit || '').trim();
    showModal(esc(rangeLabel(input)),
      `<label class="value-editor"><span>Nieuwe waarde${unit ? ` (${esc(unit)})` : ''}</span><input id="value-editor-field" type="number" inputmode="decimal" min="${input.min}" max="${input.max}" step="${input.step}" value="${input.value}"></label><p class="modal-copy">Bereik ${esc(rangeText(input, input.min))} – ${esc(rangeText(input, input.max))}, stap ${esc(String(Number(input.step)))}.</p>`,
      '<button class="btn ghost" data-action="close-modal">Annuleren</button><button class="btn" data-action="value-editor-apply">Toepassen</button>');
    setTimeout(() => { const f = $('#value-editor-field'); f?.focus(); f?.select(); }, 60);
  }
  function applyValueEditor() {
    const input = valueEditorInput;
    const field = $('#value-editor-field');
    valueEditorInput = null;
    if (!input || !field) return closeModal();
    const raw = Number(String(field.value).replace(',', '.'));
    closeModal();
    if (!Number.isFinite(raw)) return showToast('Geen geldig getal.');
    const step = Number(input.step) || 1;
    const v = clamp(Math.round(raw / step) * step, Number(input.min), Number(input.max));
    input.value = String(Number(v.toFixed(6)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.addEventListener('click', ev => {
    const out = ev.target.closest?.('.value-edit');
    if (out && !raceGame?.open) openValueEditor(out);
  });

  // Undo for tapped changes (parts, presets, switches): the old value of the touched paths only.
  function offerUndo(paths, label) {
    const before = paths.map(p => [p, readPath(p)]);
    return () => showToast(label, { label: 'Ongedaan', run: () => { before.forEach(([p, v]) => writePath(p, v)); pendingOilId = state.service.oilId; pendingFilterId = state.service.filterId; saveState(); render(); showToast('Ongedaan gemaakt.'); } });
  }

  // Scroll-safe sliders. Native range inputs grab a vertical swipe and change their value while the user only
  // wanted to scroll. Range inputs ignore the pointer (CSS) and this handler moves them only after a clearly
  // horizontal drag; a vertical swipe scrolls the page and a plain tap changes nothing.
  let sliderDrag = null;
  function rangeUnder(event) {
    if (event.target.closest?.('.step-btn, .value-edit')) return null;
    const host = event.target.closest?.('.control, .compact-control, .als-control, [data-range-host]');
    const input = host?.querySelector('input[type="range"]');
    if (!input || input.disabled) return null;
    const r = input.getBoundingClientRect();
    return event.clientY >= r.top - 18 && event.clientY <= r.bottom + 18 && event.clientX >= r.left - 12 && event.clientX <= r.right + 12 ? input : null;
  }
  function setRangeFromX(input, clientX) {
    const r = input.getBoundingClientRect();
    const min = Number(input.min || 0), max = Number(input.max || 100), step = Number(input.step) || 1;
    const thumb = 13; // half thumb width: the native track maps the value between thumb centres
    const f = clamp((clientX - r.left - thumb) / Math.max(1, r.width - 2 * thumb), 0, 1);
    const v = clamp(Math.round((min + f * (max - min)) / step) * step, min, max);
    const text = String(Number(v.toFixed(6)));
    if (input.value === text) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.addEventListener('pointerdown', event => {
    if (raceGame?.open) return;
    const input = rangeUnder(event);
    if (input) sliderDrag = { input, id: event.pointerId, x: event.clientX, y: event.clientY, mode: 'pending', moved: false };
  }, true);
  document.addEventListener('pointermove', event => {
    const d = sliderDrag;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (d.mode === 'pending') {
      if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) { sliderDrag = null; return; }
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        d.mode = 'drag';
        d.input.closest('.control, .compact-control, .als-control, [data-range-host]')?.classList.add('slider-active');
        try { event.target.setPointerCapture?.(event.pointerId); } catch (e) {}
      } else return;
    }
    event.preventDefault();
    d.moved = true;
    setRangeFromX(d.input, event.clientX);
  }, { passive: false, capture: true });
  function endSliderDrag(event) {
    const d = sliderDrag;
    if (!d || d.id !== event.pointerId) return;
    sliderDrag = null;
    d.input.closest('.slider-active')?.classList.remove('slider-active');
    if (d.moved) { d.input.dispatchEvent(new Event('change', { bubbles: true })); haptic(4); }
  }
  document.addEventListener('pointerup', endSliderDrag, true);
  document.addEventListener('pointercancel', endSliderDrag, true);

  document.addEventListener('pointerdown', event => {
    resumeAudioContextOnly();
    const gameControl = event.target.closest?.('[data-v7-control]');
    if (gameControl && raceGame?.open && !gameControl.disabled) {
      event.preventDefault();
      const name = gameControl.dataset.v7Control;
      raceGamePointerMap.set(event.pointerId, name);
      if (name in raceGamePointer) raceGamePointer[name] = true;
      try { gameControl.setPointerCapture(event.pointerId); } catch (e) {}
      if (name === 'burnout') { startEngineAudio('burnout'); haptic(7); }
      else if (name === 'creep') haptic(5);
      else if (name === 'throttle') {
        const st = raceGame.phase === 'stage' ? raceGame.stage : null;
        if (st?.treeStarted && !st.launched && !st.launchArmed) { launchV7Race(false); return; }
        startEngineAudio('staged'); haptic(6);
      }
      return;
    }
    const btn = event.target.closest?.('[data-action="burnout-hold"]');
    if (!btn || btn.disabled) return;
    event.preventDefault();
    try { btn.setPointerCapture(event.pointerId); } catch (e) {}
    startBurnout(event.pointerId);
  }, { passive: false });

  function releaseRaceGamePointer(event) {
    const name = raceGamePointerMap.get(event.pointerId);
    if (!name) return '';
    raceGamePointerMap.delete(event.pointerId);
    if (name in raceGamePointer) raceGamePointer[name] = false;
    return name;
  }

  document.addEventListener('pointerup', event => {
    const released = releaseRaceGamePointer(event);
    if (released) {
      if (released === 'throttle' && raceGame?.phase === 'stage' && raceGame.stage?.treeStarted && raceGame.stage.launchArmed && !raceGame.stage.launched) {
        launchV7Race(false);
      } else if (released === 'burnout' && raceGame?.phase === 'burnout' && raceGame.burn?.started && !raceGame.burn.done) {
        const profile = burnoutProfile();
        const enoughHeat = raceGame.burn.tempC >= profile.targetC - 10;
        const enoughTime = raceGame.burn.elapsed >= 1.6;
        if (enoughHeat && enoughTime) finishV7Burnout();
      }
      return;
    }
    if (!burnoutRuntime?.active) return;
    if (burnoutPointerId != null && event.pointerId !== burnoutPointerId) return;
    stopBurnout();
  });

  document.addEventListener('pointercancel', event => {
    if (releaseRaceGamePointer(event)) return;
    if (!burnoutRuntime?.active) return;
    if (burnoutPointerId != null && event.pointerId !== burnoutPointerId) return;
    stopBurnout({ silent: true });
  });

  window.addEventListener('blur', () => {
    raceGamePointer = { burnout:false, creep:false, throttle:false, steerLeft:false, steerRight:false, antilag:false };
    raceGamePointerMap.clear();
    if (burnoutRuntime?.active) stopBurnout({ silent: true });
  });

  document.addEventListener('click', event => {
    if (event.target.matches('[data-modal-backdrop]')) { closeModal(); return; }
    const btn = event.target.closest('button,[data-action]');
    if (!btn) return;
    if (btn.dataset.nav) { haptic(8); return go(btn.dataset.nav); }
    if (btn.dataset.go) { haptic(8); return go(btn.dataset.go); }
    if (btn.dataset.openCategory) { haptic(10); return openCategoryTile(btn.dataset.openCategory); }
    if (btn.dataset.cat) { activeCategory = btn.dataset.cat; partSearch = ''; haptic(6); return render(); }
    if (btn.dataset.motorPanel) { motorPanel = btn.dataset.motorPanel; haptic(6); return render(); }
    if (btn.dataset.engineView) { engineView = btn.dataset.engineView; haptic(6); return render(); }
    if (btn.dataset.tunePanel) { tunePanel = btn.dataset.tunePanel; haptic(6); return render(); }
    if (btn.dataset.careerEnter) return careerEnter(btn.dataset.careerEnter);
    if (btn.dataset.engineSound) {
      state.settings.engineSound = btn.dataset.engineSound === 'samples' ? 'samples' : 'synth';
      stopEngineAudio({ hard: true }); // the next sound start builds the chosen engine voice
      saveState(); haptic(6); return render();
    }
    if (btn.dataset.dynoCorrection) {
      const announce = offerUndo([['dynoConfig', 'correction']], `Correctienorm → ${C.DYNO_CORRECTIONS[btn.dataset.dynoCorrection]?.label || ''}`);
      state.dynoConfig.correction = btn.dataset.dynoCorrection; saveState(); haptic(6); render(); return announce();
    }
    if (btn.dataset.alsMode) {
      const m = btn.dataset.alsMode;
      state.tune.als = m === 'custom' ? { ...C.resolveAntiLag(state).params, mode: 'custom' } : { ...state.tune.als, mode: m };
      saveState(); haptic(8); return render();
    }
    if (btn.dataset.compareRun != null) { dynoCompareIndex = Number(btn.dataset.compareRun); dynoComparePinned = true; state.settings.dynoCompare = true; saveState(); haptic(6); return render(); }
    if (btn.dataset.dynoChannel) { dynoChannel = btn.dataset.dynoChannel; haptic(5); return render(); }
    if (btn.dataset.racePanel) { stopBurnout({ silent: true }); clearTreeTimers(); treeSession = null; racePanel = btn.dataset.racePanel; haptic(6); return render(); }
    if (btn.dataset.raceMode) {
      state.vehicle.raceMode = btn.dataset.raceMode === 'solo' ? 'solo' : 'heads_up';
      saveState(); haptic(10); return render();
    }
    if (btn.dataset.rivalLevel && RIVALS[btn.dataset.rivalLevel]) {
      state.vehicle.rivalLevel = btn.dataset.rivalLevel;
      saveState(); haptic([8,12,8]); return render();
    }
    if (btn.dataset.treeMode) { clearTreeTimers(); treeSession = null; racePhase = 'burnout'; treeMode = btn.dataset.treeMode; haptic(6); return render(); }
    if (btn.dataset.engineInfo) { haptic(8); return showEngineInfo(btn.dataset.engineInfo); }
    if (btn.dataset.saveSlot != null) return saveBuildSlot(Number(btn.dataset.saveSlot));
    if (btn.dataset.loadSlot != null) return loadBuildSlot(Number(btn.dataset.loadSlot));
    if (btn.dataset.claimChallenge) return claimChallenge(btn.dataset.claimChallenge);
    if (btn.dataset.runBench) return runBench(btn.dataset.runBench);
    if (btn.dataset.assemblySwitch) {
      state.assembly[btn.dataset.assemblySwitch] = !state.assembly[btn.dataset.assemblySwitch];
      saveState(); haptic(10); return render();
    }
    if (btn.dataset.preset) {
      const announce = offerUndo(['selections', 'tune', 'assembly', 'service', 'vehicle', 'dynoConfig', 'buildName'].map(k => ['__root', k]), 'Build geladen. Het resultaat blijft verborgen tot de dyno.');
      state = C.applyPreset(state, btn.dataset.preset);
      markOnboarding('built');
      pendingOilId = state.service.oilId; pendingFilterId = state.service.filterId;
      saveState(); haptic([12,25,12]);
      render();
      return announce();
    }
    if (btn.dataset.partCat && btn.dataset.partId) {
      if (btn.disabled) return;
      const cat = C.CATEGORY_MAP[btn.dataset.partCat];
      const oldName = C.getPart(state, btn.dataset.partCat)?.name || '';
      if (state.selections[btn.dataset.partCat] === btn.dataset.partId) return;
      const announce = offerUndo([['selections', btn.dataset.partCat]], `${cat?.short || 'Onderdeel'}: ${oldName} → ${cat?.items.find(x => x.id === btn.dataset.partId)?.name || btn.dataset.partId}`);
      state.selections[btn.dataset.partCat] = btn.dataset.partId;
      markOnboarding('built');
      saveState(); haptic(16);
      render();
      return announce();
    }
    if (btn.dataset.switch) {
      const announce = offerUndo([['tune', btn.dataset.switch]], `${btn.closest('.switch-row, .control, label')?.querySelector('b')?.textContent?.trim() || 'Schakelaar'} ${state.tune[btn.dataset.switch] ? 'uit' : 'aan'}`);
      state.tune[btn.dataset.switch] = !state.tune[btn.dataset.switch];
      saveState(); haptic(10); render();
      return announce();
    }
    if (btn.dataset.vehicleSwitch) {
      state.vehicle[btn.dataset.vehicleSwitch] = !state.vehicle[btn.dataset.vehicleSwitch];
      saveState(); haptic(10); return render();
    }
    if (btn.dataset.settingSwitch) {
      state.settings[btn.dataset.settingSwitch] = !state.settings[btn.dataset.settingSwitch];
      if (btn.dataset.settingSwitch === 'sound' && !state.settings.sound) stopEngineAudio({ hard: true });
      saveState(); haptic(10); return render();
    }
    if (btn.dataset.oilId) { pendingOilId = btn.dataset.oilId; haptic(8); return render(); }

    switch (btn.dataset.action) {
      case 'open-drag-game': startDragGame(false); break;
      case 'career-race': careerRace(); break;
      case 'career-forfeit': careerForfeit(); break;
      case 'auto-drag-game': startDragGame(true); break;
      case 'close-drag-game': closeDragGame(); break;
      case 'v7-reset-stage': resetV7Stage(); break;
      case 'v7-start-tree': startV7Tree(); break;
      case 'v7-launch': launchV7Race(false); break;
      case 'v7-shift': handleV7Shift(false); break;
      case 'toggle-v7-audio': toggleV7Audio(); break;
      case 'finish-to-overview': finishV7ToOverview(false); break;
      case 'finish-replay': case 'replay-restart': startReplay(); break;
      case 'replay-close': closeReplay(); break;
      case 'start-dyno': startDyno(); break;
      case 'als-test': runAlsTest(); break;
      case 'abort-dyno': abortDyno(); break;
      case 'toggle-compare': state.settings.dynoCompare = state.settings.dynoCompare === false; saveState(); render(); break;
      case 'reset-tune': {
        const stock = C.applyPreset(C.blankState(), 'stock');
        // OEM quick setup, with a fresh base spark map for the hardware that is actually fitted.
        state.tune = { ...state.tune, ...stock.tune, ecu: undefined, exhaustTdcLiftMm: state.tune.exhaustTdcLiftMm, intakeTdcLiftMm: state.tune.intakeTdcLiftMm, vvtEnabled: state.tune.vvtEnabled };
        saveState(); haptic(12); showToast('OEM-achtige map geladen; mechanische nokmetingen behouden.'); render(); break;
      }
      case 'run-all-bench': runAllBench(); break;
      case 'export-dyno-log': exportLog('dyno'); break;
      case 'export-race-log': exportLog('race'); break;
      case 'ecu-range': case 'ecu-step': case 'ecu-set': case 'ecu-set-apply': case 'ecu-smooth': case 'ecu-interp':
      case 'ecu-copy-gears': case 'ecu-follow-quick': case 'ecu-basemap': case 'ecu-basemap-apply': ecuAction(btn.dataset.action, btn); break;
      case 'apply-assembly-targets': {
        const targets = C.assemblyTargets(state);
        for (const key of ['topRingGapMm','secondRingGapMm','rodClearanceMm','mainClearanceMm','sparkGapMm']) state.assembly[key] = targets[key];
        saveState(); haptic([10,18,10]); showToast('Huidige modeldoelen ingevuld; controleer ze vóór gebruik.'); render(); break;
      }
      case 'burnout-hold': break;
      case 'stage-tree': racePanel = 'tree'; stageTree(false); break;
      case 'launch': launchTree(false); break;
      case 'auto-pass': racePanel = 'tree'; stageTree(true); break;
      case 'reset-race': resetRaceSession(); break;
      case 'toggle-race-audio': {
        state.settings.sound = !state.settings.sound;
        if (state.settings.sound) { startEngineAudio('preview'); updateEngineAudio(raceLivePoint.rpm || 900, .15, 0); }
        else stopEngineAudio({ hard: true });
        saveState(); haptic(8);
        const chip = $('#race-audio-chip');
        if (chip) {
          chip.classList.toggle('on', state.settings.sound); chip.classList.toggle('off', !state.settings.sound);
          const b = $('button', chip); const t = $('span', chip);
          if (b) b.textContent = state.settings.sound ? '🔊' : '🔇';
          if (t) t.textContent = state.settings.sound ? 'EA888 AUDIO' : 'AUDIO UIT';
        }
        showToast(state.settings.sound ? 'Motorgeluid ingeschakeld.' : 'Motorgeluid uitgeschakeld.');
        break;
      }
      case 'oil-change': doOilChange(); break;
      case 'open-rebuild': showModal('Motor inspecteren / reviseren', '<p class="modal-copy">Een volledige revisie wist virtuele motorschade en motorwear, verlaagt slijtage van turbo en bak en kost € 6.500 uit het spelbudget. Daarna zijn benchtests en een nieuwe dynometing verstandig.</p>', '<button class="btn ghost" data-action="close-modal">Annuleren</button><button class="btn danger" data-action="confirm-rebuild">Reviseren</button>'); break;
      case 'confirm-rebuild': doRebuild(); break;
      case 'export-build': showExportModal(); break;
      case 'backup-save': exportFullBackup(); break;
      case 'toggle-challenges': showAllChallenges = !showAllChallenges; render(); break;
      case 'coach-dismiss': onboarding().dismissed = true; saveState(); render(); break;
      case 'value-editor-apply': applyValueEditor(); break;
      case 'limit-revert': { const p = pendingLimit; pendingLimit = null; closeModal(); p?.undo(); break; }
      case 'limit-accept': { const p = pendingLimit; pendingLimit = null; closeModal(); if (p) showToast(p.text, { label: 'Ongedaan', run: p.undo }); break; }
      case 'backup-open': importFullBackup(); break;
      case 'open-import': showImportModal(); break;
      case 'copy-build-code': copyBuildCode(); break;
      case 'confirm-import': confirmImport(); break;
      case 'self-test': {
        const test = C.selfTest();
        const errs = appErrors.length ? `<div class="test-list app-errors"><b>Foutlog (deze sessie)</b>${appErrors.slice().reverse().map(e => `<div class="test-row fail"><span>!</span><div><b>${esc(e.msg)}</b><small>${esc(e.at)}</small></div></div>`).join('')}</div>` : '';
        showModal(test.ok ? 'Zelftest geslaagd' : 'Zelftest heeft een fout', `<div class="test-list">${test.checks.map(x => `<div class="test-row ${x.ok ? 'pass' : 'fail'}"><span>${x.ok ? icon('check') : '!'}</span><div><b>${esc(x.name)}</b><small>${esc(x.value)}</small></div></div>`).join('')}</div>${errs}`);
        break;
      }
      case 'open-reset': showModal('Alle speldata resetten?', '<p class="modal-copy">Dit verwijdert je build, tune, montage, onderhoud, dynohistorie, dragruns, buildslots en challenges uit deze installatie.</p>', '<button class="btn ghost" data-action="close-modal">Annuleren</button><button class="btn danger" data-action="confirm-reset">Alles resetten</button>'); break;
      case 'confirm-reset': doReset(); break;
      case 'close-modal': closeModal(); break;
    }
  });

  document.addEventListener('input', event => {
    const el = event.target;
    if (el.id === 'part-search') {
      partSearch = el.value;
      const cards = $$('.part-card');
      const q = partSearch.trim().toLowerCase();
      cards.forEach(card => { card.hidden = !!(q && !card.textContent.toLowerCase().includes(q)); });
      return;
    }
    if (el.id === 'build-name-input') {
      state.buildName = String(el.value || 'Onbenoemde EA888-build').slice(0,52);
      saveState(); renderHeader(); return;
    }
    if (el.id === 'build-code-input') { importBuffer = el.value; return; }
    if (el.dataset.als) {
      const current = C.resolveAntiLag(state);
      if (state.tune.als.mode !== 'custom') state.tune.als = { ...current.params, mode: 'custom' };
      state.tune.als[el.dataset.als] = Number(el.value);
      const out = $(`[data-value-for="als.${el.dataset.als}"]`);
      if (out) out.textContent = `${Number(el.value).toFixed(Number(el.dataset.decimals || 0))}${el.dataset.unit || ''}`;
      saveState(); clearTimeout(el._rerenderTimer); el._rerenderTimer = setTimeout(render, 260);
      return;
    }
    if (el.dataset.tune) {
      state.tune[el.dataset.tune] = Number(el.value);
      const out = $(`[data-value-for="tune.${el.dataset.tune}"]`);
      if (out) out.textContent = `${Number(el.value).toFixed(Number(el.dataset.decimals || 0))}${el.dataset.unit || ''}`;
      saveState(); renderHeader();
      if (['exhaustTdcLiftMm','intakeTdcLiftMm','revLimitRpm'].includes(el.dataset.tune)) { clearTimeout(el._rerenderTimer); el._rerenderTimer = setTimeout(render, 190); }
      return;
    }
    if (el.dataset.assembly) {
      state.assembly[el.dataset.assembly] = Number(el.value);
      const out = $(`[data-value-for="assembly.${el.dataset.assembly}"]`);
      if (out) out.textContent = `${Number(el.value).toFixed(Number(el.dataset.decimals || 0))}${el.dataset.unit || ''}`;
      saveState(); renderHeader(); clearTimeout(el._rerenderTimer); el._rerenderTimer = setTimeout(render, 190); return;
    }
    if (el.matches?.('[data-career-dial]') && state.career?.active) {
      state.career.active.dialIn = Math.round(Number(el.value) * 100) / 100;
      const out = $('[data-value-for="career.dialIn"]'); if (out) out.textContent = `${state.career.active.dialIn.toFixed(2)} s`;
      saveState();
      return;
    }
    if (el.dataset.mix) {
      state.settings.mix = { engine: 100, turbo: 100, als: 100, tyre: 100, rival: 100, ui: 100, ...(state.settings.mix || {}), [el.dataset.mix]: Number(el.value) };
      const out = $(`[data-value-for="mix.${el.dataset.mix}"]`);
      if (out) out.textContent = `${Math.round(Number(el.value))}%`;
      applyMix(); saveState(); return;
    }
    if (el.dataset.dynoConfig) {
      state.dynoConfig[el.dataset.dynoConfig] = Number(el.value);
      const out = $(`[data-value-for="dyno-config.${el.dataset.dynoConfig}"]`);
      if (out) out.textContent = `${Number(el.value).toFixed(Number(el.dataset.decimals || 0))}${el.dataset.unit || ''}`;
      saveState(); renderHeader(); clearTimeout(el._rerenderTimer); el._rerenderTimer = setTimeout(render, 220); return;
    }
    if (el.dataset.vehicle) {
      state.vehicle[el.dataset.vehicle] = Number(el.value);
      const out = $(`[data-value-for="vehicle.${el.dataset.vehicle}"]`);
      if (out) out.textContent = `${Number(el.value).toFixed(Number(el.dataset.decimals || 0))}${el.dataset.unit || ''}`;
      if (el.dataset.vehicle === 'burnoutLevel') burnoutRuntime = null;
      saveState(); updateWheelReadout(); return;
    }
    if (el.dataset.service) {
      state.service[el.dataset.service] = Number(el.value);
      const out = $(`[data-value-for="service.${el.dataset.service}"]`);
      if (out) out.textContent = `${Number(el.value).toFixed(Number(el.dataset.decimals || 0))}${el.dataset.unit || ''}`;
      saveState(); renderHeader(); return;
    }
  });

  document.addEventListener('change', event => {
    const el = event.target;
    if (el.dataset.vehicleSelect) {
      state.vehicle[el.dataset.vehicleSelect] = el.value;
      burnoutRuntime = null; racePhase = 'burnout';
      saveState(); haptic(8); render();
    }
    if (el.dataset.serviceSelect === 'filter') {
      pendingFilterId = el.value; haptic(8); render();
    }
  });


  document.addEventListener('keydown', event => {
    if (!raceGame?.open || raceGame.phase !== 'run') return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') { raceGamePointer.steerLeft = true; event.preventDefault(); }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') { raceGamePointer.steerRight = true; event.preventDefault(); }
    if ((event.code === 'Space' || event.code === 'ArrowUp') && !event.repeat) { handleV7Shift(); event.preventDefault(); }
    resumePersistentAudio();
  });

  document.addEventListener('keyup', event => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') raceGamePointer.steerLeft = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') raceGamePointer.steerRight = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumePersistentAudio();
    else if (engineAudio) stopEngineAudio();
  });

  // Android back button (MainActivity asks before leaving the app): close the top layer first.
  window.__ea888HandleBack = () => {
    if ($('#modal-root .modal')) { closeModal(); return true; }
    if (raceGame?.replayOpen) { closeReplay(); return true; }
    if (raceGame?.open) { closeDragGame(); render(); return true; }
    if (activeTab !== 'bank') { go('bank'); return true; }
    return false;
  };
  window.__ea888OnNativePause = () => { if (engineAudio) stopEngineAudio(); };

  // Keep the screen on while a pull or a race is running (the phone must not dim mid-run).
  let screenKeptOn = false;
  function syncKeepScreenOn() {
    const on = !!raceGame?.open || !!dynoRunning;
    if (on === screenKeptOn || !NATIVE) return;
    screenKeptOn = on;
    NATIVE.keepScreenOn(on);
  }
  setInterval(syncKeepScreenOn, 1000);
  window.addEventListener('pageshow', resumePersistentAudio);

  window.__EA888_DEBUG__ = {
    rerender: () => { render(); return true; },
    holdFinishForTest: on => { holdFinishForTest = !!on; return holdFinishForTest; },
    setGraphics3dForTest: on => { state.settings.graphics3d = !!on; saveState(); return state.settings.graphics3d; },
    ecu: () => cloneJson({ edited: state.tune.ecu.edited, spark: state.tune.ecu.spark, boost: state.tune.ecu.boost, baseMapFor: state.tune.ecu.baseMapFor }),
    career: () => ({ bank: state.bank, active: state.career?.active ? cloneJson(state.career.active) : null, rep: state.career?.rep || 0, historyCount: state.career?.history?.length || 0, inRound: !!raceGame?.careerRound }),
    replay: () => ({ open: !!raceGame?.replayOpen, active: !!raceGame?.replay3d, progress: raceGame?.replayProgress || 0, done: !!raceGame?.replayDone, frames: raceGame?.run?.replayFrames?.length || 0, lastDistanceM: raceGame?.run?.replayFrames?.at?.(-1)?.d || 0, flames: raceGame?.run?.replayFlames?.length || 0, info: raceGame?.replay3d?.info?.() || null }),
    errors: () => appErrors.slice(),
    // Test-only: make every audio update throw (on) to prove the dyno and races keep running.
    breakAudioForTest: on => { audioBrokenForTest = !!on; return true; },
    setPreRace3dForTest: on => { preRace3DOff = !on; return true; },
    race3d: () => raceGame?.r3d ? { active: true, ...raceGame.r3d.info(), ...(raceGame.r3d.scene?.() || {}) } : { active: false, supported: !!window.EA888Race3D?.supported?.() },
    ghost: () => state.ghost ? { drivetrain: state.ghost.drivetrain, quarter: state.ghost.quarter, samples: state.ghost.trace.length } : null,
    platform: () => ({ loaded: !!PLATFORM, native: !!NATIVE?.available }),
    audio: () => audioDiagnostics(),
    turbo: () => raceGame ? { phase: raceGame.phase, snap: raceGame.run?.turboSnap || raceGame.turboSnap || null, als: raceGame.alsInfo ? { enabled: raceGame.alsInfo.enabled, mode: raceGame.alsInfo.mode } : null, flames: (raceGame.flameLog || []).slice(-30), wear: raceGame.turbo ? cloneJson(raceGame.turbo.state.wear) : null, alsSeconds: raceGame.turbo?.state.alsSeconds || 0 } : null,
    stateWear: () => ({ wear: cloneJson(state.wear), damage: cloneJson(state.damage) }),
    enterStageForTest: () => { if (!raceGame?.open) return false; enterV7Stage(); return true; },
    stageState: () => raceGame?.stage ? { progress: raceGame.stage.progress, staged: raceGame.stage.staged, rpm: raceGame.stage.rpm, treeStarted: raceGame.stage.treeStarted, green: !!raceGame.stage.green, launchArmed: !!raceGame.stage.launchArmed, launched: !!raceGame.stage.launched, launchFromRpm: raceGame.stage.launchFromRpm || 0 } : null,
    raceReaction: () => raceGame?.run ? { reactionTime: raceGame.run.reactionTime, redLight: raceGame.run.redLight, startRpm: raceGame.run.startRpm, launchTargetRpm: Number(state.tune.launchRpm || 4200) } : null,
    setAntiLagForTest: mode => { state.tune.als = { ...state.tune.als, mode }; saveState(); return C.resolveAntiLag(state).enabled; },
    dyno: () => state.lastDyno ? {
      status: state.lastDyno.status, abortRpm: state.lastDyno.abortRpm, abortReason: state.lastDyno.abortReason,
      abortKind: state.lastDyno.abortKind, peakHp: state.lastDyno.peakHp, peakHpRpm: state.lastDyno.peakHpRpm,
      reliabilityScore: state.lastDyno.reliabilityScore, sampleCount: state.lastDyno.samples.length,
      maxSampleRpm: state.lastDyno.samples.reduce((m, p) => Math.max(m, p.rpm), 0), current: currentDyno(),
      wear: cloneJson(state.wear), damage: cloneJson(state.damage)
    } : null,
    // Test-only: load a preset with tune/selection overrides. Invalidates the dyno like any real change.
    configureBuildForTest: ({ preset = null, tune = {}, selections = {} } = {}) => {
      if (dynoRunning) return false;
      if (preset) state = C.applyPreset(state, preset);
      state.tune = { ...state.tune, ...tune };
      state.selections = { ...state.selections, ...selections };
      saveState(); render();
      return C.isDynoCurrent(state);
    },
    race: () => raceGame?.run ? {
      phase: raceGame.phase,
      time: raceGame.run.t,
      distanceM: raceGame.run.x,
      speedKmh: raceGame.run.v * 3.6,
      rpm: raceGame.run.rpm,
      gear: raceGame.run.gearIndex + 1,
      lateralM: raceGame.run.lateralM,
      autoShift: raceGame.run.autoShift,
      transmissionId: raceGame.run.transInfo.id,
      clutchTempC:raceGame.run.clutchTempC,
      gearboxTempC:raceGame.run.gearboxTempC,
      limiterTimeS:raceGame.run.limiterTime,
      drivelineStress:raceGame.run.drivelineStress,
      opponentDistanceM:Number(raceGame.run.opponent?.current?.distanceM || 0),
      opponentGapM:Number(raceGame.run.opponentGapM || 0),
      opponentName:raceGame.run.opponent?.profile?.name || null,
      raceMode:raceGame.run.raceMode,
      finished: raceGame.run.finished
    } : { phase: raceGame?.phase || 'closed' },
    controls: raceGamePointer,
    setTransmissionForTest: id => {
      if (!C.CATEGORY_MAP.transmission.items.some(item => item.id === id)) return false;
      state.selections.transmission = id;
      if (state.lastDyno) state.lastDynoSignature = C.engineSignature(state);
      saveState();
      return true;
    },
    setDriverAssistForTest: value => {
      if (!raceGame?.run) return false;
      raceGame.run.driverAssist = !!value;
      return true;
    },
    setRaceProfileForTest: (mode, rival='street') => {
      state.vehicle.raceMode = mode === 'solo' ? 'solo' : 'heads_up';
      if (RIVALS[rival]) state.vehicle.rivalLevel = rival;
      saveState();
      return {mode:state.vehicle.raceMode,rival:state.vehicle.rivalLevel};
    },
    lastDrag: () => cloneJson(state.lastDrag || null)
  };

  window.addEventListener('resize', () => {
    if (raceGame?.phase === 'stage') positionStageFlames();
    if (activeTab === 'dyno' && !dynoRunning && state.lastDyno) drawDynoChart($('#dyno-chart'), state.lastDyno, 1, !currentDyno(), dynoChannel, compareRun());
    if (activeTab === 'drag' && racePanel === 'telemetry' && state.lastDrag) drawDragTelemetry($('#v12-telemetry-canvas'), state.lastDrag);
  });


  render();
})();
