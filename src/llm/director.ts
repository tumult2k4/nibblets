/**
 * The LLM products in play (§19.4, P9.4): watches the sim's events and asks the scheduler for diaries (at dawn, for
 * the goblins with the best yesterday), dialogue (a chat between two goblins with something to say) and barks (a
 * fight won, a discovery, a hatchling, a friend's death). Answers go into `world.llm` and, for speech, to the
 * bubbles. Books, eulogies, the chronicle and the village's name (P9.5) are `CultureWriter`'s. A believer's diary,
 * or the diary of one who spoke with the god that day, tells of the god (P9.8). Only reads the world; the sim never
 * sees any of it.
 */
import './mocks';
import { CultureWriter, type CultureHooks } from './culture';
import { DivineVoice } from './voice';
import { CFG } from '../sim/config';
import type { ID, SimEvent, TextSource } from '../shared/types';
import type { Goblin, WorldState } from '../sim/state';
import type { Lang } from '../ui/i18n';
import type { EventLog } from './eventLog';
import { compactDay, lineFor, topOfDay } from './eventCompactor';
import { acceptFor, godFacts, goblinContext, relLabel } from './describe';
import { barkPrompt, dialoguePrompt, diaryPrompt, type BarkKind } from './prompts';
import { parseDialogue } from './sanitize';
import { Scheduler } from './scheduler';
import { addJournal, addSpeech } from './store';
import { llmSettings, makeProvider, onLlmSettings } from './settings';
import type { LLMProvider } from './provider';

const DAY = CFG.time.dayTicks, HOUR = DAY / 24, P = CFG.llm.products;
const BONDS = ['mate', 'best_friend', 'friend', 'parent', 'child', 'sibling'];
const BARK_PRIORITY: Record<BarkKind, number> = { grief: 12, hatch: 10, win: 9, discovery: 8 };

export type SpokenLine = { goblinId: ID; text: string };
export interface DirectorHooks {
  world: () => WorldState;
  lang: () => Lang;
  /** show speech over the goblins' heads */
  say?: (kind: 'dialogue' | 'bark', lines: SpokenLine[]) => void;
  onPause?: () => void;
  /** the village has named itself (P9.5) */
  named?: (name: string) => void;
  /** a model has named the god (P9.7) */
  godNamed?: (name: string) => void;
  /** a divine deed earned (P9.8: a book that speaks of the god) */
  deed?: CultureHooks['deed'];
  /** tests: a provider of their own instead of the settings' */
  provider?: () => LLMProvider;
}

export class LlmDirector {
  readonly sched: Scheduler;
  private readonly culture: CultureWriter;
  /** the Divine Voice (P9.7): the Voice panel speaks through it */
  readonly voice: DivineVoice;
  private cached: LLMProvider | null = null;

  constructor(private readonly log: EventLog, private readonly h: DirectorHooks) {
    onLlmSettings(() => (this.cached = null));
    this.sched = new Scheduler({
      settings: llmSettings, provider: () => this.provider(), tick: () => h.world().tick, ...(h.onPause ? { onPause: h.onPause } : {}),
    });
    this.voice = new DivineVoice(this.sched, h.world);
    this.culture = new CultureWriter(log, this.sched, {
      world: h.world, lang: h.lang, say: (id, text, source) => this.spoke('bark', [{ goblinId: id, text }], source), ...(h.named ? { named: h.named } : {}),
      ...(h.deed ? { deed: h.deed } : {}),
    });
  }

  private provider(): LLMProvider {
    return this.h.provider?.() ?? (this.cached ??= makeProvider(llmSettings()));
  }

  onEvents(evs: readonly SimEvent[]): void {
    if (!llmSettings().enabled) return;
    const s = this.h.world();
    for (const e of evs) {
      this.culture.onEvent(s, e);
      if (e.type === 'god_named') this.voice.nameGod(e, this.h.lang(), this.h.godNamed);
      if (e.type === 'day_started') this.diaries(s, e.day - 1);
      else if (e.type === 'chat') this.dialogue(s, e.aId, e.bId, e);
      else this.bark(s, e);
    }
  }

  frame(): void {
    this.sched.pump();
  }
  clear(): void {
    this.sched.clear();
  }

  private diaries(s: WorldState, day: number): void {
    if (day < 0) return;
    const lang = this.h.lang();
    for (const d of topOfDay(s, this.log, day, llmSettings().budgets.diaries, lang)) {
      const g = s.goblins.find((x) => x.id === d.goblinId);
      if (!g) continue;
      const req = diaryPrompt(goblinContext(s, g, lang), d.lines, lang, godFacts(s, g, lang, day));
      this.sched.enqueue({
        key: `diary:${g.id}:${day}`, product: 'diary', priority: d.score, req, accept: acceptFor(s, req, P.diaryChars),
        done: (text, source) => { const w = this.h.world(); addJournal(w, { kind: 'diary', goblinId: g.id, day, tick: w.tick, text, source }); },
      });
    }
  }

  private dialogue(s: WorldState, aId: ID, bId: ID, e: Extract<SimEvent, { type: 'chat' }>): void {
    const a = s.goblins.find((g) => g.id === aId), b = s.goblins.find((g) => g.id === bId);
    if (!a || !b) return;
    const lang = this.h.lang(), day = Math.floor(e.tick / DAY);
    const da = compactDay(s, this.log, a, day, lang), db = compactDay(s, this.log, b, day, lang);
    const feels = (x: Goblin, y: Goblin) => Math.abs(x.relationships.find((r) => r.targetId === y.id)?.opinion ?? 0) >= P.minOpinion;
    if (!(da.topScore >= P.minScore && db.topScore >= P.minScore) && !feels(a, b) && !feels(b, a)) return;
    const req = dialoguePrompt(
      { ctx: goblinContext(s, a, lang), sees: relLabel(a, b.id, lang), news: da.top },
      { ctx: goblinContext(s, b, lang), sees: relLabel(b, a.id, lang), news: db.top }, e.topic, lang);
    const names: [string, string] = [a.name, b.name], clean = acceptFor(s, req, P.lineChars, true);
    this.sched.enqueue({
      key: `dialogue:${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}:${day}`, product: 'dialogue', priority: da.topScore + db.topScore, req,
      expires: e.tick + P.dialogueStale,
      accept: (t) => { const c = clean(t); return c && parseDialogue(c, names).length >= 2 ? c : null; },
      done: (text, source) => this.spoke('dialogue', parseDialogue(text, names).map((l) => ({ goblinId: l.speaker ? b.id : a.id, text: l.text })), source),
    });
  }

  private bark(s: WorldState, e: SimEvent): void {
    const b = barkFor(s, e);
    if (!b) return;
    const lang = this.h.lang(), what = lineFor(s, b.g, e, lang);
    if (!what) return;
    const req = barkPrompt(goblinContext(s, b.g, lang), what, b.kind, lang);
    this.sched.enqueue({
      key: `bark:${b.g.id}`, product: 'bark', priority: BARK_PRIORITY[b.kind], req, cooldown: HOUR, expires: e.tick + P.barkStale,
      accept: acceptFor(s, req, P.barkChars), done: (text, source) => this.spoke('bark', [{ goblinId: b.g.id, text }], source),
    });
  }

  private spoke(kind: 'dialogue' | 'bark', lines: SpokenLine[], source: TextSource): void {
    if (!lines.length) return;
    addSpeech(this.h.world(), { kind, tick: this.h.world().tick, lines, source });
    this.h.say?.(kind, lines);
  }
}

/** Who calls out at an event, and why: the victor, the inventor, a parent of the hatchling, the dead one's dearest. */
export function barkFor(s: WorldState, e: SimEvent): { g: Goblin; kind: BarkKind } | null {
  const alive = (id: ID | null | undefined) => (id === null || id === undefined ? undefined : s.goblins.find((g) => g.id === id));
  let g: Goblin | undefined, kind: BarkKind;
  if (e.type === 'enemy_killed') { g = alive(e.killerId); kind = 'win'; }
  else if (e.type === 'recipe_discovered' && e.via === 'discovery') { g = alive(e.goblinId); kind = 'discovery'; }
  else if (e.type === 'egg_hatched') { g = (s.lineage[e.goblinId]?.parents ?? []).map(alive).find(Boolean); kind = 'hatch'; }
  else if (e.type === 'goblin_died') {
    g = s.goblins.filter((x) => x.relationships.some((r) => r.targetId === e.goblinId && BONDS.includes(r.bond)))
      .sort((x, y) => opinionOf(y, e.goblinId) - opinionOf(x, e.goblinId) || x.id - y.id)[0];
    kind = 'grief';
  } else return null;
  return g && g.lifeStage !== 'egg' && g.lifeStage !== 'hatchling' ? { g, kind } : null;
}

const opinionOf = (g: Goblin, id: ID): number => g.relationships.find((r) => r.targetId === id)?.opinion ?? 0;
