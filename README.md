# White Noise Space

An interactive browser game where 3D objects are hidden in procedural white noise and only become visible through motion. The viewer's face — tracked in real time via webcam — rotates the object, making the noise shift and reveal its shape. Once upright, a color reveal sequence plays before the next object loads.

## Setup

```bash
npm install
bash download_model.sh   # downloads face detection model (~8MB, one-time)
npm start                # dev server at http://localhost:5173
```

**Environment map** — not included (67 MB). Place an equirectangular EXR as `environmentMap/environmentMap.exr`. Any HDR from [Poly Haven](https://polyhaven.com/hdris) works; download as EXR at any resolution.

> **3D models are not included in this repository.** Add GLB files to a `scenes/` folder in the project root — they will be picked up automatically. Per-model scale and rotation can be configured in `src/sceneConfig.ts`.

Open [http://localhost:5173](http://localhost:5173) in a browser with webcam access.

## How it works

- 3D objects (loaded from GLB files) are rendered with an anisotropic white noise shader — statistically identical to the background at rest
- Head movement tracked via MediaPipe FaceLandmarker rotates the object; the noise shifts with it, making the shape visible through motion
- As the object approaches upright, a grayscale PBR render fades in through the noise
- When upright, a completion sequence auto-rotates the object to face the camera and fades in full color; the next object loads in the background, then a fade to noise transitions to the next round

## Configuration

**Per-model scale and rotation** — edit `sceneConfig.ts`:
```ts
const overrides: Record<string, SceneOverride> = {
  'myObject.glb': { scale: 1.5, rotationX: 90 },
};
```

**Webcam setup preset** — called in `src/main.ts`:
```ts
setUpDefault(); // MacBook Pro 14" M3, webcam at top center of screen
// setUpHome(); // external monitor, offset webcam
```

## UI controls

UI lives in a black panel on the right side of the screen. Press `i` to hide/show it.

- **mute button** — silences all audio
- **BPM slider** — sets beat timing for head movement gating
- **noise w/h** — render target pixel dimensions for the noise shader
- **pbr w/h** — render target pixel dimensions for the PBR shader
- **grid w/h** — stochastic composite grid size (cells that flip together); copy noise → grid button syncs them
- **`d` key** — toggle debug mode (shows objects in PBR at identity rotation, no noise)
- **`n` key** — cycle to next model (debug mode only)
- **`i` key** — toggle UI panel visibility

## Architecture

```
webcam → MediaPipe FaceLandmarker → viewer.ts → ModeController → RenderPipeline → screen
                                                               ↘ audioEngine/audio.ts
```

| File | Purpose |
|---|---|
| `src/main.ts` | Init, render loop, debug mode |
| `src/viewer.ts` | Face tracking → world-space viewer position |
| `src/modes/modeController.ts` | Mode orchestration, game loop, audio triggering |
| `src/renderPipeline.ts` | Three.js scenes, render targets, composite shader |
| `src/sceneLoader.ts` | Lazy GLB loading — one model preloaded at a time |
| `src/modes/gamingMode.ts` | Interactive rotation phase |
| `src/modes/completionMode.ts` | Color reveal sequence |
| `src/modes/captureHoldMode.ts` | Holds frozen capture while next model loads |
| `src/modes/transitionMode.ts` | Frozen capture fade to noise |
| `src/sceneConfig.ts` | Per-GLB scale and rotation overrides |
| `src/environmentMap.ts` | Loads EXR env map for PBR background + specular |
| `src/meshBuilder/noiseMeshBuilder.ts` | Noise shader geometry preprocessing |
| `src/meshBuilder/pbrMeshBuilder.ts` | Custom Cook-Torrance PBR shader material |
| `src/audioEngine/` | Web Audio playback |
| `src/shader/noise-shader/` | Anisotropic noise GLSL shader |
| `src/shader/pbr-shader/` | PBR GLSL shader + env map background |
| `src/shader/composite-shader/` | Stochastic blend: noise ↔ grayscale PBR ↔ full-color PBR, quantized to grid |

## Tech

- [Three.js](https://threejs.org) — WebGL renderer
- [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — real-time face tracking
- [Vite](https://vite.dev) — dev server and bundler
- TypeScript
- Custom anisotropic noise GLSL shader (see `noiseShader.md`)
- Custom Cook-Torrance PBR GLSL shader with equirectangular EXR env map
- Web Audio API — looped noise + beat-synced drum
