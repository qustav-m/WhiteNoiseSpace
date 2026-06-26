#!/bin/bash
mkdir -p models
curl -L "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" \
     -o models/face_landmarker.task \
     --progress-bar
echo "Done."
