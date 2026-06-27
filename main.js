import { FaceLandmarker, FilesetResolver } from './node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import * as THREE from './node_modules/three/build/three.module.js';
import { Vector2, Vector3 } from './node_modules/three/build/three.module.js';

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

// ── Shaders ───────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Coordinate system: screen at x=0, viewer in +x half-space, y=up, z=right. Units: cm.
//
// Available uniforms:
//   u_resolution : vec2  — canvas size in pixels
//   u_screenSize : vec2  — physical screen (width, height) in cm
//   u_time       : float — seconds since start
//   u_eyePos     : vec3  — viewer eye in world space (cm)
//                          .x = distance in front of screen
//                          .y = height (0 = screen center)
//                          .z = lateral (0 = screen center, +z = right)
//
// Per-pixel ray (for raymarching):
//   vec2 ndc      = gl_FragCoord.xy / u_resolution;
//   vec3 pixelPos = vec3(0.0, (ndc.y-0.5)*u_screenSize.y, (ndc.x-0.5)*u_screenSize.x);
//   vec3 rayDir   = normalize(pixelPos - u_eyePos);
//   vec3 rayOri   = u_eyePos;
const FRAG = `#version 300 es
precision mediump float;

uniform vec2  u_resolution;
uniform vec2  u_screenSize;
uniform float u_time;
uniform vec3  u_eyePos;

out vec4 fragColor;

float circle(vec2 uv, vec2 c, float r) {
  return smoothstep(r, r - 0.003, length(uv - c));
}

// Screen UV [0,1]^2 of where the ray hits a virtual plane x = -depth (behind screen)
vec2 uvAtDepth(vec3 eye, vec3 dir, float depth) {
  float t   = (-depth - eye.x) / dir.x;
  vec3  hit = eye + dir * t;
  return vec2(hit.z / u_screenSize.x + 0.5,
              hit.y / u_screenSize.y + 0.5);
}

void main() {
  vec2 ndc = gl_FragCoord.xy / u_resolution;

  // Physical position of this pixel on the screen plane (cm)
  vec3 pixelPos = vec3(0.0,
    (ndc.y - 0.5) * u_screenSize.y,
    (ndc.x - 0.5) * u_screenSize.x);

  // Ray from viewer's eye through this screen pixel into the virtual scene
  vec3 rayDir = normalize(pixelPos - u_eyePos);

  // Background
  vec3 col = mix(vec3(0.04, 0.04, 0.12), vec3(0.08, 0.03, 0.18), ndc.y);

  // Mid layer — 20 cm behind screen
  vec2 midUV = uvAtDepth(u_eyePos, rayDir, 0.20);
  col = mix(col, vec3(0.25, 0.15, 0.75), circle(midUV, vec2(0.5, 0.5), 0.18));

  // Foreground — 5 cm behind screen
  vec2 fgUV = uvAtDepth(u_eyePos, rayDir, 0.05);
  col = mix(col, vec3(0.95, 0.38, 0.08), circle(fgUV, vec2(0.35, 0.55), 0.09));
  col = mix(col, vec3(0.08, 0.82, 0.48), circle(fgUV, vec2(0.65, 0.45), 0.07));

  fragColor = vec4(col, 1.0);
}`;
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


// ── WebGL helpers ─────────────────────────────────────────────────────────────
function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function createProgram(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER,   vert));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
// ─────────────────────────────────────────────────────────────────────────────

let status;
let video;
let landmarker;
let threeRenderer;
let debugCube;
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

  // Rotate debug cube to match viewer head orientation (same coordinate system, no remapping)
  if (viewerForward.lengthSq() > 0) {
    const forward = viewerForward.clone().normalize();
    const up = viewerUp.clone().normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, forward);
    debugCube.setRotationFromMatrix(m);
    const s = scaling();
    debugCube.scale.set(s, s, s);
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

  threeRenderer.setClearColor(0x111111);

  // Cube 2 units behind screen
  debugCube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshNormalMaterial()
  );
  debugCube.position.set(-2, 0, 0);
  threeScene.add(debugCube);

  status.textContent = 'Running';
  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status').textContent = 'Error: ' + err.message;
  console.error(err);
});
