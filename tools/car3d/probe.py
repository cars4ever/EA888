import bpy, sys
from mathutils import Vector
src = sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
n=0
for o in bpy.context.scene.objects:
    if o.type!='MESH': continue
    n += sum(len(p.vertices)-2 for p in o.data.polygons)
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        for i in range(3):
            mn[i]=min(mn[i],w[i]); mx[i]=max(mx[i],w[i])
s = mx-mn
print(f'TRIS {n}')
print(f'BBOX x {s.x:.3f}  y {s.y:.3f}  z {s.z:.3f}   (blender Z-up after gltf import)')
print(f'min {mn.x:.3f} {mn.y:.3f} {mn.z:.3f}  max {mx.x:.3f} {mx.y:.3f} {mx.z:.3f}')
