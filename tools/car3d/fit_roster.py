"""Blender: fit the generated car to the existing sim wheelbase, remove baked tyres,
rebuild round independent wheels and fragile hardware, preserve PBR, export master/runtime.
blender -b -P tools/car3d/fit_roster.py -- --car ID --work ../work/cleetus --config ../work/cleetus/visual-config.json
"""
import argparse, json, math, pathlib, sys
import bpy, bmesh, numpy as np
from mathutils import Matrix, Vector

p=argparse.ArgumentParser();p.add_argument('--car',required=True);p.add_argument('--work',type=pathlib.Path,required=True);p.add_argument('--config',type=pathlib.Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]); cfg=json.loads(a.config.read_text())[a.car]; work=a.work/a.car
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(work/'painted.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in objects:
    o.data.transform(o.matrix_world);o.matrix_world.identity();o.parent=None
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join(); body=bpy.context.object;body.name='body'
body.data.transform(Matrix.Rotation(math.pi,4,'Z')) # generated front is -Y, runtime front is glTF -Z
def co():return np.array([v.co[:] for v in body.data.vertices])
xyz=co(); mn=xyz.min(0);mx=xyz.max(0)
body.data.transform(Matrix.Translation((-(mx[0]+mn[0])/2,-(mx[1]+mn[1])/2,-mn[2])))
xyz=co(); height=np.ptp(xyz[:,2]);ground=xyz[xyz[:,2]<height*.06]
patch={}
for sx in (-1,1):
 for sy in (-1,1):
  q=ground[(np.sign(ground[:,0])==sx)&(np.sign(ground[:,1])==sy)]
  if len(q)<5:raise RuntimeError('No wheel contact patch: manual inspection required')
  patch[(sx,sy)]=np.median(q,axis=0)
front=np.mean([v[1] for k,v in patch.items() if k[1]>0]); rear=np.mean([v[1] for k,v in patch.items() if k[1]<0])
wb=cfg['dimensions']['wheelbase'];track=cfg['dimensions']['track'];k=wb/(front-rear)
track_raw=np.mean([abs(v[0]) for v in patch.values()])*2
body.data.transform(Matrix.Diagonal((track/track_raw,k,k,1)))
body.data.transform(Matrix.Translation((0,-(front+rear)*k/2,0)))
# Estimated visual roof height, independent of physics; generated meshes tended to overstate it.
visual_height={'mcflurry':1.38,'mullet':1.42,'lumberjack':1.48}.get(a.car)
if visual_height: body.data.transform(Matrix.Diagonal((1,1,visual_height/co()[:,2].max(),1)))
xyz=co(); front_y=wb/2;rear_y=-wb/2
print('MEASURED',json.dumps({'patches':{str(i):v.tolist() for i,v in patch.items()},'scaleLength':k,'trackScale':track/track_raw,'fittedBounds':[xyz.min(0).tolist(),xyz.max(0).tolist()]}))
# Surface materials retain the generated albedo/metallic/roughness textures. Used paint is deliberately
# less reflective than the neural model's polished output. Packed glTF channels: G=roughness, B=metalness.
if a.car in ('crc12_jackstand_240','lumberjack'):
 for image in bpy.data.images:
  if not image.has_data or image.colorspace_settings.name=='sRGB':continue
  pixels=np.array(image.pixels[:]).reshape((-1,4));pixels[:,1]=np.maximum(pixels[:,1],.62);pixels[:,2]=np.minimum(pixels[:,2],.25)
  image.pixels=pixels.ravel();image.pack()
# Weld UV-seam duplicates before connected-component cleanup; UVs remain per face corner.
# Without this, small UV islands would be mistaken for floating fragments and create holes.
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
removed=[]
# Boolean cylinders give clean circular apertures rather than deleting whole boundary triangles.
for y,r in [(front_y,cfg['wheels']['radii'][0]),(rear_y,cfg['wheels']['radii'][2])]:
 for side in (-1,1):
  bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r+.035,depth=1.1,
    location=(side*(track/2+.25),y,r),rotation=(0,math.pi/2,0))
  cutter=bpy.context.object
  removed.extend(v.index for v in body.data.vertices if side*v.co.x>track/2-.30 and (v.co.y-y)**2+(v.co.z-r)**2<(r+.035)**2)
  bpy.context.view_layer.objects.active=body
  mod=body.modifiers.new('remove_baked_wheel','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
  bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
bm=bmesh.new();bm.from_mesh(body.data)
# Remove only small disconnected reconstruction fragments after tyre separation.
bm.verts.ensure_lookup_table();seen=set(); islands=[]
for v in bm.verts:
 if v in seen:continue
 stack=[v];group=[];seen.add(v)
 while stack:
  cur=stack.pop();group.append(cur)
  for e in cur.link_edges:
   n=e.other_vert(cur)
   if n not in seen:seen.add(n);stack.append(n)
 islands.append(group)
small=[v for group in islands if len(group)<35 for v in group]
bmesh.ops.delete(bm,geom=small,context='VERTS');bm.to_mesh(body.data);bm.free()
for face in body.data.polygons:face.use_smooth=True

def material(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough;return m
rubber=material('rubber',(.018,.021,.025),0,.93);alloy=material('metal',(.28,.30,.33),.85,.32)
black=material('wheel_black',(.037,.041,.047),.65,.42);glass=material('glass',(.022,.043,.054),.35,.18)
lamp=material('lamp_head',(.82,.9,1),.1,.22);tail=material('lamp_tail',(.38,.008,.004),.2,.28)
def cube(name,loc,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);return o
def cylinder(name,loc,radius,depth,mat,axis='X',vertices=40):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc,rotation=(0,math.pi/2,0) if axis=='X' else (math.pi/2,0,0) if axis=='Y' else (0,0,0));o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 return o
def rod(name,start,end,r,mat):
 mid=(Vector(start)+Vector(end))/2;delta=Vector(end)-Vector(start)
 o=cylinder(name,mid,r,delta.length,mat,axis='Z',vertices=12);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o

# Circular replacement tyres: rounded shoulders, genuine thickness, separate rim/spokes/rotor.
for i,name in enumerate(cfg['wheels']['names']):
 side=-1 if i%2==0 else 1; y=front_y if i<2 else rear_y;r=cfg['wheels']['radii'][i]
 width=.16 if i<2 else .315;center=Vector((side*track/2,y,r));parts=[]
 rings=[(-width/2,.78*r),(-width*.48,.91*r),(-width*.36,r),(width*.36,r),(width*.48,.91*r),(width/2,.78*r)]
 verts=[(x,rad*math.sin(j*math.tau/64),rad*math.cos(j*math.tau/64)) for x,rad in rings for j in range(64)]
 faces=[]
 for q in range(len(rings)-1):
  for j in range(64):faces.append((q*64+j,q*64+(j+1)%64,(q+1)*64+(j+1)%64,(q+1)*64+j))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(rubber)
 wheel=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(wheel);wheel.location=center;parts.append(wheel)
 for f in me.polygons:f.use_smooth=True
 rimr=r*.59;rim=black if a.car in ('crc12_jackstand_240','lumberjack','eagle') else alloy
 parts.append(cylinder('rim_barrel',center,rimr,width*.94,rim))
 outer=center+Vector((side*width*.52,0,0));parts.append(cylinder('hub',outer,r*.13,.04,alloy))
 for j in range(5 if a.car=='crc12_jackstand_240' else 10):
  angle=j*math.tau/(5 if a.car=='crc12_jackstand_240' else 10)
  start=outer+Vector((0,math.sin(angle)*r*.15,math.cos(angle)*r*.15));end=outer+Vector((0,math.sin(angle)*rimr*.95,math.cos(angle)*rimr*.95))
  parts.append(rod('spoke',start,end,.022,rim))
 # Join only rotating components, preserving axle origin.
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=wheel;bpy.ops.object.join();wheel.name=name
 # Fixed caliper is a separate body component.
 cube('caliper_'+name,center+Vector((-side*.05,.10,.10)),(.05,.09,.14),black)

# Refine fragile, defining details using geometric parts, never another vehicle shell.
if a.car=='crc12_jackstand_240':
 # Keep the reconstructed popup housings and inlet volume. Attach lenses to the housings only,
 # instead of adding a second intake/headlight shape on top of the original reconstruction.
 for x in (-.60,.60):
  cube('headlight_lens',(x,front_y+.64,.75),(.25,.012,.12),lamp)
 # The unseen rear in single-image Paint is generic. Restore the supplied, identifiable window art
 # by mapping a measured source quadrilateral onto the curved rear window (no invented view).
 reference=a.work/'references'/'Cleetus_Hunyuan3D_5_Cars'/cfg['reference']/(cfg['reference']+'_rear_3q.png')
 decal=material('rear_window_art',(1,1,1),0,.8);nodes=decal.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(reference));tex.image.pack()
 decal.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
 uv_corners=np.array([[555/1100,1-253/825],[739/1100,1-237/825],[900/1100,1-333/825],[625/1100,1-372/825]])
 vertices=[];uv=[];faces=[];nx=20;ny=12
 for row in range(ny+1):
  v=row/ny;y=-1.00-v*.80;half=.57+v*.09
  for col in range(nx+1):
   u=col/nx;x=(2*u-1)*half
   hit,pos,normal,_=body.ray_cast(Vector((x,y,3)),Vector((0,0,-1)))
   if not hit:raise RuntimeError('rear-window decal falls outside body')
   vertices.append(tuple(pos+normal*.009));uv.append(tuple((1-v)*((1-u)*uv_corners[0]+u*uv_corners[1])+v*((1-u)*uv_corners[3]+u*uv_corners[2])))
 for row in range(ny):
  for col in range(nx):
   j=row*(nx+1)+col;faces.append((j,j+nx+1,j+nx+2,j+1))
 mesh=bpy.data.meshes.new('rear_window_art');mesh.from_pydata(vertices,[],faces);mesh.materials.append(decal);layer=mesh.uv_layers.new()
 for polygon in mesh.polygons:
  for loop in polygon.loop_indices:layer.data[loop].uv=uv[mesh.loops[loop].vertex_index]
 ob=bpy.data.objects.new('rear_window_art',mesh);bpy.context.collection.objects.link(ob)
 # Nissan rear light bands are separate materials, not hallucinated neural badges.
 darkpaint=material('trunk_dark_used',(.035,.038,.045),.16,.72)
 body.data.materials.append(darkpaint);dark_index=len(body.data.materials)-1
 body.data.materials.append(glass);glass_index=len(body.data.materials)-1
 for face in body.data.polygons:
  x,y,z=face.center
  if y < -2.15 and z>.55:face.material_index=dark_index
  if abs(x)<.60 and .13<y<.64 and z>1.06:face.material_index=glass_index
 def rear_lens(name,x0,x1,z0,z1,mat):
  verts=[];faces=[];nx=12;nz=4
  for iz in range(nz+1):
   for ix in range(nx+1):
    x=x0+(x1-x0)*ix/nx;z=z0+(z1-z0)*iz/nz
    hit,pos,n,_=body.ray_cast(Vector((x,-4,z)),Vector((0,1,0)))
    if not hit:raise RuntimeError('rear lamp outside body')
    verts.append(tuple(pos+Vector((0,-.015,0))))
  for iz in range(nz):
   for ix in range(nx):
    j=iz*(nx+1)+ix;faces.append((j,j+1,j+nx+2,j+nx+1))
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(mat)
  ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
 for x in (-.54,.54):
  rear_lens('taillight',x-.22,x+.22,.78,.87,tail)
  amber=material('lamp_indicator',(.7,.19,.008),.1,.38)
  rear_lens('indicator',x-.22,x+.22,.88,.95,amber)
# Existing generated spoilers, turbo housings and Eagle's dual parachutes are retained.
# Rebuild only hardware absent from the single-image reconstruction, avoiding stacked duplicates.
if a.car=='mcflurry':
 bm=bmesh.new();bm.from_mesh(body.data)
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.y < -2.22 and v.co.z < .65],context='VERTS');bm.to_mesh(body.data);bm.free()
 y=-2.25
 cube('parachute',(0,y-.13,.71),(.35,.20,.30),rubber)
 rod('parachute_mount',(0,y+.1,.55),(0,y-.2,.6),.024,alloy)
if a.car=='mullet':
 # Cut the inferred solid bed cap, keep the side rails, then give the open bay depth and tubes.
 cutter=cube('bed_cutter',(0,-1.65,1.65),(1.20,1.50,2.0),black)
 bpy.context.view_layer.objects.active=body
 mod=body.modifiers.new('open_bed','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
 cube('bed_floor',(0,-1.65,.65),(1.20,1.50,.03),black)
 for side in (-1,1):
  rod('bed_rollcage',(side*.57,-.87,1.29),(side*.57,-2.38,1.07),.033,alloy)
 rod('bed_crossbrace',(-.57,-.87,1.29),(.57,-2.38,1.07),.026,alloy)
 # Keep the reconstructed front turbo pair and spoiler. Replace only the rough wheelie bars.
 bm=bmesh.new();bm.from_mesh(body.data)
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.y < -2.72 and v.co.z < .54],context='VERTS');bm.to_mesh(body.data);bm.free()
 for x in (-.35,.35):
  rod('wheelie_bar',(x,-2.5,.43),(x,-3.50,.11),.026,alloy)
  cylinder('wheelie_roller',(x,-3.50,.11),.10,.10,black)
if a.car=='lumberjack':
 for side in (-1,1):
  rod('bed_rollcage',(side*.55,-.8,1.30),(side*.55,-2.30,.80),.028,alloy)
if a.car=='mcflurry':
 ref=a.work/'references'/'Cleetus_Hunyuan3D_5_Cars'/cfg['reference']/(cfg['reference']+'_side.png')
 livery=material('reference_side_livery',(1,1,1),.12,.50);tex=livery.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ref));tex.image.pack()
 livery.node_tree.links.new(tex.outputs['Color'],livery.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 # The same reference identity is used on both sides; no neural recreation of the logo letters.
 for side in (-1,1):
  verts=[];uv=[];valid=[];faces=[];ny=64;nz=24
  for iz in range(nz+1):
   z=.24+iz/nz*.79
   for iy in range(ny+1):
    y=.76-iy/ny*2.58
    hit,pos,n,_=body.ray_cast(Vector((side*3,y,z)),Vector((-side,0,0)))
    good=hit and side*pos.x>.52 and all((y-wy)**2+(z-r)**2>(r+.048)**2 for wy,r in [(front_y,.3),(rear_y,.3795)])
    verts.append(tuple(pos+Vector((side*.009,0,0))) if hit else (0,y,z));valid.append(good)
    px=280+(front_y-y)/wb*780;py=790-z*450/1.38
    uv.append((px/1448,1-py/1086))
  for iz in range(nz):
   for iy in range(ny):
    j=iz*(ny+1)+iy;face=(j,j+1,j+ny+2,j+ny+1)
    if all(valid[k] for k in face):faces.append(face if side>0 else tuple(reversed(face)))
  mesh=bpy.data.meshes.new('reference_side_livery');mesh.from_pydata(verts,[],faces);mesh.materials.append(livery);layer=mesh.uv_layers.new()
  for polygon in mesh.polygons:
   for loop in polygon.loop_indices:layer.data[loop].uv=uv[mesh.loops[loop].vertex_index]
  ob=bpy.data.objects.new('reference_side_livery',mesh);bpy.context.collection.objects.link(ob)
# Assign glass independently of the paint maps. Roofs and cowl hoods are outside these slope bounds.
if a.car!='crc12_jackstand_240':
 body.data.materials.append(glass);gi=len(body.data.materials)-1
 for face in body.data.polygons:
  x,y,z=face.center;n=face.normal
  if abs(x)<.64 and .04<y<.8 and z>1.00 and n.y>.32 and n.z>.15: face.material_index=gi
  if a.car in ('eagle','mcflurry') and abs(x)<.6 and -1.40<y<-.65 and z>1.00 and n.y<-.3: face.material_index=gi

for o in bpy.context.scene.objects:
 if o.type=='MESH' and not o.name.startswith('wheel_'):
  # Keep all race hardware as individual nodes in the body hierarchy.
  pass
out=pathlib.Path(__file__).resolve().parents[2]/'src/assets/models';out.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(work/'master.blend'))
bpy.ops.export_scene.gltf(filepath=str(work/'master.glb'),export_format='GLB',export_yup=True)
bpy.context.view_layer.objects.active=body
triangles=sum(len(p.vertices)-2 for p in body.data.polygons)
if triangles>24000:
 mod=body.modifiers.new('runtime_budget','DECIMATE');mod.ratio=24000/triangles;bpy.ops.object.modifier_apply(modifier=mod.name)
runtime=out/(a.car+'.glb')
bpy.ops.export_scene.gltf(filepath=str(runtime),export_format='GLB',export_yup=True)
report={'carId':a.car,'source':'painted.glb','wheelbaseM':wb,'trackM':track,'radii':cfg['wheels']['radii'],
        'removedWheelVertices':len(removed),'removedFragmentVertices':len(small),
        'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),
        'bytes':runtime.stat().st_size,'repairs':['baked wheels removed','round independent wheels rebuilt','separate stationary calipers','fragile race hardware rebuilt'],
        'estimatedHeightM':visual_height,'visualDimensionsKind':cfg['dimensions']['kind']}
(work/'fit-status.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
# Existing low graphics tier keeps the same identity and rig with a smaller body and texture budget.
bpy.context.view_layer.objects.active=body
triangles=sum(len(p.vertices)-2 for p in body.data.polygons)
if triangles>10000:
 mod=body.modifiers.new('low_budget','DECIMATE');mod.ratio=10000/triangles;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.export_scene.gltf(filepath=str(out/(a.car+'-low.glb')),export_format='GLB',export_yup=True)
