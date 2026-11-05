import * as THREE from 'three';
import type { Ctx } from '../ctx';
import { CFG } from '../../sim/config';
import { audio } from '../audio';

const STROKE_MS = 100;

/**
 * Terraform brush (§17.5.3): hold LMB to paint; one `god_power` command per 100 ms at the cursor.
 * Place Rock is a point power (one click = one rock). Shift+wheel changes the radius 1–6.
 */
export class BrushTool {
  ground: THREE.Vector3 | null = null;
  painting = false;
  private last = 0;

  constructor(private ctx: Ctx) {}

  private stroke(): void {
    const st = this.ctx.store.state;
    if (!this.ground) return;
    this.ctx.push({ type: 'god_power', power: st.power, pos: { x: this.ground.x, y: this.ground.z }, radius: st.brushRadius, option: st.powerOption });
    this.last = performance.now();
  }

  down(e: PointerEvent): void {
    this.move(e);
    this.stroke();
    this.painting = this.ctx.store.state.power !== 'place_rock';
    audio.play('ui_click');
  }

  move(e: PointerEvent): void {
    this.ground = this.ctx.game.renderer.pickAt(e.clientX, e.clientY).ground;
  }

  up(): void {
    this.painting = false;
  }

  /** Shift+wheel: radius. Returns true when consumed. */
  wheel(dy: number, shift: boolean): boolean {
    if (!shift) return false;
    const st = this.ctx.store.state;
    const r = Math.max(1, Math.min(CFG.terraform.maxRadius, st.brushRadius + (dy < 0 ? 1 : -1)));
    if (r !== st.brushRadius) this.ctx.store.set({ brushRadius: r });
    return true;
  }

  frame(): void {
    if (this.painting && performance.now() - this.last >= STROKE_MS) this.stroke();
  }
}
