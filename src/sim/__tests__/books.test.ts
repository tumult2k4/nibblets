import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { ReadBook, WriteBook, bookContents, wantsLibrary } from '../ai/actions/books';
import { booksOf, booksOn } from '../books';
import { completeBuilding, destroyBuilding, placeBlueprint } from '../buildings';
import { killGoblin } from '../goblin/needs';
import { hasTrait } from '../goblin/traits';
import { knowers } from '../knowledge';
import { deposit, stockCount } from '../stockpile';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deserialize, serialize, stateHash } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, B = CFG.books;

function morning(w: World): void {
  w.s.tick = 2 * DAY + Math.round(0.2 * DAY);
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}
function run(w: World, g: Goblin, a: UtilityAction, max = 3000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.s.tick++;
    if (r !== 'running') { g.activity.status = r; return r; }
  }
  return 'timeout';
}
function village() {
  const w = makeWorld({ size: 32 });
  morning(w);
  const sage = spawnGoblin(w, { pos: { x: 14, y: 16 } }), pupil = spawnGoblin(w, { pos: { x: 18, y: 16 } });
  for (const g of [sage, pupil]) Object.assign(g.needs, { hunger: 95, thirst: 95, energy: 95, curiosity: 40 });
  sage.knownRecipes.push('club', 'drum', 'kiln');
  sage.personality.industry = 0.8;
  const shelf = placeBlueprint(w, 'library_shelf', { x: 16, y: 18 }, null);
  completeBuilding(w, shelf, null);
  deposit(w.s, { type: 'fiber', qty: 3 });
  deposit(w.s, { type: 'ash', qty: 2 });
  deposit(w.s, { type: 'apple', qty: 60 });
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return { w, sage, pupil, shelf, evs };
}

describe('books (§15.2, P9.5)', () => {
  it('the showcase loop: a goblin writes down what only it knows, dies, and a reader brings it back', () => {
    const { w, sage, pupil, shelf, evs } = village();
    expect(bookContents(sage, w)).toEqual(['club', 'drum', 'kiln']);
    expect(WriteBook.isAvailable(sage, w)).toBe(true);
    expect(run(w, sage, WriteBook)).toBe('done');
    w.bus.flush();
    const [book] = booksOf(w.s);
    expect(book).toMatchObject({ authorId: sage.id, author: sage.name, contents: ['club', 'drum', 'kiln'], shelfId: shelf.id });
    expect(evs.some((e) => e.type === 'book_written' && e.bookId === book!.id)).toBe(true);
    expect([stockCount(w.s, 'fiber'), stockCount(w.s, 'ash')]).toEqual([2, 1]);
    expect(hasTrait(sage, 'storyteller')).toBe(true);
    expect(WriteBook.isAvailable(sage, w)).toBe(false); // nothing left to write, and resting from it

    killGoblin(w, sage, 'old_age');
    w.bus.flush();
    expect(w.s.village.lost).toEqual(['club', 'drum', 'kiln']);
    expect(knowers(w.s, 'club')).toBe(0);

    expect(ReadBook.isAvailable(pupil, w)).toBe(true);
    expect(run(w, pupil, ReadBook)).toBe('done');
    w.bus.flush();
    expect(pupil.knownRecipes).toEqual(expect.arrayContaining(['club', 'drum']));
    expect(pupil.knownRecipes).not.toContain('kiln'); // two at a sitting
    const learned = evs.filter((e) => e.type === 'recipe_learned');
    expect(learned).toHaveLength(2);
    expect(learned.every((e) => e.type === 'recipe_learned' && e.via === 'book' && e.byId === sage.id && e.recovered)).toBe(true);
    expect(w.s.village.lost).toEqual(['kiln']);
    expect(run(w, pupil, ReadBook)).toBe('done');
    expect(w.s.village.lost).toEqual([]);
    expect(ReadBook.isAvailable(pupil, w)).toBe(false);
  });

  it('a shelf that burns takes its books with it; books survive a save', () => {
    const { w, sage, shelf, evs } = village();
    run(w, sage, WriteBook);
    const back = deserialize(serialize(w.s));
    expect(stateHash(back)).toBe(stateHash(w.s));
    expect(booksOf(back)).toEqual(booksOf(w.s));
    destroyBuilding(w, shelf, 'fire');
    w.bus.flush();
    expect(booksOf(w.s)).toEqual([]);
    expect(evs.find((e) => e.type === 'books_lost')).toMatchObject({ buildingId: shelf.id, contents: ['club', 'drum', 'kiln'], cause: 'fire' });
  });

  it('no writing without ink, food in store, a shelf with room or something new to say', () => {
    const { w, sage, shelf } = village();
    const ash = w.s.village.stockpile.find((s) => s.type === 'ash')!;
    ash.qty = 0;
    expect(WriteBook.isAvailable(sage, w)).toBe(false);
    ash.qty = 1;
    expect(WriteBook.isAvailable(sage, w)).toBe(true);
    w.s.village.stockpile.find((s) => s.type === 'apple')!.qty = 0;
    expect(WriteBook.isAvailable(sage, w)).toBe(false);
    w.s.village.stockpile.find((s) => s.type === 'apple')!.qty = 60;
    for (let i = 0; i < B.perShelf; i++) (w.s.village.culture ??= {}).books = [...booksOf(w.s), { id: 900 + i, authorId: 1, author: 'X', tick: 0, contents: ['fishing_rod'], shelfId: shelf.id }];
    expect(booksOn(w.s, shelf.id)).toHaveLength(B.perShelf);
    expect(WriteBook.isAvailable(sage, w)).toBe(false);
  });

  it('the village wants a shelf once it is six strong and housed, with food put by', () => {
    const w = makeWorld({ size: 32 });
    for (let i = 0; i < 5; i++) spawnGoblin(w);
    deposit(w.s, { type: 'apple', qty: 80 });
    expect(wantsLibrary(w)).toBe(false);
    const last = spawnGoblin(w);
    expect(wantsLibrary(w)).toBe(false); // nobody has a roof yet
    const hut = placeBlueprint(w, 'hut', { x: 8, y: 8 }, null);
    completeBuilding(w, hut, null);
    for (const g of w.s.goblins) g.homeId = hut.id;
    expect(wantsLibrary(w)).toBe(true);
    last.homeId = null;
    expect(wantsLibrary(w)).toBe(false);
    last.homeId = hut.id;
    const shelf = placeBlueprint(w, 'library_shelf', { x: 16, y: 18 }, null);
    expect(wantsLibrary(w)).toBe(false);
    completeBuilding(w, shelf, null);
    expect(wantsLibrary(w)).toBe(false);
  });
});
