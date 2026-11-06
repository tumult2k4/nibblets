/**
 * A raider from a rival clan (P10.3): a grown goblin of that clan's colors (built from its own genome), a club in
 * hand and war paint on its face, running in at a crouch, swinging at whoever stands in its way, a sack of loot over
 * its shoulder on the way home.
 */
import * as THREE from 'three';
import { CFG } from '../sim/config';
import type { Enemy } from '../sim/state';
import { phenotypeOf } from '../sim/goblin/genetics/phenotype';
import { founderGenome } from '../sim/goblin/genetics/founders';
import { Rng } from '../shared/rng';
import { buildGoblin } from './goblinMesh';
import { heldMesh } from './toolMeshes';
import { adornWearGeo } from './adornMeshes';
import { itemGeo } from './meshFactory';
import { flatMat } from './lowpoly';
import type { KindRig } from './beastView';

export function buildRaider(e: Enemy): KindRig {
  const genome = e.genome ?? founderGenome(new Rng(e.id), 'ember');
  const pheno = phenotypeOf({ genome, ageDays: 20, stage: 'adult', hunger: 30, scars: 1 });
  const r = buildGoblin(pheno, e.id * 31 + 7, true), hr = (pheno.headRatio * 0.8) / 2;
  r.hand.add(heldMesh('club', false));
  const paint = adornWearGeo('war_paint_face', hr);
  if (paint) r.head.add(new THREE.Mesh(paint, flatMat));
  const sack = new THREE.Group();
  sack.position.set(0, 0.55, -0.18);
  r.body.add(sack);
  let carried = '', phase = e.id, hp = e.hp, hurt = 0;
  return {
    root: r.root,
    animate(en: Enemy, t: number, dt: number): void {
      r.root.scale.setScalar(pheno.scale);
      r.eyeMat.emissiveIntensity = 0.6;
      const speed = Math.hypot(en.velocity.x, en.velocity.y) * CFG.tickHz;
      phase += dt * (6 + speed * 4);
      r.body.rotation.set(0.25, 0, 0); // a crouch
      r.body.position.y = 0.12 + (speed > 0.1 ? Math.abs(Math.sin(phase)) * 0.04 : 0);
      r.legL.rotation.x = speed > 0.1 ? Math.sin(phase) * 0.8 : 0; r.legR.rotation.x = -r.legL.rotation.x;
      r.armL.rotation.set(speed > 0.1 ? -Math.sin(phase) * 0.6 : -0.3, 0, -0.25);
      const swing = en.mode === 'attack' && en.timer > CFG.enemies.biteCooldown;
      r.armR.rotation.set(swing ? -2.6 + Math.sin(t * 20) * 0.6 : -0.9, 0, 0.25);
      if (en.hp < hp) hurt = 0.3;
      hp = en.hp;
      hurt = Math.max(0, hurt - dt);
      r.body.position.x = (hurt / 0.3) * Math.sin(t * 70) * 0.04;
      const loot = en.carrying?.type ?? '';
      if (loot !== carried) {
        sack.clear();
        if (loot) sack.add(new THREE.Mesh(itemGeo(en.carrying!.type), flatMat));
        carried = loot;
      }
    },
  };
}
