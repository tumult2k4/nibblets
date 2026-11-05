import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { Chat, chatPartner } from '../ai/actions/chat';
import { Comfort, Gift, giftValue, sadFriend } from '../ai/actions/kindness';
import { adjustOpinion, foughtTogether, opinionOf, relate, relationOf, sharedMeal, updateSocial } from '../goblin/social';
import { remember } from '../goblin/memory';
import { addMood } from '../goblin/mood';
import { spawnEnemy } from '../enemies/director';
import { killEnemy } from '../combat';
import { createWorldState } from '../newWorld';
import { deserialize, serialize } from '../save';
import { countItem } from '../inventory';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const S = CFG.social;
const DAY = CFG.time.dayTicks;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
/** Run one action to its end by hand, flushing events each tick. */
function run(w: World, g: Goblin, a: UtilityAction, max = 400, each?: () => void): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    each?.();
    w.bus.flush();
    w.s.tick++;
    if (r !== 'running') return r;
  }
  return 'timeout';
}
const pair = (w: World, d = 1) => [spawnGoblin(w, { pos: { x: 12, y: 12 } }), spawnGoblin(w, { pos: { x: 12 + d, y: 12 } })] as const;

describe('Relationships (P5.1)', () => {
  it('founders of a clan already know each other, and get along without being friends yet', () => {
    const s = createWorldState({ seed: 3, size: 48, founders: 5 });
    for (const g of s.goblins) {
      expect(g.relationships).toHaveLength(4);
      for (const r of g.relationships) {
        expect(r.familiarity).toBe(S.clanFamiliarity);
        expect(r.opinion).toBeGreaterThanOrEqual(S.clanOpinion[0]);
        expect(r.opinion).toBeLessThanOrEqual(S.clanOpinion[1]);
        expect(r.bond).toBe('none');
      }
    }
  });

  it('bonds follow opinion: friend at 40, best friend at 75 (two at most), rival at −40', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const others = [0, 1, 2].map(() => spawnGoblin(w));
    const evs = events(w);
    adjustOpinion(w, g, others[0]!, 45);
    expect(relationOf(g, others[0]!.id)!.bond).toBe('friend');
    for (const o of others) adjustOpinion(w, g, o, 80);
    expect(g.relationships.filter((r) => r.bond === 'best_friend')).toHaveLength(S.maxBestFriends);
    expect(relationOf(g, others[2]!.id)!.bond).toBe('friend');
    adjustOpinion(w, g, others[2]!, -160);
    expect(relationOf(g, others[2]!.id)!.bond).toBe('enemy');
    w.bus.flush();
    expect(evs.filter((e) => e.type === 'bond_formed').map((e) => e.type === 'bond_formed' && e.kind)).toEqual(['friend', 'best_friend', 'best_friend', 'friend', 'enemy']);
  });

  it('opinions fade toward neutral without contact, but a grudge holder never forgives', () => {
    const w = makeWorld();
    const [g, o] = pair(w);
    relate(g, o.id).opinion = 50;
    relate(o, g.id).opinion = -50;
    o.traits.push('grudge_holder');
    w.s.tick = 3 * DAY + Math.floor(DAY * 0.2);
    updateSocial(w);
    expect(opinionOf(g, o.id)).toBeCloseTo(50 - S.driftPerDay, 4);
    expect(opinionOf(o, g.id)).toBe(-50);
  });

  it('company keeps the social need up; alone it runs down and the goblin turns lonely', () => {
    const w = makeWorld();
    const [g, o] = pair(w, 1.5);
    const alone = spawnGoblin(w, { pos: { x: 3, y: 20 } });
    for (const x of [g, o, alone]) x.needs.social = 50;
    for (let i = 0; i < DAY / 4; i++) { updateSocial(w); w.s.tick++; }
    expect(g.needs.social).toBeGreaterThan(50 + 0.2 * S.companyPerDay);
    alone.needs.social = 10;
    for (let i = 0; i < 30; i++) w.step();
    expect(alone.mood.emotion).toBe('lonely');
  });

  it('a shared meal and a fight won together bring goblins closer; the rescued owe their rescuers', () => {
    const w = makeWorld();
    const [a, b] = pair(w);
    b.activity.action = 'eat';
    sharedMeal(w, a);
    expect(opinionOf(a, b.id)).toBe(S.sharedMeal);
    expect(opinionOf(b, a.id)).toBe(S.sharedMeal);
    const victim = spawnGoblin(w, { pos: { x: 13, y: 13 } });
    const e = spawnEnemy(w, 'gnasher', { x: 12.5, y: 12.8 });
    e.mode = 'attack';
    e.targetId = victim.id;
    for (const f of [a, b]) f.activity = { ...f.activity, action: 'attack', targetId: e.id };
    killEnemy(w, e, a);
    expect(opinionOf(a, b.id)).toBe(S.sharedMeal + S.foughtTogether);
    expect(opinionOf(victim, a.id)).toBe(S.saved);
    expect(opinionOf(victim, b.id)).toBe(S.saved);
    foughtTogether(w, e, null); // no double counting from a stale call: nobody is fighting it any more after the kill
  });

  it('v8 saves gain familiarity, bond and last contact on every relationship', () => {
    const w = makeWorld();
    const [g, o] = pair(w);
    const raw = JSON.parse(serialize(w.s)) as { version: number; goblins: { relationships: unknown[] }[] };
    raw.version = 8;
    raw.goblins[0]!.relationships = [{ targetId: o.id, opinion: 30 }];
    const s = deserialize(JSON.stringify(raw));
    expect(s.goblins.find((x) => x.id === g.id)!.relationships[0]).toEqual({ targetId: o.id, opinion: 30, familiarity: 0, bond: 'none', lastInteraction: 0 });
  });
});

describe('Chat, gossip, comfort and gifts (P5.1)', () => {
  it('two goblins wanting company strike up a chat: 4–6 lines, taking turns, and both come away happier with each other', () => {
    const w = makeWorld();
    const [g, o] = pair(w, 3);
    g.needs.social = o.needs.social = 30;
    const evs = events(w);
    let chat: SimEvent | undefined;
    for (let i = 0; i < 1200 && !chat; i++) { w.step(); chat = evs.find((e) => e.type === 'chat'); }
    expect(chat).toBeDefined();
    const lines = evs.filter((e) => e.type === 'chat_line');
    expect(lines.length).toBeGreaterThanOrEqual(S.chatLines[0]);
    expect(lines.length).toBeLessThanOrEqual(S.chatLines[1]);
    const speakers = lines.map((e) => e.type === 'chat_line' && e.goblinId);
    for (let i = 1; i < speakers.length; i++) expect(speakers[i]).not.toBe(speakers[i - 1]);
    expect(g.needs.social).toBeGreaterThan(30 + S.chatSocial / 2);
    expect(opinionOf(g, o.id)).toBeGreaterThanOrEqual(S.chat[0]);
    expect(opinionOf(o, g.id)).toBeGreaterThanOrEqual(S.chat[0]);
  });

  it('rivals will not talk to each other', () => {
    const w = makeWorld();
    const [g, o] = pair(w, 3);
    expect(chatPartner(g, w)).toBe(o);
    relate(o, g.id).opinion = -60;
    expect(chatPartner(g, w)).toBeNull();
  });

  it('gossip passes on what the speaker knows, a little less sure and just as stale', () => {
    const w = makeWorld();
    const [g, o] = pair(w);
    w.s.tick = 500;
    remember(g, w, 'fruit_plant', { x: 4, y: 18 }, 3, 999);
    g.memory[0]!.lastSeenTick = 200;
    run(w, g, Chat, 400, () => { if (g.activity.stage === 1) g.activity.topic = 'gossip'; });
    const m = o.memory.find((x) => x.kind === 'fruit_plant');
    expect(m).toBeDefined();
    expect(m!.confidence).toBeCloseTo(S.gossipConfidence, 4);
    expect(m!.lastSeenTick).toBe(200);
    expect(o.activity.status).toBe('done');
  });

  it('talking about someone sways the listener toward the speaker\'s view of them', () => {
    const w = makeWorld();
    const [g, o] = pair(w);
    const p = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    relate(g, p.id).opinion = 70;
    relate(o, p.id).opinion = 0;
    run(w, g, Chat, 400, () => { if (g.activity.stage === 1) g.activity.topic = 'a_person'; });
    expect(opinionOf(o, p.id)).toBeCloseTo(70 * S.personSway, 3);
  });

  it('a goblin in good spirits goes and hugs a sad friend', () => {
    const w = makeWorld();
    const [g, o] = pair(w, 4);
    relate(g, o.id).opinion = 50;
    addMood(w, o, 'grief', -60, DAY);
    o.mood.value = -50;
    g.mood.value = 30;
    expect(sadFriend(g, w)).toBe(o);
    expect(Comfort.isAvailable(g, w)).toBe(true);
    const evs = events(w);
    expect(run(w, g, Comfort, 600)).toBe('done');
    expect(o.mood.modifiers.some((m) => m.id === 'comforted' && m.amount === S.comfortMood)).toBe(true);
    expect(opinionOf(o, g.id)).toBe(S.comfortOpinion);
    expect(evs.some((e) => e.type === 'comforted' && e.goblinId === o.id && e.byId === g.id)).toBe(true);
    expect(sadFriend(g, w)).toBeNull(); // already comforted
  });

  it('a goblin with food to spare brings some to a hungry friend, who thinks the better of it', () => {
    const w = makeWorld();
    const [g, o] = pair(w, 5);
    relate(g, o.id).opinion = 45;
    g.inventory.push({ type: 'apple', qty: 3 });
    o.needs.hunger = 30;
    expect(Gift.isAvailable(g, w)).toBe(true);
    const evs = events(w);
    expect(run(w, g, Gift, 600)).toBe('done');
    expect(countItem(g, 'apple')).toBe(2);
    expect(countItem(o, 'apple')).toBe(1);
    expect(opinionOf(o, g.id)).toBe(giftValue('apple', o));
    expect(giftValue('apple', o)).toBeGreaterThan(giftValue('apple', g)); // food means more to the hungry
    expect(g.deeds.gifts).toBe(1);
    expect(evs.some((e) => e.type === 'gift_given' && e.item === 'apple')).toBe(true);
    expect(Gift.isAvailable(g, w)).toBe(false); // not again so soon
    g.inventory = [{ type: 'apple', qty: 1 }];
    g.mood.modifiers = [];
    expect(Gift.isAvailable(g, w)).toBe(false); // the last bite stays
  });
});
