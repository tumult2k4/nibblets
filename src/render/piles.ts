import * as THREE from 'three';
import { flatMat } from './lowpoly';
import { itemGeo, palletGeo } from './meshFactory';
import { isMaterial } from '../sim/commons';
import type { ItemStack, ItemType, Vec2 } from '../shared/types';
import type { VillageState } from '../sim/state';

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

/** The village store (P2.3): a plank pallet with a small pile per stored item type; from P7.5 the materials lie on a second pallet at their zone. */
export function stockpileGroup(v: VillageState, ground: (x: number, y: number) => number): THREE.Group {
  const all = new THREE.Group(), mp = v.materialPos;
  const zone = (at: Vec2, stacks: ItemStack[]): void => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(palletGeo(), flatMat);
    base.receiveShadow = true;
    g.add(base);
    stacks.forEach((st, i) => {
      const m = pile(st.type, Math.min(st.qty, 8), i * 31 + 5);
      m.position.set(((i % 3) - 1) * 0.55, 0.06, (Math.floor(i / 3) - 0.5) * 0.55);
      g.add(m);
    });
    g.position.set(at.x, ground(at.x, at.y), at.y);
    all.add(g);
  };
  zone(v.stockpilePos, mp ? v.stockpile.filter((st) => !isMaterial(st.type)) : v.stockpile);
  if (mp) zone(mp, v.stockpile.filter((st) => isMaterial(st.type)));
  return all;
}
