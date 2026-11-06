import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import { overlay, field, select, checkbox } from './common';
import { createWorldState, type WorldParams } from '../../sim/newWorld';
import { generateTiles, TERRAIN_PRESETS, type TerrainPreset } from '../../sim/worldgen';
import { CLAN_ARCHETYPES, type ClanArchetype } from '../../sim/goblin/genetics/founders';
import { phenotypeOf, express } from '../../sim/goblin/genetics/phenotype';
import { ageDays } from '../../sim/goblin/goblin';
import { portraits } from '../../render/portraits';
import { BIOME_COLORS } from '../../render/palette';
import { LOCUS_DEFS } from '../../sim/goblin/genetics/genome';

/** New World wizard (§18.3): World / Founders / Rules with live previews. */
export function newWorldWizard(onStart: (p: WorldParams) => void, onCancel: () => void): HTMLElement {
  const p: Required<Pick<WorldParams, 'seed' | 'size' | 'preset' | 'archetype' | 'founders' | 'mode' | 'gentle' | 'founderSalt' | 'difficulty'>> =
    { seed: Math.floor(Math.random() * 1e6), size: 128, preset: 'island', archetype: 'mixed', founders: 10, mode: 'sandbox', gentle: false, founderSalt: 0, difficulty: 'normal' };
  let step = 0;
  const body = el('div');
  const steps = el('div.steps');
  const nav = el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px' });
  const { root } = overlay(el('h1', { text: t('menu.new') }), steps, body, nav);

  const preview = el('canvas', { width: 128, height: 128, style: 'width:220px;height:220px;border-radius:10px;border:2px solid var(--bark);image-rendering:pixelated' });
  let pvTimer = 0;
  const drawPreview = () => {
    window.clearTimeout(pvTimer);
    pvTimer = window.setTimeout(() => {
      const tiles = generateTiles(p.seed >>> 0, p.size, p.size, p.preset);
      preview.width = preview.height = p.size;
      const img = new ImageData(p.size, p.size);
      tiles.forEach((tl, i) => {
        const c = BIOME_COLORS[tl.biome];
        const sh = 0.75 + tl.height * 0.5;
        img.data.set([c.r * 255 * sh, c.g * 255 * sh, c.b * 255 * sh, 255], i * 4);
      });
      preview.getContext('2d')!.putImageData(img, 0, 0);
    }, 60);
  };

  const worldStep = () => {
    const seed = el('input', { type: 'text', value: String(p.seed), oninput: () => { p.seed = Number(seed.value.replace(/\D/g, '')) || 0; drawPreview(); } });
    const dice = el('button.btn', { 'data-tip': t('wiz.dice'), onclick: () => { p.seed = Math.floor(Math.random() * 1e6); seed.value = String(p.seed); drawPreview(); } }, icon('dice'));
    drawPreview();
    return el('div', { style: 'display:flex;gap:20px;align-items:flex-start' },
      el('div.form', {}, ...field(t('wiz.seed'), el('div', { style: 'display:flex;gap:6px' }, seed, dice)),
        ...field(t('wiz.size'), select<number>([[96, t('wiz.small')], [128, t('wiz.medium')], [160, t('wiz.large')]], p.size, (v) => { p.size = v; drawPreview(); })),
        ...field(t('wiz.preset'), select<TerrainPreset>(TERRAIN_PRESETS.map((x) => [x, t(`preset.${x}`)]), p.preset, (v) => { p.preset = v; drawPreview(); }))),
      el('div', {}, el('div.sub', { text: t('wiz.preview') }), preview));
  };

  const foundersStep = () => {
    const row = el('div.founders');
    const info = el('div.sub', { style: 'min-height:2.5em;margin-top:6px' });
    const render = () => {
      const s = createWorldState({ ...p });
      row.replaceChildren(...s.goblins.map((g) => {
        const ph = phenotypeOf({ genome: g.genome, ageDays: ageDays(g, s.tick), stage: g.lifeStage, hunger: 70, scars: 0 });
        const img = el('img', { src: portraits.get(ph, g.id * 31 + 7, 0.35, true), style: 'width:96px;height:96px;border-radius:10px;border:2px solid var(--bark);background:#cfe6f2' });
        return el('div.f', { onclick: () => {
          info.textContent = `${g.name}: ` + LOCUS_DEFS.filter((d) => ['skinHue', 'pattern', 'adultSize', 'earLength', 'noseSize', 'tusks'].includes(d.key))
            .map((d) => `${d.label} ${d.kind === 'hue' ? Math.round(express(g.genome, d.key)) + '°' : express(g.genome, d.key).toFixed(2)}`).join(' · ');
        } }, img, el('div', { text: g.name }));
      }));
    };
    render();
    return el('div', {},
      el('div.form', {},
        ...field(t('wiz.clan'), select<ClanArchetype>(CLAN_ARCHETYPES.map((c) => [c, t(`clan.${c}`)]), p.archetype, (v) => { p.archetype = v; render(); })),
        ...field(t('wiz.count'), select<number>(Array.from({ length: 11 }, (_, i) => [i + 6, String(i + 6)] as [number, string]), p.founders, (v) => { p.founders = v; render(); }))),
      el('div', { style: 'margin:10px 0' }, el('button.btn', { onclick: () => { p.founderSalt += 1; render(); } }, icon('dice'), ` ${t('wiz.reroll')}`)),
      row, info);
  };

  const rulesStep = () => el('div.form', {},
    ...field(t('wiz.mode'), el('div', {}, select<'sandbox' | 'divine' | 'observer'>([['sandbox', t('mode.sandbox')], ['divine', t('mode.divine')], ['observer', t('mode.observer')]], p.mode, (v) => (p.mode = v)),
      el('div.sub', { text: t('mode.divineHint'), style: 'max-width:360px' }))),
    ...field(t('wiz.difficulty'), select<'cozy' | 'normal' | 'harsh'>([['cozy', t('diff.cozy')], ['normal', t('diff.normal')], ['harsh', t('diff.harsh')]], p.difficulty, (v) => (p.difficulty = v))),
    ...field(t('wiz.gentle'), checkbox(p.gentle, (v) => (p.gentle = v))),
    ...field(t('wiz.llm'), el('span.sub', { text: t('wiz.llmLater') })));

  const render = () => {
    const names = [t('wiz.world'), t('wiz.founders'), t('wiz.rules')];
    steps.replaceChildren(...names.map((n, i) => el(`button.btn${i === step ? '.on' : ''}`, { onclick: () => { step = i; render(); } }, `${i + 1}. ${n}`)));
    body.replaceChildren(step === 0 ? worldStep() : step === 1 ? foundersStep() : rulesStep());
    nav.replaceChildren(el('button.btn', { onclick: step === 0 ? onCancel : () => { step--; render(); } }, step === 0 ? t('menu.cancel') : t('menu.back')),
      step < 2 ? el('button.btn', { onclick: () => { step++; render(); } }, t('menu.next')) : el('button.btn.on', { onclick: () => onStart({ ...p }) }, t('menu.start')));
  };
  render();
  return root;
}
