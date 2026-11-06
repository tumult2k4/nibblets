/**
 * Culture buildings (§11.1): the music circle (P8.5), a ring of standing stones round a trampled floor with three log
 * seats inside, the village's nightly gathering spot for music (three tiles, centred); the shrine (P8.6), a cairn of
 * flat stones with a slab on top for offerings and a little bowl before it; the totem (P8.6), a carved pole of three
 * stacked faces daubed in war paint, with wings at the top, set in a ring of stones.
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
