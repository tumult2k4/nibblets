/**
 * The performance scenario of §6 / P11.3: a village of 150 goblins, 600 plants and 20 enemies, run for a while and
 * timed tick by tick. `npx tsx tools/perf.ts [--ticks N] [--seed S] [--goblins G] [--plants P] [--enemies E]`.
 * For where the time goes, run it under the profiler: `node --cpu-prof --cpu-prof-dir=/tmp/prof --import tsx tools/perf.ts`
 * and sum the profile with `tools/profsum.ts`.
 */
import { performance } from 'node:perf_hooks';
import { createWorld } from '../src/sim/newWorld';
import { createGoblin } from '../src/sim/goblin/goblin';
import { registerLineage } from '../src/sim/goblin/family';
import { founderGenome } from '../src/sim/goblin/genetics/founders';
import { spawnPlant } from '../src/sim/plants';
import { spawnEnemy } from '../src/sim/enemies/director';
import { isWalkable } from '../src/sim/grid';
import { stateHash } from '../src/sim/save';
import type { PlantKind } from '../src/shared/types';

const arg = (k: string, d: number): number => (process.argv.includes(`--${k}`) ? Number(process.argv[process.argv.indexOf(`--${k}`) + 1]) : d);
const ticks = arg('ticks', 3600), seed = arg('seed', 1), G = arg('goblins', 150), P = arg('plants', 600), E = arg('enemies', 20);

const w = createWorld({ seed });
const s = w.s, c = s.village.center;
/** A walkable spot within `r` of `at`. */
function spot(at: { x: number; y: number }, r: number): { x: number; y: number } {
  for (let i = 0; i < 200; i++) {
    const x = Math.round((at.x + w.rng.range(-r, r)) * 100) / 100, y = Math.round((at.y + w.rng.range(-r, r)) * 100) / 100;
    if (x > 1 && y > 1 && x < s.size.w - 1 && y < s.size.h - 1 && isWalkable(s, Math.floor(x), Math.floor(y))) return { x, y };
  }
  return { ...at };
}
while (s.goblins.length < G) {
  const g = createGoblin(s, w.rng, { genome: founderGenome(w.rng, 'mixed'), pos: spot(c, 14), ageDays: w.rng.range(18, 60), clanId: s.clans[0]?.id ?? 0 });
  s.goblins.push(g);
  registerLineage(s, g);
}
const KINDS: PlantKind[] = ['apple_bush', 'tree', 'berry_bush', 'flower'];
while (s.plants.length < P) spawnPlant(w, KINDS[s.plants.length % KINDS.length]!, spot(c, 50), 'mature', null);
for (let i = 0; i < E; i++) spawnEnemy(w, 'gnasher', spot(c, 30)).summoned = true;
w.rebuildCaches();

const times: number[] = [], slow: string[] = [];
let pathMs = 0, paths = 0;
const path0 = w.path.bind(w);
w.path = (a, b) => { const t = performance.now(); const r = path0(a, b); pathMs += performance.now() - t; paths++; return r; };
const t0 = performance.now(), c0 = process.cpuUsage();
for (let i = 0; i < ticks; i++) {
  const a = performance.now();
  pathMs = 0; paths = 0;
  w.step();
  times.push(performance.now() - a);
  if (times[times.length - 1]! > 40) slow.push(`${s.tick}:${times[times.length - 1]!.toFixed(0)}(paths ${paths} ${pathMs.toFixed(0)}ms)`);
  if (s.enemies.length < E && i % 600 === 0) for (let k = s.enemies.length; k < E; k++) spawnEnemy(w, 'gnasher', spot(c, 30)).summoned = true;
}
const total = performance.now() - t0, cpu = process.cpuUsage(c0);
times.sort((a, b) => a - b);
const q = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))]!.toFixed(2);
if (process.argv.includes('--slow')) console.log('slow ticks (tick:ms)', slow.join(' '));
console.log(`perf seed ${seed}: ${s.goblins.length} goblins, ${s.plants.length} plants, ${s.enemies.length} enemies after ${ticks} ticks`);
console.log(`tick mean ${(total / ticks).toFixed(2)} ms (cpu ${((cpu.user + cpu.system) / 1000 / ticks).toFixed(2)}) · p50 ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · max ${q(1)} · hash ${stateHash(s).slice(0, 12)}`);
