# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A magic window / parallax effect that uses real-time webcam face tracking to shift a GLSL shader scene based on head position — making the scene feel like it exists behind the screen.

## Setup

```bash
npm install          # install MediaPipe JS library
bash download_model.sh  # download face detection model (~8MB, one-time)
npm start            # serve at http://localhost:8080
```

## Architecture

**Pipeline:** webcam → MediaPipe FaceLandmarker → head position → WebGL uniforms → GLSL fragment shader

- [index.html](index.html) — canvas + hidden video element, loads `main.js`
- [main.js](main.js) — all logic: MediaPipe setup, webcam, WebGL, render loop
- [models/face_landmarker.task](models/face_landmarker.task) — binary model file, not in git (run `download_model.sh` to get it)

## Shader uniforms

The fragment shader in `main.js` receives:

| Uniform | Type | Description |
|---|---|---|
| `u_resolution` | `vec2` | Canvas size in pixels |
| `u_time` | `float` | Seconds since start |
| `u_parallax` | `vec2` | Head offset from center, roughly `[-0.5, 0.5]` on each axis |

To swap in a custom shader, replace the `FRAG` string in `main.js`. The `u_parallax` uniform is what drives the depth/parallax — offset UVs by `u_parallax * depth` where `depth` varies per layer.

## Key values

- `SMOOTH` (main.js) — exponential smoothing factor for head position. Higher = less jitter, more lag.
- Nose tip is landmark index `1` in the 478-point MediaPipe face model.
- x is inverted: viewer moves right → scene shifts left (correct parallax behavior).
