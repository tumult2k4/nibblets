/**
 * P7.5 meshes: the fur cloak, bone necklace, war paint and ash as items, and as worn on a goblin (the cloak over the
 * shoulders and back, the necklace at the neck, the paint as stripes across the cheeks); the chief's feathered
 * headdress (P8.4); the shaman's headdress of bone and feathers (P8.8).
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
export function adornWearGeo(t: ItemType | 'war_paint_face' | 'chief_headdress' | 'shaman_headdress', hr: number): THREE.BufferGeometry | null {
  const key = t === 'war_paint_face' || t === 'chief_headdress' || t === 'shaman_headdress' ? `${t}:${hr.toFixed(2)}` : t;
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
    case 'chief_headdress': { // P8.4: a woven band and a fan of feathers standing up round the back of the head
      const r = hr * 0.9, y = hr * 0.42, parts = [paint(new THREE.TorusGeometry(r, hr * 0.09, 4, 12).rotateX(Math.PI / 2).translate(0, y, 0), CORD)];
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + ((i - 3) / 3) * 1.25; // centred on the back (−z)
        parts.push(paint(new THREE.OctahedronGeometry(hr * 0.22).scale(0.45, 1.9, 0.16).rotateY(-a + Math.PI / 2).rotateZ(Math.cos(a) * -0.35)
          .rotateX(Math.sin(a) * 0.35).translate(Math.cos(a) * r, y + hr * 0.38, Math.sin(a) * r), [WHITE, RED, '#d9a441'][i % 3]!));
      }
      g = merge(parts);
      break;
    }
    case 'shaman_headdress': { // P8.8: a skull cap of bone, two horns, and long dark feathers hanging down the back
      const r = hr * 0.92, y = hr * 0.5, parts = [paint(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.32).translate(0, y - hr * 0.2, 0), BONE, 0.05, 3)];
      for (const s of [-1, 1]) parts.push(paint(new THREE.ConeGeometry(hr * 0.12, hr * 0.7, 5).rotateZ(-s * 0.55).translate(s * r * 0.62, y + hr * 0.42, 0), BONE, 0.05, s + 5));
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + ((i - 2) / 2) * 0.7;
        parts.push(paint(new THREE.OctahedronGeometry(hr * 0.2).scale(0.4, 2.2, 0.14).rotateX(-0.5).translate(Math.cos(a) * r * 0.8, y - hr * 0.35, Math.sin(a) * r * 0.85), ['#3b3a46', '#5b4a7a', '#2e5d5a'][i % 3]!));
      }
      parts.push(paint(new THREE.TorusGeometry(hr * 0.08, hr * 0.03, 4, 6).translate(0, y + hr * 0.05, r * 0.9), '#d9a441')); // a gold ring on the brow
      g = merge(parts);
      break;
    }
    default: g = null;
  }
  if (g) WEAR.set(key, g);
  return g;
}
