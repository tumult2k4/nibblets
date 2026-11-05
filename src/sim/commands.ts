/** Typed command queue (§3.1, §17.8). UI/god tools never mutate state; they push commands. */
import type { ID, ItemType, Vec2, Vec3 } from '../shared/types';
import { q2 } from '../shared/math';
import { CFG } from './config';
import type { World } from './world';
import { flick, grab, holdMove, pet, poke, release, spawnGift } from './god/hand';
import { ITEM_DEFS } from './items';
import type { NeedId } from './state';

export type SandboxOp =
  | { op: 'remove'; id: ID }
  | { op: 'set_need'; goblinId: ID; need: NeedId; value: number };

export type GodCommand =
  | { type: 'god_grab'; entityId: ID }
  | { type: 'god_hold_move'; pos: Vec2; height: number }
  | { type: 'god_release'; pos: Vec2; height: number; velocity: Vec3 }
  | { type: 'god_spawn_item'; item: ItemType; qty: number; pos: Vec2 }
  | { type: 'god_pet'; goblinId: ID; ticks: number }
  | { type: 'god_poke'; goblinId: ID }
  | { type: 'god_flick'; goblinId: ID; dir: Vec2 }
  | { type: 'sandbox'; op: SandboxOp }
  | { type: 'set_mode'; mode: 'sandbox' | 'observer' };

export type Command = GodCommand;

/** Quantize all numeric inputs so replays are bit-identical (§17.3 "Airborne objects"). */
export function quantize(cmd: Command): Command {
  const qv = (v: Vec2): Vec2 => ({ x: q2(v.x), y: q2(v.y) });
  switch (cmd.type) {
    case 'god_hold_move':
      return { ...cmd, pos: qv(cmd.pos), height: q2(cmd.height) };
    case 'god_release':
      return { ...cmd, pos: qv(cmd.pos), height: q2(cmd.height), velocity: { x: q2(cmd.velocity.x), y: q2(cmd.velocity.y), z: q2(cmd.velocity.z) } };
    case 'god_spawn_item':
      return { ...cmd, pos: qv(cmd.pos), qty: Math.round(cmd.qty) };
    case 'god_flick':
      return { ...cmd, dir: qv(cmd.dir) };
    case 'god_pet':
      return { ...cmd, ticks: Math.round(cmd.ticks) };
    default:
      return cmd;
  }
}

/** Returns a rejection reason, or null when the command may be applied. */
export function validate(w: World, cmd: Command): string | null {
  const s = w.s;
  const mode = s.god.mode;
  if (cmd.type === 'set_mode') return mode === 'divine' ? 'divine_mode_locked' : null;
  if (mode === 'observer') return 'observer_mode';
  if (cmd.type === 'sandbox' && mode !== 'sandbox') return 'sandbox_only';
  const needGoblin = (id: ID) => (w.goblin(id) ? null : 'missing_entity');
  switch (cmd.type) {
    case 'god_grab':
      if (s.god.held) return 'already_holding';
      return w.goblin(cmd.entityId) || s.groundItems.some((i) => i.id === cmd.entityId) ? null : 'missing_entity';
    case 'god_hold_move':
    case 'god_release':
      return s.god.held ? null : 'nothing_held';
    case 'god_spawn_item':
      if (!ITEM_DEFS[cmd.item]) return 'unknown_item';
      if (cmd.qty < 1 || cmd.qty > CFG.god.maxGiftQty) return 'bad_quantity';
      if (cmd.pos.x < 0 || cmd.pos.y < 0 || cmd.pos.x >= s.size.w || cmd.pos.y >= s.size.h) return 'out_of_bounds';
      return null;
    case 'god_pet':
    case 'god_poke':
      return needGoblin(cmd.goblinId) ?? (w.goblin(cmd.goblinId)!.heldByGod ? 'held' : null);
    case 'god_flick':
      if (s.god.gentle) return 'gentle_mode';
      return needGoblin(cmd.goblinId) ?? (w.goblin(cmd.goblinId)!.heldByGod ? 'held' : null);
    case 'sandbox':
      if (cmd.op.op === 'set_need') return needGoblin(cmd.op.goblinId);
      return null;
  }
}

function apply(w: World, cmd: Command): void {
  const s = w.s;
  switch (cmd.type) {
    case 'god_grab': grab(w, cmd.entityId); break;
    case 'god_hold_move': holdMove(w, cmd.pos, cmd.height); break;
    case 'god_release': release(w, cmd.pos, cmd.height, cmd.velocity); break;
    case 'god_spawn_item': spawnGift(w, cmd.item, cmd.qty, cmd.pos); break;
    case 'god_pet': pet(w, w.goblin(cmd.goblinId)!, cmd.ticks); break;
    case 'god_poke': poke(w, w.goblin(cmd.goblinId)!); break;
    case 'god_flick': flick(w, w.goblin(cmd.goblinId)!, cmd.dir); break;
    case 'set_mode': s.god.mode = cmd.mode; break;
    case 'sandbox': {
      const op = cmd.op;
      if (op.op === 'set_need') w.goblin(op.goblinId)!.needs[op.need] = Math.max(0, Math.min(100, op.value));
      else if (op.op === 'remove') {
        // sandbox removal: the entity simply vanishes — no grave, no death event
        if (s.god.held?.id === op.id) s.god.held = null;
        s.goblins = s.goblins.filter((g) => g.id !== op.id);
        s.groundItems = s.groundItems.filter((i) => i.id !== op.id);
        const before = s.plants.length;
        s.plants = s.plants.filter((p) => p.id !== op.id);
        if (before !== s.plants.length) w.markPlantsDirty();
      }
      break;
    }
  }
}

/** §6 step 0: validate → apply → log. At most one hold-move per tick (latest wins). */
export function applyCommands(w: World): void {
  if (!w.queue.length) return;
  const batch = w.queue.splice(0, w.queue.length);
  const lastMove = batch.map((c) => c.type).lastIndexOf('god_hold_move');
  batch.forEach((raw, i) => {
    if (raw.type === 'god_hold_move' && i !== lastMove) return;
    const cmd = quantize(raw);
    const reason = validate(w, cmd);
    if (reason) {
      w.emit({ type: 'command_rejected', command: cmd.type, reason });
      return;
    }
    apply(w, cmd);
    w.s.commandLog.push({ tick: w.s.tick, cmd });
  });
}
