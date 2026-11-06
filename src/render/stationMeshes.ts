/**
 * P5.7 meshes: the workbench (a plank bench on legs with a stone anvil and tools), the watchtower (four poles, a
 * railed platform at `CFG.watch.platform` that the lookout stands on, a thatched hat, a ladder) and the gate (two tall
 * posts, a lintel and a plank door hung ajar, turned to run along the fence).
 */
import * as THREE from 'three';
import { CFG } from '../sim/config';
import { merge, paint, wobble } from './lowpoly';

const POLE = '#86603a', PLANK = '#9a6b3f', DARK = '#6d4c2c', THATCH = '#d4a94e', STONE = '#8f8b80', ROPE = '#a8894a';

export function workbenchGeo(): THREE.BufferGeometry {
  const parts = [
    paint(new THREE.BoxGeometry(0.95, 0.08, 0.5).translate(0, 0.46, 0), PLANK, 0.08, 2),
    paint(new THREE.BoxGeometry(0.85, 0.04, 0.06).translate(0, 0.2, 0.18), DARK),
    paint(wobble(new THREE.DodecahedronGeometry(0.12, 0).scale(1.2, 0.8, 1).translate(0.28, 0.58, 0.02), 0.02, 71), STONE, 0.06),
    // a stone axe and a mallet lying on the top, shavings below
    paint(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 4).rotateZ(Math.PI / 2).translate(-0.12, 0.52, 0.1), POLE),
    paint(new THREE.OctahedronGeometry(0.05).scale(1, 1.4, 0.4).translate(0.06, 0.53, 0.1), '#5a5550'),
    paint(new THREE.BoxGeometry(0.1, 0.07, 0.07).translate(-0.3, 0.535, -0.1), DARK),
    paint(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4).rotateX(Math.PI / 2).translate(-0.3, 0.53, 0.02), POLE),
    paint(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 7).translate(0.1, 0.01, 0.35), '#c9a46a'),
    // the stump seat
    paint(wobble(new THREE.CylinderGeometry(0.13, 0.15, 0.26, 6).translate(0, 0.13, -0.5), 0.02, 73), '#7a5636', 0.06),
  ];
  for (const [x, z] of [[-0.4, -0.18], [0.4, -0.18], [-0.4, 0.18], [0.4, 0.18]] as const)
    parts.push(paint(new THREE.CylinderGeometry(0.035, 0.04, 0.44, 4).translate(x, 0.22, z), POLE));
  return merge(parts);
}

export function watchtowerGeo(): THREE.BufferGeometry {
  const h = CFG.watch.platform, parts: THREE.BufferGeometry[] = [];
  const corners = [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const;
  for (const [x, z] of corners) {
    // poles splay out a little at the foot and run on up to carry the roof
    parts.push(paint(new THREE.CylinderGeometry(0.045, 0.06, h + 0.85, 5).translate(0, (h + 0.85) / 2, 0).rotateX(z * -0.08).rotateZ(x * 0.08).translate(x, 0, z), POLE, 0.06));
  }
  parts.push(paint(new THREE.BoxGeometry(1.0, 0.07, 1.0).translate(0, h - 0.035, 0), PLANK, 0.08, 3));
  // railing on three sides; the ladder side is open
  for (const [w, d, x, z] of [[1.0, 0.04, 0, -0.48], [0.04, 1.0, -0.48, 0], [0.04, 1.0, 0.48, 0]] as const)
    parts.push(paint(new THREE.BoxGeometry(w, 0.05, d).translate(x, h + 0.38, z), PLANK, 0.06));
  // cross-bracing between the legs
  for (const z of [-0.42, 0.42]) parts.push(paint(new THREE.BoxGeometry(1.05, 0.04, 0.04).rotateZ(0.9).translate(0, h * 0.45, z), DARK));
  // ladder up the front (+z)
  for (const x of [-0.16, 0.16]) parts.push(paint(new THREE.CylinderGeometry(0.02, 0.02, h + 0.1, 3).rotateX(-0.25).translate(x, (h + 0.1) / 2, 0.68), POLE));
  for (let i = 0; i < 6; i++) {
    const y = 0.18 + i * (h / 6.3);
    parts.push(paint(new THREE.BoxGeometry(0.34, 0.03, 0.03).translate(0, y, 0.82 - y * 0.25), DARK));
  }
  // thatched hat and the rope lashings
  parts.push(paint(wobble(new THREE.ConeGeometry(0.78, 0.5, 4).rotateY(Math.PI / 4).translate(0, h + 1.05, 0), 0.04, 77), THATCH, 0.07, 5));
  for (const [x, z] of corners) parts.push(paint(new THREE.TorusGeometry(0.06, 0.014, 3, 6).rotateX(Math.PI / 2).translate(x, h - 0.08, z), ROPE));
  return merge(parts);
}

/** P7.2: the kiln, a squat clay dome on a ring of stones with a dark firing mouth and a smoke hole on top. */
export function kilnGeo(): THREE.BufferGeometry {
  const CLAY = '#b8734e', parts: THREE.BufferGeometry[] = [
    paint(wobble(new THREE.SphereGeometry(0.46, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1), 0.03, 83), CLAY, 0.07, 3),
    paint(new THREE.CylinderGeometry(0.1, 0.13, 0.14, 6).translate(0, 0.56, 0), '#9c5f3e', 0.05),
    paint(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 6).translate(0, 0.635, 0), '#2e2420'),
    // the mouth: a dark arch at the front with a glow of embers in it
    paint(new THREE.BoxGeometry(0.26, 0.24, 0.12).translate(0, 0.12, 0.4), '#2e2420'),
    paint(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 6, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.24, 0.4), '#2e2420'),
    paint(new THREE.BoxGeometry(0.18, 0.05, 0.05).translate(0, 0.03, 0.44), '#e8742c'),
  ];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    if (Math.abs(Math.sin(a) - 1) < 0.15) continue;
    parts.push(paint(wobble(new THREE.DodecahedronGeometry(0.09, 0).translate(Math.cos(a) * 0.48, 0.05, Math.sin(a) * 0.48), 0.02, 85 + i), STONE, 0.06));
  }
  return merge(parts);
}

const DIRS: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** The gate, turned along the fence (from the bit mask of neighbouring posts, as for fences). */
export function gateGeo(mask: number): THREE.BufferGeometry {
  let k = 0;
  while (k < 8 && !(mask & (1 << k))) k++;
  const [dx, dy] = DIRS[k % 8]!;
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.45, 0.45]) {
    parts.push(paint(wobble(new THREE.CylinderGeometry(0.07, 0.085, 1.0, 5).translate(x, 0.5, 0), 0.015, 79), POLE, 0.08, 2));
    parts.push(paint(new THREE.ConeGeometry(0.085, 0.14, 5).translate(x, 1.07, 0), '#7a5636'));
  }
  parts.push(paint(new THREE.BoxGeometry(1.06, 0.07, 0.07).translate(0, 0.94, 0), PLANK, 0.06));
  // the door: four planks and two battens, hung on the left post and swung a little open
  const door: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) door.push(paint(new THREE.BoxGeometry(0.19, 0.66, 0.035).translate(0.12 + i * 0.2, 0.42, 0), i % 2 ? PLANK : '#a5774a', 0.06, i));
  for (const y of [0.24, 0.62]) door.push(paint(new THREE.BoxGeometry(0.8, 0.06, 0.03).translate(0.42, y, 0.03), DARK));
  parts.push(merge(door).rotateY(0.45).translate(-0.43, 0, 0));
  return merge(parts).rotateY(-Math.atan2(dy, dx));
}
