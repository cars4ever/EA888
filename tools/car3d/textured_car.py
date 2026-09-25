"""Blender headless: fits a TEXTURED generated car to the game chassis, splits its wheels, blanks the plate.

blender -b -P split_car.py -- --src model.glb --body body.glb --wheel wheel.glb [--yaw 180]

The game drives a fixed chassis: wheelbase 2.578 m, track 1.57 m, wheel radius 0.323 m, and it spins the
wheels itself. A generated car has its own proportions, so scaling by overall length leaves the arches and
the wheels out of step - and wheels baked into the body cannot turn.

So: measure the four contact patches, scale each axis so the wheelbase, the track and the height match the
real car, then cut the wheels out on the game's own axle positions and write one wheel centred on its axle.
scirocco.js hangs a copy of that wheel in each of the four wheel groups, where it spins as before.
"""
import bpy, bmesh, sys, math, argparse, pathlib
import numpy as np
import mathutils

WHEELBASE, TRACK, WHEEL_R, HEIGHT = 2.578, 1.57, 0.323, 1.404

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--body', required=True)
ap.add_argument('--wheel', required=True)
ap.add_argument('--yaw', type=float, default=0.0)
ap.add_argument('--tris', type=int, default=26000)
ap.add_argument('--wheel-tris', type=int, default=9000)
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.src)
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
if ob.parent:
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
ob.data.transform(ob.matrix_world); ob.matrix_world.identity()
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
if a.yaw:
    ob.data.transform(mathutils.Matrix.Rotation(math.radians(a.yaw), 4, 'Z'))

def bake(m):
    ob.data.transform(m)

def coords():
    return np.array([v.co[:] for v in ob.data.vertices])

# ---- drop the loose shells the generator leaves around the car -------------------------------------
me = bmesh.new(); me.from_mesh(ob.data)
seen, shells = set(), []
for f in me.faces:
    if f.index in seen:
        continue
    stack, group = [f], []
    seen.add(f.index)
    while stack:
        cur = stack.pop(); group.append(cur)
        for e in cur.edges:
            for nb in e.link_faces:
                if nb.index not in seen:
                    seen.add(nb.index); stack.append(nb)
    shells.append(group)
shells.sort(key=len, reverse=True)
drop = [f for g in shells[1:] if len(g) < len(shells[0]) * 0.02 for f in g]
if drop:
    bmesh.ops.delete(me, geom=drop, context='FACES')
    print(f'  shells: {len(shells)}, dropped {len(drop)} loose faces')
me.to_mesh(ob.data); me.free()

# ---- centre, then measure the chassis off the contact patches --------------------------------------
co = coords(); mn, mx = co.min(0), co.max(0)
bake(mathutils.Matrix.Translation((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2])))
co = coords(); size = co.max(0) - co.min(0)
ground = co[co[:, 2] < size[2] * 0.045]
patch = {}
for sx in (-1, 1):
    for sy in (-1, 1):
        q = ground[(np.sign(ground[:, 0]) == sx) & (np.sign(ground[:, 1]) == sy)]
        if len(q) < 30:
            sys.exit(f'no contact patch in quadrant x{sx:+d} y{sy:+d}: cannot fit the chassis')
        patch[(sx, sy)] = (q[:, 0].mean(), q[:, 1].mean())
front = np.mean([p[1] for k, p in patch.items() if k[1] > 0])
rear = np.mean([p[1] for k, p in patch.items() if k[1] < 0])
wb = front - rear
track = 2 * float(np.mean([abs(p[0]) for p in patch.values()]))
print(f'  model: wheelbase {wb:.3f}  track {track:.3f}  height {size[2]:.3f}')

sx_, sy_, sz_ = TRACK / track, WHEELBASE / wb, HEIGHT / size[2]
bake(mathutils.Matrix.Diagonal((sx_, sy_, sz_, 1.0)).to_4x4())
print(f'  scaled x {sx_:.3f}  y {sy_:.3f}  z {sz_:.3f}')
co = coords(); mn, mx = co.min(0), co.max(0)
# wheelbase centred on y = 0, ground on z = 0, centreline on x = 0
bake(mathutils.Matrix.Translation((-(mn[0] + mx[0]) / 2, -((front * sy_) + (rear * sy_)) / 2, -mn[2])))
co = coords(); mn, mx = co.min(0), co.max(0)
print(f'  fitted: L {mx[1]-mn[1]:.3f}  W {mx[0]-mn[0]:.3f} (incl. mirrors)  H {mx[2]-mn[2]:.3f} m')

# ---- the cut is the game's own chassis --------------------------------------------------------------
# Measuring the generated wheel turned out to be the wrong tool: a circle fit over the arch region lands on
# the arch (r = 0.57), and a slab outside the axle plane catches the sill and the door (r = 1.0). It is also
# unnecessary. The body has just been scaled so its wheelbase, track and height are the real car's, and this
# car's wheelbase/length ratio came out at 0.595 against the real 0.606 - so its wheels are already about
# the right size. Cutting on the game's own axle positions and radius is therefore both simple and exactly
# the alignment wanted: whatever sits inside the cylinder the game's wheel occupies is the wheel.
cz = WHEEL_R

# ---- cut the wheels out on the game's own axle positions -------------------------------------------
# The tyre is ~0.25 m wide, so the cut is 0.28 m across the axle, not the 0.84 m the first attempt used -
# that one sliced through the sill and the floor and left the torn edge in plain sight under the car.
R_CUT = WHEEL_R * 1.06
HALF_W = 0.14
me = bmesh.new(); me.from_mesh(ob.data)
wheel_verts = []
for v in me.verts:
    for qx in (-1, 1):
        for qy in (-1, 1):
            ax, ay, az = qx * TRACK / 2, qy * WHEELBASE / 2, cz
            if abs(v.co.x - ax) < HALF_W and (v.co.y - ay) ** 2 + (v.co.z - az) ** 2 < R_CUT ** 2:
                wheel_verts.append(v)
                break
        else:
            continue
        break
keep = set(v.index for v in wheel_verts)
print(f'  wheels: {len(keep)} of {len(me.verts)} verts')

# one wheel: the front left, moved onto its own axle and scaled to the game's radius
wm = bmesh.new()
src_uv = me.loops.layers.uv.active
dst_uv = wm.loops.layers.uv.new('UVMap') if src_uv else None
vmap = {}
for v in wheel_verts:
    if v.co.x < 0 and v.co.y > 0:
        vmap[v] = wm.verts.new(v.co)
wm.verts.index_update()
for f in me.faces:
    vs = [vmap[v] for v in f.verts if v in vmap]
    if len(vs) != len(f.verts) or len(vs) < 3:
        continue
    try:
        nf = wm.faces.new(vs)
    except ValueError:
        continue
    # carry the UVs over: the wheel shares the body's atlas, so it ships no texture of its own
    if dst_uv:
        for nl, sl in zip(nf.loops, f.loops):
            nl[dst_uv].uv = sl[src_uv].uv
seen2, groups = set(), []
wm.faces.index_update()
for f in wm.faces:
    if f.index in seen2:
        continue
    stack, group = [f], []
    seen2.add(f.index)
    while stack:
        cur = stack.pop(); group.append(cur)
        for e in cur.edges:
            for nb in e.link_faces:
                if nb.index not in seen2:
                    seen2.add(nb.index); stack.append(nb)
    groups.append(group)
groups.sort(key=len, reverse=True)
if len(groups) > 1:
    loose = [f for g in groups[1:] for f in g]
    bmesh.ops.delete(wm, geom=loose, context='FACES')
    print(f'  wheel: {len(groups)} shells, kept the largest ({len(groups[0])} faces)')
wheel_mesh = bpy.data.meshes.new('wheel')
wm.to_mesh(wheel_mesh); wm.free()
wob = bpy.data.objects.new('wheel', wheel_mesh)
bpy.context.collection.objects.link(wob)
# No material on the wheel: it carries UVs into the body's atlas and scirocco.js gives it the body's
# material, so the 2048 texture is uploaded once instead of twice.
wheel_mesh.materials.clear()
print(f'  wheel: {len(wheel_mesh.uv_layers)} uv layer(s), no material (shares the body atlas)')
wheel_mesh.transform(mathutils.Matrix.Translation((TRACK / 2, -WHEELBASE / 2, -cz)))   # onto its axle
# The body fit scales y and z differently, which leaves the wheel an ellipse; undo that on the wheel alone
# and then set its diameter to the game's, so it is round and turns true.
wheel_mesh.transform(mathutils.Matrix.Diagonal((1.0, 1.0, sy_ / sz_, 1.0)).to_4x4())
wco = np.array([v.co[:] for v in wheel_mesh.vertices])
dia = max(wco[:, 1].max() - wco[:, 1].min(), wco[:, 2].max() - wco[:, 2].min())
wheel_mesh.transform(mathutils.Matrix.Diagonal((1.0, 2 * WHEEL_R / dia, 2 * WHEEL_R / dia, 1.0)).to_4x4())
print(f'  wheel rounded: z x {sy_ / sz_:.3f}, then {2 * WHEEL_R / dia:.3f} to diameter {2 * WHEEL_R:.3f}')
wco = np.array([v.co[:] for v in wheel_mesh.vertices])
ext = wco.max(0) - wco.min(0)
print(f'  wheel mesh: {len(wheel_mesh.polygons)} faces, bbox {np.round(ext, 3)} '
      f'(a round wheel is {2 * WHEEL_R:.3f} in y and z)')

# body: everything the wheels are not
bmesh.ops.delete(me, geom=wheel_verts, context='VERTS')

# The generator reconstructs the road the car stood on as a thin slab welded to the underside; with the
# wheels gone it shows as a ragged black fringe along the bottom of the bumpers and sills. Drop the
# near-horizontal faces low down, then cut the body off flat above where the road was.
GROUND_Z = 0.075
flat = [f for f in me.faces if abs(f.normal.z) > 0.80 and f.calc_center_median().z < 0.22]
if flat:
    bmesh.ops.delete(me, geom=flat, context='FACES')
    print(f'  ground: dropped {len(flat)} flat road faces')
bmesh.ops.bisect_plane(me, geom=list(me.verts) + list(me.edges) + list(me.faces),
                       plane_co=(0, 0, GROUND_Z), plane_no=(0, 0, 1),
                       clear_inner=True, clear_outer=False)
bmesh.ops.holes_fill(me, edges=[e for e in me.edges if len(e.link_faces) == 1], sides=6)
print(f'  ground: body cut off below z = {GROUND_Z} m')
me.to_mesh(ob.data); me.free()

# The texture is the point of this model, so the baked material and its UVs stay exactly as they are -
# assigning paint/trim here would throw the photograph away. What does have to happen is the registration:
# it is painted into the texture, so it is found through the mesh (the faces on the rear panel where a
# plate sits) and its UV rectangle is blanked in the image itself, before the export re-embeds it.
# Both ends: the rear plate on the boot lid and the front one on the bumper. Metres, from each end.
# A Dutch plate is 520 x 110 mm. These boxes are the plate itself and little more: a generous one blanks
# half the bumper, and a pale rectangle that size reads as damage rather than as a blank plate.
# A Dutch plate is 520 x 110 mm, but on this car it sits low on the bumper/diffuser, not up on the boot
# lid, so the band runs down to 0.18 m. Wide enough to be sure, narrow enough not to wash the bumper out.
PLATES = [dict(end='tail', depth=0.30, z=(0.18, 0.62), x=0.32),
          dict(end='nose', depth=0.26, z=(0.26, 0.52), x=0.30)]

bco = np.array([v.co[:] for v in ob.data.vertices])
tail_y, nose_y = bco[:, 1].min(), bco[:, 1].max()
uv_layer = ob.data.uv_layers.active
plate_tris = []
for poly in ob.data.polygons:
    c = sum((ob.data.vertices[i].co for i in poly.vertices), mathutils.Vector()) / len(poly.vertices)
    for spec in PLATES:
        near = (c.y < tail_y + spec['depth']) if spec['end'] == 'tail' else (c.y > nose_y - spec['depth'])
        if near and spec['z'][0] < c.z < spec['z'][1] and abs(c.x) < spec['x']:
            uvs = [uv_layer.data[li].uv[:] for li in poly.loop_indices]
            for i in range(1, len(uvs) - 1):
                plate_tris.append((uvs[0], uvs[i], uvs[i + 1]))
            break

img = None
for m in ob.data.materials:
    if not m or not m.use_nodes:
        continue
    for node in m.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            for link in node.outputs['Color'].links:
                if link.to_socket.name == 'Base Color':
                    img = node.image

if plate_tris and img:
    W, H = img.size
    px = np.array(img.pixels[:]).reshape(H, W, 4)
    mask = np.zeros((H, W), bool)
    # The UV islands of the plate are scattered, so a bounding box over them blanked a quarter of the
    # atlas. Rasterise each triangle instead and blank only what the plate actually covers.
    for tri in plate_tris:
        pts = np.array(tri) * [W, H]
        x0, y0 = np.floor(pts.min(0)).astype(int) - 1
        x1, y1 = np.ceil(pts.max(0)).astype(int) + 2
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        p0, p1, p2 = pts
        d = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
        if abs(d) < 1e-9:
            continue
        a_ = ((p1[1] - p2[1]) * (xx - p2[0]) + (p2[0] - p1[0]) * (yy - p2[1])) / d
        b_ = ((p2[1] - p0[1]) * (xx - p2[0]) + (p0[0] - p2[0]) * (yy - p2[1])) / d
        mask[y0:y1, x0:x1] |= (a_ >= -0.02) & (b_ >= -0.02) & (a_ + b_ <= 1.02)
    grown = mask.copy()
    for _ in range(3):                                   # a little margin for filtering at the edges
        grown[1:, :] |= mask[:-1, :]; grown[:-1, :] |= mask[1:, :]
        grown[:, 1:] |= mask[:, :-1]; grown[:, :-1] |= mask[:, 1:]
        mask = grown.copy()
    sel = px[mask][:, :3]
    if len(sel):
        # the region's own median, not its brightest quarter: that came out as a bright patch on the paint
        fill = np.median(sel, axis=0)
        px[mask, :3] = fill
        img.pixels[:] = px.reshape(-1).tolist()
        print(f'  plate: blanked {int(mask.sum())} px of {W * H} ({len(plate_tris)} triangles)')
# The photos carry their own light: the white backdrop behind the nose and the sky on the bonnet are
# projected into the texture as pale, desaturated patches that read as damage on the paint. Pull those back
# towards the colour around them. Only near-white, low-saturation pixels are touched, so the badges, the
# lights, the tyres and the glass are left alone.
if img:
    W, H = img.size
    px = np.array(img.pixels[:]).reshape(H, W, 4)
    rgb = px[..., :3]
    mxc = rgb.max(2)
    mnc = rgb.min(2)
    satp = np.where(mxc > 1e-6, (mxc - mnc) / np.maximum(mxc, 1e-6), 0.0)
    # A reflection of the sky on blue paint is bright AND still fairly blue, so a saturation cut alone
    # missed the worst of it on the roof and bonnet. Take anything very bright as well, whatever its hue.
    glare = ((mxc > 0.55) & (satp < 0.22)) | (mxc > 0.80)
    if glare.sum():
        k = 12
        blur = rgb.copy()
        for _ in range(3):                      # cheap box blur, a local estimate of the paint colour
            b = blur.copy()
            b[k:, :] = blur[:-k, :]
            b[:-k, :] += blur[k:, :]
            b[:, k:] += blur[:, :-k]
            b[:, :-k] += blur[:, k:]
            blur = b / 3.0
        px[glare, :3] = 0.25 * rgb[glare] + 0.75 * blur[glare]
        img.pixels[:] = px.reshape(-1).tolist()
        pct = 100.0 * glare.sum() / (W * H)
        print("  glare: softened " + str(int(glare.sum())) + " px (" + format(pct, ".1f") + " %)")

else:
    print(f'  plate: NOT blanked - {len(plate_tris)} triangles, image {"found" if img else "NOT found"}')

# No emissive tail lights from the texture: this car's lenses are smoked and the scan reproduced them
# dark. A scan of the whole 2048 atlas finds 1010 reddish pixels, scattered - there is nothing to light up.
# scirocco.js lays an additive glow over the lenses instead.

def decimate(o, target):
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris <= target:
        return
    bpy.context.view_layer.objects.active = o
    d = o.modifiers.new('dec', 'DECIMATE'); d.decimate_type = 'COLLAPSE'; d.ratio = target / tris
    bpy.ops.object.modifier_apply(modifier=d.name)
    print(f'  {o.name}: {tris} -> {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris')

decimate(ob, a.tris)
decimate(wob, a.wheel_tris)

for obj, path in ((ob, a.body), (wob, a.wheel)):
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True)
    print('  exported', path)
