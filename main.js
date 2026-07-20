import { FaceLandmarker, FilesetResolver } from './node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import * as THREE from './node_modules/three/build/three.module.js';
import { TeapotGeometry } from './node_modules/three/examples/jsm/geometries/TeapotGeometry.js';
import { calculateViewer, setUpDefault } from './viewer.js';
import { buildMesh } from './geometry.js';
import { update, setMode } from './animation.js';
import { setMuted, tick as audioTick } from './audio.js';

const WASM_PATH  = './node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_PATH = './models/face_landmarker.task';

let status, video, landmarker;
let threeRenderer, threeScene, threeCamera;
let sceneMesh;
let renderTarget, blitScene, blitCamera;
let resScale = 1.0;

function loop() {
  requestAnimationFrame(loop);

  const now    = Date.now();
  const result = landmarker.detectForVideo(video, now);
  calculateViewer(result);
  update(threeCamera, sceneMesh, now);
  audioTick();

  const tracked = result.facialTransformationMatrixes?.length;
  status.textContent = tracked ? '' : 'no face detected';
  status.style.color  = tracked ? '' : '#f44';

  threeRenderer.setRenderTarget(renderTarget);
  threeRenderer.render(threeScene, threeCamera);
  threeRenderer.setRenderTarget(null);
  threeRenderer.render(blitScene, blitCamera);
}

async function init() {
  status = document.getElementById('status');
  video  = document.getElementById('webcam');

  const canvas  = document.getElementById('canvas');
  threeScene    = new THREE.Scene();
  threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  threeRenderer.setSize(window.innerWidth, window.innerHeight);

  blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  blitScene  = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
  threeCamera.position.set(0, 0, 0);
  threeCamera.up.set(0, 1, 0);
  threeCamera.lookAt(-1, 0, 0);

  function setResolution(scale) {
    const w = Math.max(1, Math.round(window.innerWidth  * scale));
    const h = Math.max(1, Math.round(window.innerHeight * scale));
    if (renderTarget) renderTarget.dispose();
    renderTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    if (blitScene.children.length) blitScene.remove(blitScene.children[0]);
    blitScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: renderTarget.texture }),
    ));
    threeCamera.aspect = w / h;
    threeCamera.updateProjectionMatrix();
  }

  setResolution(resScale);

  window.addEventListener('resize', () => {
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
    setResolution(resScale);
  });

  document.getElementById('slider-res').addEventListener('input', e => {
    resScale = parseInt(e.target.value) / 100;
    document.getElementById('res-label').textContent = e.target.value + '%';
    setResolution(resScale);
  });

  const btnMode = document.getElementById('btn-mode');
  btnMode.addEventListener('click', () => {
    const isDirect = btnMode.textContent === 'direct';
    setMode(isDirect ? 'direct' : 'continuous');
    btnMode.textContent = isDirect ? 'continuous' : 'direct';
  });

  const btnMute = document.getElementById('btn-mute');
  btnMute.addEventListener('click', () => {
    const m = btnMute.textContent === 'mute';
    setMuted(m);
    btnMute.textContent = m ? 'unmute' : 'mute';
  });

  status.textContent = 'Requesting camera…';
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await new Promise(r => video.addEventListener('loadeddata', r));

  status.textContent = 'Loading face model…';
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });

  setUpDefault();

  const bgMaterial = new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader:   `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
      float rand(vec2 co) { return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453); }
      void main() { gl_FragColor = vec4(vec3(rand(floor(gl_FragCoord.xy))), 1.0); }
    `,
  });
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
  bgMesh.renderOrder   = -1;
  bgMesh.frustumCulled = false;
  threeScene.add(bgMesh);

  status.textContent = 'Loading shaders…';
  const [vertSrc, fragSrc] = await Promise.all([
    fetch('./export-shader/vertex.glsl').then(r => r.text()),
    fetch('./export-shader/fragment.glsl').then(r => r.text()),
  ]);

  // Swap geometry here: new THREE.BoxGeometry(1,1,1), new TeapotGeometry(1), etc.
  sceneMesh = buildMesh(vertSrc, fragSrc, new TeapotGeometry(0.65));
  sceneMesh.position.set(-2, 0, 0);
  threeScene.add(sceneMesh);

  status.textContent = 'Running';
  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status').textContent = 'Error: ' + err.message;
  console.error(err);
});
