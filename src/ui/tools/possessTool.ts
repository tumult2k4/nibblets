import type { Ctx } from '../ctx';
import { dist } from '../../shared/math';
import type { PossessAct } from '../../sim/possess';

/**
 * Possess (Sandbox, P11.1): while the player has a goblin, a left click tells it what to do with what was clicked:
 * pick up an item, pick a bush's fruit (or chop a bare one), fight a creature near the spot, or walk there. Each
 * click is a `possessed_act` sandbox op, so a replay does the same.
 */
export class PossessTool {
  constructor(private ctx: Ctx) {}

  /** A goblin is possessed and may be told what to do. */
  active(): boolean {
    const s = this.ctx.game.world.s;
    return s.god.mode === 'sandbox' && !this.ctx.readOnly() && s.god.possessedId != null && !!this.ctx.game.world.goblin(s.god.possessedId);
  }

  click(e: PointerEvent): void {
    const w = this.ctx.game.world, p = this.ctx.game.renderer.pickAt(e.clientX, e.clientY);
    const at = p.ground ? { x: p.ground.x, y: p.ground.z } : null;
    let act: PossessAct = 'walk', targetId: number | undefined;
    const ent = p.entity;
    if (ent?.kind === 'item') { act = 'pick_up'; targetId = ent.id; }
    else if (ent?.kind === 'plant') {
      const pl = w.s.plants.find((x) => x.id === ent.id);
      act = pl && pl.fruit > 0 ? 'harvest_fruit' : 'chop';
      targetId = ent.id;
    } else if (at) {
      const foe = w.s.enemies.filter((x) => dist(x.pos, at) < 1.6).sort((a, b) => dist(a.pos, at) - dist(b.pos, at))[0];
      if (foe) { act = 'attack'; targetId = foe.id; }
    }
    const pos = ent?.kind === 'item' ? w.s.groundItems.find((x) => x.id === ent.id)?.pos : ent?.kind === 'plant' ? w.s.plants.find((x) => x.id === ent.id)?.pos : ent?.kind === 'goblin' ? w.goblin(ent.id)?.pos : at;
    if (!pos) return;
    this.ctx.push({ type: 'sandbox', op: { op: 'possessed_act', act, pos: { x: pos.x, y: pos.y }, ...(targetId !== undefined ? { targetId } : {}) } });
  }

  release(): boolean {
    if (!this.active()) return false;
    this.ctx.push({ type: 'sandbox', op: { op: 'possess', goblinId: null } });
    return true;
  }
}
