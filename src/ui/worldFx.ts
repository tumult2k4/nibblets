import * as THREE from 'three';
import type { App } from './app';
import type { Goblin } from '../sim/state';
import { CFG } from '../sim/config';
import type { HandPose } from '../render/godHand';
import { express } from '../sim/goblin/genetics/phenotype';

const lerpColor = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const BAD = new THREE.Color('#e0503c');
const MID = new THREE.Color('#f2c14e');
const GOOD = new THREE.Color('#6cc46a');
const scale3 = (t: number) => (t < 0.5 ? lerpColor(BAD, MID, t * 2) : lerpColor(MID, GOOD, (t - 0.5) * 2));

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

  constructor(private app: App) {}

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
    let pose: HandPose = 'open';
    if (tray.active) pose = 'cast';
    else if (hand.holding) pose = 'grab';
    else if (hand.petting) pose = 'pet';
    else if (hand.hoverGoblin !== null) pose = 'point';
    r.hand.pose = pose;
    const glowK = tray.active ? 0.35 + Math.sin(this.t * 6) * 0.1 : hand.petting ? 0.2 : 0;
    r.hand.glow.setRGB(glowK, glowK * 0.8, glowK * 0.3);
    r.hand.size = Math.max(0.9, Math.min(3, r.camera.dist * 0.055));
    const ground = tray.active ? tray.ground : hand.ground;
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
      // held entity: landing spot under the hand
      if (hand.holding && hand.ground) {
        const hg = hand.ground;
        const safe = hand.holdHeight <= CFG.god.freeFallHeight;
        r.rings.ring(hg.x, hg.y, hg.z, 0.5, safe ? '#9be38f' : '#ff9a6b', 0.8);
      }
    }
    r.rings.end();
  }
}
