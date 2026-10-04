"""Blender headless: turns a raw Hunyuan3D GLB into the game-ready Scirocco body.

blender -b -P postprocess.py -- --src raw.glb --out body.glb [--yaw 90] [--pitch 0] [--dry]

Steps: keep the biggest shell, orient/scale to the real car, cut the wheels out,
mirror the left half onto the right, decimate, assign the game materials, export.
"""
import bpy, bmesh, sys, math, argparse, pathlib
import mathutils
from mathutils import Vector

# Real Scirocco Mk3 (see docs/HANDOFF.md): the car looks down -Z, +Y is up, x = 0 is the centreline.
LENGTH, WIDTH, HEIGHT, WHEELBASE, TRACK, WHEEL_R = 4.256, 1.810, 1.404, 2.578, 1.57, 0.323
TARGET_TRIS = 52000
PAINT = (0x1f / 255, 0x4f / 255, 0xd8 / 255, 1.0)


def argv():
    a = argparse.ArgumentParser()
    a.add_argument('--src', required=True)
    a.add_argument('--out', required=True)
    a.add_argument('--yaw', type=float, default=0.0)      # degrees about the up axis
    a.add_argument('--pitch', type=float, default=0.0)
    a.add_argument('--roll', type=float, default=0.0)
    a.add_argument('--up', default='Z', choices=['X', 'Y', 'Z'])  # the glTF importer already makes Blender Z-up
    a.add_argument('--tris', type=int, default=TARGET_TRIS)
    a.add_argument('--ground', type=float, default=0.16)  # cut height above the road
    a.add_argument('--fit', action='store_true', help='scale each axis to the real car, not just the length')
    a.add_argument('--keep-wheels', action='store_true')
    a.add_argument('--no-symmetry', action='store_true')
    return a.parse_args(sys.argv[sys.argv.index('--') + 1:])


def world_bounds(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    return mn, mx


def join_all():
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        sys.exit('no mesh in the GLB')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    # the glTF importer parents the mesh to an empty that carries the Y-up -> Z-up rotation;
    # bake that into the mesh so transform_apply below sees the whole transform
    if ob.parent:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    return ob


def keep_largest_shell(ob, min_frac=0.02):
    """Hunyuan hangs the ground/grass off the car as separate shells; drop them."""
    me = bmesh.new(); me.from_mesh(ob.data)
    shells, seen = [], set()
    for f in me.faces:
        if f.index in seen:
            continue
        stack, group = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            group.append(cur)
            for e in cur.edges:
                for nb in e.link_faces:
                    if nb.index not in seen:
                        seen.add(nb.index); stack.append(nb)
        shells.append(group)
    if len(shells) > 1:
        shells.sort(key=len, reverse=True)
        biggest = len(shells[0])
        drop = [f for g in shells[1:] if len(g) < biggest * min_frac for f in g]
        print(f'  shells: {len(shells)}, biggest {biggest} faces, dropping {len(drop)} loose faces')
        if drop:
            bmesh.ops.delete(me, geom=drop, context='FACES')
    me.to_mesh(ob.data); me.free()


def orient_and_scale(ob, a):
    """Bakes orientation and scale into the mesh data (operators silently no-op in -b)."""
    def bake(m):
        ob.data.transform(m)
        ob.matrix_world = mathutils.Matrix.Identity(4)
        bpy.context.view_layer.update()

    up = {'X': 0, 'Y': 1, 'Z': 2}[a.up]
    if up == 1:
        bake(mathutils.Matrix.Rotation(math.radians(90), 4, 'X'))
    elif up == 0:
        bake(mathutils.Matrix.Rotation(math.radians(90), 4, 'Y'))
    bake(mathutils.Matrix.Rotation(math.radians(a.yaw), 4, 'Z')
         @ mathutils.Matrix.Rotation(math.radians(a.pitch), 4, 'X')
         @ mathutils.Matrix.Rotation(math.radians(a.roll), 4, 'Y'))

    mn, mx = world_bounds([ob])
    size = mx - mn
    # Blender is Z-up here: the car runs along Y (length), X is width, Z is height
    if a.fit:
        # Length sets the overall scale, then the height is corrected on its own. A generated body can come
        # out several per cent tall, and on a car that reads immediately. Width deliberately follows the
        # length: forcing it to the production 1810 mm pulled the bodywork inside the track, and the
        # procedural wheels then stood proud of the arches.
        bake(mathutils.Matrix.Scale(LENGTH / size.y, 4))
        mn, mx = world_bounds([ob])
        bake(mathutils.Matrix.Scale(HEIGHT / (mx.z - mn.z), 4, mathutils.Vector((0, 0, 1))))
        print(f'  fit: height {mx.z - mn.z:.3f} -> {HEIGHT:.3f} m, width left to follow the length')
    else:
        bake(mathutils.Matrix.Scale(LENGTH / size.y, 4))
    mn, mx = world_bounds([ob])
    bake(mathutils.Matrix.Translation((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))
    mn, mx = world_bounds([ob])
    print(f'  size after scaling: L {mx.y-mn.y:.3f} W {mx.x-mn.x:.3f} (incl. mirrors) H {mx.z-mn.z:.3f} m'
          f'  (real {LENGTH} x {WIDTH} x {HEIGHT})')
    return mx - mn


def cut_wheels(ob):
    """Deletes everything inside the four wheel cylinders; the game keeps its own wheels."""
    me = bmesh.new(); me.from_mesh(ob.data)
    centres = [(sx * TRACK / 2, sy * WHEELBASE / 2) for sx in (-1, 1) for sy in (-1, 1)]
    doomed = []
    for v in me.verts:
        for cx, cy in centres:
            # a slightly generous cylinder about the axle, but never above the arch
            if abs(v.co.x - cx) < 0.42 and (v.co.y - cy) ** 2 + (v.co.z - WHEEL_R) ** 2 < (WHEEL_R * 0.94) ** 2:
                doomed.append(v); break
    print(f'  wheels: removing {len(doomed)} verts')
    bmesh.ops.delete(me, geom=doomed, context='VERTS')
    me.to_mesh(ob.data); me.free()


def clip_ground(ob, z_min=0.10):
    """Rembg leaves a strip of grass/tarmac welded to the sills; cut the model off above it."""
    me = bmesh.new(); me.from_mesh(ob.data)
    res = bmesh.ops.bisect_plane(me, geom=list(me.verts) + list(me.edges) + list(me.faces),
                                 plane_co=(0, 0, z_min), plane_no=(0, 0, 1),
                                 clear_inner=True, clear_outer=False)
    # the grass/tarmac rembg leaves behind is a thin horizontal sheet welded to the sills:
    # drop near-horizontal faces low down and wider than the body before closing the rest
    flat = [f for f in me.faces
            if abs(f.normal.z) > 0.80 and f.calc_center_median().z < 0.30
            and abs(f.calc_center_median().x) > 0.74]
    if flat:
        bmesh.ops.delete(me, geom=flat, context='FACES')
        print(f'  ground: dropped {len(flat)} flat skirt faces')
    border = [e for e in me.edges if len(e.link_faces) == 1]
    bmesh.ops.holes_fill(me, edges=border, sides=6)
    me.to_mesh(ob.data); me.free()
    print(f'  ground: clipped below z = {z_min} m')


def symmetrise(ob):
    """Mirrors the better-lit left half onto the right, cut exactly on the centreline."""
    me = bmesh.new(); me.from_mesh(ob.data)
    bmesh.ops.bisect_plane(me, geom=list(me.verts) + list(me.edges) + list(me.faces),
                           plane_co=(0, 0, 0), plane_no=(1, 0, 0),
                           clear_inner=False, clear_outer=True)
    me.to_mesh(ob.data); me.free()
    m = ob.modifiers.new('mirror', 'MIRROR')
    m.use_axis = (True, False, False)
    m.use_mirror_merge = True
    m.merge_threshold = 0.0015
    bpy.ops.object.modifier_apply(modifier=m.name)
    # the apply can no-op in background mode; fall back to a bmesh mirror
    mn, mx = world_bounds([ob])
    if mx.x < 0.05:
        me = bmesh.new(); me.from_mesh(ob.data)
        geom = bmesh.ops.duplicate(me, geom=list(me.verts) + list(me.edges) + list(me.faces))['geom']
        bmesh.ops.mirror(me, geom=[g for g in geom if isinstance(g, bmesh.types.BMVert)], axis='X')
        bmesh.ops.recalc_face_normals(me, faces=me.faces)
        bmesh.ops.remove_doubles(me, verts=me.verts, dist=0.0015)
        me.to_mesh(ob.data); me.free()
        print('  symmetry: bmesh mirror (modifier_apply was a no-op)')


def decimate(ob, target):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target:
        print(f'  decimate: {tris} tris already under {target}')
        return
    d = ob.modifiers.new('dec', 'DECIMATE')
    d.decimate_type = 'COLLAPSE'
    d.ratio = target / tris
    bpy.ops.object.modifier_apply(modifier=d.name)
    print(f'  decimate: {tris} -> {sum(len(p.vertices) - 2 for p in ob.data.polygons)} tris')


def main():
    a = argv()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=a.src)
    ob = join_all()
    bpy.context.view_layer.objects.active = ob
    print('imported', ob.name, len(ob.data.polygons), 'faces')

    keep_largest_shell(ob)
    orient_and_scale(ob, a)
    clip_ground(ob, a.ground)
    if not a.keep_wheels:
        cut_wheels(ob)
    keep_largest_shell(ob, min_frac=0.06)   # the sill debris comes loose once the wheels are gone
    if not a.no_symmetry:
        symmetrise(ob)
    decimate(ob, a.tris)

    out = pathlib.Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True)
    print('exported', out)


if __name__ == '__main__':
    main()
