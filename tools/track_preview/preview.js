// Dev tool: drives the real race renderer to fixed points on the strip so the lighting, bloom and
// reflections can be reviewed without running the whole app (tools/track_preview.py screenshots it).
import * as race3d from '../../src/web/race3d.js';
import { bodyReady } from '../../src/web/scirocco.js';

const canvas = document.getElementById('c');
let view = null;

window.buildTrackPreview = quality => {
  view?.dispose();
  view = race3d.create(canvas, {
    headsUp: true, playerColor: 0x1f4fd8, drivetrain: 'FWD',
    quality, maxPixelRatio: 1,
  });
  return !!view;
};

// name -> a frame the race renderer would get from the simulation at that point in the run
// name -> the frame the simulation would hand the renderer at that point in the run
const SHOTS = {
  burnout: { scene: 'burnout', rpm: 5200, wheelSpeedKmh: 90, smoke: 1, tyreTempC: 120, lights: [] },
  staging: { scene: 'staging', rpm: 2600, stageProgress: 60, lights: ['preL', 'stageL', 'preR'] },
  tree:    { scene: 'staging', rpm: 3400, stageProgress: 100, lights: ['stageL', 'stageR', 'a1L', 'a1R'] },
  launch:  { camera: 'chase',  distanceM: 14, speedKmh: 78, accelerationG: 1.15, wheelspinPct: 55 },
  mid:     { camera: 'chase',  distanceM: 190, speedKmh: 190, accelerationG: .7 },
  finish:  { camera: 'finish', distanceM: 402, speedKmh: 245, accelerationG: .4 },
  side:    { camera: 'side',   distanceM: 62, speedKmh: 150, accelerationG: .8 },
  high:    { camera: 'high',   distanceM: 120, speedKmh: 170, accelerationG: .7 },
};

window.renderShot = name => {
  const shot = SHOTS[name];
  if (!shot || !view) return false;
  // several frames: the camera springs, smoke and body attitude need to settle before the shot
  for (let i = 0; i < 24; i++) view.update({ t: i / 60, ...shot }, 1 / 60);
  return true;
};
window.previewQuality = () => view?.quality();
window.previewSurfaces = () => {
  const out = {};
  view?.scene && null;
  race3d.__scene?.traverse?.(() => {});
  return out;
};
window.previewInfo = () => view?.info();

window.previewReady = true;
// the scanned body arrives asynchronously; the shots wait for it (or for the fallback) so the first one
// is not rendered against the procedural car
bodyReady().then(scene => {
  window.previewBodyKind = scene ? 'generated GLB' : 'procedural fallback';
  requestAnimationFrame(() => { window.previewBodyReady = true; });
});
