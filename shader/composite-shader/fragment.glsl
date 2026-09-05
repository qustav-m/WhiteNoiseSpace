uniform sampler2D noiseTexture;
uniform sampler2D pbrTexture;
uniform sampler2D captureTexture;
uniform float pbrColorBlend;
uniform float captureBlend;
uniform float grayscalePbrNoiseBlend;
varying vec2 vUv;
void main() {
  vec3 noise = texture2D(noiseTexture, vUv).rgb;
  vec3 pbr = texture2D(pbrTexture, vUv).rgb;
  vec3 capture = texture2D(captureTexture, vUv).rgb;
  float pbrValue = max(pbr.r, max(pbr.g, pbr.b));
  vec3 pbrWithColor = mix(vec3(pbrValue), pbr, pbrColorBlend);
  vec3 pbrOrCapture = mix(pbrWithColor, capture, captureBlend);
  vec3 finalColor = mix(noise, pbrOrCapture, grayscalePbrNoiseBlend);
  gl_FragColor = vec4(finalColor, 1.0);
  #include <colorspace_fragment>
}
