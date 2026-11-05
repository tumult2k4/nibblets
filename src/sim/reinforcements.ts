/**
 * Reinforcements (§P4.7, until P5 brings eggs and migration): while `spawnReinforcements` is on, every 8th morning a
 * village of fewer than six gets a pair of founder-like newcomers of its own clan, walking in from 14 tiles out.
 */
import { CFG } from './config';
import { q4 } from '../shared/math';
import { isWalkable } from './grid';
import { createGoblin } from './goblin/goblin';
import { seedClanRelations } from './goblin/social';
import { CLAN_ARCHETYPES, founderGenome, type ClanArchetype } from './goblin/genetics/founders';
import type { Vec2 } from '../shared/types';
import type { World } from './world';

const R = CFG.reinforcements;
const DAY = CFG.time.dayTicks;

function arrivalSpot(w: World): Vec2 {
  const c = w.s.village.center;
  for (let i = 0; i < 24; i++) {
    const a = w.rng.range(0, Math.PI * 2), r = R.edgeDist * w.rng.range(0.8, 1);
    const p = { x: q4(c.x + Math.cos(a) * r), y: q4(c.y + Math.sin(a) * r) };
    if (isWalkable(w.s, Math.floor(p.x), Math.floor(p.y))) return p;
  }
  return { ...c };
}

export function updateReinforcements(w: World): void {
  const s = w.s;
  if (!CFG.spawnReinforcements || s.tick % DAY !== Math.round(R.atFrac * DAY)) return;
  const day = Math.floor(s.tick / DAY);
  if (day === 0 || day % R.everyDays !== 0 || s.goblins.length >= R.below) return;
  const clan = s.clans[0];
  const arch = (CLAN_ARCHETYPES as readonly string[]).includes(clan?.archetype ?? '') ? (clan!.archetype as ClanArchetype) : 'mixed';
  const at = arrivalSpot(w);
  const ids: number[] = [];
  const n = Math.min(R.count, R.below - s.goblins.length);
  for (let i = 0; i < n; i++) {
    const pos = { x: q4(at.x + w.rng.range(-0.8, 0.8)), y: q4(at.y + w.rng.range(-0.8, 0.8)) };
    const age = w.rng.range(CFG.goblin.startAgeDays[0], CFG.goblin.startAgeDays[1]);
    const g = createGoblin(s, w.rng, { genome: founderGenome(w.rng, arch), pos, ageDays: age, clanId: clan?.id ?? 0 });
    s.goblins.push(g);
    ids.push(g.id);
  }
  seedClanRelations(w.rng, s.goblins.filter((g) => ids.includes(g.id)));
  if (ids.length) w.emit({ type: 'immigrants', goblinIds: ids, at });
}
