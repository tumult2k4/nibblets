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
  return e;
}

/** Set text only when it changed (components diff their own DOM, §18.13). */
export function setText(e: HTMLElement, s: string): void {
  if (e.textContent !== s) e.textContent = s;
}

export function clear(e: HTMLElement): void {
  while (e.firstChild) e.removeChild(e.firstChild);
}
