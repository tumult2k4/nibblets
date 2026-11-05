import { el } from '../dom';

/** Full-screen overlay with a centered parchment dialog. */
export function overlay(...kids: (Node | string | null)[]): { root: HTMLElement; dialog: HTMLElement } {
  const dialog = el('div.dialog.panel', {}, ...kids);
  const root = el('div.screen', {}, dialog);
  return { root, dialog };
}

export const field = (label: string, input: HTMLElement): HTMLElement[] => [el('label', { text: label }), input];

export function select<T extends string | number>(opts: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = el('select', { onchange: () => onChange(opts[s.selectedIndex]![0]) }, ...opts.map(([v, l]) => el('option', { value: String(v), text: l })));
  s.selectedIndex = Math.max(0, opts.findIndex(([v]) => v === value));
  return s;
}

export function checkbox(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const c = el('input', { type: 'checkbox', onchange: () => onChange(c.checked) });
  c.checked = value;
  return c;
}
