/**
 * The shaman (§17.4, P8.8): the most faithful grown goblin of piety ≥ 0.6 (not the chief, not in exile); a rival
 * must outdo the shaman by 10 faith to take its place. It wears bone and feathers, leads the village in prayer
 * (`LeadPrayer`), reads the god's omens (god superstitions form twice as fast) and makes the god's words carry (the
 * Voice costs 40 % less while it lives, P8.9). A chief of little piety (under 0.35) and the shaman think a little
 * less of each other every day: a politics of their own. Once three believe and a shaman lives, the shaman names
 * the god after what it has mostly done and its temper (a template; the Voice may rename it).
 */
import { CFG } from '../config';
import type { Goblin } from '../state';
import type { World } from '../world';
import { isExiled } from '../leadership';
import { addMood } from '../goblin/mood';
import { adjustOpinion } from '../goblin/social';
import { believers } from './favor';
import { faithOf } from './faithState';

const S = CFG.faith.shaman, DAY = CFG.time.dayTicks;
/** the shaman's round: once a day, a fifth of the way in */
const AT = Math.floor(DAY * 0.2);

export const shamanOf = (w: World): Goblin | undefined => w.s.goblins.find((g) => g.role === 'shaman');

const eligible = (g: Goblin, w: World): boolean =>
  (g.lifeStage === 'adult' || g.lifeStage === 'elder') && g.personality.piety >= S.minPiety && g.role !== 'chief' && !isExiled(g, w);

/** Choose the shaman now (keeping the one there is unless someone outdoes it). Returns it. */
export function chooseShaman(w: World): Goblin | null {
  const cur = shamanOf(w);
  let best: Goblin | null = null;
  for (const g of w.s.goblins) if (eligible(g, w) && (!best || g.godView.faith > best.godView.faith)) best = g;
  if (cur && eligible(cur, w) && (!best || best === cur || best.godView.faith < cur.godView.faith + S.margin)) return cur;
  if (cur) cur.role = 'none';
  if (!best) return null;
  best.role = 'shaman';
  addMood(w, best, 'made_shaman', 6, DAY);
  w.emit({ type: 'shaman_chosen', goblinId: best.id, previousId: cur?.id ?? null, at: { ...best.pos } });
  return best;
}

/** What kind of god it has been, by the acts the village has seen most. */
export function actFamily(act: string): 'hand' | 'giver' | 'sky' | 'storm' | 'light' {
  if (['grab', 'set_down', 'drop', 'throw', 'pet', 'poke', 'flick', 'hurt'].includes(act)) return 'hand';
  if (['rain', 'clear_sky', 'snowfall', 'gust', 'warm_sun', 'fast_forward', 'hasten_season'].includes(act)) return 'sky';
  if (['lightning', 'meteor', 'swarm', 'curse', 'blight', 'summon_gnashers', 'summon_bramblebeast', 'plague', 'flood', 'earthquake'].includes(act)) return 'storm';
  if (['vision', 'revelation', 'sanctuary', 'bring_forth', 'resurrect'].includes(act)) return 'light';
  return 'giver';
}

/** A divine act seen: counted toward what the god will be called. */
export function countAct(w: World, act: string): void {
  const a = (faithOf(w.s).acts ??= {}), f = actFamily(act);
  a[f] = (a[f] ?? 0) + 1;
}

/** The shaman names the god: `@<family>.<temper>`, worded by the UI per language. */
export function nameGod(w: World): string | null {
  const s = w.s;
  if (s.god.godName || !shamanOf(w) || believers(w) < CFG.faith.naming.believers) return null;
  const acts = Object.entries(s.god.faith?.acts ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!acts.length) return null;
  const temper = s.god.alignment > 20 ? 'kind' : s.god.alignment < -20 ? 'dread' : 'great';
  s.god.godName = `@${acts[0]![0]}.${temper}`;
  w.emit({ type: 'god_named', name: s.god.godName });
  return s.god.godName;
}

/** Daily: the shaman chosen (or kept), the god named, the chief and the shaman at odds. */
export function updateShaman(w: World): void {
  if (w.s.tick % DAY !== AT) return;
  const sh = chooseShaman(w);
  if (!sh) return;
  nameGod(w);
  const c = w.s.village.chiefId !== null ? w.goblin(w.s.village.chiefId) : undefined;
  if (c && c !== sh && c.personality.piety < S.rivalPiety) {
    adjustOpinion(w, c, sh, -S.rivalOpinion);
    adjustOpinion(w, sh, c, -S.rivalOpinion);
  }
}
