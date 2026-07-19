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

## Tech

- [Three.js](https://threejs.org) — WebGL renderer
- [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — real-time face tracking
- Custom anisotropic noise GLSL shader (see `export-shader/`)
