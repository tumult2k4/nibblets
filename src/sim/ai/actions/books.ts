/**
 * `WriteBook` and `ReadBook` (§15.2, P9.5). A goblin who knows at least three things worth passing on, with
 * industry or the storyteller's itch, sits at a library shelf by day and writes a book: up to three of the recipes
 * and facts it knows that the fewest goblins share and no book holds yet, on a page of fiber with ash for ink (taken
 * from its pack or the store when the book is done). Writing makes it a storyteller. A curious goblin reads at the
 * shelf while the store holds food enough and learns one thing from a book every 300 ticks, two at a sitting; a book
 * holding something nobody alive knows draws readers most, which is how a lost recipe comes back. The village wants
 * a shelf once it is six strong, housed, with food in store, and someone knows how to build one.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import { allocId } from '../../../shared/ids';
import type { ItemType } from '../../../shared/types';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { grantTrait, hasTrait } from '../../goblin/traits';
import { daylight } from '../../time';
import { knowers, knowsAny, learn, teachable } from '../../knowledge';
import { booksOf, booksOn, shelves, type Book } from '../../books';
import { foodStores } from '../../spoilage';
import { spareStock } from '../../crafting';
import { withdraw } from '../../stockpile';
import { countItem, removeItems } from '../../inventory';

const B = CFG.books, DAY = CFG.time.dayTicks;
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const daytime = (w: World): boolean => daylight(w.clock) > 0.5;
const INK = Object.entries(B.cost) as [ItemType, number][];
/** Too little food put by to sit and read (autumn asks for twice as much: the winter's food is being laid in). */
const lean = (w: World): boolean => foodStores(w.s).days < B.readDays * (w.clock.season === 'autumn' ? 2 : 1);

/** Every grown goblin sleeps under a finished roof (the shelf's wood must not come before a hut's). */
const housed = (w: World): boolean => w.s.goblins.every((g) => (g.lifeStage !== 'adult' && g.lifeStage !== 'elder')
  || w.s.buildings.some((b) => b.id === g.homeId && b.buildProgress >= 1));
/** The village wants a shelf: none with room, six goblins or more, all housed, food in store. */
export const wantsLibrary = (w: World): boolean =>
  w.s.goblins.length >= B.shelf.pop && !w.s.buildings.some((b) => b.type === 'library_shelf' && (b.buildProgress < 1 || booksOn(w.s, b.id).length < B.perShelf))
  && foodStores(w.s).days >= B.shelf.days && housed(w);

/** What `g` would write down: what it knows that the fewest share and no book holds yet (up to three). */
export function bookContents(g: Goblin, w: World): string[] {
  const written = new Set(booksOf(w.s).flatMap((b) => b.contents));
  return teachable(g).filter((id) => !written.has(id)).map((id) => [id, knowers(w.s, id)] as const)
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).slice(0, B.contents).map(([id]) => id);
}

/** The nearest shelf with room for one more book. */
function shelfFor(g: Goblin, w: World): Building | null {
  let best: Building | null = null, bd = Infinity;
  for (const b of shelves(w.s)) {
    const d = dist(b.pos, g.pos);
    if (d < bd && booksOn(w.s, b.id).length < B.perShelf) { bd = d; best = b; }
  }
  return best;
}

const hasInk = (g: Goblin, w: World): boolean => INK.every(([t, n]) => countItem(g, t) + spareStock(w, t) >= n);
function takeInk(g: Goblin, w: World): boolean {
  if (!hasInk(g, w)) return false;
  for (const [t, n] of INK) {
    const own = Math.min(n, countItem(g, t));
    removeItems(g, t, own);
    if (n > own) withdraw(w.s, t, n - own);
  }
  return true;
}

const busyWriting = (g: Goblin, w: World): boolean => w.s.goblins.some((o) => o !== g && o.activity.action === 'write_book' && o.activity.status === 'running');
const wroteLately = (g: Goblin): boolean => g.mood.modifiers.some((m) => m.id === 'wrote_book');
/** A spot beside the shelf, on the goblin's side. */
function beside(g: Goblin, b: Building): { x: number; y: number } {
  const d = Math.max(0.01, dist(g.pos, b.pos));
  return { x: q4(b.pos.x + ((g.pos.x - b.pos.x) / d) * 0.8), y: q4(b.pos.y + ((g.pos.y - b.pos.y) / d) * 0.8) };
}
const walkTo = (w: World, g: Goblin, p: { x: number; y: number }): boolean => dist(g.pos, p) < 0.5 || planPath(w, g, p);

export const WriteBook: UtilityAction = {
  id: 'write_book', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !pressed(g) && !wroteLately(g) && daytime(w) && teachable(g).length >= B.minKnown && foodStores(w.s).days >= B.writeDays
    && !busyWriting(g, w) && !!shelfFor(g, w) && hasInk(g, w) && bookContents(g, w).length > 0,
  score(g, w) {
    const rare = bookContents(g, w).some((id) => knowers(w.s, id) <= 1);
    return q4(B.writeScore * (0.3 + g.personality.industry) * (hasTrait(g, 'storyteller') ? B.storyteller : 1) + (rare ? B.rareBonus : 0));
  },
  start(g, w) {
    const b = shelfFor(g, w);
    if (!b) return false;
    const a = g.activity;
    a.targetId = b.id;
    a.target = beside(g, b);
    return walkTo(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b || b.buildProgress < 1) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = B.writeTicks;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, b.pos);
    if ((w.s.tick + g.id) % 120 === 0) w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
    if (--a.progress > 0) return 'running';
    const contents = bookContents(g, w);
    if (!contents.length || booksOn(w.s, b.id).length >= B.perShelf || !takeInk(g, w)) return 'failed';
    const book: Book = { id: allocId(w.s), authorId: g.id, author: g.name, tick: w.s.tick, contents, shelfId: b.id };
    ((w.s.village.culture ??= {}).books ??= []).push(book);
    grantTrait(w, g, 'storyteller');
    addMood(w, g, 'wrote_book', B.mood, B.cooldownDays * DAY);
    w.emit({ type: 'book_written', goblinId: g.id, bookId: book.id, contents, at: { ...b.pos } });
    return 'done';
  },
};

/** Things in `bk` that `g` does not know yet, what nobody alive knows first. */
const news = (g: Goblin, w: World, bk: Book): string[] =>
  bk.contents.filter((id) => !knowsAny(g, id)).sort((x, y) => knowers(w.s, x) - knowers(w.s, y));

/** The book with the most for `g` to learn (lost knowledge counts thrice), nearer shelves first on a tie. */
export function bookFor(g: Goblin, w: World): Book | null {
  let best: Book | null = null, bs = 0;
  for (const bk of booksOf(w.s)) {
    const shelf = w.s.buildings.find((b) => b.id === bk.shelfId);
    const n = shelf && shelf.buildProgress >= 1 ? news(g, w, bk) : [];
    if (!n.length) continue;
    const sc = n.length + 3 * n.filter((id) => knowers(w.s, id) === 0).length - dist(shelf!.pos, g.pos) * 0.001;
    if (sc > bs) { bs = sc; best = bk; }
  }
  return best;
}

export const ReadBook: UtilityAction = {
  id: 'read_book', tags: ['fun'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !pressed(g) && g.needs.curiosity < B.readBelow && daytime(w) && !lean(w) && !!bookFor(g, w),
  score(g, w) {
    const lost = news(g, w, bookFor(g, w)!).some((id) => knowers(w.s, id) === 0);
    return q4(B.readScore * (0.5 + needUrgency(g.needs.curiosity)) + (lost ? B.lostBonus : 0));
  },
  start(g, w) {
    const bk = bookFor(g, w), shelf = bk && w.s.buildings.find((b) => b.id === bk.shelfId);
    if (!bk || !shelf) return false;
    const a = g.activity;
    a.targetId = bk.id;
    a.target = beside(g, shelf);
    return walkTo(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, bk = booksOf(w.s).find((b) => b.id === a.targetId);
    const shelf = bk && w.s.buildings.find((b) => b.id === bk.shelfId);
    if (!bk || !shelf) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, shelf.pos);
    if (++a.progress % B.readTicks !== 0) return 'running';
    const next = news(g, w, bk)[0];
    if (!next) return 'done';
    learn(w, g, next, 'book', bk.authorId);
    g.needs.curiosity = Math.min(100, q4(g.needs.curiosity + B.readCuriosity));
    w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
    return a.progress >= B.readTicks * B.maxRead || !news(g, w, bk).length ? 'done' : 'running';
  },
};
