import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { HOUR, makeWorld, runTicks, setMorning, spawnGoblin } from './helpers';
import type { SimEvent } from '../../shared/types';

function collect(w: ReturnType<typeof makeWorld>): SimEvent[] {
  const ev: SimEvent[] = [];
  w.bus.subscribe((e) => ev.push(e));
  return ev;
}

describe('god hand (§17.3)', () => {
  it('fall damage follows max(0,(h−1.5)×12)', () => {
    for (const h of [1.5, 3, 5, 8]) {
      const w = makeWorld();
      setMorning(w);
      const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
      const ev = collect(w);
      w.push({ type: 'god_grab', entityId: g.id });
      w.push({ type: 'god_hold_move', pos: { x: 12, y: 12 }, height: h });
      w.step();
      expect(g.heldByGod).toBe(true);
      expect(g.activity.action).toBe('struggle');
      // release with height > 1.5 is a drop; exactly 1.5 is a gentle set-down
      w.push({ type: 'god_release', pos: { x: 12, y: 12 }, height: h, velocity: { x: 0, y: 0, z: 0 } });
      runTicks(w, 40);
      expect(g.airborne).toBeNull();
      const landed = ev.find((e) => e.type === 'landed') as { damage: number } | undefined;
      expect(landed?.damage ?? 0).toBeCloseTo(Math.max(0, (h - 1.5) * 12), 3);
    }
  });

  it('set down from ≤ 1.5 deals no damage and raises faith', () => {
    const w = makeWorld();
    setMorning(w);
    const g = spawnGoblin(w);
    const faith0 = g.godView.faith;
    w.push({ type: 'god_grab', entityId: g.id });
    w.step();
    w.push({ type: 'god_release', pos: { x: 10, y: 10 }, height: 1.2, velocity: { x: 0, y: 0, z: 0 } });
    w.step();
    expect(g.health.hp).toBe(g.health.maxHp);
    expect(Math.hypot(g.pos.x - 10, g.pos.y - 10)).toBeLessThan(0.5);
    expect(g.godView.faith).toBeGreaterThan(faith0 + 5);
  });

  it('water landings deal no damage', () => {
    const w = makeWorld();
    setMorning(w);
    const g = spawnGoblin(w);
    w.push({ type: 'god_grab', entityId: g.id });
    w.step();
    w.push({ type: 'god_release', pos: { x: 2, y: 2 }, height: 12, velocity: { x: 0, y: 0, z: 0 } });
    runTicks(w, 40);
    expect(g.health.hp).toBe(g.health.maxHp);
    expect(w.s.tiles[Math.floor(g.pos.y) * w.s.size.w + Math.floor(g.pos.x)]!.walkable).toBe(true);
  });

  it('throws add impact damage max(0, speed−6)×4', () => {
    const w = makeWorld({ size: 48 });
    setMorning(w);
    const g = spawnGoblin(w, { pos: { x: 10, y: 24 } });
    const ev = collect(w);
    w.push({ type: 'god_grab', entityId: g.id });
    w.step();
    w.push({ type: 'god_release', pos: { x: 10, y: 24 }, height: 1.5, velocity: { x: 10, y: 0, z: 0 } });
    runTicks(w, 40);
    // falls from 1.5 (no fall damage) → only impact: (10 − 6) × 4 = 16
    expect((ev.find((e) => e.type === 'landed') as { damage: number }).damage).toBeCloseTo(16, 3);
  });

  it('gift drop: 5 god-dropped apples at a hungry goblin\'s feet → it eats within 1 in-game hour', () => {
    const w = makeWorld();
    setMorning(w);
    const g = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    g.needs.hunger = 25;
    const ev = collect(w);
    w.push({ type: 'god_spawn_item', item: 'apple', qty: 5, pos: { x: 15.3, y: 15.2 } });
    runTicks(w, HOUR, () => g.deeds.eaten > 0);
    expect(ev.some((e) => e.type === 'item_eaten' && e.divine)).toBe(true);
    expect(ev.find((e) => e.type === 'divine_act')).toMatchObject({ act: 'gift', targetId: g.id });
  });

  it('only witnesses within vision react', () => {
    const w = makeWorld({ size: 64 });
    setMorning(w);
    const near = spawnGoblin(w, { pos: { x: 30, y: 30 } });
    const far = spawnGoblin(w, { pos: { x: 58, y: 58 } });
    const f0 = far.godView.faith;
    w.push({ type: 'god_spawn_item', item: 'wood', qty: 1, pos: { x: 33, y: 30 } });
    w.step();
    expect(near.activity.action).toBe('look_up');
    expect(far.godView.faith).toBe(f0);
  });

  it('rejects invalid commands with a reason', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const ev = collect(w);
    w.push({ type: 'god_grab', entityId: 99999 });
    w.push({ type: 'god_release', pos: { x: 1, y: 1 }, height: 3, velocity: { x: 0, y: 0, z: 0 } });
    w.push({ type: 'god_spawn_item', item: 'apple', qty: 500, pos: { x: 5, y: 5 } });
    w.s.god.gentle = true;
    w.push({ type: 'god_flick', goblinId: g.id, dir: { x: 1, y: 0 } });
    w.step();
    w.s.god.mode = 'observer';
    w.push({ type: 'god_poke', goblinId: g.id });
    w.step();
    const reasons = ev.filter((e) => e.type === 'command_rejected').map((e) => (e as { reason: string }).reason);
    expect(reasons).toEqual(['missing_entity', 'nothing_held', 'bad_quantity', 'gentle_mode', 'observer_mode']);
    expect(w.s.commandLog).toHaveLength(0);
  });

  it('holding a goblin too long makes it fearful', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const fear0 = g.godView.fear;
    w.push({ type: 'god_grab', entityId: g.id });
    runTicks(w, CFG.god.holdFearTicks + 5);
    expect(g.godView.fear).toBeGreaterThanOrEqual(fear0 + CFG.god.holdFearGain);
  });
});
