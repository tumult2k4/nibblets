import { afterEach, describe, expect, it } from 'vitest';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import { CFG } from '../../sim/config';
import { registerLineage } from '../../sim/goblin/family';
import { EventLog } from '../eventLog';
import { LlmDirector } from '../director';
import { faithWords, godFacts, godNameIn, mentionsGod } from '../describe';
import { journalsOf, llmOf } from '../store';
import { DEFAULT_LLM, setLlmSettings } from '../settings';
import { deeds, earnDeed, resetDeedsCache } from '../../ui/deeds';
import type { World } from '../../sim/world';
import type { SimEventInput } from '../../shared/types';

const DAY = CFG.time.dayTicks, SEASON = CFG.time.daysPerSeason;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const settle = () => new Promise((r) => setTimeout(r, 0));

function rig(w: World) {
  const log = new EventLog(), deedsGot: { id: string; name: string; title: string }[] = [];
  const d = new LlmDirector(log, { world: () => w.s, lang: () => 'en', deed: (id, n) => deedsGot.push({ id, ...n }) });
  const emit = (e: SimEventInput) => { w.emit(e); const evs = w.bus.flush(); log.record(evs, w.s); d.onEvents(evs); };
  return { d, emit, deedsGot };
}

function village() {
  const w = makeWorld({ size: 40 }), saint = spawnGoblin(w, { pos: { x: 20, y: 20 }, ageDays: 90 }), doubter = spawnGoblin(w, { pos: { x: 24, y: 20 } });
  saint.lifeStage = 'elder';
  saint.godView.faith = 90;
  saint.godView.love = 70;
  doubter.godView.faith = 5;
  for (const g of [saint, doubter]) registerLineage(w.s, g);
  w.s.god.godName = '@giver.kind';
  return { w, saint, doubter };
}

afterEach(() => setLlmSettings({ ...DEFAULT_LLM, budgets: { ...DEFAULT_LLM.budgets } }));

describe('the god in the stories (P9.8)', () => {
  it('a goblin knows the god by its name and its own faith; only believers and those it spoke with tell of it', () => {
    const { w, saint, doubter } = village(), god = godNameIn(w.s, 'en');
    expect(god).not.toBe('');
    expect(faithWords(saint, 'en')).toBe('devout, loves the god');
    expect(faithWords(doubter, 'de')).toBe('zweifelt');
    expect(godFacts(w.s, doubter, 'en', 0)).toBeNull();
    (llmOf(w.s).godTalk ??= {})[doubter.id] = [{ tick: 100, god: 'Eat!', reply: 'No.' }, { tick: DAY + 5, god: 'Sleep!', reply: 'Hm.' }];
    expect(godFacts(w.s, doubter, 'en', 0)).toEqual({ name: god, view: 'doubts', talk: [`${god}: Eat! / ${doubter.name}: No.`] });
    llmOf(w.s).godName = { name: 'Applemother', source: 'llm', tick: 1 };
    expect(godNameIn(w.s, 'de')).toBe('Applemother');
    w.s.god.godName = null;
    delete llmOf(w.s).godName;
    expect(godNameIn(w.s, 'en')).toBe('the Big Sky');
    expect(mentionsGod('Thank you, the big sky!', 'the Big Sky')).toBe(true);
    expect(mentionsGod('Danke an die Götter.', 'X')).toBe(true);
    expect(mentionsGod('Godrick and the Gottlieb stone.', 'Applemother')).toBe(false);
  });

  it("a believer's book thanks the god and earns 'A Book About You', once; a doubter's book does not", async () => {
    const { w, saint, doubter } = village(), r = rig(w), god = godNameIn(w.s, 'en');
    r.emit({ type: 'book_written', goblinId: doubter.id, bookId: 1, contents: ['club'], at: { x: 24, y: 20 } });
    await settle();
    expect(journalsOf(w.s, null, 'book')[0]!.text).not.toContain(god);
    expect(r.deedsGot).toEqual([]);
    r.emit({ type: 'book_written', goblinId: saint.id, bookId: 2, contents: ['club'], at: { x: 20, y: 20 } });
    await settle();
    const page = journalsOf(w.s, saint.id, 'book')[0]!;
    expect(page.text).toContain(`${cap(god)} gave us this knowing. Praise be to ${god}!`);
    expect(r.deedsGot).toEqual([{ id: 'book_about_you', name: saint.name, title: page.title }]);
    resetDeedsCache();
    expect(earnDeed('book_about_you', 'test')).toBe(true);
    expect(earnDeed('book_about_you', 'again')).toBe(false);
    expect(deeds().book_about_you).toMatchObject({ how: 'test' });
    resetDeedsCache();
  });

  it("a believer's diary tells of the god and of their words that day", async () => {
    const { w, saint } = village(), r = rig(w), god = godNameIn(w.s, 'en');
    w.s.tick = 2000;
    r.emit({ type: 'prayer', prayerId: 1, goblinId: saint.id, kind: 'food' });
    r.emit({ type: 'god_spoke', addressees: [saint.id], tone: 'kind', intents: [], source: 'voice' });
    (llmOf(w.s).godTalk ??= {})[saint.id] = [{ tick: 2000, god: 'Be good.', reply: 'Yes, yes!' }];
    w.s.tick = DAY;
    r.emit({ type: 'day_started', day: 1 });
    await settle();
    const [diary] = journalsOf(w.s, saint.id, 'diary');
    expect(diary!.text).toContain(`${cap(god)} spoke to me today! I will remember it.`);
  });

  it("the chronicle tells the god's season: its wonders, the prayers heard, its words", async () => {
    const { w, saint, doubter } = village(), r = rig(w), god = godNameIn(w.s, 'en');
    w.s.tick = 2 * DAY;
    r.emit({ type: 'prayer', prayerId: 1, goblinId: saint.id, kind: 'food' });
    r.emit({ type: 'prayer', prayerId: 2, goblinId: doubter.id, kind: 'rain' });
    r.emit({ type: 'prayer_answered', prayerId: 1, goblinId: saint.id, kind: 'food' });
    r.emit({ type: 'divine_act', act: 'gift', targetId: saint.id, witnessIds: [] });
    llmOf(w.s).speechText['v1.0'] = 'Build a hut by the pond.';
    r.emit({ type: 'god_spoke', addressees: [saint.id], tone: 'kind', intents: [], source: 'voice', textRef: 'v1.0' });
    w.s.tick = SEASON * DAY;
    r.emit({ type: 'day_started', day: SEASON });
    await settle();
    const [ch] = journalsOf(w.s, null, 'chronicle');
    const G = cap(god);
    expect(ch!.text).toContain(`${G} worked a wonder among us. We prayed 2 times, and one prayer was answered. ${G} spoke to us once. ${G} said: “Build a hut by the pond.”`);
  });
});
