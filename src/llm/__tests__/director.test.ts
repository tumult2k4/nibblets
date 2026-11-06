import { afterEach, describe, expect, it } from 'vitest';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import { CFG } from '../../sim/config';
import { stateHash } from '../../sim/save';
import { registerLineage } from '../../sim/goblin/family';
import { EventLog } from '../eventLog';
import { LlmDirector, type SpokenLine } from '../director';
import { journalsOf, llmOf } from '../store';
import { DEFAULT_LLM, setLlmSettings } from '../settings';
import type { World } from '../../sim/world';
import type { SimEventInput } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const settle = () => new Promise((r) => setTimeout(r, 0));

function rig(w: World) {
  const log = new EventLog(), said: { kind: string; lines: SpokenLine[] }[] = [];
  const d = new LlmDirector(log, { world: () => w.s, lang: () => 'en', say: (kind, lines) => said.push({ kind, lines }) });
  const feed = (evs: ReturnType<World['step']>) => { log.record(evs, w.s); d.onEvents(evs); };
  const emit = (e: SimEventInput) => { w.emit(e); feed(w.bus.flush()); };
  return { log, d, said, feed, emit };
}

afterEach(() => setLlmSettings({ ...DEFAULT_LLM, budgets: { ...DEFAULT_LLM.budgets } }));

describe('LLM products in play (§19.4, P9.4)', () => {
  it('at dawn the goblins with the best day get diaries, kept outside the hash: the sim runs the same with LLM mode on or off', async () => {
    const on = makeWorld({ seed: 5, size: 48, goblins: 8, flat: false }), off = makeWorld({ seed: 5, size: 48, goblins: 8, flat: false });
    const r = rig(on);
    for (let i = 0; i < DAY + 20; i++) { r.feed(on.step()); off.step(); if (i % 200 === 0) await settle(); }
    await settle();
    const diaries = journalsOf(on.s, null, 'diary');
    expect(diaries.length).toBeGreaterThanOrEqual(1);
    expect(diaries.length).toBeLessThanOrEqual(DEFAULT_LLM.budgets.diaries);
    for (const j of diaries) {
      expect(j).toMatchObject({ day: 0, source: 'mock' });
      expect(j.text.length).toBeGreaterThan(30);
      expect(j.text).not.toMatch(/\{|\}|cx\./);
    }
    expect(stateHash(on.s)).toBe(stateHash(off.s));
    expect(journalsOf(off.s, null)).toHaveLength(0);
  });

  it('a won fight barks once an hour, a chat between friends becomes dialogue, a death grieves the dearest', async () => {
    const w = makeWorld({ size: 40 });
    const me = spawnGoblin(w, { pos: { x: 20, y: 20 } }), pal = spawnGoblin(w, { pos: { x: 21, y: 20 } }), kin = spawnGoblin(w, { pos: { x: 22, y: 21 } });
    for (const g of [me, pal, kin]) registerLineage(w.s, g);
    me.relationships.push({ targetId: pal.id, opinion: 70, familiarity: 50, bond: 'best_friend', lastInteraction: 0 });
    kin.relationships.push({ targetId: pal.id, opinion: 40, familiarity: 50, bond: 'sibling', lastInteraction: 0 });
    const r = rig(w);
    r.emit({ type: 'enemy_killed', enemyId: 99, kind: 'gnasher', killerId: me.id, at: { x: 20, y: 21 } });
    r.emit({ type: 'enemy_killed', enemyId: 98, kind: 'gnasher', killerId: me.id, at: { x: 20, y: 21 } });
    await settle();
    expect(r.said).toHaveLength(1);
    expect(r.said[0]).toMatchObject({ kind: 'bark', lines: [{ goblinId: me.id }] });
    r.emit({ type: 'chat', aId: me.id, bId: pal.id, topic: 'danger' });
    await settle();
    const talk = r.said[1]!;
    expect(talk.kind).toBe('dialogue');
    expect(talk.lines.length).toBeGreaterThanOrEqual(2);
    expect(new Set(talk.lines.map((l) => l.goblinId))).toEqual(new Set([me.id, pal.id]));
    w.s.goblins = w.s.goblins.filter((g) => g.id !== pal.id);
    w.s.tick += DAY / 24; // the victor's bark has cooled down
    r.emit({ type: 'goblin_died', goblinId: pal.id, cause: 'combat', at: { x: 21, y: 20 } });
    await settle();
    expect(r.said[2]).toMatchObject({ kind: 'bark', lines: [{ goblinId: me.id }] });
    expect(llmOf(w.s).speech.map((x) => x.kind)).toEqual(['bark', 'dialogue', 'bark']);
  });

  it('the kill switch asks for nothing', async () => {
    setLlmSettings({ ...DEFAULT_LLM, enabled: false, budgets: { ...DEFAULT_LLM.budgets } });
    const w = makeWorld({ size: 40 });
    const me = spawnGoblin(w);
    const r = rig(w);
    r.emit({ type: 'enemy_killed', enemyId: 99, kind: 'gnasher', killerId: me.id, at: { x: 20, y: 21 } });
    await settle();
    expect(r.said).toEqual([]);
    expect(r.d.sched.stats().queued + r.d.sched.stats().done).toBe(0);
  });
});
