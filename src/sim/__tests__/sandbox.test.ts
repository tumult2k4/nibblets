import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { registerLineage } from '../goblin/family';
import { relate } from '../goblin/social';
import { hatch } from '../goblin/family';
import { express } from '../goblin/genetics/phenotype';
import { founderGenome } from '../goblin/genetics/founders';
import { cloneGenome, LOCUS_DEFS, type Genome, type LocusDef } from '../goblin/genetics/genome';
import { COSMETIC_LOCI, type SandboxOp } from '../sandbox';
import { Rng } from '../../shared/rng';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const op = (w: World, o: SandboxOp): SimEvent[] => {
  w.push({ type: 'sandbox', op: o });
  return w.step();
};
const rejected = (evs: SimEvent[]) => evs.find((e) => e.type === 'command_rejected');
const LOCI = LOCUS_DEFS as readonly LocusDef[];

describe('Sandbox drawer (P5.9)', () => {
  it('breeding tool: an egg whose alleles come only from the two chosen parents, whatever they think of each other', () => {
    const G = CFG.genetics as { quantMutationChance: number; discreteMutationChance: number };
    const saved = { q: G.quantMutationChance, d: G.discreteMutationChance };
    G.quantMutationChance = G.discreteMutationChance = 0;
    try {
      for (let trial = 0; trial < 5; trial++) {
        const w = makeWorld({ seed: 11 + trial });
        const a = spawnGoblin(w, { genome: founderGenome(new Rng(100 + trial), 'moss') });
        const b = spawnGoblin(w, { genome: founderGenome(new Rng(200 + trial), 'ember') });
        for (const g of [a, b]) registerLineage(w.s, g);
        relate(a, b.id).opinion = relate(b, a.id).opinion = -90; // bitter rivals: no matter
        expect(rejected(op(w, { op: 'breed', aId: a.id, bId: a.id }))).toMatchObject({ reason: 'same_goblin' });
        op(w, { op: 'breed', aId: a.id, bId: b.id });
        expect(w.s.eggs).toHaveLength(1);
        const egg = w.s.eggs[0]!;
        expect(egg.parents).toEqual([a.id, b.id]);
        for (const d of LOCI) {
          expect([a.genome[d.key].a, a.genome[d.key].b]).toContain(egg.genome[d.key].a);
          expect([b.genome[d.key].a, b.genome[d.key].b]).toContain(egg.genome[d.key].b);
        }
        const kid = hatch(w, egg);
        expect(kid.parents).toEqual([a.id, b.id]);
        expect(w.s.lineage[kid.id]!.parents).toEqual([a.id, b.id]);
      }
    } finally {
      G.quantMutationChance = saved.q;
      G.discreteMutationChance = saved.d;
    }
  });

  it('makes a goblin from a genome (alleles clamped), and reshapes a living one only in its looks', () => {
    const w = makeWorld();
    const genome = founderGenome(new Rng(3), 'tide');
    genome.adultSize = { a: 9, b: 1.2 }; // out of range: clamped
    genome.tusks = { a: 1, b: 1 };
    const evs = op(w, { op: 'spawn_goblin', genome, pos: { x: 10.5, y: 10.5 }, ageDays: 2 });
    const g = w.s.goblins.at(-1)!;
    expect(evs.some((e) => e.type === 'goblin_transformed' && e.goblinId === g.id)).toBe(true);
    expect(g.lifeStage).toBe('hatchling');
    expect(g.genome.adultSize.a).toBe(LOCI.find((d) => d.key === 'adultSize')!.max);
    expect(express(g.genome, 'tusks')).toBe(1);
    expect(w.s.lineage[g.id]!.rec!.tusks).toBe(2);
    const broken = cloneGenome(genome) as Partial<Genome>;
    delete broken.skinHue;
    expect(rejected(op(w, { op: 'spawn_goblin', genome: broken as Genome, pos: { x: 10, y: 10 }, ageDays: 20 }))).toMatchObject({ reason: 'bad_genome' });
    // looks only: skin and tusks change, temperament may not
    expect(COSMETIC_LOCI).not.toContain('t_bravery');
    expect(rejected(op(w, { op: 'edit_genome', goblinId: g.id, genome: { t_bravery: { a: 1, b: 1 } } }))).toMatchObject({ reason: 'bad_genome' });
    op(w, { op: 'edit_genome', goblinId: g.id, genome: { skinHue: { a: 300, b: 300 }, tusks: { a: 0, b: 0 } } });
    expect(express(g.genome, 'skinHue')).toBeCloseTo(300, 3);
    expect(express(g.genome, 'tusks')).toBe(0);
    expect(w.s.lineage[g.id]!.skin![0]).toBeCloseTo(300, 3);
    expect(w.s.lineage[g.id]!.rec!.tusks).toBe(0);
  });

  it('spawns plants at any stage, creatures and eggs of nobody, and removes things without a trace', () => {
    const w = makeWorld();
    op(w, { op: 'spawn_plant', kind: 'apple_bush', stage: 'old', pos: { x: 12.5, y: 8.5 } });
    expect(w.s.plants.at(-1)).toMatchObject({ kind: 'apple_bush', stage: 'old' });
    expect(rejected(op(w, { op: 'spawn_plant', kind: 'tree', stage: 'mature', pos: { x: 1.5, y: 1.5 } }))).toMatchObject({ reason: 'bad_site' }); // the pond
    op(w, { op: 'spawn_enemy', kind: 'gnasher', pos: { x: 18.5, y: 18.5 } });
    const e = w.s.enemies.at(-1)!;
    expect(e.kind).toBe('gnasher');
    op(w, { op: 'spawn_egg', pos: { x: 8.5, y: 12.5 } });
    const egg = w.s.eggs.at(-1)!;
    expect(egg.parents).toEqual([-1, -1]);
    const kid = hatch(w, egg);
    expect(kid.parents).toBeNull(); // a founder of its own line
    expect(w.s.lineage[kid.id]!.parents).toBeNull();
    op(w, { op: 'spawn_egg', pos: { x: 8.5, y: 12.5 } });
    const egg2 = w.s.eggs.at(-1)!;
    const deaths = w.s.stats.deaths;
    for (const id of [e.id, egg2.id, kid.id]) op(w, { op: 'remove', id });
    expect(w.s.enemies).not.toContain(e);
    expect(w.s.eggs).not.toContain(egg2);
    expect(w.goblin(kid.id)).toBeUndefined();
    expect(w.s.graves).toHaveLength(0);
    expect(w.s.stats.deaths).toEqual(deaths);
  });

  it('sets mood, faith, love and fear on a goblin; refuses all of it outside Sandbox', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    op(w, { op: 'set_stat', goblinId: g.id, stat: 'mood', value: -70 });
    for (let i = 0; i < 100; i++) w.step();
    expect(Math.abs(g.mood.value + 70)).toBeLessThan(5); // its needs drift a little meanwhile
    op(w, { op: 'set_stat', goblinId: g.id, stat: 'faith', value: 88 });
    op(w, { op: 'set_stat', goblinId: g.id, stat: 'fear', value: 140 });
    expect(g.godView.faith).toBe(88);
    expect(g.godView.fear).toBe(100);
    w.s.god.mode = 'divine';
    expect(rejected(op(w, { op: 'set_stat', goblinId: g.id, stat: 'love', value: 5 }))).toMatchObject({ reason: 'sandbox_only' });
  });
});
