import * as THREE from './node_modules/three/build/three.module.js';

let triSeedCounter = 0;

export function addTriangleAttribs(geo) {
  const g = geo.toNonIndexed();
  const pos = g.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);

  const bary     = new Float32Array(pos.count * 2);
  const eLenAB   = new Float32Array(pos.count);
  const eLenAC   = new Float32Array(pos.count);
  const triSeeds = new Float32Array(pos.count);

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

    const d  = [absCosAt(p[0],p[1],p[2]), absCosAt(p[1],p[0],p[2]), absCosAt(p[2],p[0],p[1])];
    const iA = d[0] <= d[1] && d[0] <= d[2] ? 0 : d[1] <= d[2] ? 1 : 2;
    const [iB, iC] = [[1,2],[0,2],[0,1]][iA];

    const lAB = Math.hypot(...p[iB].map((v,k) => v - p[iA][k]));
    const lAC = Math.hypot(...p[iC].map((v,k) => v - p[iA][k]));
    const seed = triSeedCounter++;

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

export function buildMesh(vertSrc, fragSrc, geometry) {
  const geo = addTriangleAttribs(geometry);
  const mat = new THREE.ShaderMaterial({ vertexShader: vertSrc, fragmentShader: fragSrc, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}
