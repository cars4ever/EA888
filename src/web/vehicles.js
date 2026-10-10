import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import Vehicles from '../assets/vehicle-assets.js';
import { buildScirocco, bodyReady } from './scirocco.js';

export function releaseTree(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
      materials.add(m);
      for (const [k,v] of Object.entries(m)) if (v?.isTexture && k !== 'envMap') textures.add(v);
    }
  });
  textures.forEach(t => { t.dispose(); });
  materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
}

export function buildVehicle({ carId = 'scirocco', onStatus, ...opts } = {}) {
  if (carId === 'scirocco') {
    const car = buildScirocco(opts);
    let disposed=false;
    const disposeOriginal=car.dispose;
    car.dispose=()=>{disposed=true;disposeOriginal?.();releaseTree(car.root);car.root.clear();};
    car.carId = carId; car.radii = [.323,.323,.323,.323];
    car.steering = [];
    car.status = { carId, state: 'ready', kind: 'existing Scirocco' };
    car.ready = opts.model === false || opts.ghost ? Promise.resolve(car.status) : bodyReady().then(loaded => {if(disposed)return car.status;car.status={carId,state:loaded?'ready':'fallback',kind:loaded?'existing Scirocco':'procedural Scirocco fallback'};onStatus?.(car.status);return car.status;});
    return car;
  }
  const spec = Vehicles.get(carId), root = new THREE.Group(), body = new THREE.Group();
  const model = opts.model === false && spec?.lowModel ? spec.lowModel : spec?.model;
  root.name = carId; root.add(body);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x701515, emissive: 0x550000 });
  const wheels = [], steering = [], tips = [];
  const d = spec?.dimensions || { wheelbase: 2.6, track: 1.55, length: 4.6 };
  const radii = [...(spec?.wheels.radii || [.32,.32,.36,.36])];
  const originalRadii=radii.slice();
  const setup=opts.wheelSetup;
  if(setup && Number.isFinite(setup.radius))for(const i of [2,3])radii[i]=THREE.MathUtils.clamp(setup.radius,.25,.5);
  for (let i=0; i<4; i++) {
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.set((i%2 ? 1 : -1)*d.track/2,radii[i],(i<2 ? -1:1)*d.wheelbase/2);
    pivot.add(spin); root.add(pivot); steering.push(pivot); wheels.push(spin);
  }
  for (const pos of spec?.anchors.exhaust || []) {
    const a = new THREE.Object3D(); a.position.set(...pos); body.add(a); tips.push(a);
  }
  // Visible, deliberately schematic missing-model indicator. Never another car's body.
  const fallback = new THREE.Mesh(new THREE.BoxGeometry(1.7,.85,d.length),
    new THREE.MeshStandardMaterial({ color:0xff8b22,wireframe:true,roughness:1 }));
  fallback.position.y=.75; body.add(fallback);
  let disposed = false;
  const car = { carId, root, body, wheels, steering, tips, radii, dimensions:d, tailMat, tailPieces: [], status: null,
    dispose() { disposed=true; releaseTree(root); tailMat.dispose(); root.clear(); } };
  const report = (state, error) => {
    car.status = { carId, state, model:model || null, error:error || null };
    root.userData.vehicle = car.status; if (!disposed) onStatus?.(car.status);
    return car.status;
  };
  report('loading');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  car.ready = (spec ? loader.loadAsync(`${model}?v=${Vehicles.version}`) : Promise.reject(new Error(`Geen model voor ${carId}`)))
    .then(gltf => {
      if (disposed) { releaseTree(gltf.scene); return car.status; }
      const nodes = spec.wheels.names.map(n=>gltf.scene.getObjectByName(n));
      if (nodes.some(n=>!n)) { releaseTree(gltf.scene); throw new Error('Vier wielnodes ontbreken'); }
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        // Each request owns its geometries/materials/textures; no mutable shared cached scene.
        for (const m of (Array.isArray(o.material)?o.material:[o.material])) {
          m.envMap=opts.envMap; m.envMapIntensity=.65;
          if (/lamp_tail/.test(m.name)) { car.tailPieces.push(o); }
        }
        o.castShadow=false; o.receiveShadow=false;
      });
      nodes.forEach((node,i) => { node.removeFromParent(); node.position.set(0,0,0); wheels[i].add(node);
        if(setup&&i>=2){const ratio=radii[i]/originalRadii[i];wheels[i].scale.set(THREE.MathUtils.clamp(setup.width,.15,.5)/.315,ratio,ratio);}
      });
      if(setup){const rearDelta=radii[2]-originalRadii[2];body.position.y=rearDelta/2;body.rotation.x=-rearDelta/d.wheelbase;}
      spec.wheels.names.forEach((name,i) => {
        const caliper=gltf.scene.getObjectByName(`caliper_${name}`);
        if(caliper){caliper.removeFromParent();caliper.position.y+=radii[i]-originalRadii[i];caliper.position.sub(steering[i].position);steering[i].add(caliper);}
      });
      body.remove(fallback); releaseTree(fallback); body.add(gltf.scene);
      return report('ready');
    }).catch(e => disposed ? car.status : report('fallback',String(e.message || e)));
  return car;
}
