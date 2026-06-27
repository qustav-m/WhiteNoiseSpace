# Anisotropic noise shader — setup guide

This shader renders procedural white noise on 3D geometry. The noise is statistically
uniform at every viewing angle and distance thanks to anisotropic mipmapping: at grazing
angles the footprint of one screen pixel covers a long thin ellipse in UV space, and the
shader samples along that ellipse so the result stays white rather than going grey.

## Files

- `vertex.glsl` — vertex shader; passes four custom per-triangle attributes to the fragment stage
- `fragment.glsl` — fragment shader; generates the noise

## What the shader needs from JS

### 1. Install vite-plugin-glsl (if using Vite)

```js
// vite.config.js
import glsl from 'vite-plugin-glsl';
export default { plugins: [glsl()] };
```

Without it, import the GLSL files as raw strings via `?raw` or read them with `fs.readFileSync`.

### 2. Create the material

```js
import * as THREE from 'three';
import vertSrc from './vertex.glsl';
import fragSrc from './fragment.glsl';

const material = new THREE.RawShaderMaterial({
  vertexShader:   vertSrc,
  fragmentShader: fragSrc,
  glslVersion: THREE.GLSL3,  // required — shader uses uint, bitwise ops
});
```

### 3. Prepare every geometry before passing it to THREE.Mesh

The shader does not use standard UV coordinates. Instead each triangle carries its
own local coordinate system baked in as per-vertex attributes. You must call
`addTriangleAttribs` on every geometry that uses this material.

```js
let triSeedCounter = 0; // global — reset to 0 when you reload the scene

function addTriangleAttribs(geo) {
  // Must be non-indexed so each triangle has its own three vertices
  const g = geo.toNonIndexed();
  const pos = g.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);

  const bary     = new Float32Array(pos.count * 2);
  const eLenAB   = new Float32Array(pos.count);
  const eLenAC   = new Float32Array(pos.count);
  const triSeeds = new Float32Array(pos.count);

  // Pick vertex A as the one with the interior angle closest to 90°.
  // This makes the local UV grid as close to orthogonal as possible.
  function absCosAt(p, q, r) {
    const ex = q[0]-p[0], ey = q[1]-p[1], ez = q[2]-p[2];
    const fx = r[0]-p[0], fy = r[1]-p[1], fz = r[2]-p[2];
    const le = Math.hypot(ex, ey, ez), lf = Math.hypot(fx, fy, fz);
    if (le < 1e-10 || lf < 1e-10) return 1;
    return Math.abs((ex*fx + ey*fy + ez*fz) / (le * lf));
  }

  for (let i = 0; i < triCount; i++) {
    const b = i * 3;
    const p = [
      [pos.getX(b),   pos.getY(b),   pos.getZ(b)],
      [pos.getX(b+1), pos.getY(b+1), pos.getZ(b+1)],
      [pos.getX(b+2), pos.getY(b+2), pos.getZ(b+2)],
    ];

    const d = [absCosAt(p[0],p[1],p[2]), absCosAt(p[1],p[0],p[2]), absCosAt(p[2],p[0],p[1])];
    const iA = d[0] <= d[1] && d[0] <= d[2] ? 0 : d[1] <= d[2] ? 1 : 2;
    const [iB, iC] = [[1,2],[0,2],[0,1]][iA];

    const lAB = Math.hypot(...p[iB].map((v,k) => v - p[iA][k]));
    const lAC = Math.hypot(...p[iC].map((v,k) => v - p[iA][k]));
    const seed = triSeedCounter++;

    // A=(0,0), B=(1,0), C=(0,1) in local barycentric space
    bary[(b+iA)*2]=0; bary[(b+iA)*2+1]=0;
    bary[(b+iB)*2]=1; bary[(b+iB)*2+1]=0;
    bary[(b+iC)*2]=0; bary[(b+iC)*2+1]=1;

    for (let k = 0; k < 3; k++) {
      eLenAB[b+k]   = lAB;
      eLenAC[b+k]   = lAC;
      triSeeds[b+k] = seed;
    }
  }

  g.setAttribute('aBary',      new THREE.BufferAttribute(bary,     2));
  g.setAttribute('aEdgeLenAB', new THREE.BufferAttribute(eLenAB,   1));
  g.setAttribute('aEdgeLenAC', new THREE.BufferAttribute(eLenAC,   1));
  g.setAttribute('aTriSeed',   new THREE.BufferAttribute(triSeeds, 1));
  return g;
}
```

### 4. Use it

```js
const geo  = addTriangleAttribs(new THREE.BoxGeometry(1, 1, 1));
const mesh = new THREE.Mesh(geo, material);
scene.add(mesh);
```

If you load a GLB, bake the world transform into geometry positions before calling
`addTriangleAttribs`, so that edge lengths reflect real-world scale:

```js
child.geometry.applyMatrix4(child.matrixWorld);
child.geometry = addTriangleAttribs(child.geometry);
```

## Tuning

Inside `fragment.glsl`, in the `initUV()` function:

```glsl
const float j = 1.0;
```

Increase `j` to make the noise cells smaller (denser pattern).
Decrease `j` to make them larger.

Inside `main()`:

```glsl
float mipOffset = 0.0;
```

Negative values bias toward a finer mip (smaller cells, can reduce flicker at distance).
`-0.1` is a good starting point if you notice shimmering.

```glsl
int maxAniso = 8;
```

Maximum number of taps along the major axis. Higher = smoother at grazing angles,
more expensive. 8 is a reasonable default; 16 is the practical maximum.
