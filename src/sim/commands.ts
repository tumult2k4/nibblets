/** Typed command queue (§3.1, §17.8). UI/god tools never mutate state; they push commands. */
import { siteOk, spawnPlant } from './plants';
import { tileAt } from './grid';
import { divineAct } from './god/faith';
import { TERRAFORM_POWERS, terraform, type TerraformPower } from './god/terraform';
import type { ID, ItemType, ParsedIntent, PlantKind, Tone, Vec2, Vec3 } from '../shared/types';
import { q2 } from '../shared/math';
import { CFG } from './config';
import type { World } from './world';
import { flick, grab, holdMove, pet, poke, release, spawnGift } from './god/hand';
import { cast, castProblem, powerDef } from './god/cast';
import { ITEM_DEFS, SAPLING_VALUE } from './items';
import { afford, giftCost, giftTier, pay, strokeCost } from './god/tiers';
import { applySpeech, quantizeSpeech, speechProblem } from './god/speech';
import { applySandbox, sandboxProblem, type SandboxOp } from './sandbox';

export type { SandboxOp } from './sandbox';

export type GodCommand =
  | { type: 'god_grab'; entityId: ID }
  | { type: 'god_hold_move'; pos: Vec2; height: number }
  | { type: 'god_release'; pos: Vec2; height: number; velocity: Vec3 }
  | { type: 'god_spawn_item'; item: ItemType; qty: number; pos: Vec2 }
  | { type: 'god_pet'; goblinId: ID; ticks: number }
  | { type: 'god_poke'; goblinId: ID }
  | { type: 'god_flick'; goblinId: ID; dir: Vec2 }
  | { type: 'god_power'; power: TerraformPower; pos: Vec2; radius: number; option?: string }
  | { type: 'god_spawn_plant'; kind: PlantKind; pos: Vec2 }
  | { type: 'god_cast'; power: string; pos: Vec2; radius?: number; to?: Vec2; targetId?: ID; option?: string }
  | { type: 'divine_speech'; addressees: ID[] | 'all'; tone: Tone; intents: ParsedIntent[]; isQuestion: boolean; source: 'voice' | 'sign'; textRef?: string }
  | { type: 'sandbox'; op: SandboxOp }
  | { type: 'set_mode'; mode: 'sandbox' | 'observer' };

/** Non-god system commands (settings that change sim behaviour must be logged too). */
export type SystemCommand = { type: 'set_gentle'; on: boolean };

export type Command = GodCommand | SystemCommand;

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
    case 'god_power':
      return { ...cmd, pos: qv(cmd.pos), radius: Math.round(cmd.radius) };
    case 'god_spawn_plant':
      return { ...cmd, pos: qv(cmd.pos) };
    case 'god_cast':
      return { ...cmd, pos: qv(cmd.pos), ...(cmd.radius !== undefined ? { radius: Math.round(cmd.radius) } : {}), ...(cmd.to ? { to: qv(cmd.to) } : {}) };
    case 'god_pet':
      return { ...cmd, ticks: Math.round(cmd.ticks) };
    case 'divine_speech':
      return { ...cmd, intents: quantizeSpeech(cmd.intents) };
    case 'sandbox':
      return 'pos' in cmd.op ? { ...cmd, op: { ...cmd.op, pos: qv(cmd.op.pos) } as SandboxOp } : cmd;
    default:
      return cmd;
  }
}

/** Returns a rejection reason, or null when the command may be applied. */
export function validate(w: World, cmd: Command): string | null {
  const s = w.s;
  const mode = s.god.mode;
  if (cmd.type === 'set_mode') return mode === 'divine' ? 'divine_mode_locked' : null;
  if (cmd.type === 'set_gentle') return null;
  if (mode === 'observer') return 'observer_mode';
  if (cmd.type === 'sandbox' && mode !== 'sandbox') return 'sandbox_only';
  const needGoblin = (id: ID) => (w.goblin(id) ? null : 'missing_entity');
  switch (cmd.type) {
    case 'god_grab':
      if (s.god.held) return 'already_holding';
      return w.goblin(cmd.entityId) || s.groundItems.some((i) => i.id === cmd.entityId) || s.plants.some((p) => p.id === cmd.entityId) ? null : 'missing_entity';
    case 'god_hold_move':
    case 'god_release':
      return s.god.held ? null : 'nothing_held';
    case 'god_spawn_item':
      if (!ITEM_DEFS[cmd.item]) return 'unknown_item';
      if (cmd.qty < 1 || cmd.qty > CFG.god.maxGiftQty) return 'bad_quantity';
      if (cmd.pos.x < 0 || cmd.pos.y < 0 || cmd.pos.x >= s.size.w || cmd.pos.y >= s.size.h) return 'out_of_bounds';
      return afford(w, giftTier(cmd.item), giftCost(cmd.item, cmd.qty)); // P8.9 Divine mode: tier and favor
    case 'god_pet':
    case 'god_poke':
      return needGoblin(cmd.goblinId) ?? (w.goblin(cmd.goblinId)!.heldByGod ? 'held' : null);
    case 'god_flick':
      if (s.god.gentle) return 'gentle_mode';
      return needGoblin(cmd.goblinId) ?? (w.goblin(cmd.goblinId)!.heldByGod ? 'held' : null);
    case 'god_spawn_plant': {
      const t = tileAt(s, cmd.pos.x, cmd.pos.y);
      if (!t || t.biome === 'water' || t.biome === 'rock' || !siteOk(w, cmd.pos, cmd.kind === 'flower' ? 0.6 : 1.2)) return 'bad_site';
      return afford(w, CFG.divine.giftTier, SAPLING_VALUE);
    }
    case 'god_power':
      if (!(TERRAFORM_POWERS as readonly string[]).includes(cmd.power)) return 'unknown_power';
      if (cmd.pos.x < 0 || cmd.pos.y < 0 || cmd.pos.x >= s.size.w || cmd.pos.y >= s.size.h) return 'out_of_bounds';
      return afford(w, powerDef(cmd.power)!.tier, strokeCost(w, powerDef(cmd.power)!, cmd.pos, cmd.radius));
    case 'divine_speech':
      return speechProblem(w, cmd);
    case 'god_cast':
      return castProblem(w, cmd.power, cmd.pos, cmd.to, cmd.targetId, cmd.option);
    case 'sandbox':
      return sandboxProblem(w, cmd.op);
  }
}

function apply(w: World, cmd: Command): void {
  const s = w.s;
  switch (cmd.type) {
    case 'god_grab': grab(w, cmd.entityId); break;
    case 'god_hold_move': holdMove(w, cmd.pos, cmd.height); break;
    case 'god_release': release(w, cmd.pos, cmd.height, cmd.velocity); break;
    case 'god_spawn_item': pay(w, giftCost(cmd.item, cmd.qty)); spawnGift(w, cmd.item, cmd.qty, cmd.pos); break;
    case 'god_pet': pet(w, w.goblin(cmd.goblinId)!, cmd.ticks); break;
    case 'god_poke': poke(w, w.goblin(cmd.goblinId)!); break;
    case 'god_flick': flick(w, w.goblin(cmd.goblinId)!, cmd.dir); break;
    case 'god_power': pay(w, strokeCost(w, powerDef(cmd.power)!, cmd.pos, cmd.radius)); terraform(w, cmd.power, cmd.pos, cmd.radius, cmd.option); break;
    case 'divine_speech': applySpeech(w, cmd); break;
    case 'god_cast': cast(w, cmd.power, cmd.pos, cmd.radius, cmd.to, cmd.targetId, cmd.option); break;
    case 'god_spawn_plant': {
      pay(w, SAPLING_VALUE);
      spawnPlant(w, cmd.kind, cmd.pos, cmd.kind === 'flower' ? 'mature' : 'sapling', null);
      divineAct(w, 'gift', cmd.pos);
      break;
    }
    case 'set_mode': s.god.mode = cmd.mode; break;
    case 'set_gentle': s.god.gentle = cmd.on; break;
    case 'sandbox': applySandbox(w, cmd.op); break;
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
