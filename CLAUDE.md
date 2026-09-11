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

**Pipeline:** webcam → MediaPipe FaceLandmarker → viewer world position → ModeController (mode system) → Three.js scene (rotation + camera) + dual render targets (noise shader + PBR shader) → composite shader (blend formula)

### Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Canvas, hidden video, mute button, BPM slider, resolution inputs, black UI panel |
| [src/main.ts](src/main.ts) | Init, render loop, debug mode (`d` = toggle, `n` = next model) |
| [src/viewer.ts](src/viewer.ts) | Viewer tracking: `calculateViewer`, setup functions, viewer state |
| [src/environmentMap.ts](src/environmentMap.ts) | Loads EXR equirectangular env map via `EXRLoader`; `getEnvironmentMap()` returns the texture |
| [src/renderPipeline.ts](src/renderPipeline.ts) | Three.js rendering: scenes, render targets, composite shader |
| [src/sceneLoader.ts](src/sceneLoader.ts) | Lazy GLB loading: builds `LoadedModel` pairs, `getNext()` / `dispose()` |
| [src/sceneConfig.ts](src/sceneConfig.ts) | Per-GLB scale multiplier and rotation overrides |
| [src/meshBuilder/noiseMeshBuilder.ts](src/meshBuilder/noiseMeshBuilder.ts) | `addTriangleAttribs`, `buildMesh` — noise shader geometry preprocessing |
| [src/meshBuilder/pbrMeshBuilder.ts](src/meshBuilder/pbrMeshBuilder.ts) | `buildPbrMesh` — extracts GLB material textures, builds custom PBR `ShaderMaterial` |
| [src/modes/animationMode.ts](src/modes/animationMode.ts) | Abstract `AnimationMode` base class |
| [src/modes/frameState.ts](src/modes/frameState.ts) | Types: `ViewerState`, `SceneState`, `FrameState` |
| [src/modes/gamingMode.ts](src/modes/gamingMode.ts) | Interactive phase — head movement rotates object, angle drives blend |
| [src/modes/completionMode.ts](src/modes/completionMode.ts) | Completion sequence — auto-rotation to upright + facing camera, saturation reveal |
| [src/modes/captureHoldMode.ts](src/modes/captureHoldMode.ts) | Holds frozen capture while next model loads; minimum hold via `minDuration` |
| [src/modes/transitionMode.ts](src/modes/transitionMode.ts) | Fades frozen capture back to noise |
| [src/modes/modeController.ts](src/modes/modeController.ts) | Orchestrates modes, applies `FrameState` to scene, manages game loop |
| [src/audioEngine/audio.ts](src/audioEngine/audio.ts) | Audio setup: noise player + drum player |
| [src/audioEngine/audioPlayer.ts](src/audioEngine/audioPlayer.ts) | `AudioPlayer` — loads and plays an audio buffer with gain control |
| [audio/noise.mp3](audio/noise.mp3) | Looped noise sound, gain driven by rotation speed |
| [audio/drumHit.mp3](audio/drumHit.mp3) | One-shot beat sound, fired on each beat in game phase |
| [src/shader/noise-shader/vertex.glsl](src/shader/noise-shader/vertex.glsl) | Noise vertex shader — passes triangle attributes |
| [src/shader/noise-shader/fragment.glsl](src/shader/noise-shader/fragment.glsl) | Anisotropic noise fragment shader |
| [src/shader/noise-shader/background.vert.glsl](src/shader/noise-shader/background.vert.glsl) | Fullscreen quad vertex shader for noise background |
| [src/shader/noise-shader/background.frag.glsl](src/shader/noise-shader/background.frag.glsl) | Noise background fragment shader |
| [src/shader/pbr-shader/vertex.glsl](src/shader/pbr-shader/vertex.glsl) | PBR vertex shader — outputs world position, normal, tangent, bitangent |
| [src/shader/pbr-shader/fragment.glsl](src/shader/pbr-shader/fragment.glsl) | Cook-Torrance BRDF: GGX/Smith/Schlick + equirectangular env specular |
| [src/shader/pbr-shader/background.vert.glsl](src/shader/pbr-shader/background.vert.glsl) | Fullscreen quad vertex shader for PBR background |
| [src/shader/pbr-shader/background.frag.glsl](src/shader/pbr-shader/background.frag.glsl) | PBR background — reconstructs view ray from NDC, samples EXR env map |
| [src/shader/composite-shader/vertex.glsl](src/shader/composite-shader/vertex.glsl) | Composite blit vertex shader |
| [src/shader/composite-shader/fragment.glsl](src/shader/composite-shader/fragment.glsl) | 3-step blend: grayscale→color, live→capture, noise→PBR |
| [environmentMap/environmentMap.exr](environmentMap/environmentMap.exr) | EXR equirectangular environment map |
| [models/face_landmarker.task](models/face_landmarker.task) | MediaPipe model (not in git, run `download_model.sh`) |

### Coordinate system (world space)

```
x = toward viewer (depth)
y = up
z = right
Screen fixed at origin, screen normal = +x
```

### Game loop

1. **Gaming phase (`gamingMode`)** — object starts at a random rotation where local up is far from world up (60°–120° from upright). Head movement rotates the object. The noise/PBR blend is driven by the angle between the object's local up and world up. Beat timing gates movement weight. Noise audio plays proportional to head movement speed. Completion triggers when the angle stays below `acceptanceAngle` (10°) continuously for `acceptanceDuration` (500ms).

2. **Completion phase (`completionMode`)** — object auto-rotates toward upright (identity quaternion) + camera-facing, camera lerps to `targetCameraX` (0.5), saturation fades in over `activeDuration` (3000ms).

3. **Capture hold phase (`modeCaptureHold`)** — immediately after completion: takes a frozen capture of the full-color reveal, swaps in the next model (hidden behind the capture), and waits until the model after that is fully preloaded. Holds for at least `minDuration` ms.

4. **Transition phase (`modeTransition`)** — once the next model is ready: fades the frozen capture back to noise over `duration` ms, then starts a new gaming phase.

### 3D Models and lazy loading (`sceneLoader.ts`)

Models are GLB files in `scenes/` (not tracked in git). `SceneLoader` discovers them via `import.meta.glob('./scenes/*.glb')`, fetches the noise shaders, and loads models one at a time on demand.

`sceneConfig.ts` maps filenames to per-model overrides: `scale` (multiplier on top of normalized size), `rotationX/Y/Z` (degrees). Defaults: `scale: 1`, all rotations `0`.

Each loaded model is a `LoadedModel` — two `THREE.Object3D`s (one for noise, one for PBR) each containing a mesh as a child. The scene hierarchy per model:

```
noiseScene / pbrScene
  └── object  (game rotation — quaternion set by ModeController each frame)
        └── mesh  (static scale + rotation from sceneConfig, set once at load)
```

`object.quaternion = identity` means "upright, front facing camera" — the completion target. The mesh's own rotation corrects for the GLB's export orientation.

**Loading flow:** `SceneLoader` always keeps one model preloaded (`pendingModel`). `getNext()` returns it and marks `isNextReady = false`. `dispose(removedModel)` disposes the old model's GPU resources and starts loading the next one, setting `isNextReady = true` when done. At most two models exist in GPU memory at any time (current on screen + pending).

`ModeController.switchToNextScene()` calls `sceneLoader.getNext()` → `renderPipeline.switchToModel(model)` → `sceneLoader.dispose(removedModel)` in sequence, ensuring the old model is removed from the scene before disposal.

### Viewer tracking (`viewer.ts`)

MediaPipe provides the face transform matrix in camera space. `calculateViewer` converts this to world space using the physical webcam position (`cameraPosition`) and orientation (`cameraForward`, `cameraUp`). Two setup presets:

- `setUpDefault()` — MacBook Pro 14" M3, webcam at top center of screen
- `setUpHome()` — external monitor setup

Exports: `viewerPosition`, `viewerForward`, `viewerUp`, `viewerDistance`, `faceDetected` (all live bindings).

### Noise shader (`src/shader/noise-shader/`)

Anisotropic noise shader — procedural white noise bound to triangle geometry. Uses a Jacobian/ellipse approach to maintain statistical uniformity at all viewing angles and distances (see [noiseShader.md](noiseShader.md) for full details).

`noiseMeshBuilder.ts` preprocesses every geometry before use: converts to non-indexed, bakes per-triangle barycentric coordinates and edge lengths as vertex attributes (`aBary`, `aEdgeLenAB`, `aEdgeLenAC`, `aTriSeed`). World scale is applied in the vertex shader via `length(modelMatrix[0].xyz)`.

Use `THREE.ShaderMaterial` (not `RawShaderMaterial`) — Three.js injects built-in uniforms and GLSL1 compat macros.

### PBR shader (`src/shader/pbr-shader/`)

Custom Cook-Torrance BRDF with GGX distribution, Smith geometry, and Schlick Fresnel. Built in `pbrMeshBuilder.ts` as a `THREE.ShaderMaterial`.

**Lighting:** one point light (`lightPosition`, `lightIntensity` uniforms in `pbrMeshBuilder.ts`) with no distance falloff (`Li = vec3(lightIntensity)`) plus specular-only IBL from the EXR env map sampled at the reflection direction (`envSpecular * 0.7`). Ambient is a flat constant `0.2 * albedo`.

**Tangent handling:** Three.js does NOT inject `attribute vec4 tangent` for `ShaderMaterial` (only for built-in materials). It is declared explicitly in `vertex.glsl` and bound by name from `geometry.attributes.tangent`. `pbrMeshBuilder.ts` ensures tangents always exist: calls `geometry.computeTangents()` if the geometry is indexed with UVs, otherwise falls back to a dummy `(1,0,0,1)` attribute (disables normal mapping for that mesh).

**Normal mapping:** TBN matrix constructed in the fragment shader from three separate `varying vec3` (tangent, bitangent, world normal). `varying mat3` is avoided — it has GLSL1 compatibility issues in Three.js.

**Background:** `background.frag.glsl` reconstructs a view-space ray from NDC coordinates and camera FOV, rotates it to world space via the inverse of the view matrix rotation, then samples the EXR env map with `equirectUv(dir)`.

**Environment map:** loaded once in `environmentMap.ts` via Three.js `EXRLoader` with `EquirectangularReflectionMapping`. Passed as a `sampler2D` uniform to both the PBR mesh shader and the background shader.

### Render pipeline (`src/renderPipeline.ts`)

Two render targets (noise + PBR, each independently sized) plus a capture target. Composited to the full canvas via an orthographic camera and a custom composite shader. Resolution controlled via three pairs of UI inputs: noise render target, PBR render target, and composite grid (see below).

```
noiseRenderTarget    →  composite shader  →  screen
pbrRenderTarget      ↗
pbrCaptureTarget     ↗
```

Composite shader blend chain (`src/shader/composite-shader/fragment.glsl`):

```glsl
// Step 1: color or grayscale PBR
pbrValue = max(pbr.r, pbr.g, pbr.b)
pbrWithColor = mix(vec3(pbrValue), pbr, pbrColorBlend)   // 0 = grayscale, 1 = full color

// Step 2: live PBR or frozen capture
pbrOrCapture = mix(pbrWithColor, capture, captureBlend)  // 0 = live, 1 = frozen

// Step 3: stochastic threshold — per-fragment random value, quantized to grid
pixelUv = floor(vUv * resolution) / resolution
rand = hash(pixelUv + fract(time))
finalColor = grayscalePbrNoiseBlend > rand ? pbrOrCapture : noise
```

`time` increments by `0.01` each frame in `render()` — controls flicker speed. `hash()` is a sin-based 2D hash. `resolution` is a `vec2` uniform set by `setCompositeGridResolution(w, h)` — UVs are quantized to a `w×h` grid so whole cells flip together, giving a blocky pixel-art dissolve effect independent of the render target size. The composite itself always runs at full screen resolution.

`NearestFilter` on render targets preserves per-pixel noise shader correctness.

`takeCapture()` renders the composite scene to `pbrCaptureTarget` (freezing the current output). Called when `completionMode` signals `startCaptureHoldMode`, before the new model is swapped in.

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
  modeChange: 'startCompletionMode' | 'startCaptureHoldMode' | 'startTransitionMode' | 'startGamingMode' | null;
}
```

`ModeController.update()` builds `ViewerState` and `SceneState`, calls `currentMode.computeFrame()`, handles `modeChange` transitions, applies the result to the Three.js camera and anchor, fires audio events, and calls `renderPipeline.setBlends()`.

### ModeController (`src/modes/modeController.ts`)

- Owns mode instances and transitions between them
- Computes `speedFactor` (head movement speed, clamped [0,1]) and injects it into `ViewerState`
- Holds references to `RenderPipeline` and `SceneLoader` (set via `initialize(renderPipeline, sceneLoader)`)
- On `startCaptureHoldMode`: calls `renderPipeline.takeCapture()`, then `switchToNextScene()`, then creates `CaptureHoldMode`
- On `startTransitionMode`: only acts when `sceneLoader.isNextReady` — creates `TransitionMode`
- On `startGamingMode`: creates a new `GamingMode`
- `switchToNextScene()`: calls `sceneLoader.getNext()` → `renderPipeline.switchToModel()` → `sceneLoader.dispose(removedModel)` → applies random start rotation
- `initialize(renderPipeline, sceneLoader)` sets up the first scene and gaming mode

### Interpolation functions

Each mode file defines its own `interpolationCurve(t: number): number` at the top — the single place to tune the visual feel of that phase.

- **`gamingMode`** — `interpolationCurve(t) = t**16` called via `blendFromAngle(angleDeg)`: normalizes angle to [0,1] over range `[acceptanceAngle, 180°]` then applies curve → `grayscalePbrNoiseBlend`
- **`completionMode`** — `interpolationCurve(t) = min(t*2, 1)` drives rotation slerp, camera X lerp, `pbrColorBlend`, and noise gain in lockstep
- **`transitionMode`** — `interpolationCurve(t) = 1 - t` drives `grayscalePbrNoiseBlend` from 1→0 (fade to noise) while `captureBlend = 1`

### Audio (`audio.ts`, `audioPlayer.ts`)

`AudioPlayer` wraps a decoded `AudioBuffer` with a `GainNode`. `initAudio()` loads two players: noise (looped) and drum (one-shot).

- **Noise gain** — set every frame from `frame.noiseGain`; proportional to movement speed. Ramped smoothly via `cancelAndHoldAtTime` + `linearRampToValueAtTime`.
- **Drum** — fired on `frame.fireBeat` (gaming phase only, beat-synced).

Signal chain: `source → gainNode → destination`

### Style guide

See [STYLE.md](STYLE.md).
