"""Targeted finish of the existing Jackstand master; no reconstruction or new car.
Run: blender -b ../work/cleetus/crc12_jackstand_240/master.blend -t 4 -P tools/car3d/refine_jackstand.py
Uses the original body raycast to seat rounded lens housings. Keeps window artwork.
"""
import bpy,math,pathlib,shutil
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
work=ROOT.parent/'work/cleetus/crc12_jackstand_240'
backup=ROOT.parent/'work/audit-1.30/baseline/jackstand'
backup.mkdir(parents=True,exist_ok=True)
for name in ['master.blend','master.glb']:
 if not (backup/name).exists():shutil.copy2(work/name,backup/name)
for name in ['crc12_jackstand_240.glb','crc12_jackstand_240-low.glb']:
 if not (backup/name).exists():shutil.copy2(ROOT/'src/assets/models'/name,backup/name)
bpy.ops.wm.open_mainfile(filepath=str(backup/'master.blend'))
body=bpy.data.objects['body']
def material(name,color,rough,metal=0):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 return m
housing=material('tail_lens_housing',(.018,.02,.023),.46,.15)
red=material('lamp_tail_lens',(.26,.006,.009),.23,.05)
amber=material('lamp_indicator_lens',(.42,.09,.002),.25,.05)
for o in list(bpy.data.objects):
 if o.name.startswith(('taillight','indicator','tail_housing','lens_ridge')):bpy.data.objects.remove(o,do_unlink=True)
def panel(name,cx,cz,w,h,offset,mat):
 # Rounded perimeter is projected onto the actual generated rear panel.
 verts=[];faces=[];r=min(.025,h*.28);nx=2 if name=='lens_ridge' else 16;nz=4
 for iz in range(nz+1):
  z=cz-h/2+h*iz/nz
  dz=max(0,abs(z-cz)-(h/2-r))
  half=w/2-r+math.sqrt(max(0,r*r-dz*dz))
  for ix in range(nx+1):
   xx=cx-half+2*half*ix/nx
   hit,p,n,_=body.ray_cast(Vector((xx,-4,z)),Vector((0,1,0)))
   if not hit:raise ValueError('lamp projection missed')
   verts.append((xx,p.y-offset,z))
 for iz in range(nz):
  for ix in range(nx):
   j=iz*(nx+1)+ix;faces.append((j,j+1,j+nx+2,j+nx+1))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(mat)
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 m=ob.modifiers.new('lens thickness','SOLIDIFY');m.thickness=.008;bpy.ops.object.modifier_apply(modifier=m.name)
 ob.select_set(False)
 return ob
for x in [-.54,.54]:
 panel('tail_housing',x,.865,.456,.188,.012,housing)
 panel('taillight',x,.825,.428,.076,.024,red)
 panel('indicator',x,.915,.428,.06,.024,amber)
 # Separate vertical optical facets catch showroom light without emissive blocks.
 for j in range(1,15):
  xx=x-.21+j*.028
  panel('lens_ridge',xx,.825,.003,.058,.026,red)
# Photo stays recognizable but reads as a printed rear-window panel, not a lightbox.
m=bpy.data.materials.get('rear_window_art')
if m:
 bs=m.node_tree.nodes.get('Principled BSDF');tex=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE')
 mix=m.node_tree.nodes.get('Printed tint') or m.node_tree.nodes.new('ShaderNodeMixRGB');mix.name='Printed tint';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.48,.51,.55,1)
 m.node_tree.links.new(tex.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.38
bpy.ops.wm.save_as_mainfile(filepath=str(work/'master.blend'))
bpy.ops.export_scene.gltf(filepath=str(work/'master.glb'),export_format='GLB',export_yup=True)
for suffix,budget in [('',24000),('-low',10000)]:
 bpy.context.view_layer.objects.active=body
 triangles=sum(len(p.vertices)-2 for p in body.data.polygons)
 if triangles>budget:
  m=body.modifiers.new('runtime budget','DECIMATE');m.ratio=budget/triangles;bpy.ops.object.modifier_apply(modifier=m.name)
 bpy.ops.export_scene.gltf(filepath=str(work/('audit'+suffix+'.glb')),export_format='GLB',export_yup=True)
# glTF's PBR baseColorFactor is explicit: Blender's texture Multiply node is not reliably exported.
import struct,json
for path in [work/'master.glb',work/'audit.glb',work/'audit-low.glb']:
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);tail=raw[20+n:]
 for m in doc.get('materials',[]):
  if m.get('name')=='rear_window_art':m.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[.48,.51,.55,1]
 head=json.dumps(doc,separators=(',',':')).encode();head+=b' '*((-len(head))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(head)+len(tail))+struct.pack('<II',len(head),0x4e4f534a)+head+tail)
print('Jackstand targeted rear finish exported, master and old assets backed up.')
