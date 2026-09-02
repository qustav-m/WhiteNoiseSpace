# White Noise Space

An interactive browser game where 3D objects are hidden in procedural white noise and only become visible through motion. The viewer's face — tracked in real time via webcam — rotates the object, making the noise shift and reveal its shape. Once upright, a color reveal sequence plays before the next object loads.

## Setup

```bash
npm install
bash download_model.sh   # downloads face detection model (~8MB, one-time)
npm start                # dev server at http://localhost:5173
```

> **3D models are not included in this repository.** Add GLB files to a `scenes/` folder (not part of the repo) in the project root — they will be picked up automatically. Per-model scale and rotation can be configured in `sceneConfig.ts`.

Open [http://localhost:5173](http://localhost:5173) in a browser with webcam access.

## How it works

- 3D objects (loaded from GLB files) are rendered with an anisotropic white noise shader — statistically identical to the background at rest
- Head movement tracked via MediaPipe FaceLandmarker rotates the object; the noise shifts with it, making the shape visible through motion
- As the object approaches upright, a grayscale PBR render fades in through the noise
- When upright, a completion sequence auto-rotates the object to face the camera, fades in full color, then transitions to the next object

## Configuration

**Per-model scale and rotation** — edit `sceneConfig.ts`:
```ts
const overrides: Record<string, SceneOverride> = {
  'myObject.glb': { scale: 1.5, rotationX: 90 },
};
```

**Webcam setup preset** — called in `main.ts`:
```ts
setUpDefault(); // MacBook Pro 14" M3, webcam at top center of screen
// setUpHome(); // external monitor, offset webcam
```

## UI controls

- **res slider** — scales render resolution (lower = more pixelated, faster)
- **BPM slider** — sets beat timing for head movement gating
- **mute button** — silences all audio
- **restart button** — restarts the game loop from the first object
- **`d` key** — toggle debug mode (shows objects in PBR at identity rotation, no noise)
- **`n` key** — cycle to next model (debug mode only)

## Architecture

```
webcam → MediaPipe FaceLandmarker → viewer.ts → ModeController → RenderPipeline → screen
                                                               ↘ audio.ts
```

| File | Purpose |
|---|---|
| `main.ts` | Init, render loop, debug mode |
| `viewer.ts` | Face tracking → world-space viewer position |
| `modeController.ts` | Mode orchestration, game loop, audio triggering |
| `renderPipeline.ts` | Three.js scenes, render targets, blit shader, mesh cycling |
| `modeGaming.ts` | Interactive rotation phase |
| `modeCompletion.ts` | Color reveal sequence |
| `modeTransition.ts` | Frozen capture fade between objects |
| `sceneConfig.ts` | Per-GLB scale and rotation overrides |
| `geometry.ts` | Noise shader geometry preprocessing |
| `audio.ts` / `audioPlayer.ts` | Web Audio playback |
| `export-shader/` | Anisotropic noise GLSL shader |

## Tech

- [Three.js](https://threejs.org) — WebGL renderer
- [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — real-time face tracking
- [Vite](https://vite.dev) — dev server and bundler
- TypeScript
- Custom anisotropic noise GLSL shader (see `export-shader/setup.md`)
- Web Audio API — looped noise + beat-synced drum
