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
import { isLit } from '../src/sim/fire';
import { ACTIONS } from '../src/sim/ai/utility';
import { ringTiles } from '../src/sim/fences';
import { RECIPES } from '../src/sim/recipes';
import { bestSkill } from '../src/sim/goblin/skills';
import type { Goblin } from '../src/sim/state';
import { generations } from '../src/sim/goblin/lineage';

const arg = (name: string, def: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const days = arg('days', 96);
const seedCount = arg('seeds', 5);
const firstSeed = arg('seed', 1);
/** control run (P4 acceptance): nobody can craft or knows any Phase 4 recipe, so no spears, campfire, torches or fences */
const noCraft = process.argv.includes('--no-craft');
if (noCraft) ACTIONS.craft.isAvailable = () => false;
const forgetCrafts = (gs: Goblin[]): void => {
  for (const g of gs) g.knownRecipes = g.knownRecipes.filter((id) => (RECIPES[id]?.phase ?? 0) < 4);
};
/** control run (P5 acceptance): nobody ever thinks of a grinding stone, drying rack or storage pit — winter should bite */
const noPreserve = process.argv.includes('--no-preserve');
if (noPreserve) (CFG.preserve as { enabled: boolean }).enabled = false;

interface Row {
  /** deaths and everyone who lived there (founders + newcomers), for the control run's loss share */
  lost: number; residents: number;
  seed: number; popMin: number; popAvg: number; popMax: number; popEnd: number; births: number;
  deaths: Record<string, number>; eaten: number; divineFood: number; starvationDays: number;
  hueDrift: number; tickMs: number; fails: string[];
  bushes0: number; bushesEnd: number; planted: number; plantedMature: number; wood: number; stone: string; armed: number; fires: string; foes: string;
  housedAutumn: number; huts: number; weatherDeaths: number; veterans: number; fences: string; rare: string;
  /** P5: best skill per goblin (level ≥ 2), the top level, and mutual friendships */
  specialists: string; friends: number;
  /** P5.6: goblins at hunger 0 summed over winter days (sampled at dawn), starvation deaths in winter, food rotted, preserves made */
  winterStarve: number; winterDeaths: number; spoiled: number; preserved: string;
  /** P5 acceptance: generations in the lineage book (founders = 1), and the living's average hue at the start and end */
  generations: number; hue: string;
  /** P6.1: cases by disease, and how often a friend tended the sick */
  ill: string; tended: number;
  /** P6.5: remedies made / doses taken, and the day the idea first came (— if never) */
  remedies: string;
  /** P6.2: wildfires started (by cause), tiles burned, buildings lost to fire */
  wildfires: string;
  /** P6.3: floods / droughts / blight outbreaks (bushes caught, culled) / shooting stars */
  disasters: string;
  /** P6.4: buried in the graveyard / covered where they lay / visits to graves */
  rites: string;
}

const meanHue = (hs: number[]): number => {
  const x = hs.reduce((a, h) => a + Math.cos((h * Math.PI) / 180), 0);
  const y = hs.reduce((a, h) => a + Math.sin((h * Math.PI) / 180), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

function runSeed(seed: number): Row {
  const w = createWorld({ seed });
  if (noCraft) forgetCrafts(w.s.goblins);
  const founders = w.s.goblins.length;
  const bushCount = () => w.s.plants.filter((p) => p.kind === 'apple_bush' && (p.stage === 'mature' || p.stage === 'old')).length;
  const bushes0 = bushCount();
  const hue0 = meanHue(w.s.goblins.map((g) => express(g.genome, 'skinHue')));
  const ticks = days * CFG.time.dayTicks;
  let popMin = Infinity, popMax = 0, popSum = 0, samples = 0, starvationDays = 0;
  const t0 = performance.now();
  const foes = { spawned: 0, stolen: 0, bites: 0, fled: 0, killed: 0, wounds: 0 };
  let winterStarve = 0, winterDeaths = 0, mash = 0, dried = 0;
  const rare = { beasts: 0, smashed: 0, wisps: 0, lured: 0, newcomers: 0 };
  const ill: Record<string, number> = {};
  let tended = 0, burnedB = 0, remediesMade = 0, doses = 0, remedyDay = -1;
  const fireCauses: Record<string, number> = {};
  const dis = { flood: 0, drought: 0, blight: 0, culled: 0, star: 0, floodLost: 0 };
  const rites = { buried: 0, mounds: 0, mourned: 0 };
  w.bus.subscribe((e) => {
    if (e.type === 'fell_ill') ill[e.disease] = (ill[e.disease] ?? 0) + 1;
    if (e.type === 'tended') tended++;
    if (e.type === 'item_crafted' && e.item === 'herbal_remedy') remediesMade++;
    if (e.type === 'took_remedy') doses++;
    if (e.type === 'recipe_discovered' && e.recipe === 'herbal_remedy' && remedyDay < 0) remedyDay = Math.floor(w.s.tick / CFG.time.dayTicks);
    if (e.type === 'fire_started') fireCauses[e.cause] = (fireCauses[e.cause] ?? 0) + 1;
    if (e.type === 'building_destroyed' && e.cause === 'fire') burnedB++;
    if (e.type === 'flood_started') dis.flood++;
    else if (e.type === 'drought_started') dis.drought++;
    else if (e.type === 'blight_started') dis.blight++;
    else if (e.type === 'blight_culled') dis.culled++;
    else if (e.type === 'shooting_star') dis.star++;
    else if (e.type === 'building_destroyed' && e.cause === 'flood') dis.floodLost++;
    else if (e.type === 'buried') rites[e.byId === null ? 'mounds' : 'buried']++;
    else if (e.type === 'mourned') rites.mourned++;
    if (e.type === 'goblin_died' && e.cause === 'starvation' && w.clock.season === 'winter') winterDeaths++;
    if (e.type === 'food_processed') { if (e.item === 'apple_mash') mash += e.qty; else dried += e.qty; }
    if (e.type === 'enemy_spawned' && e.kind !== 'gnasher') rare[e.kind === 'bramblebeast' ? 'beasts' : 'wisps']++;
    else if (e.type === 'building_destroyed' && e.cause === 'bramblebeast') rare.smashed++;
    else if (e.type === 'wisp' && e.phase === 'lure') rare.lured++;
    else if (e.type === 'immigrants') {
      rare.newcomers += e.goblinIds.length;
      if (noCraft) forgetCrafts(w.s.goblins.filter((g) => e.goblinIds.includes(g.id)));
    }
    else if (e.type === 'enemy_spawned') foes.spawned++;
    else if (e.type === 'enemy_stole') foes.stolen += e.qty;
    else if (e.type === 'enemy_bit' && e.damage > 0) foes.bites++;
    else if (e.type === 'enemy_fled') foes.fled++;
    else if (e.type === 'enemy_killed') foes.killed++;
    else if (e.type === 'injured') foes.wounds++;
  });
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
      if (w.clock.season === 'winter') winterStarve += w.s.goblins.filter((g) => g.needs.hunger <= 0).length;
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
  const fires = `${w.s.buildings.filter((b) => b.type === 'campfire' && b.buildProgress >= 1).length}/${w.s.buildings.filter(isLit).length}`;
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
  if (!noCraft && (deaths.combat ?? 0) > 3) fails.push('combat deaths>3');
  if (!noPreserve && !noCraft && winterDeaths > 1) fails.push('winter starvation');
  const gens = 1 + Math.max(0, ...generations(w.s).values());
  if (days >= 96 && !noPreserve && !noCraft && gens < 3) fails.push('generations<3');
  const spec: Record<string, number> = {};
  let top = 0;
  for (const g of w.s.goblins) {
    const b = bestSkill(g);
    if (b && b.level >= 2) spec[b.id] = (spec[b.id] ?? 0) + 1;
    top = Math.max(top, b?.level ?? 0);
  }
  const friendBond = (g: Goblin, id: number) => ['friend', 'best_friend'].includes(g.relationships.find((r) => r.targetId === id)?.bond ?? '');
  const friends = w.s.goblins.reduce((n, g) => n + g.relationships.filter((r) => r.targetId > g.id && friendBond(g, r.targetId) && friendBond(w.goblin(r.targetId) ?? g, g.id)).length, 0);
  return {
    winterStarve, winterDeaths, spoiled: w.s.stats.spoiled ?? 0, preserved: `${mash}/${dried}`, generations: gens, hue: `${Math.round(hue0)}°→${Math.round(hue1)}°`,
    ill: Object.entries(ill).map(([k, v]) => `${k} ${v}`).join(', ') || '—', tended,
    remedies: `${remediesMade}/${doses} (idea ${remedyDay < 0 ? '—' : 'day ' + remedyDay})`,
    rites: `${rites.buried}/${rites.mounds}/${rites.mourned}`,
    disasters: `${dis.flood}/${dis.drought}/${dis.blight} (culled ${dis.culled})/${dis.star}${dis.floodLost ? ` huts lost ${dis.floodLost}` : ''}`,
    wildfires: `${Object.entries(fireCauses).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} / ash ${w.s.tiles.filter((t) => t.ash).length} / burned ${burnedB}`,
    specialists: `${Object.entries(spec).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—'} · top ${top.toFixed(1)}`, friends,
    lost: totalDeaths, residents: founders + rare.newcomers,
    seed, popMin, popAvg: popSum / Math.max(1, samples), popMax, popEnd: w.s.goblins.length, births: w.s.stats.births,
    deaths, eaten: w.s.stats.eaten, divineFood: w.s.stats.divineFood, starvationDays,
    hueDrift: Math.abs(hueDelta(hue0, hue1)), tickMs, fails,
    bushes0, bushesEnd: bushCount(), planted: w.s.plants.filter((p) => p.plantedBy !== null).length, plantedMature, wood, stone, armed, fires, foes: `${foes.spawned}/${foes.stolen}/${foes.bites}/${foes.fled}/${foes.killed}/${foes.wounds}`, veterans: w.s.goblins.filter((g) => g.traits.includes('veteran')).length,
    housedAutumn, huts: w.s.buildings.filter((b) => (b.type === 'hut' || b.type === 'stone_hut') && b.buildProgress >= 1).length, weatherDeaths,
    rare: `${rare.beasts}/${rare.smashed} ${rare.wisps}/${rare.lured} ${rare.newcomers}`,
    fences: `${w.s.buildings.filter((b) => b.type === 'fence' && b.buildProgress >= 1).length}/${w.s.village.fenceRing ? ringTiles(w.s, w.s.village.fenceRing).length : 0}`,
  };
}

const rows: Row[] = [];
for (let i = 0; i < seedCount; i++) {
  const r = runSeed(firstSeed + i);
  rows.push(r);
  console.log(`seed ${r.seed}: pop ${r.popEnd} (min ${r.popMin}, max ${r.popMax}) deaths ${JSON.stringify(r.deaths)} eaten ${r.eaten} bushes ${r.bushes0}→${r.bushesEnd} plantedMature ${r.plantedMature} wood ${r.wood} stone/flint/sticks ${r.stone} armed ${r.armed} fires ${r.fires} gnashers/stolen/bites/fled/killed/wounds ${r.foes} veterans ${r.veterans} huts ${r.huts} fences ${r.fences} beasts/smashed wisps/lured newcomers ${r.rare} housed@autumn ${r.housedAutumn < 0 ? '—' : Math.round(r.housedAutumn * 100) + '%'} specialists ${r.specialists} friends ${r.friends} winterStarve ${r.winterStarve} winterDeaths ${r.winterDeaths} spoiled ${r.spoiled} mash/dried ${r.preserved} generations ${r.generations} hue ${r.hue} (drift ${r.hueDrift.toFixed(1)}°) ill [${r.ill}] tended ${r.tended} remedies ${r.remedies} wildfires [${r.wildfires}] floods/droughts/blight/stars ${r.disasters} buried/mounds/mourned ${r.rites} tick ${r.tickMs.toFixed(3)}ms ${r.fails.length ? 'FAIL ' + r.fails.join(',') : 'ok'}`);
}
const lines = [
  `# Balance report — ${days} days × ${seedCount} seeds${noCraft ? ' (control: no crafting)' : ''}${noPreserve ? ' (control: no preservation)' : ''}`,
  '',
  '| seed | pop min/avg/max/end | births | deaths | starvation deaths | food eaten | god food | starvation days | hue drift° | bushes start→end | goblin-planted mature | wood | stone/flint/sticks | armed | campfires built/lit | gnashers/stolen/bites/fled/killed/wounds | huts | fence posts/ring | housed end of autumn | weather deaths | specialists (best skill ≥ 2) | friend pairs | winter starving goblin-days / deaths | food rotted | mash/dried made | generations | avg hue start→end | illnesses | tended | tick ms | result |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.seed} | ${r.popMin}/${r.popAvg.toFixed(1)}/${r.popMax}/${r.popEnd} | ${r.births} | ${Object.values(r.deaths).reduce((a, b) => a + b, 0)} ${JSON.stringify(r.deaths)} | ${r.deaths.starvation ?? 0} | ${r.eaten} | ${r.divineFood} | ${r.starvationDays} | ${r.hueDrift.toFixed(1)} | ${r.bushes0}→${r.bushesEnd} | ${r.plantedMature} | ${r.wood} | ${r.stone} | ${r.armed} | ${r.fires} | ${r.foes} | ${r.huts} | ${r.fences} | ${r.housedAutumn < 0 ? '—' : Math.round(r.housedAutumn * 100) + '%'} | ${r.weatherDeaths} | ${r.specialists} | ${r.friends} | ${r.winterStarve} / ${r.winterDeaths} | ${r.spoiled} | ${r.preserved} | ${r.generations} | ${r.hue} | ${r.ill} | ${r.tended} | ${r.tickMs.toFixed(3)} | ${r.fails.length ? 'FAIL: ' + r.fails.join(', ') : 'ok'} |`),
  '',
  `Aggregate: avg end pop ${(rows.reduce((a, r) => a + r.popEnd, 0) / rows.length).toFixed(1)}, starvation deaths ${rows.reduce((a, r) => a + (r.deaths.starvation ?? 0), 0)}, avg tick ${(rows.reduce((a, r) => a + r.tickMs, 0) / rows.length).toFixed(3)} ms.`,
];
// P4 acceptance: without crafting (no spears, fire, torches or fences) the villages lose at least 30 % of their goblins
const lostShare = rows.reduce((a, r) => a + r.lost, 0) / Math.max(1, rows.reduce((a, r) => a + r.residents, 0));
const controlFail = noCraft && lostShare < 0.3;
if (noCraft) {
  const line = `Control: lost ${Math.round(lostShare * 100)} % of all goblins (≥ 30 % expected) — ${controlFail ? 'FAIL' : 'ok'}`;
  lines.push('', line);
  console.log(line);
}
// P5 acceptance: without preservation the winters bring starvation (≥ 3 starving goblin-days per seed on average)
const winterStarve = rows.reduce((a, r) => a + r.winterStarve, 0);
const preserveFail = noPreserve && winterStarve < 3 * rows.length;
if (noPreserve) {
  const line = `Control: ${winterStarve} starving goblin-days in winter, ${rows.reduce((a, r) => a + r.winterDeaths, 0)} winter starvation deaths (spikes expected) — ${preserveFail ? 'FAIL' : 'ok'}`;
  lines.push('', line);
  console.log(line);
}
writeFileSync('balance-report.md', lines.join('\n') + '\n');
// in the control run losses (even a village dying out) are the point; only its loss share and tick time decide
const control = noCraft || noPreserve;
const seedFail = rows.some((r) => r.fails.some((f) => !control || f.startsWith('tick')));
console.log(seedFail || controlFail || preserveFail ? 'BALANCE: FAIL' : 'BALANCE: ok', '→ balance-report.md');
