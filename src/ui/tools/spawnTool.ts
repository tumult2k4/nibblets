import type * as THREE from 'three';
import type { Ctx } from '../ctx';
import { audio } from '../audio';
import type { Command } from '../../sim/commands';
import type { SpawnSpec } from '../store';
import type { Vec2 } from '../../shared/types';

/** The command that puts `spec` down at `pos` (all of them free, and Sandbox only). */
export function spawnCommand(spec: SpawnSpec, pos: Vec2): Command {
  switch (spec.kind) {
    case 'item': return { type: 'god_spawn_item', item: spec.item, qty: 1, pos };
    case 'plant': return { type: 'sandbox', op: { op: 'spawn_plant', kind: spec.plant, stage: spec.stage, pos } };
    case 'building': return { type: 'sandbox', op: { op: 'spawn_building', kind: spec.building, pos, complete: spec.complete } };
    case 'enemy': return { type: 'sandbox', op: { op: 'spawn_enemy', kind: spec.enemy, pos } };
    case 'egg': return { type: 'sandbox', op: { op: 'spawn_egg', pos } };
    case 'goblin': return { type: 'sandbox', op: { op: 'spawn_goblin', genome: spec.genome, pos, ageDays: spec.ageDays } };
  }
}

/**
 * Sandbox placement (§17.5.6 "spawn anything"): with something armed in the drawer, each left click on the ground
 * places one; right click or Esc puts the tool down.
 */
export class SpawnTool {
  ground: THREE.Vector3 | null = null;

  constructor(private ctx: Ctx) {}

  get spec(): SpawnSpec | null {
    return this.ctx.store.state.spawn ?? null;
  }

  move(e: PointerEvent): void {
    this.ground = this.ctx.game.renderer.pickAt(e.clientX, e.clientY).ground;
  }

  down(e: PointerEvent): void {
    this.move(e);
    const spec = this.spec;
    if (!spec || !this.ground) return;
    this.ctx.push(spawnCommand(spec, { x: this.ground.x, y: this.ground.z }));
    audio.play('ui_click');
  }

  disarm(): boolean {
    if (!this.spec) return false;
    this.ctx.store.set({ spawn: null });
    return true;
  }
}
