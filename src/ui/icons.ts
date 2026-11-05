/** Inline SVG sprite of chunky two-tone glyphs drawn for this project (§18.1). */
const I = '#2e2a24';
const S = (id: string, body: string) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`;
const SPRITE = [
  S('hand', `<path d="M7 13V6a1.5 1.5 0 013 0v5V4.5a1.5 1.5 0 013 0V11V5.5a1.5 1.5 0 013 0V12V8a1.5 1.5 0 013 0v7c0 4-3 7-7 7s-6-2-8-5l-2-3a1.5 1.5 0 012.4-1.8z" fill="#f4e6d4" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('apple', `<path d="M12 7c-2-2-7-1.5-7 4s3 9 5 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-9s-5-6-7-4z" fill="#c8452d" stroke="${I}" stroke-width="1.5"/><path d="M12 7c0-2 1-4 3-4" stroke="${I}" stroke-width="1.5" fill="none"/><path d="M13 5c2-1 4 0 4 0s-2 2-4 0z" fill="#6e8b3d"/>`),
  S('gift', `<rect x="4" y="10" width="16" height="10" rx="1.5" fill="#e8b64c" stroke="${I}" stroke-width="1.5"/><rect x="3" y="7" width="18" height="4" rx="1" fill="#f3d67a" stroke="${I}" stroke-width="1.5"/><path d="M12 7v13" stroke="#c8452d" stroke-width="2.5"/><path d="M12 7c-2-4-6-3-4 0zm0 0c2-4 6-3 4 0z" fill="#c8452d" stroke="${I}"/>`),
  S('menu', `<path d="M4 7h16M4 12h16M4 17h16" stroke="${I}" stroke-width="2.5" stroke-linecap="round"/>`),
  S('pause', `<rect x="6" y="5" width="4" height="14" rx="1" fill="${I}"/><rect x="14" y="5" width="4" height="14" rx="1" fill="${I}"/>`),
  S('play', `<path d="M7 5l12 7-12 7z" fill="${I}"/>`),
  S('bell', `<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" fill="#e8b64c" stroke="${I}" stroke-width="1.5"/><circle cx="12" cy="20" r="2" fill="${I}"/>`),
  S('eye', `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><circle cx="12" cy="12" r="3.5" fill="#7fb3d5" stroke="${I}"/>`),
  S('heart', `<path d="M12 20s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z" fill="#e57a9a" stroke="${I}" stroke-width="1.5"/>`),
  S('poke', `<path d="M9 21v-9l-3-3a1.4 1.4 0 012-2l3 3V4a1.5 1.5 0 013 0v7l4 1c1 .3 2 1 2 2.5V21" fill="#f4e6d4" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('up', `<path d="M12 4l7 8h-4v8H9v-8H5z" fill="#7fb3d5" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('close', `<path d="M6 6l12 12M18 6L6 18" stroke="${I}" stroke-width="2.5" stroke-linecap="round"/>`),
  S('hill', `<path d="M2 19l7-10 4 5 3-3 6 8z" fill="#8bb05a" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('valley', `<path d="M2 7l7 10 4-5 3 3 6-8v12H2z" fill="#a98a5e" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('smooth', `<path d="M2 15c4-4 7 2 10-1s6-3 10 0v5H2z" fill="#9cc06a" stroke="${I}" stroke-width="1.5"/>`),
  S('sparkle', `<path d="M12 3l2 6 6 2-6 2-2 7-2-7-6-2 6-2z" fill="#e9c35b" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('tree', `<path d="M12 3l6 9h-3l4 5H5l4-5H6z" fill="#4f8f3a" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 17v4" stroke="${I}" stroke-width="2"/>`),
  S('drop', `<path d="M12 3s7 8 7 12a7 7 0 01-14 0c0-4 7-12 7-12z" fill="#7fb3d5" stroke="${I}" stroke-width="1.5"/>`),
  S('moon', `<path d="M15 3a9 9 0 100 18 7 7 0 010-18z" fill="#e8d98a" stroke="${I}" stroke-width="1.5"/>`),
  S('sun', `<circle cx="12" cy="12" r="5" fill="#e8b64c" stroke="${I}" stroke-width="1.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="${I}" stroke-width="1.5" stroke-linecap="round"/>`),
  S('wind', `<path d="M3 9h11a3 3 0 10-3-3M3 14h15a3 3 0 11-3 3M3 19h7" fill="none" stroke="${I}" stroke-width="2" stroke-linecap="round"/><path d="M3 9h11" stroke="#7cc7f2" stroke-width="1" stroke-linecap="round"/>`),
  S('clock', `<circle cx="12" cy="12" r="9" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><path d="M12 7v5l3.5 2.5" fill="none" stroke="${I}" stroke-width="2" stroke-linecap="round"/><path d="M17 3l3 3" stroke="#e8b64c" stroke-width="2" stroke-linecap="round"/>`),
  S('cloud', `<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4 4 0 1117 18z" fill="#dfe8ef" stroke="${I}" stroke-width="1.5"/>`),
  S('rain', `<path d="M7 14a4 4 0 010-8 5 5 0 019.6-1A4 4 0 1117 14z" fill="#dfe8ef" stroke="${I}" stroke-width="1.5"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" stroke="#4f86b0" stroke-width="2" stroke-linecap="round"/>`),
  S('storm', `<path d="M7 14a4 4 0 010-8 5 5 0 019.6-1A4 4 0 1117 14z" fill="#8f9aa6" stroke="${I}" stroke-width="1.5"/><path d="M13 13l-3 4h3l-2 5 5-6h-3l2-3z" fill="#e8b64c" stroke="${I}" stroke-linejoin="round"/>`),
  S('snow', `<path d="M7 14a4 4 0 010-8 5 5 0 019.6-1A4 4 0 1117 14z" fill="#dfe8ef" stroke="${I}" stroke-width="1.5"/><g fill="#fff" stroke="${I}"><circle cx="8" cy="18" r="1.4"/><circle cx="12" cy="20.5" r="1.4"/><circle cx="16" cy="18" r="1.4"/></g>`),
  S('fog', `<path d="M4 8h13M7 12h13M4 16h13M7 20h9" stroke="#9aa7b2" stroke-width="2.5" stroke-linecap="round"/>`),
  S('heat', `<circle cx="12" cy="12" r="6" fill="#e0763c" stroke="${I}" stroke-width="1.5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" stroke="#c8452d" stroke-width="2" stroke-linecap="round"/>`),
  S('thermo', `<path d="M10 4a2 2 0 014 0v10a4 4 0 11-4 0z" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><circle cx="12" cy="17" r="2.2" fill="#c8452d"/><path d="M12 15V8" stroke="#c8452d" stroke-width="2" stroke-linecap="round"/>`),
  S('idea', `<path d="M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z" fill="#ffe28a" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.5 18.5h5M10.5 21h3" stroke="${I}" stroke-width="1.5" stroke-linecap="round"/>`),
  S('gem', `<path d="M6 4h12l3 5-9 11L3 9z" fill="#7fd3e6" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 9h18M9 4l-1.5 5L12 20l4.5-11L15 4" fill="none" stroke="${I}" stroke-width="1"/>`),
  S('star', `<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z" fill="#e8b64c" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('goblin', `<path d="M2 9l6 2M22 9l-6 2" stroke="${I}" stroke-width="1.5"/><path d="M2 9l5 4 1-3zM22 9l-5 4-1-3z" fill="#8fbf4d" stroke="${I}" stroke-linejoin="round"/><circle cx="12" cy="12" r="6" fill="#8fbf4d" stroke="${I}" stroke-width="1.5"/><circle cx="10" cy="11" r="1.2" fill="${I}"/><circle cx="14" cy="11" r="1.2" fill="${I}"/><path d="M12 12l-1 3h2z" fill="#6e8b3d"/>`),
  S('gear', `<circle cx="12" cy="12" r="4" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" stroke="${I}" stroke-width="2.5" stroke-linecap="round"/>`),
  S('save', `<path d="M4 4h13l3 3v13H4z" fill="#7fb3d5" stroke="${I}" stroke-width="1.5"/><rect x="7" y="4" width="8" height="5" fill="#f3e9d2" stroke="${I}"/><rect x="7" y="13" width="10" height="7" fill="#f3e9d2" stroke="${I}"/>`),
  S('dice', `<rect x="4" y="4" width="16" height="16" rx="3" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.4" fill="${I}"/><circle cx="15.5" cy="15.5" r="1.4" fill="${I}"/><circle cx="12" cy="12" r="1.4" fill="${I}"/>`),
  S('skull', `<path d="M12 3a8 8 0 00-5 14v3h10v-3a8 8 0 00-5-14z" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><circle cx="9" cy="11" r="2" fill="${I}"/><circle cx="15" cy="11" r="2" fill="${I}"/>`),
  S('egg', `<path d="M12 3c4 0 7 6 7 11a7 7 0 01-14 0c0-5 3-11 7-11z" fill="#efe3c8" stroke="${I}" stroke-width="1.5"/><circle cx="10" cy="11" r="1" fill="#6e8b3d"/><circle cx="14" cy="15" r="1.2" fill="#6e8b3d"/>`),
  S('wood', `<rect x="3" y="8" width="18" height="8" rx="4" fill="#9a6b3f" stroke="${I}" stroke-width="1.5"/><ellipse cx="19" cy="12" rx="2" ry="4" fill="#d9b07a" stroke="${I}"/>`),
  S('stick', `<path d="M4 19L20 5M14 10l3 1" stroke="#7a5636" stroke-width="2.5" stroke-linecap="round"/>`),
  S('stone', `<path d="M5 16l2-7 6-3 6 4 1 6-7 3z" fill="#a39d93" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('flint', `<path d="M6 18l4-13 8 6-4 8z" fill="#4c4f5c" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('spear', `<path d="M4 20L17 7" stroke="#a07a4e" stroke-width="2.5" stroke-linecap="round"/><path d="M15 5l5-1-1 5-3 1z" fill="#d6b98a" stroke="${I}" stroke-width="1.3" stroke-linejoin="round"/>`),
  S('club', `<path d="M5 20l8-8" stroke="#9a6b3f" stroke-width="3" stroke-linecap="round"/><circle cx="15.5" cy="8.5" r="4.5" fill="#8d8a84" stroke="${I}" stroke-width="1.4"/>`),
  S('axe', `<path d="M6 20L16 6" stroke="#a07a4e" stroke-width="2.5" stroke-linecap="round"/><path d="M13 4c3 0 6 2 6 6l-4 1-4-4z" fill="#4c4f5c" stroke="${I}" stroke-width="1.3" stroke-linejoin="round"/>`),
  S('pick', `<path d="M7 20L15 8" stroke="#a07a4e" stroke-width="2.5" stroke-linecap="round"/><path d="M5 8c4-4 10-4 14 2-4-2-9-3-14-2z" fill="#8d8a84" stroke="${I}" stroke-width="1.3" stroke-linejoin="round"/>`),
  S('fiber', `<path d="M6 20c2-6 2-11 0-16M12 20c1-6 1-11 0-16M18 20c-2-6-2-11 0-16" stroke="#c9b26a" stroke-width="2" fill="none"/><path d="M5 13h14" stroke="${I}" stroke-width="1.5"/>`),
  S('clay', `<ellipse cx="12" cy="14" rx="8" ry="5" fill="#b8734e" stroke="${I}" stroke-width="1.5"/>`),
  S('berry', `<circle cx="9" cy="14" r="4" fill="#7a3fa0" stroke="${I}" stroke-width="1.5"/><circle cx="15" cy="13" r="4" fill="#8a4fb0" stroke="${I}" stroke-width="1.5"/><path d="M12 9l1-4" stroke="#6e8b3d" stroke-width="2"/>`),
  S('mushroom', `<path d="M4 12a8 6 0 0116 0z" fill="#9a6b3f" stroke="${I}" stroke-width="1.5"/><rect x="10" y="12" width="4" height="7" rx="1" fill="#efe6d2" stroke="${I}"/>`),
  S('fish', `<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0zM17 12l4-4v8z" fill="#8fb3c4" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="7" cy="11" r="1" fill="${I}"/>`),
  S('bowl', `<path d="M3 11h18a9 7 0 01-18 0z" fill="#8a6a4a" stroke="${I}" stroke-width="1.5"/><ellipse cx="12" cy="11" rx="9" ry="2" fill="#e3c070" stroke="${I}"/>`),
  S('leaf', `<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z" fill="#6e8b3d" stroke="${I}" stroke-width="1.5"/><path d="M5 19L14 10" stroke="${I}"/>`),
  S('help', `<circle cx="12" cy="12" r="9" fill="#7fb3d5" stroke="${I}" stroke-width="1.5"/><path d="M9.5 9.5a2.5 2.5 0 115 .5c-.5 1.5-2.5 1.5-2.5 3.5" stroke="${I}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="${I}"/>`),
  S('replay', `<path d="M4 12a8 8 0 108-8H8" stroke="${I}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M9 1L5 4l4 3z" fill="${I}"/><path d="M10 9l5 3-5 3z" fill="#c8452d"/>`),
  S('bolt', `<path d="M14 2L5 13h6l-2 9 10-12h-6l3-8z" fill="#a77bf0" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  S('swarm', `<circle cx="7" cy="8" r="2" fill="#5d5a66" stroke="${I}"/><circle cx="16" cy="6" r="2" fill="#5d5a66" stroke="${I}"/><circle cx="12" cy="13" r="2.4" fill="#5d5a66" stroke="${I}"/><circle cx="6" cy="17" r="1.8" fill="#5d5a66" stroke="${I}"/><circle cx="18" cy="16" r="2" fill="#5d5a66" stroke="${I}"/><path d="M5 6l-1-1m11 0l1-1m-5 7l-1-1m3 0l1-1m-9 7l-1-1m13-1l1-1" stroke="${I}"/>`),
  S('curse', `<path d="M6 12a4 4 0 010-8 5 5 0 019.6-1A4 4 0 1116 12z" fill="#5a4a6e" stroke="${I}" stroke-width="1.5"/><path d="M8 15l-1 3m5-3l-1 3m5-3l-1 3" stroke="#a77bf0" stroke-width="2" stroke-linecap="round"/>`),
  S('meteor', `<path d="M3 3l9 6M6 2l7 7M2 7l9 5" stroke="#e8763a" stroke-width="2" stroke-linecap="round"/><circle cx="15.5" cy="15.5" r="5.5" fill="#7a6a5e" stroke="${I}" stroke-width="1.5"/><circle cx="14" cy="14" r="1.3" fill="${I}"/><circle cx="17.5" cy="17" r="1" fill="${I}"/>`),
  S('sick', `<circle cx="12" cy="12" r="8.5" fill="#a9d47a" stroke="${I}" stroke-width="1.5"/><circle cx="9" cy="10" r="1.2" fill="${I}"/><circle cx="15" cy="10" r="1.2" fill="${I}"/><path d="M8.5 15.5c1-1 2.2-1 3.5 0s2.5 1 3.5 0" stroke="${I}" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="7" cy="14" r="1" fill="#5f9a3a"/><circle cx="17" cy="7" r="1" fill="#5f9a3a"/>`),
  S('fang', `<path d="M3 9l4-5 3 4h4l3-4 4 5-2 8c-2 3-5 4-7 4s-5-1-7-4z" fill="#5d5a66" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="9" cy="11" r="1.6" fill="#e9c35b"/><circle cx="15" cy="11" r="1.6" fill="#e9c35b"/><path d="M8 15l1.5 3 1.5-3m2 0l1.5 3 1.5-3" fill="#f3e9d2" stroke="${I}" stroke-linejoin="round"/>`),
].join('');

let injected = false;
export function injectIcons(): void {
  if (injected) return;
  injected = true;
  const d = document.createElement('div');
  d.style.display = 'none';
  d.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${SPRITE}</svg>`;
  document.body.prepend(d);
}

export function icon(name: string, cls = 'icon'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('class', cls);
  const u = document.createElementNS(ns, 'use');
  u.setAttribute('href', `#i-${name}`);
  s.appendChild(u);
  return s;
}

export const ITEM_ICON: Record<string, string> = {
  apple: 'apple', berry: 'berry', mushroom: 'mushroom', glowcap: 'mushroom', redcap: 'mushroom', fish: 'fish', apple_mash: 'bowl', stew: 'bowl',
  wood: 'wood', stick: 'stick', stone: 'stone', flint: 'flint', fiber: 'fiber', clay: 'clay', apple_core: 'apple',
  spear: 'spear', stone_spear: 'spear', club: 'club', stone_axe: 'axe', pick: 'pick',
  // P5.6 fiber goods and preserves
  rope: 'fiber', basket: 'bowl', sleeping_mat: 'fiber', loincloth: 'fiber', leaf_cape: 'leaf', leaves: 'leaf', flower: 'sparkle', flower_crown: 'sparkle',
  dried_apple: 'apple', torch: 'heat', star_stone: 'gem',
};
