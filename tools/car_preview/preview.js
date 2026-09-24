// Dev tool: renders the procedural 3D car from fixed views (tools/car_preview.py screenshots it).
import * as THREE from 'three';
import { buildCar, makeEnvironment } from '../../src/web/race3d.js';
import { bodyReady } from '../../src/web/scirocco.js';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(canvas.width, canvas.height, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c4cf);
const envMap = makeEnvironment(renderer);
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x404040, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-6, 10, 8); scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x6d6f73, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const car = buildCar({ color: 0x1f4fd8, envMap });
scene.add(car.root);
const camera = new THREE.PerspectiveCamera(32, canvas.width / canvas.height, 0.1, 100);
const views = {
  rear: [[0, 1.25, 7.8], [0, 0.75, 0]],
  chase: [[0, 1.9, 6.2], [0, 0.7, -2]],
  side: [[-8.5, 0.9, 0], [0, 0.65, 0]],
  front34: [[-4.6, 1.3, -5.2], [0, 0.6, 0]],
  rear34: [[-4.6, 1.5, 5.4], [0, 0.6, 0]],
  top: [[0, 11, 0.01], [0, 0, 0]]
};
window.renderView = name => {
  const [p, t] = views[name];
  camera.position.set(...p); camera.lookAt(...t);
  renderer.render(scene, camera);
  return true;
};
window.previewReady = true;
// the scanned body arrives asynchronously; the screenshots wait for it (or for the fallback)
bodyReady().then(scene => {
  window.previewBodyKind = scene ? 'generated GLB' : 'procedural fallback';
  requestAnimationFrame(() => { window.previewBodyReady = true; });
});
