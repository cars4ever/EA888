"""Prints where the tail (or nose) surface is recessed: that is where the lights sit.
   blender -b -P probe_tail.py -- <body.glb> [nose]"""
import bpy, sys, numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src = argv[0]
end = argv[1] if len(argv) > 1 else 'tail'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
if ob.parent:
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
ob.data.transform(ob.matrix_world); ob.matrix_world.identity()
dg = bpy.context.evaluated_depsgraph_get()

# after the glTF round trip the car faces +Y again; the tail is at min Y
ys = [v.co.y for v in ob.data.vertices]
tail_y = min(ys) if end == 'tail' else max(ys)
step = 1.0 if end == 'tail' else -1.0        # the ray travels into the car
print(f'{end}_y={tail_y:.3f}')

XS = np.linspace(0.02, 1.00, 25)      # half width, out to the rear corner
ZS = np.linspace(0.45, 1.15, 15)      # bumper up to the hatch
depth = np.full((len(ZS), len(XS)), np.nan)
for iz, z in enumerate(ZS):
    for ix, x in enumerate(XS):
        origin = Vector((x, tail_y - 1.2 * step, z))
        hit, loc, *_ = ob.ray_cast(origin, Vector((0, step, 0)), depsgraph=dg)
        if hit:
            depth[iz, ix] = (loc.y - tail_y) * step   # 0 = the outermost point, larger = recessed

print('    x:', ' '.join(f'{x:4.2f}' for x in XS))
for iz in range(len(ZS) - 1, -1, -1):
    row = depth[iz]
    cells = []
    for d in row:
        cells.append('  . ' if np.isnan(d) else f'{d*100:4.0f}')
    print(f'z={ZS[iz]:4.2f}', ' '.join(cells))
print('(values are cm behind->forward from the rearmost point; a local maximum is a recess = the light)')
