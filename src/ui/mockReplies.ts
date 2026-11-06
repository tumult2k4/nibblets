/**
 * Mock replies to the god (§17.7.2 non-LLM mode, P8.9): template lines keyed by what the goblin made of it (obeys,
 * defies, doubts, babbles, just marvels) and the tone, flavored by personality. UI only: the sim already decided who
 * obeys; this only puts words to it. Also the "understood as" summary shown in the Voice panel.
 */
import type { Goblin } from '../sim/state';
import type { ParsedIntent, Tone, WishIntent } from '../shared/types';
import { CFG } from '../sim/config';
import { t } from './i18n';

const pick = (s: string): string => {
  const xs = s.split('|');
  return xs[Math.floor(Math.random() * xs.length)] ?? xs[0]!;
};

export type Stance = 'obey' | 'defy' | 'skeptic' | 'baby' | 'chat';

export function stanceOf(g: Goblin, issuedTick: number, intents: number): Stance {
  if (g.lifeStage === 'hatchling') return 'baby';
  if (g.godView.faith < CFG.god.skepticFaith) return 'skeptic';
  if (g.godView.wishes.some((x) => x.issuedTick === issuedTick && x.defied)) return 'defy';
  return intents ? 'obey' : 'chat';
}

/** One line in the goblin's voice. */
export function mockReply(g: Goblin, stance: Stance, tone: Tone, god: string): string {
  const vars = { name: g.name, god };
  if (stance === 'obey' && g.personality.mischief > 0.65 && tone !== 'wrathful' && Math.random() < 0.5) return pick(t('reply.cheeky', vars));
  const key = stance === 'obey' ? `reply.obey.${tone}` : `reply.${stance}`;
  return pick(t(key, vars));
}

/** "gather wood · stern" */
export function understood(intents: ParsedIntent[] | WishIntent[], tone: Tone): string {
  const words = intents.map((x) => {
    const it = typeof x === 'string' ? { intent: x } as ParsedIntent : x;
    const v = it.target?.value;
    const what = it.target?.kind === 'item' ? t(`item.${v}`) : it.target?.kind === 'building' && typeof v === 'string' ? t(`bld.${v}`) : '';
    return what ? `${t(`intent.${it.intent}`)} ${what}` : t(`intent.${it.intent}`);
  });
  return [...words, t(`tone.${tone}`)].join(' · ');
}
