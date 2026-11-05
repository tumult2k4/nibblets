import * as THREE from 'three';
import type { Ctx } from '../ctx';
import { audio } from '../audio';
import { castRadius, powerDef } from '../../sim/god/cast';
import type { PowerDef } from '../../sim/god/powerDefs';

/** Category colors of the casting UX (§18.4). */
export const CATEGORY_COLOR: Record<string, string> = {
  gift: '#ffd36b', nature: '#7cc7f2', terraform: '#b98a5a', wrath: '#a77bf0', miracle: '#ffffff', sandbox: '#cccccc',
};

/**
 * Cast tool (§18.4): an armed power follows the cursor; LMB casts (area/point), a drag casts Gust along a line,
 * Shift+wheel sets the radius. The power stays armed for repeated casts until Esc or a right click.
 */
export class CastTool {
  ground: THREE.Vector3 | null = null;
  dragFrom: THREE.Vector3 | null = null;

  constructor(private ctx: Ctx) {}

  get def(): PowerDef | null {
    const id = this.ctx.store.state.armed;
    return id ? powerDef(id) ?? null : null;
  }

  arm(id: string | null): void {
    this.dragFrom = null;
    armPower(this.ctx, id);
  }

  move(e: PointerEvent): void {
    this.ground = this.ctx.game.renderer.pickAt(e.clientX, e.clientY).ground;
  }

  down(e: PointerEvent): void {
    this.move(e);
    const def = this.def;
    if (!def || !this.ground) return;
    if (def.target === 'direction') {
      this.dragFrom = this.ground.clone();
      return;
    }
    this.ctx.push({ type: 'god_cast', power: def.id, pos: { x: this.ground.x, y: this.ground.z }, radius: this.ctx.store.state.castRadius });
    audio.play('ui_click');
  }

  up(): void {
    const def = this.def;
    if (def?.target === 'direction' && this.dragFrom && this.ground) {
      this.ctx.push({ type: 'god_cast', power: def.id, pos: { x: this.dragFrom.x, y: this.dragFrom.z }, to: { x: this.ground.x, y: this.ground.z } });
      audio.play('ui_click');
    }
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
