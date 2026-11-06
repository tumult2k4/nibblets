/**
 * The Divine Voice at work (§17.7.2, P9.7). The god's words go to the interpreter (the Voice's own token sub-cap,
 * ahead of every other request); its checked answer within 10 s, or else what the keyword parser makes of the words,
 * becomes the `divine_speech` command, which the command log freezes, so a replay never asks again. Intents the world
 * cannot take are dropped first (a target it does not know, an item it cannot gather), or kept without the target.
 * After the god has spoken, one to three hearers answer in character from what they understood and will do, their
 * last words with the god and, for a question, what they remember; every goblin's last 30 exchanges are kept. In LLM
 * mode the god's shaman-given name is also made the village's own.
 */
import './mocksVoice';
import { CFG } from '../sim/config';
import { speechProblem } from '../sim/god/speech';
import type { Command } from '../sim/commands';
import type { ID, ParsedIntent, SimEvent, TextSource, Tone, Vec2 } from '../shared/types';
import type { Goblin, WorldState } from '../sim/state';
import type { World } from '../sim/world';
import { tIn, type Lang } from '../ui/i18n';
import { parseFallback } from './intentFallback';
import { godNamePrompt, interpretPrompt, memoriesOf, replyPrompt, stanceOf, toIntents, validateInterpretation, voiceRefs } from './godVoice';
import { acceptFor, goblinContext } from './describe';
import { villageNameOf } from './culture';
import type { Scheduler } from './scheduler';
import { llmOf } from './store';

const DEADLINE_MS = 10_000, TALK = 30, HISTORY = 6, REPLY_CHARS = 180, KEEP_WORDS = 200;
const TARGET_PROBLEMS = new Set(['bad_target', 'missing_entity', 'unknown_recipe', 'unknown_intent', 'too_many']);
const DEEDS: Record<string, string> = { hand: 'picking goblins up and setting them down', giver: 'giving food and gifts', sky: 'changing the weather', storm: 'lightning and other wrath', light: 'visions and wonders' };
const TEMPER: Record<string, string> = { kind: 'kind', great: 'mighty', dread: 'fearsome' };

export type SpeechCommand = Extract<Command, { type: 'divine_speech' }>;
/** What the god said, as the command to push, and whether a language model or the keywords understood it. */
export interface Heard { cmd: SpeechCommand; how: 'llm' | 'keywords'; text: string }
type Timers = { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void };

export class DivineVoice {
  private n = 0;
  constructor(private readonly sched: Scheduler, private readonly world: () => WorldState,
    private readonly timers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }) {}

  /** Understand the god's words and hand back the command to push, once. */
  speak(w: World, text: string, to: ID[] | 'all', here: Vec2 | null, lang: Lang, done: (h: Heard) => void): void {
    const refs = voiceRefs(w, lang, to), req = interpretPrompt(text, refs, lang), key = `v${w.s.tick}.${this.n++}`;
    const said = llmOf(w.s).speechText;
    said[key] = req.prompt;
    for (const k of Object.keys(said).slice(0, -KEEP_WORDS)) delete said[k]; // the last 200 utterances
    let settled = false, timer: unknown = null;
    const finish = (raw: string | null, source: TextSource | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) this.timers.clear(timer);
      const checked = raw !== null ? validateInterpretation(raw, refs) : null, sp = checked ?? parseFallback(req.prompt, refs);
      const intents = fit(w, to, sp.tone, toIntents(sp, refs, here), sp.isQuestion);
      done({
        cmd: { type: 'divine_speech', addressees: to, tone: sp.tone, intents, isQuestion: sp.isQuestion, source: 'voice', textRef: key },
        how: checked && source === 'llm' ? 'llm' : 'keywords', text: req.prompt,
      });
    };
    timer = this.timers.set(() => finish(null, null), DEADLINE_MS);
    const queued = this.sched.enqueue({
      key: `interpret:${key}`, product: 'interpret', priority: 100, req, accept: (t) => (validateInterpretation(t, refs) ? t : null), done: (t, source) => finish(t, source),
    });
    if (!queued) finish(null, null);
  }

  /** Hearers answer (the speakers chosen by the caller), each line handed to `said` as it comes. */
  reply(e: Extract<SimEvent, { type: 'god_spoke' }>, speakers: readonly Goblin[], god: string, lang: Lang,
    said: (g: Goblin, text: string, source: TextSource, defied: boolean, i: number) => void): void {
    const s = this.world(), words = e.textRef ? llmOf(s).speechText[e.textRef] ?? '' : '';
    const understood = e.intents.length ? e.intents.map((x) => tIn(lang, `intent.${x}`)).join(', ') : tIn(lang, 'cx.none');
    speakers.forEach((g, i) => {
      const stance = stanceOf(g, e.tick, e.intents.length), talk = (llmOf(s).godTalk ??= {})[g.id] ?? [];
      const req = replyPrompt({
        ctx: goblinContext(s, g, lang), god, faith: g.godView.faith, love: g.godView.love, fear: g.godView.fear, angry: g.godView.angryAtGod, understood,
        stance, tone: e.tone, doing: tIn(lang, `act.${g.activity.action}`), history: talk.slice(-HISTORY).map((x) => `${god}: ${x.god} / ${g.name}: ${x.reply}`),
        memories: e.isQuestion ? memoriesOf(s, g, lang) : null, said: words || `(${understood})`,
      }, lang);
      this.sched.enqueue({
        key: `reply:${g.id}:${e.tick}`, product: 'reply', priority: 50 - i, req, accept: acceptFor(s, req, REPLY_CHARS),
        done: (text, source) => {
          const all = ((llmOf(this.world()).godTalk ??= {})[g.id] ??= []);
          all.push({ tick: e.tick, god: words || `(${understood})`, reply: text });
          if (all.length > TALK) all.splice(0, all.length - TALK);
          said(g, text, source, stance === 'defy', i);
        },
      });
    });
  }

  /** The shaman named the god (`@family.temper`): in LLM mode a model makes the name the village's own. */
  nameGod(e: Extract<SimEvent, { type: 'god_named' }>, lang: Lang, named?: (name: string) => void): void {
    const s = this.world(), [family = 'giver', temper = 'great'] = e.name.replace(/^@/, '').split('.');
    if (llmOf(s).godName || !e.name.startsWith('@')) return;
    const template = tIn(lang, `godname.${family}.${temper}`), req = godNamePrompt(template, DEEDS[family] ?? family, TEMPER[temper] ?? temper, lang);
    this.sched.enqueue({
      key: 'god_name', product: 'god_name', priority: 14, req, accept: (t) => villageNameOf(t, [], 4, 32),
      done: (name, source) => {
        const l = llmOf(this.world());
        if (source !== 'llm' || l.godName) return; // the Mock keeps the shaman's name, worded in whatever language is shown
        l.godName = { name, source, tick: this.world().tick };
        named?.(name);
      },
    });
  }
}

/** Keep what the world can take: an intent whose target it does not know is kept without it, or dropped. */
function fit(w: World, to: ID[] | 'all', tone: Tone, intents: ParsedIntent[], isQuestion: boolean): ParsedIntent[] {
  const ok = (x: ParsedIntent): boolean => !TARGET_PROBLEMS.has(speechProblem(w, { addressees: to, tone, intents: [x], isQuestion, source: 'voice' }) ?? '');
  const out: ParsedIntent[] = [];
  for (const x of intents) {
    if (ok(x)) out.push(x);
    else if (x.target && x.intent !== 'come_here' && x.intent !== 'avoid' && ok({ intent: x.intent })) out.push({ intent: x.intent });
  }
  return out.slice(0, CFG.divine.maxIntents);
}
