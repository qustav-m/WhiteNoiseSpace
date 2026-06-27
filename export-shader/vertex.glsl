attribute vec2 aBary;
attribute float aEdgeLenAB;
attribute float aEdgeLenAC;
attribute float aTriSeed;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vBary;
varying float vEdgeLenAB;
varying float vEdgeLenAC;
varying float vTriSeed;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  vBary = aBary;
  vEdgeLenAB = aEdgeLenAB;
  vEdgeLenAC = aEdgeLenAC;
  vTriSeed = aTriSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
