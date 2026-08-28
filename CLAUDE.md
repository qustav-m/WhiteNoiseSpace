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

## Architecture

**Pipeline:** webcam → MediaPipe FaceLandmarker → viewer world position → SceneController (mode system) → Three.js scene (rotation + camera) + dual render targets (noise shader + PBR shader) → blit shader (blend formula)

### Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Canvas, hidden video, resolution slider, mute button |
| [main.ts](main.ts) | Init, render loop, Three.js scene setup, render targets, blit shader |
| [viewer.ts](viewer.ts) | Viewer tracking: `calculateViewer`, setup functions, viewer state |
| [geometry.ts](geometry.ts) | `addTriangleAttribs`, `buildMesh` — noise shader geometry preprocessing |
| [frameState.ts](frameState.ts) | Types: `ViewerState`, `SceneState`, `FrameState` |
| [mode.ts](mode.ts) | Abstract `AnimationMode` base class |
| [modeGame.ts](modeGame.ts) | Interactive phase — head movement rotates object, angle drives blend |
| [modeComplete.ts](modeComplete.ts) | Completion sequence — auto-rotation to upright + facing camera, saturation reveal |
| [sceneController.ts](sceneController.ts) | Orchestrates modes, applies `FrameState` to scene, manages game loop |
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

1. **Game phase (`modeGame`)** — object starts at a random rotation where local up is far from world up. Head movement rotates the object. The noise/PBR blend is driven by the angle between the object's local up and world up. Beat timing gates movement weight. Noise audio plays proportional to head movement speed.

2. **Completion phase (`modeComplete`)** — triggers when the angle between local up and world up falls below `completionThresholdDeg` (default 10°). The object auto-rotates toward upright + camera-facing, camera animates to `targetCameraX`, saturation fades in. Noise audio plays proportional to the auto-rotation speed. After `holdDuration` ms at full reveal, the next object loads and the loop restarts.

### 3D Models

Models are loaded as glTF files. Each model is wrapped in an anchor `Object3D`:

```
scene
  └── anchor  (gameplay rotation — controlled by SceneController)
        └── coordinateAdapter  (static rotation — maps glTF axes to world axes)
              └── glTF scene
```

The `SceneController` applies `frame.rotation` to the anchor's quaternion. The `coordinateAdapter` is set once per model to align glTF's natural orientation with world space (local Y = world Y, local front = toward camera). This way `anchor.quaternion = identity` means "upright, front facing camera" — the completion target.

Models are stored in an array and cycled sequentially. Each round starts with a random quaternion applied to the anchor (guaranteed to be far from upright, between `startAngleMinDeg` and `startAngleMaxDeg`).

### Viewer tracking (`viewer.ts`)

MediaPipe provides the face transform matrix in camera space. `calculateViewer` converts this to world space using the physical webcam position (`cameraPosition`) and orientation (`cameraForward`, `cameraUp`). Two setup presets:

- `setUpDefault()` — MacBook Pro 14" M3, webcam at top center of screen
- `setUpHome()` — external monitor setup

Exports: `viewerPosition`, `viewerForward`, `viewerUp`, `viewerDistance`, `faceDetected` (all live bindings).

### Noise shader (`export-shader/`)

Anisotropic noise shader — procedural white noise bound to triangle geometry. Uses a Jacobian/ellipse approach to maintain statistical uniformity at all viewing angles and distances (see `export-shader/setup.md` for full details).

`geometry.ts` preprocesses every geometry before use: converts to non-indexed, bakes per-triangle barycentric coordinates and edge lengths as vertex attributes (`aBary`, `aEdgeLenAB`, `aEdgeLenAC`, `aTriSeed`). World scale is applied in the vertex shader via `length(modelMatrix[0].xyz)`.

Use `THREE.ShaderMaterial` (not `RawShaderMaterial`) — Three.js injects built-in uniforms and GLSL1 compat macros.

### Render pipeline

Two render targets at scaled resolution (res slider), blitted to the full canvas via an orthographic camera and a custom blit shader:

```
noiseRenderTarget  →  blit shader  →  screen
pbrRenderTarget    ↗
```

Blit shader blend formula:

```glsl
gray = luminance(pbr)
noiseMix = mix(noise, gray, blendFactor)   // angle-driven in game, 1 in complete
final = mix(noiseMix, pbr, saturation)     // 0 in game, time-driven in complete
```

`NearestFilter` on render targets preserves per-pixel noise shader correctness.

### Interpolation functions

Each mode file defines its own `interpolationCurve(t: number): number` function at the top — the single place to tune the visual feel of that phase. Both take `t ∈ [0, 1]` and return `[0, 1]`.

- **`modeGame`** — `interpolationCurve` is called via `blendFromAngle(angleDeg)` which normalizes first: `interpolationCurve(angleDeg / 180)`. The result is the `blendFactor` sent to the blit shader.

- **`modeComplete`** — `interpolationCurve` is called with time progress `t = elapsed / activeDuration`. Its output drives rotation (slerp toward target), camera X (lerp toward `targetCameraX`), saturation, and noise gain — all in lockstep on the same curve.

### Frame data flow

`FrameState` is the return value of every mode's `computeFrame()`:

```typescript
interface FrameState {
  cameraX: number;
  rotation: THREE.Quaternion;
  blendFactor: number; // 0 = noise only, 1 = grayscale PBR
  saturation: number;  // 0 = grayscale, 1 = full color PBR
  noiseGain: number;
  fireBeat: boolean;
}
```

`SceneController.update()` builds `ViewerState` and `SceneState` from current live values, calls `currentMode.computeFrame()`, applies the result to the Three.js camera and mesh, fires audio events, and checks mode-transition conditions.

### SceneController (`sceneController.ts`)

- Owns the mode instances and transitions between them
- Computes `speedFactor` (head movement speed, clamped [0,1]) and injects it into `ViewerState`
- On game phase: checks if angle < `completionThresholdDeg` → switches to `CompleteMode`
- On complete phase: checks `CompleteMode.isFinished` → calls `startNewRound()` (random rotation + new `GameMode`)
- Applies pending rotation to mesh at round start
- Exposes `blendFactor` and `saturation` getters for the blit shader uniforms

### Audio (`audio.ts`, `audioPlayer.ts`)

`AudioPlayer` wraps a decoded `AudioBuffer` with a `GainNode`. `initAudio()` loads two players: noise (looped) and drum (one-shot).

- **Noise gain** — set every frame from `frame.noiseGain`; proportional to movement speed (head in game phase, auto-rotation angular velocity in complete phase). Ramped smoothly via `cancelAndHoldAtTime` + `linearRampToValueAtTime`.
- **Drum** — fired on `frame.fireBeat` (game phase only, beat-synced).

Signal chain: `source → gainNode → destination`

### Style guide

See [STYLE.md](STYLE.md).
