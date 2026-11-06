/** Which sound each sim event makes, and each goblin's voice (see soundscape.ts). */
import type { BarkId, SfxId, VoiceId } from './manifest';
import type { ID, SimEvent, Vec2 } from '../../shared/types';
import type { Goblin } from '../../sim/state';
import type { World } from '../../sim/world';
import { POWER_DEFS } from '../../sim/god/powerDefs';

export type Sound =
  | { sfx: SfxId; at?: Vec2 | null; gid?: ID; gain?: number }
  | { bark: BarkId; gid: ID; at?: Vec2 | null };

/** A goblin's voice: which of the four, and its own pitch (younglings high, elders low, everyone a bit different). */
export function voiceOf(g: Pick<Goblin, 'id' | 'lifeStage'>): { voice: VoiceId; pitch: number } {
  const h = hash(g.id);
  const jitter = ((h >>> 8) % 1000) / 1000 - 0.5; // −0.5..0.5
  switch (g.lifeStage) {
    case 'hatchling': return { voice: 'pip', pitch: 1.35 + jitter * 0.1 };
    case 'youngling': return { voice: 'pip', pitch: 1.18 + jitter * 0.12 };
    case 'elder': return { voice: h % 3 === 0 ? 'mog' : 'nan', pitch: 0.92 + jitter * 0.1 };
    default: return { voice: (['grub', 'mog', 'pip', 'nan', 'grub', 'mog'] as const)[h % 6]!, pitch: 1 + jitter * 0.3 };
  }
}

function hash(n: number): number {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** What one sim event sounds like. */
export function soundsFor(e: SimEvent, w: World): Sound[] {
  const g = (id: ID | null | undefined, sfx: SfxId, gain?: number): Sound => ({ sfx, gid: id ?? undefined, at: e.at, ...(gain ? { gain } : {}) });
  const b = (id: ID, bark: BarkId): Sound => ({ bark, gid: id, at: e.at });
  const flat = (sfx: SfxId): Sound => ({ sfx });
  const building = (id: ID, sfx: SfxId): Sound => ({ sfx, at: w.s.buildings.find((x) => x.id === id)?.pos ?? e.at });
  const enemy = (id: ID, sfx: SfxId): Sound => ({ sfx, at: w.s.enemies.find((x) => x.id === id)?.pos ?? e.at });
  switch (e.type) {
    case 'item_eaten': return [g(e.goblinId, 'eat')];
    case 'item_drunk': return [g(e.goblinId, 'drink')];
    case 'item_picked': case 'item_taken': return [g(e.goblinId, 'pickup')];
    case 'item_stored': return [g(e.goblinId, 'store')];
    case 'fell_asleep': return [b(e.goblinId, 'tired')];
    case 'harvested': return [g(e.goblinId, 'pluck')];
    case 'foraged': return [g(e.goblinId, 'rustle')];
    case 'core_planted': return [g(e.goblinId, 'plant_seed')];
    case 'plant_born': return e.plantedBy != null ? [{ sfx: 'grow', at: e.at }] : [];
    case 'plant_watered': return [g(e.goblinId, 'water_pour')];
    case 'plant_chopped': return [g(e.goblinId, 'tree_fall'), b(e.goblinId, 'cheer')];
    case 'rock_mined': return [g(e.goblinId, 'rock_crumble')];
    case 'tool_broken': return [g(e.goblinId, 'tool_snap'), b(e.goblinId, 'angry')];
    case 'tool_mended': return [g(e.goblinId, 'hammer')];
    case 'campfire_out': return [building(e.buildingId, 'fire_out')];
    case 'fire_tended': return [g(e.goblinId, 'fire_whoosh')];
    case 'item_crafted': return [g(e.goblinId, 'craft'), ...(e.fine ? [g(e.goblinId, 'ding_skill')] : [])];
    case 'building_placed': return [building(e.buildingId, 'hammer')];
    case 'building_completed': return [building(e.buildingId, 'build_done'), ...(e.goblinId != null ? [b(e.goblinId, 'cheer')] : [])];
    case 'building_destroyed': return [building(e.buildingId, 'build_crash')];
    case 'season_changed': return [flat('season')];
    case 'day_started': return [flat('rooster')];
    case 'enemy_spawned': return e.kind === 'raider' ? [flat('war_horn')] : [];
    case 'enemy_spotted': {
      const en = w.s.enemies.find((x) => x.id === e.enemyId);
      const growl: SfxId = en?.kind === 'bramblebeast' ? 'bramble' : en?.kind === 'night_wisp' ? 'wisp' : en?.kind === 'raider' ? 'war_horn' : 'gnasher';
      return [enemy(e.enemyId, growl), b(e.goblinId, 'scared')];
    }
    case 'enemy_bit': return [enemy(e.enemyId, 'gnasher'), b(e.goblinId, 'hurt')];
    case 'enemy_stole': return [enemy(e.enemyId, 'sneak')];
    case 'enemy_killed': case 'enemy_fled': return [enemy(e.enemyId, 'enemy_down')];
    case 'wisp': return e.phase === 'lure' ? [enemy(e.enemyId, 'wisp')] : [];
    case 'tower_warning': return [g(e.goblinId, 'bell_alarm')];
    case 'attack': return [g(e.attackerId, 'hit'), ...(w.goblin(e.targetId) ? [b(e.targetId, 'hurt')] : [])];
    case 'goblin_hurt': case 'injured': return [b(e.goblinId, 'hurt')];
    case 'freezing': return [b(e.goblinId, 'sad')];
    case 'goblin_died': return [flat('death_toll')];
    case 'grief': case 'mourned': return [b(e.goblinId, 'sad')];
    case 'buried': return [{ sfx: 'bury', at: e.at ?? (e.byId != null ? w.goblin(e.byId)?.pos : null) }];
    case 'gift_given': return [g(e.fromId, 'sparkle'), b(e.toId, 'happy')];
    case 'trinket_given': return [g(e.goblinId, 'sparkle'), b(e.toId, 'happy')];
    case 'trinket_found': case 'glints_washed_up': return 'goblinId' in e ? [g(e.goblinId, 'sparkle'), b(e.goblinId, 'curious')] : [];
    case 'theft': return [g(e.thiefId, 'sneak')];
    case 'prank': return [g(e.prankerId, 'prank'), b(e.prankerId, 'laugh')];
    case 'brawl': return [g(e.aId, 'brawl'), b(e.bId, 'angry')];
    case 'apology': return [b(e.goblinId, 'sad')];
    case 'justice': return [b(e.chiefId, 'angry')];
    case 'chat': return [b(e.aId, 'chatter')];
    case 'chat_line': return [b(e.goblinId, 'chatter')];
    case 'skill_up': return [g(e.goblinId, 'ding_skill')];
    case 'courted': return e.success ? [g(e.aId, 'kiss'), b(e.bId, 'giggle')] : [b(e.aId, 'sad')];
    case 'bond_formed': return e.kind === 'mate' ? [g(e.aId, 'kiss')] : e.kind === 'rival' || e.kind === 'enemy' ? [b(e.aId, 'angry')] : [b(e.aId, 'laugh')];
    case 'comforted': return [b(e.byId, 'chatter')];
    case 'egg_laid': return [{ sfx: 'egg_laid', at: e.at ?? w.goblin(e.parents[0])?.pos }];
    case 'egg_hatched': return [g(e.goblinId, 'egg_hatch'), b(e.goblinId, 'baby')];
    case 'egg_lost': return [{ sfx: 'egg_lost', at: e.at }];
    case 'recipe_discovered': return e.goblinId != null ? [g(e.goblinId, 'eureka'), b(e.goblinId, 'happy')] : [];
    case 'poisoned': case 'fell_ill': case 'caught_disease': return 'goblinId' in e && e.type !== 'caught_disease' ? [g(e.goblinId, 'cough')] : [];
    case 'recovered': case 'took_remedy': case 'tended': return [g(e.goblinId, 'heal')];
    case 'food_processed': return [g(e.goblinId, 'saw')];
    case 'food_cooked': return [g(e.goblinId, 'sizzle')];
    case 'fish_caught': return e.caught ? [g(e.goblinId, 'fish_catch'), b(e.goblinId, 'cheer')] : [];
    case 'clay_dug': return [g(e.goblinId, 'clay')];
    case 'compost_spread': return [g(e.goblinId, 'compost')];
    case 'path_paved': return [g(e.goblinId, 'pave')];
    case 'critter_hunted': return [g(e.goblinId, 'sling'), ...(e.killed ? [g(e.goblinId, 'critter')] : [])];
    case 'sprout_nibbled': return [{ sfx: 'critter', at: e.at }];
    case 'fire_started': return [flat('ignite')];
    case 'fire_stomped': return [g(e.goblinId, 'fire_stomp')];
    case 'lightning_strike': return [flat('thunder')];
    case 'flood_started': case 'god_flood': return [flat('flood_surge')];
    case 'blight_started': return [{ sfx: 'blight', at: e.at }];
    case 'blight_culled': return [g(e.goblinId, 'rustle')];
    case 'shooting_star': return [flat('shooting_star')];
    case 'earthquake': return [flat('earthquake')];
    case 'resurrected': case 'brought_forth': return [{ sfx: 'miracle', at: e.at ?? w.goblin(e.goblinId)?.pos }, b(e.goblinId, 'happy')];
    case 'festival': return e.phase === 'start' ? [flat('horn'), { sfx: 'cheer', at: e.at }] : [];
    case 'festival_speech': return [b(e.goblinId, 'cheer')];
    case 'chief_chosen': case 'shaman_chosen': return [{ sfx: 'cheer', at: w.goblin(e.goblinId)?.pos }];
    case 'trade': return [g(e.aId, 'coins')];
    case 'traded': return [g(e.goblinId, 'coins')];
    case 'clan_gift': return [g(e.goblinId, 'sparkle')];
    case 'visitor_arrived': return [flat(e.kind === 'warrior' ? 'war_horn' : 'horn')];
    case 'clan_raid': return [flat('war_horn')];
    case 'goblin_joined': case 'immigrants': return [flat('horn')];
    case 'inspired': return [g(e.goblinId, 'eureka')];
    case 'decorated': return [g(e.goblinId, 'hammer')];
    case 'epithet_earned': return [g(e.goblinId, 'ding_skill')];
    case 'mood_break': return [b(e.goblinId, e.kind === 'binge' ? 'hungry' : 'angry')];
    case 'book_written': return [g(e.goblinId, 'quill')];
    case 'books_lost': return [building(e.buildingId, 'ignite')];
    case 'landed': {
      const gb = w.goblin(e.entityId);
      const at = e.at ?? gb?.pos;
      return [{ sfx: e.water ? 'splash' : 'land_thud', at }, ...(gb && e.damage > 0 ? [b(gb.id, 'hurt')] : [])];
    }
    case 'divine_act': {
      const id = e.targetId;
      const on = id != null && w.goblin(id) ? id : null;
      switch (e.act) {
        case 'grab': return on != null ? [b(on, 'grab')] : [];
        case 'throw': case 'flick': return on != null ? [{ sfx: 'throw_whoosh', at: e.at }, b(on, 'scared')] : [{ sfx: 'throw_whoosh', at: e.at }];
        case 'pet': return on != null ? [b(on, 'giggle')] : [];
        case 'poke': return on != null ? [b(on, 'poked')] : [];
        case 'lightning': case 'meteor': return [flat('thunder')];
        case 'earthquake': case 'flood': return []; // their own events sound
        case 'gust': case 'clear_sky': return [flat('season')];
        case 'apple_shower': case 'shiny_gift': case 'gift': return [{ sfx: 'gift_drop', at: e.at }];
        default: {
          const cat = POWER_DEFS.find((p) => p.id === e.act)?.category;
          return cat === 'wrath' ? [flat('wrath')] : cat === 'gift' || cat === 'miracle' ? [flat('miracle')] : cat === 'terraform' ? [{ sfx: 'rock_crumble', at: e.at }] : cat === 'nature' ? [flat('season')] : [];
        }
      }
    }
    case 'prayer': return [b(e.goblinId, 'pray')];
    case 'group_prayer': return [b(e.goblinId, 'pray'), building(e.buildingId, 'prayer_ding')];
    case 'offering': return [building(e.buildingId, 'prayer_ding')];
    case 'prayer_answered': case 'wish_fulfilled': return [flat('prayer_ding'), b(e.goblinId, 'cheer')];
    case 'converted': return [g(e.goblinId, 'prayer_ding')];
    case 'first_voice': return [b(e.goblinId, 'curious')];
    case 'god_named': return [flat('miracle')];
    case 'power_unlocked': return [flat('power_unlocked')];
    case 'tier_changed': return e.tier > e.from ? [flat('tier_up')] : [flat('wrath')];
    case 'command_rejected': return [flat('power_denied')];
    case 'life_stage': return e.stage === 'elder' ? [b(e.goblinId, 'tired')] : e.stage === 'adult' ? [b(e.goblinId, 'cheer')] : [];
    default: return [];
  }
}
