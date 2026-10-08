import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildVehicle, releaseTree } from './vehicles.js';
import Vehicles from '../assets/vehicle-assets.js';

export function createShowroom(canvas,{carId,onStatus,envFactory}={}) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x171e27);
  const envMap=envFactory(renderer), car=buildVehicle({carId,envMap,onStatus,model:true}); scene.add(car.root);
  scene.add(new THREE.HemisphereLight(0xe4ecff,0x54505a,2));
  for (const [x,y,z,k] of [[-5,8,-4,3],[5,5,3,2]]) {
    const light=new THREE.DirectionalLight(0xffffff,k); light.position.set(x,y,z); scene.add(light);
  }
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x29313c,roughness:.85}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.006; scene.add(ground);
  const camera=new THREE.PerspectiveCamera(36,1,.1,80);
  const length=Vehicles.get(carId)?.dimensions.length || 4.6;
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const g=shadowCanvas.getContext('2d'),gradient=g.createRadialGradient(64,64,12,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,.7)');gradient.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gradient;g.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.4,length+.3),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.008;scene.add(shadow);
  const controls=new OrbitControls(camera,canvas); controls.target.set(0,.65,0); controls.enablePan=false;
  controls.minDistance=4; controls.maxDistance=18; controls.maxPolarAngle=Math.PI*.49;
  let raf=0,disposed=false,angle=0;
  function view(a=angle) {
    angle=a; const r=length*1.38; camera.position.set(Math.sin(a)*r,2.25,Math.cos(a)*r);
    camera.lookAt(0,.65,0); controls.update(); draw();
  }
  function draw() {
    if(disposed)return;
    const w=canvas.clientWidth||800,h=canvas.clientHeight||400;
    if(canvas.width!==Math.floor(w*renderer.getPixelRatio()) || canvas.height!==Math.floor(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.render(scene,camera);
  }
  function tick(){draw();raf=requestAnimationFrame(tick);}
  view(-2.35); tick();
  return {car,renderer,view,ready:car.ready, clay(enabled){car.root.traverse(o=>{if(!o.isMesh)return;
    if(enabled&&!o.userData.originalMaterial){o.userData.originalMaterial=o.material;o.material=new THREE.MeshStandardMaterial({color:0xaaaaaa,roughness:.8});}
    if(!enabled&&o.userData.originalMaterial){o.material.dispose();o.material=o.userData.originalMaterial;delete o.userData.originalMaterial;}});draw();},
    dispose(){this.clay(false);disposed=true;cancelAnimationFrame(raf);controls.dispose();car.dispose?.();releaseTree(scene);envMap.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
