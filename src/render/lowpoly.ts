import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Shared flat-shaded vertex-color material (§23.1). */
export const flatMat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
export const flatMatDouble = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true, side: THREE.DoubleSide });

/** Ensure non-indexed geometry with a color attribute filled with `color`. */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position!.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  let s = seed;
  for (let i = 0; i < n; i += 3) {
    s = (s * 16807) % 2147483647;
    const j = jitter ? ((s / 2147483647) - 0.5) * jitter : 0;
    for (let k = 0; k < 3 && i + k < n; k++) {
      arr[(i + k) * 3] = Math.min(1, Math.max(0, c.r + j));
      arr[(i + k) * 3 + 1] = Math.min(1, Math.max(0, c.g + j));
      arr[(i + k) * 3 + 2] = Math.min(1, Math.max(0, c.b + j));
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'color' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  const m = mergeGeometries(clean, false);
  if (!m) throw new Error('merge failed');
  m.computeVertexNormals();
  return m;
}

/** Random-ish vertex displacement for organic low-poly blobs. */
export function wobble(geo: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
  const pos = geo.attributes.position!;
  const map = new Map<string, [number, number, number]>();
  let s = seed;
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = map.get(key);
    if (!d) {
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * amount;
      d = [r(), r(), r()];
      map.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
  return geo;
}

export const hsl = (h: number, s: number, l: number): THREE.Color => new THREE.Color().setHSL(((h % 360) + 360) % 360 / 360, s, l);
