import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Building, Trinket } from '../sim/state';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { flatMat, flatMatDouble, merge, paint, wobble } from './lowpoly';
import { pile } from './piles';
import { campfireGeo } from './fireView';
import { dryingRackGeo, grindingStoneGeo, rackItems, storagePitGeo } from './fiberMeshes';
import { gateGeo, kilnGeo, watchtowerGeo, workbenchGeo } from './stationMeshes';
import { hearthGeo, longhouseGeo, nurseryGeo, wellGeo } from './settlementMeshes';
import { bridgeGeo, compostHeapGeo, gardenPlotGeo } from './gardenMeshes';
import { paintGroup, shelfGroup } from './trinketMeshes';

const HS = CFG.world.heightScale;
const WOOD = '#9a6b3f', THATCH = '#d4a94e', DARK = '#4a3420';

/** Round wattle hut with a thatched cone roof, door and one window (§10, P3.3). */
function hutGeo(): THREE.BufferGeometry {
  return merge([
    paint(wobble(new THREE.CylinderGeometry(0.92, 1.02, 0.95, 7).translate(0, 0.47, 0), 0.05, 31), WOOD, 0.06, 3),
    paint(wobble(new THREE.ConeGeometry(1.42, 1.15, 7).translate(0, 1.5, 0), 0.08, 37), THATCH, 0.07, 5),
    paint(new THREE.ConeGeometry(0.18, 0.3, 5).translate(0, 2.15, 0), '#8a6a2e'),
    paint(new THREE.BoxGeometry(0.42, 0.62, 0.1).translate(0, 0.31, 0.98), DARK),
    paint(new THREE.BoxGeometry(0.1, 0.24, 0.26).translate(0.97, 0.6, 0), '#3a2a1a'),
  ]);
}

/** Scaffold: corner poles, a ring of wall rising with progress, roof frame near the end. */
function scaffoldGroup(progress: number): THREE.Group {
  const g = new THREE.Group();
  const poles: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    poles.push(paint(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 4).translate(Math.cos(a) * 1.05, 0.85, Math.sin(a) * 1.05), '#7a5636'));
  }
  const wallH = Math.max(0.05, Math.min(1, progress / 0.7)) * 0.95;
  poles.push(paint(new THREE.CylinderGeometry(0.95, 1.02, wallH, 7, 1, true).translate(0, wallH / 2, 0), WOOD, 0.08, 7));
  if (progress > 0.7) {
    const k = (progress - 0.7) / 0.3;
    poles.push(paint(new THREE.ConeGeometry(1.4 * k + 0.3, 1.1 * k + 0.1, 7, 1, true).translate(0, 0.95 + (1.1 * k + 0.1) / 2, 0), THATCH, 0.07, 9));
  }
  const m = new THREE.Mesh(merge(poles), flatMatDouble);
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Stone hut (P4.6): rough fieldstone wall under the same thatch, a lintel over the door. */
function stoneHutGeo(): THREE.BufferGeometry {
  return merge([
    paint(wobble(new THREE.CylinderGeometry(0.98, 1.1, 1.0, 8).translate(0, 0.5, 0), 0.07, 41), '#8f8b80', 0.1, 4),
    paint(wobble(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 8).translate(0, 1.02, 0), 0.04, 43), '#7a766c', 0.08),
    paint(wobble(new THREE.ConeGeometry(1.5, 1.2, 8).translate(0, 1.62, 0), 0.08, 47), THATCH, 0.07, 5),
    paint(new THREE.ConeGeometry(0.18, 0.3, 5).translate(0, 2.3, 0), '#8a6a2e'),
    paint(new THREE.BoxGeometry(0.44, 0.64, 0.1).translate(0, 0.32, 1.05), DARK),
    paint(new THREE.BoxGeometry(0.6, 0.1, 0.16).translate(0, 0.7, 1.06), '#6d6960'),
    paint(new THREE.BoxGeometry(0.1, 0.24, 0.26).translate(1.04, 0.62, 0), '#3a2a1a'),
  ]);
}

const GEOS = new Map<string, THREE.BufferGeometry>();
const FENCE_POST = paint(wobble(new THREE.CylinderGeometry(0.06, 0.075, 0.7, 5).translate(0, 0.35, 0), 0.015, 3), '#86603a', 0.08, 2);
/** A fence post with a pair of rails reaching halfway to each neighbouring post (so adjacent posts join up); cached per mask. */
function fenceGeo(mask: number): THREE.BufferGeometry {
  const hit = GEOS.get(`fence:${mask}`);
  if (hit) return hit;
  const parts = [FENCE_POST.clone(), paint(new THREE.ConeGeometry(0.075, 0.12, 5).translate(0, 0.76, 0), '#7a5636')];
  for (let k = 0; k < 8; k++) {
    if (!(mask & (1 << k))) continue;
    const [dx, dy] = DIRS[k]!, len = Math.hypot(dx, dy) * 0.5;
    for (const h of [0.26, 0.52])
      parts.push(paint(new THREE.BoxGeometry(len, 0.05, 0.04).translate(len / 2, h, 0).rotateY(-Math.atan2(dy, dx)), '#9a6b3f', 0.08));
  }
  const geo = merge(parts);
  GEOS.set(`fence:${mask}`, geo);
  return geo;
}
const DIRS: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function gateGeoCached(mask: number): THREE.BufferGeometry {
  let g = GEOS.get(`gate:${mask}`);
  if (!g) GEOS.set(`gate:${mask}`, (g = gateGeo(mask)));
  return g;
}

const GHOST_MAT = new THREE.MeshLambertMaterial({ color: '#9ec5e8', transparent: true, opacity: 0.32, depthWrite: false, flatShading: true });
const MAKERS: Partial<Record<Building['type'], () => THREE.BufferGeometry>> = {
  campfire: campfireGeo, stone_hut: stoneHutGeo, fence: () => fenceGeo(0),
  grinding_stone: grindingStoneGeo, drying_rack: dryingRackGeo, storage_pit: storagePitGeo,
  workbench: workbenchGeo, watchtower: watchtowerGeo, gate: () => gateGeo(1), kiln: kilnGeo,
  hearth: hearthGeo, longhouse: longhouseGeo, well: wellGeo, nursery: nurseryGeo,
  garden_plot: gardenPlotGeo, compost_heap: compostHeapGeo, bridge: () => bridgeGeo(),
};
/** Finished-building geometry by type (huts P3.3, campfire P4.3, preservation P5.6, P5.7 stations). */
function geoOf(type: Building['type']): THREE.BufferGeometry {
  let g = GEOS.get(type);
  if (!g) GEOS.set(type, (g = (MAKERS[type] ?? hutGeo)()));
  return g;
}
/** Lit window + doorway, and a pool of warm light spilling out past the roof's overhang. */
const WINDOW = merge([new THREE.BoxGeometry(0.05, 0.2, 0.22).translate(1.0, 0.6, 0), new THREE.BoxGeometry(0.34, 0.54, 0.04).translate(0, 0.29, 1.04)]);
const WINDOW_MAT = new THREE.MeshBasicMaterial({ color: '#ffc561', fog: false });
const POOL = new THREE.CircleGeometry(0.55, 10).rotateX(-Math.PI / 2).scale(1, 1, 1.4).translate(0, 0.04, 1.75);
const POOL_MAT = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

const progressBucket = (b: Building) => (b.buildProgress >= 1 ? 10 : Math.floor(b.buildProgress * 10));
const painted = (b: Building, tick: number): boolean => (b.data?.painted ?? 0) > tick;
const sigOf = (b: Building, tick: number, fenceMask = 0) => `${b.type}:${progressBucket(b)}:${b.storage.map((s) => s.qty).join('.')}:${fenceMask}:${b.decoration.join('.')}:${painted(b, tick) ? 1 : 0}`;

/** Read-only building views: translucent ghosts for blueprints, scaffolds while building, finished huts. */
export class BuildingViews {
  readonly group = new THREE.Group();
  private views = new Map<number, { obj: THREE.Group; sig: string }>();

  constructor(private w: World) {}

  /** Which of the 8 neighbouring tiles hold a finished fence (bit k = DIRS[k]). */
  private fenceMask(b: Building, posts: Set<string>): number {
    let m = 0;
    const x = Math.floor(b.pos.x), y = Math.floor(b.pos.y);
    DIRS.forEach(([dx, dy], k) => { if (posts.has(`${x + dx},${y + dy}`)) m |= 1 << k; });
    return m;
  }

  update(): void {
    const seen = new Set<number>();
    const ringed = (b: Building) => (b.type === 'fence' || b.type === 'gate') && b.buildProgress >= 1;
    const posts = new Set(this.w.s.buildings.filter(ringed).map((b) => `${Math.floor(b.pos.x)},${Math.floor(b.pos.y)}`));
    for (const b of this.w.s.buildings) {
      seen.add(b.id);
      const mask = ringed(b) ? this.fenceMask(b, posts) : 0;
      const sig = sigOf(b, this.w.s.tick, mask);
      const v = this.views.get(b.id);
      if (v && v.sig === sig) continue;
      if (v) this.group.remove(v.obj);
      const obj = this.build(b, mask);
      this.views.set(b.id, { obj, sig });
      this.group.add(obj);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.group.remove(v.obj); this.views.delete(id); }
  }

  /** Hut windows glow at night while someone is inside (§P3.7). */
  lights(night: number): void {
    const on = night > 0.35;
    WINDOW_MAT.color.setRGB(1, 0.62 + 0.15 * night, 0.25 + 0.1 * night);
    POOL_MAT.opacity = Math.max(0, night - 0.35) * 0.55;
    for (const [id, v] of this.views) {
      const win = v.obj.getObjectByName('window');
      if (!win) continue;
      const b = on ? this.w.s.buildings.find((x) => x.id === id) : undefined;
      win.visible = !!b && this.w.s.goblins.some((g) => !g.airborne && Math.hypot(g.pos.x - b.pos.x, g.pos.y - b.pos.y) <= CFG.temperature.shelterRadius);
    }
  }

  /** Re-seat buildings after terraforming. */
  reseat(): void {
    for (const v of this.views.values()) this.group.remove(v.obj);
    this.views.clear();
    this.update();
  }

  private build(b: Building, fenceMask: number): THREE.Group {
    const g = new THREE.Group();
    // (a bridge span stands at the water line)
    g.position.set(b.pos.x, (b.type === 'bridge' ? Math.max(heightAt(this.w.s, b.pos), CFG.world.waterLevel) : heightAt(this.w.s, b.pos)) * HS, b.pos.y);
    const fence = b.type === 'fence', ring = fence || b.type === 'gate', grid = b.type === 'bridge' || b.type === 'garden_plot';
    // rails, beds and spans line up with the grid
    g.rotation.y = ring ? 0 : grid ? (b.rotation * Math.PI) / 2 : (b.rotation * Math.PI) / 2 + ((b.id * 0.37) % 0.6) - 0.3;
    g.userData = { buildingId: b.id };
    const geo = geoOf(b.type);
    const hut = b.type === 'hut' || b.type === 'stone_hut';
    if (b.buildProgress >= 1) {
      const m = new THREE.Mesh(fence ? fenceGeo(fenceMask) : b.type === 'gate' ? gateGeoCached(fenceMask) : geo, flatMat);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      if (b.type === 'drying_rack') { // the batch hangs on the rails
        const fresh = b.storage.find((x) => x.type === 'apple')?.qty ?? 0, dried = b.storage.find((x) => x.type === 'dried_apple')?.qty ?? 0;
        const geo2 = rackItems(fresh || dried, !fresh);
        if (geo2) g.add(new THREE.Mesh(geo2, flatMat));
      }
      if (b.decoration.length && (hut || b.type === 'longhouse')) // P8.2: the trinket shelf by the door
        g.add(shelfGroup(b.decoration.map((id) => this.w.s.trinkets.find((t) => t.id === id)).filter((t): t is Trinket => !!t), b.type === 'longhouse'));
      if (hut && painted(b, this.w.s.tick)) g.add(paintGroup(b.id)); // P8.3: a prankster's handiwork
      if (!hut) return tag(g, b);
      const win = new THREE.Mesh(WINDOW, WINDOW_MAT);
      win.add(new THREE.Mesh(POOL, POOL_MAT));
      win.name = 'window';
      win.visible = false;
      g.add(win);
    } else {
      const ghost = new THREE.Mesh(geo, GHOST_MAT);
      ghost.renderOrder = 2;
      g.add(ghost);
      if (b.buildProgress > 0 && hut) g.add(scaffoldGroup(b.buildProgress));
      // delivered materials wait beside the site
      b.storage.forEach((st, i) => {
        const p = pile(st.type, st.qty, b.id * 7 + i);
        p.position.set(hut ? 1.5 : 0.9, 0, -0.6 + i * 0.7);
        g.add(p);
      });
    }
    return tag(g, b);
  }
}

function tag(g: THREE.Group, b: Building): THREE.Group {
  g.traverse((o) => (o.userData = { ...o.userData, buildingId: b.id }));
  return g;
}
