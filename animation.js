import { viewerDistance } from './viewer.js';

const cmPerUnit              = 10.0;
const digitalCameraMaxDistance = 10.0; // units — camera at origin when viewer is this far

export function moveDigitalCamera(camera) {
  camera.position.x = Math.max(0, digitalCameraMaxDistance - (viewerDistance / cmPerUnit));
}
