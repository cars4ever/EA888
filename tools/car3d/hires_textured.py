"""Blender headless: the high-resolution scan, wearing the texture off the low-resolution one.

blender -b -P hires_textured.py -- --white white.glb --tex tex.glb --body body.glb --wheel wheel.glb

Hunyuan's texture stage remeshes to 40k triangles before it lays the UVs down, and once the wheels and the
road slab are cut out of that, the body is about 21k - too few for a car, which is why the silhouette goes
polygonal and the panels read as dough. The shape pass has no such limit: the same run gives 1.2M.

So take the geometry from the white mesh and the UVs from the textured one. Both come out of the same run
in the same space, so once each is fitted to the game's chassis the surfaces sit within a millimetre of one
another and Blender's Data Transfer can carry the UVs across by projection.
"""
import bpy, bmesh, sys, math, argparse, pathlib
import numpy as np
import mathutils

WHEELBASE, TRACK, WHEEL_R, HEIGHT = 2.578, 1.57, 0.323, 1.404

ap = argparse.ArgumentParser()
ap.add_argument('--white', required=True)
ap.add_argument('--tex', required=True)
ap.add_argument('--body', required=True)
ap.add_argument('--yaw', type=float, default=180.0)
ap.add_argument('--tris', type=int, default=48000)
ap.add_argument('--ground', type=float, default=0.075)
ap.add_argument('--tex-fitted', action='store_true',
                help='the texture source has already been through textured_car.py (fitted, plate blanked)')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path, name, yaw=None):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    ob = next(o for o in set(bpy.context.scene.objects) - before if o.type == 'MESH')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if ob.parent:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    ob.data.transform(ob.matrix_world)
    ob.matrix_world.identity()
    ob.data.transform(mathutils.Matrix.Rotation(math.radians(a.yaw if yaw is None else yaw), 4, 'Z'))
    ob.name = name
    return ob


def fit(ob):
    """Same chassis fit for both, so the two surfaces land on top of each other."""
    co = np.array([v.co[:] for v in ob.data.vertices])
    mn, mx = co.min(0), co.max(0)
    ob.data.transform(mathutils.Matrix.Translation(
        (-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2])))
    co = np.array([v.co[:] for v in ob.data.vertices])
    size = co.max(0) - co.min(0)
    ground = co[co[:, 2] < size[2] * 0.045]
    patch = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            q = ground[(np.sign(ground[:, 0]) == sx) & (np.sign(ground[:, 1]) == sy)]
            if len(q) < 30:
                sys.exit(f'{ob.name}: no contact patch at x{sx:+d} y{sy:+d}')
            patch[(sx, sy)] = (q[:, 0].mean(), q[:, 1].mean())
    front = np.mean([p[1] for k, p in patch.items() if k[1] > 0])
    rear = np.mean([p[1] for k, p in patch.items() if k[1] < 0])
    sx_ = TRACK / (2 * float(np.mean([abs(p[0]) for p in patch.values()])))
    sy_ = WHEELBASE / (front - rear)
    sz_ = HEIGHT / size[2]
    ob.data.transform(mathutils.Matrix.Diagonal((sx_, sy_, sz_, 1.0)).to_4x4())
    co = np.array([v.co[:] for v in ob.data.vertices])
    mn, mx = co.min(0), co.max(0)
    ob.data.transform(mathutils.Matrix.Translation(
        (-(mn[0] + mx[0]) / 2, -(front + rear) / 2 * sy_, -mn[2])))
    co = np.array([v.co[:] for v in ob.data.vertices])
    print(f'  {ob.name}: fitted L {np.ptp(co[:,1]):.3f} W {np.ptp(co[:,0]):.3f} H {np.ptp(co[:,2]):.3f}')


white = load(a.white, 'white')
# a source that has already been through textured_car.py comes back out of its own export already
# oriented; yawing it again would put the UVs on back to front
tex = load(a.tex, 'tex', yaw=0.0 if a.tex_fitted else None)
fit(white)
if a.tex_fitted:
    co = np.array([v.co[:] for v in tex.data.vertices])
    print(f'  tex: already fitted, L {np.ptp(co[:,1]):.3f} W {np.ptp(co[:,0]):.3f} H {np.ptp(co[:,2]):.3f}')
else:
    fit(tex)

tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
print(f'  white {tris(white)} tris, tex {tris(tex)} tris')

# ---- cut the wheels and the road slab out of the high-res body ------------------------------------
me = bmesh.new()
me.from_mesh(white.data)
doomed = []
for v in me.verts:
    for qx in (-1, 1):
        for qy in (-1, 1):
            if (abs(v.co.x - qx * TRACK / 2) < 0.14
                    and (v.co.y - qy * WHEELBASE / 2) ** 2 + (v.co.z - WHEEL_R) ** 2 < (WHEEL_R * 1.06) ** 2):
                doomed.append(v)
                break
        else:
            continue
        break
bmesh.ops.delete(me, geom=doomed, context='VERTS')
flat = [f for f in me.faces if abs(f.normal.z) > 0.80 and f.calc_center_median().z < 0.22]
if flat:
    bmesh.ops.delete(me, geom=flat, context='FACES')
bmesh.ops.bisect_plane(me, geom=list(me.verts) + list(me.edges) + list(me.faces),
                       plane_co=(0, 0, a.ground), plane_no=(0, 0, 1),
                       clear_inner=True, clear_outer=False)
bmesh.ops.holes_fill(me, edges=[e for e in me.edges if len(e.link_faces) == 1], sides=6)
me.to_mesh(white.data)
me.free()
print(f'  wheels and road removed: {tris(white)} tris')

# ---- thin it: relax the scan noise, dissolve what is flat, then collapse ---------------------------
bpy.ops.object.select_all(action='DESELECT')
white.select_set(True)
bpy.context.view_layer.objects.active = white

m = white.modifiers.new('smooth', 'CORRECTIVE_SMOOTH')
m.iterations = 14
m.factor = 0.6
m.smooth_type = 'LENGTH_WEIGHTED'
m.use_only_smooth = True
bpy.ops.object.modifier_apply(modifier=m.name)

d = white.modifiers.new('dec', 'DECIMATE')
d.decimate_type = 'COLLAPSE'
d.ratio = min(1.0, a.tris / tris(white))
d.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=d.name)
print(f'  smoothed and collapsed: {tris(white)} tris')

# ---- carry the UVs across from the textured mesh ---------------------------------------------------
if not white.data.uv_layers:
    white.data.uv_layers.new(name='UVMap')
dt = white.modifiers.new('uv', 'DATA_TRANSFER')
dt.object = tex
dt.use_loop_data = True
dt.data_types_loops = {'UV'}
dt.loop_mapping = 'POLYINTERP_NEAREST'      # nearest face, interpolated: the two surfaces are millimetres apart
bpy.ops.object.modifier_apply(modifier=dt.name)
print('  UVs transferred from the textured mesh')

white.data.materials.clear()
for mat in tex.data.materials:
    white.data.materials.append(mat)

for p in white.data.polygons:
    p.use_smooth = True
try:
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
except AttributeError:
    pass

out = pathlib.Path(a.body)
bpy.ops.object.select_all(action='DESELECT')
white.select_set(True)
bpy.context.view_layer.objects.active = white
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True)
print('  exported', out)
