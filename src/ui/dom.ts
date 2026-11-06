type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

/** Tiny element helper: el('div.panel.top', {onclick}, children…). */
export function el<K extends keyof HTMLElementTagNameMap>(spec: K | `${K}.${string}` | `${K}#${string}`, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const [tagId, ...classes] = spec.split('.');
  const [tag, id] = tagId!.split('#') as [K, string | undefined];
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (classes.length) e.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') e.innerHTML = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  // P11.4 keyboard use: anything clickable that is not a control already can be reached with Tab and pressed with
  // Enter or Space, and an icon-only control reads its tooltip as its name
  if (typeof attrs.onclick === 'function' && !NATIVE.has(e.tagName)) {
    if (!e.hasAttribute('tabindex')) e.tabIndex = 0;
    if (!e.hasAttribute('role')) e.setAttribute('role', 'button');
  }
  if (typeof attrs['data-tip'] === 'string' && !e.hasAttribute('aria-label') && !e.textContent?.trim()) e.setAttribute('aria-label', attrs['data-tip'].replace(/<[^>]+>/g, ''));
  return e;
}
const NATIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'OPTION', 'CANVAS']);
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if ((e.code === 'Enter' || e.code === 'Space') && t.getAttribute?.('role') === 'button' && !NATIVE.has(t.tagName)) {
      e.preventDefault();
      e.stopPropagation();
      t.click();
    }
  }, true);
  // a control pressed with the mouse gives the keyboard back to the world (Space pauses rather than pressing it again)
  document.addEventListener('click', (e) => {
    const a = document.activeElement as HTMLElement | null;
    if (e.detail > 0 && a && a !== document.body && a.closest('#ui') && !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) a.blur();
  });
}

/** Set text only when it changed (components diff their own DOM, §18.13). */
export function setText(e: HTMLElement, s: string): void {
  if (e.textContent !== s) e.textContent = s;
}

export function clear(e: HTMLElement): void {
  while (e.firstChild) e.removeChild(e.firstChild);
}
