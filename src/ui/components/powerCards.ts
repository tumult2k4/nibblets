import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx } from '../ctx';
import { CFG } from '../../sim/config';
import { CAST_POWERS, cooldownLeft } from '../../sim/god/cast';
import { POWER_DEFS, type PowerCategory } from '../../sim/god/powerDefs';
import { armPower, CATEGORY_COLOR } from '../tools/castTool';

export const POWER_ICONS: Record<string, string> = {
  apple_shower: 'apple', bountiful_growth: 'leaf', warm_sun: 'heat', rain: 'rain', clear_sky: 'sun', snowfall: 'snow',
  gust: 'wind', fast_forward: 'clock', hasten_season: 'leaf',
  lightning: 'bolt', swarm: 'swarm', curse: 'curse', summon_gnashers: 'fang', summon_bramblebeast: 'fang', meteor: 'meteor',
};

/** Castable powers of a category (implemented phases only). */
export const castablesOf = (cat: PowerCategory) => POWER_DEFS.filter((p) => p.category === cat && CAST_POWERS.includes(p.id));

/** Signature that changes whenever a card would look different (cooldown in 5 % steps, favor, tier). */
export function cardsSig(ctx: Ctx, cat: PowerCategory): string {
  const w = ctx.game.world;
  const g = w.s.god;
  if (g.mode !== 'divine') return `${g.mode}:${ctx.store.state.armed}`;
  return `${ctx.store.state.armed}:${g.tier}:${Math.floor(g.favor)}:` + castablesOf(cat).map((p) => Math.ceil(cooldownLeft(w, p.id) / Math.max(1, p.cooldownHours * CFG.god.hourTicks) * 20)).join('.');
}

/**
 * Power cards (§18.4 step 6): cost or "Free", greyed when locked or unaffordable (with the shortfall),
 * a cooldown ring while recharging, gold when armed. Clicking arms (or casts a sky-wide power at once).
 */
export function powerCards(ctx: Ctx, cat: PowerCategory): HTMLElement[] {
  const w = ctx.game.world;
  const g = w.s.god;
  const divine = g.mode === 'divine';
  return castablesOf(cat).map((p) => {
    const cd = cooldownLeft(w, p.id);
    const locked = divine && g.tier < p.tier;
    const short = divine ? Math.ceil(p.cost - g.favor) : 0;
    const meta = !divine ? t('power.free') : locked ? t('power.tier', { n: p.tier }) : short > 0 ? t('power.short', { n: short })
      : cd > 0 ? t('power.ready', { h: Math.ceil(cd / CFG.god.hourTicks) }) : t('power.cost', { n: p.cost });
    const armed = ctx.store.state.armed === p.id;
    const card = el(`div.card${armed ? '.on' : ''}${locked || short > 0 || cd > 0 ? '.locked' : ''}`, {
      onclick: () => { if (!locked) armPower(ctx, armed ? null : p.id); },
    }, icon(POWER_ICONS[p.id] ?? 'sparkle'), el('div.name', { text: t(`power.${p.id}`) }), el('div.meta', { text: meta }));
    card.style.borderColor = armed ? CATEGORY_COLOR[cat]! : '';
    if (cd > 0) {
      const frac = cd / (p.cooldownHours * CFG.god.hourTicks);
      card.append(el('div.cdring', { style: `background:conic-gradient(rgba(46,42,36,.45) ${Math.round(frac * 360)}deg, transparent 0)` }));
    }
    card.dataset.tip = t(`power.${p.id}Desc`);
    return card;
  });
}
