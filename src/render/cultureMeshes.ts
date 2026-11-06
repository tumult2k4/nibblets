/**
 * Culture buildings (§11.1): the music circle (P8.5), a ring of standing stones round a trampled floor with three log
 * seats inside, the village's nightly gathering spot for music (three tiles, centred); the shrine (P8.6), a cairn of
 * flat stones with a slab on top for offerings and a little bowl before it; the totem (P8.6), a carved pole of three
 * stacked faces daubed in war paint, with wings at the top, set in a ring of stones; the temple (P8.8), an open hall on
 * a stone floor, four carved posts under a steep thatched roof with bone horns at its ends, a stone altar inside with
 * a bowl of embers before it (two tiles); the library shelf (P9.5), a little roofed wooden case on legs with two
 * shelves of books in many colours.
 */
import * as THREE from 'three';
import { merge, paint, wobble } from './lowpoly';
import { PROP_COLORS as P } from './palette';

export function musicCircleGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CircleGeometry(1.4, 14).rotateX(-Math.PI / 2).translate(0, 0.02, 0), '#9c8668', 0.03)];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, h = 0.26 + ((i * 37) % 5) * 0.04;
    parts.push(paint(wobble(new THREE.CylinderGeometry(0.09, 0.13, h, 5).translate(Math.cos(a) * 1.4, h / 2, Math.sin(a) * 1.4), 0.02, i + 1), P.stone, 0.06, i));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6).rotateZ(Math.PI / 2).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.85, 0.07, Math.sin(a) * 0.85), P.wood, 0.05, i + 11));
  }
  return merge(parts);
}

/** Height of the shrine's offering slab (the trinkets laid on it sit here). */
export const SHRINE_TOP = 0.74;

export function shrineGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.46, 0.5, 0.1, 7).translate(0, 0.05, 0), '#7d7a74', 0.05, 1)];
  const stack = [[0.34, 0.16], [0.28, 0.15], [0.22, 0.14], [0.17, 0.13]] as const;
  let y = 0.1;
  stack.forEach(([r, h], i) => {
    parts.push(paint(wobble(new THREE.CylinderGeometry(r * 0.9, r, h, 6).rotateY(i * 0.7).translate(0, y + h / 2, 0), 0.02, i + 3), P.stone, 0.08, i + 3));
    y += h;
  });
  parts.push(paint(new THREE.BoxGeometry(0.46, 0.05, 0.34).translate(0, SHRINE_TOP - 0.025, 0), '#a09c94', 0.05, 9));
  parts.push(paint(new THREE.CylinderGeometry(0.1, 0.07, 0.07, 7).translate(0, 0.135, 0.42), '#9a6b3f', 0.05, 10)); // the bowl before it
  return merge(parts);
}

const PAINTS = ['#b8432e', '#e8d9b0', '#2f5f8a'];
export function totemGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(paint(wobble(new THREE.IcosahedronGeometry(0.09, 0).translate(Math.cos(a) * 0.28, 0.05, Math.sin(a) * 0.28), 0.02, i + 1), P.stone, 0.08, i));
  }
  for (let k = 0; k < 3; k++) { // three faces, each its own paint
    const y = 0.32 + k * 0.42;
    parts.push(paint(new THREE.CylinderGeometry(0.17, 0.19, 0.4, 7).translate(0, y, 0), P.wood, 0.06, k + 7));
    parts.push(paint(new THREE.BoxGeometry(0.3, 0.06, 0.05).translate(0, y + 0.08, 0.16), PAINTS[k]!, 0.04, k + 11)); // a painted brow
    for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(0.06, 0.06, 0.04).translate(s * 0.07, y + 0.01, 0.18), '#2e2a24'));
    parts.push(paint(new THREE.BoxGeometry(0.12, 0.04, 0.05).translate(0, y - 0.1, 0.17), PAINTS[(k + 1) % 3]!)); // the mouth
  }
  parts.push(paint(new THREE.BoxGeometry(0.86, 0.07, 0.12).translate(0, 1.3, 0), '#8a6a44', 0.05, 20)); // the wings
  for (const s of [-1, 1]) parts.push(paint(new THREE.ConeGeometry(0.06, 0.16, 4).rotateZ(-s * Math.PI / 2).translate(s * 0.5, 1.3, 0), PAINTS[0]!));
  parts.push(paint(new THREE.ConeGeometry(0.13, 0.22, 6).translate(0, 1.45, 0), '#6f5236', 0.05, 21));
  return merge(parts);
}

/** Height of the temple altar's top (the trinkets and food laid on it sit here). */
export const TEMPLE_TOP = 0.56;

export function templeGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.BoxGeometry(1.9, 0.12, 1.9).translate(0, 0.06, 0), '#8c8780', 0.05, 1)];
  parts.push(paint(new THREE.BoxGeometry(1.2, 0.08, 0.5).translate(0, 0.04, 1.1), '#7d7a74', 0.05, 2)); // the step before it
  for (const [x, z] of [[-0.78, -0.78], [0.78, -0.78], [-0.78, 0.78], [0.78, 0.78]] as const) {
    parts.push(paint(wobble(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 6).translate(x, 0.72, z), 0.015, x * 3 + z + 9), P.wood, 0.06, 4));
    parts.push(paint(new THREE.BoxGeometry(0.2, 0.05, 0.05).translate(x, 0.9, z + Math.sign(z) * 0.08), PAINTS[(x > 0 ? 1 : 0) + (z > 0 ? 1 : 0)]!)); // a painted band
  }
  // a steep thatched roof: two slopes meeting at a ridge, gable horns of bone
  for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(1.15, 0.08, 2.15).rotateZ(-s * 0.72).translate(s * 0.42, 1.62, 0), '#b49a5c', 0.08, s + 12));
  parts.push(paint(new THREE.BoxGeometry(0.12, 0.1, 2.25).translate(0, 2.02, 0), '#8f7743', 0.05, 15));
  for (const z of [-1.1, 1.1]) for (const s of [-1, 1])
    parts.push(paint(new THREE.ConeGeometry(0.05, 0.36, 5).rotateZ(-s * 0.5).translate(s * 0.1, 2.18, z), '#ede4cf'));
  // the altar: a stone block with a slab on top, a bowl of embers before it
  parts.push(paint(wobble(new THREE.BoxGeometry(0.62, 0.42, 0.42).translate(0, 0.33, -0.25), 0.02, 21), P.stone, 0.08, 21));
  parts.push(paint(new THREE.BoxGeometry(0.74, 0.05, 0.5).translate(0, TEMPLE_TOP - 0.025, -0.25), '#a09c94', 0.05, 22));
  parts.push(paint(new THREE.CylinderGeometry(0.13, 0.09, 0.09, 7).translate(0, 0.165, 0.32), '#7b5232', 0.05, 23));
  parts.push(paint(new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0.22, 0.32), '#e0703a', 0.05, 24));
  return merge(parts);
}

const SPINES = ['#8c3b2e', '#2f5f8a', '#6e8b3d', '#c79a3a', '#7a4fa0', '#a35d3a'];
export function libraryShelfGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-0.36, 0.36]) parts.push(paint(new THREE.BoxGeometry(0.07, 0.95, 0.32).translate(sx, 0.475, 0), P.wood, 0.05, sx > 0 ? 1 : 2)); // sides
  for (const y of [0.12, 0.45, 0.78]) parts.push(paint(new THREE.BoxGeometry(0.76, 0.05, 0.32).translate(0, y, 0), P.wood, 0.04, Math.round(y * 10))); // boards
  parts.push(paint(new THREE.BoxGeometry(0.76, 0.85, 0.03).translate(0, 0.5, -0.15), '#7a5a3c', 0.04, 7)); // the back
  parts.push(paint(new THREE.ConeGeometry(0.62, 0.28, 4).rotateY(Math.PI / 4).scale(1, 1, 0.55).translate(0, 1.08, 0), '#8a6a44', 0.05, 8)); // a little roof
  for (const [row, y] of [[0, 0.145], [1, 0.475]] as const) {
    let x = -0.3;
    for (let i = 0; x < 0.28; i++) {
      const wdt = 0.06 + ((i * 7 + row * 3) % 3) * 0.015, h = 0.2 + ((i * 5 + row) % 4) * 0.025;
      parts.push(paint(new THREE.BoxGeometry(wdt, h, 0.2).rotateZ(i % 5 === 4 ? 0.25 : 0).translate(x + wdt / 2, y + h / 2, 0.02), SPINES[(i + row * 2) % SPINES.length]!, 0.04, i + row * 10));
      x += wdt + 0.012;
    }
  }
  return merge(parts);
}
