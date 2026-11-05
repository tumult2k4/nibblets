import * as THREE from 'three';
import type { WorldState } from '../sim/state';
import type { Biome } from '../shared/types';
import { CFG } from '../sim/config';
import { cornerHeight, tileAt } from '../sim/grid';
import { BIOME_COLORS, DIRT } from './palette';
import { SNOW_WHITE } from './seasons';

const HS = CFG.world.heightScale;
const JITTER = 0.15;

/** Deterministic per-corner jitter so neighbouring chunks share vertices exactly. */
function jitter(cx: number, cy: number, axis: number): number {
  let h = (cx * 374761393 + cy * 668265263 + axis * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 2 * JITTER;
}

export function cornerPos(s: WorldState, cx: number, cy: number): THREE.Vector3 {
  const edge = cx <= 0 || cy <= 0 || cx >= s.size.w || cy >= s.size.h;
  const jx = edge ? 0 : jitter(cx, cy, 0);
  const jz = edge ? 0 : jitter(cx, cy, 1);
  return new THREE.Vector3(cx + jx, cornerHeight(s, cx, cy) * HS, cy + jz);
}

export type TerrainLens = 'fertility' | 'moisture' | 'paths';
/** Snow cover in fifths: what the renderer can see change. */
const snowBucket = (v: number): number => (v < 0.05 ? 0 : Math.min(5, Math.ceil(v * 5)));

const BIOME_IDX: Record<string, number> & Record<'meadow', number> = { meadow: 0, forest: 1, sand: 2, rock: 3, water: 4, marsh: 5, snow: 6 };
const L_LOW = new THREE.Color('#9a4a2a'), L_MID = new THREE.Color('#e8cf62'), L_HIGH = new THREE.Color('#2f9e3a');
const M_LOW = new THREE.Color('#d8c48e'), M_HIGH = new THREE.Color('#2f78c4');
const P_HOT = new THREE.Color('#f08a24');

function lensColor(c: THREE.Color, t: { fertility: number; moisture: number; wear: number }, l: TerrainLens): void {
  if (l === 'fertility') {
    const k = Math.max(0, Math.min(1, (t.fertility - 0.2) / 0.9));
    if (k < 0.5) c.copy(L_LOW).lerp(L_MID, k * 2);
    else c.copy(L_MID).lerp(L_HIGH, (k - 0.5) * 2);
  }
  else if (l === 'moisture') c.copy(M_LOW).lerp(M_HIGH, Math.min(1, t.moisture));
  else c.multiplyScalar(0.55).lerp(P_HOT, Math.min(1, t.wear * 1.6));
}

/** Terrain split into 16×16-tile chunks so terraforming can rebuild locally (§17.5.3). */
export class TerrainMesh {
  readonly group = new THREE.Group();
  readonly chunks = new Map<string, THREE.Mesh>();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** Terrain lens (§18.10, P2.7): recolors tiles by fertility, moisture or path wear. */
  lens: TerrainLens | null = null;
  private snap: { h: Float32Array; b: Uint8Array; w: Uint8Array; f: Uint8Array; sn: Uint8Array };
  /** current seasonal biome palette (§9.3) */
  private biomes: Record<Biome, THREE.Color> = BIOME_COLORS;
  private paletteSig = 'spring';
  private wetSeen = -1;

  /** Darken the ground while it rains (0 dry … 1 soaked), §P3.7. */
  setWet(k: number): void {
    const q = Math.round(k * 20) / 20;
    if (q === this.wetSeen) return;
    this.wetSeen = q;
    this.mat.color.setRGB(1 - 0.28 * q, 1 - 0.24 * q, 1 - 0.18 * q);
  }

  constructor(private s: WorldState) {
    const n = s.tiles.length;
    this.snap = { h: new Float32Array(n), b: new Uint8Array(n), w: new Uint8Array(n), f: new Uint8Array(n), sn: new Uint8Array(n) };
    this.takeSnapshot();
    this.rebuildAll();
  }

  rebuildAll(): void {
    const C = CFG.world.chunk;
    for (let cy = 0; cy < this.s.size.h; cy += C) for (let cx = 0; cx < this.s.size.w; cx += C) this.buildChunk(cx, cy);
  }

  setLens(l: TerrainLens | null): void {
    if (l === this.lens) return;
    this.lens = l;
    this.rebuildAll();
  }

  /** Swap the seasonal palette; rebuilds every chunk only when the blend step changes. */
  setPalette(biomes: Record<Biome, THREE.Color>, sig: string): void {
    if (sig === this.paletteSig) return;
    this.paletteSig = sig;
    this.biomes = biomes;
    this.rebuildAll();
  }

  private takeSnapshot(): void {
    const { h, b, w, f, sn } = this.snap;
    this.s.tiles.forEach((t, i) => {
      h[i] = t.height;
      b[i] = (BIOME_IDX[t.biome] ?? 0);
      w[i] = Math.min(9, Math.floor(t.wear * 10));
      f[i] = Math.min(15, Math.floor(t.fertility * 10));
      sn[i] = snowBucket(t.snow);
    });
  }

  /**
   * Rebuild only chunks whose tiles changed since the last call (terraform, wear, fertility).
   * A tile's height moves its four corners, so neighbouring chunks are included at borders.
   */
  refresh(): number {
    const s = this.s;
    const C = CFG.world.chunk;
    const { h, b, w, f, sn } = this.snap;
    const dirty = new Set<string>();
    const W = s.size.w;
    s.tiles.forEach((t, i) => {
      const wb = Math.min(9, Math.floor(t.wear * 10));
      const fb = Math.min(15, Math.floor(t.fertility * 10));
      const sb = snowBucket(t.snow);
      if (h[i] === t.height && b[i] === (BIOME_IDX[t.biome] ?? 0) && w[i] === wb && sn[i] === sb && (f[i] === fb || this.lens !== 'fertility')) return;
      h[i] = t.height; b[i] = (BIOME_IDX[t.biome] ?? 0); w[i] = wb; f[i] = fb; sn[i] = sb;
      const x = i % W, y = Math.floor(i / W);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= s.size.h) continue;
        dirty.add(`${Math.floor(xx / C) * C},${Math.floor(yy / C) * C}`);
      }
    });
    for (const k of dirty) {
      const [x0, y0] = k.split(',').map(Number) as [number, number];
      this.buildChunk(x0, y0);
    }
    return dirty.size;
  }

  buildChunk(x0: number, y0: number): void {
    const s = this.s;
    const C = CFG.world.chunk;
    const key = `${x0},${y0}`;
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (let y = y0; y < Math.min(y0 + C, s.size.h); y++)
      for (let x = x0; x < Math.min(x0 + C, s.size.w); x++) {
        const t = tileAt(s, x, y)!;
        const a = cornerPos(s, x, y), b = cornerPos(s, x + 1, y), cc = cornerPos(s, x + 1, y + 1), d = cornerPos(s, x, y + 1);
        const slope = Math.max(a.y, b.y, cc.y, d.y) - Math.min(a.y, b.y, cc.y, d.y);
        const pal = this.biomes;
        c.copy(pal[t.biome]);
        if (t.biome === 'water') c.copy(pal.sand).lerp(pal.water, 0.5);
        if (slope > 0.9 && t.biome !== 'water') c.lerp(pal.rock, Math.min(0.6, (slope - 0.9) * 0.8));
        if (t.wear > 0.2) c.lerp(DIRT, Math.min(0.8, t.wear));
        if (t.snow > 0.05 && t.biome !== 'water') c.lerp(SNOW_WHITE, Math.min(0.95, snowBucket(t.snow) / 5 + 0.15));
        if (this.lens && t.biome !== 'water') lensColor(c, t, this.lens);
        // gentle per-tile variation
        const v = jitter(x, y, 7) * 0.12;
        const tri = (p: THREE.Vector3[], k: number) => {
          for (const q of p) pos.push(q.x, q.y, q.z);
          const r = Math.min(1, c.r + v + k), g = Math.min(1, c.g + v + k), bb = Math.min(1, c.b + v * 0.5 + k);
          for (let i = 0; i < 3; i++) col.push(r, g, bb);
        };
        // alternate the diagonal for a less gridded look
        if ((x + y) % 2) {
          tri([a, d, b], 0);
          tri([b, d, cc], -0.015);
        } else {
          tri([a, d, cc], 0);
          tri([a, cc, b], -0.015);
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.group.add(mesh);
    this.chunks.set(key, mesh);
  }

  dispose(): void {
    for (const m of this.chunks.values()) m.geometry.dispose();
    this.mat.dispose();
  }
}

/** Water plane at waterLevel with a gentle vertex wave (§23.1). */
export function makeWater(s: WorldState): { mesh: THREE.Mesh; update: (t: number) => void } {
  const geo = new THREE.PlaneGeometry(s.size.w + 80, s.size.h + 80, 96, 96);
  geo.rotateX(-Math.PI / 2);
  geo.translate(s.size.w / 2, CFG.world.waterLevel * HS - 0.05, s.size.h / 2);
  const mat = new THREE.MeshLambertMaterial({ color: '#4f9fc4', transparent: true, opacity: 0.75, flatShading: true });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.y += sin(position.x * 0.6 + uTime * 1.3) * 0.05 + cos(position.z * 0.5 + uTime * 0.9) * 0.05;`,
    );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  return { mesh, update: (t) => (uniforms.uTime.value = t) };
}
