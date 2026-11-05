import { describe, expect, it } from 'vitest';
import { stockCount } from '../stockpile';
import { loadWorld, serialize, MIGRATIONS } from '../save';
import { HOUR, makeWorld, placePlant, runTicks, setMorning, spawnGoblin } from './helpers';

describe('chopping & stockpile (P2.3)', () => {
  it('a goblin chops an old bush into wood + sticks and stores the wood; the bush becomes a stump', () => {
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    const g = spawnGoblin(w);
    g.personality.industry = 1;
    const old = placePlant(w, 'apple_bush', 'old', { x: 20.5, y: 20.5 });
    old.age = 70;
    runTicks(w, HOUR * 8, () => stockCount(w.s, 'wood') >= 2);
    expect(old.stage).toBe('stump');
    expect(stockCount(w.s, 'wood')).toBeGreaterThanOrEqual(2);
  });

  it('does not chop the food supply when apple bushes are scarce', () => {
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    spawnGoblin(w);
    const b = placePlant(w, 'apple_bush', 'mature', { x: 20.5, y: 20.5 });
    runTicks(w, HOUR * 4);
    expect(b.stage).toBe('mature');
  });

  it('v1 saves migrate to v2 with an empty stockpile', () => {
    const w = makeWorld();
    const raw = JSON.parse(serialize(w.s));
    raw.version = 1;
    delete raw.village.stockpile;
    delete raw.village.stockpilePos;
    expect(MIGRATIONS[1]).toBeDefined();
    const w2 = loadWorld(JSON.stringify(raw));
    expect(w2.s.village.stockpile).toEqual([]);
    expect(w2.s.village.stockpilePos.x).toBeGreaterThan(0);
  });
});
