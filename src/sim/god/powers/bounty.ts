/** Growth gifts (§17.5.1): Apple Shower and Bountiful Growth. */
import { CFG } from '../../config';
import { q4 } from '../../../shared/math';
import type { World } from '../../world';
import { spawnGroundItem } from '../../groundItems';
import { maxFruit, NEXT_STAGE, setStage, isGrowing } from '../../plants';
import { groundZ } from '../godState';
import { divineAct } from '../faith';
import type { CastTarget } from './nature';

const inside = (p: { x: number; y: number }, c: CastTarget): boolean => Math.hypot(p.x - c.pos.x, p.y - c.pos.y) <= c.radius;

/** 12–18 apples rain down across the area; fruit bushes inside gain one fruit. */
export function castAppleShower(w: World, c: CastTarget): void {
  const [lo, hi] = CFG.powers.showerApples;
  const n = w.rng.int(lo, hi);
  for (let i = 0; i < n; i++) {
    const a = w.rng.range(0, Math.PI * 2), r = Math.sqrt(w.rng.next()) * c.radius;
    const p = { x: q4(Math.min(w.s.size.w - 0.5, Math.max(0.5, c.pos.x + Math.cos(a) * r))), y: q4(Math.min(w.s.size.h - 0.5, Math.max(0.5, c.pos.y + Math.sin(a) * r))) };
    const air = { z: q4(groundZ(w, p) + CFG.god.spawnHeight + w.rng.range(0, 4)), vel: { x: 0, y: 0, z: 0 }, dropHeight: 0, throwSpeed: 0, held: false };
    spawnGroundItem(w, { type: 'apple', qty: 1, divine: true }, p, air);
  }
  for (const p of w.s.plants) if (inside(p.pos, c) && p.fruit < maxFruit(p)) p.fruit += 1;
  w.s.god.counts.gifts += n;
  divineAct(w, 'apple_shower', c.pos, undefined, true, { area: c.radius });
}

/** Every plant in the area grows one stage (or fills its fruit when grown) and is soaked. */
export function castBountifulGrowth(w: World, c: CastTarget): void {
  for (const p of [...w.s.plants]) {
    if (!inside(p.pos, c) || p.stage === 'dead' || p.stage === 'stump') continue;
    p.hydration = 1;
    const next = NEXT_STAGE[p.stage];
    if (isGrowing(p) && next) setStage(w, p, next);
    else p.fruit = maxFruit(p);
  }
  divineAct(w, 'bountiful_growth', c.pos, undefined, true, { area: c.radius });
}
