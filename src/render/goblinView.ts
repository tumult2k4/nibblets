import * as THREE from 'three';
import { CFG } from '../sim/config';
import type { World } from '../sim/world';
import type { Goblin } from '../sim/state';
import { ageDays, isSleeping } from '../sim/goblin/goblin';
import { express, phenotypeOf, type Phenotype } from '../sim/goblin/genetics/phenotype';
import { buildGoblin, disposeRig, phenoBucket, type GoblinRig } from './goblinMesh';
import { itemGeo } from './meshFactory';
import { heldMesh } from './toolMeshes';
import { flicker } from './fireView';
import { toolFor } from '../sim/tools';
import { isGear } from '../sim/items';
import { wearGeo } from './fiberMeshes';
import { flatMat } from './lowpoly';
import type { Interp } from './interpolation';

interface View {
  rig: GoblinRig; pheno: Phenotype; prop: THREE.Mesh | null; propType: string; held: THREE.Object3D | null; heldKey: string; blinkAt: number; walkPhase: number; zzz: THREE.Sprite | null;
  /** worn clothes and gear on the back (P5.6) */
  wear: THREE.Mesh[]; wearKey: string;
}

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
  /** genetics lens (P5.9): exaggerate adult size differences by this much (0 = true size) */
  sizeBoost = 0;

  constructor(private w: World) {}

  private rebuild(g: Goblin, pheno: Phenotype, old?: View): View {
    if (old) {
      this.group.remove(old.rig.root);
      disposeRig(old.rig);
    }
    const rig = buildGoblin(pheno, g.id * 31 + 7, this.outlines);
    rig.root.userData = { kind: 'goblin', id: g.id };
    this.group.add(rig.root);
    return { rig, pheno, prop: null, propType: '', held: null, heldKey: '', blinkAt: 0, walkPhase: g.id, zzz: null, wear: [], wearKey: '' };
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
    const scale = v.pheno.scale * (this.sizeBoost ? Math.max(0.3, 1 + this.sizeBoost * (express(g.genome, 'adultSize') - 1)) : 1);
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
      if (act === 'flee' || act === 'scatter') { r.armL.rotation.x = -2.6 + Math.sin(ph * 1.5) * 0.4; r.armR.rotation.x = -2.6 - Math.sin(ph * 1.5) * 0.4; earFlop = 0.6; } // flailing panic, ears flat
      if (act === 'attack' || act === 'defend_village') { r.armR.rotation.x = -1.5; r.body.rotation.x += 0.2; } // charging, weapon levelled
      if (act === 'follow_wisp') { r.armL.rotation.x = r.armR.rotation.x = -1.4; r.head.rotation.x = -0.25; earFlop = 0.1; } // sleepwalking after the light
      if (act === 'play') { r.armL.rotation.x = -2.4 + Math.sin(ph) * 0.5; r.armR.rotation.x = -2.4 - Math.sin(ph) * 0.5; earFlop = 0.45; } // whee
    } else if (act === 'follow_wisp') {
      // spellbound: reaching for the light, swaying
      r.armL.rotation.x = r.armR.rotation.x = -1.5 + Math.sin(t * 1.3 + g.id) * 0.1;
      r.head.rotation.x = -0.3;
      r.body.rotation.z = Math.sin(t * 1.1 + g.id) * 0.06;
    } else if (act === 'attack' || act === 'defend_village') {
      // wind up, thrust, recover (driven by the sim's swing timer)
      const p = g.activity.progress, C = CFG.combat;
      const struck = p > C.cooldownTicks, drawing = p <= C.windupTicks;
      r.armR.rotation.x = struck ? -1.55 : drawing ? -2.5 : -1.9;
      r.armL.rotation.x = struck ? -1.0 : -0.6;
      r.body.rotation.x += struck ? 0.32 : drawing ? -0.12 : 0.05;
      r.legL.rotation.x = struck ? -0.5 : 0; r.legR.rotation.x = struck ? 0.4 : 0;
      earFlop = struck ? -0.35 : 0.1;
    } else if (act === 'guard') {
      // standing watch: weapon up, slowly scanning the dark
      r.armR.rotation.x = -2.2;
      r.head.rotation.y = Math.sin(t * 0.7 + g.id) * 0.7;
      earFlop = -0.15 + Math.max(0, Math.sin(t * 1.9 + g.id)) ** 16 * 0.3;
    } else if (act === 'flee') {
      // hiding: crouched small and trembling
      r.body.scale.set(1.04, 0.88, 1.04);
      r.body.position.x = Math.sin(t * 50 + g.id) * 0.01;
      r.armL.rotation.x = r.armR.rotation.x = -1.1;
      earFlop = 0.7;
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
    } else if (act === 'cut_grass' || (act === 'process' && g.activity.stage === 2)) {
      // P5.6: sawing at the grass / working the grinding stone or rack, bent over, both hands
      const k = Math.sin(t * 8 + g.id);
      r.armR.rotation.x = r.armL.rotation.x = -0.9 + k * 0.35; r.armR.rotation.z = -0.2 + k * 0.25; r.body.rotation.x = 0.45;
    } else if (act === 'harvest_fruit' || act === 'pick_up' || act === 'drink' || act === 'eat' || act === 'forage' || act === 'pick_flowers') {
      const k = t * 9 + g.id;
      if (act === 'drink') { r.body.rotation.x = 0.6; r.head.rotation.x = 0.4; }
      else if (act === 'eat') { r.armR.rotation.x = -1.6 + Math.sin(k) * 0.3; r.head.rotation.x = Math.sin(k) * 0.08; }
      else { r.armR.rotation.x = -1.2 + Math.sin(k) * 0.6; r.armL.rotation.x = -0.9 - Math.sin(k) * 0.4; const sq = 1 + Math.sin(k) * 0.04; r.body.scale.set(1 / sq, sq, 1 / sq); }
    } else if (act === 'chat') {
      // talking with the hands, then listening with a tilted head and the odd nod (P5.1)
      const k = t * 5 + g.id;
      const talking = Math.sin(t * (Math.PI / 2.5) + (g.activity.stage === 2 ? Math.PI : 0)) > 0;
      if (talking) { r.armR.rotation.x = -1.3 + Math.sin(k) * 0.5; r.armL.rotation.x = -0.5 - Math.sin(k * 0.7) * 0.3; r.head.rotation.x = Math.sin(k * 1.4) * 0.06; }
      else { r.head.rotation.z = 0.18; r.head.rotation.x = Math.max(0, Math.sin(t * 2.2 + g.id)) ** 6 * 0.25; earFlop = -0.15; }
    } else if (act === 'court' && g.activity.stage === 1) {
      // a courtship dance: hopping round in a little circle, arms up
      const k = t * 6 + g.id;
      r.body.position.y = 0.12 + Math.abs(Math.sin(k)) * 0.09;
      r.body.rotation.y = Math.sin(t * 2.2 + g.id) * 0.9;
      r.armL.rotation.x = r.armR.rotation.x = -2.5 + Math.sin(k) * 0.3;
      r.legL.rotation.x = Math.sin(k) * 0.5; r.legR.rotation.x = -Math.sin(k) * 0.5;
      earFlop = -0.3 + Math.sin(k) * 0.2;
    } else if ((act === 'incubate_egg' || act === 'lay_egg') && g.activity.stage === 1) {
      // nesting: squatting low over the egg, fluffed up and content
      r.body.position.y = 0.05;
      r.body.scale.set(1.08, 0.86, 1.08);
      r.legL.rotation.x = r.legR.rotation.x = -1.2;
      r.armL.rotation.z = -0.6; r.armR.rotation.z = 0.6;
      r.head.rotation.z = Math.sin(t * 0.8 + g.id) * 0.1;
      earFlop = 0.2;
    } else if (act === 'play' || act === 'learn' || act === 'teach') {
      // P5.4/5.5: counting to three with hands over the eyes, crouched behind a bush, showing how it's done, or sitting
      // and watching (a lesson, or an adult at work)
      const st = g.activity.stage;
      if (act === 'teach' && st === 1) { const k = t * 4 + g.id; r.armL.rotation.x = -1.1 + Math.sin(k) * 0.4; r.armR.rotation.x = -1.1 - Math.sin(k) * 0.4; r.armL.rotation.z = 0.3; r.armR.rotation.z = -0.3; r.body.rotation.x += 0.12; }
      else if (act === 'teach' && st === 0) { r.head.rotation.z = 0.1; }
      else if (act === 'play' && st === 1) { r.armL.rotation.x = r.armR.rotation.x = -2.0; r.armL.rotation.z = 0.35; r.armR.rotation.z = -0.35; r.head.rotation.x = 0.25; }
      else if (act === 'play') { r.body.scale.set(1.06, 0.82, 1.06); r.body.position.y = 0.06; r.head.rotation.y = Math.sin(t * 1.6 + g.id) * 0.6; earFlop = -0.2; }
      else { r.body.position.y = 0.05; r.legL.rotation.x = r.legR.rotation.x = -1.3; r.head.rotation.z = 0.12 + Math.sin(t * 0.9 + g.id) * 0.08; r.armL.rotation.x = r.armR.rotation.x = -0.6; earFlop = -0.25; }
    } else if (act === 'comfort' && g.activity.stage === 1) {
      // a hug: arms wrapped forward, leaning in, swaying a little
      r.armL.rotation.x = r.armR.rotation.x = -1.35;
      r.armL.rotation.z = 0.55; r.armR.rotation.z = -0.55;
      r.body.rotation.x += 0.18;
      r.body.rotation.z = Math.sin(t * 2 + g.id) * 0.06;
      earFlop = 0.3;
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
    const carried = g.inventory.find((s) => !isGear(s.type))?.type ?? '';
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
    this.updateWear(g, v);
    const fl = v.held?.getObjectByName('flame');
    if (fl) flicker(fl, t, g.id, 0.32);
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

  /** Clothes on the body and head, a basket or rolled mat on the back. */
  private updateWear(g: Goblin, v: View): void {
    const back = (['basket', 'sleeping_mat'] as const).filter((t) => g.inventory.some((s) => s.type === t));
    const key = [g.equipped.body?.type, g.equipped.head?.type, ...back].join(',');
    if (key === v.wearKey) return;
    v.wearKey = key;
    for (const m of v.wear) m.removeFromParent();
    v.wear = [];
    const hr = (v.pheno.headRatio * 0.8) / 2;
    const put = (t: Parameters<typeof wearGeo>[0] | undefined, parent: THREE.Object3D): void => {
      const geo = t && wearGeo(t, hr);
      if (!geo) return;
      const m = new THREE.Mesh(geo, flatMat);
      m.castShadow = true;
      parent.add(m);
      v.wear.push(m);
    };
    put(g.equipped.body?.type, v.rig.body);
    put(g.equipped.head?.type, v.rig.head);
    for (const t of back) put(t, v.rig.body);
  }

  rigOf(id: number): GoblinRig | undefined {
    return this.views.get(id)?.rig;
  }
}
