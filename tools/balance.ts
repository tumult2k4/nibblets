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
import { bestWeapon } from '../src/sim/tools';

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
  bushes0: number; bushesEnd: number; planted: number; plantedMature: number; wood: number; stone: string; armed: number;
  housedAutumn: number; huts: number; weatherDeaths: number;
}

const meanHue = (hs: number[]): number => {
  const x = hs.reduce((a, h) => a + Math.cos((h * Math.PI) / 180), 0);
  const y = hs.reduce((a, h) => a + Math.sin((h * Math.PI) / 180), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

function runSeed(seed: number): Row {
  const w = createWorld({ seed });
  const bushCount = () => w.s.plants.filter((p) => p.kind === 'apple_bush' && (p.stage === 'mature' || p.stage === 'old')).length;
  const bushes0 = bushCount();
  const hue0 = meanHue(w.s.goblins.map((g) => express(g.genome, 'skinHue')));
  const ticks = days * CFG.time.dayTicks;
  let popMin = Infinity, popMax = 0, popSum = 0, samples = 0, starvationDays = 0;
  const t0 = performance.now();
  const autumnEnd = 3 * CFG.time.daysPerSeason * CFG.time.dayTicks;
  let housedAutumn = -1;
  const housedShare = () => {
    const adults = w.s.goblins.filter((g) => g.lifeStage === 'adult' || g.lifeStage === 'elder');
    const ok = adults.filter((g) => w.s.buildings.some((b) => b.id === g.homeId && b.buildProgress >= 1));
    return adults.length ? ok.length / adults.length : 1;
  };
  for (let t = 0; t < ticks; t++) {
    w.step();
    if (w.s.tick === autumnEnd) housedAutumn = housedShare();
    if (w.s.tick % CFG.time.dayTicks === 0) {
      const n = w.s.goblins.length;
      popMin = Math.min(popMin, n); popMax = Math.max(popMax, n); popSum += n; samples++;
      if (w.s.goblins.some((g) => g.needs.hunger <= 0)) starvationDays++;
    }
  }
  const tickMs = (performance.now() - t0) / ticks;
  const c = w.s.village.center;
  const near = (p: { pos: { x: number; y: number } }) => Math.hypot(p.pos.x - c.x, p.pos.y - c.y) <= CFG.plants.seedSiteVillageRadius + 2;
  const plantedMature = w.s.plants.filter((p) => p.plantedBy !== null && p.kind === 'apple_bush' && (p.stage === 'mature' || p.stage === 'old') && near(p)).length;
  const owned = (t: string) => w.s.groundItems.reduce((n, i) => n + (i.stack.type === t ? i.stack.qty : 0), 0)
    + w.s.goblins.reduce((n, g) => n + g.inventory.reduce((m, s) => m + (s.type === t ? s.qty : 0), 0), 0)
    + w.s.village.stockpile.reduce((n, s) => n + (s.type === t ? s.qty : 0), 0);
  const wood = owned('wood');
  const stone = `${owned('stone')}/${owned('flint')}/${owned('stick')}`;
  const armed = w.s.goblins.filter((g) => bestWeapon(g)).length;
  const deaths = { ...w.s.stats.deaths };
  const totalDeaths = Object.values(deaths).reduce((a, b) => a + b, 0);
  const hue1 = w.s.goblins.length ? meanHue(w.s.goblins.map((g) => express(g.genome, 'skinHue'))) : hue0;
  const fails: string[] = [];
  if (w.s.goblins.length === 0) fails.push('extinction');
  if (popMax > 3 * CFG.goblin.softCap) fails.push('overpopulation');
  if (totalDeaths > 0 && (deaths.starvation ?? 0) / totalDeaths > 0.2) fails.push('starvation>20%');
  if (tickMs > 2) fails.push('tick>2ms');
  if (days >= 20 && plantedMature < 8) fails.push('planted<8');
  if (bushCount() < bushes0 * 0.9) fails.push('bushes shrinking');
  if (days >= 10 && wood === 0) fails.push('no wood');
  const weatherDeaths = (deaths.hypothermia ?? 0) + (deaths.lightning ?? 0);
  if (housedAutumn >= 0 && housedAutumn < 0.8) fails.push('housed<80%');
  if (days >= 24 && weatherDeaths >= 2) fails.push('weather deaths');
  return {
    seed, popMin, popAvg: popSum / Math.max(1, samples), popMax, popEnd: w.s.goblins.length, births: w.s.stats.births,
    deaths, eaten: w.s.stats.eaten, divineFood: w.s.stats.divineFood, starvationDays,
    hueDrift: Math.abs(hueDelta(hue0, hue1)), tickMs, fails,
    bushes0, bushesEnd: bushCount(), planted: w.s.plants.filter((p) => p.plantedBy !== null).length, plantedMature, wood, stone, armed,
    housedAutumn, huts: w.s.buildings.filter((b) => b.buildProgress >= 1).length, weatherDeaths,
  };
}

const rows: Row[] = [];
for (let i = 0; i < seedCount; i++) {
  const r = runSeed(firstSeed + i);
  rows.push(r);
  console.log(`seed ${r.seed}: pop ${r.popEnd} (min ${r.popMin}, max ${r.popMax}) deaths ${JSON.stringify(r.deaths)} eaten ${r.eaten} bushes ${r.bushes0}→${r.bushesEnd} plantedMature ${r.plantedMature} wood ${r.wood} stone/flint/sticks ${r.stone} armed ${r.armed} huts ${r.huts} housed@autumn ${r.housedAutumn < 0 ? '—' : Math.round(r.housedAutumn * 100) + '%'} tick ${r.tickMs.toFixed(3)}ms ${r.fails.length ? 'FAIL ' + r.fails.join(',') : 'ok'}`);
}
const lines = [
  `# Balance report — ${days} days × ${seedCount} seeds`,
  '',
  '| seed | pop min/avg/max/end | births | deaths | starvation deaths | food eaten | god food | starvation days | hue drift° | bushes start→end | goblin-planted mature | wood | stone/flint/sticks | armed | huts | housed end of autumn | weather deaths | tick ms | result |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.seed} | ${r.popMin}/${r.popAvg.toFixed(1)}/${r.popMax}/${r.popEnd} | ${r.births} | ${Object.values(r.deaths).reduce((a, b) => a + b, 0)} ${JSON.stringify(r.deaths)} | ${r.deaths.starvation ?? 0} | ${r.eaten} | ${r.divineFood} | ${r.starvationDays} | ${r.hueDrift.toFixed(1)} | ${r.bushes0}→${r.bushesEnd} | ${r.plantedMature} | ${r.wood} | ${r.stone} | ${r.armed} | ${r.huts} | ${r.housedAutumn < 0 ? '—' : Math.round(r.housedAutumn * 100) + '%'} | ${r.weatherDeaths} | ${r.tickMs.toFixed(3)} | ${r.fails.length ? 'FAIL: ' + r.fails.join(', ') : 'ok'} |`),
  '',
  `Aggregate: avg end pop ${(rows.reduce((a, r) => a + r.popEnd, 0) / rows.length).toFixed(1)}, starvation deaths ${rows.reduce((a, r) => a + (r.deaths.starvation ?? 0), 0)}, avg tick ${(rows.reduce((a, r) => a + r.tickMs, 0) / rows.length).toFixed(3)} ms.`,
];
writeFileSync('balance-report.md', lines.join('\n') + '\n');
console.log(rows.some((r) => r.fails.length) ? 'BALANCE: FAIL' : 'BALANCE: ok', '→ balance-report.md');
