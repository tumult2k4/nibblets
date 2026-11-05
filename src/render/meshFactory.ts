import * as THREE from 'three';
import { merge, paint, wobble } from './lowpoly';
import { PROP_COLORS as P } from './palette';
import type { ItemType } from '../shared/types';

/** Low-poly prop geometries, built once and shared by instanced meshes. */
export function bushGeo(): THREE.BufferGeometry {
  const parts = [
    paint(wobble(new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.45, 0), 0.12, 3), P.bush, 0.06, 2),
    paint(wobble(new THREE.IcosahedronGeometry(0.36, 0).translate(0.3, 0.38, 0.12), 0.1, 5), P.bushDark, 0.05, 4),
    paint(wobble(new THREE.IcosahedronGeometry(0.34, 0).translate(-0.25, 0.4, -0.15), 0.1, 7), P.bush, 0.05, 6),
    paint(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 4).translate(0, 0.1, 0), P.trunk),
  ];
  return merge(parts);
}

export function berryBushGeo(): THREE.BufferGeometry {
  return merge([
    paint(wobble(new THREE.IcosahedronGeometry(0.38, 0).translate(0, 0.32, 0), 0.1, 11), '#4d7f3c', 0.06, 8),
    paint(wobble(new THREE.IcosahedronGeometry(0.28, 0).translate(0.22, 0.26, 0.1), 0.08, 13), '#406f33', 0.05, 9),
  ]);
}

export function berryGeo(): THREE.BufferGeometry {
  return paint(new THREE.OctahedronGeometry(0.05), P.berry);
}

export function treeGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 5).translate(0, 0.5, 0), P.trunk, 0.04, 3),
    paint(wobble(new THREE.ConeGeometry(0.95, 1.4, 6).translate(0, 1.5, 0), 0.12, 21), P.leaves, 0.06, 4),
    paint(wobble(new THREE.ConeGeometry(0.7, 1.1, 6).translate(0, 2.2, 0), 0.1, 23), P.leavesLight, 0.06, 5),
  ]);
}

export function rockGeo(): THREE.BufferGeometry {
  return paint(wobble(new THREE.DodecahedronGeometry(0.4, 0).scale(1, 0.65, 1).translate(0, 0.15, 0), 0.14, 31), P.rock, 0.08, 6);
}

export function flowerGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 3).translate(0, 0.11, 0), '#4f8a2e'),
    paint(new THREE.OctahedronGeometry(0.07).scale(1, 0.5, 1).translate(0, 0.24, 0), '#ffffff'),
  ]);
}

export function grassGeo(): THREE.BufferGeometry {
  return merge([0, 1, 2, 3].map((i) =>
    paint(new THREE.ConeGeometry(0.035, 0.32 + (i % 2) * 0.1, 3).translate(Math.cos(i * 1.6) * 0.09, 0.16, Math.sin(i * 1.6) * 0.09), P.grass, 0.05, i + 1)));
}

export function appleGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.IcosahedronGeometry(0.075, 0), P.apple, 0.04, 2),
    paint(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 3).translate(0, 0.08, 0), P.trunk),
  ]);
}

const ITEM_GEOS = new Map<string, THREE.BufferGeometry>();
/** Geometry for an item lying on the ground or carried. */
export function itemGeo(t: ItemType): THREE.BufferGeometry {
  const hit = ITEM_GEOS.get(t);
  if (hit) return hit;
  let g: THREE.BufferGeometry;
  switch (t) {
    case 'apple': g = appleGeo().scale(1.4, 1.4, 1.4).translate(0, 0.1, 0); break;
    case 'berry': g = paint(new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.06, 0), P.berry); break;
    case 'mushroom': g = merge([paint(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 4).translate(0, 0.05, 0), '#efe6d2'), paint(new THREE.ConeGeometry(0.09, 0.07, 6).translate(0, 0.12, 0), '#9a6b3f')]); break;
    case 'glowcap': g = merge([paint(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 4).translate(0, 0.05, 0), '#efe6d2'), paint(new THREE.ConeGeometry(0.09, 0.07, 6).translate(0, 0.12, 0), '#8fe3d4')]); break;
    case 'fish': g = paint(new THREE.OctahedronGeometry(0.1).scale(1.8, 0.6, 0.6).translate(0, 0.06, 0), '#8fb3c4'); break;
    case 'wood': g = paint(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 5).rotateZ(Math.PI / 2).translate(0, 0.07, 0), P.wood, 0.04); break;
    case 'stick': g = paint(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 3).rotateZ(Math.PI / 2).translate(0, 0.03, 0), P.trunk); break;
    case 'stone': g = paint(wobble(new THREE.DodecahedronGeometry(0.11, 0).translate(0, 0.08, 0), 0.04, 3), P.stone, 0.05); break;
    case 'flint': g = paint(new THREE.TetrahedronGeometry(0.1).translate(0, 0.07, 0), '#4c4f5c'); break;
    case 'fiber': g = paint(new THREE.TorusGeometry(0.08, 0.025, 3, 6).rotateX(Math.PI / 2).translate(0, 0.03, 0), '#c9b26a'); break;
    case 'clay': g = paint(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.6, 1).translate(0, 0.06, 0), '#b8734e'); break;
    case 'stew':
    case 'apple_mash': g = merge([paint(new THREE.CylinderGeometry(0.1, 0.07, 0.08, 6).translate(0, 0.04, 0), '#8a6a4a'), paint(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 6).translate(0, 0.08, 0), t === 'stew' ? '#b5642f' : '#e3c070')]); break;
    default: g = paint(new THREE.BoxGeometry(0.14, 0.14, 0.14).translate(0, 0.07, 0), '#c8a060');
  }
  ITEM_GEOS.set(t, g);
  return g;
}

/** Growth-stage geometries (§8.1): seed mound, sprout, sapling, stump. Young/mature/old reuse the full mesh scaled. */
export function seedMoundGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.SphereGeometry(0.22, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), '#7a5a3a', 0.05, 3),
    paint(new THREE.OctahedronGeometry(0.04).translate(0, 0.1, 0), '#d8c58a'),
  ]);
}

export function sproutGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.CylinderGeometry(0.015, 0.02, 0.18, 3).translate(0, 0.09, 0), '#5f9a3a'),
    paint(new THREE.OctahedronGeometry(0.07).scale(1.4, 0.3, 0.7).translate(0.07, 0.18, 0), '#7cc24e'),
    paint(new THREE.OctahedronGeometry(0.07).scale(1.4, 0.3, 0.7).translate(-0.07, 0.17, 0), '#6cb043'),
  ]);
}

export function saplingGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.CylinderGeometry(0.025, 0.035, 0.45, 4).translate(0, 0.22, 0), P.trunk),
    paint(wobble(new THREE.IcosahedronGeometry(0.2, 0).translate(0, 0.5, 0), 0.06, 41), P.bush, 0.05, 3),
  ]);
}

export function stumpGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.CylinderGeometry(0.14, 0.18, 0.18, 6).translate(0, 0.09, 0), P.trunk, 0.04, 2),
    paint(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 6).translate(0, 0.185, 0), '#d9b98a'),
  ]);
}

/** Stockpile base: three planks on the ground. */
export function palletGeo(): THREE.BufferGeometry {
  return merge([-0.4, 0, 0.4].map((z, i) => paint(new THREE.BoxGeometry(1.6, 0.05, 0.32).translate(0, 0.025, z), P.wood, 0.05, i + 1)));
}
