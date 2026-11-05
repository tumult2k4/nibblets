/** Phase 6 strings (health, disasters, death culture), merged into the main tables by i18n.ts. */
export const EN6 = {
  'cause.disease': 'illness', 'cause.fire': 'fire', 'cause.poison': 'poison', 'cause.drowning': 'drowning',
  'disease.sniffles': 'the sniffles', 'disease.gut_rot': 'gut rot', 'disease.shivers': 'the shivers', 'disease.spotted_fever': 'spotted fever',
  'ev.fell_ill': '{name} has come down with {d}.', 'ev.recovered': '{name} got over {d}.',
  'ev.outbreak': 'Spotted fever! {name} is covered in green spots.', 'ev.tended': '{a} is looking after {b}.',
  'act.rest_sick': 'Resting, unwell', 'act.tend_sick': 'Looking after someone',
  'insp.ill': '{d}: sick, about {n} days to go', 'insp.incubating': '{d}: caught it, not showing yet', 'insp.tended': 'being looked after',
  'insp.immune': 'immune to {d}',
} as const;

export const DE6: Record<keyof typeof EN6, string> = {
  'cause.disease': 'Krankheit', 'cause.fire': 'Feuer', 'cause.poison': 'Gift', 'cause.drowning': 'Ertrinken',
  'disease.sniffles': 'Schnupfen', 'disease.gut_rot': 'Bauchgrimmen', 'disease.shivers': 'Schüttelfrost', 'disease.spotted_fever': 'Fleckfieber',
  'ev.fell_ill': '{name} hat {d} bekommen.', 'ev.recovered': '{name} hat {d} überstanden.',
  'ev.outbreak': 'Fleckfieber! {name} ist voller grüner Flecken.', 'ev.tended': '{a} kümmert sich um {b}.',
  'act.rest_sick': 'Kuriert sich aus', 'act.tend_sick': 'Pflegt jemanden',
  'insp.ill': '{d}: krank, noch etwa {n} Tage', 'insp.incubating': '{d}: angesteckt, noch ohne Anzeichen', 'insp.tended': 'wird gepflegt',
  'insp.immune': 'immun gegen {d}',
};
