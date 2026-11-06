/**
 * The Mock's side of the Divine Voice (§17.7.2 non-LLM answers, P9.7): the interpreter answers with what the keyword
 * parser makes of the words, so the Mock and every failed request fall back to it; replies come from the same
 * template lines the signs get, keyed by what the goblin made of it and the tone, and a question is answered from
 * the first thing the goblin remembers; the god keeps the name its shaman gave it. Imported once by the director.
 */
import { registerMock } from './provider';
import { parseFallback, type VoiceRef } from './intentFallback';
import { tIn, type Lang } from '../ui/i18n';

type Pick = <T>(xs: readonly T[]) => T;
const lines = (lang: Lang, key: string, vars: Record<string, string>, pick: Pick): string => pick(tIn(lang, key, vars).split('|'));

registerMock('interpret', (r) => JSON.stringify(parseFallback(String(r.facts?.text ?? ''), (r.facts?.refs as VoiceRef[] | undefined) ?? [])));

registerMock('reply', (r, pick: Pick) => {
  const f = r.facts ?? {}, lang: Lang = f.lang === 'de' ? 'de' : 'en', vars = { name: String(f.name ?? ''), god: String(f.god ?? '') };
  const mem = f.memories as string[] | null | undefined;
  if (mem && (f.stance === 'obey' || f.stance === 'chat')) {
    const what = mem[0];
    return what ? lines(lang, 'reply.answer', { ...vars, what: what.charAt(0).toUpperCase() + what.slice(1) }, pick) : lines(lang, 'reply.dunno', vars, pick);
  }
  return lines(lang, f.stance === 'obey' ? `reply.obey.${String(f.tone)}` : `reply.${String(f.stance ?? 'chat')}`, vars, pick);
});

registerMock('god_name', (r) => String(r.facts?.template ?? ''));
