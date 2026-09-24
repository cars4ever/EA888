// VW Scirocco Mk3 (2008-2017), procedural. The body is lofted from cross-sections along the car so the
// surfaces are smooth: the characteristic wide rear hips, the pronounced shoulder that rolls in to a narrow
// glasshouse (strong tumblehome), the long low roof sloping to a steep rear window, the rising beltline and
// the short rounded tail. Dimensions follow the production car (4256 x 1810 mm, 2578 mm wheelbase), lowered
// like the reference car. Detailing follows the owner's photos: smoked tail lights on the rear corners, VW
// badge between them, the plate recess (plate left blank), black diffuser with red reflectors and oval
// tailpipes, roof spoiler with the third brake light, deep-dish three-piece wheels with red calipers.
// The car faces -Z; y is up; x = 0 is the centre line.
import * as THREE from 'three';

export const DIM = { wheelbase: 2.578, track: 1.57, wheelR: 0.323, noseZ: -2.14, tailZ: 2.11 };
const ZF = -DIM.wheelbase / 2, ZR = DIM.wheelbase / 2, ARCH_R = 0.348; // slammed: the tyres fill the arches

// Monotone cubic interpolation through keys [[z, v], ...] (Fritsch-Carlson): smooth, no overshoot.
function curve(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return z => {
    if (z <= xs[0]) return ys[0];
    if (z >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (z > xs[i + 1]) i++;
    const hh = xs[i + 1] - xs[i], t = (z - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
  };
}

// ---- body shape (metres) --------------------------------------------------------------------------
const wMaxK = curve([[-2.14, 0.8], [-2.0, 0.852], [-1.7, 0.882], [-1.29, 0.892], [-0.8, 0.882], [0.1, 0.878], [0.8, 0.888], [1.29, 0.906], [1.7, 0.9], [1.98, 0.878], [2.11, 0.845]]);
const yShoulder = curve([[-2.14, 0.5], [-1.3, 0.6], [0, 0.64], [1.0, 0.72], [1.4, 0.76], [2.11, 0.78]]);
const yBelt = curve([[-2.14, 0.64], [-2.02, 0.71], [-1.5, 0.8], [-0.84, 0.922], [0.2, 0.955], [0.9, 0.985], [1.3, 1.02], [1.62, 1.015], [1.96, 0.99], [2.06, 0.978], [2.11, 0.955]]);
const beltFrac = curve([[-2.14, 0.72], [-1.6, 0.86], [-0.8, 0.885], [0.6, 0.895], [1.3, 0.855], [1.8, 0.83], [2.11, 0.8]]);
const yBottom = curve([[-2.14, 0.3], [-2.07, 0.19], [-1.9, 0.165], [-1.6, 0.19], [1.6, 0.2], [1.9, 0.235], [2.05, 0.265], [2.11, 0.33]]);
const endFactor = z => z < -1.9 ? 1 - 0.16 * ((-1.9 - z) / 0.24) ** 2 : z > 1.95 ? 1 - 0.1 * ((z - 1.95) / 0.16) ** 2 : 1;
function archY(z) {
  for (const zw of [ZF, ZR]) {
    const dz = z - zw;
    if (Math.abs(dz) < ARCH_R) return DIM.wheelR + Math.sqrt(ARCH_R * ARCH_R - dz * dz);
  }
  return 0;
}
// Arch lips flare a little over the wheels.
const flare = z => 0.012 * (Math.exp(-(((z - ZF) / 0.32) ** 2)) + Math.exp(-(((z - ZR) / 0.34) ** 2)));
function bodySection(z) {
  const f = endFactor(z), wMax = (wMaxK(z) + flare(z)) * f, yb = yBottom(z), belt = yBelt(z);
  return { wMax, yb, belt, wBelt: wMax * beltFrac(z), ys: Math.max(yb, archY(z)), yS: yShoulder(z), wIn: Math.min(0.55, wMax - 0.08) };
}
// Right half of a section, bottom centre to top centre. Segment kinds: 'under' (underbody, wheel well),
// 'side', 'top'. The same number of points at every station so sections can be lofted.
const NS = 12, NR = 5, NT = 6;
function bodyRing(z) {
  const s = bodySection(z), pts = [], kinds = [];
  const push = (x, y, k) => { pts.push([x, y]); kinds.push(k); };
  push(0, s.yb, 'under'); push(s.wIn, s.yb, 'under'); push(s.wIn, s.ys, 'under'); push(s.wMax - 0.045, s.ys, 'side');
  const yS = Math.min(Math.max(s.yS, s.ys + 0.03), s.belt - 0.08), r = 0.05;
  for (let i = 1; i <= NS; i++) {
    const y = s.ys + ((s.belt - r - s.ys) * i) / NS;
    const x = y < yS ? s.wMax - 0.045 * (1 - (y - s.ys) / Math.max(1e-3, yS - s.ys)) ** 2 : s.wMax - (s.wMax - s.wBelt - r) * ((y - yS) / Math.max(1e-3, s.belt - r - yS)) ** 1.25;
    push(x, y, 'side');
  }
  // rounded edge (fender top / shoulder) then the slightly crowned top to the centre line
  const cx = s.wBelt, cy = s.belt - r;
  for (let i = 1; i <= NR; i++) { const a = (i / NR) * Math.PI / 2; push(cx + r * Math.cos(a) - r * 0 , cy + r * Math.sin(a), 'top'); }
  for (let i = 1; i <= NT; i++) { const u = i / NT, x = cx * (1 - u); push(x, s.belt + 0.012 * (1 - (x / Math.max(cx, 1e-3)) ** 2), 'top'); }
  return { pts, kinds };
}

// ---- glasshouse -----------------------------------------------------------------------------------
const ZA = -0.84, ZWT = -0.02, ZRT = 1.22, ZC = 1.96;
const yRoof = curve([[ZA, 0.925], [-0.45, 1.11], [ZWT, 1.3], [0.4, 1.338], [0.9, 1.322], [ZRT, 1.285], [1.6, 1.15], [ZC, 1.0]]);
const roofHalf = curve([[ZA, 0.72], [-0.3, 0.655], [ZWT, 0.6], [0.7, 0.595], [ZRT, 0.58], [1.6, 0.6], [ZC, 0.64]]);
const NG = 6, NGC = 3, NGT = 7;
function glassRing(z) {
  const belt = yBelt(z) - 0.004, w0 = bodySection(z).wBelt - 0.02, top = yRoof(z);
  const wr = Math.min(roofHalf(z), w0 - 0.01), crown = 0.065, yEdge = Math.max(belt + 0.002, top - crown), pts = [], kinds = [];
  for (let i = 0; i <= NG; i++) { const u = i / NG; pts.push([w0 + (wr - w0) * u, belt + (yEdge - belt) * u]); kinds.push('gside'); }
  for (let i = 1; i <= NGC; i++) { const u = i / (NGC + 1), x = wr * (1 - 0.08 * u); pts.push([x, yEdge + (top - yEdge) * (1 - (x / wr) ** 2)]); kinds.push('gcorner'); }
  for (let i = 1; i <= NGT; i++) { const x = wr * 0.92 * (1 - i / NGT); pts.push([x, yEdge + (top - yEdge) * (1 - (x / wr) ** 2)]); kinds.push('gtop'); }
  return { pts, kinds };
}

// ---- lofting ----------------------------------------------------------------------------------------
// Builds a mesh from rings at the stations; faces get a material key from pick(kindOfSegment, zMid, side).
// Closed (mirrored) ring or open half-ring; optional caps at both ends fanned to a bulged centre.
function loft(stations, ringFn, pick, { closed = true, caps = null, offset = 0 } = {}) {
  const pos = [], groups = new Map(), rings = [];
  for (const z of stations) {
    const { pts, kinds } = ringFn(z);
    const full = closed ? [...pts.map((p, i) => [p[0], p[1], kinds[i], 1]), ...pts.slice(1, -1).reverse().map((p, i, arr) => [-p[0], p[1], kinds[pts.length - 2 - i], -1])] : pts.map((p, i) => [p[0], p[1], kinds[i], 1]);
    rings.push({ z, base: pos.length / 3, full });
    for (const [x, y] of full) pos.push(x * (1 + offset), y, z);
  }
  const add = (key, a, b, c) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(a, b, c); };
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1], n = A.full.length, zm = (A.z + B.z) / 2;
    for (let k = 0; k < (closed ? n : n - 1); k++) {
      const k2 = (k + 1) % n, kind = A.full[k2][3] > 0 ? A.full[k2][2] : A.full[k][2];
      const key = pick(kind, zm, (A.full[k][1] + A.full[k2][1]) / 2);
      if (!key) continue;
      add(key, A.base + k, B.base + k2, B.base + k);
      add(key, A.base + k, A.base + k2, B.base + k2);
    }
  }
  if (caps) for (const [which, bulge, keyFn] of caps) {
    const R = which === 'start' ? rings[0] : rings[rings.length - 1], n = R.full.length;
    const cy = R.full.reduce((a, p) => a + p[1], 0) / n, base = pos.length / 3;
    for (const [x, y] of R.full) pos.push(x, y, R.z);
    pos.push(0, cy, R.z + bulge);
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, ym = (R.full[k][1] + R.full[k2][1] + cy) / 3;
      const key = keyFn(ym);
      if (which === 'start') add(key, base + n, base + k2, base + k); else add(key, base + n, base + k, base + k2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const idx = [], keys = [];
  for (const [key, list] of groups) { geo.addGroup(idx.length, list.length, keys.length); keys.push(key); idx.push(...list); }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, keys, rings };
}
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
function stationsBody() {
  const zs = new Set([...range(DIM.noseZ, -1.9, 6), ...range(-1.9, 1.9, 60), ...range(1.9, DIM.tailZ, 6)]);
  for (const zw of [ZF, ZR]) for (const t of range(-1, 1, 14)) zs.add(zw + t * ARCH_R * 0.999);
  return [...zs].map(z => Math.round(z * 1e4) / 1e4).sort((a, b) => a - b);
}

// Point on the rear/front cap for (x, y): the cap is a shallow cone to its bulged centre.
function capSurfaceZ(ring, bulge, x, y) {
  const n = ring.full.length, cy = ring.full.reduce((a, p) => a + p[1], 0) / n;
  const dx = x, dy = y - cy, ang = Math.atan2(dy, dx);
  let R = 1;
  for (let k = 0; k < n; k++) {
    const p = ring.full[k], q = ring.full[(k + 1) % n];
    const a1 = Math.atan2(p[1] - cy, p[0]), a2 = Math.atan2(q[1] - cy, q[0]);
    let da = a2 - a1; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    let t = ang - a1; if (t > Math.PI) t -= 2 * Math.PI; if (t < -Math.PI) t += 2 * Math.PI;
    if (da !== 0 && t / da >= 0 && t / da <= 1) { const s = t / da; R = Math.hypot(p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s - cy); break; }
  }
  const s = Math.min(1, Math.hypot(dx, dy) / Math.max(1e-6, R));
  return ring.z + bulge * (1 - s);
}
// A flat shape (THREE.Shape in x/y) laid onto a cap, lifted `lift` off the surface.
function onCap(shape, ring, bulge, lift, mat, segments = 8) {
  const g = new THREE.ShapeGeometry(shape, segments), p = g.attributes.position, dir = Math.sign(bulge);
  for (let i = 0; i < p.count; i++) p.setZ(i, capSurfaceZ(ring, bulge, p.getX(i), p.getY(i)) + dir * lift);
  if (dir < 0) g.scale(1, 1, 1), g.index && g.setIndex([...g.index.array].reverse());
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
const roundedRect = (x0, y0, x1, y1, r) => {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
};

// ---- wheels: three-piece deep dish, polished lip, five spokes, red caliper ------------------------------
function buildWheel(m, side, ghost) {
  const w = new THREE.Group(), R = DIM.wheelR, width = 0.235;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.052, 0.058, 14, 40), m.tyre);
  tyre.rotation.y = Math.PI / 2; tyre.scale.set(1, 1, width / 0.116 * 0.92);
  w.add(tyre);
  const tread = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.004, R - 0.004, width * 0.86, 40, 1, true), m.tyre);
  tread.rotation.z = Math.PI / 2; w.add(tread);
  if (ghost) return w;
  const face = side * (width / 2 - 0.01);
  // polished outer lip and the deep dish stepping in to the spokes
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.228, 0.018, 10, 40), m.chrome);
  lip.rotation.y = Math.PI / 2; lip.position.x = face; w.add(lip);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.228, 0.19, 0.075, 40, 1, true), m.chrome);
  dish.rotation.z = -side * Math.PI / 2; dish.position.x = face - side * 0.037; w.add(dish);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, width * 0.8, 32, 1, true), m.barrel);
  barrel.rotation.z = Math.PI / 2; w.add(barrel);
  const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.012, 32), m.rimCentre);
  centre.rotation.z = Math.PI / 2; centre.position.x = face - side * 0.08; w.add(centre);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, spoke = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.15, 0.058), m.rimCentre);
    spoke.position.set(face - side * 0.07, Math.cos(a) * 0.105, Math.sin(a) * 0.105);
    spoke.rotation.x = -a; w.add(spoke);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 20), m.chrome);
  cap.rotation.z = Math.PI / 2; cap.position.x = face - side * 0.06; w.add(cap);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.6, nut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6), m.chrome);
    nut.rotation.z = Math.PI / 2; nut.position.set(face - side * 0.07, Math.cos(a) * 0.065, Math.sin(a) * 0.065); w.add(nut);
  }
  return w;
}

// ---- the car -----------------------------------------------------------------------------------------
export function buildScirocco({ color = 0x1f4fd8, envMap, ghost = false, plateTexture = null }) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const G = ghost ? new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: .22, depthWrite: false }) : null;
  const M = ghost ? new Proxy({}, { get: () => G }) : {
    paint: new THREE.MeshPhysicalMaterial({ color, metalness: .45, roughness: .28, clearcoat: 1, clearcoatRoughness: .04, envMap, envMapIntensity: 1.6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: .6, metalness: .15, envMap, envMapIntensity: .35 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: .12, metalness: .2, clearcoat: 1, envMap, envMapIntensity: .9 }),
    well: new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x03050a, metalness: .2, roughness: .04, clearcoat: 1, envMap, envMapIntensity: 1.25 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: .85, roughness: .16, envMap, envMapIntensity: 2.2 }),
    // smoked lenses: dark, lit from inside by the bar and (when braking) the whole lamp
    tail: new THREE.MeshPhysicalMaterial({ color: 0x160203, emissive: 0x8a0008, emissiveIntensity: .7, roughness: .1, clearcoat: 1, envMap, envMapIntensity: 1.1 }),
    tailBar: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, .15, .12) }),
    reflector: new THREE.MeshStandardMaterial({ color: 0x5a0508, emissive: 0x8a0006, emissiveIntensity: .8, roughness: .3 }),
    head: new THREE.MeshStandardMaterial({ color: 0x1a1d22, emissive: 0xdde8ff, emissiveIntensity: 1.4, roughness: .2 }),
    headHousing: new THREE.MeshPhysicalMaterial({ color: 0x14171c, metalness: .6, roughness: .2, clearcoat: 1, envMap }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: .9 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: .8, roughness: .35, envMap }),
    // oil-slick / neo-chrome centres like the reference wheels
    rimCentre: new THREE.MeshPhysicalMaterial({ color: 0x8c7cf0, metalness: .85, roughness: .22, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 900], envMap, envMapIntensity: 2.4 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xc8141c, roughness: .35, metalness: .2 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTexture, roughness: .5, color: plateTexture ? 0xffffff : 0xf2c21a })
  };

  // Lower body
  // black side skirts along the sills between the arches
  const bodyKey = (kind, z, y) => (kind === 'under' ? 'well' : y < bodySection(z).yb + 0.075 && z > ZF + ARCH_R && z < ZR - ARCH_R ? 'black' : 'paint');
  const bodyStations = stationsBody();
  const tailBulge = 0.05, noseBulge = -0.045;
  const capKeyRear = () => 'paint', capKeyFront = () => 'paint';
  const lower = loft(bodyStations, bodyRing, bodyKey, { caps: [['start', noseBulge, capKeyFront], ['end', tailBulge, capKeyRear]] });
  body.add(new THREE.Mesh(lower.geo, lower.keys.map(k => M[k])));
  const noseRing = lower.rings[0], tailRing = lower.rings[lower.rings.length - 1];

  // Glasshouse: glass with the body-coloured roof, A- and C-pillars
  const gKey = (kind, z) => {
    // side glass ends over the rear axle: the thick C-pillar and the body-coloured rear quarter
    if (kind === 'gside') return z > 1.2 || z < -0.78 ? 'paint' : 'glass';
    if (kind === 'gcorner') return z > ZWT - 0.02 ? 'paint' : z < -0.74 ? 'paint' : 'paint';
    if (z < ZWT) return 'glass';
    if (z <= ZRT) return 'paint';
    return 'glass';
  };
  const gh = loft(range(ZA, ZC, 48), glassRing, gKey);
  body.add(new THREE.Mesh(gh.geo, gh.keys.map(k => M[k])));
  // Black window surround: a thin strip just above the beltline along the side glass.
  const trimRing = z => { const g = glassRing(z); return { pts: [g.pts[0], [g.pts[0][0] - 0.006, g.pts[0][1] + 0.022]].map(p => [p[0] + 0.004, p[1]]), kinds: ['t', 't'] }; };
  const trim = loft(range(-0.78, 1.2, 30), trimRing, () => 'gloss', { closed: false });
  for (const sx of [1, -1]) { const m = new THREE.Mesh(trim.geo, M.gloss); m.scale.x = sx; body.add(m); }

  // Roof spoiler with the third brake light
  if (!ghost || true) {
    const sp = new THREE.Shape();
    // roof-edge spoiler: a short lip over the top of the rear window, following the roof's plan width
    sp.moveTo(0, 0.012); sp.lineTo(0.17, -0.025); sp.lineTo(0.17, -0.045); sp.lineTo(0.0, -0.02);
    const spW = roofHalf(ZRT) * 2 + 0.02;
    const spG = new THREE.ExtrudeGeometry(sp, { depth: spW, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 2 });
    spG.rotateY(-Math.PI / 2); spG.translate(spW / 2, 0, 0);
    const spoiler = new THREE.Mesh(spG, M.paint);
    spoiler.position.set(0, yRoof(ZRT) - 0.004, ZRT - 0.06);
    body.add(spoiler);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.012), M.tailBar);
    brake.position.set(0, yRoof(ZRT) - 0.045, ZRT + 0.115); body.add(brake);
  }

  // Tail lights: smoked, wrapping around the rear corners, with a lit bar inside.
  const tailPieces = [];
  if (!ghost) {
    const yl0 = 0.8, yl1 = 0.945;
    for (const sx of [1, -1]) {
      // part on the rear face
      const s = new THREE.Shape();
      const edgeX = y => Math.max(...tailRing.full.filter(p => Math.abs(p[1] - y) < 0.04 && p[0] > 0).map(p => p[0]), 0.7);
      const e0 = edgeX(yl0) - 0.01, e1 = edgeX(yl1) - 0.02;
      // a lens that is taller at the corner and tapers towards the badge (as on the facelift car)
      s.moveTo(0.44, yl0 + 0.06); s.quadraticCurveTo(0.45, yl0 + 0.012, 0.52, yl0 + 0.008); s.lineTo(e0, yl0); s.lineTo(e1, yl1 - 0.004);
      s.lineTo(0.56, yl1 - 0.008); s.quadraticCurveTo(0.44, yl1 - 0.02, 0.44, yl0 + 0.06);
      const face = onCap(s, tailRing, tailBulge, 0.004, M.tail, 12);
      face.scale.x = sx; body.add(face); tailPieces.push(face);
      const barS = new THREE.Shape(); barS.moveTo(0.5, yl0 + 0.05); barS.lineTo(e0 - 0.03, yl0 + 0.056); barS.lineTo(e0 - 0.03, yl0 + 0.072); barS.lineTo(0.5, yl0 + 0.066);
      const bar = onCap(barS, tailRing, tailBulge, 0.007, M.tailBar, 2); bar.scale.x = sx; body.add(bar);
      // wrap onto the side of the tail
      const wrapRing = z => { const r = bodyRing(z); const sel = r.pts.map((p, i) => [p, r.kinds[i]]).filter(([p]) => p[1] >= yl0 && p[1] <= yl1 + 0.02); return { pts: sel.map(q => q[0]), kinds: sel.map(() => 's') }; };
      const nPts = wrapRing(2.0).pts.length;
      if (nPts >= 2) {
        const wrap = loft(range(1.93, DIM.tailZ, 6).filter(z => wrapRing(z).pts.length === nPts), wrapRing, () => 'tail', { closed: false, offset: 0.004 });
        const wm = new THREE.Mesh(wrap.geo, M.tail); wm.scale.x = sx; body.add(wm); tailPieces.push(wm);
      }
    }
    // VW badge and the plate recess with a blank plate
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), M.chrome);
    badge.position.set(0, 0.875, capSurfaceZ(tailRing, tailBulge, 0, 0.875) + 0.012); body.add(badge);
    const recess = onCap(roundedRect(-0.34, 0.49, 0.34, 0.655, 0.03), tailRing, tailBulge, 0.002, M.paint, 6);
    body.add(recess);
    const plate = onCap(roundedRect(-0.26, 0.515, 0.26, 0.625, 0.008), tailRing, tailBulge, 0.006, M.plate, 2);
    // UVs for the plate texture
    const pp = plate.geometry.attributes.position, uv = [];
    for (let i = 0; i < pp.count; i++) uv.push((pp.getX(i) + 0.26) / 0.52, (pp.getY(i) - 0.515) / 0.11);
    plate.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    body.add(plate);
    // black diffuser across the bottom of the bumper, fins and red reflectors
    const edgeLow = Math.max(...tailRing.full.filter(p => p[1] < 0.42 && p[0] > 0).map(p => p[0])) - 0.03;
    const dif = new THREE.Shape();
    dif.moveTo(-edgeLow, tailRing.full[0][1] + 0.005); dif.lineTo(edgeLow, tailRing.full[0][1] + 0.005); dif.lineTo(edgeLow - 0.04, 0.4); dif.lineTo(-edgeLow + 0.04, 0.4);
    body.add(onCap(dif, tailRing, tailBulge, 0.003, M.black, 4));
    for (const x of [-0.3, -0.1, 0.1, 0.3]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.12), M.black);
      fin.position.set(x, 0.31, capSurfaceZ(tailRing, tailBulge, x, 0.31) - 0.03); body.add(fin);
    }
    for (const sx of [1, -1]) {
      const r = onCap(roundedRect(0.34, 0.425, 0.6, 0.455, 0.01), tailRing, tailBulge, 0.005, M.reflector, 2);
      r.scale.x = sx; body.add(r);
    }
  }
  // Oval tailpipes (the flame anchors sit at their mouths)
  const tips = [];
  for (const sx of [1, -1]) {
    const x = sx * 0.6, y = 0.33, z = capSurfaceZ(tailRing, tailBulge, Math.abs(x), y);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.14, 24, 1, true), M.chrome);
    tip.rotation.x = Math.PI / 2; tip.scale.set(1.45, 1, 1); tip.position.set(x, y, z + 0.02); body.add(tip);
    if (!ghost) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.047, 24), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      hole.scale.set(1.45, 1, 1); hole.position.set(x, y, z + 0.07); body.add(hole);
    }
    const anchor = new THREE.Object3D(); anchor.position.set(x, y, z + 0.11); body.add(anchor); tips.push(anchor);
  }

  // Front: slim headlights running into the black grille bar, the big lower intake and fog lamp pods.
  if (!ghost) {
    for (const sx of [1, -1]) {
      const h = new THREE.Shape();
      const ne = y => Math.max(...noseRing.full.filter(p => Math.abs(p[1] - y) < 0.04 && p[0] > 0).map(p => p[0]), 0.6) - 0.025;
      const n0 = ne(0.58), n1 = ne(0.66);
      h.moveTo(0.28, 0.6); h.lineTo(n0 - 0.06, 0.578); h.quadraticCurveTo(n0, 0.58, n1, 0.63); h.lineTo(n1 - 0.06, 0.664); h.lineTo(0.28, 0.65);
      const hm = onCap(h, noseRing, noseBulge, 0.004, M.headHousing, 10); hm.scale.x = sx; body.add(hm);
      const lamp = onCap(roundedRect(0.46, 0.6, Math.min(0.66, n0 - 0.05), 0.635, 0.015), noseRing, noseBulge, 0.008, M.head, 4); lamp.scale.x = sx; body.add(lamp);
      const fog = onCap(roundedRect(0.52, 0.27, 0.7, 0.35, 0.03), noseRing, noseBulge, 0.004, M.gloss, 4); fog.scale.x = sx; body.add(fog);
    }
    body.add(onCap(roundedRect(-0.3, 0.6, 0.3, 0.645, 0.01), noseRing, noseBulge, 0.004, M.gloss, 4));
    body.add(onCap(roundedRect(-0.4, 0.21, 0.4, 0.4, 0.05), noseRing, noseBulge, 0.004, M.gloss, 6));
    const vw = new THREE.Mesh(new THREE.CircleGeometry(0.05, 28), M.chrome);
    vw.position.set(0, 0.622, capSurfaceZ(noseRing, noseBulge, 0, 0.622) - 0.008); vw.rotation.y = Math.PI; body.add(vw);
  }
  // Mirrors: body-coloured caps on black bases; black side skirts.
  for (const sx of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), M.paint);
    cap.scale.set(1.05, 0.6, 0.7); cap.position.set(sx * 0.96, 1.02, -0.58); body.add(cap);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), M.black);
    base.position.set(sx * 0.87, 0.99, -0.6); body.add(base);
  }

  // Wheels with calipers (the wheel groups spin; the calipers stay with the body)
  const wheels = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = buildWheel(M, sx, ghost);
    w.position.set(sx * DIM.track / 2, DIM.wheelR, sz * DIM.wheelbase / 2);
    root.add(w); wheels.push(w);
    if (!ghost) {
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), M.caliper);
      cal.position.set(sx * (DIM.track / 2 - 0.04), DIM.wheelR + 0.1, sz * DIM.wheelbase / 2 + 0.08); root.add(cal);
    }
  }
  if (ghost) root.traverse(o => { if (o.isMesh) o.renderOrder = 5; });
  return { root, body, wheels, tips, tailMat: M.tail, tailPieces };
}
