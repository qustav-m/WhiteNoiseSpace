# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**White Noise Space** — an interactive browser application where 3D objects are hidden in procedural white noise and only become visible through motion. The viewer's face position (tracked via webcam) drives the scene: head movement rotates the object, and viewer distance controls the digital camera position.

## Setup

```bash
npm install            # install dependencies (Three.js, MediaPipe, Vite, TypeScript)
bash download_model.sh # download face detection model (~8MB, one-time)
npm start              # dev server at http://localhost:5173
```

## Architecture

**Pipeline:** webcam → MediaPipe FaceLandmarker → viewer world position → Three.js scene (rotation + camera) + GLSL noise shader

### Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Canvas, hidden video, resolution slider, mute/mode buttons |
| [main.ts](main.ts) | Init, render loop, Three.js scene setup |
| [viewer.ts](viewer.ts) | Viewer tracking: `calculateViewer`, setup functions, viewer state |
| [geometry.ts](geometry.ts) | `addTriangleAttribs`, `buildMesh` — shader geometry preprocessing |
| [animation.ts](animation.ts) | Two animation modes, beat timing, camera + rotation update |
| [audio.ts](audio.ts) | Pink noise playback, beat-synced click, mute control |
| [noise.mp3](noise.mp3) | Noise audio file, looped as the continuous sound source |
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

### Viewer tracking (`viewer.ts`)

MediaPipe provides the face transform matrix in camera space. `calculateViewer` converts this to world space using the physical webcam position (`cameraPosition`) and orientation (`cameraForward`, `cameraUp`). Two setup presets:

- `setUpDefault()` — MacBook Pro 14" M3, webcam at top center of screen
- `setUpHome()` — external monitor setup

Exports: `viewerPosition`, `viewerForward`, `viewerUp`, `viewerDistance`, `faceDetected` (all live bindings).

### Shader (`export-shader/`)

Anisotropic noise shader — procedural white noise bound to triangle geometry. Uses a Jacobian/ellipse approach to maintain statistical uniformity at all viewing angles and distances (see `export-shader/setup.md` for full details).

`geometry.ts` preprocesses every geometry before use: converts to non-indexed, bakes per-triangle barycentric coordinates and edge lengths as vertex attributes (`aBary`, `aEdgeLenAB`, `aEdgeLenAC`, `aTriSeed`). World scale is applied in the vertex shader via `length(modelMatrix[0].xyz)`.

Use `THREE.ShaderMaterial` (not `RawShaderMaterial`) — Three.js injects built-in uniforms and GLSL1 compat macros.

### Render pipeline

Scene renders to a `WebGLRenderTarget` at scaled resolution (controlled by the res slider), then blits to full canvas via an orthographic camera. `NearestFilter` preserves per-pixel shader correctness.

### Animation (`animation.ts`)

Two modes, switched via `setMode(m)`:

- **`direct`** — rotation and camera track viewer position every frame; `currentAlpha` is always 1
- **`continuous`** — per-frame rotation weighted by `(1 - progressCurve)`: full effect at beat start, fades to zero by `fadeEnd = 0.5`; camera X beat-lerped each cycle

`progressCurve(t)` maps cycleT [0,1] → alpha [0,1]: ease-out quadratic, holds at 1 after `fadeEnd`.

Camera X maps viewer distance (cm) to scene units via `cmPerUnit = 10`, clamped to `[0, maxCamDist]`.

`delta.z` (horizontal head movement) drives yaw; `delta.y` (vertical) drives pitch. Both applied in world space (premultiply).

`currentSpeed` (cm/ms) is computed each frame from head displacement over time. Exported for use in `audio.ts`.

`audioOnBeat()` from `audio.ts` is called directly at each beat fire.

### Audio (`audio.ts`)

`noise.mp3` is fetched, decoded, and looped via `AudioBufferSourceNode`. Volume is controlled by a `GainNode` driven each frame in `tick()`:

```
targetGain = speedFactor * (1 - currentAlpha) * 0.3
```

- `speedFactor` — head movement speed, clamped to [0, 1]
- `(1 - currentAlpha)` — fades out as the beat cycle holds

Gain is ramped smoothly using `cancelAndHoldAtTime` + `linearRampToValueAtTime` to avoid stepped artifacts.

`initNoise()` must be awaited during startup (called in `main.ts`) before the render loop starts.
