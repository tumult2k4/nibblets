import * as THREE from 'three';
import type { Ctx } from '../ctx';
import type { ItemType } from '../../shared/types';
import { audio } from '../audio';

const QTYS = [1, 5, 10];

/** Gift Tray drag (§18.4): ghost follows the hand, wheel steps 1/5/10, release over terrain spawns the drop. */
export class TrayDrag {
  item: ItemType | null = null;
  qtyIdx = 0;
  ground: THREE.Vector3 | null = null;
  onQty: (n: number) => void = () => {};

  constructor(private ctx: Ctx) {}

  get active(): boolean {
    return this.item !== null;
  }
  get qty(): number {
    return QTYS[this.qtyIdx]!;
  }

  start(item: ItemType, e: PointerEvent): void {
    this.item = item;
    this.move(e);
    audio.play('ui_click');
  }

  move(e: PointerEvent): void {
    const p = this.ctx.game.renderer.pickAt(e.clientX, e.clientY);
    this.ground = p.ground;
  }

  wheel(dy: number): void {
    this.qtyIdx = Math.max(0, Math.min(QTYS.length - 1, this.qtyIdx + (dy < 0 ? 1 : -1)));
    this.onQty(this.qty);
  }

  up(e: PointerEvent, overWorld: boolean): void {
    const item = this.item;
    this.item = null;
    if (!item || !overWorld) return;
    const p = this.ctx.game.renderer.pickAt(e.clientX, e.clientY);
    let at = p.ground ? { x: p.ground.x, y: p.ground.z } : null;
    // dropping onto a goblin puts the gift at its feet; it always notices
    if (p.entity?.kind === 'goblin') {
      const g = this.ctx.game.world.goblin(p.entity.id);
      if (g) at = { x: g.pos.x + Math.cos(g.facing) * 0.5, y: g.pos.y + Math.sin(g.facing) * 0.5 };
    }
    if (at) {
      this.ctx.push({ type: 'god_spawn_item', item, qty: this.qty, pos: at });
      audio.play('apple_bonk');
    }
  }

  /** Programmatic drop (keyboard slot pick): drop at the hand's ground point. */
  dropAt(item: ItemType, ground: THREE.Vector3 | null): void {
    if (ground) this.ctx.push({ type: 'god_spawn_item', item, qty: this.qty, pos: { x: ground.x, y: ground.z } });
  }

  cancel(): void {
    this.item = null;
  }
}
