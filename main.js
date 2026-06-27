import { FaceLandmarker, FilesetResolver } from './node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import * as THREE from './node_modules/three/build/three.module.js';
import { Vector2, Vector3 } from './node_modules/three/build/three.module.js';
import { TeapotGeometry } from './node_modules/three/examples/jsm/geometries/TeapotGeometry.js';

const WASM_PATH  = './node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_PATH = './models/face_landmarker.task';

// ── Configuration ─────────────────────────────────────────────────────────────
// Screen: fixed at origin (0,0,0), normal (1,0,0), plane is y-z
// Axes:   x = toward viewer, y = up, z = right
const CONFIG = {
  screen: {
    width:  34,    // cm — physical screen width
    height: 21,    // cm — physical screen height
  },
  camera: {
    position: [1, 9, 0],    // cm — [forward (+x), up (+y), right (+z)] from screen center
    normal:   [1, -0.2, 0], // direction camera faces (normalized at runtime)
    hFov:     80,           // horizontal field of view in degrees
  },
  face: {
    outerEyeDist: 0.090,    // meters — reference distance between outer eye corners
  },
  smoothing: 0.85,
};
// ─────────────────────────────────────────────────────────────────────────────


// Screen: position (0,0,0), forward (= screen surface normal) (1,0,0), up (0,1,0)
let screenSize;
let cameraForward;
let cameraUp;
let cameraPosition;

function defaultValues() {
  // MacBook Pro 14" M3 defaults
  screenSize     = new Vector2(30.5, 19.5);               // cm, active display area
  cameraPosition = new Vector3(0, screenSize.y / 2, 0);  // cm — top center of screen
  cameraForward  = new Vector3(1, 0, 0);                  // camera faces viewer (+x)
  cameraUp       = new Vector3(0, 1, 0);                  // camera up is world up (+y)
}

let viewerForward = new Vector3(0, 0, 0);
let viewerUp = new Vector3(0, 0, 0);
let viewerPosition = new Vector3(0, 0, 0);
let viewerDistance = 0.0;

function calculateViewer(result) {
  if (!result.facialTransformationMatrixes?.length) return;

  const m = new THREE.Matrix4().fromArray(result.facialTransformationMatrixes[0].data);

  // Print raw camera-space position once per second for coordinate system debugging
  const rawPos = new Vector3().setFromMatrixPosition(m);
  if (!calculateViewer._lastLog || Date.now() - calculateViewer._lastLog > 1000) {
    calculateViewer._lastLog = Date.now();
    console.log(`raw pos  x:${rawPos.x.toFixed(3)}  y:${rawPos.y.toFixed(3)}  z:${rawPos.z.toFixed(3)}`);
  }

  // extract viewer position in camera space
  const viewerPositionCameraSpace = new Vector3().setFromMatrixPosition(m);
  viewerPositionCameraSpace.z *= -1;
  //calculate viewer position in world space
  viewerPosition.copy(transformToWorld(viewerPositionCameraSpace, cameraForward, cameraUp, cameraPosition));
  viewerDistance = viewerPosition.length();
  //calculate the direction vector from the viewer to the screen center at (0, 0, 0)a nd use it as an aproximation for the viewer head roation
  viewerForward.copy(viewerPosition.clone().negate().normalize());
  const viewerRight = new Vector3().crossVectors(new Vector3(0, 1, 0), viewerForward).normalize();
  viewerUp.copy(new Vector3().crossVectors(viewerForward, viewerRight).normalize());
}

// Transforms a vector from a local coordinate frame (defined by forward + up)
// into world space.
// worldOrigin: position of the local frame's origin in world coordinates (default = world origin)
function transformToWorld(vector, forward, up, worldOrigin = new Vector3()) {
  const right = new Vector3().crossVectors(forward, up).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, up, forward);
  return vector.clone().applyMatrix4(matrix).add(worldOrigin);
}

let startScale = 0.7;
let maximumDistance = 100;
function scaling(){
    return (viewerDistance/maximumDistance) * (1 - startScale) + startScale;
}


// ── Mesh building ─────────────────────────────────────────────────────────────
let triSeedCounter = 0;

function addTriangleAttribs(geo) {
  const g = geo.toNonIndexed();
  const pos = g.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);

  const bary     = new Float32Array(pos.count * 2);
  const eLenAB   = new Float32Array(pos.count);
  const eLenAC   = new Float32Array(pos.count);
  const triSeeds = new Float32Array(pos.count);

  function absCosAt(p, q, r) {
    const ex = q[0]-p[0], ey = q[1]-p[1], ez = q[2]-p[2];
    const fx = r[0]-p[0], fy = r[1]-p[1], fz = r[2]-p[2];
    const le = Math.hypot(ex, ey, ez), lf = Math.hypot(fx, fy, fz);
    if (le < 1e-10 || lf < 1e-10) return 1;
    return Math.abs((ex*fx + ey*fy + ez*fz) / (le * lf));
  }

  for (let i = 0; i < triCount; i++) {
    const b = i * 3;
    const p = [
      [pos.getX(b),   pos.getY(b),   pos.getZ(b)],
      [pos.getX(b+1), pos.getY(b+1), pos.getZ(b+1)],
      [pos.getX(b+2), pos.getY(b+2), pos.getZ(b+2)],
    ];

    const d = [absCosAt(p[0],p[1],p[2]), absCosAt(p[1],p[0],p[2]), absCosAt(p[2],p[0],p[1])];
    const iA = d[0] <= d[1] && d[0] <= d[2] ? 0 : d[1] <= d[2] ? 1 : 2;
    const [iB, iC] = [[1,2],[0,2],[0,1]][iA];

    const lAB = Math.hypot(...p[iB].map((v,k) => v - p[iA][k]));
    const lAC = Math.hypot(...p[iC].map((v,k) => v - p[iA][k]));
    const seed = triSeedCounter++;

    bary[(b+iA)*2]=0; bary[(b+iA)*2+1]=0;
    bary[(b+iB)*2]=1; bary[(b+iB)*2+1]=0;
    bary[(b+iC)*2]=0; bary[(b+iC)*2+1]=1;

    for (let k = 0; k < 3; k++) {
      eLenAB[b+k]   = lAB;
      eLenAC[b+k]   = lAC;
      triSeeds[b+k] = seed;
    }
  }

  g.setAttribute('aBary',      new THREE.BufferAttribute(bary,     2));
  g.setAttribute('aEdgeLenAB', new THREE.BufferAttribute(eLenAB,   1));
  g.setAttribute('aEdgeLenAC', new THREE.BufferAttribute(eLenAC,   1));
  g.setAttribute('aTriSeed',   new THREE.BufferAttribute(triSeeds, 1));
  return g;
}

function buildMesh(vertSrc, fragSrc, geometry) {
  const geo = addTriangleAttribs(geometry);
  const mat = new THREE.ShaderMaterial({ vertexShader: vertSrc, fragmentShader: fragSrc, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}
// ─────────────────────────────────────────────────────────────────────────────

let status;
let video;
let landmarker;
let threeRenderer;
let sceneMesh;
let threeScene;
let threeCamera;

function loop() {
  requestAnimationFrame(loop);

  const result = landmarker.detectForVideo(video, Date.now());
  calculateViewer(result);

  const p = viewerPosition;
  status.textContent = result.facialTransformationMatrixes?.length
    ? `pos  x:${p.x.toFixed(2)} y:${p.y.toFixed(2)} z:${p.z.toFixed(2)}\ndistance  ${viewerDistance.toFixed(3)}`
    : 'no face detected';

  if (viewerForward.lengthSq() > 0) {
    const forward = viewerForward.clone().normalize();
    const up = viewerUp.clone().normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, forward);
    sceneMesh.setRotationFromMatrix(m);
    const s = scaling();
    sceneMesh.scale.set(s, s, s);
  }

  threeRenderer.render(threeScene, threeCamera);
}


async function init() {
  status = document.getElementById('status');
  video  = document.getElementById('webcam');

  // Three.js scene — set up after defaultValues() so screen variables are ready
  const canvas = document.getElementById('canvas');
  threeScene    = new THREE.Scene();
  threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  threeRenderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => {
    threeCamera.aspect = window.innerWidth / window.innerHeight;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Webcam
  status.textContent = 'Requesting camera…';
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await new Promise(r => video.addEventListener('loadeddata', r));

  // MediaPipe face landmarker
  status.textContent = 'Loading face model…';
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });

  defaultValues();

  // Screen: position (0,0,0), normal (1,0,0), up (0,1,0)
  // Camera sits at screen, looks into scene (-x direction = behind screen)
  threeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
  threeCamera.position.set(0, 0, 0);
  threeCamera.up.set(0, 1, 0);
  threeCamera.lookAt(-1, 0, 0);

  const bgMaterial = new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader: `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        gl_FragColor = vec4(vec3(rand(floor(gl_FragCoord.xy))), 1.0);
      }
    `,
  });
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
  bgMesh.renderOrder = -1;
  bgMesh.frustumCulled = false;
  threeScene.add(bgMesh);

  status.textContent = 'Loading shaders…';
  const [vertSrc, fragSrc] = await Promise.all([
    fetch('./export-shader/vertex.glsl').then(r => r.text()),
    fetch('./export-shader/fragment.glsl').then(r => r.text()),
  ]);

  // Swap geometry here: new THREE.BoxGeometry(1, 1, 1), new TeapotGeometry(1), etc.
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
