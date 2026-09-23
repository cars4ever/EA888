// EA888 LAB race renderer (WebGL, three.js). Bundled by tools/build_web.py into build/web/race3d.js.
// Draws only what the simulation computes: positions, speed, wheelspin, flames and the rival come from the
// realtime physics in app.js every frame. World units are metres; the car drives towards -Z.
import * as THREE from 'three';

const LANE = 4.3;               // lane width: car half width 0.91 m + 1.22 m of allowed drift to the line
const FINISH = 402.336;         // quarter mile
const MARKS = [[18.288, '60 FT'], [100.584, '330 FT'], [201.168, '1/8 MIJL'], [304.8, '1000 FT'], [FINISH, 'FINISH']];
const WHEEL_R = 0.323;          // 235/40 R18
const WHEELBASE = 2.58, TRACK_W = 1.57, CAR_W = 1.81;
const BEVEL = 0.07;             // body edge rounding; the extrusion grows the outline by this much
const REAR = 2.14 + BEVEL;      // rear face of the body (z), where lights, plate, diffuser and tips sit
// Staging: the stage beam sits where the front tyre's leading edge is when the car root is at z = 0 (the
// run starts there); the pre-stage beam is 7 in (178 mm) behind it. Burnout box behind the water box.
const STAGE_Z = -(WHEELBASE / 2 + WHEEL_R), PRESTAGE_M = 0.178;
const BURNOUT_Z = 13.5, WATER_Z = 19;
const TREE_ROWS = [['pre', 2.4], ['stage', 2.25], ['a1', 2.05], ['a2', 1.9], ['a3', 1.75], ['g', 1.55], ['r', 1.4]];
const BULB_ON = { pre: [3.2, 2.9, 2.2], stage: [3.2, 2.9, 2.2], a1: [4, 1.9, .25], a2: [4, 1.9, .25], a3: [4, 1.9, .25], g: [.5, 4, .9], r: [4, .35, .3] };
const BULB_OFF = { pre: 0x2a2a22, stage: 0x2a2a22, a1: 0x2e2210, a2: 0x2e2210, a3: 0x2e2210, g: 0x0f2a14, r: 0x2e1010 };

// ---------------------------------------------------------------- helpers
function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
}
function noise(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - .5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n; d[i + 3] = alpha ?? d[i + 3];
  }
  ctx.putImageData(img, 0, 0);
}
function softDot(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(size, size, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, inner); r.addColorStop(1, outer);
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

// ---------------------------------------------------------------- textures
function stripTexture() {
  // Both lanes across the texture width (12.9 m), 20 m of length per repeat. Rubber laid down by the tyres
  // sits where the tyres run: 0.785 m either side of each lane centre.
  const W = 1024, H = 1024, span = LANE * 3; // from x = -LANE to x = 2 * LANE
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#34373c'; g.fillRect(0, 0, W, H);
    noise(g, W, H, 26);
    const px = x => (x + LANE) / span * W;
    for (const lane of [0, LANE]) {
      for (const side of [-1, 1]) {
        const cx = px(lane + side * TRACK_W / 2), bw = 0.42 / span * W;
        const grad = g.createLinearGradient(cx - bw, 0, cx + bw, 0);
        grad.addColorStop(0, 'rgba(10,10,12,0)'); grad.addColorStop(.5, 'rgba(10,10,12,.78)'); grad.addColorStop(1, 'rgba(10,10,12,0)');
        g.fillStyle = grad; g.fillRect(cx - bw, 0, bw * 2, H);
      }
    }
    // Lane lines: outer edges and the centre line between the lanes.
    g.fillStyle = 'rgba(236,240,245,.92)';
    for (const x of [-LANE / 2, LANE / 2, LANE * 1.5]) g.fillRect(px(x) - 5, 0, 10, H);
    // Outside the lanes: darker shoulders.
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, 0, px(-LANE / 2) - 5, H); g.fillRect(px(LANE * 1.5) + 5, 0, W, H);
  }, { repeat: [1, 1] });
}
function launchPadTexture() {
  // Concrete launch pad: lighter, with heavy rubber and traction compound in the tyre tracks.
  const W = 1024, H = 512, span = LANE * 3;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#505254'; g.fillRect(0, 0, W, H);
    noise(g, W, H, 30);
    const px = x => (x + LANE) / span * W;
    for (const lane of [0, LANE]) for (const side of [-1, 1]) {
      const cx = px(lane + side * TRACK_W / 2), bw = 0.5 / span * W;
      const grad = g.createLinearGradient(cx - bw, 0, cx + bw, 0);
      grad.addColorStop(0, 'rgba(8,8,9,0)'); grad.addColorStop(.5, 'rgba(8,8,9,.95)'); grad.addColorStop(1, 'rgba(8,8,9,0)');
      g.fillStyle = grad; g.fillRect(cx - bw, 0, bw * 2, H);
    }
    g.fillStyle = 'rgba(236,240,245,.95)';
    for (const x of [-LANE / 2, LANE / 2, LANE * 1.5]) g.fillRect(px(x) - 5, 0, 10, H);
    // Expansion joints between the concrete slabs.
    g.fillStyle = 'rgba(20,20,22,.6)';
    for (let y = 0; y < H; y += H / 4) g.fillRect(0, y, W, 3);
  }, { repeat: [1, 1] });
}
function wallTexture() {
  return canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#b9bcc0'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 18);
    g.fillStyle = '#1b2230'; g.fillRect(0, h * .62, w, h * .38);
    g.fillStyle = '#ffad17'; g.fillRect(0, h * .56, w, h * .06);
    // Painted blocks every 4 m give the eye something to track at speed.
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#e8eaed' : '#9ea3aa';
      g.fillRect(i * w / 8, 0, w / 8 - 6, h * .52);
    }
    g.fillStyle = '#ffad17'; g.font = '700 40px sans-serif'; g.textBaseline = 'middle';
    g.fillText('EA888 LAB', 30, h * .82); g.fillText('EA888 LAB', w / 2 + 30, h * .82);
  }, { repeat: [1, 1] });
}
function boardTexture(label) {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = label === 'FINISH' ? '#f08a10' : '#0b1017'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffb938'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#f8fbff'; g.font = '800 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, w / 2, h / 2 + 4);
  });
}
function plateTexture(text) {
  return canvasTex(520, 114, (g, w, h) => {
    g.fillStyle = '#f5c518'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c3fa8'; g.fillRect(0, 0, 58, h);
    g.fillStyle = '#fff'; g.font = '700 26px sans-serif'; g.textAlign = 'center'; g.fillText('NL', 29, h - 16);
    g.fillStyle = '#111'; g.font = '800 84px sans-serif'; g.textBaseline = 'middle';
    g.fillText(text, (w + 58) / 2, h / 2 + 4);
    g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
}
function crowdTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0d1118'; g.fillRect(0, 0, w, h);
    const cols = ['#c83c3c', '#e6e6e6', '#3d6fd6', '#f0a81d', '#222', '#6b7a8f'];
    for (let r = 0; r < 10; r++) for (let i = 0; i < 64; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = .55 + Math.random() * .45;
      g.beginPath(); g.arc(i * 8 + (r % 2) * 4 + 4, r * 25 + 10, 3.2, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }, { repeat: [6, 1] });
}

// ---------------------------------------------------------------- environment (reflections)
function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: canvasTex(8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#05080f'); gr.addColorStop(.45, '#1a2436'); gr.addColorStop(.52, '#3a3326'); gr.addColorStop(1, '#050505');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }) }));
  env.add(sky);
  // Rows of floodlights around the strip: the bright streaks that run over the paint.
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7, 5.5) });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.2), lamp);
    m.position.set(Math.cos(a) * 40, 15, Math.sin(a) * 40);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  env.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
  return tex;
}

// ---------------------------------------------------------------- car (Scirocco Mk3, procedural)
function extrudeProfile(points, width, bevel) {
  // points: [s (forward, +front), y] clockwise; extruded across the width, centred on x = 0.
  const shape = new THREE.Shape();
  points.forEach(([s, y], i) => (i ? shape.lineTo(s, y) : shape.moveTo(s, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 16, steps: 10 });
  geo.rotateY(Math.PI / 2);              // shape x (forward) -> world -z, extrusion -> world x
  geo.translate(-(width - bevel * 2) / 2, 0, 0);
  return geo;
}
function taper(geo, yFrom, yTo, amount) {
  // Tumblehome: the glasshouse narrows towards the roof.
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.min(1, Math.max(0, (y - yFrom) / (yTo - yFrom)));
    p.setX(i, p.getX(i) * (1 - amount * t));
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Body sculpting on the extruded block: the rear face bulges out in the middle (crown), the corners round off in
// plan view, the sides tuck under at the sill and roll in above the shoulder, and the hips swell over the rear
// wheels. Everything that sits on the rear face uses rearCrown() so it stays on the surface.
const rearCrown = x => 0.075 * Math.max(0, 1 - (x / 0.905) ** 2);
function sculptBody(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(x) / (CAR_W / 2);
    // Crown on the rear (z > 1.7) and front (z < -1.8) faces.
    if (z > 1.7) z += rearCrown(x) * Math.min(1, (z - 1.7) / 0.45);
    if (z < -1.8) z -= 0.05 * Math.max(0, 1 - ax * ax) * Math.min(1, (-1.8 - z) / 0.4);
    // Plan-view rounding of the four corners.
    const endZ = Math.max(0, Math.abs(z) - 1.75) / 0.5;
    let k = 1 - 0.07 * endZ * endZ;
    // Tuck-under at the sill, roll-in above the shoulder line.
    if (y < 0.42) k *= 1 - 0.06 * (0.42 - y) / 0.25;
    if (y > 0.86) k *= 1 - 0.09 * Math.min(1, (y - 0.86) / 0.2);
    // Hips over the rear wheels (the Scirocco's wide rear shoulders).
    const hip = Math.exp(-(((z - 1.25) / 0.55) ** 2)) * Math.exp(-(((y - 0.72) / 0.2) ** 2));
    k *= 1 + 0.035 * hip;
    p.setXYZ(i, x * k, y, z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildCar({ color = 0x1f4fd8, plate = 'KK-895-H', envMap, ghost = false }) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = ghost
    ? new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: .22, depthWrite: false })
    : new THREE.MeshPhysicalMaterial({ color, metalness: .35, roughness: .32, clearcoat: 1, clearcoatRoughness: .05, envMap, envMapIntensity: 1.7 });
  const black = ghost ? paint : new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: .55, metalness: .2, envMap, envMapIntensity: .4 });
  const glass = ghost ? paint : new THREE.MeshPhysicalMaterial({ color: 0x05070b, metalness: .1, roughness: .05, envMap, envMapIntensity: 1.3, clearcoat: 1 });
  const chrome = ghost ? paint : new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 1, roughness: .18, envMap, envMapIntensity: 1.2 });
  const tail = ghost ? paint : new THREE.MeshStandardMaterial({ color: 0x2a0000, emissive: 0xe0000c, emissiveIntensity: 1.25, roughness: .3 });

  // Lower body: long hood, wide rear shoulders, steep hatch, wheel arches cut from the side profile.
  const lower = [
    [2.14, 0.40], [2.10, 0.60], [1.55, 0.77], [0.58, 0.96], [-0.60, 0.98], [-1.60, 1.00], [-2.02, 1.03], [-2.11, 0.96],
    [-2.14, 0.56], [-2.10, 0.24], [-1.70, 0.22], [-1.66, 0.36], [-1.58, 0.52], [-1.42, 0.63], [-1.29, 0.66], [-1.16, 0.63], [-1.00, 0.52], [-0.92, 0.36],
    [-0.90, 0.22], [0.90, 0.22], [0.92, 0.36], [1.00, 0.52], [1.16, 0.63], [1.29, 0.66], [1.42, 0.63], [1.58, 0.52], [1.66, 0.36], [1.70, 0.22], [2.08, 0.22]
  ].reverse();
  const lowerMesh = new THREE.Mesh(sculptBody(extrudeProfile(lower, CAR_W, BEVEL)), paint);
  body.add(lowerMesh);
  // Glasshouse: body-coloured roof and pillars; glass set proud of it.
  const cabinPts = [[0.60, 0.95], [-0.32, 1.37], [-1.12, 1.40], [-1.99, 1.02], [-1.60, 0.98]].reverse();
  const cabin = new THREE.Mesh(taper(extrudeProfile(cabinPts, 1.56, 0.06), 0.97, 1.40, 0.2), paint);
  body.add(cabin);
  const glassPts = [[0.52, 1.00], [-0.28, 1.335], [-1.08, 1.36], [-1.9, 1.05], [-1.56, 1.0]].reverse();
  const glassMesh = new THREE.Mesh(taper(extrudeProfile(glassPts, 1.585, 0.02), 0.97, 1.40, 0.2), glass);
  body.add(glassMesh);
  // Rear window: the big dark panel you see from the chase camera, following the hatch slope.
  const rw = new THREE.BufferGeometry();
  // Hatch slope from (z 1.99, y 1.02) to (z 1.12, y 1.40); outward normal (back and up), past the 6 cm bevel.
  const nz = 0.40, ny = 0.916, off = 0.072;
  const P = (x, z, y) => [x, y + ny * off, z + nz * off];
  rw.setAttribute('position', new THREE.Float32BufferAttribute([
    ...P(-0.66, 1.93, 1.05), ...P(0.66, 1.93, 1.05), ...P(0.52, 1.2, 1.37),
    ...P(-0.66, 1.93, 1.05), ...P(0.52, 1.2, 1.37), ...P(-0.52, 1.2, 1.37)
  ], 3));
  rw.computeVertexNormals();
  body.add(new THREE.Mesh(rw, glass));
  // Roof spoiler.
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.26), black);
  spoiler.position.set(0, 1.405, 1.2); spoiler.rotation.x = -.12;
  body.add(spoiler);

  // Tail lights: wide wedges wrapping into the rear corners.
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(0.26, 0.0); s.lineTo(0.76, 0.03); s.lineTo(0.79, 0.14); s.lineTo(0.30, 0.13); s.lineTo(0.24, 0.06);
    const g = new THREE.ShapeGeometry(s);
    if (sx < 0) { g.scale(-1, 1, 1); }
    const m = new THREE.Mesh(g, tail);
    m.position.set(0, 0.84, REAR + rearCrown(0.57) - 0.006); m.rotation.x = -.18;
    m.material.side = THREE.DoubleSide;
    body.add(m);
  }
  const third = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.025), tail);
  third.position.set(0, 1.45, 1.25); third.rotation.x = -1.1;
  body.add(third);
  // Plate, badge, diffuser, twin exhausts.
  if (!ghost) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: .5, emissive: 0x222222, emissiveMap: null }));
    pl.position.set(0, 0.66, REAR + rearCrown(0) + 0.004);
    body.add(pl);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.045, 28), new THREE.MeshStandardMaterial({ color: 0x5d646d, metalness: .9, roughness: .45, envMap, envMapIntensity: .35 }));
    badge.position.set(0, 0.95, REAR + rearCrown(0) - 0.035); badge.rotation.x = -.25;
    body.add(badge);
  }
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.16, 0.12), black);
  diffuser.position.set(0, 0.27, REAR + rearCrown(0.5) - 0.03);
  body.add(diffuser);
  const tips = [];
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.16, 20, 1, true), chrome);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(sx * 0.55, 0.29, REAR + rearCrown(0.55) + 0.02);
    body.add(tip);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.046, 20), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    hole.position.set(sx * 0.55, 0.29, REAR + rearCrown(0.55) + 0.09);
    body.add(hole);
    const anchor = new THREE.Object3D();
    anchor.position.set(sx * 0.55, 0.29, REAR + rearCrown(0.55) + 0.13);
    body.add(anchor);
    tips.push(anchor);
  }
  // Mirrors and headlights.
  for (const sx of [-1, 1]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.12), paint);
    mir.position.set(sx * 0.98, 1.03, -0.42);
    body.add(mir);
  }
  if (!ghost) {
    const head = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xdde8ff, emissiveIntensity: 1.6 });
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.08), head);
      h.position.set(sx * 0.58, 0.68, -REAR + 0.01); h.rotation.y = Math.PI; h.rotation.x = .3;
      body.add(h);
    }
  }
  // Wheels (not part of the pitching body).
  const wheels = [];
  const tyreMat = ghost ? paint : new THREE.MeshStandardMaterial({ color: 0x101010, roughness: .92 });
  const rimMat = ghost ? paint : new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: .9, roughness: .3, envMap });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.235, 32), tyreMat);
    tyre.rotation.z = Math.PI / 2;
    w.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.228, 0.228, 0.24, 24), rimMat);
    rim.rotation.z = Math.PI / 2;
    w.add(rim);
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.05), ghost ? paint : black);
      spoke.position.x = sx * 0.125;
      spoke.rotation.x = k / 5 * Math.PI * 2;
      spoke.position.y = Math.cos(k / 5 * Math.PI * 2) * 0.1;
      spoke.position.z = Math.sin(k / 5 * Math.PI * 2) * 0.1;
      w.add(spoke);
    }
    w.position.set(sx * TRACK_W / 2, WHEEL_R, sz * WHEELBASE / 2);
    root.add(w);
    wheels.push(w);
  }
  // Soft contact shadow.
  if (!ghost) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.0), new THREE.MeshBasicMaterial({ map: softDot(128, 'rgba(0,0,0,.85)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012;
    root.add(shadow);
  }
  if (ghost) root.traverse(o => { if (o.isMesh) o.renderOrder = 5; });
  return { root, body, wheels, tips, tailMat: tail };
}

// ---------------------------------------------------------------- track
function buildTrack(scene, maps) {
  const group = new THREE.Group();
  scene.add(group);
  const len = 760, start = 60;
  const cx = LANE / 2; // centre of the two-lane strip
  // Ground beyond the strip.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, len + 200), new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.02, start - len / 2);
  group.add(ground);
  // Strip: asphalt + concrete launch pad for the first 100 m.
  const stripMat = new THREE.MeshStandardMaterial({ map: maps.strip, roughness: .82, metalness: 0 });
  maps.strip.repeat.set(1, len / 20);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 3, len), stripMat);
  strip.rotation.x = -Math.PI / 2; strip.position.set(cx, 0, start - len / 2);
  group.add(strip);
  maps.pad.repeat.set(1, 110 / 10);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 3, 110), new THREE.MeshStandardMaterial({ map: maps.pad, roughness: .7 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(cx, 0.004, 55 - 110 / 2 - 10);
  group.add(pad);
  // Guard walls with painted blocks (the speed reference).
  maps.wall.repeat.set(len / 32, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: maps.wall, roughness: .8 });
  for (const x of [-LANE / 2 - 1.3, LANE * 1.5 + 1.3]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.95, len), wallMat);
    wall.position.set(x, 0.475, start - len / 2);
    group.add(wall);
  }
  // Start line, timing lines and the finish checker.
  const white = new THREE.MeshBasicMaterial({ color: 0xe8ecf0 });
  const line = (z, w = 0.16, mat = white) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 2, w), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.01, z);
    group.add(m);
  };
  line(STAGE_Z, 0.2);
  // Staging photocells: posts either side of each lane with the pre-stage and stage beam heads (the beams
  // themselves are infrared, not drawn).
  const cellMat = new THREE.MeshStandardMaterial({ color: 0x1c2129, metalness: .4, roughness: .6 });
  const lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .25, .2) });
  for (const laneX of [0, LANE]) for (const side of [-1, 1]) {
    const x = laneX + side * (TRACK_W / 2 + 0.62);
    for (const [z, h] of [[STAGE_Z + PRESTAGE_M, 0.34], [STAGE_Z, 0.26]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.09), cellMat);
      post.position.set(x, h / 2, z); group.add(post);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.03), lens);
      eye.position.set(x - side * 0.06, 0.11, z); group.add(eye);
    }
  }
  // Water box (wet, reflective) and the dark rubber of countless burnouts just past it.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 2 - 0.4, 5.5), new THREE.MeshStandardMaterial({ color: 0x0d1217, roughness: .08, metalness: .6, transparent: true, opacity: .92 }));
  water.rotation.x = -Math.PI / 2; water.position.set(cx, 0.006, WATER_Z); group.add(water);
  const rubber = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 2, 9), new THREE.MeshBasicMaterial({ map: softDot(128, 'rgba(0,0,0,.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
  rubber.rotation.x = -Math.PI / 2; rubber.position.set(cx, 0.007, BURNOUT_Z - 2); group.add(rubber);
  for (const [d] of MARKS) line(-d, 0.08);
  const checker = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2'; g.fillRect(i * 8, j * 8, 8, 8); } });
  line(-FINISH, 1.0, new THREE.MeshBasicMaterial({ map: checker }));
  // Distance boards on the left wall.
  for (const [d, label] of MARKS) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.82), new THREE.MeshBasicMaterial({ map: boardTexture(label) }));
    board.position.set(-LANE / 2 - 1.1, 1.6, -d + 0.3);
    board.rotation.y = Math.PI / 2 * 0.72;
    group.add(board);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), new THREE.MeshStandardMaterial({ color: 0x333a44 }));
    post.position.set(-LANE / 2 - 1.1, 0.6, -d + 0.3);
    group.add(post);
  }
  // Finish gantry.
  const truss = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: .6, roughness: .5 });
  for (const x of [-LANE / 2 - 1.0, LANE * 1.5 + 1.0]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.2, 0.35), truss);
    p.position.set(x, 3.1, -FINISH);
    group.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(LANE * 3 + 2.4, 1.1, 0.4), truss);
  beam.position.set(cx, 6.2, -FINISH);
  group.add(beam);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.0), new THREE.MeshBasicMaterial({ map: boardTexture('FINISH') }));
  sign.position.set(cx, 6.2, -FINISH + 0.22);
  group.add(sign);
  // Christmas tree between the lanes, just past the start line (all greens lit during the run).
  const tree = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), new THREE.MeshStandardMaterial({ color: 0x14181e }));
  pole.position.y = 1.15; tree.add(pole);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.2, 0.14), new THREE.MeshStandardMaterial({ color: 0x0c0e12 }));
  box.position.y = 1.9; tree.add(box);
  // Bulbs by name (preL, stageR, a1L, gR, rL, ...), switched by the app from the tree sequence. The tree
  // faces the drivers (rotated half a turn), so local +x is the left (player) lane.
  const bulbs = {};
  const glowTex = softDot(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  for (const [row, y] of TREE_ROWS) for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const mat = new THREE.MeshBasicMaterial({ color: BULB_OFF[row] });
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), mat);
    b.position.set(sx * 0.16, y - 0.4, 0.075); b.rotation.y = Math.PI;
    tree.add(b);
    const [r, g2, bl] = BULB_ON[row];
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(r / 4, g2 / 4, bl / 4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.set(.5, .5, 1); glow.position.set(sx * 0.16, y - 0.4, 0.09);
    tree.add(glow);
    bulbs[row + side] = { mat, glow, on: false, onColor: new THREE.Color(r, g2, bl), offColor: new THREE.Color(BULB_OFF[row]) };
  }
  group.userData.bulbs = bulbs;
  tree.position.set(LANE / 2, 0, -4.5);
  tree.rotation.y = Math.PI;
  group.add(tree);
  // Floodlight towers with their light pools on the asphalt.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b313a, metalness: .5, roughness: .6 });
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.9, 2.2) });
  const pool = new THREE.MeshBasicMaterial({ map: softDot(128, 'rgba(255,214,150,.28)', 'rgba(255,214,150,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.SpriteMaterial({ map: softDot(64, 'rgba(255,230,180,1)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let z = 30; z > -620; z -= 42) {
    for (const [x, dir] of [[-LANE / 2 - 3.2, 1], [LANE * 1.5 + 3.2, -1]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 13, 8), poleMat);
      p.position.set(x, 6.5, z); group.add(p);
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.4), headMat);
      h.position.set(x + dir * 0.6, 13, z); group.add(h);
      const s = new THREE.Sprite(glow); s.scale.set(5, 5, 1); s.position.set(x + dir * 0.6, 13, z); group.add(s);
      const lp = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), pool);
      lp.rotation.x = -Math.PI / 2; lp.position.set(x + dir * 5.5, 0.02, z); group.add(lp);
    }
  }
  // Grandstand along the start area.
  maps.crowd.repeat.set(10, 1);
  const standMat = new THREE.MeshStandardMaterial({ map: maps.crowd, roughness: .9, emissive: 0x151a22, emissiveIntensity: .4 });
  for (let r = 0; r < 6; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 150), r % 2 ? standMat : new THREE.MeshStandardMaterial({ color: 0x1a1f28 }));
    step.position.set(-LANE / 2 - 9 - r * 1.9, 0.45 + r * 0.9, -45);
    group.add(step);
  }
  // Far city glow and hills for depth.
  const hills = new THREE.Mesh(new THREE.CylinderGeometry(900, 900, 60, 48, 1, true), new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: canvasTex(2048, 128, (g, w, h) => {
    g.fillStyle = '#070a10'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,${180 + Math.random() * 60 | 0},120,${Math.random() * .8})`; g.fillRect(Math.random() * w, h * .55 + Math.random() * h * .35, 2, 2); }
    g.fillStyle = '#04060a'; g.beginPath(); g.moveTo(0, h * .6);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, h * (.45 + Math.sin(x * .013) * .08 + Math.sin(x * .041) * .04));
    g.lineTo(w, h); g.lineTo(0, h); g.fill();
  }), fog: false }));
  hills.position.set(cx, 18, -200);
  group.add(hills);
  return group;
}

// ---------------------------------------------------------------- effects
function makeSmoke(scene) {
  const tex = softDot(128, 'rgba(220,224,230,.9)', 'rgba(200,205,212,0)');
  const pool = [];
  for (let i = 0; i < 240; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xcfd4da });
    const s = new THREE.Sprite(m); s.visible = false; scene.add(s);
    pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 });
  }
  let next = 0;
  return {
    // o: { life, grow, vz, wind } for the burnout (big, slow, long-lived clouds thrown back by the tyre)
    spawn(pos, strength, o = null) {
      const p = pool[next]; next = (next + 1) % pool.length;
      p.s.position.copy(pos); p.s.visible = true;
      p.life = 0; p.max = (o?.life || 1.4) + Math.random() * (o?.life || 1.4);
      p.vx = (Math.random() - .5) * 2.2 + (o?.wind || 0); p.vy = .5 + Math.random() * .8; p.vz = (o?.vz ?? 1) + Math.random() * 2;
      p.grow = (o?.grow || 1.2) + strength * 1.6;
      p.base = .26 + strength * .4;
      p.s.scale.setScalar(.6);
    },
    update(dt) {
      for (const p of pool) {
        if (!p.s.visible) continue;
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { p.s.visible = false; continue; }
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
        p.vx *= .97; p.vz *= .97;
        p.s.scale.setScalar(.5 + p.grow * k);
        p.s.material.opacity = p.base * (1 - k) * Math.min(1, k * 6);
      }
    },
    active() { return pool.reduce((n, p) => n + (p.s.visible ? 1 : 0), 0); },
    dispose() { tex.dispose(); pool.forEach(p => p.s.material.dispose()); }
  };
}

const FLAME_COLORS = { 'blue-white': [0xd9ecff, 0x4f9dff], orange: [0xfff1c0, 0xff7a1c], red: [0xffd2a0, 0xd8300c] };
function makeFlames(car, scene) {
  const core = softDot(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const sets = car.tips.map(anchor => {
    const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: core, color: 0xfff1c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    const outer = new THREE.Sprite(new THREE.SpriteMaterial({ map: core, color: 0xff7a1c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    anchor.add(outer); anchor.add(inner);
    return { inner, outer };
  });
  const light = new THREE.PointLight(0xff8a2a, 0, 4.5, 2);
  light.position.set(0, 0.4, 2.6);
  car.body.add(light);
  let pops = [];      // { t, dur, size, color }
  let sustain = 0, sustainColor = 'orange';
  return {
    pop(fe) {
      if (!fe?.visible) return;
      pops.push({ t: 0, dur: Math.max(.06, (fe.durationMs || 200) / 1000), size: fe.sizeScale || 1, color: fe.color || 'orange', k: fe.intensity || .5 });
      if (pops.length > 8) pops.shift();
    },
    setSustain(k, color) { sustain = k; if (color) sustainColor = color; },
    update(dt, time) {
      pops = pops.filter(p => (p.t += dt) < p.dur);
      let size = 0, alpha = 0, color = sustainColor;
      for (const p of pops) {
        const u = p.t / p.dur, env = u < .18 ? u / .18 : 1 - (u - .18) / .82;
        const s = p.size * (.5 + .8 * env);
        if (s > size) { size = s; color = p.color; }
        alpha = Math.max(alpha, env * (.6 + .4 * p.k));
      }
      if (sustain > .02) {
        const flicker = .82 + .18 * Math.sin(time * 61) * Math.sin(time * 37 + 1.3);
        size = Math.max(size, (.45 + sustain * .6) * flicker);
        alpha = Math.max(alpha, (.35 + sustain * .6) * flicker);
      }
      const [ci, co] = FLAME_COLORS[color] || FLAME_COLORS.orange;
      for (const f of sets) {
        f.inner.material.color.setHex(ci); f.outer.material.color.setHex(co);
        f.inner.material.opacity = alpha; f.outer.material.opacity = alpha * .8;
        f.inner.scale.set(.18 * size, .18 * size, 1);
        f.outer.scale.set(.42 * size, .34 * size, 1);
        f.outer.position.z = .08 * size;
      }
      light.intensity = alpha * 3.2 * Math.max(.4, size);
    },
    dispose() { core.dispose(); sets.forEach(f => { f.inner.material.dispose(); f.outer.material.dispose(); }); }
  };
}

// ---------------------------------------------------------------- scene
export function supported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

export function create(canvas, opts = {}) {
  if (!canvas || !supported()) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch (e) { return null; }
  const dpr = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 1.6);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.fog = new THREE.FogExp2(0x070a10, 0.0065);
  const envMap = makeEnvironment(renderer);
  scene.environment = null;
  scene.add(new THREE.HemisphereLight(0x33476b, 0x0a0908, 0.9));
  const key = new THREE.DirectionalLight(0xffe2b8, 1.6); key.position.set(-18, 22, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.8); rim.position.set(20, 14, -30); scene.add(rim);

  const maps = { strip: stripTexture(), pad: launchPadTexture(), wall: wallTexture(), crowd: crowdTexture() };
  const track = buildTrack(scene, maps);
  const bulbs = track.userData.bulbs;
  let litKey = '';
  // names: the lit bulbs (e.g. ['preL','preR','stageL']); null = the run default (both greens lit)
  function setLights(names) {
    const list = names || ['gL', 'gR'];
    const key = list.join(',');
    if (key === litKey) return;
    litKey = key;
    for (const [name, b] of Object.entries(bulbs)) {
      const on = list.includes(name);
      b.mat.color.copy(on ? b.onColor : b.offColor);
      b.glow.material.opacity = on ? .85 : 0;
    }
  }
  setLights(null);

  const player = buildCar({ color: opts.playerColor ?? 0x1f4fd8, plate: opts.plate || 'KK-895-H', envMap });
  scene.add(player.root);
  const rival = opts.headsUp ? buildCar({ color: opts.rivalColor ?? 0x6b1a1a, plate: 'RIVAL-12', envMap }) : null;
  if (rival) { rival.root.position.set(LANE, 0, 0); scene.add(rival.root); }
  const ghost = opts.ghost?.length ? buildCar({ ghost: true, envMap }) : null;
  if (ghost) scene.add(ghost.root);
  const smoke = makeSmoke(scene);
  const flames = makeFlames(player, scene);
  const rivalFlames = rival ? makeFlames(rival, scene) : null;

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 1500);
  // Soft fill from the floodlights behind the camera (keeps the rear of the car readable at night).
  const fill = new THREE.DirectionalLight(0xfff0dc, 0.75);
  fill.position.set(0, 3, 8); camera.add(fill); fill.target.position.set(0, -1, -10); camera.add(fill.target);
  scene.add(camera);
  const cam = { z: 6.2, x: 0, lagZ: 0, fov: 56 };
  const driven = opts.drivetrain === 'RWD' ? [2, 3] : opts.drivetrain === 'AWD' ? [0, 1, 2, 3] : [0, 1];
  const tmp = new THREE.Vector3();
  let last = null, time = 0, smokeAcc = 0, wheelAngle = 0, rivalWheel = 0, disposed = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  function ghostAt(t) {
    const g = opts.ghost;
    if (!g || !g.length) return null;
    if (t <= g[0][0]) return g[0];
    for (let i = 1; i < g.length; i++) if (g[i][0] >= t) {
      const a = g[i - 1], b = g[i], f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    return g[g.length - 1];
  }

  // Where the car stands while staging: from 3 m short of the pre-stage beam (progress 0) to the pre-stage
  // beam (25 %), the stage beam (56 %) and deep (past 90 %, the pre-stage light goes out). z of the car
  // root equals the front tyre's distance past the stage beam (the run starts at root z = 0).
  function stageRootZ(progress) {
    const p = Math.max(0, Math.min(100, progress));
    return p < 25 ? PRESTAGE_M + (25 - p) / 25 * 3.0 : PRESTAGE_M - (p - 25) / 31 * PRESTAGE_M;
  }
  const pre = { z: null, lastZ: null, mode: '' };
  // Burnout and staging. frame: { scene, rpm, wheelSpeedKmh (driven tyre surface), smoke 0..1, tyreTempC,
  // stageProgress, lights[] }
  function updatePreRace(frame, dt, mode) {
    setLights(frame.lights || []);
    if (pre.mode !== mode) { pre.mode = mode; pre.z = null; }
    const target = mode === 'burnout' ? BURNOUT_Z : stageRootZ(Number(frame.stageProgress) || 0);
    pre.lastZ = pre.z ?? target;
    pre.z = pre.z == null ? target : pre.z + (target - pre.z) * Math.min(1, dt * 5);
    const vCar = (pre.lastZ - pre.z) / Math.max(dt, 1e-3);
    player.root.position.set(0, 0, pre.z);
    player.root.rotation.y = 0;
    const vSurf = Math.max(vCar, (Number(frame.wheelSpeedKmh) || 0) / 3.6);
    player.wheels.forEach((w, i) => { w.rotation.x -= (driven.includes(i) ? vSurf : vCar) * dt / WHEEL_R; });
    const smokeK = Math.max(0, Math.min(1, Number(frame.smoke) || 0));
    const rpm = Number(frame.rpm) || 900;
    // Engine rock on its mounts under load, the body shaking on spinning tyres.
    const shake = opts.reducedMotion ? 0 : (.0015 + smokeK * .006) * Math.min(1.5, rpm / 4000);
    player.body.rotation.z = THREE.MathUtils.lerp(player.body.rotation.z, (Math.random() - .5) * shake * 4, Math.min(1, dt * 12));
    player.body.rotation.x = THREE.MathUtils.lerp(player.body.rotation.x, mode === 'burnout' ? -smokeK * .012 : 0, Math.min(1, dt * 4));
    player.body.position.y = (Math.random() - .5) * shake;
    if (rival) { rival.root.position.set(LANE, 0, stageRootZ(60)); rivalFlames.update(dt, time); }
    if (ghost) ghost.root.visible = false;
    // Burnout smoke: rubber boils off the driven tyres; the amount follows the slip power (tyre surface
    // speed) and the tyre state from the burnout model. Thrown rearwards by the tread, drifting in the wind.
    if (mode === 'burnout' && smokeK > .04) {
      smokeAcc += dt * smokeK * (18 + Math.min(1.4, vSurf / 14) * 70);
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        const w = player.wheels[driven[(Math.random() * driven.length) | 0]];
        w.getWorldPosition(tmp);
        tmp.y = .2; tmp.x += (tmp.x > 0 ? .25 : -.25); tmp.z += WHEEL_R * .8;
        smoke.spawn(tmp, smokeK, { life: 2.4, grow: 2.6, vz: 2.2 + vSurf * .12, wind: .5 });
      }
    }
    smoke.update(dt);
    flames.update(dt, time);
    // Cameras: the burnout from the side of the driven axle, slowly swinging; staging from behind the car,
    // low, with the tree in view.
    // Distance that fits the car (plus its smoke) across the view on a portrait phone screen.
    const fitR = (widthM, fovDeg) => {
      const hHalf = Math.atan(Math.tan(fovDeg * Math.PI / 360) * camera.aspect);
      return Math.max(5.5, Math.min(14, widthM / 2 / Math.tan(hHalf)));
    };
    if (mode === 'burnout') {
      // A front (FWD/AWD) or rear (RWD) three-quarter view of the driven axle; a side view does not fit
      // between the pit wall (3.45 m left) and the far wall.
      const base = opts.drivetrain === 'RWD' ? 0.5 : 2.72;
      const ang = base + Math.sin(time * .16) * .12, R = fitR(4.6, 48);
      const x = Math.max(-2.8, Math.min(7.2, Math.sin(ang) * R));
      camera.position.set(x, 1.6 + Math.sin(time * .1) * .12, pre.z + Math.cos(ang) * R);
      tmp.set(0.4, .7, pre.z + (opts.drivetrain === 'RWD' ? .8 : -.4));
      camera.lookAt(tmp);
      camera.position.x += (Math.random() - .5) * shake * 6;
      if (Math.abs(camera.fov - 48) > .05) { camera.fov = 48; camera.updateProjectionMatrix(); }
    } else {
      // Behind the car, above the roof line: the car in the lower half, the tree and the beams ahead.
      const R = fitR(3.2, 46);
      camera.position.set(-0.2, 2.1, pre.z + R);
      tmp.set(LANE / 2 - 1.2, 1.1, STAGE_Z - 4);
      camera.lookAt(tmp);
      if (Math.abs(camera.fov - 46) > .05) { camera.fov = 46; camera.updateProjectionMatrix(); }
    }
    renderer.render(scene, camera);
    last = null;
  }

  // frame: { t, distanceM, lateralM, lateralVelocity, speedKmh, accelerationG, wheelspinPct, opponentDistanceM }
  function update(frame, dt) {
    if (disposed) return;
    resize();
    dt = Math.min(Math.max(dt || 0, 0), .1);
    time += dt;
    if (frame.scene && frame.scene !== 'run') return updatePreRace(frame, dt, frame.scene);
    setLights(frame.lights || null);
    const d = Number(frame.distanceM) || 0, v = (Number(frame.speedKmh) || 0) / 3.6;
    const accG = Number(frame.accelerationG) || 0;
    // Player car.
    const z = -d;
    player.root.position.set(Number(frame.lateralM) || 0, 0, z);
    player.root.rotation.y = -Math.atan2(Number(frame.lateralVelocity) || 0, Math.max(3, v)) * .9;
    // Squat under acceleration (nose up), roll with lateral velocity.
    player.body.rotation.x = THREE.MathUtils.lerp(player.body.rotation.x, -Math.min(accG, 1.4) * .026, Math.min(1, dt * 6));
    player.body.rotation.z = THREE.MathUtils.lerp(player.body.rotation.z, (Number(frame.lateralVelocity) || 0) * .012, Math.min(1, dt * 5));
    player.body.position.y = Math.sin(time * 23) * .002 * Math.min(1, v / 40);
    wheelAngle -= (last ? (d - last.distanceM) : 0) / WHEEL_R;
    const spin = (Number(frame.wheelspinPct) || 0) / 100;
    player.wheels.forEach((w, i) => { w.rotation.x = wheelAngle - (driven.includes(i) ? spin * time * 40 : 0); });
    // Rival.
    if (rival) {
      const od = Number(frame.opponentDistanceM) || 0;
      const oz = -od;
      rivalWheel -= last ? (od - (last.opponentDistanceM || 0)) / WHEEL_R : 0;
      rival.root.position.set(LANE + Math.sin(time * .7) * .05, 0, oz);
      rival.wheels.forEach(w => { w.rotation.x = rivalWheel; });
      const ov = last ? (od - last.opponentDistanceM) / Math.max(dt, 1e-3) : 0;
      const oa = last ? (ov - last.oppV) / Math.max(dt, 1e-3) / 9.81 : 0;
      rival.body.rotation.x = THREE.MathUtils.lerp(rival.body.rotation.x, -Math.min(1.2, Math.max(0, oa)) * .026, Math.min(1, dt * 6));
      frame.oppV = ov;
      rivalFlames.update(dt, time);
    }
    // Ghost of the best run.
    if (ghost) {
      const g = ghostAt(Number(frame.t) || 0);
      if (g) { ghost.root.position.set(g[2], 0.002, -g[1]); ghost.root.visible = Math.abs(g[1] - d) > 0.8; }
    }
    // Tyre smoke from the driven wheels: rate and density follow the simulated wheelspin.
    if (spin > .06) {
      smokeAcc += dt * (10 + spin * 60);
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        const w = player.wheels[driven[(Math.random() * driven.length) | 0]];
        w.getWorldPosition(tmp);
        tmp.y = .18; tmp.x += (tmp.x > player.root.position.x ? .2 : -.2);
        smoke.spawn(tmp, spin);
      }
    }
    smoke.update(dt);
    flames.update(dt, time);
    // Replay cameras cut between fixed trackside positions; live play always uses the chase camera.
    const mode = frame.camera || 'chase';
    if (mode !== 'chase') {
      const px = player.root.position.x;
      if (mode === 'side') { camera.position.set(-LANE / 2 - 2.4, 0.9, -62); tmp.set(px, 0.7, z); }
      else if (mode === 'launch') { camera.position.set(LANE / 2 + 0.2, 0.55, -14); tmp.set(px, 0.6, z); }
      else if (mode === 'high') { camera.position.set(px + 7, 10, z + 16); tmp.set(px + 2, 0, z - 14); }
      else if (mode === 'finish') { camera.position.set(LANE * 1.5 + 2.2, 1.5, -FINISH - 10); tmp.set(px + LANE / 2, 0.8, z); }
      camera.lookAt(tmp);
      const want = mode === 'high' ? 50 : mode === 'finish' ? 34 : 42;
      if (Math.abs(camera.fov - want) > .05) { camera.fov = want; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
      last = { distanceM: d, opponentDistanceM: Number(frame.opponentDistanceM) || 0, oppV: frame.oppV || 0 };
      return;
    }
    // Chase camera: a spring behind the car, so hard launches pull the car away from the lens.
    const targetLag = Math.min(2.2, Math.max(0, accG) * 1.35);
    cam.lagZ += (targetLag - cam.lagZ) * Math.min(1, dt * 2.2);
    cam.x += (player.root.position.x * .75 - cam.x) * Math.min(1, dt * 3.5);
    const shake = (Math.min(1, v / 70) * .018 + Math.max(0, accG - .6) * .02) * (opts.reducedMotion ? 0 : 1);
    camera.position.set(cam.x + (Math.random() - .5) * shake, 2.35 + (Math.random() - .5) * shake - cam.lagZ * .06, z + 8.2 + cam.lagZ);
    tmp.set(player.root.position.x * .9, 0.35, z - 12);
    camera.lookAt(tmp);
    const fov = 55 + Math.min(1, v / 85) * 13;
    if (Math.abs(fov - camera.fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);
    last = { distanceM: d, opponentDistanceM: Number(frame.opponentDistanceM) || 0, oppV: frame.oppV || 0 };
  }

  function dispose() {
    if (disposed) return;
    stopReplay();
    disposed = true;
    smoke.dispose(); flames.dispose(); rivalFlames?.dispose();
    scene.traverse(o => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    Object.values(maps).forEach(t => t.dispose());
    envMap.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  // Replay of a recorded run: frames [{t, d, lat, latV, v, g, ws, od}], flame events [{t, fe}].
  let replayRaf = 0;
  function replay(frames, events = [], { onProgress, onEnd } = {}) {
    stopReplay();
    if (!frames?.length) return;
    const end = frames[frames.length - 1].t;
    let clock = frames[0].t, idx = 0, ev = 0, prev = performance.now();
    last = null; wheelAngle = 0;
    const cut = d => d < 14 ? 'chase' : d < 45 ? 'launch' : d < 120 ? 'side' : d < 300 ? 'high' : d < 372 ? 'chase' : 'finish';
    const step = now => {
      const real = Math.min(.05, (now - prev) / 1000);
      prev = now;
      const f0 = frames[Math.min(idx, frames.length - 1)];
      const speed = f0.d < 20 ? .45 : 1;            // slow motion off the line
      clock = Math.min(end, clock + real * speed);
      while (idx < frames.length - 1 && frames[idx + 1].t <= clock) idx++;
      const a = frames[idx], b = frames[Math.min(idx + 1, frames.length - 1)];
      const u = b.t > a.t ? (clock - a.t) / (b.t - a.t) : 0, L = (x, y) => x + (y - x) * u;
      while (ev < events.length && events[ev].t <= clock) flames.pop(events[ev++].fe);
      const dNow = L(a.d, b.d);
      update({ t: clock, distanceM: dNow, lateralM: L(a.lat, b.lat), lateralVelocity: L(a.latV, b.latV), speedKmh: L(a.v, b.v), accelerationG: L(a.g, b.g), wheelspinPct: L(a.ws, b.ws), opponentDistanceM: L(a.od, b.od), camera: cut(dNow) }, real * speed);
      onProgress?.(clock / end);
      if (clock >= end) { replayRaf = 0; onEnd?.(); return; }
      replayRaf = requestAnimationFrame(step);
    };
    replayRaf = requestAnimationFrame(step);
  }
  function stopReplay() { if (replayRaf) cancelAnimationFrame(replayRaf); replayRaf = 0; }

  return {
    update,
    replay,
    stopReplay,
    flame: fe => flames.pop(fe),
    rivalFlame: fe => rivalFlames?.pop(fe),
    sustain: (k, color) => flames.setSustain(k, color),
    renderer,
    dispose,
    scene: () => ({ mode: pre.mode || 'run', carZ: player.root.position.z, lit: litKey ? litKey.split(',') : [], smoke: smoke.active() }),
    info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries })
  };
}

window.EA888Race3D = { create, supported };
