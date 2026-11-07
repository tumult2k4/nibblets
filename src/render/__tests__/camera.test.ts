import { describe, expect, it } from 'vitest';
import { panDelta } from '../camera';

/** Ground direction the camera looks along: from its position (target + (sin yaw, cos yaw)) to the target. */
const forward = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

describe('screen-relative panning', () => {
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315, 400, -30]) {
    const yaw = (deg * Math.PI) / 180;
    it(`W moves forward and D moves right at yaw ${deg}°`, () => {
      const w = panDelta(yaw, 0, -1), f = forward(yaw);
      expect(w.x).toBeCloseTo(f.x);
      expect(w.z).toBeCloseTo(f.z);
      const d = panDelta(yaw, 1, 0);
      expect(d.x * f.x + d.z * f.z).toBeCloseTo(0); // perpendicular to forward
      expect(f.x * d.z - f.z * d.x).toBeGreaterThan(0.99); // and to the right of it (y up)
      const s = panDelta(yaw, 0, 1), a = panDelta(yaw, -1, 0);
      expect(s.x).toBeCloseTo(-w.x);
      expect(a.z).toBeCloseTo(-d.z);
    });
  }
});
