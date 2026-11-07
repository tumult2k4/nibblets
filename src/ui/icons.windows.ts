/** Glyphs for the window dock (one button per window), drawn like the rest of the sprite in icons.ts. */
const I = '#2e2a24';
const S = (id: string, body: string) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`;

export const WINDOW_ICONS = [
  // inspector: a magnifying glass
  S('inspect', `<circle cx="10" cy="10" r="6" fill="#dcecf5" stroke="${I}" stroke-width="1.5"/><path d="M14.5 14.5L20 20" stroke="${I}" stroke-width="3" stroke-linecap="round"/><path d="M7.5 8.5a3 3 0 012-2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`),
  // feed: a notice scroll
  S('scroll', `<path d="M6 4h12v14a2 2 0 01-2 2H6z" fill="#f3e9d2" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><rect x="4" y="3" width="16" height="3.5" rx="1.75" fill="#e8dcc0" stroke="${I}" stroke-width="1.5"/><path d="M9 9h6M9 12h6M9 15h4" stroke="${I}" stroke-width="1.3" stroke-linecap="round"/>`),
  // village: a hut
  S('hut', `<path d="M3 12l9-8 9 8" fill="#c99a5b" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 11v9h14v-9" fill="#e8c98e" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 20v-5h4v5" fill="#6b4f3a" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  // family tree: linked parents and children
  S('family', `<path d="M7 7v3h10V7M12 10v4M6 14h12M6 14v2M12 14v2M18 14v2" fill="none" stroke="${I}" stroke-width="1.5"/><circle cx="7" cy="5" r="2.5" fill="#8fbf4d" stroke="${I}" stroke-width="1.3"/><circle cx="17" cy="5" r="2.5" fill="#e57a9a" stroke="${I}" stroke-width="1.3"/><circle cx="6" cy="18.5" r="2.3" fill="#e8b64c" stroke="${I}" stroke-width="1.3"/><circle cx="12" cy="18.5" r="2.3" fill="#7fb3d5" stroke="${I}" stroke-width="1.3"/><circle cx="18" cy="18.5" r="2.3" fill="#8fbf4d" stroke="${I}" stroke-width="1.3"/>`),
  // stats: bar chart
  S('chart', `<path d="M3 20h18" stroke="${I}" stroke-width="2" stroke-linecap="round"/><rect x="5" y="11" width="3.5" height="8" rx=".8" fill="#7fb3d5" stroke="${I}" stroke-width="1.3"/><rect x="10.25" y="6" width="3.5" height="13" rx=".8" fill="#e8b64c" stroke="${I}" stroke-width="1.3"/><rect x="15.5" y="9" width="3.5" height="10" rx=".8" fill="#8fbf4d" stroke="${I}" stroke-width="1.3"/>`),
  // prayers: a candle
  S('candle', `<path d="M12 2c2 2.5 2.5 4 2.5 5a2.5 2.5 0 01-5 0c0-1 .5-2.5 2.5-5z" fill="#f0c75e" stroke="${I}" stroke-width="1.3" stroke-linejoin="round"/><rect x="8.5" y="10" width="7" height="10" rx="1" fill="#f6efd9" stroke="${I}" stroke-width="1.5"/><path d="M5 21h14" stroke="${I}" stroke-width="2" stroke-linecap="round"/>`),
  // codex: a closed tome with a gem
  S('tome', `<path d="M5 4a2 2 0 012-2h12v17H7a2 2 0 00-2 2z" fill="#8a5a3c" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 21a2 2 0 012-2h12v3H7a2 2 0 01-2-1z" fill="#f3e9d2" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 6l2.5 3-2.5 3-2.5-3z" fill="#7fd0c0" stroke="${I}" stroke-width="1.2" stroke-linejoin="round"/>`),
  // timeline: a line with moments on it
  S('timeline', `<path d="M3 12h18" stroke="${I}" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="12" r="2.3" fill="#8fbf4d" stroke="${I}" stroke-width="1.3"/><circle cx="12" cy="12" r="2.3" fill="#e8b64c" stroke="${I}" stroke-width="1.3"/><circle cx="18" cy="12" r="2.3" fill="#e57a9a" stroke="${I}" stroke-width="1.3"/><path d="M12 9.5V5M18 14.5V19" stroke="${I}" stroke-width="1.3" stroke-linecap="round"/>`),
  // sandbox drawer: a spade in a sand pile
  S('spade', `<path d="M3 20c2-4 5-6 9-6s7 2 9 6z" fill="#e8d098" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><path d="M15 3l-3 9" stroke="${I}" stroke-width="2" stroke-linecap="round"/><path d="M10.5 10l3 1-1.5 5-3-1z" fill="#9aa4ad" stroke="${I}" stroke-width="1.3" stroke-linejoin="round"/>`),
  // director camera: a film camera
  S('film', `<circle cx="7" cy="6" r="3" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><circle cx="14" cy="6" r="3" fill="#f3e9d2" stroke="${I}" stroke-width="1.5"/><rect x="3" y="10" width="13" height="9" rx="1.5" fill="#5d5a66" stroke="${I}" stroke-width="1.5"/><path d="M16 13l5-3v9l-5-3z" fill="#5d5a66" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`),
  // photo mode: a camera
  S('camera', `<path d="M3 8h4l2-3h6l2 3h4v11H3z" fill="#9aa4ad" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.8" fill="#dcecf5" stroke="${I}" stroke-width="1.5"/><circle cx="18" cy="10.5" r=".9" fill="#e8b64c"/>`),
  // debug overlay: a beetle
  S('bug', `<ellipse cx="12" cy="14" rx="5" ry="6" fill="#c8452d" stroke="${I}" stroke-width="1.5"/><circle cx="12" cy="7" r="2.5" fill="${I}"/><path d="M12 9v11M7 11L3 9M7 15H3M7 18l-3 2M17 11l4-2M17 15h4M17 18l3 2" stroke="${I}" stroke-width="1.4" stroke-linecap="round"/>`),
].join('');
