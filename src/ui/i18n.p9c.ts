/** Phase 9 strings for the Divine Voice (§17.7.2, P9.7): the Voice panel's text box, how words were understood,
 * what goblins remember when asked, and their answers. Merged by i18n.ts. */
export const EN9C = {
  'voice.speak': 'Speak', 'voice.placeholder': 'Speak as {god}…', 'voice.rumble': 'The heavens rumble…', 'voice.wait': 'The sky needs a breath ({n} s).',
  'voice.how.llm': 'read by the language model', 'voice.how.keywords': 'read from key words', 'voice.unnamed': 'the Big Sky', 'voice.godNamed': 'The goblins call their god {name}.',
  'voice.wordsOff': 'Turn on Voices (Settings → Voices) to speak in words. Signs work always.', 'voice.wordsHint': 'Up to 280 characters, in English or German. Questions get answers from what the goblins remember.',
  'mem.fruit': 'a bush with {n} apples {where}, {when}', 'mem.fruit0': 'a bare bush {where}, {when}', 'mem.water': 'water {where}', 'mem.rock': 'stone to break {where}',
  'mem.mushroom': 'mushrooms {where}, {when}', 'mem.fishing_spot': 'a good fishing spot {where}', 'mem.stockpile': 'the store {where}', 'mem.thief': '{who} stole something, {when}',
  'mem.at': 'at {place}', 'mem.near': 'near the village', 'mem.dir.n': 'north of the village', 'mem.dir.s': 'south of the village', 'mem.dir.e': 'east of the village',
  'mem.dir.w': 'west of the village', 'mem.today': 'today', 'mem.yesterday': 'yesterday', 'mem.days': '{n} days ago',
  'reply.answer': 'Grub! {what}!|{name} knows: {what}.|Hm hm. {what}, {god}!', 'reply.dunno': '{name} does not know, {god}.|Hm? {name} never saw.',
};

export const DE9C: Record<keyof typeof EN9C, string> = {
  'voice.speak': 'Sprechen', 'voice.placeholder': 'Sprich als {god}…', 'voice.rumble': 'Der Himmel grollt…', 'voice.wait': 'Der Himmel muss Luft holen ({n} s).',
  'voice.how.llm': 'vom Sprachmodell gelesen', 'voice.how.keywords': 'an Schlüsselwörtern gelesen', 'voice.unnamed': 'der Große Himmel', 'voice.godNamed': 'Die Goblins nennen ihren Gott {name}.',
  'voice.wordsOff': 'Schalte die Stimmen ein (Einstellungen → Stimmen), um in Worten zu sprechen. Zeichen gehen immer.', 'voice.wordsHint': 'Bis zu 280 Zeichen, auf Deutsch oder Englisch. Fragen beantworten die Goblins aus dem, woran sie sich erinnern.',
  'mem.fruit': 'ein Busch mit {n} Äpfeln {where}, {when}', 'mem.fruit0': 'ein leerer Busch {where}, {when}', 'mem.water': 'Wasser {where}', 'mem.rock': 'Stein zum Hauen {where}',
  'mem.mushroom': 'Pilze {where}, {when}', 'mem.fishing_spot': 'eine gute Angelstelle {where}', 'mem.stockpile': 'das Lager {where}', 'mem.thief': '{who} hat etwas gestohlen, {when}',
  'mem.at': 'bei {place}', 'mem.near': 'nah beim Dorf', 'mem.dir.n': 'nördlich vom Dorf', 'mem.dir.s': 'südlich vom Dorf', 'mem.dir.e': 'östlich vom Dorf',
  'mem.dir.w': 'westlich vom Dorf', 'mem.today': 'heute', 'mem.yesterday': 'gestern', 'mem.days': 'vor {n} Tagen',
  'reply.answer': 'Grub! {what}!|{name} weiß: {what}.|Hm hm. {what}, {god}!', 'reply.dunno': '{name} weiß es nicht, {god}.|Hm? {name} hat nichts gesehen.',
};
