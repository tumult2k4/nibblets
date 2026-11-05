import * as THREE from 'three';
import type { World } from '../sim/world';
import type { ID } from '../shared/types';

export interface Pick { ground: THREE.Vector3 | null; entity: { kind: 'goblin' | 'item' | 'plant'; id: ID } | null }

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmp = new THREE.Vector3();

/** Terrain hit point + nearest entity under the cursor (screen-space for goblins, raycast for the rest). */
export function pick(
  w: World, cam: THREE.Camera, x: number, y: number, width: number, height: number,
  terrain: THREE.Object3D[], goblinPos: (id: ID) => THREE.Vector3 | null, items: THREE.Object3D[], plants: THREE.InstancedMesh[],
  plantList: (m: THREE.InstancedMesh) => { id: ID }[] | undefined,
): Pick {
  ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const hit = ray.intersectObjects(terrain, false)[0];
  const ground = hit ? hit.point.clone() : null;
  // goblins: nearest projected centre within a radius that grows when zoomed in
  let best: { id: ID; d: number } | null = null;
  for (const g of w.s.goblins) {
    const p = goblinPos(g.id);
    if (!p) continue;
    tmp.copy(p).project(cam);
    if (tmp.z > 1) continue;
    const sx = (tmp.x * 0.5 + 0.5) * width, sy = (-tmp.y * 0.5 + 0.5) * height;
    const camDist = (cam as THREE.PerspectiveCamera).position.distanceTo(p);
    const r = Math.max(14, 520 / camDist);
    const d = Math.hypot(sx - x, sy - y);
    if (d < r && (!best || d < best.d)) best = { id: g.id, d };
  }
  if (best) return { ground, entity: { kind: 'goblin', id: best.id } };
  const ih = ray.intersectObjects(items, true)[0];
  const io = ih?.object.parent?.userData.kind === 'item' ? ih.object.parent : ih?.object;
  if (io?.userData.kind === 'item') return { ground, entity: { kind: 'item', id: io.userData.id as ID } };
  const ph = ray.intersectObjects(plants, false)[0];
  if (ph && ph.instanceId !== undefined) {
    const list = plantList(ph.object as THREE.InstancedMesh);
    const p = list?.[ph.instanceId];
    if (p) return { ground, entity: { kind: 'plant', id: p.id } };
  }
  return { ground, entity: null };
}
