/**
 * Favor (§17.4, P8.8), the Divine mode's currency, earned in every mode and spent only in Divine mode. Each goblin's
 * faith brings in (faith / 100) × (0.5 + piety) a day, counted hourly; at prayer, three times that for the kneeling
 * (×1.5 near a consecrated temple, ×1.5 led by the shaman, ×2 a prayer of thanks). An offering brings its value
 * when the god takes it a day later (a trinket ×2, food ×0.5); a festival in the god's honor (Starfall, or one held
 * at the temple) +20; an answered prayer +5. Favor never passes 100 + 15 × believers (faith ≥ 40).
 */
import { CFG } from '../config';
import { clamp, q4 } from '../../shared/math';
import type { Goblin } from '../state';
import type { World } from '../world';
import { itemDef } from '../items';
import { faithOf, type FaithState } from './faithState';

const G = CFG.god, DAY = CFG.time.dayTicks;

export const believers = (w: World): number => w.s.goblins.filter((g) => g.godView.faith >= G.believerFaith).length;
export const maxFavor = (w: World): number => G.maxFavorBase + G.maxFavorPerBeliever * believers(w);

/** Add (or take) favor, within its bounds, and note where it came from. */
export function addFavor(w: World, n: number, from: keyof FaithState['earned']): void {
  const before = w.s.god.favor;
  w.s.god.favor = q4(clamp(before + n, 0, Math.max(before, maxFavor(w))));
  const e = faithOf(w.s).earned;
  e[from] = q4(e[from] + w.s.god.favor - before);
}

/** What a goblin's faith is worth a day. */
const worth = (g: Goblin): number => (g.godView.faith / 100) * (0.5 + g.personality.piety);

/** A prayer's extra: kneeling `ticks` at ×3 (× `mul`) instead of the everyday ×1. */
export function prayerFavor(w: World, g: Goblin, ticks: number, mul: number): void {
  addFavor(w, worth(g) * (G.prayingFavorMul * mul - 1) * ticks / DAY, 'prayers');
}

/** Hourly: the faithful's everyday favor, and the offerings the god takes (a day after they were laid). */
export function updateFavor(w: World): void {
  const s = w.s;
  if (s.tick % G.hourTicks !== 0) return;
  addFavor(w, s.goblins.reduce((a, g) => a + worth(g), 0) * G.hourTicks / DAY, 'faith');
  const fs = faithOf(s), due = s.tick - CFG.faith.offering.takeDays * DAY;
  if (!fs.offerings.some((o) => o.tick <= due)) return;
  for (const o of fs.offerings.filter((x) => x.tick <= due)) {
    const b = s.buildings.find((x) => x.id === o.buildingId);
    if (o.trinketId !== undefined) {
      if (b) b.decoration = b.decoration.filter((id) => id !== o.trinketId);
      s.trinkets = s.trinkets.filter((t) => t.id !== o.trinketId);
    }
    if (b) addFavor(w, o.value, 'offerings');
  }
  fs.offerings = fs.offerings.filter((x) => x.tick > due);
}

/** What an offering is worth to the god. */
export function offeringValue(w: World, o: { trinketId?: number; item?: Parameters<typeof itemDef>[0] }): number {
  if (o.trinketId !== undefined) {
    const t = w.s.trinkets.find((x) => x.id === o.trinketId);
    return t ? CFG.trinkets.value[t.rarity] * G.offeringTrinketMul : 0;
  }
  return o.item ? itemDef(o.item).value * G.offeringFoodMul : 0;
}
