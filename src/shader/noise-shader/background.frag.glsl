uint hash(uint x) {
    x ^= x >> 17u;
    x *= 0xbf324c81u;
    x ^= x >> 11u;
    x *= 0x68bc4e25u;
    x ^= x >> 16u;
    return x;
}

float rand(uvec2 co) {
    return float(hash(co.x ^ hash(co.y))) / 4294967295.0;
}

void main() {
    gl_FragColor = vec4(vec3(rand(uvec2(gl_FragCoord.xy))), 1.0);
}
