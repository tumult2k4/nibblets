/**
 * P7.3 meshes: the hearth (a stone fire pit under a clay hood and chimney, built against a home's wall; its flames
 * come from the fire view), the longhouse (a long timber hall under a steep thatch, door on the long side), the
 * well (a stone ring under a little roof with a windlass and bucket) and the nursery (an open-sided thatched shelter
 * with a low wattle wall and a ring of straw nests).
 */
import * as THREE from 'three';
import { merge, paint, wobble } from './lowpoly';

const POLE = '#86603a', PLANK = '#9a6b3f', DARK = '#6d4c2c', THATCH = '#d4a94e', STONE = '#8f8b80', CLAY = '#b8734e', STRAW = '#e2c77a';

export function hearthGeo(): THREE.BufferGeometry {
  const parts = [paint(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 8).translate(0, 0.025, 0), '#4a4440')];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(paint(wobble(new THREE.DodecahedronGeometry(0.09, 0).translate(Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.36), 0.02, 91 + i), STONE, 0.06));
  }
  // a clay back wall with cheeks, a hood leaning out over the fire, and the chimney rising from it
  parts.push(paint(wobble(new THREE.BoxGeometry(0.86, 0.62, 0.2, 2, 2, 1).translate(0, 0.31, -0.42), 0.02, 97), CLAY, 0.06, 7));
  for (const x of [-0.42, 0.42]) parts.push(paint(new THREE.BoxGeometry(0.14, 0.5, 0.42).translate(x, 0.25, -0.2), CLAY, 0.06, 8));
  parts.push(paint(new THREE.BoxGeometry(0.98, 0.1, 0.62).rotateX(0.35).translate(0, 0.66, -0.16), '#a86848', 0.06, 9));
  parts.push(paint(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6).translate(0, 0.96, -0.32), '#9c5f3e', 0.05));
  parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 6).translate(0, 1.22, -0.32), '#2e2420'));
  for (let i = 0; i < 2; i++) parts.push(paint(new THREE.CylinderGeometry(0.035, 0.04, 0.4, 5).rotateZ(1.2).rotateY(i * 1.6).translate(0, 0.1, 0), '#6b4a2e'));
  return merge(parts);
}

export function longhouseGeo(): THREE.BufferGeometry {
  const L = 2.9, W = 1.9, H = 0.85, parts: THREE.BufferGeometry[] = [];
  // plank walls on a stone footing
  parts.push(paint(new THREE.BoxGeometry(L + 0.1, 0.14, W + 0.1).translate(0, 0.07, 0), STONE, 0.06, 3));
  for (let i = 0; i < 9; i++) {
    const x = -L / 2 + 0.16 + i * ((L - 0.32) / 8);
    for (const z of [-W / 2, W / 2]) if (!(z > 0 && Math.abs(x) < 0.25)) parts.push(paint(new THREE.BoxGeometry(0.3, H, 0.08).translate(x, 0.14 + H / 2, z), i % 2 ? PLANK : '#a5774a', 0.05, i));
  }
  for (const x of [-L / 2, L / 2]) parts.push(paint(new THREE.BoxGeometry(0.08, H, W).translate(x, 0.14 + H / 2, 0), PLANK, 0.05));
  // the gable ends and the long steep thatch
  const gable = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -W / 2, 0, 0, W / 2, 0, 0.75, 0], 3));
  gable.computeVertexNormals();
  for (const x of [-L / 2, L / 2]) parts.push(paint(gable.clone().translate(x, 0.14 + H, 0), PLANK));
  for (const s of [-1, 1]) parts.push(paint(wobble(new THREE.BoxGeometry(L + 0.5, 0.1, 1.45, 4, 1, 2).rotateX(s * 0.82).translate(0, 0.14 + H + 0.33, s * 0.52), 0.03, 101 + s), THATCH, 0.07, 5));
  parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, L + 0.6, 5).rotateZ(Math.PI / 2).translate(0, 0.14 + H + 0.8, 0), DARK));
  // the doorway and its lintel on the long side, a smoke hole's hood on the ridge
  parts.push(paint(new THREE.BoxGeometry(0.42, 0.6, 0.06).translate(0, 0.44, W / 2 + 0.01), '#2e2420'));
  parts.push(paint(new THREE.BoxGeometry(0.56, 0.07, 0.1).translate(0, 0.77, W / 2 + 0.03), DARK));
  parts.push(paint(new THREE.ConeGeometry(0.22, 0.2, 4).rotateY(Math.PI / 4).translate(0.6, 0.14 + H + 0.95, 0), THATCH, 0.06));
  return merge(parts);
}

export function wellGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    for (const y of [0.1, 0.27]) parts.push(paint(wobble(new THREE.BoxGeometry(0.2, 0.17, 0.14).rotateY(-a).translate(Math.cos(a) * 0.36, y, Math.sin(a) * 0.36), 0.02, 111 + i), STONE, 0.07, i));
  }
  parts.push(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 10).translate(0, 0.3, 0), '#3d6f8f'));
  // posts, the windlass with its rope, a bucket and a small pitched roof
  for (const x of [-0.42, 0.42]) parts.push(paint(new THREE.CylinderGeometry(0.035, 0.04, 1.05, 5).translate(x, 0.52, 0), POLE));
  parts.push(paint(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6).rotateZ(Math.PI / 2).translate(0, 0.8, 0), DARK));
  parts.push(paint(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 3).translate(0.05, 0.64, 0), '#c9b26a'));
  parts.push(paint(new THREE.CylinderGeometry(0.07, 0.055, 0.1, 6).translate(0.05, 0.46, 0), CLAY, 0.05));
  for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(1.05, 0.04, 0.42).rotateX(s * 0.6).translate(0, 1.15, s * 0.17), THATCH, 0.06, 4));
  return merge(parts);
}

export function nurseryGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.85, 0.9, 0.06, 10).translate(0, 0.03, 0), STRAW, 0.08, 2)];
  // a low wattle wall, open at the front (+z)
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    if (Math.sin(a) > 0.7) continue;
    parts.push(paint(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 4).translate(Math.cos(a) * 0.92, 0.21, Math.sin(a) * 0.92), POLE));
  }
  for (const y of [0.16, 0.32]) parts.push(paint(new THREE.TorusGeometry(0.92, 0.025, 3, 14, Math.PI * 1.6).rotateX(Math.PI / 2).rotateZ(Math.PI * 0.9).translate(0, y, 0), '#a8894a'));
  // four posts carrying a low thatched cone
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as const) parts.push(paint(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 5).translate(x, 0.5, z), POLE));
  parts.push(paint(wobble(new THREE.ConeGeometry(1.15, 0.65, 8).translate(0, 1.3, 0), 0.03, 121), THATCH, 0.07, 6));
  // the straw nests where the eggs sit
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    parts.push(paint(new THREE.TorusGeometry(0.11, 0.04, 3, 7).rotateX(Math.PI / 2).translate(Math.cos(a) * 0.55, 0.07, Math.sin(a) * 0.55), '#c9a95a', 0.06, i));
  }
  return merge(parts);
}
