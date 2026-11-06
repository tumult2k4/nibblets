/**
 * P7.4 meshes: the garden plot (a 3×3 bed of tilled rows inside a low wattle fence, a gap to step in at the front;
 * its plants are drawn by the plant view), the compost heap (a slatted bin on three sides around a dark mound) and a
 * bridge span (one tile of planks across two beams on piles, rails at both sides, laid along x).
 */
import * as THREE from 'three';
import { merge, paint, wobble } from './lowpoly';

const POLE = '#86603a', PLANK = '#9a6b3f', DARK = '#6d4c2c', SOIL = '#5b4030', TILLED = '#76563c', WATTLE = '#a8894a';

export function gardenPlotGeo(): THREE.BufferGeometry {
  // the dug bed reaches down a little, so it sits in uneven ground without floating
  const H = 1.5, parts: THREE.BufferGeometry[] = [paint(new THREE.BoxGeometry(2.9, 0.24, 2.9, 3, 1, 3).translate(0, -0.08, 0), SOIL, 0.05, 3)];
  // low tilled ridges across the bed
  for (let i = 0; i < 6; i++) parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, 2.7, 4, 1).rotateZ(Math.PI / 2).scale(1, 0.3, 1).translate(0, 0.04, -1.15 + i * 0.46), TILLED, 0.04, 10 + i));
  // posts every half tile round the edge, and two woven bands between them; a gap at the front (+z) to step in
  for (let i = 0; i <= 6; i++) {
    const u = -H + i * 0.5;
    for (const [x, z] of [[u, -H], [u, H], [-H, u], [H, u]] as const) {
      if (z === H && Math.abs(x) < 0.3) continue;
      parts.push(paint(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 4).translate(x, 0.2, z), POLE));
    }
  }
  for (const y of [0.14, 0.28]) {
    parts.push(paint(new THREE.BoxGeometry(3.0, 0.05, 0.04).translate(0, y, -H), WATTLE, 0.05));
    for (const x of [-H, H]) parts.push(paint(new THREE.BoxGeometry(0.04, 0.05, 3.0).translate(x, y, 0), WATTLE, 0.05));
    for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(1.25, 0.05, 0.04).translate(s * 0.88, y, H), WATTLE, 0.05));
  }
  return merge(parts);
}

export function compostHeapGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(wobble(new THREE.SphereGeometry(0.34, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1), 0.04, 131), '#4a3a28', 0.08, 2)];
  // a few bits on top: leaves and a core
  for (let i = 0; i < 4; i++) parts.push(paint(new THREE.ConeGeometry(0.05, 0.02, 4).rotateX(0.3 * i).translate(Math.cos(i * 1.7) * 0.15, 0.25, Math.sin(i * 1.7) * 0.15), i % 2 ? '#7a8b3d' : '#9a7a3a'));
  // the bin: slats on three sides, open at the front (+z)
  for (const [x, z, r] of [[0, -0.42, 0], [-0.42, 0, Math.PI / 2], [0.42, 0, Math.PI / 2]] as const)
    for (let k = 0; k < 3; k++) parts.push(paint(new THREE.BoxGeometry(0.86, 0.08, 0.04).rotateY(r).translate(x, 0.08 + k * 0.13, z), k % 2 ? PLANK : DARK, 0.05, k));
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const)
    parts.push(paint(new THREE.CylinderGeometry(0.03, 0.035, 0.46, 4).translate(x, 0.23, z), POLE));
  return merge(parts);
}

/** One span, its deck `deck` above the group's origin (the group sits at the water line). */
export function bridgeGeo(deck = 0.16): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.3, 0.3]) parts.push(paint(new THREE.BoxGeometry(1.04, 0.07, 0.08).translate(0, deck - 0.05, z), DARK));
  // planks across the beams, a little uneven
  for (let i = 0; i < 6; i++) parts.push(paint(new THREE.BoxGeometry(0.15, 0.04, 0.82).translate(-0.42 + i * 0.168, deck, ((i * 37) % 5) * 0.008 - 0.016), i % 2 ? PLANK : '#a5774a', 0.05, i));
  // piles into the water at the corners, rail posts above them, and the rails
  for (const x of [-0.45, 0.45])
    for (const z of [-0.36, 0.36]) {
      parts.push(paint(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 5).translate(x, deck - 0.25, z), DARK));
      parts.push(paint(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 5).translate(x, deck + 0.17, z), POLE));
    }
  for (const z of [-0.36, 0.36]) parts.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 1.04, 4).rotateZ(Math.PI / 2).translate(0, deck + 0.3, z), POLE));
  return merge(parts);
}
