/**
 * Books (§15.2, P9.5): what a goblin knows, written down. A book is sim data, not words: who wrote it, when, which
 * recipes and facts it holds, and the library shelf it stands on. Books outlive their writers, so a recipe whose
 * last knower died can be read back into the village; a shelf that burns takes its books with it. (In LLM mode a
 * book also gets a title and a page of text, kept outside the sim.) The writing and reading are in
 * ai/actions/books.ts; this file stays a leaf so the building code can burn books without an import cycle.
 */
import type { ID } from '../shared/types';
import type { Building, WorldState } from './state';
import type { World } from './world';

export interface Book { id: ID; authorId: ID; author: string; tick: number; contents: string[]; shelfId: ID }

export const booksOf = (s: WorldState): Book[] => s.village.culture?.books ?? [];
/** Finished library shelves. */
export const shelves = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'library_shelf' && b.buildProgress >= 1);
export const booksOn = (s: WorldState, shelfId: ID): Book[] => booksOf(s).filter((b) => b.shelfId === shelfId);
/** Is `id` written down in any book? */
export const inBooks = (s: WorldState, id: string): boolean => booksOf(s).some((b) => b.contents.includes(id));

/** A shelf burned or fell: its books are gone. */
export function loseBooks(w: World, shelf: Building, cause: string): void {
  const all = booksOf(w.s), gone = all.filter((b) => b.shelfId === shelf.id);
  if (!gone.length) return;
  w.s.village.culture!.books = all.filter((b) => b.shelfId !== shelf.id);
  w.emit({ type: 'books_lost', buildingId: shelf.id, bookIds: gone.map((b) => b.id), contents: [...new Set(gone.flatMap((b) => b.contents))], cause, at: { ...shelf.pos } });
}
