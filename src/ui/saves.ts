/**
 * Save slots in IndexedDB (3 rotating autosaves + 10 manual), with thumbnails; export/import JSON.
 * IndexedDB instead of localStorage because a 128×128 world is ~0.5 MB (see DECISIONS.md).
 */
import { serialize } from '../sim/save';
import type { WorldState } from '../sim/state';
import { clockAt } from '../sim/time';

export interface SlotMeta { slot: string; village: string; day: number; year: number; pop: number; mode: string; savedAt: number; thumb: string }
interface SlotRow extends SlotMeta { data: string }

const DB = 'nibblets';
const STORE = 'saves';
export const AUTO_SLOTS = ['auto1', 'auto2', 'auto3'];
export const QUICK_SLOT = 'quick';
export const MANUAL_SLOTS = Array.from({ length: 10 }, (_, i) => `slot${i + 1}`);

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'slot' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function metaFor(s: WorldState, slot: string, thumb: string): SlotMeta {
  const c = clockAt(s.tick);
  return { slot, village: s.village.name, day: c.day + 1, year: c.year, pop: s.goblins.length, mode: s.god.mode, savedAt: Date.now(), thumb };
}

export async function saveSlot(s: WorldState, slot: string, thumb: string): Promise<void> {
  const row: SlotRow = { ...metaFor(s, slot, thumb), data: serialize(s) };
  await tx('readwrite', (st) => st.put(row));
}

export async function loadSlot(slot: string): Promise<string | null> {
  const row = (await tx('readonly', (st) => st.get(slot))) as SlotRow | undefined;
  return row?.data ?? null;
}

export async function listSlots(): Promise<SlotMeta[]> {
  const rows = (await tx('readonly', (st) => st.getAll())) as SlotRow[];
  return rows.map(({ data: _d, ...m }) => m);
}

export async function deleteSlot(slot: string): Promise<void> {
  await tx('readwrite', (st) => st.delete(slot));
}

/** Next autosave slot: the oldest of the three. */
export async function nextAutoSlot(): Promise<string> {
  const metas = (await listSlots()).filter((m) => AUTO_SLOTS.includes(m.slot));
  for (const s of AUTO_SLOTS) if (!metas.find((m) => m.slot === s)) return s;
  return metas.sort((a, b) => a.savedAt - b.savedAt)[0]!.slot;
}

export async function latestSlot(): Promise<string | null> {
  const m = await listSlots().catch(() => []);
  return m.sort((a, b) => b.savedAt - a.savedAt)[0]?.slot ?? null;
}

export function downloadJson(name: string, data: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickJsonFile(): Promise<string | null> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.json,application/json';
    i.onchange = () => {
      const f = i.files?.[0];
      if (!f) return res(null);
      f.text().then(res, () => res(null));
    };
    i.click();
  });
}

/** Small JPEG of the current frame (needs preserveDrawingBuffer). */
export function thumbnail(canvas: HTMLCanvasElement): string {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 135;
  const x = c.getContext('2d')!;
  try {
    x.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return '';
  }
}
