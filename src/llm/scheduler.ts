/**
 * The LLM request scheduler (§19.6, P9.3). Products hand it jobs; it never blocks the sim and drops what it cannot
 * afford without a word. Rules: one job per key (a diary per goblin and day, a dialogue per pair and day, a bark per
 * goblin and hour via `cooldown`); per in-game day a token budget and a count per product (the Voice has its own
 * sub-cap and goes first); a queue ranked by how interesting a job is, 16 long, stale jobs dropped; for real
 * providers 2 at a time and 10 a minute, a 20 s timeout and one retry. An answer the sanitizer refuses, or a
 * request that failed for good, gets the Mock's text instead; three failures in a row rest LLM mode for 10 in-game
 * minutes. The kill switch empties the queue. `clear()` on a new world drops everything still in flight.
 */
import { CFG } from '../sim/config';
import { LlmError, MockProvider, type LLMProvider, type LLMRequest, type LlmProduct } from './provider';
import type { Budgets, LlmSettings } from './settings';
import type { TextSource } from '../shared/types';

const DAY = CFG.time.dayTicks, S = CFG.llm.scheduler, QUEUE_MAX = 16, MINUTE_MS = 60_000;
const VOICE: ReadonlySet<LlmProduct> = new Set<LlmProduct>(['interpret', 'reply']);
const COUNTED: Partial<Record<LlmProduct, keyof Budgets>> = { diary: 'diaries', dialogue: 'dialogues', bark: 'barks', book: 'books' };

export interface Job {
  /** one job per key while its cooldown lasts (keys carry their day where the rule is "per day") */
  key: string;
  product: LlmProduct;
  /** interestingness: higher goes first (the Voice always goes first) */
  priority: number;
  req: LLMRequest;
  /** the tick after which the text is no use any more (a bark after its moment) */
  expires?: number;
  /** ticks before the same key may be asked again; default: never */
  cooldown?: number;
  /** make an answer fit to show; null refuses it and the Mock's text is used */
  accept: (text: string) => string | null;
  done: (text: string, source: TextSource) => void;
}

export interface SchedulerDeps {
  settings: () => LlmSettings;
  provider: () => LLMProvider;
  /** the in-game tick: budgets are per in-game day, the rest after errors is in in-game time */
  tick: () => number;
  /** real milliseconds, for the rate limit */
  now?: () => number;
  onPause?: () => void;
  timers?: { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void };
}

export interface SchedulerStats {
  day: number; tokens: number; voiceTokens: number; counts: Partial<Record<LlmProduct, number>>;
  queued: number; running: number; pausedUntil: number; done: number; mock: number; dropped: number; failed: number;
}

/** Tokens a request may cost: the prompt (about four characters a token) and the most it may answer. */
export const estimate = (r: LLMRequest): number => Math.ceil((r.system.length + r.prompt.length) / 4) + r.maxTokens;

export class Scheduler {
  private queue: Job[] = [];
  private running = 0;
  private starts: number[] = [];
  private keys = new Map<string, { tick: number; cooldown: number }>();
  private day = -1;
  private tokens = 0;
  private voiceTokens = 0;
  private counts: Partial<Record<LlmProduct, number>> = {};
  private errors = 0;
  private pausedUntil = -Infinity;
  private gen = 0;
  private aborts = new Set<AbortController>();
  private readonly tally = { done: 0, mock: 0, dropped: 0, failed: 0 };
  private readonly mock = new MockProvider();
  private readonly now: () => number;
  private readonly timers: NonNullable<SchedulerDeps['timers']>;

  constructor(private readonly deps: SchedulerDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.timers = deps.timers ?? { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  }

  /** Offer a job. False: LLM mode is off, the key is cooling down, or the day's budget has no room for it. */
  enqueue(job: Job): boolean {
    const st = this.deps.settings();
    if (!st.enabled) return false;
    this.rollDay();
    const t = this.deps.tick(), last = this.keys.get(job.key);
    if (last && t - last.tick < last.cooldown) return false;
    if (!this.affordable(job, st, true)) return this.drop();
    this.keys.set(job.key, { tick: t, cooldown: job.cooldown ?? Infinity });
    this.queue.push(job);
    this.queue.sort((a, b) => rank(b) - rank(a));
    while (this.queue.length > QUEUE_MAX) { this.queue.pop(); this.tally.dropped++; }
    this.pump();
    return true;
  }

  /** Start what may start now. Call it now and then (the app does, every frame). */
  pump(): void {
    const st = this.deps.settings();
    if (!st.enabled) { this.tally.dropped += this.queue.length; this.queue = []; return; }
    this.rollDay();
    const t = this.deps.tick(), now = this.now();
    if (t < this.pausedUntil) return;
    const provider = this.deps.provider(), local = provider.name === 'mock';
    this.starts = this.starts.filter((x) => now - x < MINUTE_MS);
    while (this.queue.length) {
      if (!local && (this.running >= S.concurrency || this.starts.length >= S.perMinute)) return;
      const job = this.queue.shift()!;
      if ((job.expires !== undefined && t > job.expires) || !this.affordable(job, st, false)) { this.drop(); continue; }
      const cost = estimate(job.req);
      this.tokens += cost;
      if (VOICE.has(job.product)) this.voiceTokens += cost;
      else this.counts[job.product] = (this.counts[job.product] ?? 0) + 1;
      if (!local) this.starts.push(now);
      void this.run(job, provider, this.gen);
    }
  }

  /** A new world: forget everything, and ignore answers still on their way. */
  clear(): void {
    this.gen++;
    for (const a of this.aborts) a.abort();
    this.aborts.clear();
    this.queue = [];
    this.keys.clear();
    this.day = -1;
    this.errors = 0;
    this.pausedUntil = -Infinity;
  }

  stats(): SchedulerStats {
    return { day: this.day, tokens: this.tokens, voiceTokens: this.voiceTokens, counts: { ...this.counts }, queued: this.queue.length, running: this.running, pausedUntil: this.pausedUntil, ...this.tally };
  }

  private drop(): false {
    this.tally.dropped++;
    return false;
  }

  private rollDay(): void {
    const t = this.deps.tick(), d = Math.floor(t / DAY);
    if (d === this.day) return;
    this.day = d;
    this.tokens = this.voiceTokens = 0;
    this.counts = {};
    for (const [k, v] of this.keys) if (t - v.tick >= Math.min(v.cooldown, 2 * DAY)) this.keys.delete(k);
  }

  /** Room in today's budget? With `queued`, jobs of its kind already waiting count too. */
  private affordable(job: Job, st: LlmSettings, queued: boolean): boolean {
    const cost = estimate(job.req);
    if (VOICE.has(job.product)) return this.voiceTokens + cost <= st.budgets.voiceTokens;
    if (this.tokens + cost > st.budgets.tokensPerDay) return false;
    const k = COUNTED[job.product];
    if (!k) return true;
    const waiting = queued ? this.queue.filter((j) => j.product === job.product).length : 0;
    return (this.counts[job.product] ?? 0) + waiting < st.budgets[k];
  }

  private async run(job: Job, provider: LLMProvider, gen: number): Promise<void> {
    this.running++;
    let text: string | null = null, failed = false;
    try {
      for (let attempt = 0; attempt <= S.retries; attempt++) {
        try {
          text = job.accept(await this.ask(provider, job.req));
          this.errors = 0;
          failed = false;
          break;
        } catch {
          failed = true;
        }
      }
    } finally {
      this.running--;
    }
    if (gen !== this.gen) return;
    if (failed) this.fail();
    if (text !== null) {
      this.tally.done++;
      job.done(text, provider.name === 'mock' ? 'mock' : 'llm');
    } else {
      const m = await this.mock.complete(job.req);
      if (gen !== this.gen) return;
      this.tally.mock++;
      job.done(job.accept(m) ?? m.trim(), 'mock');
    }
    this.pump();
  }

  private ask(p: LLMProvider, req: LLMRequest): Promise<string> {
    const ac = new AbortController();
    this.aborts.add(ac);
    return new Promise<string>((resolve, reject) => {
      const h = this.timers.set(() => { ac.abort(); reject(new LlmError('timeout')); }, S.timeoutMs);
      p.complete(req, ac.signal).then(resolve, reject).finally(() => {
        this.timers.clear(h);
        this.aborts.delete(ac);
      });
    });
  }

  private fail(): void {
    this.tally.failed++;
    if (++this.errors < S.pauseAfter) return;
    this.errors = 0;
    this.pausedUntil = this.deps.tick() + S.pauseTicks;
    this.deps.onPause?.();
  }
}

const rank = (j: Job): number => (VOICE.has(j.product) ? 1e6 : 0) + j.priority;
