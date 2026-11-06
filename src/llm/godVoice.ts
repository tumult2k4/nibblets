/**
 * The Divine Voice in words (§17.7.2, P9.7): what the goblins know that the god may name (`voiceRefs`, at most 30:
 * buildings they can build, things to gather, goblins near the addressees, named places), the interpreter's prompt
 * and its hand-written validator (strict JSON: a tone, a question or not, up to two intents from the wish list with
 * targets from the refs, a sentiment), the turn of what was understood into `divine_speech` intents, what a goblin
 * remembers when the god asks, and the responder's and the god-naming prompts.
 */
import { CFG } from '../sim/config';
import { dist } from '../shared/math';
import { GATHER_FOR, WISH_INTENTS } from '../sim/cfg/divine';
import { wishBuildings } from '../sim/god/speech';
import { placesOf } from '../sim/places';
import type { ID, ParsedIntent, Tone, Vec2, WishIntent } from '../shared/types';
import type { Goblin, WorldState } from '../sim/state';
import type { World } from '../sim/world';
import { tIn, type Lang } from '../ui/i18n';
import type { GoblinContext } from './describe';
import { featureWord, placeName, placeNameAt } from './placeNames';
import type { InterpretedIntent, InterpretedSpeech, VoiceRef } from './intentFallback';
import type { LLMRequest } from './provider';
import { systemPrompt } from './prompts';
import { cleanInput } from './sanitize';

const DAY = CFG.time.dayTicks, MAX_REFS = 30, TONES: readonly Tone[] = ['kind', 'stern', 'wrathful', 'playful'];
/** plurals the keyword parser should know an item by */
const PLURAL: Record<string, string[]> = { apple: ['apples', 'äpfel'], berry: ['berries', 'beeren'], stone: ['stones', 'steine'], mushroom: ['mushrooms', 'pilze'], stick: ['sticks', 'stöcke'], fish: ['fische'] };
const both = (key: string): string[] => [tIn('en', key), tIn('de', key)].map((x) => x.toLowerCase());

/** What the god may name, nearest the addressees first. */
export function voiceRefs(w: World, lang: Lang, to: ID[] | 'all'): VoiceRef[] {
  const s = w.s, first = to === 'all' ? undefined : w.goblin(to[0]!), at = first?.pos ?? s.village.center;
  const near = <T extends { pos: Vec2 }>(xs: T[]): T[] => [...xs].sort((a, b) => dist(a.pos, at) - dist(b.pos, at));
  const refs: VoiceRef[] = [
    ...wishBuildings(w).map((b): VoiceRef => ({ ref: `building:${b}`, label: tIn(lang, `bld.${b}`), kind: 'building', value: b, words: both(`bld.${b}`) })),
    ...Object.keys(GATHER_FOR).map((t): VoiceRef => ({ ref: `item:${t}`, label: tIn(lang, `item.${t}`), kind: 'item', value: t, words: [...both(`item.${t}`), ...(PLURAL[t] ?? [])] })),
    ...near(s.goblins).slice(0, 8).map((g): VoiceRef => ({ ref: `goblin#${g.id}`, label: g.name, kind: 'goblin', value: g.id, words: [g.name.toLowerCase()] })),
    ...near(placesOf(s)).slice(0, 8).map((p): VoiceRef => ({
      ref: `place#${p.id}`, label: placeName(p, lang), kind: 'place', value: p.id, pos: { ...p.pos },
      words: [placeName(p, 'en'), placeName(p, 'de'), featureWord(p.feature, 'en'), featureWord(p.feature, 'de')].map((x) => x.toLowerCase()),
    })),
  ];
  return refs.slice(0, MAX_REFS);
}

/** The interpreter (§17.7.2): the system prompt word for word, the refs listed with their ids. */
export function interpretPrompt(text: string, refs: readonly VoiceRef[], lang: Lang): LLMRequest {
  const list = refs.map((r) => (r.kind === 'goblin' ? `${r.ref} ${cleanInput(r.label)}` : `${r.ref} "${cleanInput(r.label)}"`)).join(', ');
  const system = `You translate what a god says to small goblins into game data. Output ONLY a JSON object, no prose.
Schema: {"tone":"kind|stern|wrathful|playful","isQuestion":bool,"intents":[{"intent":<one of LIST>,"targetRef":<optional, one of REFS>,"nearRef":<optional, a place# from REFS: where to build>}],"sentiment":number}
LIST: ${WISH_INTENTS.join(', ')}.
Use at most 2 intents. If the god only chats, praises or asks something, intents may be empty.
REFS (things the goblins know, with ids): ${list || 'none'}
The god may speak English or German.`;
  const said = cleanInput(text, 280);
  return { system, prompt: said, maxTokens: 120, temperature: 0, product: 'interpret', facts: { lang, text: said, refs } };
}

/** Strict: the answer's JSON object, or null when anything in it is off (the keyword parser then decides). */
export function validateInterpretation(raw: string, refs: readonly VoiceRef[]): InterpretedSpeech | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  let v: unknown;
  try { v = m ? JSON.parse(m[0]) : null; } catch { return null; }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>, byRef = new Map(refs.map((r) => [r.ref, r]));
  if (!TONES.includes(o.tone as Tone) || typeof o.isQuestion !== 'boolean' || typeof o.sentiment !== 'number' || !Number.isFinite(o.sentiment)) return null;
  if (!Array.isArray(o.intents) || o.intents.length > CFG.divine.maxIntents) return null;
  const intents: InterpretedIntent[] = [];
  for (const x of o.intents as unknown[]) {
    if (!x || typeof x !== 'object') return null;
    const { intent, targetRef, nearRef } = x as Record<string, unknown>;
    if (!WISH_INTENTS.includes(intent as WishIntent)) return null;
    const ok = (r: unknown, place = false) => r === undefined || r === null || r === '' || (typeof r === 'string' && byRef.has(r) && (!place || byRef.get(r)!.kind === 'place'));
    if (!ok(targetRef) || !ok(nearRef, true)) return null;
    intents.push({ intent: intent as WishIntent, ...(targetRef ? { targetRef: targetRef as string } : {}), ...(nearRef ? { nearRef: nearRef as string } : {}) });
  }
  return { tone: o.tone as Tone, isQuestion: o.isQuestion, intents, sentiment: Math.max(-1, Math.min(1, o.sentiment)) };
}

/** What was understood as wishes: targets from the refs; "come here" or "keep away" with no place named means `here`. */
export function toIntents(sp: InterpretedSpeech, refs: readonly VoiceRef[], here: Vec2 | null): ParsedIntent[] {
  const byRef = new Map(refs.map((r) => [r.ref, r]));
  const out: ParsedIntent[] = [];
  for (const x of sp.intents) {
    const r = x.targetRef ? byRef.get(x.targetRef) : undefined, nearPos = x.nearRef ? byRef.get(x.nearRef)?.pos : undefined;
    if (r?.kind === 'building') out.push({ intent: x.intent, target: { kind: 'building', value: r.value, ...(nearPos ? { pos: { ...nearPos } } : {}) } });
    else if (r?.kind === 'item') out.push({ intent: x.intent, target: { kind: 'item', value: r.value } });
    else if (r?.kind === 'goblin') out.push({ intent: x.intent, target: { kind: 'entity', value: r.value } });
    else if (r?.kind === 'place') out.push({ intent: x.intent, target: { kind: 'place', value: r.value, pos: { ...r.pos! } } });
    else if (x.intent === 'come_here' || x.intent === 'avoid') { if (here) out.push({ intent: x.intent, target: { kind: 'pos', value: 0, pos: { ...here } } }); }
    else out.push({ intent: x.intent });
  }
  return out;
}

/** "a bush with 4 apples at Sad Pond, yesterday": what `g` remembers, the freshest first (for answers to questions). */
export function memoriesOf(s: WorldState, g: Goblin, lang: Lang, n = 5): string[] {
  const c = s.village.center;
  const where = (p: Vec2): string => {
    const place = placeNameAt(s, p, lang, 10);
    if (place) return tIn(lang, 'mem.at', { place });
    const dx = p.x - c.x, dy = p.y - c.y;
    return Math.hypot(dx, dy) < 8 ? tIn(lang, 'mem.near') : tIn(lang, `mem.dir.${Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n'}`);
  };
  const when = (tick: number): string => {
    const d = Math.floor(s.tick / DAY) - Math.floor(tick / DAY);
    return d <= 0 ? tIn(lang, 'mem.today') : d === 1 ? tIn(lang, 'mem.yesterday') : tIn(lang, 'mem.days', { n: d });
  };
  return [...g.memory].filter((m) => m.kind !== 'place').sort((a, b) => b.lastSeenTick - a.lastSeenTick).slice(0, n).map((m) => {
    const key = m.kind === 'fruit_plant' ? (m.data > 0 ? 'mem.fruit' : 'mem.fruit0') : `mem.${m.kind}`;
    const who = m.targetId !== undefined ? s.goblins.find((x) => x.id === m.targetId)?.name ?? s.lineage[m.targetId]?.name ?? '?' : '?';
    return tIn(lang, key, { n: m.data, where: where(m.pos), when: when(m.lastSeenTick), who });
  });
}

export type Stance = 'obey' | 'defy' | 'skeptic' | 'baby' | 'chat';
/** What `g` made of the god's words (the sim already decided whether it obeys). */
export function stanceOf(g: Goblin, issuedTick: number, intents: number): Stance {
  if (g.lifeStage === 'hatchling') return 'baby';
  if (g.godView.faith < CFG.god.skepticFaith) return 'skeptic';
  if (g.godView.wishes.some((x) => x.issuedTick === issuedTick && x.defied)) return 'defy';
  return intents ? 'obey' : 'chat';
}
const WILL: Record<Stance, string> = {
  obey: 'do it', defy: 'not do it: it defies the god', skeptic: 'doubt that a god spoke at all (the wind? a prank?)', baby: 'only babble, being a baby', chat: 'just marvel',
};
export interface ReplyFacts {
  ctx: GoblinContext; god: string; faith: number; love: number; fear: number; angry: boolean; understood: string; stance: Stance; tone: Tone;
  doing: string; history: readonly string[]; memories: readonly string[] | null; said: string;
}

/** The responder (§17.7.2): the shared system prompt and the goblin's side; the god's words are the message. */
export function replyPrompt(f: ReplyFacts, lang: Lang): LLMRequest {
  const name = cleanInput(f.ctx.name), god = cleanInput(f.god), said = cleanInput(f.said, 280);
  const lines = [
    `A god's voice has just spoken from the sky to ${name}. Reply as ${name} in 1-3 short sentences.`,
    `${name}'s view of the god (${god}): faith ${Math.round(f.faith)}/100, love ${Math.round(f.love)}/100, fear ${Math.round(f.fear)}/100${f.angry ? ', and angry at it' : ''}.`,
    `${name} understood the god wants: ${cleanInput(f.understood, 120)}. ${name} will ${WILL[f.stance]}.`,
    `Personality: ${cleanInput(f.ctx.descriptor, 80)}. Stage: ${f.ctx.stage}. Doing now: ${cleanInput(f.doing, 60)}. Biggest worry: ${f.ctx.lowestNeed}.`,
    `Recent words with the god: ${f.history.map((h) => cleanInput(h, 200)).join(' | ') || tIn(lang, 'cx.none')}`,
    ...(f.memories ? [`What ${name} knows that may help answer: ${f.memories.map((m) => cleanInput(m, 120)).join('; ') || tIn(lang, 'cx.none')}. Answer only from this.`] : []),
  ];
  return {
    system: `${systemPrompt(lang)}\n${lines.join('\n')}`, prompt: said || '…', maxTokens: 80, product: 'reply',
    facts: { lang, name, god, stance: f.stance, tone: f.tone, memories: f.memories },
  };
}

/** LLM god naming (§15.7): the name the shaman gave from the god's deeds and temper, made the village's own. */
export function godNamePrompt(template: string, deeds: string, temper: string, lang: Lang): LLMRequest {
  const prompt = [
    `The goblins call their god "${cleanInput(template)}" for now: what it does most is ${cleanInput(deeds)}, and it seems ${cleanInput(temper)}.`,
    'Invent the name the village will use for its god: two to four words with goblin flavor, like "the Sky Grub", "Old Apple-Above", "the Big Hand". Answer with the name only.',
  ].join('\n');
  return { system: systemPrompt(lang), prompt, maxTokens: 20, product: 'god_name', facts: { lang, template } };
}
