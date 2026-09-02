interface SceneOverride {
  scale?: number;
  rotationX?: number; // degrees
  rotationY?: number; // degrees
  rotationZ?: number; // degrees
}

// Per-filename overrides. Unspecified fields default to scale: 1, rotations: 0.
const overrides: Record<string, SceneOverride> = {
  'eyeglasses.glb':    { scale: 1, rotationX: 0, rotationY: 90, rotationZ: 0 },
  'plasticChair.glb':  { scale: 0.9, rotationX: 0, rotationY: 90, rotationZ: 0 },
  'rat.glb':           { scale: 1.5, rotationX: 0, rotationY: 0, rotationZ: 0 },
  'rubberDuck.glb':    { scale: 0.8, rotationX: 0, rotationY: 0, rotationZ: 0 },
  'wateringCan.glb':   { scale: 1.2, rotationX: 0, rotationY: 0, rotationZ: 0 },
  'whaleStatue.glb':   { scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0 },
  'woodenElephant.glb':{ scale: 1, rotationX: 0, rotationY: 90, rotationZ: 0 },
};

export function resolveSceneConfig(filename: string): { scale: number; rotationX: number; rotationY: number; rotationZ: number } {
  const o = overrides[filename] ?? {};
  return {
    scale:     o.scale     ?? 1,
    rotationX: o.rotationX ?? 0,
    rotationY: o.rotationY ?? 0,
    rotationZ: o.rotationZ ?? 0,
  };
}
