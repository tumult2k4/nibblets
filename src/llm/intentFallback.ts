/**
 * The keyword parser (§17.7.2, P9.7): what the god's words mean when no language model answers in time, or its
 * answer does not hold up. Pure, English and German: intent words in the order they are said (at most two; "stop"
 * says it all), the things named from the refs the goblins know (a building to build, an item to gather, a goblin
 * to tend, a place to go to, keep away from or build near), the tone (please/bitte kind; "!!", CAPITALS or "or
 * else"/"sonst" stern; threats wrathful; laughter playful) and whether it was a question.
 */
import type { Tone, Vec2, WishIntent } from '../shared/types';

/** Something the goblins know that the god may name, with the words that name it (lowercase, both languages). */
export interface VoiceRef { ref: string; label: string; kind: 'building' | 'item' | 'goblin' | 'place'; value: string | number; pos?: Vec2; words: string[] }
export interface InterpretedIntent { intent: WishIntent; targetRef?: string; nearRef?: string }
export interface InterpretedSpeech { tone: Tone; isQuestion: boolean; intents: InterpretedIntent[]; sentiment: number }

const INTENT_WORDS: [WishIntent, RegExp][] = [
  ['stop', /\b(stop|halt|enough|hör(t)? auf|aufhören|genug)\b/],
  ['come_here', /\b(come (here|to me|over)|komm(t)? (her|zu mir)|hierher)\b/],
  ['build', /\b(build|construct|erect|make (a|an|the|me a)|bau(t|en|e)?|errichte(t)?)\b/],
  ['plant', /\b(plant|sow|pflanz(t|en|e)?|sä(t|en)?)\b/],
  ['share_food', /\b(share|teil(t|en|e)?)\b/],
  ['guard', /\b(guard|defend|protect|keep watch|verteidig(t|en|e)?|bewach(t|en|e)?|beschütz(t|en|e)?)\b/],
  ['fight', /\b(fight|attack|kill|kämpf(t|en|e)?|greif(t)? an|töte(t)?)\b/],
  ['hide', /\b(hide|take cover|versteck(t|en|e)?( euch| dich)?)\b/],
  ['worship', /\b(pray|worship|bete(t|n)?|anbeten)\b/],
  ['celebrate', /\b(celebrate|party|feast|dance|feier(t|n)?|tanz(t|en)?)\b/],
  ['make_peace', /\b(make peace|be friends|forgive|vertragt|versöhn(t|en)?|frieden)\b/],
  ['teach', /\b(teach|lehr(t|en|e)?|bring(t)? .{1,20} bei)\b/],
  ['tend', /\b(heal|tend|care for|look after|pfleg(t|en|e)?|heil(t|en|e)?)\b/],
  ['court', /\b(court|marry|woo|heirate(t|n)?|umwirb)\b/],
  ['move_home', /\b(move (house|home|in)|zieh(t)? um|umziehen)\b/],
  ['avoid', /\b(avoid|keep away|stay away|meide(t)?|bleib(t)? weg|fern)\b/],
  ['leave_alone', /\b(leave .{1,20} alone|in ruhe)\b/],
  ['rest', /\b(rest|sleep|nap|ruh(t|en|e)? (euch )?aus|schlaf(t|en)?)\b/],
  ['eat', /\b(eat|iss|esst|essen)\b/],
  ['explore', /\b(explore|look around|scout|erkunde(t)?|schaut euch um)\b/],
  ['gather', /\b(gather|collect|fetch|bring|pick|chop|mine|sammel(t|n)?|sammle|hol(t|en)?|pflück(t|en)?|hack(t|en)?)\b/],
];
const NOT = /\b(don'?t|do not|never|no more|nicht|kein(e|en)?|nie)\s+(\w+\s+){0,2}$/;
const PLACE_INTENTS: readonly WishIntent[] = ['come_here', 'avoid', 'explore', 'guard'];
const GOBLIN_INTENTS: readonly WishIntent[] = ['tend', 'court', 'make_peace', 'teach', 'share_food'];

/** Where `word` is said in `text` at a word's start, or -1. */
function said(text: string, word: string): number {
  if (word.length < 3) return -1;
  for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) if (i === 0 || !/\p{L}/u.test(text[i - 1]!)) return i;
  return -1;
}

export function toneOf(text: string): Tone {
  const lower = text.toLowerCase(), letters = text.replace(/[^\p{L}]/gu, '');
  if (/\b(smite|destroy|crush|burn you|perish|you will (suffer|pay)|zerstör|vernicht|zerschmetter|verbrenn|ihr werdet (leiden|büßen))/.test(lower)) return 'wrathful';
  if (/!{2,}/.test(text) || (letters.length >= 6 && letters.replace(/\P{Lu}/gu, '').length / letters.length > 0.7) || /\b(or else|now!|at once|sonst|sofort|gefälligst)\b/.test(lower)) return 'stern';
  if (/\b(haha|hehe|hihi|lol)\b|[:;]-?\)/.test(lower)) return 'playful';
  return 'kind';
}

export function parseFallback(text: string, refs: readonly VoiceRef[]): InterpretedSpeech {
  const lower = text.toLowerCase(), tone = toneOf(text);
  const isQuestion = /\?/.test(text) || /^\s*(where|what|who|why|how|when|which|wo|was|wer|warum|wieso|wie|wann|welche)\b/.test(lower);
  const named = refs.map((r) => ({ r, at: Math.min(...r.words.map((x) => said(lower, x)).map((i) => (i < 0 ? Infinity : i))) }))
    .filter((x) => x.at < Infinity).sort((a, b) => a.at - b.at).map((x) => x.r);
  const first = (kind: VoiceRef['kind']): VoiceRef | undefined => named.find((r) => r.kind === kind);
  const found: { intent: WishIntent; at: number }[] = [];
  let negated = false;
  for (const [intent, re] of INTENT_WORDS) {
    const m = re.exec(lower);
    if (!m || found.some((f) => f.intent === intent)) continue;
    if (NOT.test(lower.slice(0, m.index))) { negated = true; continue; }
    found.push({ intent, at: m.index });
  }
  found.sort((a, b) => a.at - b.at);
  let order = found.some((f) => f.intent === 'stop') ? [{ intent: 'stop' as WishIntent, at: 0 }] : found;
  if (negated && first('place') && !order.some((f) => f.intent === 'avoid')) order = [...order, { intent: 'avoid', at: Infinity }];
  const intents = order.slice(0, 2).map(({ intent }): InterpretedIntent => {
    const place = first('place');
    if (intent === 'build') {
      const b = first('building');
      return b ? { intent, targetRef: b.ref, ...(place ? { nearRef: place.ref } : {}) } : { intent };
    }
    if (intent === 'gather') { const it = first('item'); return it ? { intent, targetRef: it.ref } : { intent }; }
    if (PLACE_INTENTS.includes(intent) && place) return { intent, targetRef: place.ref };
    if (GOBLIN_INTENTS.includes(intent)) { const g = first('goblin'); return g ? { intent, targetRef: g.ref } : { intent }; }
    return { intent };
  });
  const sentiment = { kind: 0.5, playful: 0.3, stern: -0.2, wrathful: -0.8 }[tone];
  return { tone, isQuestion, intents, sentiment };
}
