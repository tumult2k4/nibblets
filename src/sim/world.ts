import type { ID, SimEvent, SimEventInput, Vec2 } from '../shared/types';
import { Rng } from '../shared/rng';
import { EventBus } from '../shared/events';
import { CFG } from './config';
import { clockAt, type ClockState } from './time';
import type { Goblin, GroundItem, Plant, WorldState } from './state';
import { SpatialHash } from './spatialHash';
import { applyCommands, type Command } from './commands';
import { updatePlants, updateTiles } from './plants';
import { updateGroundItems } from './groundItems';
import { updateBodies } from './goblin/needs';
import { updateMood } from './goblin/mood';
import { updateSenses } from './goblin/memory';
import { updateWear } from './god/terraform';
import { updateWeather } from './weather';
import { updateStorms } from './storms';
import { updateEcology } from './ecology';
import { think, act } from './ai/utility';
import { updateGod } from './god/godState';
import { sampleStats } from './stats';
import { findPath } from './pathfinding';

/**
 * The live world: plain-data state plus derived, rebuildable caches (rng object, spatial hashes,
 * path cache, event bus). Only `s` is saved; everything else is reconstructed on load.
 */
export class World {
  readonly bus = new EventBus();
  rng: Rng;
  clock: ClockState;
  readonly goblinHash = new SpatialHash<Goblin>(4);
  readonly plantHash = new SpatialHash<Plant>(4);
  readonly itemHash = new SpatialHash<GroundItem>(4);
  /** commands queued by UI/tests; applied at the start of the next tick */
  readonly queue: Command[] = [];
  readonly pathCache = new Map<string, Vec2[] | null>();
  private plantsVersion = -1;
  plantsDirty = true;
  /** wall-clock ms per tick (not part of state) */
  lastTickMs = 0;
  /** set by replay viewer: suppress new player commands */
  readOnly = false;

  constructor(public s: WorldState) {
    this.rng = new Rng(s.rngState);
    this.clock = clockAt(s.tick);
    this.rebuildCaches();
  }

  rebuildCaches(): void {
    this.goblinHash.rebuild(this.s.goblins);
    this.itemHash.rebuild(this.s.groundItems);
    this.plantHash.rebuild(this.s.plants);
    this.plantsDirty = false;
  }

  emit(e: SimEventInput): void {
    this.bus.emit({ ...e, tick: this.s.tick } as SimEvent);
  }

  push(cmd: Command): void {
    if (!this.readOnly) this.queue.push(cmd);
  }

  goblin(id: ID): Goblin | undefined {
    return this.s.goblins.find((g) => g.id === id);
  }

  path(from: Vec2, to: Vec2): Vec2[] | null {
    return findPath(this.s, from, to, this.pathCache);
  }

  markPlantsDirty(): void {
    this.plantsDirty = true;
  }

  /** One simulation tick in the exact pipeline order of §6. Returns flushed events. */
  step(): SimEvent[] {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const s = this.s;
    applyCommands(this); //  0
    s.tick += 1; //           1 clock.advance
    const prev = this.clock;
    this.clock = clockAt(s.tick);
    if (this.clock.day !== prev.day) this.emit({ type: 'day_started', day: this.clock.day });
    if (this.clock.season !== prev.season)
      this.emit({ type: 'season_changed', season: this.clock.season, year: this.clock.year });
    updateWeather(this); //   2 weather + temperature + wetness
    updateStorms(this); //    2b storm damage to weakened buildings
    updateTiles(this); //     3
    updatePlants(this); //    4
    updateEcology(this); //   5 ecology: mushrooms (wildlife P7); 6 fire (P6)
    updateGroundItems(this); // 7 (+ airborne items)
    //                        8 eggs (P5)
    updateGod(this); //       8b
    //                        9 enemies.senseAndDecide (P4)
    this.goblinHash.rebuild(s.goblins);
    if (this.plantsDirty || this.plantsVersion < 0) {
      this.plantHash.rebuild(s.plants);
      this.plantsVersion = s.tick;
      this.plantsDirty = false;
    }
    this.itemHash.rebuild(s.groundItems);
    updateBodies(this); //    10
    updateMood(this); //      11
    updateSenses(this); //    11b senses + memory decay (§7.8)
    think(this); //           12
    act(this); //             13
    updateWear(this); //      13b path wear (§P2.7)
    //                        14 enemies.act, 15 combat, 16 social, 17 culture, 18 village, 19 clans
    if (s.tick % CFG.stats.sampleEvery === 0) sampleStats(this); // 20
    s.rngState = this.rng.state;
    const events = this.bus.flush(); // 21
    if (t0) this.lastTickMs = performance.now() - t0;
    return events;
  }

  /**
   * Apply queued commands without advancing time (used while paused). Replay-equivalent: the log
   * records the same tick, and replay applies those commands at the start of that tick's step.
   */
  applyNow(): SimEvent[] {
    applyCommands(this);
    this.goblinHash.rebuild(this.s.goblins);
    this.itemHash.rebuild(this.s.groundItems);
    this.s.rngState = this.rng.state;
    return this.bus.flush();
  }

  run(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }
}
