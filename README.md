# White Noise Space

An interactive browser application where 3D objects are hidden in procedural white noise and only become visible through motion. The viewer's face position — tracked in real time via webcam — rotates the object and adjusts the camera, making the noise shift and reveal the object's shape.

## Setup

```bash
npm install
bash download_model.sh   # downloads face detection model (~8MB, one-time)
npm start                # serves at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in a browser with webcam access.

## How it works

- A Utah teapot (or any 3D geometry) is rendered with an anisotropic white noise shader — statistically identical to the background at rest
- Head movement tracked via MediaPipe FaceLandmarker rotates the object; the noise shifts with it, making the shape visible through motion
- Viewer distance drives the digital camera position to keep the apparent object size roughly constant
- Rotation is driven by a BPM beat system: head movement is sampled each beat and applied as a rotation impulse that decays over the cycle

## Configuration

**BPM and beat timing** — set in `animation.js`:
```js
export const BPM = 72;
```

**Animation mode** — also in `animation.js`, change the default:
```js
let mode = 'continuous'; // 'direct' | 'beat' | 'continuous'
```
- `direct` — rotation tracks viewer every frame
- `beat` — rotation impulse fired at each beat, slerps to target over the cycle
- `continuous` — per-frame rotation weighted by beat phase; fades to zero as the cycle completes

**Webcam setup preset** — called in `main.js`:
```js
setUpDefault(); // MacBook Pro 14" M3, webcam at top center of screen
// setUpHome(); // external monitor, offset webcam
```
To add a new preset, define it in `viewer.js` following the same pattern — set `screenSize`, `cameraPosition`, `cameraForward`, `cameraUp`.

**Geometry** — swap in `main.js`:
```js
sceneMesh = buildMesh(vertSrc, fragSrc, new TeapotGeometry(0.65));
// e.g. new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.8)
```

## UI controls

- **res slider** — scales render resolution (lower = more pixelated, faster)
- **mute button** — silences the beat-synced click sound

## Architecture

```
webcam → MediaPipe FaceLandmarker → viewer.js → animation.js → Three.js scene
                                                             ↘ audio.js
```

| File | Purpose |
|---|---|
| `main.js` | Init, render loop, Three.js scene setup |
| `viewer.js` | Face tracking → world-space viewer position, forward, distance |
| `animation.js` | Three animation modes, beat timing, camera + rotation update |
| `audio.js` | Beat-synced click sound, mute control |
| `geometry.js` | Shader geometry preprocessing (`buildMesh`) |
| `export-shader/` | Anisotropic noise GLSL shader |

## Tech

- [Three.js](https://threejs.org) — WebGL renderer
- [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — real-time face tracking
- Custom anisotropic noise GLSL shader (see `export-shader/setup.md`)
- Web Audio API — beat-synced sound
