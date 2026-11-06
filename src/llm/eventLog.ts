/**
 * The LLM layer's memory of what happened (§19.3, P9.2): every sim event worth a line, by day, with who was in it
 * (actors and targets) and who saw it (goblins within sight of where it happened, when it was recorded). Kept in
 * memory only, for the last `KEEP_DAYS` days (a season and a day, for the chronicle); nothing here feeds the sim.
 */
import { CFG } from '../sim/config';
import { dist } from '../shared/math';
import type { ID, SimEvent, Vec2 } from '../shared/types';
import type { WorldState } from '../sim/state';

export interface Logged { e: SimEvent; day: number; at: Vec2 | null; who: ID[]; saw: ID[] }

const KEEP_DAYS = CFG.time.daysPerSeason + 1;

/** The goblins an event is about: who did it and to whom (not the witnesses). Null: not worth a line. */
export function actorsOf(e: SimEvent): ID[] | null {
  switch (e.type) {
    case 'goblin_died': case 'egg_hatched': case 'injured': case 'mood_break': case 'trinket_found': case 'chief_chosen': case 'prayer_answered':
    case 'recovered': case 'epithet_earned': case 'inspired': case 'harvested': case 'plant_chopped': case 'rock_mined': case 'item_crafted':
    case 'food_cooked': case 'core_planted': case 'book_written': case 'wish_fulfilled': case 'wish_defied': case 'prayer': case 'fell_ill': case 'enemy_spotted':
      return [e.goblinId];
    case 'fish_caught': return e.caught ? [e.goblinId] : null;
    case 'egg_laid': return [...e.parents];
    case 'enemy_killed': return e.killerId !== null ? [e.killerId] : [];
    case 'enemy_bit': return [e.goblinId];
    case 'recipe_discovered': return e.goblinId !== undefined ? [e.goblinId] : null;
    case 'recipe_learned': return e.goblinId !== undefined ? [e.goblinId, ...(e.byId !== undefined ? [e.byId] : [])] : null;
    case 'theft': return [e.thiefId, ...(e.victimId !== null ? [e.victimId] : [])];
    case 'building_completed': return e.goblinId !== undefined ? [e.goblinId] : [];
    case 'gift_given': return [e.fromId, e.toId];
    case 'trinket_given': return [e.goblinId, e.toId];
    case 'prank': return [e.prankerId, e.targetId];
    case 'brawl': return [e.aId, e.bId];
    case 'bond_formed': return [e.aId, e.bId];
    case 'courted': return e.success ? [e.aId, e.bId] : null;
    case 'chat': return [e.aId, e.bId];
    case 'god_spoke': return [...e.addressees];
    case 'mourned': return [e.goblinId, e.deadId];
    case 'buried': return [e.deadId, ...(e.byId !== null ? [e.byId] : [])];
    case 'comforted': return [e.goblinId, e.byId];
    case 'divine_act': return e.targetId !== undefined ? [e.targetId] : [];
    case 'festival': return e.phase === 'start' ? [] : null;
    case 'enemy_stole': case 'shooting_star': case 'lightning_strike': case 'fire_started': case 'place_named': case 'books_lost': return [];
    default: return null;
  }
}

export class EventLog {
  private days = new Map<number, Logged[]>();

  /** Take a batch of events as they come out of the sim. */
  record(evs: readonly SimEvent[], s: WorldState): void {
    for (const e of evs) {
      const who = actorsOf(e);
      if (!who) continue;
      const day = Math.floor(e.tick / CFG.time.dayTicks);
      const first = who.length ? s.goblins.find((g) => g.id === who[0]) : undefined;
      const at = e.at ?? (first ? { ...first.pos } : null);
      const extra = e.type === 'divine_act' ? e.witnessIds : e.type === 'theft' ? e.witnessIds : [];
      const saw = at ? s.goblins.filter((g) => !who.includes(g.id) && dist(g.pos, at) <= CFG.goblin.visionDay).map((g) => g.id) : [];
      for (const id of extra) if (!saw.includes(id) && !who.includes(id)) saw.push(id);
      let list = this.days.get(day);
      if (!list) {
        this.days.set(day, (list = []));
        for (const d of this.days.keys()) if (d < day - KEEP_DAYS) this.days.delete(d);
      }
      list.push({ e, day, at, who, saw });
    }
  }

  of(day: number): readonly Logged[] {
    return this.days.get(day) ?? [];
  }
  /** What `id` did, suffered or saw on `day`. */
  forGoblin(id: ID, day: number): Logged[] {
    return this.of(day).filter((l) => l.who.includes(id) || l.saw.includes(id));
  }
  clear(): void {
    this.days.clear();
  }
}
