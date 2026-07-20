# White Noise Space

An interactive browser application where 3D objects are hidden in procedural white noise and only become visible through motion. The viewer's face position — tracked in real time via webcam — rotates the object and adjusts the camera, making the noise shift and reveal the object's shape.

## Setup

```bash
npm install
bash download_model.sh   # downloads face detection model (~8MB, one-time)
npm start                # dev server at http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in a browser with webcam access.

## How it works

- A Utah teapot (or any 3D geometry) is rendered with an anisotropic white noise shader — statistically identical to the background at rest
- Head movement tracked via MediaPipe FaceLandmarker rotates the object; the noise shifts with it, making the shape visible through motion
- Viewer distance drives the digital camera position to keep the apparent object size roughly constant
- In continuous mode, rotation is driven by a BPM beat system: head movement is weighted by beat phase and decays over the cycle

## Configuration

**BPM and beat timing** — set in `animation.ts`:
```ts
export const BPM: number = 60;
```

**Animation mode** — also in `animation.ts`, change the default:
```ts
let mode: Mode = 'continuous'; // 'direct' | 'continuous'
```
- `direct` — rotation tracks viewer every frame
- `continuous` — per-frame rotation weighted by beat phase; fades to zero as the cycle completes

**Webcam setup preset** — called in `main.ts`:
```ts
setUpDefault(); // MacBook Pro 14" M3, webcam at top center of screen
// setUpHome(); // external monitor, offset webcam
```
To add a new preset, define it in `viewer.ts` following the same pattern — set `screenSize`, `cameraPosition`, `cameraForward`, `cameraUp`.

**Geometry** — swap in `main.ts`:
```ts
sceneMesh = buildMesh(vertSrc, fragSrc, new TeapotGeometry(0.65));
// e.g. new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.8)
```

## UI controls

- **res slider** — scales render resolution (lower = more pixelated, faster)
- **mute button** — silences all audio
- **mode button** — toggles between direct and continuous animation mode

## Architecture

```
webcam → MediaPipe FaceLandmarker → viewer.ts → animation.ts → Three.js scene
                                                             ↘ audio.ts
```

| File | Purpose |
|---|---|
| `main.ts` | Init, render loop, Three.js scene setup |
| `viewer.ts` | Face tracking → world-space viewer position, forward, distance |
| `animation.ts` | Two animation modes, beat timing, camera + rotation update |
| `audio.ts` | Looped noise playback, beat-synced click, mute control |
| `geometry.ts` | Shader geometry preprocessing (`buildMesh`) |
| `export-shader/` | Anisotropic noise GLSL shader |

## Tech

- [Three.js](https://threejs.org) — WebGL renderer
- [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — real-time face tracking
- [Vite](https://vite.dev) — dev server and bundler
- TypeScript
- Custom anisotropic noise GLSL shader (see `export-shader/setup.md`)
- Web Audio API — looped noise file + beat-synced click
