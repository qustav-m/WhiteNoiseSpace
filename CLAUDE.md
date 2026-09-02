# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**White Noise Space** — an interactive browser game where 3D objects are hidden in procedural white noise. The viewer's face (tracked via webcam) rotates the object through head movement. Objects start at a random non-upright rotation; the viewer must rotate the object until its local up aligns with world up. As the object approaches upright, a grayscale PBR render fades in through the noise. When close enough to upright, a completion sequence triggers: the object auto-rotates to face the camera, color and saturation fade in, and the full PBR render is revealed briefly before the next object loads.

## Setup

```bash
npm install            # install dependencies (Three.js, MediaPipe, Vite, TypeScript)
bash download_model.sh # download face detection model (~8MB, one-time)
npm start              # dev server at http://localhost:5173
```

**3D models are not included in this repository.** Add GLB files to a `scenes/` folder in the project root — they are picked up automatically via `import.meta.glob`. Per-model scale and rotation are configured in `sceneConfig.ts`.

## Architecture

**Pipeline:** webcam → MediaPipe FaceLandmarker → viewer world position → ModeController (mode system) → Three.js scene (rotation + camera) + dual render targets (noise shader + PBR shader) → blit shader (blend formula)

### Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Canvas, hidden video, resolution slider, mute button |
| [main.ts](main.ts) | Init, render loop, debug mode (`d` = toggle, `n` = next model) |
| [viewer.ts](viewer.ts) | Viewer tracking: `calculateViewer`, setup functions, viewer state |
| [geometry.ts](geometry.ts) | `addTriangleAttribs`, `buildMesh` — noise shader geometry preprocessing |
| [frameState.ts](frameState.ts) | Types: `ViewerState`, `SceneState`, `FrameState` |
| [mode.ts](mode.ts) | Abstract `AnimationMode` base class |
| [modeGaming.ts](modeGaming.ts) | Interactive phase — head movement rotates object, angle drives blend |
| [modeCompletion.ts](modeCompletion.ts) | Completion sequence — auto-rotation to upright + facing camera, saturation reveal |
| [modeTransition.ts](modeTransition.ts) | Transition phase — frozen capture fades to noise before next round |
| [modeController.ts](modeController.ts) | Orchestrates modes, applies `FrameState` to scene, manages game loop |
| [renderPipeline.ts](renderPipeline.ts) | All Three.js rendering: scenes, render targets, blit shader, mesh management |
| [sceneConfig.ts](sceneConfig.ts) | Per-GLB scale multiplier and rotation overrides |
| [audio.ts](audio.ts) | Audio setup: noise player + drum player |
| [audioPlayer.ts](audioPlayer.ts) | `AudioPlayer` — loads and plays an audio buffer with gain control |
| [noise.mp3](noise.mp3) | Looped noise sound, gain driven by rotation speed |
| [drumHit.mp3](drumHit.mp3) | One-shot beat sound, fired on each beat in game phase |
| [export-shader/vertex.glsl](export-shader/vertex.glsl) | Vertex shader — passes triangle attributes |
| [export-shader/fragment.glsl](export-shader/fragment.glsl) | Anisotropic noise fragment shader |
| [export-shader/setup.md](export-shader/setup.md) | Shader integration guide |
| [models/face_landmarker.task](models/face_landmarker.task) | MediaPipe model (not in git, run `download_model.sh`) |

### Coordinate system (world space)

```
x = toward viewer (depth)
y = up
z = right
Screen fixed at origin, screen normal = +x
```

### Game loop

1. **Gaming phase (`modeGaming`)** — object starts at a random rotation where local up is far from world up. Head movement rotates the object. The noise/PBR blend is driven by the angle between the object's local up and world up. Beat timing gates movement weight. Noise audio plays proportional to head movement speed.

2. **Completion phase (`modeCompletion`)** — triggers when the angle between local up and world up falls below `completionThresholdDeg` (default 10°). The object auto-rotates toward upright (anchor identity quaternion) + camera-facing, camera animates to `targetCameraX`, saturation fades in. After `holdDuration` ms at full reveal, transitions to transition phase.

3. **Transition phase (`modeTransition`)** — a frozen capture of the completed reveal fades back to noise while the next object is already loaded. After `duration` ms, switches to a new gaming phase with the next model.

### 3D Models

Models are GLB files in `scenes/` (not tracked in git). `main.ts` discovers them via `import.meta.glob('./scenes/*.glb')`, loads all at startup with `GLTFLoader`, extracts the first mesh geometry from each, and passes the array to `RenderPipeline`.

`sceneConfig.ts` maps filenames to per-model overrides: `scale` (multiplier on top of normalized size), `rotationX/Y/Z` (degrees). Defaults: `scale: 1`, all rotations `0`.

Each model gets two pre-built meshes (noise shader + PBR), both stored in `RenderPipeline`. The scene hierarchy is:

```
noiseScene / pbrScene
  └── anchor  (game rotation — quaternion set by ModeController each frame)
        └── mesh  (static scale + rotation from sceneConfig, set once at load)
```

`anchor.quaternion = identity` means "upright, front facing camera" — the completion target. The mesh's own rotation corrects for the GLB's export orientation.

`RenderPipeline.switchToNextScene()` swaps the current noise+PBR mesh pair out of the anchors and puts the next pair in. `ModeController.switchToNextScene()` calls this and applies a new random rotation to the anchor.

### Viewer tracking (`viewer.ts`)

MediaPipe provides the face transform matrix in camera space. `calculateViewer` converts this to world space using the physical webcam position (`cameraPosition`) and orientation (`cameraForward`, `cameraUp`). Two setup presets:

- `setUpDefault()` — MacBook Pro 14" M3, webcam at top center of screen
- `setUpHome()` — external monitor setup

Exports: `viewerPosition`, `viewerForward`, `viewerUp`, `viewerDistance`, `faceDetected` (all live bindings).

### Noise shader (`export-shader/`)

Anisotropic noise shader — procedural white noise bound to triangle geometry. Uses a Jacobian/ellipse approach to maintain statistical uniformity at all viewing angles and distances (see `export-shader/setup.md` for full details).

`geometry.ts` preprocesses every geometry before use: converts to non-indexed, bakes per-triangle barycentric coordinates and edge lengths as vertex attributes (`aBary`, `aEdgeLenAB`, `aEdgeLenAC`, `aTriSeed`). World scale is applied in the vertex shader via `length(modelMatrix[0].xyz)`.

Use `THREE.ShaderMaterial` (not `RawShaderMaterial`) — Three.js injects built-in uniforms and GLSL1 compat macros.

### Render pipeline (`renderPipeline.ts`)

Two render targets (noise + PBR) plus a capture target, all at scaled resolution (res slider). Blitted to the full canvas via an orthographic camera and a custom blit shader:

```
noiseRenderTarget    →  blit shader  →  screen
pbrRenderTarget      ↗
pbrCaptureTarget     ↗
```

Blit shader 3-step blend chain:

```glsl
// Step 1: color or grayscale PBR
pbrValue = max(pbr.r, pbr.g, pbr.b)
pbrWithColor = mix(vec3(pbrValue), pbr, pbrColorBlend)   // 0 = grayscale, 1 = full color

// Step 2: live PBR or frozen capture
pbrOrCapture = mix(pbrWithColor, capture, captureBlend)  // 0 = live, 1 = frozen

// Step 3: noise or PBR/capture
finalColor = mix(noise, pbrOrCapture, grayscalePbrNoiseBlend)  // 0 = noise, 1 = PBR
```

`NearestFilter` on render targets preserves per-pixel noise shader correctness.

`takeCapture()` renders the blit scene to `pbrCaptureTarget` (freezing the current output). Called at the moment `modeCompletion` signals transition, before the new mesh is loaded.

### Frame data flow

`FrameState` is the return value of every mode's `computeFrame()`:

```typescript
interface FrameState {
  cameraX: number;
  rotation: THREE.Quaternion;
  pbrColorBlend: number;          // 0 = grayscale PBR, 1 = full color PBR
  captureBlend: number;           // 0 = live PBR pipeline, 1 = frozen capture
  grayscalePbrNoiseBlend: number; // 0 = noise only, 1 = PBR/capture
  noiseGain: number;
  fireBeat: boolean;
  modeChange: 'startCompletionMode' | 'startTransitionMode' | 'startGamingMode' | null;
}
```

`ModeController.update()` builds `ViewerState` and `SceneState`, calls `currentMode.computeFrame()`, handles `modeChange` transitions, applies the result to the Three.js camera and anchor, fires audio events, and calls `renderPipeline.setBlends()`.

### ModeController (`modeController.ts`)

- Owns mode instances and transitions between them
- Computes `speedFactor` (head movement speed, clamped [0,1]) and injects it into `ViewerState`
- Imports and holds a reference to `RenderPipeline` (set via `initialize(renderPipeline)`)
- On `startTransitionMode`: calls `renderPipeline.takeCapture()`, then `switchToNextScene()`, then creates `TransitionMode`
- On `startGamingMode`: creates a new `GamingMode`
- `initialize(renderPipeline)` sets up the first scene and gaming mode; also called by the restart button

### Interpolation functions

Each mode file defines its own `interpolationCurve(t: number): number` at the top — the single place to tune the visual feel of that phase.

- **`modeGaming`** — `interpolationCurve` called via `blendFromAngle(angleDeg)`: `interpolationCurve(angleDeg / 180)` → `grayscalePbrNoiseBlend`
- **`modeCompletion`** — `interpolationCurve(elapsed / activeDuration)` drives rotation slerp, camera X lerp, `pbrColorBlend`, and noise gain in lockstep
- **`modeTransition`** — `interpolationCurve(elapsed / duration)` drives `grayscalePbrNoiseBlend` from 1→0 (fade to noise) while `captureBlend = 1`

### Audio (`audio.ts`, `audioPlayer.ts`)

`AudioPlayer` wraps a decoded `AudioBuffer` with a `GainNode`. `initAudio()` loads two players: noise (looped) and drum (one-shot).

- **Noise gain** — set every frame from `frame.noiseGain`; proportional to movement speed. Ramped smoothly via `cancelAndHoldAtTime` + `linearRampToValueAtTime`.
- **Drum** — fired on `frame.fireBeat` (gaming phase only, beat-synced).

Signal chain: `source → gainNode → destination`

### Style guide

See [STYLE.md](STYLE.md).
