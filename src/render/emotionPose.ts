/**
 * Emotions on the body (§7.5, P8.1), laid over goblinView's poses: the shown emotion bends the head and the ears
 * whatever the goblin does, and an idle goblin acts it out in full (a happy hop, an angry stomp, a sad slump, a
 * scared tremble). Mood breaks have their own poses: sulking with arms crossed and back turned, bingeing with both
 * hands to the mouth. Rummaging for trinkets and setting them on the shelf (P8.2) too, and brawling, sneaking and
 * owning up (P8.3). Returns how far to flatten the ears (positive: flat and drooping, negative: pricked up).
 */
import type { Goblin } from '../sim/state';
import type { GoblinRig } from './goblinMesh';
import { festivalPose } from './festivalPose';

const LYING = new Set(['sleep_ground', 'sleep_home', 'rest_sick', 'mourn', 'bury_dead', 'incubate_egg']);
const STILL = new Set(['idle', 'wander', 'wander_off', 'look_up']);

export function emotionPose(g: Goblin, r: GoblinRig, t: number): number {
  const a = g.activity, act = a.action, ph = t + g.id * 1.7;
  if (LYING.has(act)) return 0;
  const fest = festivalPose(g, r, t); // music, dancing and festivals (P8.5)
  if (fest !== null) return fest;
  if (act === 'sulk' && a.stage === 1) { // sat down, arms crossed, chin on chest
    r.body.position.y = 0.05; r.legL.rotation.x = r.legR.rotation.x = -1.3;
    r.armL.rotation.x = r.armR.rotation.x = -1.25; r.armL.rotation.z = 0.95; r.armR.rotation.z = -0.95;
    r.head.rotation.x = 0.4; r.head.rotation.y = Math.sin(ph * 0.3) * 0.15;
    return 0.45;
  }
  if (act === 'binge' && a.stage >= 1) { // stuffing it in with both hands, cheeks bulging
    const k = Math.sin(ph * 13);
    r.body.position.y = 0.05; r.legL.rotation.x = r.legR.rotation.x = -1.3;
    r.armL.rotation.x = -1.9 + k * 0.35; r.armR.rotation.x = -1.9 - k * 0.35;
    r.head.rotation.x = Math.abs(k) * 0.1;
    const sq = 1 + Math.abs(Math.sin(ph * 3)) * 0.05;
    r.body.scale.set(sq, 1 / sq, sq);
    return -0.1;
  }
  if (act === 'hunt_trinket' && a.stage === 1) { // crouched, turning stones over (P8.2)
    const k = Math.sin(ph * 7);
    r.body.position.y = 0.06; r.legL.rotation.x = r.legR.rotation.x = -1.1; r.body.rotation.x = 0.5;
    r.armL.rotation.x = -0.9 + k * 0.4; r.armR.rotation.x = -0.9 - k * 0.4; r.head.rotation.y = Math.sin(ph * 1.3) * 0.4;
    return -0.15;
  }
  if (act === 'brawl' && a.stage >= 1) { // fists flying, leaning in (P8.3)
    const k = Math.sin(ph * 14);
    r.body.rotation.x = 0.25; r.armL.rotation.x = -1.5 + k * 0.7; r.armR.rotation.x = -1.5 - k * 0.7;
    r.armL.rotation.z = -0.2; r.armR.rotation.z = 0.2; r.body.position.x += Math.sin(ph * 25) * 0.01;
    return 0.6;
  }
  if ((act === 'steal' || act === 'prank') && a.stage === 1) { // crouched, reaching, glancing about
    r.body.position.y = 0.08; r.legL.rotation.x = r.legR.rotation.x = -0.8; r.body.rotation.x = 0.35;
    r.armR.rotation.x = -1.2 + Math.sin(ph * 9) * 0.25; r.head.rotation.y = Math.sin(ph * 2.1) * 0.6;
    return 0.3;
  }
  if (act === 'apologize' && a.stage === 1) { r.head.rotation.x = 0.35; r.armL.rotation.x = r.armR.rotation.x = -0.6; r.armL.rotation.z = 0.4; r.armR.rotation.z = -0.4; return 0.5; } // head hung, hands together
  if (act === 'decorate' && a.stage === 1) { r.armL.rotation.x = r.armR.rotation.x = -1.5; r.head.rotation.x = -0.1; return -0.2; } // setting it just so
  const still = STILL.has(act) && Math.hypot(g.velocity.x, g.velocity.y) < 0.05;
  switch (g.mood.emotion) {
    case 'sad': case 'grieving':
      r.head.rotation.x += 0.3;
      if (still) { r.body.rotation.x += 0.12; r.armL.rotation.z = 0.1; r.armR.rotation.z = -0.1; }
      return 0.4;
    case 'scared':
      r.body.position.x += Math.sin(ph * 48) * 0.008;
      if (still) { r.body.scale.set(1.04, 0.9, 1.04); r.armL.rotation.x = r.armR.rotation.x = -1.0; }
      return 0.55;
    case 'angry':
      r.head.rotation.x -= 0.12;
      if (still) { // fists balled, stomping
        const k = Math.sin(ph * 6);
        r.armL.rotation.z = -0.35; r.armR.rotation.z = 0.35; r.armL.rotation.x = r.armR.rotation.x = -0.25;
        r.legL.rotation.x = -Math.max(0, k) * 0.5; r.legR.rotation.x = -Math.max(0, -k) * 0.5;
        r.body.position.x += Math.sin(ph * 30) * 0.004;
      }
      return 0.2;
    case 'excited':
      if (still) { // bouncing on the spot, arms up now and then
        const k = Math.abs(Math.sin(ph * 5));
        r.body.position.y += k * 0.07;
        if (Math.sin(ph * 0.8) > 0.5) { r.armL.rotation.x = r.armR.rotation.x = -2.6; r.armL.rotation.z = -0.3; r.armR.rotation.z = 0.3; }
      }
      return -0.3;
    case 'happy':
      if (still) r.body.position.y += Math.max(0, Math.sin(ph * 2.2)) ** 8 * 0.05; // the odd little hop
      r.head.rotation.z += Math.sin(ph * 0.7) * 0.05;
      return -0.15;
    case 'lonely':
      if (still) r.head.rotation.y = Math.sin(ph * 0.4) * 0.9; // looking about for someone
      r.head.rotation.x += 0.12;
      return 0.2;
    case 'bored':
      if (still) { r.head.rotation.z = 0.25; const s = 1 + Math.max(0, Math.sin(ph * 0.6)) ** 6 * 0.06; r.body.scale.set(s, 1 / s, s); } // a sigh
      return 0.1;
    default:
      return 0;
  }
}
