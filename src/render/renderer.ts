import * as THREE from 'three';
import type { World } from '../sim/world';
import type { ID } from '../shared/types';
import { TerrainMesh, makeWater } from './terrainMesh';
import { SkyLights } from './sky';
import { Props } from './props';
import { MushroomViews } from './mushroomView';
import { WeatherFx } from './weatherFx';
import { WrathFx } from './wrathFx';
import { MiracleFx } from './miracleFx';
import { FireFx } from './fireView';
import { WildfireFx } from './wildfireView';
import { EnemyViews } from './enemyView';
import { WildlifeViews } from './wildlifeView';
import { GraveViews } from './graveView';
import { EggViews } from './eggView';
import { GoblinViews } from './goblinView';
import { Emotes } from './emotes';
import type { TerrainLens } from './terrainMesh';
import type { SimEvent } from '../shared/types';
import { Interp } from './interpolation';
import { OrbitCam } from './camera';
import { GodHand } from './godHand';
import { pick, type Pick } from './picking';
import { Rings } from './decals';
import { seasonLook } from './seasons';
import { BuildingViews } from './buildingView';
import { airAt } from '../sim/temperature';
import { dangerAt } from '../sim/danger';
import { heightAt } from '../sim/grid';
import { CFG } from '../sim/config';
import { waterOffset } from '../sim/climate';

export interface RenderSettings { shadows: 'off' | 'low' | 'high'; renderScale: number; outlines: boolean; fog: boolean }

/** Read-only view of the sim (§3.1). Owns the Three.js scene; never mutates world state. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: OrbitCam;
  readonly hand = new GodHand();
  readonly rings = new Rings();
  readonly emotes = new Emotes();
  private moodCheck = 0;
  private terrainSeen = -1;
  private terrainTimer = 0;
  terrain!: TerrainMesh;
  props!: Props;
  goblins!: GoblinViews;
  buildings!: BuildingViews;
  mushrooms!: MushroomViews;
  fires!: FireFx;
  wildfire!: WildfireFx;
  enemies!: EnemyViews;
  wildlife!: WildlifeViews;
  graves!: GraveViews;
  eggs!: EggViews;
  wrathFx!: WrathFx;
  miracleFx!: MiracleFx;
  readonly weatherFx = new WeatherFx();
  interp!: Interp;
  sky: SkyLights;
  private water!: ReturnType<typeof makeWater>;
  private worldGroup = new THREE.Group();
  private time = 0;
  world!: World;

  constructor(private canvas: HTMLCanvasElement, w: World, public settings: RenderSettings) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.gl.shadowMap.enabled = settings.shadows !== 'off';
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new OrbitCam(1, () => this.world.s);
    this.sky = new SkyLights(settings.shadows !== 'off');
    this.scene.add(this.sky.group, this.sky.hemi, this.sky.sun, this.sky.sun.target, this.worldGroup);
    this.scene.fog = new THREE.Fog('#cfe6f2', 60, 220);
    this.hand.attach(this.scene);
    this.scene.add(this.rings.group, this.emotes.group);
    this.setWorld(w);
    this.resize();
  }

  /** Swap to another world (new game, load, replay). */
  setWorld(w: World): void {
    if (this.terrain) {
      this.worldGroup.clear();
      this.terrain.dispose();
    }
    this.world = w;
    this.terrain = new TerrainMesh(w.s);
    this.terrain.tempAt = (x, y) => airAt(w, { x, y });
    this.terrain.dangerAt = (x, y) => dangerAt(w, { x, y });
    this.water = makeWater(w.s);
    this.props = new Props(w);
    this.goblins = new GoblinViews(w);
    this.buildings = new BuildingViews(w);
    this.mushrooms = new MushroomViews(w);
    this.fires = new FireFx(w);
    this.wildfire = new WildfireFx(w);
    this.enemies = new EnemyViews(w);
    this.wildlife = new WildlifeViews(w);
    this.graves = new GraveViews(w, (id) => this.goblinWorldPos(id));
    this.eggs = new EggViews(w);
    this.wrathFx = new WrathFx(w, this.weatherFx, (id) => this.goblinWorldPos(id));
    this.wrathFx.reduced = this.weatherFx.reduced;
    this.miracleFx = new MiracleFx(w, this.camera, this.water.mesh.material as THREE.Material);
    this.miracleFx.reduced = this.weatherFx.reduced;
    this.goblins.outlines = this.settings.outlines;
    this.interp = new Interp(w);
    this.worldGroup.add(this.terrain.group, this.water.mesh, this.props.group, this.buildings.group, this.mushrooms.group, this.goblins.group, this.weatherFx.group, this.fires.group, this.wildfire.group, this.enemies.group, this.wildlife.group, this.graves.group, this.eggs.group, this.wrathFx.group, this.miracleFx.group);
    const c = w.s.village.center;
    this.camera.setTarget(c.x, c.y, true);
  }

  applySettings(s: RenderSettings): void {
    const outlinesChanged = s.outlines !== this.settings.outlines;
    this.settings = s;
    this.gl.shadowMap.enabled = s.shadows !== 'off';
    this.sky.sun.castShadow = s.shadows !== 'off';
    const size = s.shadows === 'high' ? 2048 : 1024;
    if (this.sky.sun.shadow.mapSize.x !== size) {
      this.sky.sun.shadow.mapSize.set(size, size);
      this.sky.sun.shadow.map?.dispose();
      this.sky.sun.shadow.map = null;
    }
    if (outlinesChanged) {
      this.goblins.outlines = s.outlines;
      for (const id of [...this.goblins.views.keys()]) this.goblins.views.delete(id);
      this.goblins.group.clear();
    }
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio) * this.settings.renderScale);
    this.gl.setSize(w, h, false);
    this.camera.cam.aspect = w / h;
    this.camera.cam.updateProjectionMatrix();
  }

  /** Called once per sim tick so interpolation has prev/cur snapshots. */
  onTick(): void {
    this.interp.capture();
  }

  goblinWorldPos(id: ID, alpha = 1): THREE.Vector3 | null {
    const p = this.interp.get(id, alpha);
    return p ? new THREE.Vector3(p.x, p.z + 0.35, p.y) : null;
  }

  pickAt(x: number, y: number): Pick {
    const r = this.canvas.getBoundingClientRect();
    return pick(this.world, this.camera.cam, x - r.left, y - r.top, r.width, r.height, [...this.terrain.chunks.values()],
      (id) => this.goblinWorldPos(id), this.props.itemMeshes(), [...this.props.plantIndex.keys()], (m) => this.props.plantIndex.get(m),
      this.buildings.group.children, this.eggs.group.children, this.graves.group.children);
  }

  /** Height of the ground (or the water surface) at a sim position, in world units. */
  terrainY(x: number, y: number): number {
    return Math.max(heightAt(this.world.s, { x, y }), CFG.world.waterLevel) * CFG.world.heightScale;
  }

  /** Screen position of a world point (for the quick ring, tooltips). */
  toScreen(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.camera.cam);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, visible: p.z < 1 };
  }

  frame(dt: number, alpha: number): void {
    this.time += dt;
    const w = this.world;
    const followId = this.camera.followId;
    const fp = followId !== null ? this.interp.get(followId, alpha) : null;
    if (followId !== null && !fp) this.camera.followId = null;
    this.camera.update(dt, fp ? { x: fp.x, z: fp.y } : null);
    const wx = this.weatherFx.update(w, dt, this.camera.target);
    this.sky.update(w.clock, this.camera.target, this.camera.cam.position, wx.overcast, wx.flash);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.sky.fogColor);
    const d = this.camera.dist;
    fog.near = this.settings.fog ? 50 + d * 0.6 : 900;
    fog.far = this.settings.fog ? 180 + d * 1.5 : 1000;
    // weather fog/blizzard/rain thickens the air regardless of the distance-fog setting (it is gameplay vision)
    if (wx.fogMul < 0.99) { fog.near = Math.min(fog.near, (20 + d * 0.5) * wx.fogMul); fog.far = Math.min(fog.far, (60 + d * 1.6) * wx.fogMul + 8); }
    this.terrain.setWet(wx.wet);
    this.terrain.setTempSig(`${Math.round(w.s.weather.temperature)}:${w.s.weather.cells.map((c) => c.id).join(',')}`);
    if (this.terrain.lens === 'danger') {
      const m = w.s.threat.marks;
      this.terrain.setDangerSig(`${m.length}:${m[m.length - 1]?.tick ?? 0}:${Math.floor(w.s.tick / CFG.god.hourTicks)}:` +
        w.s.enemies.map((e) => `${Math.floor(e.pos.x / 3)},${Math.floor(e.pos.y / 3)}`).join(';'));
    }
    this.water.update(this.time);
    this.terrainTimer -= dt;
    if (w.s.terrainVersion !== this.terrainSeen || this.terrainTimer <= 0) {
      const shaped = w.s.terrainVersion !== this.terrainSeen;
      this.terrainSeen = w.s.terrainVersion;
      this.terrainTimer = 2;
      this.terrain.refresh();
      if (shaped) {
        this.props.buildStatic();
        this.buildings.reseat();
        this.mushrooms.update(this.sky.night, true);
      }
    }
    const season = seasonLook(w.clock);
    this.terrain.setPalette(season.look.biomes, season.sig);
    let blight = 0; // P6.3: blighted bushes brown as it worsens
    for (const p of w.s.plants) blight += p.blight;
    this.props.setLook(season.look, `${season.sig}:${blight.toFixed(2)}`);
    // P6.3: floodwater rises over the lowlands, a drought draws the shallows back
    const wo = waterOffset(w), wy = wo * CFG.world.heightScale + Math.sign(wo) * 0.08; // a little over, to cover the drowned banks
    this.water.mesh.position.y += (wy - this.water.mesh.position.y) * Math.min(1, dt * 0.5);
    this.props.update(this.interp, alpha);
    this.buildings.update();
    this.buildings.lights(this.sky.night);
    this.mushrooms.update(this.sky.night);
    this.fires.update(this.time, this.sky.night, this.camera.target);
    this.wildfire.update(this.time, this.sky.night, this.camera.target);
    this.goblins.update(this.interp, alpha, this.time, this.sky.night, dt);
    this.enemies.update(this.interp, alpha, this.time, dt);
    this.wildlife.update(this.interp, alpha, this.time, dt);
    this.graves.update();
    this.eggs.update(dt, this.wrathFx.reduced);
    this.wrathFx.update(dt, alpha);
    this.miracleFx.update(dt, this.time);
    this.ambientEmotes(dt);
    this.emotes.update(dt, (id) => this.goblins.headPos(id), this.camera.dist);
    this.gl.render(this.scene, this.camera.cam);
  }

  setTerrainLens(l: TerrainLens | null): void {
    this.terrain.setLens(l);
  }

  /** Event-driven emotes (§P2.6); the renderer only reads events, it never changes the sim. */
  onEvents(evs: SimEvent[]): void {
    this.wrathFx.onEvents(evs);
    this.miracleFx.onEvents(evs);
    for (const e of evs) {
      if (e.type === 'emote') this.emotes.show(e.goblinId, e.emote);
      else if (e.type === 'chat_line') this.emotes.showTopic(e.goblinId, e.topic);
      else if (e.type === 'egg_hatched') this.emotes.show(e.goblinId, 'exclaim');
      else if (e.type === 'divine_act' && e.act === 'pet' && e.targetId !== undefined) this.emotes.show(e.targetId, 'heart');
    }
  }

  /** State-derived emotes, checked every few seconds: sweat when starving/parched, a tune when happy. */
  private ambientEmotes(dt: number): void {
    this.moodCheck -= dt;
    if (this.moodCheck > 0) return;
    this.moodCheck = 3;
    for (const g of this.world.s.goblins) {
      if (g.needs.hunger < 15 || g.needs.thirst < 15) this.emotes.show(g.id, 'sweat');
      else if (g.mood.value > 60 && (g.activity.action === 'wander' || g.activity.action === 'idle') && Math.random() < 0.15) this.emotes.show(g.id, 'music');
    }
  }

  get elapsed(): number {
    return this.time;
  }
}
