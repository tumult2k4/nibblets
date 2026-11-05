/**
 * Headless multi-seed balance runner (§20.4). P1 skeleton: population, deaths by cause, food, tick time.
 *   npm run balance -- --days 10 --seeds 5
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createWorld } from '../src/sim/newWorld';
import { CFG } from '../src/sim/config';
import { express } from '../src/sim/goblin/genetics/phenotype';
import { hueDelta } from '../src/shared/math';

const arg = (name: string, def: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const days = arg('days', 96);
const seedCount = arg('seeds', 5);
const firstSeed = arg('seed', 1);

interface Row {
  seed: number; popMin: number; popAvg: number; popMax: number; popEnd: number; births: number;
  deaths: Record<string, number>; eaten: number; divineFood: number; starvationDays: number;
  hueDrift: number; tickMs: number; fails: string[];
}

const meanHue = (hs: number[]): number => {
  const x = hs.reduce((a, h) => a + Math.cos((h * Math.PI) / 180), 0);
  const y = hs.reduce((a, h) => a + Math.sin((h * Math.PI) / 180), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

function runSeed(seed: number): Row {
  const w = createWorld({ seed });
  const hue0 = meanHue(w.s.goblins.map((g) => express(g.genome, 'skinHue')));
  const ticks = days * CFG.time.dayTicks;
  let popMin = Infinity, popMax = 0, popSum = 0, samples = 0, starvationDays = 0;
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    w.step();
    if (w.s.tick % CFG.time.dayTicks === 0) {
      const n = w.s.goblins.length;
      popMin = Math.min(popMin, n); popMax = Math.max(popMax, n); popSum += n; samples++;
      if (w.s.goblins.some((g) => g.needs.hunger <= 0)) starvationDays++;
    }
  }
  const tickMs = (performance.now() - t0) / ticks;
  const deaths = { ...w.s.stats.deaths };
  const totalDeaths = Object.values(deaths).reduce((a, b) => a + b, 0);
  const hue1 = w.s.goblins.length ? meanHue(w.s.goblins.map((g) => express(g.genome, 'skinHue'))) : hue0;
  const fails: string[] = [];
  if (w.s.goblins.length === 0) fails.push('extinction');
  if (popMax > 3 * CFG.goblin.softCap) fails.push('overpopulation');
  if (totalDeaths > 0 && (deaths.starvation ?? 0) / totalDeaths > 0.2) fails.push('starvation>20%');
  if (tickMs > 2) fails.push('tick>2ms');
  return {
    seed, popMin, popAvg: popSum / Math.max(1, samples), popMax, popEnd: w.s.goblins.length, births: w.s.stats.births,
    deaths, eaten: w.s.stats.eaten, divineFood: w.s.stats.divineFood, starvationDays,
    hueDrift: Math.abs(hueDelta(hue0, hue1)), tickMs, fails,
  };
}

const rows: Row[] = [];
for (let i = 0; i < seedCount; i++) {
  const r = runSeed(firstSeed + i);
  rows.push(r);
  console.log(`seed ${r.seed}: pop ${r.popEnd} (min ${r.popMin}, max ${r.popMax}) deaths ${JSON.stringify(r.deaths)} eaten ${r.eaten} tick ${r.tickMs.toFixed(3)}ms ${r.fails.length ? 'FAIL ' + r.fails.join(',') : 'ok'}`);
}
const lines = [
  `# Balance report — ${days} days × ${seedCount} seeds`,
  '',
  '| seed | pop min/avg/max/end | births | deaths | starvation deaths | food eaten | god food | starvation days | hue drift° | tick ms | result |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.seed} | ${r.popMin}/${r.popAvg.toFixed(1)}/${r.popMax}/${r.popEnd} | ${r.births} | ${Object.values(r.deaths).reduce((a, b) => a + b, 0)} ${JSON.stringify(r.deaths)} | ${r.deaths.starvation ?? 0} | ${r.eaten} | ${r.divineFood} | ${r.starvationDays} | ${r.hueDrift.toFixed(1)} | ${r.tickMs.toFixed(3)} | ${r.fails.length ? 'FAIL: ' + r.fails.join(', ') : 'ok'} |`),
  '',
  `Aggregate: avg end pop ${(rows.reduce((a, r) => a + r.popEnd, 0) / rows.length).toFixed(1)}, starvation deaths ${rows.reduce((a, r) => a + (r.deaths.starvation ?? 0), 0)}, avg tick ${(rows.reduce((a, r) => a + r.tickMs, 0) / rows.length).toFixed(3)} ms.`,
];
writeFileSync('balance-report.md', lines.join('\n') + '\n');
console.log(rows.some((r) => r.fails.length) ? 'BALANCE: FAIL' : 'BALANCE: ok', '→ balance-report.md');
