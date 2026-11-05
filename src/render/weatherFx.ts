import * as THREE from 'three';
import type { World } from '../sim/world';
import type { WeatherKind } from '../shared/types';
import { weatherAt } from '../sim/weather';
import { heightAt } from '../sim/grid';
import { CFG } from '../sim/config';

const R = 32, H = 26;
const RAIN_N = 2600, SNOW_N = 2200;
const OVERCAST: Record<WeatherKind, number> = { clear: 0, cloudy: 0.45, fog: 0.5, rain: 0.65, storm: 0.92, snow: 0.55, blizzard: 0.85, heatwave: -0.15 };
const FOG_MUL: Record<WeatherKind, number> = { clear: 1, cloudy: 1, fog: 0.22, rain: 0.7, storm: 0.55, snow: 0.6, blizzard: 0.2, heatwave: 0.9 };
const WIND: Record<WeatherKind, number> = { clear: 1, cloudy: 1.5, fog: 0.3, rain: 2, storm: 7, snow: 1.2, blizzard: 9, heatwave: 0.5 };
const smooth = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * Math.min(1, rate * dt);

/** What the rest of the renderer needs from the weather this frame. */
export interface WeatherLook { overcast: number; flash: number; fogMul: number; wet: number }

/**
 * Weather FX (§23, P3.7): rain streaks and snow flakes in a box around the camera target (only where it actually
 * rains or snows, so local cells show as columns), storm lightning flashes with a jagged bolt, smoothed overcast,
 * fog density and wet ground. Purely visual: render-side randomness is fine here.
 */
export class WeatherFx {
  readonly group = new THREE.Group();
  reduced = false;
  private rainBase = new Float32Array(RAIN_N * 3);
  private rainGeo = new THREE.BufferGeometry();
  private snowBase = new Float32Array(SNOW_N * 3);
  private snowGeo = new THREE.BufferGeometry();
  private bolt: THREE.Line;
  private boltLife = 0;
  private nextBolt = 3;
  private look: WeatherLook = { overcast: 0, flash: 0, fogMul: 1, wet: 0 };
  /** cloud discs above local cells (§17.5.2), warm glow under Warm Sun cells */
  private discs: THREE.Mesh[] = [];
  private discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);

  constructor() {
    for (const [base, n] of [[this.rainBase, RAIN_N], [this.snowBase, SNOW_N]] as const)
      for (let i = 0; i < n; i++) { base[i * 3] = (Math.random() * 2 - 1) * R; base[i * 3 + 1] = Math.random() * H; base[i * 3 + 2] = (Math.random() * 2 - 1) * R; }
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 6), 3));
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW_N * 3), 3));
    const rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: '#c6d6e6', transparent: true, opacity: 0.45, depthWrite: false }));
    const snow = new THREE.Points(this.snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.2, map: flake(), transparent: true, opacity: 0.95, depthWrite: false }));
    rain.frustumCulled = snow.frustumCulled = false;
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#f4f6ff', transparent: true, fog: false }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    this.group.add(rain, snow, this.bolt);
  }

  update(w: World, dt: number, center: THREE.Vector3): WeatherLook {
    dt = Math.min(dt, 0.1);
    const kind = weatherAt(w, { x: center.x, y: center.z });
    const cells = w.s.weather.cells;
    const kindAt = cells.length ? (x: number, z: number) => weatherAt(w, { x, y: z }) : () => w.s.weather.kind;
    const wd = w.s.weather.windDir, ws = WIND[kind];
    const wx = Math.cos(wd) * ws, wz = Math.sin(wd) * ws;
    const scale = this.reduced ? 0.4 : 1;
    let anyStorm = kind === 'storm';
    // rain: streaks slanted by the wind
    const rp = this.rainGeo.getAttribute('position') as THREE.BufferAttribute;
    const ra = rp.array as Float32Array;
    const rainN = Math.floor(RAIN_N * scale);
    for (let i = 0; i < RAIN_N; i++) {
      const b = i * 3;
      let y = this.rainBase[b + 1]! - (20 + (i % 7)) * dt;
      if (y < 0) y += H;
      this.rainBase[b + 1] = y;
      const x = wrap(this.rainBase[b]! + wx * dt * 0.6, center.x), z = wrap(this.rainBase[b + 2]! + wz * dt * 0.6, center.z);
      this.rainBase[b] = x - center.x; this.rainBase[b + 2] = z - center.z;
      const k = i < rainN ? kindAt(x, z) : 'clear';
      if (k === 'storm') anyStorm = true;
      const on = k === 'rain' || (k === 'storm');
      const dens = k === 'rain' ? i < rainN * 0.6 : true;
      const o = i * 6, gy = center.y - 4 + y;
      if (on && dens) {
        ra[o] = x; ra[o + 1] = gy; ra[o + 2] = z;
        ra[o + 3] = x - wx * 0.06; ra[o + 4] = gy + 0.55; ra[o + 5] = z - wz * 0.06;
      } else ra.fill(0, o, o + 6);
    }
    rp.needsUpdate = true;
    // snow: slow drifting flakes, blizzards nearly horizontal
    const sp = this.snowGeo.getAttribute('position') as THREE.BufferAttribute;
    const sa = sp.array as Float32Array;
    const snowN = Math.floor(SNOW_N * scale);
    const t = performance.now() / 1000;
    for (let i = 0; i < SNOW_N; i++) {
      const b = i * 3;
      let y = this.snowBase[b + 1]! - (1.6 + (i % 5) * 0.25) * dt;
      if (y < 0) y += H;
      this.snowBase[b + 1] = y;
      const sway = Math.sin(t * 1.3 + i) * 0.4;
      const x = wrap(this.snowBase[b]! + (wx + sway) * dt, center.x), z = wrap(this.snowBase[b + 2]! + (wz + Math.cos(t + i) * 0.3) * dt, center.z);
      this.snowBase[b] = x - center.x; this.snowBase[b + 2] = z - center.z;
      const k = i < snowN ? kindAt(x, z) : 'clear';
      const on = k === 'blizzard' || (k === 'snow' && i < snowN * 0.55);
      if (on) { sa[b] = x; sa[b + 1] = center.y - 4 + y; sa[b + 2] = z; } else { sa[b] = 0; sa[b + 1] = -999; sa[b + 2] = 0; }
    }
    sp.needsUpdate = true;
    for (const c of cells) if (c.kind === 'storm') anyStorm = true;
    this.cellDiscs(w);
    this.lightning(dt, anyStorm, center, kindAt);
    const L = this.look;
    L.overcast = smooth(L.overcast, OVERCAST[kind], 0.6, dt);
    L.fogMul = smooth(L.fogMul, FOG_MUL[kind], 0.5, dt);
    const raining = kind === 'rain' || kind === 'storm';
    L.wet = smooth(L.wet, raining ? 1 : 0, raining ? 0.08 : 0.02, dt);
    return L;
  }

  private cellDiscs(w: World): void {
    const cells = w.s.weather.cells;
    while (this.discs.length < cells.length) {
      const m = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, map: flake() }));
      m.renderOrder = 4;
      this.discs.push(m);
      this.group.add(m);
    }
    this.discs.forEach((m, i) => {
      const c = cells[i];
      m.visible = !!c;
      if (!c) return;
      const warm = c.tempOffset > 0 && c.kind === 'clear';
      const left = Math.min(1, (c.untilTick - w.s.tick) / CFG.god.hourTicks); // fade over the last hour
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(warm ? '#ffd27a' : c.kind === 'snow' || c.kind === 'blizzard' ? '#e6ecf2' : '#6f7884');
      mat.blending = warm ? THREE.AdditiveBlending : THREE.NormalBlending;
      mat.opacity = (warm ? 0.3 : 0.5) * left;
      m.position.set(c.pos.x, heightAt(w.s, c.pos) * CFG.world.heightScale + (warm ? 0.12 : 18), c.pos.y);
      m.scale.setScalar(c.radius);
    });
  }

  /** A bolt and a flash at a world point (the god's Lightning Bolt). */
  strike(at: THREE.Vector3): void {
    const pts: THREE.Vector3[] = [];
    let px = at.x + (Math.random() - 0.5) * 6, pz = at.z + (Math.random() - 0.5) * 6;
    for (let i = 0, n = 10; i <= n; i++) {
      const f = i / n;
      pts.push(new THREE.Vector3(px + (at.x - px) * f, at.y + 40 * (1 - f), pz + (at.z - pz) * f));
      px += (Math.random() - 0.5) * 1.6 * (1 - f); pz += (Math.random() - 0.5) * 1.6 * (1 - f);
    }
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.bolt.visible = !this.reduced;
    this.boltLife = 0.25;
    this.look.flash = this.reduced ? 0.4 : 1;
  }

  /** A flash without a bolt (meteor impact). */
  flash(k: number): void {
    this.look.flash = Math.max(this.look.flash, this.reduced ? k * 0.4 : k);
  }

  private lightning(dt: number, storm: boolean, c: THREE.Vector3, kindAt: (x: number, z: number) => WeatherKind): void {
    const L = this.look;
    L.flash = Math.max(0, L.flash - dt * 3);
    if (this.boltLife > 0 && (this.boltLife -= dt) <= 0) this.bolt.visible = false;
    if (!storm) return;
    if ((this.nextBolt -= dt) > 0) return;
    this.nextBolt = 4 + Math.random() * (this.reduced ? 16 : 9);
    for (let tries = 0; tries < 6; tries++) {
      const x = c.x + (Math.random() * 2 - 1) * R * 0.8, z = c.z + (Math.random() * 2 - 1) * R * 0.8;
      if (kindAt(x, z) !== 'storm') continue;
      const pts: THREE.Vector3[] = [];
      let px = x, pz = z;
      for (let i = 0, n = 9; i <= n; i++) {
        pts.push(new THREE.Vector3(px, c.y + 38 - (i / n) * 40, pz));
        px += (Math.random() - 0.5) * 2.2; pz += (Math.random() - 0.5) * 2.2;
      }
      this.bolt.geometry.dispose();
      this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      this.bolt.visible = !this.reduced;
      this.boltLife = 0.18;
      L.flash = this.reduced ? 0.4 : 1;
      return;
    }
  }
}

/** Keep a particle inside the box around the camera target (x relative to the box center). */
function wrap(rel: number, center: number): number {
  let r = rel;
  if (r > R) r -= 2 * R;
  else if (r < -R) r += 2 * R;
  return center + r;
}

/** Soft round flake sprite (points are square otherwise). */
function flake(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  if (!x) return null;
  const g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(c);
}
