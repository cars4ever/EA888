"""Blender headless: splits the generated body into the materials the game drives.

blender -b -P materials.py -- --src body-final.glb --out body-mat.glb

The mesh comes out of Hunyuan3D as one surface. The game needs two parts of it separately: the paint and
the dark lower bodywork (bumpers, skirts, diffuser), split by height in real metres.

The tail lights are NOT cut out of this mesh. The generated recesses are too soft to separate cleanly by
position and normal (the attempt caught either half the hatch or two ragged blobs), so scirocco.js lays
crisp light shapes onto the surface with a raycast instead. Also prints where the exhaust mouths are, so
the flame anchors can be put on them.
"""
import bpy, bmesh, sys, argparse, pathlib
from mathutils import Vector

LENGTH, WIDTH, HEIGHT = 4.256, 1.810, 1.41
TRIM_Z = 0.36          # below this it is bumper, sill, diffuser: black
TAIL_Z = (0.70, 0.92)  # the tail light band on the rear
TAIL_DEPTH = 0.17      # how far forward from the tail the lights wrap
TAIL_X = 0.42          # the lights start this far out from the centre line
TAIL_FACING = -0.30    # and face backwards (-Y here), so the hatch above them is not caught

a = argparse.ArgumentParser()
a.add_argument('--src', required=True)
a.add_argument('--out', required=True)
args = a.parse_args(sys.argv[sys.argv.index('--') + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.src)
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
if ob.parent:
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
ob.data.transform(ob.matrix_world)
ob.matrix_world.identity()

mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for v in ob.data.vertices:
    for i in range(3):
        mn[i] = min(mn[i], v.co[i]); mx[i] = max(mx[i], v.co[i])
print(f'  body box: x {mn.x:.2f}..{mx.x:.2f}  y {mn.y:.2f}..{mx.y:.2f}  z {mn.z:.2f}..{mx.z:.2f}')
# after postprocess.py the nose is at +Y, so the tail is at min Y
tail_y = mn.y

def mat(name, base, rough, metal, emit=(0, 0, 0, 1), emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = base
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Emission Color'].default_value = emit
    b.inputs['Emission Strength'].default_value = emit_strength
    return m

# names are what scirocco.js looks for
paint = mat('paint', (0.024, 0.075, 0.70, 1), 0.28, 0.45)
trim = mat('trim', (0.012, 0.013, 0.015, 1), 0.60, 0.15)
ob.data.materials.clear()
for m in (paint, trim):
    ob.data.materials.append(m)

counts = [0, 0]
for poly in ob.data.polygons:
    c = sum((ob.data.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
    if c.z < TRIM_Z:
        poly.material_index = 1
    else:
        poly.material_index = 0
    counts[poly.material_index] += 1
print(f'  faces: paint {counts[0]}, trim {counts[1]}')

# A height threshold on a curved sill leaves a ragged boundary - single faces flip either side of it and
# the black band round the arches ends up looking chewed. Let every face take the majority of its
# neighbours a few times over; the line straightens and the speckle goes.
me = bmesh.new(); me.from_mesh(ob.data)
me.faces.ensure_lookup_table()
idx = [f.material_index for f in me.faces]
for _ in range(4):
    nxt = list(idx)
    for f in me.faces:
        nb = [idx[g.index] for e in f.edges for g in e.link_faces if g is not f]
        if not nb:
            continue
        ones = sum(nb)
        if ones * 2 > len(nb):
            nxt[f.index] = 1
        elif ones * 2 < len(nb):
            nxt[f.index] = 0
    idx = nxt
for f in me.faces:
    f.material_index = idx[f.index]
me.to_mesh(ob.data); me.free()
after = [0, 0]
for poly in ob.data.polygons:
    after[poly.material_index] += 1
print(f'  faces after smoothing: paint {after[0]}, trim {after[1]}')

# exhaust mouths: the lowest, rearmost geometry either side of the centreline
me = bmesh.new(); me.from_mesh(ob.data)
for side, sx in (('left', -1), ('right', 1)):
    cand = [v.co for v in me.verts if v.co.y < tail_y + 0.18 and v.co.z < 0.42
            and (v.co.x * sx) > 0.25 and (v.co.x * sx) < 0.80]
    if cand:
        cx = sum(c.x for c in cand) / len(cand)
        cy = min(c.y for c in cand)
        cz = sum(c.z for c in cand) / len(cand)
        print(f'  exhaust {side}: x={cx:.3f} y={cy:.3f} z={cz:.3f}')
me.free()

out = pathlib.Path(args.out)
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True)
print('exported', out)
