/**
 * Keyboard-only play (§18.3, P11.4). The panels are reached with F6 (rebindable): it moves the focus into the next open
 * panel (top bar, toolbar, inspector, feed…), or into the open dialog, which keeps it to itself. Inside, Tab and
 * Shift+Tab go from control to control, Enter or Space presses, and Esc gives the keyboard back to the world.
 */
const FOCUSABLE = 'button:not([disabled]), [role="button"], input:not([disabled]), select:not([disabled]), textarea, a[href], [tabindex]:not([tabindex="-1"])';

const shown = (e: HTMLElement): boolean => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
const controls = (p: HTMLElement): HTMLElement[] => [...p.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);

/** The regions F6 steps through: the open dialog or title menu alone, else every visible top-level panel. */
function regions(root: HTMLElement): HTMLElement[] {
  const screen = [...root.querySelectorAll<HTMLElement>('.screen')].filter(shown).pop();
  if (screen) return [screen];
  return [...root.querySelectorAll<HTMLElement>('.panel')].filter((p) => !p.parentElement?.closest('.panel') && shown(p) && controls(p).length > 0);
}

/** Is the keyboard working inside the UI (a control has the focus)? */
export const inPanels = (root: HTMLElement): boolean => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && a !== document.body && root.contains(a);
};

/** Focus the first control of the next (or previous) region; false if there is none. */
export function focusNextRegion(root: HTMLElement, back = false): boolean {
  const rs = regions(root);
  if (!rs.length) return false;
  const a = document.activeElement as HTMLElement | null;
  const i = rs.findIndex((r) => !!a && r.contains(a));
  const next = rs[i < 0 ? (back ? rs.length - 1 : 0) : (i + (back ? rs.length - 1 : 1)) % rs.length]!;
  const c = controls(next)[0];
  c?.focus();
  return !!c;
}

/** Hand the keyboard back to the world (Esc inside a panel). */
export function leavePanels(root: HTMLElement): boolean {
  if (!inPanels(root) || [...root.querySelectorAll<HTMLElement>('.screen')].some(shown)) return false;
  (document.activeElement as HTMLElement).blur();
  return true;
}

/** The panel a control sits in, counted from the top (panels nest). */
function topPanel(e: HTMLElement): HTMLElement | null {
  let p = e.closest<HTMLElement>('.panel');
  while (p?.parentElement?.closest('.panel')) p = p.parentElement.closest<HTMLElement>('.panel');
  return p;
}

/**
 * A pressed control often redraws its panel, or opens a dialog in place of the screen, and the focus drops to the
 * page. Put it back: on the same control (by its text, else its place) in the same or redrawn panel, or on the
 * first control of the dialog that opened. A closed panel or a started game gives the keyboard back to the world.
 */
export function keepFocus(root: HTMLElement): void {
  let pending: { region: HTMLElement; cls: string; idx: number; text: string } | null = null;
  const press = (e: KeyboardEvent) => e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter';
  window.addEventListener('keydown', (e) => {
    const a = document.activeElement as HTMLElement | null;
    if (!press(e) || !a || !root.contains(a) || pending) return;
    const region = a.closest<HTMLElement>('.screen') ?? topPanel(a);
    if (region) pending = { region, cls: region.className, idx: controls(region).indexOf(a), text: a.textContent ?? '' };
  }, true);
  window.addEventListener('keyup', (e) => {
    const p = pending;
    if (!press(e) || !p) return;
    pending = null;
    setTimeout(() => {
      const now = document.activeElement;
      if (now && now !== document.body && root.contains(now)) return;
      const rs = regions(root), same = p.region.isConnected ? p.region : p.region.matches('.screen') ? undefined : rs.find((r) => r.className === p.cls);
      const target = same ?? (rs.length === 1 && rs[0]!.matches('.screen') ? rs[0]! : null);
      if (!target || !shown(target)) return;
      const cs = controls(target);
      (same ? cs.find((c) => c.textContent === p.text) ?? cs[Math.min(p.idx, cs.length - 1)] : cs[0])?.focus();
    }, 60);
  }, true);
}

/** Tab inside an open dialog wraps around in it rather than wandering off behind it; true if it moved the focus. */
export function trapTab(root: HTMLElement, back: boolean): boolean {
  const screen = regions(root).find((r) => r.matches('.screen'));
  if (!screen) return false;
  const cs = controls(screen), a = document.activeElement as HTMLElement | null, i = a ? cs.indexOf(a) : -1;
  if (!cs.length || (i >= 0 && !(back ? i === 0 : i === cs.length - 1))) return false;
  cs[back ? cs.length - 1 : 0]!.focus();
  return true;
}
