import * as THREE from 'three';
import { flatMat } from './lowpoly';
import { itemGeo } from './meshFactory';
import type { ItemType } from '../shared/types';

const hash = (n: number): number => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
};

/** A small heap of `qty` copies (max 6) of an item, arranged deterministically. */
export function pile(type: ItemType, qty: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(1, Math.min(6, qty));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(itemGeo(type), flatMat);
    m.castShadow = true;
    const a = i * 2.4 + hash(seed + i) * 0.6;
    const r = i === 0 ? 0 : 0.12 + 0.05 * (i % 3);
    m.position.set(Math.cos(a) * r, i >= 4 ? 0.09 : 0, Math.sin(a) * r);
    m.rotation.y = hash(seed * 3 + i) * 6.28;
    g.add(m);
  }
  return g;
}
