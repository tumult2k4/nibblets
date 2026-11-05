/**
 * Touches on top of goblinView's poses. Illness (§14.3, P6.1): spotted fever shows as green spots on belly and head,
 * the shivers as a constant tremble (a goblin resting sick lies on its side, set in goblinView's chain). Fire (P6.2):
 * stomping out flames, high knees and arms flung out.
 */
import * as THREE from 'three';
import type { Goblin } from '../sim/state';
import { sickness } from '../sim/disease';
import type { GoblinRig } from './goblinMesh';

const spotGeo = new THREE.IcosahedronGeometry(0.03, 0).scale(1, 1, 0.45);
const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c: string) => mats.get(c) ?? mats.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true })).get(c)!;

/** Eight spots scattered over the front of the belly and three on the head, the same for the same goblin. */
function spots(color: string, seed: number, r: GoblinRig): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'spots';
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const put = (parent: THREE.Object3D, rad: number, cy: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (rnd() - 0.5) * 2.4, y = (rnd() - 0.4) * rad * 1.2;
      const h = Math.sqrt(Math.max(0, rad * rad - y * y));
      const m = new THREE.Mesh(spotGeo, mat(color));
      m.position.set(Math.sin(a) * h, cy + y, Math.cos(a) * h);
      m.lookAt(m.position.clone().multiplyScalar(2).setY(cy + y * 2));
      parent.add(m);
    }
  };
  put(grp, 0.185, 0.17, 8);
  r.body.add(grp);
  const head = new THREE.Group();
  head.name = 'spots';
  put(head, 0.18, 0, 3);
  r.head.add(head);
  return grp;
}

/** Called each frame after the pose is set. */
export function sickLook(g: Goblin, r: GoblinRig, t: number): void {
  const def = sickness(g);
  const color = def?.symptoms.color;
  const has = r.body.getObjectByName('spots');
  if (color && !has) spots(color, g.id * 7919 + 13, r);
  else if (!color && has) for (const p of [r.body, r.head]) p.getObjectByName('spots')?.removeFromParent();
  if (def && g.health.disease?.id === 'shivers') r.body.position.x += Math.sin(t * 55 + g.id) * 0.012;
  if (g.activity.action === 'extinguish_fire' && g.activity.stage === 1) {
    const k = Math.sin(t * 16 + g.id);
    r.legL.rotation.x = -Math.max(0, k) * 1.2; r.legR.rotation.x = -Math.max(0, -k) * 1.2;
    r.armL.rotation.x = r.armR.rotation.x = -0.6; r.armL.rotation.z = -0.9; r.armR.rotation.z = 0.9;
    r.body.position.y = 0.12 + Math.abs(k) * 0.05;
  }
}
