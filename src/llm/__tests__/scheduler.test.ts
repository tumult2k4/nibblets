import { describe, expect, it } from 'vitest';
import { CFG } from '../../sim/config';
import { Scheduler, type Job } from '../scheduler';
import { DEFAULT_LLM, type LlmSettings } from '../settings';
import type { LLMProvider, LLMRequest, LlmProduct } from '../provider';
import type { TextSource } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = DAY / 24;
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A provider whose answers the test hands out by hand. */
function manual(name = 'fake') {
  const calls: { req: LLMRequest; resolve: (s: string) => void; reject: (e: Error) => void }[] = [];
  const p: LLMProvider = { name, complete: (req) => new Promise((resolve, reject) => calls.push({ req, resolve, reject })) };
  return { p, calls };
}

function rig(provider: LLMProvider, over: Partial<LlmSettings> = {}) {
  const env = { tick: 0, now: 0, settings: { ...DEFAULT_LLM, budgets: { ...DEFAULT_LLM.budgets }, ...over }, pauses: 0 };
  const timers: { f: () => void; ms: number; live: boolean }[] = [];
  const sch = new Scheduler({
    settings: () => env.settings, provider: () => provider, tick: () => env.tick, now: () => env.now, onPause: () => env.pauses++,
    timers: { set: (f, ms) => { const h = { f, ms, live: true }; timers.push(h); return h; }, clear: (h) => ((h as { live: boolean }).live = false) },
  });
  const fireTimers = () => { for (const h of timers.splice(0)) if (h.live) h.f(); };
  const got: { key: string; text: string; source: TextSource }[] = [];
  const job = (key: string, product: LlmProduct = 'bark', priority = 1, o: Partial<Job> = {}): Job => ({
    key, product, priority, req: { system: 'S', prompt: `P ${key}`, maxTokens: 10, product, facts: { lang: 'en' } },
    accept: (t) => t.trim() || null, done: (text, source) => got.push({ key, text, source }), ...o,
  });
  return { env, sch, got, job, fireTimers };
}

describe('LLM scheduler (§19.6, P9.3)', () => {
  it('one job per key, and no more of a product a day than its budget; the next day starts afresh', async () => {
    const { sch, got, job, env } = rig({ name: 'mock', complete: async (r) => `text for ${r.prompt}` });
    expect(sch.enqueue(job('diary:1:0', 'diary'))).toBe(true);
    expect(sch.enqueue(job('diary:1:0', 'diary'))).toBe(false);
    for (const g of [2, 3, 4, 5]) sch.enqueue(job(`diary:${g}:0`, 'diary'));
    await settle();
    expect(got.map((g) => g.key)).toEqual(['diary:1:0', 'diary:2:0', 'diary:3:0']);
    expect(got[0]).toEqual({ key: 'diary:1:0', text: 'text for P diary:1:0', source: 'mock' });
    env.tick = DAY + 5;
    expect(sch.enqueue(job('diary:4:1', 'diary'))).toBe(true);
    expect(sch.stats().counts.diary).toBe(1);
  });

  it('a bark cools down for an hour per goblin; a stale job is dropped', async () => {
    const { sch, got, job, env } = rig({ name: 'mock', complete: async () => 'Hoo!' });
    expect(sch.enqueue(job('bark:7', 'bark', 1, { cooldown: HOUR }))).toBe(true);
    env.tick = HOUR - 1;
    expect(sch.enqueue(job('bark:7', 'bark', 1, { cooldown: HOUR }))).toBe(false);
    env.tick = HOUR;
    expect(sch.enqueue(job('bark:7', 'bark', 1, { cooldown: HOUR }))).toBe(true);
    await settle();
    expect(got).toHaveLength(2);
    const slow = manual(), r = rig(slow.p);
    r.sch.enqueue(r.job('a')); r.sch.enqueue(r.job('b')); r.sch.enqueue(r.job('late', 'bark', 9, { expires: 10 }));
    r.env.tick = 11;
    slow.calls[0]!.resolve('x');
    await settle();
    expect(slow.calls.map((c) => c.req.prompt)).toEqual(['P a', 'P b']);
    expect(r.sch.stats().dropped).toBe(1);
  });

  it('real providers: two at a time, the most interesting first, ten a minute', async () => {
    const m = manual(), { sch, job, env } = rig(m.p);
    sch.enqueue(job('a', 'eulogy', 1)); sch.enqueue(job('b', 'eulogy', 1));
    sch.enqueue(job('low', 'eulogy', 1)); sch.enqueue(job('high', 'eulogy', 5)); sch.enqueue(job('mid', 'eulogy', 3));
    expect(m.calls).toHaveLength(2);
    m.calls[0]!.resolve('one');
    await settle();
    m.calls[1]!.resolve('two');
    await settle();
    expect(m.calls.slice(2).map((c) => c.req.prompt)).toEqual(['P high', 'P mid']);
    for (let i = 0; i < 9; i++) sch.enqueue(job(`e${i}`, 'eulogy', 1));
    for (let n = 0; n < 12; n++) { m.calls.forEach((c) => c.resolve('ok')); await settle(); }
    expect(m.calls).toHaveLength(10);
    env.now = 61_000;
    sch.pump();
    for (let n = 0; n < 4; n++) { m.calls.forEach((c) => c.resolve('ok')); await settle(); }
    expect(m.calls).toHaveLength(14);
  });

  it('a timeout is retried once, then the Mock answers; three failures in a row rest LLM mode for 10 in-game minutes', async () => {
    const m = manual(), { sch, got, job, env, fireTimers } = rig(m.p);
    sch.enqueue(job('a', 'eulogy'));
    fireTimers(); await settle();
    expect(m.calls).toHaveLength(2);
    fireTimers(); await settle();
    expect(got).toEqual([{ key: 'a', text: expect.any(String), source: 'mock' }]);
    for (const k of ['b', 'c']) { sch.enqueue(job(k, 'eulogy')); fireTimers(); await settle(); fireTimers(); await settle(); }
    expect(env.pauses).toBe(1);
    expect(sch.stats().pausedUntil).toBe(CFG.llm.scheduler.pauseTicks);
    const before = m.calls.length;
    sch.enqueue(job('d', 'eulogy'));
    expect(m.calls).toHaveLength(before);
    env.tick = CFG.llm.scheduler.pauseTicks;
    sch.pump();
    expect(m.calls).toHaveLength(before + 1);
  });

  it("an answer the sanitizer refuses gets the Mock's text, without counting as a failure", async () => {
    const m = manual(), { sch, got, job } = rig(m.p);
    sch.enqueue(job('a', 'bark', 1, { accept: (t) => (t.includes('Zork') ? null : t) }));
    m.calls[0]!.resolve('Zork says hi');
    await settle();
    expect(got[0]!.source).toBe('mock');
    expect(got[0]!.text).not.toContain('Zork');
    expect(sch.stats().failed).toBe(0);
  });

  it('the kill switch drops everything; a new world ignores answers still on their way', async () => {
    const m = manual(), { sch, got, job, env } = rig(m.p);
    sch.enqueue(job('a', 'eulogy')); sch.enqueue(job('b', 'eulogy')); sch.enqueue(job('c', 'eulogy'));
    sch.clear();
    m.calls[0]!.resolve('late');
    await settle();
    expect(got).toEqual([]);
    sch.enqueue(job('d', 'eulogy'));
    env.settings.enabled = false;
    sch.pump();
    expect(sch.stats().queued).toBe(0);
    expect(sch.enqueue(job('e', 'eulogy'))).toBe(false);
  });

  it("the day's tokens run out for stories but not for the Voice, which also goes first", async () => {
    const m = manual();
    const { sch, job } = rig(m.p, { budgets: { ...DEFAULT_LLM.budgets, tokensPerDay: 60, voiceTokens: 30 } });
    for (const k of ['a', 'b', 'c', 'd']) expect(sch.enqueue(job(k, 'eulogy'))).toBe(true);
    expect(sch.enqueue(job('v', 'interpret'))).toBe(true);
    for (let i = 0; i < 3; i++) { m.calls[i]!.resolve('x'); await settle(); }
    expect(m.calls.map((c) => c.req.prompt)).toEqual(['P a', 'P b', 'P v', 'P c', 'P d']);
    expect(sch.enqueue(job('e', 'eulogy'))).toBe(false);
    expect(sch.enqueue(job('v2', 'reply'))).toBe(true);
    m.calls[3]!.resolve('x'); await settle();
    expect(sch.stats().voiceTokens).toBe(11 + 12);
  });
});
