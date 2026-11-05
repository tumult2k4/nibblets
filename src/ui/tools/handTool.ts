import type { EntityKind } from '../../render/picking';
import * as THREE from 'three';
import type { Ctx } from '../ctx';
import { CFG } from '../../sim/config';
import { audio } from '../audio';
import type { ID } from '../../shared/types';

type State =
  | { k: 'idle' }
  | { k: 'pending'; x: number; y: number; t: number; entity: { kind: EntityKind; id: ID } | null; petSent: number }
  | { k: 'holding'; id: ID }
  | { k: 'box'; x: number; y: number };

/**
 * Hand tool (§17.3): select, box select, pick up (drag > 6 px), raise/lower (wheel), set down/drop/throw,
 * pet (hold still 0.5 s), poke (double-click), flick (Alt+click). Gestures become commands.
 */
export class HandTool {
  st: State = { k: 'idle' };
  holdHeight: number = CFG.god.holdHeight.start;
  ground: THREE.Vector3 | null = null;
  hoverGoblin: ID | null = null;
  private samples: { t: number; x: number; z: number }[] = [];
  private lastClick = { t: 0, id: -1 };
  private lastMoveSent = 0;
  private boxEl: HTMLElement;
  petting = false;

  constructor(private ctx: Ctx) {
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'boxsel hidden';
    document.body.append(this.boxEl);
  }

  private canAct(): boolean {
    return !this.ctx.readOnly() && this.ctx.game.world.s.god.mode !== 'observer';
  }

  down(e: PointerEvent): void {
    const p = this.ctx.game.renderer.pickAt(e.clientX, e.clientY);
    this.ground = p.ground;
    if (e.altKey && p.entity?.kind === 'goblin' && this.canAct()) {
      const g = this.ctx.game.world.goblin(p.entity.id)!;
      const cam = this.ctx.game.renderer.camera.cam.position;
      const dir = { x: g.pos.x - cam.x, y: g.pos.y - cam.z };
      this.ctx.push({ type: 'god_flick', goblinId: g.id, dir });
      audio.play('poke');
      return;
    }
    this.st = { k: 'pending', x: e.clientX, y: e.clientY, t: performance.now(), entity: p.entity, petSent: 0 };
  }

  move(e: PointerEvent): void {
    const r = this.ctx.game.renderer;
    const p = r.pickAt(e.clientX, e.clientY);
    if (p.ground) this.ground = p.ground;
    this.hoverGoblin = p.entity?.kind === 'goblin' ? p.entity.id : null;
    const st = this.st;
    if (st.k === 'pending') {
      const moved = Math.hypot(e.clientX - st.x, e.clientY - st.y);
      if (moved > 6 && !this.petting) {
        const fixed = st.entity?.kind === 'building' || st.entity?.kind === 'egg'; // eggs are not lifted (yet)
        if (st.entity && !fixed && this.canAct()) {
          // goblins, items, and plants (uproot, §P2.7) can be lifted; buildings stay put
          this.ctx.push({ type: 'god_grab', entityId: st.entity.id });
          this.holdHeight = CFG.god.holdHeight.start;
          this.st = { k: 'holding', id: st.entity.id };
          this.samples = [];
          audio.play('hand_grab');
        } else if (!st.entity || fixed) this.st = { k: 'box', x: st.x, y: st.y };
      }
    }
    if (this.st.k === 'holding' && this.ground) {
      const now = performance.now();
      this.samples.push({ t: now, x: this.ground.x, z: this.ground.z });
      while (this.samples.length && now - this.samples[0]!.t > 100) this.samples.shift();
      if (now - this.lastMoveSent > 50) {
        this.lastMoveSent = now;
        this.ctx.push({ type: 'god_hold_move', pos: { x: this.ground.x, y: this.ground.z }, height: this.holdHeight });
      }
    }
    if (this.st.k === 'box') {
      const b = this.st;
      Object.assign(this.boxEl.style, { left: `${Math.min(b.x, e.clientX)}px`, top: `${Math.min(b.y, e.clientY)}px`, width: `${Math.abs(e.clientX - b.x)}px`, height: `${Math.abs(e.clientY - b.y)}px` });
      this.boxEl.classList.remove('hidden');
    }
  }

  up(e: PointerEvent): void {
    const st = this.st;
    this.st = { k: 'idle' };
    this.petting = false;
    if (st.k === 'holding') {
      const v = this.velocity();
      const g = this.ground;
      if (g) this.ctx.push({ type: 'god_release', pos: { x: g.x, y: g.z }, height: this.holdHeight, velocity: { x: v.x, y: v.z, z: 0 } });
      audio.play('hand_drop');
      return;
    }
    if (st.k === 'box') {
      this.boxEl.classList.add('hidden');
      const x0 = Math.min(st.x, e.clientX), x1 = Math.max(st.x, e.clientX), y0 = Math.min(st.y, e.clientY), y1 = Math.max(st.y, e.clientY);
      const r = this.ctx.game.renderer;
      const ids = this.ctx.game.world.s.goblins.filter((g) => {
        const p = r.goblinWorldPos(g.id);
        if (!p) return false;
        const s = r.toScreen(p);
        return s.visible && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
      }).map((g) => g.id);
      this.ctx.select(ids.length ? 'goblin' : null, ids);
      return;
    }
    if (st.k === 'pending') {
      if (st.petSent > 0) return;
      const ent = st.entity;
      const now = performance.now();
      if (ent?.kind === 'goblin' && this.lastClick.id === ent.id && now - this.lastClick.t < 320 && this.canAct()) {
        this.ctx.push({ type: 'god_poke', goblinId: ent.id });
        audio.play('poke');
        this.lastClick = { t: 0, id: -1 };
        return;
      }
      this.lastClick = { t: now, id: ent?.id ?? -1 };
      if (e.ctrlKey && ent?.kind === 'goblin') {
        const sel = this.ctx.store.state.selection;
        this.ctx.select('goblin', sel.includes(ent.id) ? sel.filter((i) => i !== ent.id) : [...sel, ent.id]);
      } else this.ctx.select(ent?.kind ?? null, ent ? [ent.id] : []);
      audio.play('ui_click');
    }
  }

  /** Called each frame: pet when the pointer rests on a goblin for 0.5 s. */
  frame(): void {
    const st = this.st;
    if (st.k !== 'pending' || st.entity?.kind !== 'goblin' || !this.canAct()) return;
    const held = performance.now() - st.t;
    if (held > 500) {
      this.petting = true;
      const ticks = Math.floor((held - 500) / 100) - st.petSent;
      if (ticks >= 5) {
        this.ctx.push({ type: 'god_pet', goblinId: st.entity.id, ticks });
        st.petSent += ticks;
        audio.play('pet_giggle');
      }
    }
  }

  wheel(dy: number): boolean {
    if (this.st.k !== 'holding') return false;
    this.holdHeight = Math.max(CFG.god.holdHeight.min, Math.min(CFG.god.holdHeight.max, this.holdHeight - Math.sign(dy) * 0.5));
    if (this.ground) this.ctx.push({ type: 'god_hold_move', pos: { x: this.ground.x, y: this.ground.z }, height: this.holdHeight });
    return true;
  }

  /** Hand velocity over the last 100 ms in tiles per second. */
  private velocity(): THREE.Vector3 {
    const s = this.samples;
    if (s.length < 2) return new THREE.Vector3();
    const a = s[0]!, b = s[s.length - 1]!;
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    return new THREE.Vector3((b.x - a.x) / dt, 0, (b.z - a.z) / dt);
  }

  cancel(): void {
    if (this.st.k === 'holding' && this.ground)
      this.ctx.push({ type: 'god_release', pos: { x: this.ground.x, y: this.ground.z }, height: 1, velocity: { x: 0, y: 0, z: 0 } });
    this.st = { k: 'idle' };
    this.boxEl.classList.add('hidden');
  }

  get holding(): boolean {
    return this.st.k === 'holding';
  }
}
