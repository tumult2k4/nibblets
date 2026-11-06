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
  w.bus.subscribe((e) => {
    if (e.type === 'prayer') { f.asked++; if (e.desperate) f.desperate++; f.kinds[e.kind] = (f.kinds[e.kind] ?? 0) + 1; }
    if (e.type === 'prayer_answered') f.answered++;
    if (e.type === 'prayer_ignored') f.ignored++;
    if (e.type === 'offering' || (e.type === 'decorated' && w.s.buildings.some((b) => b.id === e.buildingId && (b.type === 'shrine' || b.type === 'temple')))) f.offerings++;
    if (e.type === 'group_prayer') f.group++;
    if (e.type === 'converted') f.converted++;
    if (e.type === 'shaman_chosen') { f.shamans++; if (f.shamanDay < 0) f.shamanDay = day(e.tick); }
    if (e.type === 'building_completed' && e.kind === 'temple' && f.templeDay < 0) f.templeDay = day(e.tick);
  });
  return () => {
    const gs = w.s.goblins, faith = gs.length ? gs.reduce((a, g) => a + g.godView.faith, 0) / gs.length : 0;
    const earned = w.s.god.faith?.earned ?? {};
    const kinds = Object.entries(f.kinds).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(', ');
    return `faith [avg ${faith.toFixed(0)} believers ${gs.filter((g) => g.godView.faith >= CFG.god.believerFaith).length} skeptics ${gs.filter((g) => g.godView.faith < CFG.god.skepticFaith).length}`
      + ` prayers ${f.asked} (desperate ${f.desperate}; ${kinds}) answered/ignored ${f.answered}/${f.ignored} offerings ${f.offerings} group ${f.group}`
      + ` shaman ${f.shamanDay < 0 ? '—' : 'day ' + f.shamanDay} (${f.shamans}) temple ${f.templeDay < 0 ? '—' : 'day ' + f.templeDay} favor ${w.s.god.favor.toFixed(0)}`
      + ` earned ${Object.entries(earned).map(([k, v]) => `${k} ${Number(v).toFixed(0)}`).join(' ')}]`;
  };
}
