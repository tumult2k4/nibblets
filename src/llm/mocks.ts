/**
 * The Mock's templates for diaries, dialogue and barks (§19.1 "works offline", P9.4, English and German): plain
 * goblin talk filled from the facts a prompt was built from (the day's lines, the names, the topic), picked by a
 * hash of the prompt, so the same day reads the same. Imported once by the director.
 */
import { registerMock } from './provider';

type Pick = <T>(xs: readonly T[]) => T;
const de = (f?: Record<string, unknown>): boolean => f?.lang === 'de';
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const WHEN: Record<string, string> = {
  dawn: 'At dawn', morning: 'In the morning', midday: 'At midday', afternoon: 'In the afternoon', dusk: 'At dusk', night: 'At night',
  früh: 'Ganz früh', morgens: 'Am Morgen', mittags: 'Mittags', nachmittags: 'Am Nachmittag', abends: 'Am Abend', nachts: 'In der Nacht',
};

/** "dusk — I slew a Gnasher ×2" → "At dusk: I slew a Gnasher (2 times)." */
function sentence(line: string, german: boolean): string {
  const [tod = '', what = line] = line.split(' — ');
  const body = cap(what.replace(/ ×(\d+)$/, german ? ' ($1-mal)' : ' ($1 times)'));
  return `${WHEN[tod] ?? cap(tod)}: ${body}.`;
}

registerMock('diary', (r, pick: Pick) => {
  const f = r.facts, g = de(f), lines = (f?.lines as string[] | undefined) ?? [], feel = String(f?.emotion ?? '');
  const open = g
    ? pick(['Grub-gob, was für ein Tag.', 'Liebes Tagebuch, hier ist wieder {name}.', 'Beim großen Apfel!', 'Heute war ein Tag. Hör zu.'])
    : pick(['Grub-gob, what a day.', 'Dear diary, it is me, {name}, again.', 'By the big apple!', 'Today was a day. Listen.']);
  const shut = g
    ? pick(['Jetzt schlafen.', 'Morgen mehr Äpfel, hoffe ich.', 'Grub-gob.', 'Mal sehen, was morgen kommt.'])
    : pick(['Now sleep.', 'More apples tomorrow, I hope.', 'Grub-gob.', 'We will see what tomorrow brings.']);
  const body = lines.slice(-5).map((l) => sentence(l, g));
  const mood = feel ? (g ? `Ich bin ${feel}.` : `I feel ${feel}.`) : '';
  const quiet = g ? 'Nicht viel passiert. Ich habe gegessen und geschlafen.' : 'Not much happened. I ate and I slept.';
  return [open.replace('{name}', String(f?.name ?? '')), ...(body.length ? body : [quiet]), mood, shut].filter(Boolean).join(' ');
});

const TOPIC_EN: Record<string, readonly string[]> = {
  weather: ['Look at the sky. What will it do?', 'The sky is grumpy today.'], food: ['My belly wants apples.', 'Did you find any berries?'],
  danger: ['Keep your eyes open. Gnashers!', 'I heard something in the bushes.'], gossip: ['Did you hear the news?', 'Psst. Want to know something?'],
  a_person: ['Have you seen the chief today?', 'Some goblins are strange, yes?'], trinkets: ['I found a shiny thing. Want to see?', 'Shiny things are the best things.'],
  a_place: ['The pond is nice today.', 'Do you know the old spot by the trees?'], the_dead: ['I still think of the ones who are gone.', 'The dead are quiet now.'],
  festival: ['When is the next feast?', 'I liked the dancing!'], complaint: ['Everything is too much today.', 'My feet hurt. Again.'],
};
const TOPIC_DE: Record<string, readonly string[]> = {
  weather: ['Schau mal zum Himmel. Was macht er wohl?', 'Der Himmel ist heute grummelig.'], food: ['Mein Bauch will Äpfel.', 'Hast du Beeren gefunden?'],
  danger: ['Augen auf. Knirscher!', 'Ich habe was im Gebüsch gehört.'], gossip: ['Hast du schon gehört?', 'Psst. Willst du was wissen?'],
  a_person: ['Hast du den Häuptling heute gesehen?', 'Manche Goblins sind komisch, oder?'], trinkets: ['Ich hab was Glänzendes gefunden. Willst du sehen?', 'Glänzende Dinge sind die besten Dinge.'],
  a_place: ['Am Teich ist es heute schön.', 'Kennst du die alte Stelle bei den Bäumen?'], the_dead: ['Ich denke noch an die, die fort sind.', 'Die Toten sind jetzt still.'],
  festival: ['Wann ist das nächste Fest?', 'Das Tanzen war schön!'], complaint: ['Heute ist alles zu viel.', 'Mir tun die Füße weh. Schon wieder.'],
};

/** "dusk — I slew a Gnasher at Sad Pond" → "I slew a Gnasher at Sad Pond!" */
const news = (l: unknown): string | null => (typeof l === 'string' && l ? `${cap(l.split(' — ').pop()!.replace(/ ×\d+$/, ''))}!` : null);

registerMock('dialogue', (r, pick: Pick) => {
  const f = r.facts, g = de(f), [a = '?', b = '?'] = (f?.names as string[] | undefined) ?? [];
  const [na, nb] = ((f?.news as unknown[] | undefined) ?? []).map(news);
  const out = [`${a}: ${pick(g ? [`Grub-gob, ${b}!`, `Hallo, ${b}.`, `${b}! Da bist du ja.`] : [`Grub-gob, ${b}!`, `Hello, ${b}.`, `${b}! There you are.`])}`];
  out.push(`${b}: ${pick((g ? TOPIC_DE : TOPIC_EN)[String(f?.topic)] ?? (g ? ['Hm.'] : ['Hm.']))}`);
  if (na) out.push(`${a}: ${na}`, `${b}: ${pick(g ? ['Grub-gob! Wirklich?', 'Beim großen Apfel!', 'Mutig, mutig.'] : ['Grub-gob! Really?', 'By the big apple!', 'Brave, brave.'])}`);
  else if (nb) out.push(`${b}: ${nb}`, `${a}: ${pick(g ? ['Nein! Wirklich?', 'Beim großen Apfel!'] : ['No! Really?', 'By the big apple!'])}`);
  else out.push(`${a}: ${pick(g ? ['Ja, ja.', 'Genau so.', 'Grub-gob.'] : ['Yes, yes.', 'Just so.', 'Grub-gob.'])}`);
  return out.join('\n');
});

const BARK_EN: Record<string, readonly string[]> = {
  win: ['Ha! Take that!', 'Nobody beats {name}!', 'Run, beastie, run!'], discovery: ['I figured it out!', 'Look what I made!', 'Clever {name}, clever!'],
  hatch: ['A little one! Hello, little one!', 'Welcome, tiny grub!'], grief: ['No... not you...', 'Why? Why!', 'I will miss you.'],
};
const BARK_DE: Record<string, readonly string[]> = {
  win: ['Ha! Nimm das!', 'Keiner schlägt {name}!', 'Lauf, Biest, lauf!'], discovery: ['Ich hab’s raus!', 'Schau, was ich gemacht hab!', 'Schlauer {name}, schlau!'],
  hatch: ['Ein Kleines! Hallo, du Kleines!', 'Willkommen, winziger Wurm!'], grief: ['Nein... nicht du...', 'Warum? Warum!', 'Ich werde dich vermissen.'],
};

registerMock('bark', (r, pick: Pick) => {
  const f = r.facts, set = (de(f) ? BARK_DE : BARK_EN)[String(f?.kind)] ?? (de(f) ? ['Grub-gob!'] : ['Grub-gob!']);
  return pick(set).replace('{name}', String(f?.name ?? ''));
});
