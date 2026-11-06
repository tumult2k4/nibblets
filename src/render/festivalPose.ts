/**
 * Festival and music poses (P8.5), laid over goblinView's: drumming (both hands beating the drum held before it),
 * piping (hands up at the mouth, swaying), dancing (a hop and a turn, arms up and swinging), sitting to listen
 * (the Long Dark), telling the story with big gestures, eating at the feast, clapping along; kneeling at the shrine with
 * the hands raised together and the head bowed (P8.6). Also what is worn on
 * the head besides the hat: war paint (P7.5), the chief's headdress (P8.4), a flower crown at Sprout Day and the
 * shaman's bone and feathers (P8.8); P8.8 also kneeling with an offering, the shaman's raised arms, a fist at the sky.
 */
import type { Goblin } from '../sim/state';
import type { World } from '../sim/world';
import type { ItemStack } from '../shared/types';
import type { GoblinRig } from './goblinMesh';
import { FEST } from '../sim/ai/actions/festival';
import { instrumentOf } from '../sim/music';
import { festivalNow } from '../sim/festivals';

/** What the goblin is doing in the way of music or festival (a FEST mode), or −1. */
export function festMode(g: Goblin): number {
  const a = g.activity;
  if (a.status !== 'running') return -1;
  if (a.action === 'play_music') return a.stage === 1 ? FEST.play : -1;
  if (a.action === 'dance') return a.stage === 1 ? FEST.dance : -1;
  return a.action === 'join_festival' && a.stage === 2 ? (a.count ?? FEST.mingle) : -1;
}
/** The instrument in the hand while it plays. */
export const playedInstrument = (g: Goblin): ItemStack | null => (festMode(g) === FEST.play ? instrumentOf(g) : null);

export type HeadExtra = 'war_paint_face' | 'chief_headdress' | 'shaman_headdress' | 'flower_crown';
/** Worn on the head besides any hat. */
export function headExtras(g: Goblin, w: World): HeadExtra[] {
  const out: HeadExtra[] = [];
  if (g.mood.modifiers.some((m) => m.id === 'war_paint')) out.push('war_paint_face');
  if (g.role === 'chief') out.push('chief_headdress');
  if (g.role === 'shaman') out.push('shaman_headdress'); // P8.8
  if (!g.equipped.head && g.activity.action === 'join_festival' && festivalNow(w)?.kind === 'sprout_day') out.push('flower_crown');
  return out;
}

/** Sets the pose and returns the ear flattening, or null when the goblin is not at music or a festival. */
export function festivalPose(g: Goblin, r: GoblinRig, t: number): number | null {
  const m = festMode(g), ph = t + g.id * 1.3;
  if (g.activity.action === 'pray' && g.activity.stage === 1 && g.activity.status === 'running') { // kneeling at the shrine
    r.body.position.y = 0.02; r.body.rotation.x = 0.12; r.legL.rotation.x = r.legR.rotation.x = -1.5;
    r.armL.rotation.x = r.armR.rotation.x = -1.35 + Math.sin(ph * 0.8) * 0.06; r.armL.rotation.z = -0.32; r.armR.rotation.z = 0.32;
    r.head.rotation.x = 0.35;
    return 0.15;
  }
  const a = g.activity;
  if (a.action === 'make_offering' && a.stage === 2 && a.status === 'running') { // P8.8: kneeling, holding the gift out
    r.body.position.y = 0.02; r.body.rotation.x = 0.25; r.legL.rotation.x = r.legR.rotation.x = -1.5;
    r.armL.rotation.x = r.armR.rotation.x = -1.2; r.armL.rotation.z = -0.15; r.armR.rotation.z = 0.15; r.head.rotation.x = 0.25;
    return 0.1;
  }
  if (a.action === 'lead_prayer' && a.stage === 1 && a.status === 'running') { // arms raised to the sky, swaying
    const k = Math.sin(ph * 1.2);
    r.armL.rotation.x = r.armR.rotation.x = -2.8 + k * 0.12; r.armL.rotation.z = -0.45; r.armR.rotation.z = 0.45;
    r.head.rotation.x = -0.45; r.body.rotation.z = k * 0.06;
    return -0.2;
  }
  if (a.action === 'shake_fist' && a.status === 'running') { // one fist shaken at the sky
    r.armR.rotation.x = -2.7 + Math.sin(ph * 14) * 0.25; r.armR.rotation.z = 0.2; r.armL.rotation.x = 0.2; r.head.rotation.x = -0.5;
    return 0.6;
  }
  if (m < 0 || m === FEST.race) return null; // racing is a run
  const sit = (): void => { r.body.position.y = 0.05; r.legL.rotation.x = r.legR.rotation.x = -1.3; };
  switch (m) {
    case FEST.play: {
      if (instrumentOf(g)?.type === 'flute') { // hands to the mouth, swaying to the tune
        r.armL.rotation.x = r.armR.rotation.x = -1.9; r.armL.rotation.z = 0.35; r.armR.rotation.z = -0.35;
        r.head.rotation.x = -0.1; r.body.rotation.z = Math.sin(ph * 2) * 0.08;
        return -0.2;
      }
      const k = Math.sin(ph * 12); // beating the drum
      r.armL.rotation.x = -1.1 + k * 0.45; r.armR.rotation.x = -1.1 - k * 0.45; r.body.rotation.x = 0.15; r.head.rotation.x = Math.abs(k) * 0.08;
      return -0.25 + Math.abs(k) * 0.15;
    }
    case FEST.dance: {
      const k = ph * 6;
      r.body.position.y += Math.abs(Math.sin(k)) * 0.09; r.body.rotation.y = Math.sin(ph * 1.6) * 1.2;
      r.armL.rotation.x = -2.3 + Math.sin(k) * 0.6; r.armR.rotation.x = -2.3 - Math.sin(k) * 0.6;
      r.legL.rotation.x = Math.sin(k) * 0.5; r.legR.rotation.x = -Math.sin(k) * 0.5;
      return -0.3 + Math.sin(k) * 0.2;
    }
    case FEST.listen: // sat by the fire, rapt
      sit(); r.head.rotation.x = 0.1 + Math.sin(ph * 0.5) * 0.05; r.armL.rotation.x = r.armR.rotation.x = -0.7; r.armL.rotation.z = 0.3; r.armR.rotation.z = -0.3;
      return 0.05;
    case FEST.tell: { // the old one's story, told with the hands
      const k = Math.sin(ph * 1.8);
      sit(); r.armL.rotation.x = -1.6 + k * 0.5; r.armR.rotation.x = -1.4 - k * 0.6; r.armL.rotation.z = -0.4; r.armR.rotation.z = 0.4; r.head.rotation.y = Math.sin(ph * 0.7) * 0.5;
      return -0.1;
    }
    case FEST.feast:
      sit(); r.armR.rotation.x = -1.7 + Math.sin(ph * 9) * 0.3; r.head.rotation.x = Math.sin(ph * 9) * 0.06;
      return -0.15;
    default: { // clapping along, swaying
      const k = Math.sin(ph * 7);
      r.armL.rotation.x = r.armR.rotation.x = -1.25; r.armL.rotation.z = 0.25 + k * 0.25; r.armR.rotation.z = -0.25 - k * 0.25;
      r.body.rotation.z = Math.sin(ph * 1.5) * 0.06;
      return -0.15;
    }
  }
}
