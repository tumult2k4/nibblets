import * as THREE from 'three';
import type { App } from './app';
import type { Goblin } from '../sim/state';
import { CFG } from '../sim/config';
import type { HandPose } from '../render/godHand';
import { express } from '../sim/goblin/genetics/phenotype';
import type { TerraformPower } from '../sim/god/terraform';
import { TERRAIN_LENSES } from './store';
import type { TerrainLens } from '../render/terrainMesh';
import { castPreview, castRadius, powerDef } from '../sim/god/cast';
import { fertilePair } from '../sim/god/powers/gifts';
import { CATEGORY_COLOR } from './tools/castTool';
import { t as tr } from './i18n';
import type { ID } from '../shared/types';
import { spawnName } from './components/sandbox/spawnTab';

const lerpColor = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const BAD = new THREE.Color('#e0503c');
const MID = new THREE.Color('#f2c14e');
const GOOD = new THREE.Color('#6cc46a');
const scale3 = (t: number) => (t < 0.5 ? lerpColor(BAD, MID, t * 2) : lerpColor(MID, GOOD, (t - 0.5) * 2));

const BRUSH_COLOR: Record<TerraformPower, string> = {
  raise_land: '#c9e07a', lower_land: '#c99a6b', smooth: '#e8e2c8', create_water: '#7fc6ea', fertile_soil: '#e9c35b', plant_forest: '#7ccf6a', place_rock: '#bdb7ad',
};

/** Per-goblin lens color (§18.10), or null for the default lens. */
function lensColor(lens: string, g: Goblin): THREE.Color | null {
  switch (lens) {
    case 'needs': {
      const n = g.needs;
      return scale3(Math.min(n.hunger, n.thirst, n.energy) / 100);
    }
    case 'faith':
      return lerpColor(new THREE.Color('#5b6a8a'), new THREE.Color('#ffe27a'), g.godView.faith / 100);
    case 'mood':
      return scale3((g.mood.value + 100) / 200);
    case 'genetics': {
      const h = express(g.genome, 'skinHue');
      return new THREE.Color().setHSL((((h % 360) + 360) % 360) / 360, 0.6, 0.55);
    }
    default:
      return null;
  }
}

/**
 * Per-frame world-space feedback driven by UI state: god hand pose/position/glow, OS cursor,
 * selection + hover rings, lens rings, gift-drop preview (§17.3, §18.4, §23.4). Read-only on the sim.
 */
export class WorldFx {
  private t = 0;
  private label = document.createElement('div');
  private labelText = '';
  /** red skull markers over goblins a lethal cast would kill (§18.4 step 3) */
  private skulls: HTMLDivElement[] = [];

  constructor(private app: App) {
    this.label.className = 'castlabel hidden';
    document.body.append(this.label);
  }

  private skullsOver(ids: ID[]): void {
    const r = this.app.game.renderer;
    while (this.skulls.length < ids.length) {
      const d = document.createElement('div');
      d.className = 'skullmark';
      d.textContent = '☠';
      document.body.append(d);
      this.skulls.push(d);
    }
    this.skulls.forEach((d, i) => {
      const p = i < ids.length ? r.goblinWorldPos(ids[i]!) : null;
      const sc = p ? r.toScreen(p.setY(p.y + 0.9)) : null;
      d.classList.toggle('hidden', !sc?.visible);
      if (sc?.visible) d.style.transform = `translate(${Math.round(sc.x - 9)}px, ${Math.round(sc.y - 22)}px)`;
    });
  }

  /** §18.4 step 2: "Rain · Free · 3 goblins, 12 plants" next to the cursor. */
  private castLabel(text: string, at: THREE.Vector3 | null): void {
    const show = !!text && !!at;
    this.label.classList.toggle('hidden', !show);
    if (!show) return;
    if (text !== this.labelText) this.label.textContent = this.labelText = text;
    const p = this.app.game.renderer.toScreen(at!);
    this.label.style.transform = `translate(${Math.round(p.x + 22)}px, ${Math.round(p.y - 34)}px)`;
  }

  frame(dt: number): void {
    this.t += dt;
    const { game, store, input } = this.app;
    const r = game.renderer;
    const st = store.state;
    const w = game.world;
    const inGame = st.screen !== 'title' && !st.overlay;
    const hand = input.hand;
    const tray = input.tray;

    // ---- hand ----
    const brushing = input.brushing();
    const spawning = input.spawning();
    const casting = !spawning && input.casting();
    const def = casting ? powerDef(st.armed!) : undefined;
    const catColor = new THREE.Color(def ? CATEGORY_COLOR[def.category] ?? '#ffffff' : '#ffffff');
    let pose: HandPose = 'open';
    if (casting || spawning) pose = 'cast';
    else if (brushing) pose = 'paint';
    else if (tray.active) pose = 'cast';
    else if (hand.holding) pose = 'grab';
    else if (hand.petting) pose = 'pet';
    else if (hand.hoverGoblin !== null) pose = 'point';
    r.hand.pose = pose;
    const glowK = tray.active ? 0.35 + Math.sin(this.t * 6) * 0.1 : hand.petting ? 0.2 : 0;
    r.hand.glow.setRGB(glowK, glowK * 0.8, glowK * 0.3);
    if (casting) r.hand.glow.copy(catColor).multiplyScalar(0.35 + Math.sin(this.t * 5) * 0.1); // §18.4 step 2: glow in the category color
    r.hand.size = Math.max(0.9, Math.min(3, r.camera.dist * 0.055));
    const ground = spawning ? input.spawn.ground : casting ? input.cast.ground : brushing ? input.brush.ground : tray.active ? tray.ground : hand.ground;
    const showHand = inGame && !this.app.replayMode && w.s.god.mode !== 'observer';
    const height = hand.holding ? hand.holdHeight : 1.2;
    r.hand.update(dt, showHand ? ground : null, height, r.camera.yaw, this.t, hand.holding);
    const canvas = r.gl.domElement;
    const cursor = showHand && ground ? 'none' : '';
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;

    // ---- rings ----
    r.rings.begin();
    if (inGame || st.screen !== 'title') {
      const sel = new Set(st.selectedKind === 'goblin' ? st.selection : []);
      const pulse = 1 + Math.sin(this.t * 4) * 0.06;
      for (const g of w.s.goblins) {
        const p = r.goblinWorldPos(g.id);
        if (!p) continue;
        const gy = p.y - 0.35;
        if (sel.has(g.id)) r.rings.ring(p.x, gy, p.z, 0.75 * pulse, '#fff4c2', 0.95);
        else if (hand.hoverGoblin === g.id) r.rings.ring(p.x, gy, p.z, 0.7, '#ffffff', 0.55);
        const lc = lensColor(st.lens, g);
        if (lc) r.rings.ring(p.x, gy, p.z, 0.55, lc, 0.85);
      }
      // gift drop preview: landing ring + who would witness it
      if (tray.active && tray.ground) {
        const gp = tray.ground;
        r.rings.ring(gp.x, gp.y, gp.z, 0.6 * pulse, '#ffd36b', 0.9);
        r.rings.ring(gp.x, gp.y, gp.z, CFG.goblin.visionDay, '#ffd36b', 0.18);
      }
      // armed power: radius ring, affected goblins outlined in the category color (§18.4 steps 2–3)
      let label = '';
      let doomed: ID[] = [];
      if (casting && def && input.cast.ground) {
        const cg = input.cast.ground;
        const free = w.s.god.mode !== 'divine';
        label = `${tr(`power.${def.id}`)} · ${free ? tr('power.free') : tr('power.cost', { n: def.cost })}`;
        if (def.target === 'direction') {
          const from = input.cast.dragFrom ?? cg;
          const len = Math.hypot(cg.x - from.x, cg.z - from.z);
          for (let k = 0; k <= len; k += 0.8) {
            const f = len ? k / len : 0;
            r.rings.ring(from.x + (cg.x - from.x) * f, from.y + (cg.y - from.y) * f, from.z + (cg.z - from.z) * f, 0.3 + f * 0.25, catColor, 0.8);
          }
          r.rings.ring(cg.x, cg.y, cg.z, CFG.powers.gustWidth, catColor, 0.5);
          if (!input.cast.dragFrom) label += ` · ${tr('cast.drag')}`;
        } else if (def.target === 'goblin' || def.target === 'pair') {
          // Curse, Blessing…: the goblin under the cursor is the target; Fertility rings its mate too
          const hg = input.cast.hoverGoblin !== null ? w.goblin(input.cast.hoverGoblin) : undefined;
          const pair = def.target === 'pair' ? fertilePair(hg, w) : null;
          for (const o of pair ?? (hg ? [hg] : [])) {
            const p = r.goblinWorldPos(o.id);
            if (p) r.rings.ring(p.x, p.y - 0.35, p.z, 0.8 * pulse, catColor, 0.95);
          }
          if (def.target === 'pair') label += ` · ${pair ? `${pair[0].name} & ${pair[1].name}` : hg ? `${hg.name}: ${tr('reason.no_mate')}` : tr('cast.pickPair')}`;
          else label += ` · ${hg ? hg.name : tr('cast.pickGoblin')}`;
        } else {
          const pend = input.cast.pending;
          const rad = castRadius(def, pend?.radius ?? st.castRadius);
          const at = pend ? { x: pend.pos.x, y: pend.pos.y } : { x: cg.x, y: cg.z };
          const ay = pend ? r.terrainY(at.x, at.y) : cg.y;
          if (rad) r.rings.ring(at.x, ay, at.y, rad, catColor, 0.85 * pulse);
          r.rings.ring(at.x, ay, at.y, 0.35, catColor, 0.9);
          if (def.id.startsWith('summon_')) {
            // no summoning inside the village (§17.5.4): show where that is
            const c = w.s.village.center;
            r.rings.ring(c.x, r.terrainY(c.x, c.y), c.y, CFG.combat.villageRadius, '#e0503c', 0.35);
          }
          const pv = castPreview(w, def.id, at, rad);
          const lethal = new Set(pv.lethal);
          for (const id of pv.goblins) {
            const p = r.goblinWorldPos(id);
            if (!p) continue;
            r.rings.ring(p.x, p.y - 0.35, p.z, 0.6, lethal.has(id) ? '#e0503c' : catColor, 0.9);
            if (lethal.has(id)) r.rings.ring(p.x, p.y - 0.35, p.z, 0.75 * pulse, '#e0503c', 0.7);
          }
          doomed = pv.lethal;
          if (rad) label += ` · ${tr('cast.affects', { g: pv.goblins.length, p: pv.plants })}`;
          if (pv.enemies) label += ` · ${tr('cast.beasts', { n: pv.enemies })}`;
          if (pv.lethal.length) label += ` · ☠ ${pv.lethal.length}`;
          if (pend) label = tr('cast.confirm', { n: pend.lethal.length });
        }
      }
      if (spawning && input.spawn.ground) {
        const sg = input.spawn.ground, spec = st.spawn!;
        r.rings.ring(sg.x, sg.y, sg.z, spec.kind === 'building' ? 1.1 : 0.55, '#f4f1e8', 0.9 * pulse);
        label = `${tr('sbx.place')} ${spawnName(spec)} · ${tr('sbx.placeHint')}`;
      }
      this.skullsOver(inGame ? doomed : []);
      this.castLabel(inGame ? label : '', spawning ? input.spawn.ground : input.cast.ground);
      // terraform brush footprint
      if (brushing && input.brush.ground) {
        const bg = input.brush.ground;
        const rad = st.power === 'place_rock' ? 0.8 : st.brushRadius;
        r.rings.ring(bg.x, bg.y, bg.z, rad, BRUSH_COLOR[st.power], input.brush.painting ? 0.95 : 0.65);
      }
      // held entity: landing spot under the hand
      if (hand.holding && hand.ground) {
        const hg = hand.ground;
        const safe = hand.holdHeight <= CFG.god.freeFallHeight;
        r.rings.ring(hg.x, hg.y, hg.z, 0.5, safe ? '#9be38f' : '#ff9a6b', 0.8);
      }
    }
    r.rings.end();
    r.setTerrainLens(TERRAIN_LENSES.includes(st.lens) && st.screen !== 'title' ? (st.lens as TerrainLens) : null);
  }
}
