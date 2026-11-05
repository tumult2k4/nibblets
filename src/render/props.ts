import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Plant } from '../sim/state';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { flatMat } from './lowpoly';
import { appleGeo, berryBushGeo, bushGeo, flowerGeo, grassGeo, itemGeo, rockGeo, treeGeo } from './meshFactory';
import { PROP_COLORS } from './palette';
import type { Interp } from './interpolation';

const HS = CFG.world.heightScale;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const sc = new THREE.Vector3();

const hash = (n: number): number => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
};

/** Instanced static props (bushes, trees, rocks, flowers, grass), live apples, and ground items. */
export class Props {
  readonly group = new THREE.Group();
  private apples: THREE.InstancedMesh;
  private appleSig = '';
  private plantMeshes: THREE.InstancedMesh[] = [];
  private items = new Map<number, THREE.Mesh>();
  private plantsSig = '';
  /** plant id → [mesh, instance index] for picking */
  readonly plantIndex = new Map<THREE.InstancedMesh, Plant[]>();

  constructor(private w: World) {
    this.apples = new THREE.InstancedMesh(appleGeo(), flatMat, CFG.world.appleBushes * CFG.plants.maxApples * 3 + 50);
    this.apples.castShadow = false;
    this.group.add(this.apples);
    this.buildStatic();
  }

  private ground(x: number, y: number): number {
    return heightAt(this.w.s, { x, y }) * HS;
  }

  buildStatic(): void {
    for (const m of this.plantMeshes) this.group.remove(m);
    this.plantMeshes = [];
    this.plantIndex.clear();
    const s = this.w.s;
    const kinds: [Plant['kind'], THREE.BufferGeometry, boolean][] = [
      ['apple_bush', bushGeo(), true], ['berry_bush', berryBushGeo(), true], ['tree', treeGeo(), true], ['flower', flowerGeo(), false],
    ];
    for (const [kind, geo, shadow] of kinds) {
      const list = s.plants.filter((p) => p.kind === kind);
      const mesh = new THREE.InstancedMesh(geo, flatMat, Math.max(1, list.length));
      mesh.count = list.length;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      const col = new THREE.Color();
      list.forEach((p, i) => {
        const r = hash(p.id);
        const size = kind === 'tree' ? 0.8 + r * 0.6 : kind === 'flower' ? 0.8 + r * 0.5 : 0.85 + r * 0.3;
        q.setFromAxisAngle(up, r * Math.PI * 2);
        m4.compose(v.set(p.pos.x, this.ground(p.pos.x, p.pos.y), p.pos.y), q, sc.set(size, size, size));
        mesh.setMatrixAt(i, m4);
        if (kind === 'flower') mesh.setColorAt(i, col.set(PROP_COLORS.flower[p.id % 4]!));
        else mesh.setColorAt(i, col.setScalar(0.9 + hash(p.id + 7) * 0.2));
      });
      mesh.name = kind;
      this.plantIndex.set(mesh, list);
      this.group.add(mesh);
      this.plantMeshes.push(mesh);
    }
    const rocks = new THREE.InstancedMesh(rockGeo(), flatMat, Math.max(1, s.rocks.length));
    rocks.count = s.rocks.length;
    rocks.castShadow = true;
    s.rocks.forEach((r, i) => {
      const k = 0.6 + r.size * 0.45;
      q.setFromAxisAngle(up, hash(r.id) * 6.28);
      m4.compose(v.set(r.pos.x, this.ground(r.pos.x, r.pos.y) - 0.05, r.pos.y), q, sc.set(k, k * (0.8 + hash(r.id + 3) * 0.5), k));
      rocks.setMatrixAt(i, m4);
    });
    this.group.add(rocks);
    this.plantMeshes.push(rocks);
    const grass = new THREE.InstancedMesh(grassGeo(), flatMat, Math.max(1, s.grass.length * 3));
    let gi = 0;
    for (const g of s.grass)
      for (let k = 0; k < 3; k++) {
        const x = g.pos.x + (hash(g.id * 3 + k) - 0.5) * 1.2, y = g.pos.y + (hash(g.id * 5 + k) - 0.5) * 1.2;
        q.setFromAxisAngle(up, hash(g.id + k) * 6.28);
        const k2 = 0.7 + g.density * 0.6;
        m4.compose(v.set(x, this.ground(x, y), y), q, sc.set(k2, k2, k2));
        grass.setMatrixAt(gi++, m4);
      }
    grass.count = gi;
    this.group.add(grass);
    this.plantMeshes.push(grass);
    this.plantsSig = `${s.plants.length}:${s.plants[0]?.id ?? 0}:${s.plants[s.plants.length - 1]?.id ?? 0}`;
  }

  update(interp: Interp, alpha: number): void {
    const s = this.w.s;
    const sig = `${s.plants.length}:${s.plants[0]?.id ?? 0}:${s.plants[s.plants.length - 1]?.id ?? 0}`;
    if (sig !== this.plantsSig) this.buildStatic();
    this.updateApples();
    this.updateItems(interp, alpha);
  }

  private updateApples(): void {
    const s = this.w.s;
    let sig = '';
    for (const p of s.plants) if (p.kind === 'apple_bush' && p.fruit) sig += p.id + ':' + p.fruit + ',';
    if (sig === this.appleSig) return;
    this.appleSig = sig;
    let i = 0;
    for (const p of s.plants) {
      if (p.kind !== 'apple_bush') continue;
      const size = 0.85 + hash(p.id) * 0.3;
      const base = this.ground(p.pos.x, p.pos.y);
      for (let k = 0; k < p.fruit && i < this.apples.instanceMatrix.count; k++) {
        const a = hash(p.id * 13 + k) * Math.PI * 2;
        const hgt = 0.35 + hash(p.id * 17 + k) * 0.4;
        const r = 0.42 * size;
        m4.compose(v.set(p.pos.x + Math.cos(a) * r, base + hgt * size, p.pos.y + Math.sin(a) * r), q.identity(), sc.set(1, 1, 1));
        this.apples.setMatrixAt(i++, m4);
      }
    }
    this.apples.count = i;
    this.apples.instanceMatrix.needsUpdate = true;
  }

  private updateItems(interp: Interp, alpha: number): void {
    const s = this.w.s;
    const seen = new Set<number>();
    for (const it of s.groundItems) {
      seen.add(it.id);
      let mesh = this.items.get(it.id);
      if (!mesh) {
        mesh = new THREE.Mesh(itemGeo(it.stack.type), flatMat);
        mesh.castShadow = true;
        mesh.userData = { kind: 'item', id: it.id };
        mesh.rotation.y = hash(it.id) * 6.28;
        this.items.set(it.id, mesh);
        this.group.add(mesh);
      }
      const p = interp.get(it.id, alpha);
      const z = p?.z ?? (it.airborne ? it.airborne.z : this.ground(it.pos.x, it.pos.y));
      mesh.position.set(p?.x ?? it.pos.x, z, p?.y ?? it.pos.y);
      if (it.airborne) mesh.rotation.x += 0.15;
      else mesh.rotation.x = 0;
      const k = Math.min(1.6, 1 + (it.stack.qty - 1) * 0.15);
      mesh.scale.setScalar(k);
    }
    for (const [id, m] of this.items) if (!seen.has(id)) {
      this.group.remove(m);
      this.items.delete(id);
    }
  }

  itemMeshes(): THREE.Object3D[] {
    return [...this.items.values()];
  }
}
