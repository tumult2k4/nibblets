import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Plant, Rock } from '../sim/state';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { flatMat } from './lowpoly';
import { pile, stockpileGroup } from './piles';
import { berryGeo, appleGeo, berryBushGeo, bushGeo, flowerGeo, grassGeo, rockGeo, saplingGeo, seedMoundGeo, sproutGeo, stumpGeo, treeGeo } from './meshFactory';
import { PROP_COLORS } from './palette';
import { seasonLook, type SeasonLook } from './seasons';
import { clockAt } from '../sim/time';
import type { Interp } from './interpolation';

const HS = CFG.world.heightScale;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const BLIGHT = new THREE.Color().setRGB(3.2, 0.75, 0.35); // × the leaves' green: a sick yellow-brown

const hash = (n: number): number => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
};

type GeoKey = 'seed' | 'sprout' | 'sapling' | 'stump' | 'full';
const geoKey = (p: Plant): GeoKey =>
  p.stage === 'seed' || p.stage === 'sprout' || p.stage === 'sapling' || p.stage === 'stump' ? p.stage : 'full';
const GEOS = new Map<string, THREE.BufferGeometry>();
function geoFor(kind: Plant['kind'], k: GeoKey): THREE.BufferGeometry {
  const key = k === 'full' ? kind : k;
  let g = GEOS.get(key);
  if (!g) {
    g = k === 'seed' ? seedMoundGeo() : k === 'sprout' ? sproutGeo() : k === 'sapling' ? saplingGeo() : k === 'stump' ? stumpGeo()
      : kind === 'apple_bush' ? bushGeo() : kind === 'berry_bush' ? berryBushGeo() : kind === 'tree' ? treeGeo() : flowerGeo();
    GEOS.set(key, g);
  }
  return g;
}
/** Per-instance size: young plants are smaller, trees/flowers vary more. */
export function plantScale(p: Plant): number {
  const r = hash(p.id);
  const base = p.kind === 'tree' ? 0.8 + r * 0.6 : p.kind === 'flower' ? 0.8 + r * 0.5 : 0.85 + r * 0.3;
  if (p.stage === 'young') return base * (p.kind === 'tree' ? 0.4 : 0.6) * (1 + p.growth * 0.4);
  if (p.stage === 'sapling' && p.kind === 'tree') return 1.3;
  return base;
}
const STAGE_IDX: Record<Plant['stage'], number> = { seed: 0, sprout: 1, sapling: 2, young: 3, mature: 4, old: 5, dead: 6, stump: 7 };
/** Static-prop signature: plant stages, the held plant, and rocks as they are mined down. */
function plantsSig(ps: readonly Plant[], held: { kind: string; id: number } | null, rocks: readonly Rock[]): string {
  let h = held?.kind === 'plant' ? held.id : 2166136261;
  for (const p of ps) h = Math.imul(h ^ (p.id * 8 + STAGE_IDX[p.stage]), 16777619);
  for (const r of rocks) h = Math.imul(h ^ (r.id * 16 + r.stoneLeft), 16777619);
  return `${ps.length}:${rocks.length}:${h >>> 0}`;
}

/** Instanced static props (bushes, trees, rocks, flowers, grass), live apples, and ground items. */
export class Props {
  readonly group = new THREE.Group();
  private apples: THREE.InstancedMesh;
  private berries: THREE.InstancedMesh;
  private appleSig = '';
  private plantMeshes: THREE.InstancedMesh[] = [];
  private items = new Map<number, THREE.Object3D>();
  private stock: THREE.Group | null = null;
  private held: THREE.Mesh | null = null;
  private stockSig = '';
  private plantsSig = '';
  private sigTimer = 0;
  private look: SeasonLook = seasonLook(clockAt(0)).look;
  private lookSig = 'spring';
  private grassMesh: THREE.InstancedMesh | null = null;
  private grassSig = -1;
  /** plant id → [mesh, instance index] for picking */
  readonly plantIndex = new Map<THREE.InstancedMesh, Plant[]>();

  constructor(private w: World) {
    this.apples = new THREE.InstancedMesh(appleGeo(), flatMat, 4000);
    this.apples.castShadow = false;
    this.group.add(this.apples);
    this.berries = new THREE.InstancedMesh(berryGeo(), flatMat, 4000);
    this.berries.castShadow = false;
    this.group.add(this.berries);
    this.buildStatic();
  }

  private ground(x: number, y: number): number {
    return heightAt(this.w.s, { x, y }) * HS;
  }

  /** Per-instance color: plant variety × seasonal foliage tint (§9.3). */
  private tint(p: Plant, col: THREE.Color): THREE.Color {
    const L = this.look;
    if (p.kind === 'flower') return col.set(PROP_COLORS.flower[p.id % 4]!).multiply(L.flower);
    if (p.stage === 'old') col.setRGB(0.85, 0.78, 0.62);
    else col.setScalar(0.9 + hash(p.id + 7) * 0.2);
    if (p.stage === 'stump' || p.stage === 'seed') return col;
    col.multiply(p.kind === 'tree' ? L.tree : L.bush);
    return p.blight > 0 ? col.lerp(BLIGHT, 0.3 + 0.7 * p.blight) : col; // P6.3: blight browns the leaves
  }

  /** Apply a new seasonal look by recoloring instances in place (no geometry rebuild). */
  setLook(look: SeasonLook, sig: string): void {
    if (sig === this.lookSig) return;
    this.lookSig = sig;
    this.look = look;
    const col = new THREE.Color();
    for (const [mesh, list] of this.plantIndex) {
      list.forEach((p, i) => mesh.setColorAt(i, this.tint(p, col)));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const g = this.grassMesh;
    if (g) {
      for (let i = 0; i < g.count; i++) g.setColorAt(i, look.grass);
      if (g.instanceColor) g.instanceColor.needsUpdate = true;
    }
  }

  buildStatic(): void {
    for (const m of this.plantMeshes) this.group.remove(m);
    this.plantMeshes = [];
    this.plantIndex.clear();
    const s = this.w.s;
    const groups = new Map<string, Plant[]>();
    const heldId = s.god.held?.kind === 'plant' ? s.god.held.id : -1;
    for (const p of s.plants) {
      if (p.id === heldId) continue;
      const k = `${p.kind}:${geoKey(p)}`;
      let arr = groups.get(k);
      if (!arr) groups.set(k, (arr = []));
      arr.push(p);
    }
    const col = new THREE.Color();
    for (const [key, list] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const [kind, gk] = key.split(':') as [Plant['kind'], GeoKey];
      const mesh = new THREE.InstancedMesh(geoFor(kind, gk), flatMat, list.length);
      mesh.castShadow = gk === 'full' && kind !== 'flower';
      mesh.receiveShadow = true;
      list.forEach((p, i) => {
        const r = hash(p.id);
        const size = plantScale(p);
        q.setFromAxisAngle(up, r * Math.PI * 2);
        m4.compose(v.set(p.pos.x, this.ground(p.pos.x, p.pos.y), p.pos.y), q, sc.set(size, size, size));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, this.tint(p, col));
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
      // shrinks as it is mined (stoneLeft starts at size × 4)
      const k = 0.6 + 0.45 * Math.max(0.6, r.stoneLeft / 4);
      q.setFromAxisAngle(up, hash(r.id) * 6.28);
      m4.compose(v.set(r.pos.x, this.ground(r.pos.x, r.pos.y) - 0.05, r.pos.y), q, sc.set(k, k * (0.8 + hash(r.id + 3) * 0.5), k));
      rocks.setMatrixAt(i, m4);
    });
    this.group.add(rocks);
    this.plantMeshes.push(rocks);
    const grass = new THREE.InstancedMesh(grassGeo(), flatMat, Math.max(1, s.grass.length * 3));
    this.grassMesh = grass;
    this.grassSig = -1;
    this.layoutGrass();
    for (let i = 0; i < grass.count; i++) grass.setColorAt(i, this.look.grass);
    this.group.add(grass);
    this.plantMeshes.push(grass);
    this.plantsSig = plantsSig(s.plants, s.god.held, s.rocks);
  }

  update(interp: Interp, alpha: number): void {
    const s = this.w.s;
    this.sigTimer -= 1;
    if (this.sigTimer <= 0) {
      this.sigTimer = 15;
      if (plantsSig(s.plants, s.god.held, s.rocks) !== this.plantsSig) this.buildStatic();
      else this.layoutGrass();
    }
    this.updateApples();
    this.updateItems(interp, alpha);
    this.updateHeldPlant();
  }

  /** Grass tufts shrink when cut for fiber and fill out as they regrow (P5.6); a cut-down patch is a few stubs. */
  private layoutGrass(): void {
    const mesh = this.grassMesh, s = this.w.s;
    if (!mesh) return;
    const sig = s.grass.reduce((n, g) => n + Math.round(g.density * 10), 0);
    if (sig === this.grassSig) return;
    this.grassSig = sig;
    let gi = 0;
    for (const g of s.grass)
      for (let k = 0; k < 3; k++) {
        const x = g.pos.x + (hash(g.id * 3 + k) - 0.5) * 1.2, y = g.pos.y + (hash(g.id * 5 + k) - 0.5) * 1.2;
        q.setFromAxisAngle(up, hash(g.id + k) * 6.28);
        const k2 = 0.25 + Math.round(g.density * 10) * 0.105;
        m4.compose(v.set(x, this.ground(x, y), y), q, sc.set(0.7 + k2 * 0.3, k2, 0.7 + k2 * 0.3));
        mesh.setMatrixAt(gi++, m4);
      }
    mesh.count = gi;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateApples(): void {
    const s = this.w.s;
    let sig = '';
    for (const p of s.plants) if (p.fruit) sig += p.id + ':' + p.fruit + ',';
    if (sig === this.appleSig) return;
    this.appleSig = sig;
    let i = 0;
    let j = 0;
    for (const p of s.plants) {
      if (!p.fruit || (p.kind !== 'apple_bush' && p.kind !== 'berry_bush')) continue;
      const berry = p.kind === 'berry_bush';
      const mesh = berry ? this.berries : this.apples;
      const size = plantScale(p);
      const base = this.ground(p.pos.x, p.pos.y);
      for (let k = 0; k < p.fruit; k++) {
        const idx = berry ? j : i;
        if (idx >= mesh.instanceMatrix.count) break;
        const a = hash(p.id * 13 + k) * Math.PI * 2;
        const hgt = berry ? 0.25 + hash(p.id * 17 + k) * 0.2 : 0.35 + hash(p.id * 17 + k) * 0.4;
        const r = (berry ? 0.33 : 0.42) * size;
        m4.compose(v.set(p.pos.x + Math.cos(a) * r, base + hgt * size, p.pos.y + Math.sin(a) * r), q.identity(), sc.set(1, 1, 1));
        mesh.setMatrixAt(idx, m4);
        if (berry) j++;
        else i++;
      }
    }
    this.apples.count = i;
    this.berries.count = j;
    this.apples.instanceMatrix.needsUpdate = true;
    this.berries.instanceMatrix.needsUpdate = true;
  }

  private updateItems(interp: Interp, alpha: number): void {
    const s = this.w.s;
    const seen = new Set<number>();
    for (const it of s.groundItems) {
      seen.add(it.id);
      let mesh = this.items.get(it.id);
      if (!mesh || mesh.userData.qty !== it.stack.qty) {
        if (mesh) this.group.remove(mesh);
        mesh = pile(it.stack.type, it.stack.qty, it.id);
        mesh.userData = { kind: 'item', id: it.id, qty: it.stack.qty };
        mesh.rotation.y = hash(it.id) * 6.28;
        this.items.set(it.id, mesh);
        this.group.add(mesh);
      }
      const p = interp.get(it.id, alpha);
      const z = p?.z ?? (it.airborne ? it.airborne.z : this.ground(it.pos.x, it.pos.y));
      mesh.position.set(p?.x ?? it.pos.x, z, p?.y ?? it.pos.y);
      if (it.airborne) mesh.rotation.x += 0.15;
      else mesh.rotation.x = 0;
    }
    for (const [id, m] of this.items) if (!seen.has(id)) {
      this.group.remove(m);
      this.items.delete(id);
    }
    this.updateStockpile();
  }

  /** An uprooted plant dangles under the god hand (roots and all). */
  private updateHeldPlant(): void {
    const h = this.w.s.god.held;
    const p = h?.kind === 'plant' ? this.w.s.plants.find((x) => x.id === h.id) : undefined;
    if (!p || !h) {
      if (this.held) this.group.remove(this.held);
      this.held = null;
      return;
    }
    if (!this.held || this.held.userData.id !== p.id) {
      if (this.held) this.group.remove(this.held);
      this.held = new THREE.Mesh(geoFor(p.kind, geoKey(p)), flatMat);
      this.held.userData = { id: p.id };
      this.held.scale.setScalar(plantScale(p));
      this.held.position.set(h.pos.x, this.ground(h.pos.x, h.pos.y) + h.height * 0.8, h.pos.y);
      this.group.add(this.held);
    }
    const z = Math.max(this.ground(h.pos.x, h.pos.y), CFG.world.waterLevel * HS) + h.height * 0.8;
    this.held.position.lerp(v.set(h.pos.x, z, h.pos.y), 0.3);
    this.held.rotation.z = Math.sin(performance.now() / 300) * 0.15;
  }

  /** The village store: a plank pallet with one small pile per stored item type; from P7.5 the materials on a second pallet at their zone. */
  private updateStockpile(): void {
    const v = this.w.s.village, mp = v.materialPos;
    const sig = `${v.stockpilePos.x},${v.stockpilePos.y},${mp?.x},${mp?.y}:` + v.stockpile.map((x) => `${x.type}${Math.min(x.qty, 8)}`).join(',');
    if (sig === this.stockSig) return;
    this.stockSig = sig;
    if (this.stock) this.group.remove(this.stock);
    const all = stockpileGroup(v, this.ground.bind(this));
    all.userData = { kind: 'stockpile' };
    this.stock = all;
    this.group.add(all);
  }

  itemMeshes(): THREE.Object3D[] {
    return [...this.items.values()];
  }
}
