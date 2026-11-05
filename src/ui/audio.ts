/** No-op audio facade (§18.14): every interaction calls play(cue) so sound can drop in later. */
export const CUES = [
  'hand_grab', 'hand_drop', 'splash', 'thunder', 'apple_bonk', 'sign_rumble', 'voice_boom', 'prayer_ding',
  'toast_notable', 'toast_critical', 'ui_click', 'power_denied', 'pet_giggle', 'poke',
] as const;
export type Cue = (typeof CUES)[number];

export const audio = {
  enabled: false,
  play(_cue: Cue): void {
    /* stretch goal (§24.2): procedural WebAudio */
  },
};
