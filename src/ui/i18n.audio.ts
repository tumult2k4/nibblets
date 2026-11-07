/** Sound settings strings (ElevenLabs audio). */
export const ENA = {
  'set.sound': 'Sound', 'set.master': 'Master volume', 'set.music': 'Music', 'set.ambience': 'Ambience', 'set.sfx': 'Effects',
  'set.voices': 'Goblin voices', 'set.mute': 'Mute all', 'set.soundNote': 'Sound starts after your first click. Press {key} to mute or unmute.',
  'key.mute': 'Mute sound',
};
export const DEA: Record<keyof typeof ENA, string> = {
  'set.sound': 'Ton', 'set.master': 'Gesamtlautstärke', 'set.music': 'Musik', 'set.ambience': 'Umgebung', 'set.sfx': 'Effekte',
  'set.voices': 'Goblinstimmen', 'set.mute': 'Alles stumm', 'set.soundNote': 'Der Ton startet nach dem ersten Klick. {key} schaltet ihn stumm und wieder an.',
  'key.mute': 'Ton stumm',
};
