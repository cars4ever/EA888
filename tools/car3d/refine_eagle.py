"""Finish existing Eagle rear hardware; CPU Blender, no new reconstruction.
blender -b -t 4 -P tools/car3d/refine_eagle.py
"""
import bpy,bmesh,pathlib,shutil,math
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2];work=ROOT.parent/'work/cleetus/eagle';backup=ROOT.parent/'work/audit-1.31/eagle-backup';backup.mkdir(parents=True,exist_ok=True)
for name in ['master.blend','master.glb']:
 if not (backup/name).exists():shutil.copy2(work/name,backup/name)
for name in ['eagle.glb','eagle-low.glb']:
 if not (backup/name).exists():shutil.copy2(ROOT/'src/assets/models'/name,backup/name)
bpy.ops.wm.open_mainfile(filepath=str(backup/'master.blend'));body=bpy.data.objects['body']
def material(name,color,rough,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
fabric=material('parachute_fabric',(.035,.038,.042),.94);steel=material('rear_brace_steel',(.21,.23,.25),.4,.8);carbon=material('rear_race_panel',(.048,.053,.059),.65,.12)
# Remove the generated, folded parachute blobs before adding clean separate hardware.
bm=bmesh.new();bm.from_mesh(body.data)
removed=[f for f in bm.faces if f.calc_center_median().y < -2.25 and abs(f.calc_center_median().x)>.38 and .27<f.calc_center_median().z<1.0]
changed=len(removed);bmesh.ops.delete(bm,geom=removed,context='FACES')
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
def rod(name,a,b,r,mat):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=d.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
# Project the replacement center cover onto the actual rear face: suppress the generated false plate.
hit,p,n,_=body.ray_cast(Vector((0,-4,.64)),Vector((0,1,0)));assert hit
rear=p.y-.018
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,rear,.64));o=bpy.context.object;o.name='rear_center_race_panel';o.dimensions=(.70,.025,.24);o.data.materials.append(carbon);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for a,b in [((-.38,rear-.025,.51),(.38,rear-.025,.76)),((.38,rear-.025,.51),(-.38,rear-.025,.76))]:rod('rear_cross_brace',a,b,.012,steel)
# Close the rebuilt rear attachment plane rather than leaving exposed cut edges.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-2.27,.62));o=bpy.context.object;o.name='rear_hardware_mounting_panel';o.dimensions=(1.96,.10,.48);o.data.materials.append(carbon);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
# Compact twin fabric packs and crossed straps, visual dimensions estimated from supplied rear view.
for x in [-.74,.74]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-2.59,.64));o=bpy.context.object;o.name='parachute_pack';o.dimensions=(.48,.39,.43);o.data.materials.append(fabric);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bevel=o.modifiers.new('soft fabric corners','BEVEL');bevel.width=.055;bevel.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
 for dx in [-.13,.13]:rod('parachute_webbing',(x+dx,-2.795,.47),(x+dx,-2.795,.81),.014,carbon)
 rod('parachute_mount',(x,-2.33,.49),(x,-2.67,.44),.025,steel)
 rod('parachute_pull_loop',(x-.06,-2.8,.66),(x+.06,-2.8,.72),.008,steel)
bpy.ops.wm.save_as_mainfile(filepath=str(work/'master.blend'))
bpy.ops.export_scene.gltf(filepath=str(work/'master.glb'),export_format='GLB',export_yup=True)
for suffix,budget in [('',24000),('-low',10000)]:
 bpy.context.view_layer.objects.active=body;triangles=sum(len(p.vertices)-2 for p in body.data.polygons)
 if triangles>budget:
  m=body.modifiers.new('runtime budget','DECIMATE');m.ratio=budget/triangles;bpy.ops.object.modifier_apply(modifier=m.name)
 bpy.ops.export_scene.gltf(filepath=str(work/('audit2'+suffix+'.glb')),export_format='GLB',export_yup=True)
print('Eagle rear finish:',changed,'fabric faces; rear panel Y',rear)
