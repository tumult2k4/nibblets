/**
 * A goblin in words for the prompts (§19.3 context header, P9.2): name and epithet, life stage, age in seasons, size
 * and skin color in words ("small", "mossy green"), personality, acquired traits, the three strongest
 * relationships, the feeling of the moment, the biggest worry, the season and weather, the chief. Worded in the
 * game's language. P9.8: the god as a goblin knows it (`godFacts`).
 */
import { CFG } from '../sim/config';
import type { ID } from '../shared/types';
import type { Goblin, NeedId, WorldState } from '../sim/state';
import { ageDays } from '../sim/goblin/goblin';
import { phenotypeOf } from '../sim/goblin/genetics/phenotype';
import { describePersonality } from '../sim/goblin/personality';
import { emotionOf } from '../sim/goblin/mood';
import { clockAt } from '../sim/time';
import { tIn, type Lang } from '../ui/i18n';
import { cleanOutput, mentions } from './sanitize';
import type { LLMRequest } from './provider';

export interface GoblinContext {
  name: string; epithet: string; stage: string; age: number; sizeWord: string; colorWord: string; descriptor: string;
  traits: string; relationships: string[]; emotion: string; lowestNeed: string; season: string; weather: string; chief: string;
}

/** The god as a goblin knows it (P9.8): its name, the goblin's faith in words, their words on the day ("god: … / Name: …"). */
export interface GodFacts { name: string; view: string; talk: readonly string[] }

/** Anyone's name, the living or the dead (the lineage book keeps every name). */
export const nameOf = (s: WorldState, id: ID | null | undefined): string | null =>
  id === null || id === undefined ? null : s.goblins.find((g) => g.id === id)?.name ?? s.lineage[id]?.name ?? null;

/** Every goblin name the world knows, living and dead. */
export function knownNames(s: WorldState): string[] {
  const n = new Set<string>(s.goblins.map((g) => g.name));
  for (const l of Object.values(s.lineage)) n.add(l.name);
  return [...n];
}

/** How an answer is cleaned: no markdown, clamped, and no goblin named that the request (system or prompt) did not name. */
export function acceptFor(s: WorldState, req: LLMRequest, maxChars: number, keepLines = false): (t: string) => string | null {
  const known = knownNames(s), allowed = known.filter((n) => mentions(`${req.system}\n${req.prompt}`, n));
  return (t) => cleanOutput(t, { maxChars, known, allowed, keepLines });
}

/** "mossy green", "dark teal", "pale rose red" (12 hues of 30°, from red). */
export function colorWord(h: number, l: number, lang: Lang): string {
  const c = tIn(lang, `cx.hue.${Math.floor((((h % 360) + 360 + 15) % 360) / 30)}`);
  return l < 0.32 ? tIn(lang, 'cx.dark', { c }) : l > 0.66 ? tIn(lang, 'cx.pale', { c }) : c;
}
export const sizeWord = (scale: number, lang: Lang): string => tIn(lang, `cx.size.${scale < 0.93 ? 'small' : scale > 1.07 ? 'big' : 'mid'}`);

/** How `g` sees `id` in a word or two: its bond ("best friend"), else "likes", "dislikes" or "knows". */
export function relLabel(g: Goblin, id: ID, lang: Lang): string {
  const r = g.relationships.find((x) => x.targetId === id);
  if (!r) return tIn(lang, 'cx.rel.none');
  return r.bond !== 'none' ? tIn(lang, `cx.rel.${r.bond}`) : tIn(lang, r.opinion >= 20 ? 'cx.rel.likes' : r.opinion <= -20 ? 'cx.rel.dislikes' : 'cx.rel.none');
}

const NEEDS: NeedId[] = ['hunger', 'thirst', 'energy', 'warmth', 'safety', 'social', 'fun', 'curiosity', 'comfort', 'purpose'];

export function goblinContext(s: WorldState, g: Goblin, lang: Lang): GoblinContext {
  const ph = phenotypeOf({ genome: g.genome, ageDays: ageDays(g, s.tick), stage: g.lifeStage, hunger: g.needs.hunger, scars: g.health.scars });
  const rels = [...g.relationships].filter((r) => nameOf(s, r.targetId)).sort((a, b) => Math.abs(b.opinion) - Math.abs(a.opinion)).slice(0, 3)
    .map((r) => `${nameOf(s, r.targetId)} (${relLabel(g, r.targetId, lang)})`);
  const low = NEEDS.reduce((a, b) => ((g.needs[b] ?? 100) < (g.needs[a] ?? 100) ? b : a));
  const clock = clockAt(s.tick);
  const chief = nameOf(s, s.village.chiefId);
  return {
    name: g.name,
    epithet: g.epithet ? tIn(lang, `epithet.${g.epithet}`, { name: g.name }) : '',
    stage: tIn(lang, `stage.${g.lifeStage}`).toLowerCase(),
    age: Math.floor(ageDays(g, s.tick) / CFG.time.daysPerSeason),
    sizeWord: sizeWord(ph.scale, lang),
    colorWord: colorWord(ph.skinColor.h, ph.skinColor.l, lang),
    descriptor: describePersonality(g.personality).map((k) => tIn(lang, `word.${k}`)).join(', ') || tIn(lang, 'cx.ordinary'),
    traits: g.traits.map((x) => tIn(lang, `atrait.${x}`)).join(', ') || tIn(lang, 'cx.none'),
    relationships: rels,
    emotion: tIn(lang, `emotion.${emotionOf(g)}`),
    lowestNeed: tIn(lang, `need.${low}`).toLowerCase(),
    season: tIn(lang, `season.${clock.season}`),
    weather: tIn(lang, `weather.${s.weather.kind}`).toLowerCase(),
    chief: chief ?? tIn(lang, 'cx.nochief'),
  };
}

/** The god's name in `lang` (P9.8): what a model named it, else the shaman's name for it, else "the Big Sky". */
export function godNameIn(s: WorldState, lang: Lang): string {
  const n = s.god.godName;
  return s.llm?.godName?.name ?? (!n ? tIn(lang, 'voice.unnamed') : n.startsWith('@') ? tIn(lang, `godname.${n.slice(1)}`) : n);
}

/** How `g` stands with the god, in words: "devout, loves the god". */
export function faithWords(g: Goblin, lang: Lang): string {
  const v = g.godView, P = CFG.llm.products;
  const faith = v.faith >= P.devoutFaith ? 'devout' : v.faith >= CFG.god.believerFaith ? 'believer' : v.faith < CFG.god.skepticFaith ? 'doubter' : 'unsure';
  const felt = [v.love >= P.feltGod && 'loves', v.fear >= P.feltGod && 'fears', v.angryAtGod && 'angry'].filter((k): k is string => !!k);
  return [faith, ...felt].map((k) => tIn(lang, `cx.faith.${k}`)).join(', ');
}

/** The god in a goblin's story (P9.8): for a believer, or for anyone who spoke with the god on `day`; else null. */
export function godFacts(s: WorldState, g: Goblin, lang: Lang, day?: number): GodFacts | null {
  const talk = day === undefined ? [] : (s.llm?.godTalk?.[g.id] ?? []).filter((x) => Math.floor(x.tick / CFG.time.dayTicks) === day).slice(-2);
  if (g.godView.faith < CFG.god.believerFaith && !talk.length) return null;
  const god = godNameIn(s, lang);
  return { name: god, view: faithWords(g, lang), talk: talk.map((x) => `${god}: ${x.god} / ${g.name}: ${x.reply}`) };
}

/** Whether a text speaks of the god: its name, or "god" / "Gott". */
export const mentionsGod = (text: string, god: string): boolean => mentions(text.toLowerCase(), god.toLowerCase()) || /\b(?:gods?|gott(?:es|heit)?|götter[n]?)\b/i.test(text);
