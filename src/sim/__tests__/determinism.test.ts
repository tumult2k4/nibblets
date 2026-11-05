import { describe, expect, it } from 'vitest';
import { createWorld } from '../newWorld';
import { loadWorld, serialize, stateHash } from '../save';

describe('determinism (§3.2, permanent from P1)', () => {
  it('same seed twice → same hash at tick 5,000', () => {
    const a = createWorld({ seed: 1234 });
    const b = createWorld({ seed: 1234 });
    a.run(5000);
    b.run(5000);
    expect(a.s.tick).toBe(5000);
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    // and something actually happened
    expect(a.s.stats.eaten + a.s.goblins.reduce((n, g) => n + g.deeds.drank, 0)).toBeGreaterThan(5);
  });

  it('different seeds diverge', () => {
    expect(stateHash(createWorld({ seed: 1 }).s)).not.toBe(stateHash(createWorld({ seed: 2 }).s));
  });

  it('save at 2,500 → load → run to 5,000 equals uninterrupted run', () => {
    const a = createWorld({ seed: 1234 });
    a.run(2500);
    const b = loadWorld(serialize(a.s));
    expect(stateHash(b.s)).toBe(stateHash(a.s));
    a.run(2500);
    b.run(2500);
    expect(stateHash(b.s)).toBe(stateHash(a.s));
  });
});
