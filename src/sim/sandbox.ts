/**
 * Sandbox drawer operations (§17.5.6, P5.9): spawn anything, breed any two goblins, make a goblin from a genome or
 * reshape a living one's looks, set needs, mood and faith, change the weather, remove things. Sandbox mode only; like
 * every god act they are commands, so replays reproduce them.
 */
import { q4 } from '../shared/math';
import { possess, possessed, possessedAct, POSSESS_ACTS, type PossessAct } from './possess';
import { allocId } from '../shared/ids';
import type { BuildingType, EnemyKind, ID, PlantKind, PlantStage, Vec2, WeatherKind } from '../shared/types';
import { CFG } from './config';
import type { Egg, Goblin, NeedId } from './state';
import type { World } from './world';
import { buildingDef, completeBuilding, placeBlueprint, siteClear, siteTilesOk } from './buildings';
import { WEATHER_KINDS, setWeather } from './weather';
import { spawnPlant } from './plants';
import { spawnEnemy } from './enemies/director';
import { spawnBramblebeast } from './enemies/bramblebeast';
import { spawnWisp } from './enemies/wisp';
import { tileAt } from './grid';
import { clampAllele, LOCUS_DEFS, meiosis, type Genome, type LocusDef, type LocusId } from './goblin/genetics/genome';
import { founderGenome } from './goblin/genetics/founders';
import { createGoblin } from './goblin/goblin';
import { registerLineage } from './goblin/family';
import { lineageEntry } from './goblin/lineage';
import { moodTarget } from './goblin/mood';

export type GodStat = 'mood' | 'faith' | 'love' | 'fear';

export type SandboxOp =
  | { op: 'remove'; id: ID }
  | { op: 'set_need'; goblinId: ID; need: NeedId; value: number }
  | { op: 'set_stat'; goblinId: ID; stat: GodStat; value: number }
  | { op: 'set_weather'; kind: WeatherKind }
  | { op: 'spawn_building'; kind: BuildingType; pos: Vec2; complete: boolean }
  | { op: 'spawn_plant'; kind: PlantKind; stage: PlantStage; pos: Vec2 }
  | { op: 'spawn_enemy'; kind: EnemyKind; pos: Vec2 }
  | { op: 'spawn_egg'; pos: Vec2 }
  | { op: 'spawn_goblin'; genome: Genome; pos: Vec2; ageDays: number }
  | { op: 'breed'; aId: ID; bId: ID }
  | { op: 'edit_genome'; goblinId: ID; genome: Partial<Genome> }
  /** a village policy, until there is a chief to set it (P6.5 quarantine; P8 policies) */
  | { op: 'set_policy'; policy: 'quarantine'; on: boolean }
  /** P11.1 Possess: take a goblin over (null lets go), and have it act on what the player clicked */
  | { op: 'possess'; goblinId: ID | null }
  | { op: 'possessed_act'; act: PossessAct; pos: Vec2; targetId?: ID };

/** The loci the genome editor may change on a living goblin: its looks, not its nature (§17.5.6). */
export const COSMETIC_LOCI: readonly LocusId[] = ['skinHue', 'skinSat', 'skinLight', 'eyeHue', 'pattern', 'patternHueShift', 'earLength', 'earDroop', 'noseSize', 'tusks', 'albino'];
export const ENEMY_KINDS: readonly EnemyKind[] = ['gnasher', 'bramblebeast', 'night_wisp'];
const PLANT_STAGES: readonly PlantStage[] = ['seed', 'sprout', 'sapling', 'young', 'mature', 'old', 'dead', 'stump'];
const PLANT_KINDS: readonly PlantKind[] = ['apple_bush', 'berry_bush', 'tree', 'flower'];
const LOCI = LOCUS_DEFS as readonly LocusDef[];

/** Every allele clamped to its locus range; null when a locus is missing. */
export function cleanGenome(g: Partial<Genome>, only?: readonly LocusId[]): Partial<Genome> | null {
  const out: Partial<Genome> = {};
  for (const d of LOCI) {
    if (only && !only.includes(d.key)) continue;
    const l = g[d.key];
    if (!l) { if (only) continue; return null; }
    if (!Number.isFinite(l.a) || !Number.isFinite(l.b)) return null;
    out[d.key] = { a: clampAllele(d, l.a), b: clampAllele(d, l.b) };
  }
  return out;
}

const inside = (w: World, p: Vec2) => p.x >= 0 && p.y >= 0 && p.x < w.s.size.w && p.y < w.s.size.h;
const land = (w: World, p: Vec2) => inside(w, p) && !!tileAt(w.s, Math.floor(p.x), Math.floor(p.y))?.walkable;

/** Why this sandbox op cannot be done, or null. */
export function sandboxProblem(w: World, op: SandboxOp): string | null {
  const s = w.s;
  switch (op.op) {
    case 'set_need':
    case 'set_stat':
    case 'edit_genome':
      if (!w.goblin(op.goblinId)) return 'missing_entity';
      if (op.op === 'edit_genome' && (!cleanGenome(op.genome, COSMETIC_LOCI) || Object.keys(op.genome).some((k) => !COSMETIC_LOCI.includes(k as LocusId)))) return 'bad_genome';
      return null;
    case 'set_weather':
      return WEATHER_KINDS.includes(op.kind) ? null : 'unknown_weather';
    case 'spawn_building': {
      const def = buildingDef(op.kind);
      if (!def) return 'unknown_building';
      const at = { x: Math.round(op.pos.x), y: Math.round(op.pos.y) };
      return siteTilesOk(s, at, def.footprint) && siteClear(w, at, def.footprint) ? null : 'bad_site';
    }
    case 'spawn_plant': {
      if (!PLANT_KINDS.includes(op.kind) || !PLANT_STAGES.includes(op.stage)) return 'unknown_plant';
      const t = tileAt(s, Math.floor(op.pos.x), Math.floor(op.pos.y));
      return t && t.biome !== 'water' && t.biome !== 'rock' ? null : 'bad_site';
    }
    case 'spawn_enemy':
      if (!ENEMY_KINDS.includes(op.kind)) return 'unknown_enemy';
      return land(w, op.pos) ? null : 'bad_site';
    case 'spawn_egg':
      return land(w, op.pos) ? null : 'bad_site';
    case 'spawn_goblin':
      if (!cleanGenome(op.genome)) return 'bad_genome';
      return land(w, op.pos) ? null : 'bad_site';
    case 'breed': {
      const a = w.goblin(op.aId), b = w.goblin(op.bId);
      if (!a || !b) return 'missing_entity';
      return a === b ? 'same_goblin' : null;
    }
    case 'set_policy':
      return op.policy === 'quarantine' && typeof op.on === 'boolean' ? null : 'unknown_policy';
    case 'remove':
      return null;
    case 'possess':
      return op.goblinId === null || w.goblin(op.goblinId) ? null : 'missing_entity';
    case 'possessed_act':
      if (!possessed(w)) return 'not_possessing';
      return POSSESS_ACTS.includes(op.act) && inside(w, op.pos) ? null : 'bad_target';
  }
}

function newEgg(w: World, genome: Genome, parents: [ID, ID], pos: Vec2): Egg {
  const egg: Egg = { id: allocId(w.s), pos: { x: q4(pos.x), y: q4(pos.y) }, genome, parents, laidTick: w.s.tick, warmth: 0.5, incubation: 0, airborne: null };
  w.s.eggs.push(egg);
  w.emit({ type: 'egg_laid', eggId: egg.id, parents, at: egg.pos });
  return egg;
}

/** Set a mood outright: a day-long modifier makes up the difference to what its needs would give. */
function setMood(w: World, g: Goblin, value: number): void {
  g.mood.modifiers = g.mood.modifiers.filter((m) => m.id !== 'sandbox');
  const v = Math.max(-100, Math.min(100, value));
  g.mood.modifiers.push({ id: 'sandbox', amount: q4(v - moodTarget(g)), expiresTick: w.s.tick + CFG.time.dayTicks });
  g.mood.value = q4(v);
}

export function applySandbox(w: World, op: SandboxOp): void {
  const s = w.s;
  switch (op.op) {
    case 'set_need': w.goblin(op.goblinId)!.needs[op.need] = Math.max(0, Math.min(100, op.value)); break;
    case 'set_stat': {
      const g = w.goblin(op.goblinId)!;
      if (op.stat === 'mood') setMood(w, g, op.value);
      else g.godView[op.stat] = Math.max(0, Math.min(100, op.value));
      break;
    }
    case 'set_weather': setWeather(w, op.kind); break;
    case 'set_policy': (s.village.policies ??= {})[op.policy] = op.on; break;
    case 'possess': possess(w, op.goblinId); break;
    case 'possessed_act': possessedAct(w, op.act, op.pos, op.targetId); break;
    case 'spawn_building': {
      const b = placeBlueprint(w, op.kind, { x: Math.round(op.pos.x), y: Math.round(op.pos.y) }, null);
      if (op.complete) completeBuilding(w, b, null);
      break;
    }
    case 'spawn_plant': spawnPlant(w, op.kind, op.pos, op.stage, null); break;
    // like a summoned one, it hunts for a few hours even by day (else a Gnasher put down at noon would just leave)
    case 'spawn_enemy': {
      const at = { x: q4(op.pos.x), y: q4(op.pos.y) };
      const e = op.kind === 'bramblebeast' ? spawnBramblebeast(w, at) : op.kind === 'night_wisp' ? spawnWisp(w, at) : spawnEnemy(w, op.kind, at);
      e.summoned = true;
      break;
    }
    // an egg of nobody in particular: a founder's genome, parents unknown (it is adopted when it hatches)
    case 'spawn_egg': newEgg(w, founderGenome(w.rng, s.clans[0]?.archetype as Parameters<typeof founderGenome>[1] ?? 'mixed'), [-1, -1], op.pos); break;
    case 'spawn_goblin': {
      const g = createGoblin(s, w.rng, { genome: cleanGenome(op.genome) as Genome, pos: { x: q4(op.pos.x), y: q4(op.pos.y) }, ageDays: Math.max(0, op.ageDays), clanId: s.clans[0]?.id ?? 0 });
      s.goblins.push(g);
      w.goblinHash.insert(g);
      registerLineage(s, g);
      w.emit({ type: 'goblin_transformed', goblinId: g.id, at: { ...g.pos } });
      break;
    }
    // the breeding tool ignores fondness, kinship and fertility: an egg of the two, laid by the first
    case 'breed': {
      const a = w.goblin(op.aId)!, b = w.goblin(op.bId)!;
      const home = a.homeId !== null ? s.buildings.find((x) => x.id === a.homeId && x.buildProgress >= 1) : undefined;
      newEgg(w, meiosis(a.genome, b.genome, w.rng), [a.id, b.id], home ? { x: home.pos.x + 0.4, y: home.pos.y + 0.4 } : { x: a.pos.x + 0.3, y: a.pos.y });
      break;
    }
    case 'edit_genome': {
      const g = w.goblin(op.goblinId)!;
      Object.assign(g.genome, cleanGenome(op.genome, COSMETIC_LOCI));
      // the book shows it as it is now
      if (s.lineage[g.id]) s.lineage[g.id] = { ...lineageEntry(g), died: null };
      w.emit({ type: 'goblin_transformed', goblinId: g.id, at: { ...g.pos } });
      break;
    }
    case 'remove': {
      // sandbox removal: the entity simply vanishes, with no grave and no grief
      if (s.god.held?.id === op.id) s.god.held = null;
      s.goblins = s.goblins.filter((g) => g.id !== op.id);
      s.groundItems = s.groundItems.filter((i) => i.id !== op.id);
      s.eggs = s.eggs.filter((e) => e.id !== op.id);
      s.enemies = s.enemies.filter((e) => e.id !== op.id);
      const before = s.plants.length;
      s.plants = s.plants.filter((p) => p.id !== op.id);
      if (before !== s.plants.length) w.markPlantsDirty();
      break;
    }
  }
}
