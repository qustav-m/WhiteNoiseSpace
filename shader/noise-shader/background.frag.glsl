float rand(vec2 co) {
  return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  gl_FragColor = vec4(vec3(rand(floor(gl_FragCoord.xy))), 1.0);
}
