import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BARKS, LOOPS, MUSIC, SFX, VOICES, barkFile, loopFile, musicFile, sfxFile, type BarkId, type SfxDef, type SfxId, type VoiceId } from '../sound/manifest';
import { soundsFor, voiceOf } from '../sound/eventSounds';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import type { SimEvent } from '../../shared/types';

const PUBLIC = join(__dirname, '..', '..', '..', 'public');

describe('audio (ElevenLabs sounds)', () => {
  it('has a file in public/ for every sound, loop, track and voice line the game can ask for', () => {
    const files: string[] = [];
    for (const id of Object.keys(SFX) as SfxId[]) for (let v = 0; v < ((SFX[id] as SfxDef).variants ?? 1); v++) files.push(sfxFile(id, v));
    for (const id of Object.keys(LOOPS) as (keyof typeof LOOPS)[]) files.push(loopFile(id));
    for (const id of Object.keys(MUSIC) as (keyof typeof MUSIC)[]) files.push(musicFile(id));
    for (const voice of Object.keys(VOICES) as VoiceId[])
      for (const bark of Object.keys(BARKS) as BarkId[]) BARKS[bark].forEach((_, v) => files.push(barkFile(voice, bark, v)));
    const missing = files.filter((f) => !existsSync(join(PUBLIC, f)));
    expect(missing).toEqual([]);
  });

  it('gives each goblin a steady voice: younglings high, elders low, adults spread around 1', () => {
    const w = makeWorld({ size: 24 });
    const g = spawnGoblin(w);
    expect(voiceOf(g)).toEqual(voiceOf(g));
    for (let id = 1; id < 200; id++) {
      const a = voiceOf({ id, lifeStage: 'adult' }), y = voiceOf({ id, lifeStage: 'youngling' }), e = voiceOf({ id, lifeStage: 'elder' });
      expect(a.pitch).toBeGreaterThanOrEqual(0.85);
      expect(a.pitch).toBeLessThanOrEqual(1.15);
      expect(y.pitch).toBeGreaterThan(a.pitch - 0.2);
      expect(y.voice).toBe('pip');
      expect(e.pitch).toBeLessThan(1);
    }
    const voices = new Set(Array.from({ length: 60 }, (_, i) => voiceOf({ id: i, lifeStage: 'adult' }).voice));
    expect(voices.size).toBe(4);
  });

  it('turns sim events into known sounds and voices', () => {
    const w = makeWorld({ size: 24 });
    const g = spawnGoblin(w), tick = w.s.tick;
    const evs: SimEvent[] = [
      { type: 'plant_chopped', goblinId: g.id, plantId: 1, wood: 2, tick },
      { type: 'goblin_died', goblinId: g.id, cause: 'old_age' as never, tick },
      { type: 'divine_act', act: 'pet', targetId: g.id, witnessIds: [], tick },
      { type: 'divine_act', act: 'lightning', witnessIds: [], tick },
      { type: 'landed', entityId: g.id, damage: 3, water: true, tick },
      { type: 'fish_caught', goblinId: g.id, caught: true, tick },
    ];
    const out = evs.flatMap((e) => soundsFor(e, w));
    for (const s of out) {
      if ('sfx' in s) expect(SFX[s.sfx]).toBeDefined();
      else expect(BARKS[s.bark]).toBeDefined();
    }
    const names = out.map((s) => ('sfx' in s ? s.sfx : `bark:${s.bark}`));
    expect(names).toEqual(expect.arrayContaining(['tree_fall', 'death_toll', 'bark:giggle', 'thunder', 'splash', 'bark:hurt', 'fish_catch']));
  });
});
