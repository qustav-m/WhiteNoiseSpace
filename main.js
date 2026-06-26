import { FaceLandmarker, FilesetResolver } from './node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';

const WASM_PATH  = './node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_PATH = './models/face_landmarker.task';
const SMOOTH     = 0.85; // higher = more smoothing, less jitter

// --- Placeholder shaders (swap in your own fragment shader) ---

const VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Layered scene to demonstrate parallax depth — replace with your shader.
// Uniforms available:
//   u_resolution : vec2  — canvas size in pixels
//   u_time       : float — seconds since start
//   u_parallax   : vec2  — head offset from center, roughly [-0.5, 0.5]
const FRAG = `#version 300 es
precision mediump float;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_parallax;

out vec4 fragColor;

float circle(vec2 uv, vec2 c, float r) {
  return smoothstep(r, r - 0.003, length(uv - c));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;

  // Background — no parallax
  vec3 col = mix(vec3(0.04, 0.04, 0.12), vec3(0.08, 0.03, 0.18), uv.y);

  // Mid layer — half parallax
  vec2 mid = uv + u_parallax * 0.08;
  col = mix(col, vec3(0.25, 0.15, 0.75), circle(mid, vec2(0.5, 0.5), 0.18));

  // Foreground — full parallax
  vec2 fg = uv + u_parallax * 0.22;
  col = mix(col, vec3(0.95, 0.38, 0.08), circle(fg, vec2(0.32, 0.58), 0.07));
  col = mix(col, vec3(0.08, 0.82, 0.48), circle(fg, vec2(0.68, 0.42), 0.055));

  fragColor = vec4(col, 1.0);
}`;

// --- WebGL helpers ---

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function createProgram(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// --- Main ---

async function init() {
  const status = document.getElementById('status');
  const video  = document.getElementById('webcam');
  const canvas = document.getElementById('canvas');

  // WebGL setup
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 not supported');

  const prog = createProgram(gl, VERT, FRAG);
  gl.useProgram(prog);

  // Fullscreen quad (two triangles)
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uRes      = gl.getUniformLocation(prog, 'u_resolution');
  const uTime     = gl.getUniformLocation(prog, 'u_time');
  const uParallax = gl.getUniformLocation(prog, 'u_parallax');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // Webcam
  status.textContent = 'Requesting camera…';
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await new Promise(r => video.addEventListener('loadeddata', r));

  // MediaPipe face landmarker
  status.textContent = 'Loading face model…';
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
  });

  status.textContent = 'Running';
  setTimeout(() => status.style.opacity = '0', 2000);

  // Smoothed head position
  let sx = 0, sy = 0;
  const startTime = performance.now();

  function loop(now) {
    requestAnimationFrame(loop);

    // Detect face
    if (video.readyState >= 2) {
      const result = landmarker.detectForVideo(video, now);
      if (result.faceLandmarks.length > 0) {
        const nose = result.faceLandmarks[0][1]; // nose tip
        // Invert x: viewer moves right → scene shifts left
        const rx = -(nose.x - 0.5);
        const ry =   nose.y - 0.5;
        sx = sx * SMOOTH + rx * (1 - SMOOTH);
        sy = sy * SMOOTH + ry * (1 - SMOOTH);
      }
    }

    gl.uniform1f(uTime, (now - startTime) / 1000);
    gl.uniform2f(uParallax, sx, sy);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status').textContent = 'Error: ' + err.message;
  console.error(err);
});
