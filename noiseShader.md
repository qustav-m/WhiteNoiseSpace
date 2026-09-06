# Anisotropic noise shader

Procedural white noise bound to 3D geometry. Statistically uniform at every viewing angle and distance — at grazing angles the screen-pixel footprint becomes a thin ellipse over the triangle, and the shader samples along that ellipse so the result stays white rather than going grey.

## Files

| File | Purpose |
|---|---|
| `src/shader/noise-shader/vertex.glsl` | Passes four custom per-triangle attributes to the fragment stage |
| `src/shader/noise-shader/fragment.glsl` | Generates the noise |
| `src/shader/noise-shader/background.vert.glsl` | Fullscreen quad vertex shader for the noise background plane |
| `src/shader/noise-shader/background.frag.glsl` | Background noise fragment shader |
| `src/meshBuilder/noiseMeshBuilder.ts` | Preprocesses geometry and creates the `THREE.Mesh` |

## Usage in this project

Call `buildMesh(geometry)` from `noiseMeshBuilder.ts` — it handles everything:

```ts
import { buildMesh } from './meshBuilder/noiseMeshBuilder';
const mesh = buildMesh(geometry);
```

Internally, `buildMesh` calls `addTriangleAttribs` which converts the geometry to non-indexed and bakes the per-triangle attributes the shader needs (`aBary`, `aEdgeLenAB`, `aEdgeLenAC`, `aTriSeed`).

## Using this shader in another project

### 1. Import the shader source

With Vite, import the `.glsl` files as raw strings:

```ts
import vertSrc from './src/shader/noise-shader/vertex.glsl?raw';
import fragSrc from './src/shader/noise-shader/fragment.glsl?raw';
```

### 2. Create the material

Use `THREE.ShaderMaterial` (not `RawShaderMaterial`) — Three.js injects built-in uniforms and attributes the vertex shader relies on:

```ts
import * as THREE from 'three';

const material = new THREE.ShaderMaterial({
  vertexShader: vertSrc,
  fragmentShader: fragSrc,
});
```

### 3. Preprocess every geometry

The shader does not use standard UV coordinates. Each triangle carries its own local coordinate system baked in as per-vertex attributes. Copy `addTriangleAttribs` from `noiseMeshBuilder.ts` and call it on every geometry before creating the mesh:

```ts
const geometry = addTriangleAttribs(sourceGeometry);
const mesh = new THREE.Mesh(geometry, material);
```

World scale is read from the model matrix in the vertex shader (`length(modelMatrix[0].xyz)`), so no manual scale baking is needed.

## Tuning

In `src/shader/noise-shader/fragment.glsl`, inside `initUV()`:

```glsl
const float j = 1.0;
```

Increase `j` for a denser pattern, decrease for a coarser one.

Also inside `main()`:

```glsl
float mipOffset = 0.0;
```

Negative values bias toward a finer mip (smaller cells, reduces flicker at distance). `-0.1` is a good starting point for shimmering.

```glsl
int maxAniso = 8;
```

Maximum taps along the major ellipse axis. Higher = smoother at grazing angles but more expensive. 8 is a reasonable default; 16 is the practical maximum.
