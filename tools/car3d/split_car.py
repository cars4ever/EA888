"""Blender headless: fits a generated car to the game's chassis and splits its wheels off.

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
ap.add_argument('--tris', type=int, default=40000)
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
vmap = {}
for v in wheel_verts:
    if v.co.x < 0 and v.co.y > 0:
        vmap[v] = wm.verts.new(v.co)
wm.verts.index_update()
for f in me.faces:
    vs = [vmap[v] for v in f.verts if v in vmap]
    if len(vs) == len(f.verts) and len(vs) >= 3:
        try:
            wm.faces.new(vs)
        except ValueError:
            pass
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

# Materials. The body gets paint and the dark lower bodywork; the wheel gets tyre and rim, split on the
# distance from the axle (the tyre is the outer ~22 % of the radius). scirocco.js looks these names up and
# swaps in its own materials, so the paint colour, the environment map and the brake light keep working.
def mat(name, base, rough, metal):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = base
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m

paint = mat('paint', (0.024, 0.075, 0.70, 1), 0.28, 0.45)
trim = mat('trim', (0.012, 0.013, 0.015, 1), 0.60, 0.15)
ob.data.materials.clear()
ob.data.materials.append(paint); ob.data.materials.append(trim)
TRIM_Z = 0.36
for poly in ob.data.polygons:
    c = sum((ob.data.vertices[i].co for i in poly.vertices), mathutils.Vector()) / len(poly.vertices)
    poly.material_index = 1 if c.z < TRIM_Z else 0

tyre = mat('tyre', (0.014, 0.014, 0.016, 1), 0.90, 0.0)
rim = mat('rim', (0.30, 0.26, 0.58, 1), 0.22, 0.90)
wheel_mesh.materials.clear()
wheel_mesh.materials.append(tyre); wheel_mesh.materials.append(rim)
for poly in wheel_mesh.polygons:
    c = sum((wheel_mesh.vertices[i].co for i in poly.vertices), mathutils.Vector()) / len(poly.vertices)
    poly.material_index = 0 if math.hypot(c.y, c.z) > WHEEL_R * 0.70 else 1   # 235/40R18: the tyre is the outer 30 %
print(f'  wheel materials: tyre {sum(1 for p in wheel_mesh.polygons if p.material_index == 0)}, '
      f'rim {sum(1 for p in wheel_mesh.polygons if p.material_index == 1)}')

# A height threshold on a curved sill leaves a ragged boundary: single faces flip either side of it and the
# black band round the arches looks chewed. Let every face take the majority of its neighbours a few times.
bm2 = bmesh.new(); bm2.from_mesh(ob.data)
bm2.faces.ensure_lookup_table()
idx = [f.material_index for f in bm2.faces]
for _ in range(5):
    nxt = list(idx)
    for f in bm2.faces:
        nb = [idx[g.index] for e in f.edges for g in e.link_faces if g is not f]
        if not nb:
            continue
        ones = sum(nb)
        if ones * 2 > len(nb):
            nxt[f.index] = 1
        elif ones * 2 < len(nb):
            nxt[f.index] = 0
    if nxt == idx:
        break
    idx = nxt
for f in bm2.faces:
    f.material_index = idx[f.index]
bm2.to_mesh(ob.data); bm2.free()

# the exhaust mouths, for the flame anchors in scirocco.js (game axes: tail at +z, up is +y)
bco = np.array([v.co[:] for v in ob.data.vertices])
tail_y = bco[:, 1].min()
for side, sx in (('left', -1), ('right', 1)):
    q = bco[(bco[:, 1] < tail_y + 0.20) & (bco[:, 2] < 0.45)
            & (bco[:, 0] * sx > 0.22) & (bco[:, 0] * sx < 0.85)]
    if len(q):
        print(f'  exhaust {side}: x {q[:, 0].mean():+.3f}  y(game z) {-q[:, 1].min():.3f}  z(game y) {q[:, 2].mean():.3f}')


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
