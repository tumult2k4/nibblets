import * as THREE from 'three';
import type { Ctx } from '../ctx';
import { audio } from '../audio';
import { castPreview, castRadius, powerDef } from '../../sim/god/cast';
import type { PowerDef } from '../../sim/god/powerDefs';
import type { ID, Vec2 } from '../../shared/types';

/** Category colors of the casting UX (§18.4). */
export const CATEGORY_COLOR: Record<string, string> = {
  gift: '#ffd36b', nature: '#7cc7f2', terraform: '#b98a5a', wrath: '#a77bf0', miracle: '#ffffff', sandbox: '#cccccc',
};

/**
 * Cast tool (§18.4): an armed power follows the cursor; LMB casts (area/point, or the goblin under the cursor for
 * Curse), a drag casts Gust along a line, Shift+wheel sets the radius. With "confirm lethal" on, a cast that would kill
 * waits for a second click or Enter. The power stays armed for repeated casts until Esc or a right click.
 */
export class CastTool {
  ground: THREE.Vector3 | null = null;
  dragFrom: THREE.Vector3 | null = null;
  /** goblin under the cursor (goblin-target powers) */
  hoverGoblin: ID | null = null;
  /** a lethal cast waiting for confirmation (§18.4 step 4) */
  pending: { power: string; pos: Vec2; radius: number; lethal: ID[] } | null = null;

  constructor(private ctx: Ctx) {}

  get def(): PowerDef | null {
    const id = this.ctx.store.state.armed;
    return id ? powerDef(id) ?? null : null;
  }

  arm(id: string | null): void {
    this.dragFrom = null;
    this.pending = null;
    armPower(this.ctx, id);
  }

  move(e: PointerEvent): void {
    const pk = this.ctx.game.renderer.pickAt(e.clientX, e.clientY);
    this.ground = pk.ground;
    this.hoverGoblin = pk.entity?.kind === 'goblin' ? pk.entity.id : null;
    // moving away from a pending lethal cast calls it off
    const p = this.pending;
    if (p && (!this.ground || Math.hypot(this.ground.x - p.pos.x, this.ground.z - p.pos.y) > 1.5)) this.pending = null;
  }

  down(e: PointerEvent): void {
    this.move(e);
    const def = this.def;
    if (!def || !this.ground) return;
    if (def.target === 'direction') {
      this.dragFrom = this.ground.clone();
      return;
    }
    if (def.target === 'goblin' || def.target === 'pair') {
      const g = this.hoverGoblin !== null ? this.ctx.game.world.goblin(this.hoverGoblin) : undefined;
      if (g) this.send({ type: 'god_cast', power: def.id, pos: { x: g.pos.x, y: g.pos.y }, targetId: g.id });
      return;
    }
    if (this.confirm()) return;
    const st = this.ctx.store.state;
    const pos = { x: this.ground.x, y: this.ground.z };
    const lethal = castPreview(this.ctx.game.world, def.id, pos, st.castRadius).lethal;
    if (st.settings.confirmLethal && lethal.length) {
      this.pending = { power: def.id, pos, radius: st.castRadius, lethal };
      audio.play('ui_click');
      return;
    }
    this.send({ type: 'god_cast', power: def.id, pos, radius: st.castRadius });
  }

  /** Enter or a second click: cast the lethal power waiting for confirmation. Returns true when there was one. */
  confirm(): boolean {
    const p = this.pending, def = this.def;
    this.pending = null;
    if (!p || def?.id !== p.power) return false;
    this.send({ type: 'god_cast', power: def.id, pos: p.pos, radius: p.radius });
    return true;
  }

  /** Esc: drop a pending lethal cast first. Returns true when there was one. */
  cancel(): boolean {
    const had = this.pending !== null;
    this.pending = null;
    return had;
  }

  private send(cmd: Parameters<Ctx['push']>[0]): void {
    this.ctx.push(cmd);
    audio.play('ui_click');
  }

  up(): void {
    const def = this.def;
    if (def?.target === 'direction' && this.dragFrom && this.ground)
      this.send({ type: 'god_cast', power: def.id, pos: { x: this.dragFrom.x, y: this.dragFrom.z }, to: { x: this.ground.x, y: this.ground.z } });
    this.dragFrom = null;
  }

  /** Shift+wheel: radius within the power's range. Returns true when consumed. */
  wheel(dy: number, shift: boolean): boolean {
    const def = this.def;
    if (!shift || !def?.radius) return false;
    const st = this.ctx.store.state;
    const r = castRadius(def, st.castRadius + (dy < 0 ? 1 : -1));
    if (r !== st.castRadius) this.ctx.store.set({ castRadius: r });
    return true;
  }
}

/** Arm a power (toolbar card, hotkey); global powers cast at once. Passing null disarms. */
export function armPower(ctx: Ctx, id: string | null): void {
  const def = id ? powerDef(id) : undefined;
  const st = ctx.store.state;
  if (def && def.target === 'global') {
    // sky-wide powers need no target: choosing the card is the click
    ctx.push({ type: 'god_cast', power: def.id, pos: { x: 0, y: 0 } });
    audio.play('ui_click');
    return;
  }
  const mid = def?.radius ? Math.round((def.radius[0] + def.radius[1]) / 2) : 0;
  const radius = def ? castRadius(def, st.armed === id ? st.castRadius : mid) : st.castRadius;
  ctx.store.set({ armed: def ? def.id : null, castRadius: radius });
}
