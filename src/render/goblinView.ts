import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Goblin } from '../sim/state';
import { ageDays, isSleeping } from '../sim/goblin/goblin';
import { phenotypeOf, type Phenotype } from '../sim/goblin/genetics/phenotype';
import { buildGoblin, disposeRig, phenoBucket, type GoblinRig } from './goblinMesh';
import { itemGeo } from './meshFactory';
import { heldMesh } from './toolMeshes';
import { isTool, toolFor } from '../sim/tools';
import { flatMat } from './lowpoly';
import type { Interp } from './interpolation';

interface View { rig: GoblinRig; pheno: Phenotype; prop: THREE.Mesh | null; propType: string; held: THREE.Object3D | null; heldKey: string; blinkAt: number; walkPhase: number; zzz: THREE.Sprite | null }

function zzzTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.font = 'bold 34px Fredoka, sans-serif';
  x.fillStyle = '#f3e9d2';
  x.strokeStyle = '#2e2a24';
  x.lineWidth = 5;
  x.strokeText('z', 14, 44); x.fillText('z', 14, 44);
  x.font = 'bold 22px Fredoka, sans-serif';
  x.strokeText('z', 38, 22); x.fillText('z', 38, 22);
  return new THREE.CanvasTexture(c);
}

/** Procedural goblin views: transform-only animation (§4.5). */
export class GoblinViews {
  readonly group = new THREE.Group();
  readonly views = new Map<number, View>();
  private zzzMat = new THREE.SpriteMaterial({ map: zzzTexture(), transparent: true, depthWrite: false });
  outlines = true;

  constructor(private w: World) {}

  private rebuild(g: Goblin, pheno: Phenotype, old?: View): View {
    if (old) {
      this.group.remove(old.rig.root);
      disposeRig(old.rig);
    }
    const rig = buildGoblin(pheno, g.id * 31 + 7, this.outlines);
    rig.root.userData = { kind: 'goblin', id: g.id };
    this.group.add(rig.root);
    return { rig, pheno, prop: null, propType: '', held: null, heldKey: '', blinkAt: 0, walkPhase: g.id, zzz: null };
  }

  update(interp: Interp, alpha: number, time: number, night: number, dt: number): void {
    const s = this.w.s;
    const seen = new Set<number>();
    for (const g of s.goblins) {
      seen.add(g.id);
      const pheno = phenotypeOf({ genome: g.genome, ageDays: ageDays(g, s.tick), stage: g.lifeStage, hunger: g.needs.hunger, scars: g.health.scars });
      let v = this.views.get(g.id);
      if (!v || phenoBucket(pheno) !== v.rig.bucket) {
        v = this.rebuild(g, pheno, v);
        this.views.set(g.id, v);
      }
      v.pheno = pheno;
      this.animate(g, v, interp, alpha, time, night, dt);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) {
      this.group.remove(v.rig.root);
      disposeRig(v.rig);
      this.views.delete(id);
    }
  }

  /** World position just above a goblin's head (for emotes), or null if not shown. */
  headPos(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v) return null;
    const p = v.rig.root.position;
    return new THREE.Vector3(p.x, p.y + 1.15 * v.pheno.scale + 0.25, p.z);
  }

  private animate(g: Goblin, v: View, interp: Interp, alpha: number, t: number, night: number, dt: number): void {
    const r = v.rig;
    const p = interp.get(g.id, alpha);
    if (!p) return;
    const scale = v.pheno.scale;
    r.root.position.set(p.x, p.z, p.y);
    r.root.scale.setScalar(scale);
    // sim facing is atan2(dy, dx) in the x/y plane; mesh faces +Z
    r.root.rotation.y = -p.facing + Math.PI / 2;
    r.belly.scale.set(v.pheno.belly, 1, v.pheno.belly);
    r.eyeMat.emissiveIntensity = 0.15 + night * 0.85;
    const speed = Math.hypot(g.velocity.x, g.velocity.y);
    const moving = speed > 0.01;
    const sleeping = isSleeping(g);
    const act = g.activity.action;
    const baby = g.lifeStage === 'hatchling' || g.lifeStage === 'youngling';
    // reset pose
    r.body.rotation.set((v.pheno.stoop * Math.PI) / 180, 0, 0);
    r.body.position.y = 0.12;
    r.head.rotation.set(0, 0, 0);
    r.armL.rotation.x = 0; r.armR.rotation.x = 0;
    r.armL.rotation.z = -0.25; r.armR.rotation.z = 0.25;
    r.body.position.x = 0;
    r.legL.rotation.x = 0; r.legR.rotation.x = 0;
    r.body.scale.set(1, 1, 1);
    const earBaseL = r.earL.userData.baseZ as number, earBaseR = r.earR.userData.baseZ as number;
    let earFlop = 0;
    if (g.heldByGod || g.airborne) {
      // dangle and struggle: legs kick, ears flap
      const k = t * 18 + g.id;
      r.legL.rotation.x = Math.sin(k) * 0.9; r.legR.rotation.x = -Math.sin(k) * 0.9;
      r.armL.rotation.x = -2.4 + Math.sin(k * 1.3) * 0.5; r.armR.rotation.x = -2.4 - Math.sin(k * 1.3) * 0.5;
      earFlop = Math.sin(k * 1.7) * 0.6;
      r.body.rotation.z = Math.sin(t * 3 + g.id) * 0.25;
      if (g.godView.fear > 50 && g.lifeStage === 'adult') r.root.position.x += Math.sin(t * 60) * 0.01;
    } else if (sleeping || (act === 'sleep_ground' && g.activity.stage === 0) || (act === 'sleep_home' && g.activity.stage === 1)) {
      r.body.rotation.z = Math.PI / 2 * (sleeping ? 1 : 0.5);
      r.body.position.y = 0.08;
      r.body.scale.set(1, 1 + Math.sin(t * 1.5 + g.id) * 0.04, 1);
      r.legL.rotation.x = 0.4;
      earFlop = 0.3;
    } else if (moving) {
      v.walkPhase += dt * 14 * Math.min(2, speed / 0.15);
      const ph = v.walkPhase;
      r.body.position.y = 0.12 + Math.abs(Math.sin(ph)) * 0.035;
      r.legL.rotation.x = Math.sin(ph) * 0.7; r.legR.rotation.x = -Math.sin(ph) * 0.7;
      r.armL.rotation.x = -Math.sin(ph) * 0.5; r.armR.rotation.x = Math.sin(ph) * 0.5;
      earFlop = Math.sin(ph - 0.8) * 0.25; // secondary motion with phase lag
      if (baby) r.body.rotation.z = Math.sin(ph * 0.5) * 0.12; // babies wobble
      if (act === 'seek_shelter') { r.armL.rotation.x = -2.7; r.armR.rotation.x = -2.7; } // hands over the head, hurrying in
    } else if (act === 'build' || act === 'chop') {
      // hammering / chopping: big overhead swing, lean into it
      const k = t * 7 + g.id;
      const hit = Math.sin(k);
      r.armR.rotation.x = -1.9 + hit * 1.1; r.armL.rotation.x = -1.2 + hit * 0.5;
      r.body.rotation.x = 0.15 + Math.max(0, -hit) * 0.15;
      earFlop = Math.max(0, -hit) * 0.3;
    } else if (act === 'mine') {
      // two-handed pounding at the rock, deep bow on each blow
      const hit = Math.sin(t * 6 + g.id);
      r.armR.rotation.x = r.armL.rotation.x = -2.1 + hit * 1.3;
      r.body.rotation.x = 0.2 + Math.max(0, -hit) * 0.25;
      earFlop = Math.max(0, -hit) * 0.35;
    } else if (act === 'warm_up' || (act === 'seek_shelter' && g.needs.warmth < 40)) {
      // arms hugged tight, shivering when properly cold
      r.armL.rotation.x = -0.9; r.armR.rotation.x = -0.9;
      r.armL.rotation.z = 0.5; r.armR.rotation.z = -0.5;
      if (g.needs.warmth < 35) r.body.position.x = Math.sin(t * 55 + g.id) * 0.008;
      earFlop = 0.25;
    } else if (act === 'harvest_fruit' || act === 'pick_up' || act === 'drink' || act === 'eat' || act === 'forage') {
      const k = t * 9 + g.id;
      if (act === 'drink') { r.body.rotation.x = 0.6; r.head.rotation.x = 0.4; }
      else if (act === 'eat') { r.armR.rotation.x = -1.6 + Math.sin(k) * 0.3; r.head.rotation.x = Math.sin(k) * 0.08; }
      else { r.armR.rotation.x = -1.2 + Math.sin(k) * 0.6; r.armL.rotation.x = -0.9 - Math.sin(k) * 0.4; const sq = 1 + Math.sin(k) * 0.04; r.body.scale.set(1 / sq, sq, 1 / sq); }
    } else if (act === 'look_up') {
      r.head.rotation.x = -0.7;
      earFlop = -0.2;
    } else {
      // idle: look around, ear twitch
      r.head.rotation.y = Math.sin(t * 0.5 + g.id * 1.3) * 0.5;
      earFlop = Math.max(0, Math.sin(t * 2.3 + g.id * 2)) ** 20 * 0.4;
    }
    r.earL.rotation.z = earBaseL - earFlop;
    r.earR.rotation.z = earBaseR + earFlop;
    // blink
    if (t > v.blinkAt) v.blinkAt = t + 3 + ((g.id * 7919) % 300) / 100;
    const blinking = sleeping || v.blinkAt - t < 0.12;
    r.eyeMat.visible = !blinking;
    // carried item in the left hand, weapon/tool in the right (§P4.2)
    const carried = g.inventory.find((s) => !isTool(s.type))?.type ?? '';
    if (carried !== v.propType) {
      if (v.prop) r.handL.remove(v.prop);
      v.prop = null;
      v.propType = carried;
      if (carried) {
        v.prop = new THREE.Mesh(itemGeo(carried), flatMat);
        v.prop.scale.setScalar(0.9);
        r.handL.add(v.prop);
      }
    }
    this.updateHeld(g, v);
    // Zzz sprite
    if (sleeping && !v.zzz) {
      v.zzz = new THREE.Sprite(this.zzzMat);
      v.zzz.scale.set(0.45, 0.45, 1);
      this.group.add(v.zzz);
    } else if (!sleeping && v.zzz) {
      this.group.remove(v.zzz);
      v.zzz = null;
    }
    if (v.zzz) v.zzz.position.set(p.x, p.z + 0.6 * scale + 0.25 + Math.sin(t * 2) * 0.05, p.y);
  }

  /** The right hand shows the tool for the current job (pick while mining, axe while chopping), else the held item. */
  private updateHeld(g: Goblin, v: View): void {
    const act = g.activity.action;
    const job = act === 'mine' ? toolFor(g, 'mine').stack : act === 'chop' ? toolFor(g, 'chop').stack : null;
    const s = job ?? g.equipped.hand;
    const key = s ? `${s.type}${s.fine ? '*' : ''}` : '';
    if (key === v.heldKey) return;
    if (v.held) v.rig.hand.remove(v.held);
    v.held = s ? heldMesh(s.type, !!s.fine) : null;
    v.heldKey = key;
    if (v.held) v.rig.hand.add(v.held);
  }

  rigOf(id: number): GoblinRig | undefined {
    return this.views.get(id)?.rig;
  }
}
