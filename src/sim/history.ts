/**
 * The village's history (§18.7 Timeline, P11.1): the events worth a marker on the Timeline (hatchings and deaths,
 * buildings, discoveries and losses, raids, disasters, festivals, the god's acts, the clans' comings and goings), each
 * with its day, where it happened and who; and every kind of creature the village has met, for the Codex. Kept in the
 * save (`s.history`, made on first use, so older saves start an empty one), capped so a long game stays small.
 * Derived from the tick's events alone, so it is as deterministic as they are.
 */
import type { ID, SimEvent, Vec2 } from '../shared/types';
import type { WorldState } from './state';
import { POWER_DEFS } from './god/powerDefs';

export type HistCat = 'birth' | 'death' | 'building' | 'discovery' | 'raid' | 'disaster' | 'festival' | 'divine' | 'clan';
export const HIST_CATS: readonly HistCat[] = ['birth', 'death', 'building', 'discovery', 'raid', 'disaster', 'festival', 'divine', 'clan'];
/** One marker: when, what kind of event (`e`, the event's type), who (`id`), where, and a word for the detail (`k`). */
export interface HistEntry { tick: number; cat: HistCat; e: string; id?: ID; at?: Vec2; k?: string }
export interface History { events: HistEntry[]; seen: string[] }

const MAX = 4000;
const POWERS = new Set(POWER_DEFS.map((p) => p.id));
const QUIET = new Set(['fence', 'path', 'compost_heap', 'garden_plot']);

/** The marker an event makes, if any. */
function entryOf(s: WorldState, e: SimEvent): Omit<HistEntry, 'tick'> | null {
  const at = e.at ? { x: Math.round(e.at.x * 10) / 10, y: Math.round(e.at.y * 10) / 10 } : undefined;
  const mk = (cat: HistCat, id?: ID, k?: string) => ({ cat, e: e.type, ...(id !== undefined ? { id } : {}), ...(at ? { at } : {}), ...(k !== undefined ? { k } : {}) });
  switch (e.type) {
    case 'egg_hatched': return mk('birth', e.goblinId);
    case 'goblin_died': return mk('death', e.goblinId, e.cause);
    case 'building_completed': return QUIET.has(e.kind) ? null : mk('building', e.goblinId, e.kind);
    case 'building_destroyed': return mk('building', undefined, e.kind);
    case 'recipe_discovered': case 'recipe_lost': return mk('discovery', e.goblinId, e.recipe);
    case 'clan_raid': return e.clanB === s.clans[0]?.id ? mk('raid', undefined, s.rivals.find((c) => c.id === e.clanA)?.name) : null;
    case 'flood_started': case 'drought_started': case 'earthquake': case 'shooting_star': return mk('disaster');
    case 'fire_started': return e.cause === 'campfire' ? null : mk('disaster', undefined, e.cause);
    case 'blight_started': return mk('disaster');
    case 'outbreak': return mk('disaster', e.goblinId, e.disease);
    case 'festival': return e.phase === 'start' ? mk('festival', undefined, e.kind) : null;
    case 'divine_act': return POWERS.has(e.act) ? mk('divine', e.targetId, e.act) : null;
    case 'clan_contact': case 'clan_alliance': return mk('clan', undefined, s.rivals.find((c) => c.id === e.clanA)?.name);
    case 'goblin_joined': case 'goblin_left': return mk('clan', e.goblinId, s.rivals.find((c) => c.id === e.clanId)?.name);
    default: return null;
  }
}

/** Step 22 of the tick: this tick's events into the history; at dawn and when one comes or is seen, the creatures about. */
export function recordHistory(s: WorldState, evs: readonly SimEvent[]): void {
  let h = s.history;
  for (const e of evs) {
    const x = entryOf(s, e);
    if (x) {
      h ??= s.history = { events: [], seen: [] };
      h.events.push({ tick: e.tick, ...x });
    }
    if (e.type === 'day_started' || e.type === 'enemy_spotted' || e.type === 'enemy_spawned') {
      // (a gnasher may be gone by the tick's end: its own event names it)
      const kinds = [...(e.type === 'enemy_spawned' ? [e.kind as string] : []), ...s.enemies.map((m) => m.kind as string), ...s.wildlife.map((c) => c.kind as string)];
      h ??= s.history = { events: [], seen: [] };
      for (const k of kinds) if (!h.seen.includes(k)) h.seen.push(k);
    }
  }
  if (h && h.events.length > MAX) h.events.splice(0, h.events.length - MAX);
}
