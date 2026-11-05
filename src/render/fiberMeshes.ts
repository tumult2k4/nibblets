/**
 * P5.6 meshes: fiber goods and preserves as items (ground, hand, pile), clothes worn on a goblin (loincloth, leaf
 * cape, flower crown, a basket or rolled mat on the back), and the preservation buildings (grinding stone, drying
 * rack with its batch, storage pit).
 */
import * as THREE from 'three';
import { merge, paint, wobble } from './lowpoly';
import type { ItemType } from '../shared/types';

const FIBER = '#c9b26a', WICKER = '#b08a4e', LEAF = '#5f9a3a', LEAF2 = '#7cb24a', CLOTH = '#a07a4e';
const FLOWERS = ['#f2d14a', '#f28ab5', '#ffffff', '#b58af2', '#f2854a'];

/** Item geometry for the P5.6 goods (null: not one of them). */
export function fiberItemGeo(t: ItemType): THREE.BufferGeometry | null {
  switch (t) {
    case 'rope': return paint(new THREE.TorusGeometry(0.09, 0.02, 3, 8).rotateX(Math.PI / 2).translate(0, 0.02, 0), '#a8894a');
    case 'leaves': return merge([paint(new THREE.OctahedronGeometry(0.08).scale(1.5, 0.2, 0.8).translate(0, 0.02, 0), LEAF), paint(new THREE.OctahedronGeometry(0.07).scale(1.4, 0.2, 0.7).rotateY(1.2).translate(0.03, 0.035, 0.02), LEAF2)]);
    case 'flower': return merge([paint(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 3).translate(0, 0.06, 0), LEAF), paint(new THREE.OctahedronGeometry(0.035).translate(0, 0.13, 0), FLOWERS[1]!)]);
    case 'dried_apple': return merge([0, 1, 2].map((i) => paint(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 6).translate(i * 0.03 - 0.03, 0.01 + i * 0.012, 0), i % 2 ? '#b8743a' : '#c98b48')));
    case 'basket': return basketGeo();
    case 'sleeping_mat': return paint(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6).rotateZ(Math.PI / 2).translate(0, 0.05, 0), FIBER, 0.05, 3);
    case 'loincloth': return paint(new THREE.BoxGeometry(0.2, 0.02, 0.14).translate(0, 0.01, 0), CLOTH, 0.05, 2);
    case 'leaf_cape': return paint(new THREE.ConeGeometry(0.14, 0.04, 6).translate(0, 0.02, 0), LEAF, 0.08, 4);
    case 'flower_crown': return crownGeo(0.09);
    default: return null;
  }
}

function basketGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.CylinderGeometry(0.09, 0.07, 0.11, 7, 1, true).translate(0, 0.055, 0), WICKER, 0.06, 5),
    paint(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 7).translate(0, 0.005, 0), WICKER),
    paint(new THREE.TorusGeometry(0.09, 0.01, 3, 7).rotateX(Math.PI / 2).translate(0, 0.11, 0), '#8a6a3a'),
  ]);
}

function crownGeo(r: number): THREE.BufferGeometry {
  const parts = [paint(new THREE.TorusGeometry(r, r * 0.12, 3, 9).rotateX(Math.PI / 2), LEAF)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(paint(new THREE.OctahedronGeometry(r * 0.3).translate(Math.cos(a) * r, r * 0.12, Math.sin(a) * r), FLOWERS[i]!));
  }
  return merge(parts);
}

const WEAR = new Map<string, THREE.BufferGeometry>();
/**
 * What a goblin wears, in body-group space (the head piece in head space; `hr` = head radius). Body pieces hug a
 * belly about 0.15 wide at y ≈ 0.17.
 */
export function wearGeo(t: ItemType, hr: number): THREE.BufferGeometry | null {
  const key = t === 'flower_crown' ? `${t}:${hr.toFixed(2)}` : t;
  const hit = WEAR.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry | null = null;
  switch (t) {
    case 'loincloth': g = merge([
      paint(new THREE.CylinderGeometry(0.165, 0.18, 0.07, 7, 1, true).translate(0, 0.08, 0), CLOTH, 0.06, 7),
      paint(new THREE.BoxGeometry(0.1, 0.09, 0.02).translate(0, 0.02, 0.17), '#8c6840'),
    ]); break;
    case 'leaf_cape': g = merge([0, 1, 2, 3, 4].map((i) => paint(new THREE.OctahedronGeometry(0.11).scale(0.9, 1.4, 0.18)
      .rotateZ((i - 2) * 0.35).translate((i - 2) * 0.07, 0.22 - Math.abs(i - 2) * 0.02, -0.15), i % 2 ? LEAF2 : LEAF, 0.05, i))); break;
    case 'flower_crown': g = crownGeo(hr * 0.78).translate(0, hr * 0.62, 0); break;
    case 'basket': g = basketGeo().clone().scale(0.9, 1.1, 0.9).translate(0, 0.17, -0.2); break;
    case 'sleeping_mat': g = paint(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6).rotateZ(Math.PI / 2).translate(0, 0.36, -0.13), FIBER, 0.05, 3); break;
    default: g = null;
  }
  if (g) WEAR.set(key, g);
  return g;
}

/** A flat millstone on a low plinth of stones, a rubbing stone on top (§11.2). */
export function grindingStoneGeo(): THREE.BufferGeometry {
  const parts = [
    paint(wobble(new THREE.CylinderGeometry(0.42, 0.48, 0.22, 8).translate(0, 0.11, 0), 0.04, 51), '#8f8b80', 0.08, 3),
    paint(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 8).translate(0, 0.225, 0), '#a8a398'),
    paint(wobble(new THREE.DodecahedronGeometry(0.13, 0).scale(1.3, 0.7, 1).translate(0.08, 0.3, 0.04), 0.03, 53), '#7d796f', 0.06),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(paint(wobble(new THREE.DodecahedronGeometry(0.09, 0).translate(Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5), 0.03, 55 + i), '#9a958a'));
  }
  return merge(parts);
}

/** Two forked posts carrying three rails, lashed with rope (§11.2); the batch hangs off the rails (`rackItems`). */
export function dryingRackGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.45, 0.45]) {
    parts.push(paint(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 4).translate(x, 0.45, 0), '#86603a', 0.06));
    parts.push(paint(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 3).rotateX(0.5).translate(x, 0.85, 0.08), '#86603a'));
  }
  for (const [y, z] of [[0.82, 0], [0.62, 0.05], [0.42, -0.05]] as const)
    parts.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 3).rotateZ(Math.PI / 2).translate(0, y, z), '#9a6b3f'));
  for (const x of [-0.45, 0.45]) parts.push(paint(new THREE.TorusGeometry(0.05, 0.012, 3, 6).rotateY(Math.PI / 2).translate(x, 0.82, 0), '#a8894a'));
  return merge(parts);
}

/** Apple slices strung on the rack: fresh (red) while drying, brown when done. */
export function rackItems(n: number, dried: boolean): THREE.BufferGeometry | null {
  if (n <= 0) return null;
  const parts: THREE.BufferGeometry[] = [];
  const rails = [[0.82, 0], [0.62, 0.05], [0.42, -0.05]] as const;
  for (let i = 0; i < Math.min(12, n); i++) {
    const [y, z] = rails[i % 3]!;
    const x = -0.36 + Math.floor(i / 3) * 0.24 + (i % 3) * 0.03;
    parts.push(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 6).rotateX(Math.PI / 2).translate(x, y - 0.06, z), dried ? '#b8743a' : '#d8503a'));
  }
  return merge(parts);
}

/** A dug pit lined with stones, a wicker lid half over it (§11.2). */
export function storagePitGeo(): THREE.BufferGeometry {
  const parts = [
    paint(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 9).translate(0, 0.01, 0), '#3d2c1c'),
    paint(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 9).rotateX(0.18).translate(0.12, 0.08, 0.05), WICKER, 0.06, 7),
  ];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(paint(wobble(new THREE.DodecahedronGeometry(0.1, 0).scale(1, 0.6, 1).translate(Math.cos(a) * 0.52, 0.05, Math.sin(a) * 0.52), 0.03, 61 + i), '#8f8b80', 0.08));
  }
  return merge(parts);
}
