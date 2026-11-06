import { afterEach, describe, expect, it } from 'vitest';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import { CFG } from '../../sim/config';
import { createWorld, createWorldState } from '../../sim/newWorld';
import { replayTo, stateHash } from '../../sim/save';
import { World } from '../../sim/world';
import { dist } from '../../shared/math';
import { registerLineage } from '../../sim/goblin/family';
import { parseFallback, type VoiceRef } from '../intentFallback';
import { memoriesOf, toIntents, validateInterpretation, voiceRefs } from '../godVoice';
import { EventLog } from '../eventLog';
import { LlmDirector } from '../director';
import { DivineVoice, type Heard } from '../voice';
import { Scheduler } from '../scheduler';
import { llmOf } from '../store';
import { DEFAULT_LLM, llmSettings, setLlmSettings } from '../settings';
import type { LLMProvider, LLMRequest } from '../provider';
import type { Place } from '../../sim/places';
import type { SimEvent } from '../../shared/types';

const settle = () => new Promise((r) => setTimeout(r, 0));
const REFS: VoiceRef[] = [
  { ref: 'building:hut', label: 'Hut', kind: 'building', value: 'hut', words: ['hut', 'hütte'] },
  { ref: 'item:wood', label: 'Wood', kind: 'item', value: 'wood', words: ['wood', 'holz'] },
  { ref: 'item:apple', label: 'Apple', kind: 'item', value: 'apple', words: ['apple', 'apfel', 'apples', 'äpfel'] },
  { ref: 'goblin#7', label: 'Fizz', kind: 'goblin', value: 7, words: ['fizz'] },
  { ref: 'place#3', label: 'Sad Pond', kind: 'place', value: 3, pos: { x: 30, y: 12 }, words: ['sad pond', 'trauerteich', 'pond', 'teich'] },
];
const fake = (answer: (r: LLMRequest) => string | Promise<string>, seen: LLMRequest[] = []): LLMProvider => ({ name: 'fake', complete: async (r) => { seen.push(r); return answer(r); } });

afterEach(() => setLlmSettings({ ...DEFAULT_LLM, budgets: { ...DEFAULT_LLM.budgets } }));

describe('the keyword parser (§17.7.2, P9.7)', () => {
  it('reads intents, targets, tone and questions in English and German', () => {
    expect(parseFallback('Please build a hut near the pond', REFS)).toEqual({ tone: 'kind', isQuestion: false, intents: [{ intent: 'build', targetRef: 'building:hut', nearRef: 'place#3' }], sentiment: 0.5 });
    expect(parseFallback('Baut eine Hütte am Teich, bitte!', REFS).intents).toEqual([{ intent: 'build', targetRef: 'building:hut', nearRef: 'place#3' }]);
    expect(parseFallback('STOP FIGHTING!!', REFS)).toMatchObject({ tone: 'stern', intents: [{ intent: 'stop' }] });
    expect(parseFallback('Gather wood, or else.', REFS)).toMatchObject({ tone: 'stern', intents: [{ intent: 'gather', targetRef: 'item:wood' }] });
    expect(parseFallback('Sammelt Äpfel und tanzt', REFS).intents).toEqual([{ intent: 'gather', targetRef: 'item:apple' }, { intent: 'celebrate' }]);
    expect(parseFallback('Where are the apples?', REFS)).toMatchObject({ isQuestion: true, intents: [] });
    expect(parseFallback('Wo ist Fizz', REFS)).toMatchObject({ isQuestion: true, intents: [] });
    expect(parseFallback('I will smite you all', REFS).tone).toBe('wrathful');
    expect(parseFallback('Ich zerstöre euch!', REFS).tone).toBe('wrathful');
    expect(parseFallback('haha, dance for me :)', REFS)).toMatchObject({ tone: 'playful', intents: [{ intent: 'celebrate' }] });
    expect(parseFallback('Stay away from Sad Pond', REFS).intents).toEqual([{ intent: 'avoid', targetRef: 'place#3' }]);
    expect(parseFallback('Betet zu mir', REFS).intents).toEqual([{ intent: 'worship' }]);
    expect(parseFallback('Kommt her!', REFS).intents).toEqual([{ intent: 'come_here' }]);
    expect(parseFallback('Look after Fizz', REFS).intents).toEqual([{ intent: 'tend', targetRef: 'goblin#7' }]);
    expect(parseFallback("Don't fight near the pond", REFS).intents).toEqual([{ intent: 'avoid', targetRef: 'place#3' }]);
    expect(parseFallback('You are good little goblins', REFS).intents).toEqual([]);
  });
});

describe('the interpreter validator (§17.7.2, P9.7)', () => {
  const ok = '{"tone":"stern","isQuestion":false,"intents":[{"intent":"build","targetRef":"building:hut","nearRef":"place#3"}],"sentiment":-0.2}';
  it('takes strict JSON, even wrapped in prose, and nothing that strays from the schema or the refs', () => {
    expect(validateInterpretation(ok, REFS)).toEqual({ tone: 'stern', isQuestion: false, intents: [{ intent: 'build', targetRef: 'building:hut', nearRef: 'place#3' }], sentiment: -0.2 });
    expect(validateInterpretation('Sure! ```json\n' + ok + '\n```', REFS)).not.toBeNull();
    expect(validateInterpretation(ok.replace('"stern"', '"grumpy"'), REFS)).toBeNull();
    expect(validateInterpretation(ok.replace('"build"', '"conquer"'), REFS)).toBeNull();
    expect(validateInterpretation(ok.replace('building:hut', 'building:castle'), REFS)).toBeNull();
    expect(validateInterpretation(ok.replace('place#3', 'item:wood'), REFS)).toBeNull(); // build near something that is not a place
    expect(validateInterpretation(ok.replace('false', '"no"'), REFS)).toBeNull();
    expect(validateInterpretation(ok.replace(',"sentiment":-0.2', ''), REFS)).toBeNull();
    expect(validateInterpretation('{"tone":"kind","isQuestion":false,"intents":[{"intent":"rest"},{"intent":"eat"},{"intent":"plant"}],"sentiment":0}', REFS)).toBeNull();
    expect(validateInterpretation('{"tone":"kind","isQuestion":true,"intents":[],"sentiment":7}', REFS)?.sentiment).toBe(1);
    expect(validateInterpretation('I am a goblin god!', REFS)).toBeNull();
    expect(toIntents(validateInterpretation(ok, REFS)!, REFS, null)).toEqual([{ intent: 'build', target: { kind: 'building', value: 'hut', pos: { x: 30, y: 12 } } }]);
    expect(toIntents(parseFallback('come here', REFS), REFS, { x: 5, y: 6 })).toEqual([{ intent: 'come_here', target: { kind: 'pos', value: 0, pos: { x: 5, y: 6 } } }]);
  });
});

describe('the Divine Voice (§17.7.2, P9.7)', () => {
  it('"please build a hut near the pond": understood, a hut marked out by the pond, and the replay matches without asking again', async () => {
    const w = createWorld({ seed: 11 }), g = w.s.goblins[0]!, c = w.s.village.center;
    const pond: Place = { id: 9999, pos: { x: Math.round(c.x + 9), y: Math.round(c.y) }, feature: 'pond', cause: 'death', tick: 0, word: 0 };
    const culture = w.s.village.culture, places = culture?.places;
    (w.s.village.culture ??= {}).places = [...(places ?? []), pond];
    const d = new LlmDirector(new EventLog(), { world: () => w.s, lang: () => 'en' });
    let heard: Heard | null = null;
    d.voice.speak(w, 'Please build a hut near the pond', [g.id], null, 'en', (h) => (heard = h));
    await settle();
    if (!culture) delete w.s.village.culture; // the name was only the god's way of pointing: the world is as it was
    else if (places) culture.places = places;
    else delete culture.places;
    expect(heard).not.toBeNull();
    const h = heard as unknown as Heard;
    expect(h.how).toBe('keywords'); // the Mock answers as the keyword parser does
    expect(h.cmd).toMatchObject({ type: 'divine_speech', addressees: [g.id], tone: 'kind', isQuestion: false, source: 'voice', intents: [{ intent: 'build', target: { kind: 'building', value: 'hut', pos: pond.pos } }] });
    expect(llmOf(w.s).speechText[h.cmd.textRef!]).toBe('Please build a hut near the pond');
    const before = w.s.buildings.filter((b) => b.type === 'hut').length;
    w.push(h.cmd);
    for (let i = 0; i < 20; i++) w.step();
    const huts = w.s.buildings.filter((b) => b.type === 'hut');
    expect(huts.length).toBe(before + 1);
    expect(dist(huts[huts.length - 1]!.pos, pond.pos)).toBeLessThanOrEqual(CFG.buildings.siteRadius);
    expect(g.godView.wishes.some((x) => x.intent === 'build')).toBe(true);
    const replayed = replayTo(w.s, w.s.tick, (s) => new World(s), (p) => createWorldState(p));
    expect(stateHash(replayed.s)).toBe(stateHash(w.s));
  });

  it("a model's checked answer is used; a bad one, or none within 10 s, falls back to the keywords", async () => {
    const w = makeWorld({ size: 32 }), g = spawnGoblin(w);
    const timers: { f: () => void; ms: number }[] = [];
    const t = { set: (f: () => void, ms: number) => { timers.push({ f, ms }); return timers.length; }, clear: () => {} };
    let answer: (r: LLMRequest) => string | Promise<string> = () => '{"tone":"playful","isQuestion":false,"intents":[{"intent":"celebrate"}],"sentiment":0.6}';
    setLlmSettings({ ...DEFAULT_LLM, provider: 'proxy', budgets: { ...DEFAULT_LLM.budgets } });
    const sched = new Scheduler({ settings: llmSettings, provider: () => fake((r) => answer(r)), tick: () => w.s.tick, timers: t });
    const v = new DivineVoice(sched, () => w.s, t), got: Heard[] = [];
    v.speak(w, 'Let us have fun', [g.id], null, 'en', (h) => got.push(h));
    await settle();
    expect(got[0]).toMatchObject({ how: 'llm', cmd: { tone: 'playful', intents: [{ intent: 'celebrate' }] } });
    answer = () => 'Grub grub!';
    v.speak(w, 'Gather wood', [g.id], null, 'en', (h) => got.push(h));
    await settle();
    expect(got[1]).toMatchObject({ how: 'keywords', cmd: { intents: [{ intent: 'gather', target: { kind: 'item', value: 'wood' } }] } });
    answer = () => new Promise<string>(() => {});
    v.speak(w, 'Rest now', [g.id], null, 'en', (h) => got.push(h));
    await settle();
    expect(got).toHaveLength(2);
    timers.filter((x) => x.ms === 10_000).at(-1)!.f(); // the heavens have rumbled long enough
    expect(got[2]).toMatchObject({ how: 'keywords', cmd: { intents: [{ intent: 'rest' }] } });
  });

  it('hearers answer from what they remember; a model names the god, the Mock keeps the shaman\'s name', async () => {
    const w = makeWorld({ size: 40 }), g = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    registerLineage(w.s, g);
    (w.s.village.culture ??= {}).places = [{ id: 50, pos: { x: 26, y: 20 }, feature: 'pond', cause: 'death', tick: 0, word: 0 }];
    g.memory.push({ kind: 'fruit_plant', pos: { x: 26, y: 21 }, data: 4, lastSeenTick: w.s.tick, confidence: 1 });
    expect(memoriesOf(w.s, g, 'en')[0]).toBe('a bush with 4 apples at Sad Pond, today');
    expect(memoriesOf(w.s, g, 'de')[0]).toBe('ein Busch mit 4 Äpfeln bei Trauerteich, heute');
    const seen: LLMRequest[] = [];
    let named = '';
    const d = new LlmDirector(new EventLog(), { world: () => w.s, lang: () => 'en', godNamed: (n) => (named = n) });
    const e = { type: 'god_spoke', tick: w.s.tick, addressees: [g.id], tone: 'kind', intents: [], source: 'voice', isQuestion: true, textRef: 'q1' } as Extract<SimEvent, { type: 'god_spoke' }>;
    llmOf(w.s).speechText.q1 = 'Where are the apples?';
    const lines: string[] = [];
    d.voice.reply(e, [g], 'the Sky Grub', 'en', (_, text) => lines.push(text));
    await settle();
    expect(lines[0]).toMatch(/A bush with 4 apples at Sad Pond, today/);
    expect(llmOf(w.s).godTalk![g.id]).toEqual([{ tick: e.tick, god: 'Where are the apples?', reply: lines[0] }]);
    d.onEvents([{ type: 'god_named', name: '@giver.kind', tick: w.s.tick }]);
    await settle();
    expect(llmOf(w.s).godName).toBeUndefined(); // the Mock: the shaman's name stays, in whatever language is shown
    expect(voiceRefs(w, 'en', [g.id]).find((r) => r.kind === 'place')).toMatchObject({ ref: 'place#50', label: 'Sad Pond' });

    setLlmSettings({ ...DEFAULT_LLM, provider: 'proxy', budgets: { ...DEFAULT_LLM.budgets } });
    const d2 = new LlmDirector(new EventLog(), { world: () => w.s, lang: () => 'en', godNamed: (n) => (named = n),
      provider: () => fake((r) => (r.product === 'god_name' ? '"Old Apple-Above."' : 'Big bush by the pond had four, yesterday!'), seen) });
    d2.voice.reply(e, [g], 'the Sky Grub', 'en', (_, text) => lines.push(text));
    d2.onEvents([{ type: 'god_named', name: '@giver.kind', tick: w.s.tick }]);
    await settle();
    expect(lines[1]).toBe('Big bush by the pond had four, yesterday!');
    const reply = seen.find((r) => r.product === 'reply')!;
    expect(reply.system).toContain('What ' + g.name + ' knows that may help answer: a bush with 4 apples at Sad Pond, today. Answer only from this.');
    expect(reply.prompt).toBe('Where are the apples?');
    expect(llmOf(w.s).godName).toMatchObject({ name: 'Old Apple-Above', source: 'llm' });
    expect(named).toBe('Old Apple-Above');
  });
});
