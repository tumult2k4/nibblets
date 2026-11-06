/**
 * Visitors from the rival clans (P10.2): built from their own genome as grown goblins, so they wear their clan's
 * colors; a trader walks in with a basket on its back, a scout with a spear, an ally's warrior (P10.4) with a spear it
 * thrusts at the Bramblebeast, a suitor with nothing. They walk, stand looking about, and turn to whoever is trading
 * with or greeting them. Picked as `{ kind: 'visitor', id }`.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import { CFG } from '../sim/config';
import { phenotypeOf, type Phenotype } from '../sim/goblin/genetics/phenotype';
import type { Visitor } from '../sim/visitors';
import { buildGoblin, disposeRig, type GoblinRig } from './goblinMesh';
import { heldMesh } from './toolMeshes';
import { wearGeo } from './fiberMeshes';
import { flatMat } from './lowpoly';
import type { Interp } from './interpolation';

const armed = (v: Visitor): boolean => v.kind === 'scout' || v.kind === 'warrior';

interface View { rig: GoblinRig; pheno: Phenotype; walkPhase: number }

export class VisitorViews {
  readonly group = new THREE.Group();
  private views = new Map<number, View>();
  outlines = true;

  constructor(private w: World) {}

  private build(v: Visitor): View {
    const pheno = phenotypeOf({ genome: v.genome, ageDays: 20, stage: 'adult', hunger: 40, scars: 0 });
    const rig = buildGoblin(pheno, v.id * 31 + 7, this.outlines);
    rig.root.userData = { kind: 'visitor', id: v.id };
    if (armed(v)) rig.hand.add(heldMesh('spear', false));
    else if (v.kind !== 'suitor') { // a suitor comes as it is
      const geo = wearGeo('basket', (pheno.headRatio * 0.8) / 2);
      if (geo) { const m = new THREE.Mesh(geo, flatMat); m.castShadow = true; rig.body.add(m); }
    }
    this.group.add(rig.root);
    return { rig, pheno, walkPhase: v.id };
  }

  update(interp: Interp, alpha: number, time: number, night: number, dt: number): void {
    const seen = new Set<number>();
    for (const v of this.w.s.visitors ?? []) {
      seen.add(v.id);
      let view = this.views.get(v.id);
      if (!view) this.views.set(v.id, (view = this.build(v)));
      this.animate(v, view, interp, alpha, time, night, dt);
    }
    for (const [id, view] of this.views) if (!seen.has(id)) {
      this.group.remove(view.rig.root);
      disposeRig(view.rig);
      this.views.delete(id);
    }
  }

  /** World position just above a visitor's head, or null if not shown. */
  headPos(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v) return null;
    const p = v.rig.root.position;
    return new THREE.Vector3(p.x, p.y + 1.15 * v.pheno.scale + 0.25, p.z);
  }

  private animate(v: Visitor, view: View, interp: Interp, alpha: number, t: number, night: number, dt: number): void {
    const r = view.rig, p = interp.get(v.id, alpha);
    if (!p) return;
    r.root.position.set(p.x, p.z, p.y);
    r.root.scale.setScalar(view.pheno.scale);
    r.root.rotation.y = -p.facing + Math.PI / 2;
    r.eyeMat.emissiveIntensity = 0.15 + night * 0.85;
    r.body.rotation.set((view.pheno.stoop * Math.PI) / 180, 0, 0);
    r.body.position.y = 0.12;
    r.head.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, -0.25); r.armR.rotation.set(0, 0, 0.25);
    r.legL.rotation.x = 0; r.legR.rotation.x = 0;
    const speed = Math.hypot(v.velocity.x, v.velocity.y);
    if (v.path.length && speed > 0.01) {
      view.walkPhase += dt * 14 * Math.min(2, speed / 0.15);
      const ph = view.walkPhase;
      r.body.position.y = 0.12 + Math.abs(Math.sin(ph)) * 0.035;
      r.legL.rotation.x = Math.sin(ph) * 0.7; r.legR.rotation.x = -Math.sin(ph) * 0.7;
      r.armL.rotation.x = -Math.sin(ph) * 0.5;
      r.armR.rotation.x = armed(v) ? -0.4 : Math.sin(ph) * 0.5; // the spear held steady
    } else {
      // standing about: looking the village over, now and then a little sway
      r.head.rotation.y = Math.sin(t * 0.6 + v.id) * 0.6;
      r.body.rotation.z = Math.sin(t * 1.3 + v.id) * 0.03;
      if (v.kind === 'warrior' && v.phase !== 'going' && v.targetId !== undefined) { // thrusting at the beast
        const k = Math.max(0, (v.timer ?? 0) / CFG.alliance.helpEvery);
        r.head.rotation.y = 0;
        r.armR.rotation.x = -1.6 + k * 0.9;
        r.body.rotation.x += (1 - k) * 0.25;
      } else if (armed(v)) r.armR.rotation.x = -0.5;
      else if (Math.sin(t * 0.9 + v.id) > 0.7) r.armR.rotation.x = -1.4; // beckoning
    }
  }

  setOutlines(on: boolean): void {
    this.outlines = on;
    for (const view of this.views.values()) { this.group.remove(view.rig.root); disposeRig(view.rig); }
    this.views.clear();
  }
}
