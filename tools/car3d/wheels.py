"""Blender headless: measures the wheels in a generated car and reports them.

blender -b -P wheels.py -- <model.glb> [--yaw 180]

The game puts its wheels at a fixed wheelbase (2.578 m), track (1.57 m) and radius (0.323 m). A generated
body has its own, so scaling by overall length alone leaves the arches and the wheels out of step. This
finds the four wheel centres in the mesh and prints what the model's own figures are.
"""
import bpy, sys, math, argparse
import numpy as np
import mathutils

a = argparse.ArgumentParser()
a.add_argument('src')
a.add_argument('--up', default='Z')
a.add_argument('--yaw', type=float, default=0.0)
args = a.parse_args(sys.argv[sys.argv.index('--') + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.src)
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
if ob.parent:
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
ob.data.transform(ob.matrix_world); ob.matrix_world.identity()
if args.yaw:
    ob.data.transform(mathutils.Matrix.Rotation(math.radians(args.yaw), 4, 'Z'))

co = np.array([v.co[:] for v in ob.data.vertices])
mn, mx = co.min(0), co.max(0)
size = mx - mn
print(f'bbox  L(y) {size[1]:.3f}  W(x) {size[0]:.3f}  H(z) {size[2]:.3f}')
co = co - np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]])   # centre x/y, ground z

# Where a wheel meets the road is unambiguous: the contact patch. The arch flare sits at the same x as
# the tyre wall and confused an outermost-point search, so measure at the ground instead.
ground = co[co[:, 2] < size[2] * 0.045]
centres = {}
for sx in (-1, 1):
    for sy in (-1, 1):
        q = ground[(np.sign(ground[:, 0]) == sx) & (np.sign(ground[:, 1]) == sy)]
        if len(q) < 30:
            print(f'  quadrant x{sx:+d} y{sy:+d}: only {len(q)} ground points')
            continue
        centres[(sx, sy)] = (q[:, 0].mean(), q[:, 1].mean(), len(q))
        print(f'  contact x{sx:+d} y{sy:+d}: x {q[:, 0].mean():+.3f}  y {q[:, 1].mean():+.3f}  ({len(q)} pts)')

if len(centres) == 4:
    ys = [c[1] for c in centres.values()]
    xs = [abs(c[0]) for c in centres.values()]
    wb = (max(ys) - min(ys)) if max(ys) > 0 > min(ys) else 0
    # front and rear separately, so an uneven cut does not skew it
    front = np.mean([c[1] for k, c in centres.items() if k[1] > 0])
    rear = np.mean([c[1] for k, c in centres.items() if k[1] < 0])
    wb = front - rear
    track = 2 * float(np.mean(xs))
    print(f'model wheelbase {wb:.3f}  track {track:.3f}  (length {size[1]:.3f})')
    print(f'ratios: wheelbase/length {wb / size[1]:.3f} (real 0.606), track/length {track / size[1]:.3f} (real 0.369)')
    print(f'scale to the game: y {2.578 / wb:.4f}  x {1.570 / track:.4f}')
    print(f'that puts the length at {size[1] * 2.578 / wb:.3f} m (real 4.256) and the width at '
          f'{size[0] * 1.570 / track:.3f} m incl. mirrors')
