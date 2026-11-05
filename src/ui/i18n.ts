/** All UI strings (§18.1 rule 6). `t(key, params)`; English + Deutsch. Split in two files for size. */
import { EN } from './i18n.en';
import { DE } from './i18n.de';

export type Lang = 'en' | 'de';
export type I18nKey = keyof typeof EN;
const TABLES: Record<Lang, Record<string, string>> = { en: EN, de: DE };
let lang: Lang = 'en';
const listeners: (() => void)[] = [];

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  for (const f of listeners) f();
}
export const getLang = (): Lang => lang;
export const onLangChange = (f: () => void): void => {
  listeners.push(f);
};

export function t(key: I18nKey | string, params?: Record<string, string | number>): string {
  let s = TABLES[lang][key] ?? EN[key as I18nKey] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Keys missing from German (used by a unit test). */
export const missingGerman = (): string[] => Object.keys(EN).filter((k) => !(k in DE));
