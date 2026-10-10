import * as THREE from 'three';
import {buildVehicle} from '../src/web/vehicles.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
window.checkVehicleResources=async()=>{
  const renderer=new THREE.WebGLRenderer();renderer.setSize(64,64);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,30);camera.position.set(4,3,6);camera.lookAt(0,.6,0);
  // Three r186 retains one shared DFG lookup texture after the first PBR draw.
  const probe=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(probe);renderer.render(scene,camera);
  scene.remove(probe);probe.geometry.dispose();probe.material.dispose();renderer.render(scene,camera);
  const baseline={...renderer.info.memory};
  const report=[];
  for(const id of ['crc12_jackstand_240','eagle','mullet','mcflurry','lumberjack','scirocco']){
    const a=buildVehicle({carId:id}),b=buildVehicle({carId:id});await Promise.all([a.ready,b.ready]);
    check(a.status.state==='ready'&&b.status.state==='ready',id+' loads');
    let ma,mb;a.body.traverse(o=>{if(o.isMesh)ma=o.material;});b.body.traverse(o=>{if(o.isMesh)mb=o.material;});
    check(ma!==mb,id+' independent materials');
    const old=mb.color.getHex();ma.color.setHex(0xff0044);check(mb.color.getHex()===old,'rival color isolated');
    scene.add(a.root,b.root);renderer.render(scene,camera);
    const loaded={...renderer.info.memory};
    scene.remove(a.root,b.root);a.dispose();b.dispose();renderer.render(scene,camera);
    check(renderer.info.memory.geometries===baseline.geometries && renderer.info.memory.textures===baseline.textures,id+' GPU resources released: '+JSON.stringify(renderer.info.memory));
    const late=buildVehicle({carId:id});late.dispose();await late.ready;check(late.root.children.length===0,'late response ignored');
    report.push({id,loaded,disposed:{...renderer.info.memory}});
  }
  const missing=buildVehicle({carId:'missing-model'});await missing.ready;check(missing.status.state==='fallback','missing model explicit');missing.dispose();
  renderer.dispose();renderer.forceContextLoss();return report;
};
window.checkWheelSetup=async()=>{
 const report=[];
 for(const id of ['crc12_jackstand_240','eagle','mullet','mcflurry','lumberjack']){
  const car=buildVehicle({carId:id,wheelSetup:{radius:.43,width:.43}});await car.ready;car.root.updateMatrixWorld(true);
  for(const i of [2,3]){const bounds=new THREE.Box3().setFromObject(car.wheels[i]);check(Math.abs(bounds.min.y)<.004,id+' tyre meets ground');check(Math.abs(bounds.max.y-.86)<.004,id+' actual diameter');}
  check(car.radii[2]===.43,id+' rotation radius');report.push({id,radius:car.radii[2],widthScale:car.wheels[2].scale.x});car.dispose();
 }
 return report;
};
