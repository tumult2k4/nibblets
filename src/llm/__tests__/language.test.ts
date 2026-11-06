import { describe, expect, it } from 'vitest';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import { registerLineage } from '../../sim/goblin/family';
import { godFacts, goblinContext } from '../describe';
import { MockProvider, type LLMRequest } from '../provider';
import { barkPrompt, bookPrompt, chroniclePrompt, dialoguePrompt, diaryPrompt, eulogyPrompt, systemPrompt, villageNamePrompt } from '../prompts';
import { contentLine } from '../culture';
import { tIn, type Lang } from '../../ui/i18n';
import '../director'; // registers the Mock's templates

const ENGLISH = /\b(the|and|is|what|today|remember|take|we|you)\b/i; // not "was": German too
const GERMAN = /\b(und|der|die|das|ist|heute|nimm|wir|ich|nicht)\b/i;

/** Every product's prompt, built from one world in `lang`, the way the director builds them. */
function requests(lang: Lang): LLMRequest[] {
  const w = makeWorld({ size: 32 }), a = spawnGoblin(w), b = spawnGoblin(w);
  for (const g of [a, b]) registerLineage(w.s, g);
  a.godView.faith = 90;
  w.s.god.godName = '@giver.kind';
  const ca = goblinContext(w.s, a, lang), cb = goblinContext(w.s, b, lang), god = godFacts(w.s, a, lang)!;
  const line = `${tIn(lang, 'cx.tod.dusk')} — ${tIn(lang, 'cx.slew', { a: tIn(lang, 'cx.i'), enemy: tIn(lang, 'enemy.gnasher') })}`;
  return [
    diaryPrompt(ca, [line], lang),
    dialoguePrompt({ ctx: ca, sees: tIn(lang, 'cx.rel.friend'), news: line }, { ctx: cb, sees: tIn(lang, 'cx.rel.friend'), news: null }, 'food', lang),
    barkPrompt(ca, line, 'win', lang),
    bookPrompt(ca, [contentLine('club', lang), contentLine('redcap_is_poison', lang)], lang),
    eulogyPrompt(ca, { dead: b.name, epithet: '', age: 3, cause: tIn(lang, 'cause.old_age'), family: '', deeds: [line], rel: tIn(lang, 'cx.rel.friend') }, lang),
    chroniclePrompt(ca, { village: 'Toadmire', season: tIn(lang, 'season.spring'), year: 1, pop: [2, 2], hatched: 1, died: 1, built: 0, learned: 0, events: [`${tIn(lang, 'cx.day', { d: 2 })} — ${line.split(' — ')[1]}`], diaries: [] }, lang),
    villageNamePrompt([], ca.name, 3, lang),
    // P9.8: the god in the stories
    diaryPrompt(ca, [line], lang, { ...god, talk: ['…'] }),
    diaryPrompt(ca, [line], lang, god),
    bookPrompt(ca, [contentLine('club', lang)], lang, god),
    chroniclePrompt(ca, { village: 'Toadmire', season: tIn(lang, 'season.spring'), year: 1, pop: [2, 2], hatched: 0, died: 0, built: 0, learned: 0, events: [], diaries: [],
      god: { name: god.name, acts: 2, prayers: 5, answered: 1, spoke: 1, words: [] } }, lang),
  ];
}

describe('language (§19.2, P9.6)', () => {
  it('every prompt asks for the game language', () => {
    for (const lang of ['en', 'de'] as const) for (const r of requests(lang)) {
      expect(r.system).toBe(systemPrompt(lang));
      expect(r.system).toContain(`Write in ${lang === 'en' ? 'English' : 'German'}.`);
      expect(r.facts?.lang).toBe(lang);
    }
  });

  it('the Mock answers every product in the language asked for', async () => {
    const mock = new MockProvider();
    for (const lang of ['en', 'de'] as const) for (const r of requests(lang)) {
      const text = await mock.complete(r);
      expect(text.length, `${r.product} ${lang}`).toBeGreaterThan(r.product === 'village_name' || r.product === 'bark' ? 3 : 10);
      if (r.product === 'village_name') continue; // a made-up word
      expect(text, `${r.product} ${lang}: ${text}`).not.toMatch(lang === 'de' ? ENGLISH : GERMAN);
      if (r.product !== 'bark') expect(text, `${r.product} ${lang}: ${text}`).toMatch(lang === 'de' ? GERMAN : ENGLISH); // a bark can be two words
    }
  });
});
