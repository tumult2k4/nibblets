/**
 * The balance runner's view of faith (P8.8): prayers asked, answered and ignored, desperate ones, offerings, the
 * shaman and the temple, favor earned by source, and where faith stands at the end.
 */
import { CFG } from '../src/sim/config';
import type { World } from '../src/sim/world';

/** `{ a: 3, b: 1 }` of the non-null values, most first. */
export const tally = (xs: (string | null)[]): string =>
  JSON.stringify(Object.fromEntries(Object.entries(xs.reduce<Record<string, number>>((m, x) => (x ? { ...m, [x]: (m[x] ?? 0) + 1 } : m), {})).sort((a, b) => b[1] - a[1])));

export function faithTracker(w: World): () => string {
  const day = (t: number) => Math.floor(t / CFG.time.dayTicks);
  const f = { asked: 0, desperate: 0, answered: 0, ignored: 0, offerings: 0, group: 0, converted: 0, shamanDay: -1, shamans: 0, templeDay: -1, kinds: {} as Record<string, number> };
  /** P8.9 Divine mode: the day each tier first came, wishes kept / defied, times the god spoke */
  const d = { tierDay: [] as number[], kept: 0, defied: 0, spoke: 0, lost: 0 };
  /** P9.5: books written, things read from them (and how many of those had been lost), books burned */
  const bk = { written: 0, read: 0, recovered: 0, burned: 0, lost: 0 };
  w.bus.subscribe((e) => {
    if (e.type === 'prayer') { f.asked++; if (e.desperate) f.desperate++; f.kinds[e.kind] = (f.kinds[e.kind] ?? 0) + 1; }
    if (e.type === 'prayer_answered') f.answered++;
    if (e.type === 'prayer_ignored') f.ignored++;
    if (e.type === 'offering' || (e.type === 'decorated' && w.s.buildings.some((b) => b.id === e.buildingId && (b.type === 'shrine' || b.type === 'temple')))) f.offerings++;
    if (e.type === 'group_prayer') f.group++;
    if (e.type === 'converted') f.converted++;
    if (e.type === 'shaman_chosen') { f.shamans++; if (f.shamanDay < 0) f.shamanDay = day(e.tick); }
    if (e.type === 'building_completed' && e.kind === 'temple' && f.templeDay < 0) f.templeDay = day(e.tick);
    if (e.type === 'tier_changed') { if (e.tier > e.from) for (let t = e.from + 1; t <= e.tier; t++) d.tierDay[t] ??= day(e.tick); else d.lost++; }
    if (e.type === 'wish_fulfilled') d.kept++;
    if (e.type === 'wish_defied') d.defied++;
    if (e.type === 'god_spoke') d.spoke++;
    if (e.type === 'book_written') bk.written++;
    if (e.type === 'recipe_learned' && e.via === 'book') { bk.read++; if (e.recovered) bk.recovered++; }
    if (e.type === 'books_lost') bk.burned += e.bookIds.length;
    if (e.type === 'recipe_lost') bk.lost++;
  });
  return () => {
    const gs = w.s.goblins, faith = gs.length ? gs.reduce((a, g) => a + g.godView.faith, 0) / gs.length : 0;
    const earned = w.s.god.faith?.earned ?? {};
    const kinds = Object.entries(f.kinds).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(', ');
    const avg = (f: (g: (typeof gs)[number]) => number, d = 0): string => (gs.length ? gs.reduce((a, g) => a + f(g), 0) / gs.length : 0).toFixed(d);
    return `faith [avg ${faith.toFixed(0)} fear ${avg((g) => g.godView.fear)} love ${avg((g) => g.godView.love)} industry ${avg((g) => g.personality.industry, 3)} (drift ${avg((g) => g.personality.industry - (g.baseline?.industry ?? g.personality.industry), 3)}) floor ${avg((g) => g.personality.piety * CFG.faith.floor)} believers ${gs.filter((g) => g.godView.faith >= CFG.god.believerFaith).length} skeptics ${gs.filter((g) => g.godView.faith < CFG.god.skepticFaith).length}`
      + ` prayers ${f.asked} (desperate ${f.desperate}; ${kinds}) answered/ignored ${f.answered}/${f.ignored} offerings ${f.offerings} group ${f.group}`
      + ` shaman ${f.shamanDay < 0 ? '—' : 'day ' + f.shamanDay} (${f.shamans}) temple ${f.templeDay < 0 ? '—' : 'day ' + f.templeDay} favor ${w.s.god.favor.toFixed(0)}`
      + ` earned ${Object.entries(earned).map(([k, v]) => `${k} ${Number(v).toFixed(0)}`).join(' ')}]`
      + ` books [written ${bk.written} read ${bk.read} recovered ${bk.recovered}/${bk.lost} lost burned ${bk.burned} on shelves ${w.s.village.culture?.books?.length ?? 0}]`
      + (w.s.god.mode === 'divine' ? ` divine [tier ${w.s.god.tier} (days ${d.tierDay.slice(1).map((x) => x ?? '—').join('/') || '—'}, lost ${d.lost}) align ${w.s.god.alignment.toFixed(0)}`
        + ` spoke ${d.spoke} wishes kept/defied ${d.kept}/${d.defied}]` : '')
      + (w.s.commandLog.length ? ` acts ${tally(w.s.commandLog.map((c) => (c.cmd.type === 'god_cast' ? c.cmd.power : c.cmd.type)))}` : '');
  };
}
