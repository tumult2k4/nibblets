/**
 * The event compactor (§19.3, P9.2): one goblin's day as at most eight terse lines for a prompt, with goblin and
 * place names: "dusk — Krikwick slew a Gnasher at Sad Pond; I was hurt". Events it was in or saw are scored (a
 * bonded goblin's death 12, its own child hatched 10, a fight 9, a discovery 8, a festival 7…, routine work 1), the
 * same kind merged ("I picked apple ×4"), the best eight kept in the order they happened. Pure: the same log, world
 * and language give the same lines.
 */
import { clockAt } from '../sim/time';
import type { ID, SimEvent } from '../shared/types';
import type { Goblin, WorldState } from '../sim/state';
import { tIn, type Lang } from '../ui/i18n';
import { placesOf } from '../sim/places';
import { placeName, placeNameAt } from './placeNames';
import { nameOf } from './describe';
import type { EventLog, Logged } from './eventLog';

const KEEP = 8, SEEN = 0.6;
const BONDS = ['mate', 'best_friend', 'friend', 'parent', 'child', 'sibling'];

export interface DayLine { tick: number; score: number; text: string }
export interface GoblinDay { goblinId: ID; day: number; lines: string[]; score: number }

const bonded = (g: Goblin, id: ID): boolean => g.relationships.some((r) => r.targetId === id && BONDS.includes(r.bond)) || !!g.parents?.includes(id);
const ownChild = (s: WorldState, g: Goblin, id: ID): boolean => !!s.lineage[id]?.parents?.includes(g.id);

/** How much a line is worth to `g` (before merging), and its phrase key with parameters. */
function phrase(s: WorldState, g: Goblin, e: SimEvent): [number, string, Record<string, string | ID | null>] | null {
  switch (e.type) {
    case 'goblin_died': return [bonded(g, e.goblinId) ? 12 : 5, 'cx.died', { a: e.goblinId, cause: `cause.${e.cause}` }];
    case 'egg_hatched': return [ownChild(s, g, e.goblinId) ? 10 : 3, 'cx.hatched', { a: e.goblinId }];
    case 'egg_laid': return [e.parents.includes(g.id) ? 9 : 3, 'cx.egg_laid', { a: e.parents[0], b: e.parents[1] }];
    case 'enemy_killed': return [9, 'cx.slew', { a: e.killerId, enemy: `enemy.${e.kind}` }];
    case 'enemy_bit': return [9, 'cx.bit', { b: e.goblinId, enemy: 'enemy.gnasher' }];
    case 'injured': return [7, 'cx.hurt', { a: e.goblinId }];
    case 'enemy_spotted': return [4, 'cx.spotted', { a: e.goblinId, enemy: `enemy.${s.enemies.find((x) => x.id === e.enemyId)?.kind ?? 'gnasher'}` }];
    case 'enemy_stole': return [5, 'cx.stole_enemy', { enemy: 'enemy.gnasher', item: `item.${e.item}` }];
    case 'recipe_discovered': return [8, 'cx.discovered', { a: e.goblinId ?? null, recipe: `recipe.${e.recipe}` }];
    case 'recipe_learned': return [4, 'cx.learned', { a: e.goblinId ?? null, b: e.byId ?? null, recipe: `recipe.${e.recipe}` }];
    case 'festival': return [7, 'cx.festival', { fest: `fest.${e.kind}` }];
    case 'theft': {
      const item = e.trinket ? `trinket.${e.trinket}` : e.item ? `item.${e.item}` : 'cx.someone';
      return [e.thiefId === g.id || e.victimId === g.id ? 7 : 4, e.victimId !== null ? 'cx.theft' : 'cx.theft_store', { a: e.thiefId, b: e.victimId, item }];
    }
    case 'mood_break': return [7, 'cx.mood_break', { a: e.goblinId, kind: `break.${e.kind}` }];
    case 'building_completed': return [5, e.goblinId !== undefined ? 'cx.built' : 'cx.built_anon', { a: e.goblinId ?? null, bld: `bld.${e.kind}` }];
    case 'gift_given': return [5, 'cx.gift', { a: e.fromId, b: e.toId, item: `item.${e.item}` }];
    case 'trinket_given': return [5, 'cx.trinket_given', { a: e.goblinId, b: e.toId, trinket: `trinket.${e.trinket}` }];
    case 'prank': return [5, 'cx.prank', { a: e.prankerId, b: e.targetId }];
    case 'trinket_found': return [e.rarity === 'rare' || e.rarity === 'legendary' ? 6 : 2, 'cx.trinket', { a: e.goblinId, trinket: `trinket.${e.trinket}` }];
    case 'brawl': return [7, 'cx.brawl', { a: e.aId, b: e.bId }];
    case 'bond_formed': return [6, 'cx.bond', { a: e.aId, b: e.bId, bond: `cx.bond.${e.kind}` }];
    case 'courted': return [5, 'cx.courted', { a: e.aId, b: e.bId }];
    case 'chat': return [2, 'cx.chat', { a: e.aId, b: e.bId }];
    case 'chief_chosen': return [6, 'cx.chief', { a: e.goblinId }];
    case 'prayer_answered': return [7, 'cx.answered', { a: e.goblinId }];
    case 'prayer': return [2, 'cx.prayed', { a: e.goblinId }];
    case 'god_spoke': return [8, 'cx.god_spoke', { a: e.addressees.includes(g.id) ? g.id : e.addressees[0] ?? null }];
    case 'divine_act': return [6, 'cx.divine', { act: e.act }];
    case 'wish_fulfilled': return [4, 'cx.wish_kept', { a: e.goblinId }];
    case 'wish_defied': return [5, 'cx.wish_defied', { a: e.goblinId }];
    case 'fell_ill': return [5, 'cx.ill', { a: e.goblinId, disease: `disease.${e.disease}` }];
    case 'recovered': return [3, 'cx.recovered', { a: e.goblinId }];
    case 'epithet_earned': return [6, 'cx.epithet', { a: e.goblinId, epithet: `epithet.${e.epithet}` }];
    case 'inspired': return [4, 'cx.inspired', { a: e.goblinId }];
    case 'shooting_star': return [6, 'cx.star', {}];
    case 'lightning_strike': return [3, 'cx.lightning', {}];
    case 'fire_started': return [5, 'cx.fire', {}];
    case 'mourned': return [5, 'cx.mourned', { a: e.goblinId, b: e.deadId }];
    case 'buried': return [6, 'cx.buried', { b: e.deadId }];
    case 'comforted': return [4, 'cx.comforted', { a: e.goblinId, b: e.byId }];
    case 'place_named': return [4, 'cx.place', { place: `@${e.placeId}` }];
    case 'harvested': return [1, 'cx.harvested', { a: e.goblinId, item: `item.${e.item}` }];
    case 'plant_chopped': return [1, 'cx.chopped', { a: e.goblinId }];
    case 'rock_mined': return [1, 'cx.mined', { a: e.goblinId }];
    case 'item_crafted': return [2, 'cx.crafted', { a: e.goblinId, item: `item.${e.item}` }];
    case 'fish_caught': return [2, 'cx.fish', { a: e.goblinId }];
    case 'food_cooked': return [1, 'cx.cooked', { a: e.goblinId, item: `item.${e.item}` }];
    case 'core_planted': return [1, 'cx.planted', { a: e.goblinId }];
    default: return null;
  }
}

const timeOfDay = (tick: number): string => {
  const h = clockAt(tick).hour; // the day starts at dawn, 06:00
  return h < 5 ? 'night' : h < 8 ? 'dawn' : h < 12 ? 'morning' : h < 14 ? 'midday' : h < 18 ? 'afternoon' : h < 21 ? 'dusk' : 'night';
};

/** Fill a phrase: goblin ids become names ("I" for `self`), keys become words in `lang` (English nouns in lowercase). */
function words(s: WorldState, self: ID, lang: Lang, key: string, ps: Record<string, string | ID | null>): string {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ps)) {
    if (k === 'a' || k === 'b') {
      const name = (typeof v === 'number' ? nameOf(s, v) : null) ?? tIn(lang, 'cx.someone');
      out[k] = v === self ? tIn(lang, 'cx.i') : name;
      out[`${k}A`] = v === self ? tIn(lang, 'cx.me') : name;
      out[`${k}D`] = v === self ? tIn(lang, 'cx.mir') : name;
    } else if (typeof v === 'string' && v.startsWith('@')) {
      const pl = placesOf(s).find((p) => p.id === Number(v.slice(1)));
      out[k] = pl ? placeName(pl, lang) : '?';
    } else if (k === 'epithet' && typeof v === 'string') out[k] = tIn(lang, v, { name: out.a ?? '' });
    else if (typeof v === 'string') {
      const w = tIn(lang, v);
      out[k] = lang === 'en' && !v.startsWith('fest.') && !v.startsWith('enemy.') ? w.toLowerCase() : w;
    } else out[k] = String(v ?? '');
  }
  return tIn(lang, key, out);
}

/** `g`'s day: the lines worth telling, best `KEEP` in time order, and how interesting the day was (their sum). */
export function compactDay(s: WorldState, log: EventLog, g: Goblin, day: number, lang: Lang): GoblinDay {
  const merged = new Map<string, { tick: number; score: number; n: number; text: string; at: Logged['at'] }>();
  for (const l of log.forGoblin(g.id, day)) {
    const p = phrase(s, g, l.e);
    if (!p) continue;
    const [base, key, ps] = p;
    const score = l.who.includes(g.id) ? base : base * SEEN;
    const text = words(s, g.id, lang, key, ps);
    const m = merged.get(text);
    if (m) { m.n++; m.score = Math.max(m.score, score); continue; }
    merged.set(text, { tick: l.e.tick, score, n: 1, text, at: l.at });
  }
  const best = [...merged.values()].sort((a, b) => b.score - a.score || a.tick - b.tick).slice(0, KEEP).sort((a, b) => a.tick - b.tick);
  const lines = best.map((m) => {
    let line = m.n > 1 ? tIn(lang, 'cx.times', { line: m.text, n: m.n }) : m.text;
    const place = m.at ? placeNameAt(s, m.at, lang, undefined, m.tick) : null; // only names the place had by then
    if (place && !line.includes(place)) line = tIn(lang, 'cx.at', { line, place });
    return `${tIn(lang, `cx.tod.${timeOfDay(m.tick)}`)} — ${line}`;
  });
  return { goblinId: g.id, day, lines, score: best.reduce((a, m) => a + m.score, 0) };
}

/** The `k` goblins with the most interesting `day` (diaries go to them, §19.4). */
export function topOfDay(s: WorldState, log: EventLog, day: number, k: number, lang: Lang): GoblinDay[] {
  return s.goblins.filter((g) => g.lifeStage !== 'egg' && g.lifeStage !== 'hatchling').map((g) => compactDay(s, log, g, day, lang))
    .filter((d) => d.lines.length).sort((a, b) => b.score - a.score || a.goblinId - b.goblinId).slice(0, k);
}
