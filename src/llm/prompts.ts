/**
 * Prompt templates (§19.5, P9.3): pure functions from a goblin's context and its compacted day to a request. The
 * instructions stay in English with "Write in {language}"; the facts are already worded in the game's language by
 * the compactor. Everything that came from the world passes `cleanInput` first (a village or goblin name the player
 * typed must not turn into instructions). Snapshot-tested.
 */
import type { ChatTopic } from '../shared/types';
import { tIn, type Lang } from '../ui/i18n';
import type { GoblinContext } from './describe';
import type { LLMRequest } from './provider';
import { cleanInput } from './sanitize';

export const LANGUAGE: Record<Lang, string> = { en: 'English', de: 'German' };

export const MAX_TOKENS = { diary: 220, dialogue: 240, bark: 40 } as const;

/** The shared system prompt (§19.5), word for word. */
export const systemPrompt = (lang: Lang): string =>
  `You write short in-character text for a cozy simulation game about small goblins called Nibblets.
Nibblets are earnest, simple-minded, a bit greedy for shiny things, brave in groups, and love apples.
Speak in plain, vivid language with goblin flavor (simple words, occasional made-up goblin
expressions like "grub-gob!" or "by the big apple"). Never mention being an AI or a game.
Use only the names, places and events provided; do not invent new characters or events.
Write in ${LANGUAGE[lang]}. No markdown, no lists, no quotation marks around the whole text.`;

const c80 = (s: string): string => cleanInput(s, 80);

/** Every text field of a context made safe for a prompt. */
function safe(c: GoblinContext): GoblinContext {
  const out = { ...c } as Record<string, unknown>;
  for (const [k, v] of Object.entries(c)) if (typeof v === 'string') out[k] = c80(v);
  out.name = cleanInput(c.name);
  out.relationships = c.relationships.map(c80);
  return out as unknown as GoblinContext;
}

const lines = (ls: readonly string[]): string[] => ls.map((l) => cleanInput(l, 160)).filter(Boolean);

/** The diary prompt (§19.5): the goblin, then its day in at most eight lines. */
export function diaryPrompt(ctx: GoblinContext, today: readonly string[], lang: Lang): LLMRequest {
  const c = safe(ctx), day = lines(today);
  const prompt = [
    `Write ${c.name}'s diary entry for today, in first person, 40-90 words.`,
    `About ${c.name}: ${c.stage}, ${c.age} seasons old, ${c.sizeWord} and ${c.colorWord}. Personality: ${c.descriptor}.`,
    ...(c.epithet ? [`Known as: ${c.epithet}.`] : []),
    `Traits: ${c.traits}. Feeling: ${c.emotion}. Biggest worry: ${c.lowestNeed}.`,
    `Relationships: ${c.relationships.join('; ') || tIn(lang, 'cx.none')}.`,
    `Season: ${c.season}, weather: ${c.weather}. Chief: ${c.chief}.`,
    'Today:',
    ...day,
  ].join('\n');
  return { system: systemPrompt(lang), prompt, maxTokens: MAX_TOKENS.diary, product: 'diary', facts: { lang, name: c.name, emotion: c.emotion, season: c.season, weather: c.weather, lines: day } };
}

export interface Speaker { ctx: GoblinContext; /** how this one sees the other: "best friend", "dislikes" */ sees: string; /** what is on its mind: its best line of the day */ news: string | null }

/** The dialogue prompt (§19.4): two goblins chatting; the answer comes back as "NAME: text" lines (`parseDialogue`). */
export function dialoguePrompt(a: Speaker, b: Speaker, topic: ChatTopic, lang: Lang): LLMRequest {
  const A = safe(a.ctx), B = safe(b.ctx);
  const who = (x: GoblinContext, s: Speaker, other: string) =>
    `${x.name}: ${x.stage}, ${x.descriptor}; feeling ${x.emotion}; sees ${other} as: ${c80(s.sees)}. On their mind: ${s.news ? cleanInput(s.news, 160) : tIn(lang, 'cx.none')}.`;
  const prompt = [
    `Write a short conversation between ${A.name} and ${B.name}, chatting about ${tIn(lang, `cx.topic.${topic}`)}.`,
    `2-6 lines. Start every line with the speaker's name and a colon, like "${A.name}: ...". At most 80 characters a line.`,
    who(A, a, B.name),
    who(B, b, A.name),
    `Season: ${A.season}, weather: ${A.weather}.`,
  ].join('\n');
  return { system: systemPrompt(lang), prompt, maxTokens: MAX_TOKENS.dialogue, product: 'dialogue', facts: { lang, names: [A.name, B.name], topic, news: [a.news, b.news] } };
}

/** A bark (§19.4): one line, at most 12 words, called out after a fight won, a discovery, a hatching, a friend's death. */
export type BarkKind = 'win' | 'discovery' | 'hatch' | 'grief';

export function barkPrompt(ctx: GoblinContext, what: string, kind: BarkKind, lang: Lang): LLMRequest {
  const c = safe(ctx), line = cleanInput(what, 160);
  const prompt = [
    `Write one short line, at most 12 words, that ${c.name} calls out right now.`,
    `About ${c.name}: ${c.stage}, ${c.descriptor}; feeling ${c.emotion}.`,
    `What just happened: ${line}`,
  ].join('\n');
  return { system: systemPrompt(lang), prompt, maxTokens: MAX_TOKENS.bark, product: 'bark', facts: { lang, name: c.name, what: line, kind } };
}
