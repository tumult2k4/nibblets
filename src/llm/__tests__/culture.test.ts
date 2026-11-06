import { afterEach, describe, expect, it } from 'vitest';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import { CFG } from '../../sim/config';
import { registerLineage } from '../../sim/goblin/family';
import { killGoblin } from '../../sim/goblin/needs';
import { completeBuilding, placeBlueprint } from '../../sim/buildings';
import { EventLog } from '../eventLog';
import { LlmDirector, type SpokenLine } from '../director';
import { contentLine, eldest, splitBook, villageNameOf } from '../culture';
import { journalsOf, llmOf, villageTitle } from '../store';
import { DEFAULT_LLM, setLlmSettings } from '../settings';
import type { Lang } from '../../ui/i18n';
import type { World } from '../../sim/world';
import type { SimEventInput } from '../../shared/types';

const DAY = CFG.time.dayTicks, SEASON = CFG.time.daysPerSeason;
const settle = () => new Promise((r) => setTimeout(r, 0));

function rig(w: World, lang: Lang = 'en') {
  const log = new EventLog(), said: { kind: string; lines: SpokenLine[] }[] = [], named: string[] = [];
  const d = new LlmDirector(log, { world: () => w.s, lang: () => lang, say: (kind, lines) => said.push({ kind, lines }), named: (n) => named.push(n) });
  const feed = () => { const evs = w.bus.flush(); log.record(evs, w.s); d.onEvents(evs); };
  const emit = (e: SimEventInput) => { w.emit(e); feed(); };
  return { d, said, named, feed, emit };
}

function folk(w: World) {
  const elder = spawnGoblin(w, { pos: { x: 20, y: 20 }, ageDays: 90 }), dead = spawnGoblin(w, { pos: { x: 22, y: 20 } }), kid = spawnGoblin(w, { pos: { x: 30, y: 30 } });
  elder.lifeStage = 'elder';
  for (const g of [elder, dead, kid]) registerLineage(w.s, g);
  kid.relationships.push({ targetId: dead.id, opinion: 60, familiarity: 50, bond: 'parent', lastInteraction: 0 });
  return { elder, dead, kid };
}

afterEach(() => setLlmSettings({ ...DEFAULT_LLM, budgets: { ...DEFAULT_LLM.budgets } }));

describe('the village writes (§19.4, P9.5)', () => {
  it("a finished book gets a title and a page in its writer's voice, in the game's language", async () => {
    for (const lang of ['en', 'de'] as const) {
      const w = makeWorld({ size: 40 }), sage = spawnGoblin(w);
      registerLineage(w.s, sage);
      const r = rig(w, lang);
      r.emit({ type: 'book_written', goblinId: sage.id, bookId: 77, contents: ['club', 'redcap_is_poison'], at: { x: 20, y: 20 } });
      await settle();
      const [page] = journalsOf(w.s, null, 'book');
      expect(page).toMatchObject({ kind: 'book', goblinId: sage.id, ref: 77, source: 'mock' });
      expect(page!.title!.length).toBeGreaterThan(3);
      expect(page!.text).toContain(sage.name);
      expect(page!.text).toContain(lang === 'en' ? 'Club: take wood and stone, and be patient.' : 'Keule: Nimm Holz und Stein und hab Geduld.');
      expect(page!.text).toContain(lang === 'en' ? 'Remember that redcaps are poison!' : 'Merk dir, dass Rotkappen giftig sind!');
    }
  });

  it('at a burial the eldest by the grave speaks of what the dead did, and is heard there', async () => {
    const w = makeWorld({ size: 40 }), { elder, dead, kid } = folk(w);
    const r = rig(w);
    r.emit({ type: 'enemy_killed', enemyId: 99, kind: 'gnasher', killerId: dead.id, at: { x: 22, y: 21 } });
    w.s.tick += DAY / 4;
    killGoblin(w, dead, 'old_age');
    r.feed();
    await settle(); // the victor's bark and the grief
    const gr = w.s.graves.find((g) => g.goblinId === dead.id)!;
    expect(eldest(w.s, gr.pos)).toBe(elder);
    r.said.length = 0;
    r.emit({ type: 'buried', graveId: gr.id, deadId: dead.id, byId: kid.id, mourners: 2, at: { ...gr.pos } });
    await settle();
    const [eu] = journalsOf(w.s, dead.id, 'eulogy');
    expect(eu).toMatchObject({ by: elder.id, title: dead.name, ref: gr.id, source: 'mock' });
    expect(eu!.text).toContain(`${dead.name} was one of us`);
    expect(eu!.text).toContain(`I remember this: ${dead.name} slew a Gnasher.`);
    expect(r.said).toEqual([{ kind: 'bark', lines: [{ goblinId: elder.id, text: `${dead.name} was one of us.` }] }]);
  });

  it("on a season's first day the eldest writes the last season's chronicle, with its numbers and top events", async () => {
    const w = makeWorld({ size: 40 }), { elder, dead } = folk(w);
    const r = rig(w);
    w.s.tick = 3 * DAY + 2000;
    r.emit({ type: 'enemy_killed', enemyId: 99, kind: 'gnasher', killerId: elder.id, at: { x: 20, y: 21 } });
    w.s.tick = 5 * DAY + 1000;
    killGoblin(w, dead, 'combat');
    r.feed();
    w.s.tick = SEASON * DAY;
    r.emit({ type: 'day_started', day: SEASON });
    await settle();
    const [ch] = journalsOf(w.s, null, 'chronicle');
    expect(ch).toMatchObject({ by: elder.id, day: SEASON - 1, title: 'Spring, year 1', source: 'mock' });
    expect(ch!.text).toContain(`Here ${elder.name} writes of the Spring of year 1 in ${w.s.village.name}.`);
    expect(ch!.text).toContain('We were 3 when it began and 2 when it ended.');
    expect(ch!.text).toContain('1 of us went under the moss.');
    expect(ch!.text).toContain('On day 4, I slew a Gnasher.');
    r.emit({ type: 'day_started', day: SEASON + 1 });
    await settle();
    expect(journalsOf(w.s, null, 'chronicle')).toHaveLength(1);
  });

  it('the third hut names the village, once', async () => {
    const w = makeWorld({ size: 40 });
    spawnGoblin(w);
    const r = rig(w), founded = w.s.village.name;
    const hut = (x: number) => {
      const b = placeBlueprint(w, 'hut', { x, y: 10 }, null);
      completeBuilding(w, b, null);
      r.feed();
    };
    hut(6); hut(12);
    await settle();
    expect(llmOf(w.s).villageName).toBeUndefined();
    hut(18);
    await settle();
    const vn = llmOf(w.s).villageName!;
    expect(vn).toMatchObject({ source: 'mock' });
    expect(villageNameOf(vn.name, [])).toBe(vn.name);
    expect(r.named).toEqual([vn.name]);
    expect(villageTitle(w.s)).toBe(vn.name);
    expect(w.s.village.name).toBe(founded); // the sim's own name is untouched
    hut(24);
    await settle();
    expect(r.named).toHaveLength(1);
  });

  it('answers are checked: names, titles, contents', () => {
    expect(villageNameOf('"Mossbottom."', [])).toBe('Mossbottom');
    expect(villageNameOf('Name: puddle Hollow\nIt is muddy.', [])).toBe('Puddle Hollow');
    expect(villageNameOf('The Very Long Village of Goblins', [])).toBeNull();
    expect(villageNameOf('Krik', ['Krik'])).toBeNull();
    expect(villageNameOf('Mud<script>', [])).toBeNull();
    expect(splitBook('Title: "Do Not Forget!"\nThis is the book.\nRead it.')).toEqual({ title: 'Do Not Forget!', text: 'This is the book. Read it.' });
    expect(splitBook('Just a page.')).toEqual({ title: null, text: 'Just a page.' });
    expect(contentLine('club', 'en')).toBe('Club: wood and stone');
    expect(contentLine('redcap_is_poison', 'de')).toBe('dass Rotkappen giftig sind');
  });
});
