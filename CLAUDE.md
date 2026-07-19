# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**White Noise Space** — an interactive browser application where 3D objects are hidden in procedural white noise and only become visible through motion. The viewer's face position (tracked via webcam) drives the scene: head movement rotates the object, and viewer distance controls the digital camera position.

## Setup

```bash
npm install            # install dependencies (Three.js, MediaPipe)
bash download_model.sh # download face detection model (~8MB, one-time)
npm start              # serve at http://localhost:3000
```

## Architecture

**Pipeline:** webcam → MediaPipe FaceLandmarker → viewer world position → Three.js scene (rotation + camera) + GLSL noise shader

### Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Canvas, hidden video, resolution slider UI |
| [main.js](main.js) | Init, render loop, Three.js scene setup |
| [viewer.js](viewer.js) | Viewer tracking: `calculateViewer`, setup functions, viewer state |
| [geometry.js](geometry.js) | `addTriangleAttribs`, `buildMesh` — shader geometry preprocessing |
| [animation.js](animation.js) | Camera movement, beat-driven animation (in progress) |
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

### Viewer tracking (`viewer.js`)

MediaPipe provides the face transform matrix in camera space. `calculateViewer` converts this to world space using the physical webcam position (`cameraPosition`) and orientation (`cameraForward`, `cameraUp`). Two setup presets:

- `setUpDefault()` — MacBook Pro 14" M3, webcam at top center of screen
- `setUpHome()` — external monitor setup

Exports: `viewerPosition`, `viewerForward`, `viewerUp`, `viewerDistance` (all live bindings).

### Shader (`export-shader/`)

Anisotropic noise shader — procedural white noise bound to triangle geometry. Uses a Jacobian/ellipse approach to maintain statistical uniformity at all viewing angles and distances (see `export-shader/setup.md` for full details).

`geometry.js` preprocesses every geometry before use: converts to non-indexed, bakes per-triangle barycentric coordinates and edge lengths as vertex attributes (`aBary`, `aEdgeLenAB`, `aEdgeLenAC`, `aTriSeed`). World scale is applied in the vertex shader via `length(modelMatrix[0].xyz)`.

Use `THREE.ShaderMaterial` (not `RawShaderMaterial`) — Three.js injects built-in uniforms and GLSL1 compat macros.

### Render pipeline

Scene renders to a `WebGLRenderTarget` at scaled resolution (controlled by the res slider), then blits to full canvas via an orthographic camera. `NearestFilter` preserves per-pixel shader correctness.

### Animation (`animation.js`)

`moveDigitalCamera(camera)` maps viewer distance (cm) to camera x-position (scene units) using `cmPerUnit = 10`. As the viewer moves closer, the camera moves away from the teapot, keeping apparent size roughly constant.

Beat-driven rotation system (planned): at each BPM beat, sample the head position delta since the last beat. `delta.z` (horizontal) drives yaw, `delta.y` (vertical) drives pitch. The impulse decays over the cycle via a swappable curve. Same target-stepping pattern used for camera distance.
