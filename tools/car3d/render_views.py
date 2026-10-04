"""Blender headless: renders a GLB from front, side, rear and 3/4 for review.
   blender -b -P render_views.py -- <model.glb> <outdir> [prefix]"""
import bpy, sys, math, pathlib

argv = sys.argv[sys.argv.index('--') + 1:]
src, outdir = pathlib.Path(argv[0]), pathlib.Path(argv[1])
prefix = argv[2] if len(argv) > 2 else src.stem
outdir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

# normalise: centre on the origin, longest axis to 4.256 m (Scirocco length)
import mathutils
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
size = mx - mn; centre = (mx + mn) / 2
scale = 4.256 / max(size)
for o in meshes:
    o.location -= centre
    o.scale *= scale
    o.location *= scale
bpy.context.view_layer.update()

# neutral grey material so the geometry reads, not the texture
mat = bpy.data.materials.new('review')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.55, 0.55, 0.58, 1)
bsdf.inputs['Roughness'].default_value = 0.45
for o in meshes:
    o.data.materials.clear(); o.data.materials.append(mat)

world = bpy.data.worlds.new('w'); bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.06, 0.07, 0.09, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.2

for name, loc, rot in [
    ('key', (5, -6, 5), None), ('fill', (-6, -4, 3), None), ('rim', (0, 7, 4), None)]:
    l = bpy.data.lights.new(name, 'AREA'); l.energy = 2500; l.size = 6
    ob = bpy.data.objects.new(name, l); ob.location = loc
    ob.rotation_euler = (mathutils.Vector((0, 0, 0)) - mathutils.Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.collection.objects.link(ob)

cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 70
cam = bpy.data.objects.new('cam', cam_data)
bpy.context.collection.objects.link(cam); bpy.context.scene.camera = cam

sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1000, 640
sc.render.film_transparent = False

R = 9.0
# azimuth 0 looks at the car's tail (the nose points away down -Y after the glTF round trip)
VIEWS = {'rear': (0, 8), 'front': (180, 8), 'side': (90, 4), 'rear34': (35, 12), 'front34': (215, 12), 'top': (90, 70)}
for name, (az, el) in VIEWS.items():
    a, e = math.radians(az), math.radians(el)
    cam.location = (R * math.cos(e) * math.sin(a), -R * math.cos(e) * math.cos(a), R * math.sin(e) + 0.4)
    cam.rotation_euler = (mathutils.Vector((0, 0, 0.2)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = str(outdir / f'{prefix}-{name}.png')
    bpy.ops.render.render(write_still=True)
print('rendered to', outdir)
