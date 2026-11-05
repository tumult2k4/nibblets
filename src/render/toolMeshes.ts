import * as THREE from 'three';
import { flatMat, merge, paint, wobble } from './lowpoly';
import { PROP_COLORS as P } from './palette';
import type { ItemType } from '../shared/types';

const FLINT = '#4c4f5c';
const SHAFT = '#a07a4e';

/** A shaft along +X centred on the origin, lying on the ground. */
const shaft = (len: number, r: number, color = SHAFT): THREE.BufferGeometry =>
  paint(new THREE.CylinderGeometry(r, r, len, 4).rotateZ(Math.PI / 2).translate(0, r, 0), color);

/**
 * Tools & weapons (P4.1), modelled lying flat with the business end at +X. P4.2 reuses them in the hand slot.
 * Returns null for anything that is not a tool.
 */
export function toolGeo(t: ItemType): THREE.BufferGeometry | null {
  switch (t) {
    case 'spear':
      return merge([shaft(0.75, 0.018), paint(new THREE.ConeGeometry(0.03, 0.12, 4).rotateZ(-Math.PI / 2).translate(0.43, 0.02, 0), '#d6b98a')]);
    case 'stone_spear':
      return merge([shaft(0.75, 0.018), paint(new THREE.TetrahedronGeometry(0.06).scale(1.8, 0.6, 0.8).translate(0.43, 0.025, 0), FLINT)]);
    case 'club':
      return merge([paint(new THREE.CylinderGeometry(0.05, 0.025, 0.45, 5).rotateZ(Math.PI / 2).translate(0, 0.045, 0), P.wood, 0.04),
        paint(wobble(new THREE.DodecahedronGeometry(0.07, 0).translate(0.24, 0.06, 0), 0.02, 4), P.stone, 0.05)]);
    case 'stone_axe':
      return merge([shaft(0.45, 0.02), paint(new THREE.BoxGeometry(0.07, 0.04, 0.16).translate(0.19, 0.03, 0.06), FLINT, 0.04),
        paint(new THREE.TorusGeometry(0.025, 0.008, 3, 6).rotateY(Math.PI / 2).translate(0.17, 0.02, 0), '#c9b26a')]);
    case 'pick':
      return merge([shaft(0.45, 0.02), paint(wobble(new THREE.CylinderGeometry(0.025, 0.012, 0.3, 4).rotateX(Math.PI / 2).translate(0.2, 0.03, 0), 0.01, 7), P.stone, 0.05),
        paint(new THREE.TorusGeometry(0.025, 0.008, 3, 6).rotateY(Math.PI / 2).translate(0.17, 0.02, 0), '#c9b26a')]);
    default:
      return null;
  }
}

const GOLD = new THREE.MeshLambertMaterial({ color: '#f2c94c', emissive: '#6b4a00', flatShading: true });
const HELD = new Map<ItemType, THREE.BufferGeometry>();

/**
 * A tool held in the right hand: the shaft sticks out forward from the fist with the head ahead, so arm swings
 * read as blows. Fine items get a tiny gold band at the grip (§11.1).
 */
export function heldMesh(t: ItemType, fine: boolean): THREE.Object3D {
  let geo = HELD.get(t);
  if (!geo) {
    geo = toolGeo(t)?.clone() ?? new THREE.BoxGeometry(0.1, 0.1, 0.1);
    geo.computeBoundingBox();
    const minX = geo.boundingBox!.min.x;
    geo.translate(-minX - 0.06, -0.02, 0).rotateY(-Math.PI / 2); // grip at the fist, business end forward
    HELD.set(t, geo);
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, flatMat);
  m.castShadow = true;
  g.add(m);
  if (fine) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 4, 8), GOLD);
    band.position.set(0, 0, 0.05);
    g.add(band);
  }
  g.rotation.x = -0.5; // tilt the head up a little
  return g;
}
