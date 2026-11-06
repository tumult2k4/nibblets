/**
 * P7.5 meshes: the fur cloak, bone necklace, war paint and ash as items, and as worn on a goblin (the cloak over the
 * shoulders and back, the necklace at the neck, the paint as stripes across the cheeks).
 */
import * as THREE from 'three';
import { merge, paint, wobble } from './lowpoly';
import type { ItemType } from '../shared/types';

const FUR = '#8a6c52', FUR2 = '#a88a6c', BONE = '#ede4cf', CORD = '#8c6840', RED = '#b8352c', WHITE = '#f1ece0';

/** A ring of little bones and teeth on a cord, radius `r`, lying flat. */
function necklaceRing(r: number, n: number): THREE.BufferGeometry {
  const parts = [paint(new THREE.TorusGeometry(r, 0.008, 3, 12).rotateX(Math.PI / 2), CORD)];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + ((i - (n - 1) / 2) / n) * Math.PI * 1.1; // bunched at the front (+z)
    parts.push(paint(new THREE.ConeGeometry(0.014, 0.05, 3).rotateX(Math.PI).translate(Math.cos(a) * r, -0.02, Math.sin(a) * r), i % 2 ? BONE : '#d9cdb0'));
  }
  return merge(parts);
}

/** Item geometry for the P7.5 goods (null: not one of them). */
export function adornItemGeo(t: ItemType): THREE.BufferGeometry | null {
  switch (t) {
    case 'fur_cloak': return merge([
      paint(wobble(new THREE.BoxGeometry(0.26, 0.05, 0.2, 2, 1, 2).translate(0, 0.025, 0), 0.02, 9), FUR, 0.06, 3),
      paint(new THREE.BoxGeometry(0.26, 0.02, 0.05).translate(0, 0.055, -0.07), FUR2),
    ]);
    case 'bone_necklace': return necklaceRing(0.08, 5).translate(0, 0.03, 0);
    case 'war_paint': return merge([
      paint(new THREE.CylinderGeometry(0.06, 0.045, 0.05, 6).translate(0, 0.025, 0), '#7d796f', 0.05),
      paint(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 6).translate(0, 0.05, 0), RED),
      paint(new THREE.SphereGeometry(0.012, 4, 3).translate(0.02, 0.055, 0.01), WHITE),
    ]);
    case 'ash': return paint(wobble(new THREE.ConeGeometry(0.1, 0.06, 6).translate(0, 0.03, 0), 0.015, 13), '#8e8b86', 0.06);
    default: return null;
  }
}

const WEAR = new Map<string, THREE.BufferGeometry>();
/** Worn: the cloak and necklace in body-group space, the paint in head space (`hr` = head radius). */
export function adornWearGeo(t: ItemType | 'war_paint_face', hr: number): THREE.BufferGeometry | null {
  const key = t === 'war_paint_face' ? `${t}:${hr.toFixed(2)}` : t;
  const hit = WEAR.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry | null = null;
  switch (t) {
    case 'fur_cloak': g = merge([
      // a shaggy half-cylinder round the back from the shoulders down, a pale fur collar on top
      paint(wobble(new THREE.CylinderGeometry(0.17, 0.21, 0.24, 8, 2, true, Math.PI / 2, Math.PI).translate(0, 0.22, -0.01), 0.015, 21), FUR, 0.07, 5),
      paint(wobble(new THREE.TorusGeometry(0.13, 0.035, 4, 9).rotateX(Math.PI / 2).translate(0, 0.33, -0.01), 0.01, 23), FUR2, 0.06, 2),
    ]); break;
    case 'bone_necklace': g = necklaceRing(0.115, 7).rotateX(-0.18).translate(0, 0.32, 0.01); break;
    case 'war_paint_face': {
      const z = hr * 0.86, parts: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1])
        for (const dy of [0, -0.035])
          parts.push(paint(new THREE.BoxGeometry(hr * 0.42, 0.014, 0.01).rotateZ(s * 0.25).rotateY(s * 0.55).translate(s * hr * 0.5, -hr * 0.08 + dy, z * 0.86), RED));
      parts.push(paint(new THREE.BoxGeometry(0.018, hr * 0.35, 0.01).translate(0, hr * 0.45, z * 0.97), WHITE));
      g = merge(parts);
      break;
    }
    default: g = null;
  }
  if (g) WEAR.set(key, g);
  return g;
}
