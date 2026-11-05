import * as THREE from 'three';
import type { WorldState } from '../sim/state';
import { CFG } from '../sim/config';
import { cornerHeight, tileAt } from '../sim/grid';
import { BIOME_COLORS, DIRT } from './palette';

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

/** Terrain split into 16×16-tile chunks so terraforming can rebuild locally (§17.5.3). */
export class TerrainMesh {
  readonly group = new THREE.Group();
  readonly chunks = new Map<string, THREE.Mesh>();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  constructor(private s: WorldState) {
    const C = CFG.world.chunk;
    for (let cy = 0; cy < s.size.h; cy += C) for (let cx = 0; cx < s.size.w; cx += C) this.buildChunk(cx, cy);
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
        c.copy(BIOME_COLORS[t.biome]);
        if (t.biome === 'water') c.copy(BIOME_COLORS.sand).lerp(BIOME_COLORS.water, 0.5);
        if (slope > 0.9 && t.biome !== 'water') c.lerp(BIOME_COLORS.rock, Math.min(0.6, (slope - 0.9) * 0.8));
        if (t.wear > 0.2) c.lerp(DIRT, Math.min(0.8, t.wear));
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
