/**
 * The Mock's templates for books, eulogies, the chronicle and the village's name (P9.5, English and German), filled
 * from the facts the prompts were built from; a believer's book thanks the god, the chronicle tells the god's season
 * (P9.8). Imported once by the director.
 */
import { registerMock } from './provider';

type Pick = <T>(xs: readonly T[]) => T;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

registerMock('book', (r, pick: Pick) => {
  const f = r.facts, de = f?.lang === 'de', name = String(f?.name ?? '');
  const title = pick(de ? [`Wie ${name} Dinge macht`, `${name}s Buch vom Wissen`, `Was ${name} weiß`, 'Nicht vergessen!'] : [`How ${name} Makes Things`, `${name}'s Book of Knowing`, `What ${name} Knows`, 'Do Not Forget!']);
  const body = strs(f?.contents).map((c) => {
    const [thing, inputs] = c.split(': ');
    return inputs ? (de ? `${cap(thing!)}: Nimm ${inputs} und hab Geduld.` : `${cap(thing!)}: take ${inputs}, and be patient.`) : (de ? `Merk dir, ${c}!` : `Remember ${c}!`);
  });
  const open = de ? `Das ist das Buch von ${name}. Lies es und vergiss nichts.` : `This is the book of ${name}. Read it and do not forget.`;
  const god = typeof f?.god === 'string' ? f.god : '', thanks = !god ? [] : [de ? `${cap(god)} hat uns dieses Wissen geschenkt. Gelobt sei ${god}!` : `${cap(god)} gave us this knowing. Praise be to ${god}!`];
  return `Title: ${title}\n${[open, ...body, ...thanks, de ? 'Jetzt weißt du es. Grub-gob!' : 'Now you know. Grub-gob!'].join(' ')}`;
});

registerMock('eulogy', (r, pick: Pick) => {
  const f = r.facts, de = f?.lang === 'de', dead = String(f?.dead ?? ''), epithet = String(f?.epithet ?? '');
  const deeds = strs(f?.deeds).slice(-2).map((d) => (de ? `Ich erinnere mich: ${d}.` : `I remember this: ${d}.`));
  const open = de ? `${dead} gehörte zu uns${epithet ? `, man nannte ${dead} ${epithet}` : ''}.` : `${dead} was one of us${epithet ? `, and we called ${dead} ${epithet}` : ''}.`;
  const shut = pick(de
    ? ['Die Äpfel werden jetzt weniger süß schmecken.', `Schlaf gut unter dem Moos, ${dead}.`, `Wir werden den Kleinen von ${dead} erzählen.`]
    : ['The apples will taste less sweet now.', `Sleep well under the moss, ${dead}.`, `We will tell the little ones about ${dead}.`]);
  return [open, ...deeds, shut].join(' ');
});

registerMock('chronicle', (r, pick: Pick) => {
  const f = r.facts, de = f?.lang === 'de', pop = (f?.pop as number[] | undefined) ?? [0, 0];
  const hatched = Number(f?.hatched ?? 0), died = Number(f?.died ?? 0);
  const ev = strs(f?.events).slice(-4).map((l) => {
    const [day, what = l] = l.split(' — ');
    return de ? `${cap(day!)}: ${cap(what)}.` : `On ${day}, ${what}.`;
  });
  const gs = f?.god as { name: string; acts: number; prayers: number; answered: number; spoke: number; words: string[] } | undefined;
  const out = de
    ? [`Hier schreibt ${String(f?.name)} vom ${String(f?.season)} des Jahres ${String(f?.year)} in ${String(f?.village)}.`, `Wir waren ${pop[0]}, als er begann, und ${pop[1]}, als er endete.`,
      hatched ? `${hatched} Kleine sind geschlüpft.` : '', died ? `${died} von uns ruhen jetzt unter dem Moos.` : '', ...ev, ...godOf(gs, true),
      pick(['So war es. Möge die nächste Jahreszeit gut zu uns sein.', 'Das war die Jahreszeit. Grub-gob.'])]
    : [`Here ${String(f?.name)} writes of the ${String(f?.season)} of year ${String(f?.year)} in ${String(f?.village)}.`, `We were ${pop[0]} when it began and ${pop[1]} when it ended.`,
      hatched ? `${hatched} little ones hatched.` : '', died ? `${died} of us went under the moss.` : '', ...ev, ...godOf(gs, false),
      pick(['So it was. Let the next season be kind.', 'That was the season. Grub-gob.'])];
  return out.filter(Boolean).join(' ');
});

/** The god's season in the chronicle (P9.8): its wonders, the prayers heard, its words. */
function godOf(g: { name: string; acts: number; prayers: number; answered: number; spoke: number; words: string[] } | undefined, de: boolean): string[] {
  if (!g) return [];
  const n = cap(g.name), times = (k: number): string => (de ? (k === 1 ? 'einmal' : `${k}-mal`) : k === 1 ? 'once' : `${k} times`);
  return de
    ? [g.acts ? `${n} wirkte ${g.acts === 1 ? 'ein Wunder' : `${g.acts} Wunder`} unter uns.` : '', g.prayers ? `Wir beteten ${times(g.prayers)}, und ${g.answered === 1 ? 'ein Gebet wurde' : `${g.answered} Gebete wurden`} erhört.` : '',
      g.spoke ? `${n} sprach ${times(g.spoke)} zu uns.` : '', g.words[0] ? `${n} sagte: „${g.words[0]}“` : '']
    : [g.acts ? `${n} worked ${g.acts === 1 ? 'a wonder' : `${g.acts} wonders`} among us.` : '', g.prayers ? `We prayed ${times(g.prayers)}, and ${g.answered === 1 ? 'one prayer was' : `${g.answered} prayers were`} answered.` : '',
      g.spoke ? `${n} spoke to us ${times(g.spoke)}.` : '', g.words[0] ? `${n} said: “${g.words[0]}”` : ''];
}

registerMock('village_name', (r, pick: Pick) => r.facts?.lang === 'de'
  ? pick(['Moos', 'Apfel', 'Matsch', 'Kiesel', 'Dorn', 'Pfützen', 'Kröten', 'Krumm', 'Nessel', 'Farn']) + pick(['grund', 'mulde', 'winkel', 'bau', 'hügel', 'moor', 'fleck', 'buckel'])
  : pick(['Moss', 'Apple', 'Mud', 'Pebble', 'Bramble', 'Puddle', 'Toad', 'Crook', 'Nettle', 'Fern']) + pick(['bottom', 'hollow', 'dell', 'nook', 'burrow', 'knoll', 'mire', 'patch', 'wick', 'hump']));
