/* The pet roster.
 *
 * Every creature is a different silhouette wrapped around the same anatomy:
 * a round dial that shows the time, a progress collar around it, a pair of
 * eyes and a mouth. A character only has to say where those live and draw its
 * own body behind and in front of them.
 *
 * Colours are written into the SVG as literal values rather than CSS vars,
 * because Chromium does not resolve var() inside SVG presentation attributes.
 */
(function (global) {
  'use strict';

  const INK = '#3a261c';
  const CREAM = '#fff6e4';
  const WHITE = '#ffffff';

  // ---------------------------------------------------------------- helpers
  const S = (n) => Number(n).toFixed(2);

  /** Outlined shape: one ink stroke, one fill. Keeps every creature on-model. */
  function sh(markup) { return markup; }

  function star(cx, cy, outer, inner, points = 5) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      pts.push(`${S(cx + Math.cos(a) * r)},${S(cy + Math.sin(a) * r)}`);
    }
    return pts.join(' ');
  }

  // ------------------------------------------------------------- the roster
  // dial  : where the clock face sits
  // eyes  : lx / rx / y / r
  // mouth : anchor + width, or null for creatures with a beak instead
  const LIST = [
    {
      id: 'tick', name: 'Tick', blurb: 'the original desk alarm clock',
      tint: true, palette: { light: '#ffb457', dark: '#e07a1c' },
      dial: { cx: 100, cy: 102, r: 45 },
      eyes: { lx: 84, rx: 116, y: 92, r: 13 },
      mouth: { x: 100, y: 122, w: 24 },
      back: (c) => `
        <rect x="76" y="150" width="11" height="24" rx="5.5" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="78" cy="176" rx="14" ry="8" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <rect x="113" y="150" width="11" height="24" rx="5.5" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="122" cy="176" rx="14" ry="8" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <path d="M46 108 q-18 6 -22 20" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
        <path d="M46 108 q-18 6 -22 20" fill="none" stroke="${c.dark}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="24" cy="129" r="9" fill="${c.light}" stroke="${INK}" stroke-width="4"/>
        <path d="M154 108 q18 6 22 20" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
        <path d="M154 108 q18 6 22 20" fill="none" stroke="${c.dark}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="176" cy="129" r="9" fill="${c.light}" stroke="${INK}" stroke-width="4"/>
        <rect x="96" y="26" width="8" height="14" rx="4" fill="${INK}"/>
        <path class="pt-ring o-bottom" d="M86 30 a14 14 0 0 1 28 0 z" fill="#e9c46a" stroke="${INK}" stroke-width="4"/>
        <circle cx="100" cy="102" r="62" fill="${c.light}" stroke="${INK}" stroke-width="6"/>`
    },
    {
      id: 'pocket', name: 'Fob', blurb: 'a pocket watch that got legs',
      palette: { light: '#f0c14b', dark: '#c99320' },
      dial: { cx: 100, cy: 112, r: 44 },
      eyes: { lx: 85, rx: 115, y: 102, r: 12 },
      mouth: { x: 100, y: 130, w: 22 },
      back: (c) => `
        <path class="pt-sway o-bottomleft" d="M140 60 q30 -14 34 -40" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 11"/>
        <rect x="93" y="40" width="14" height="16" rx="6" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <circle cx="100" cy="34" r="11" fill="none" stroke="${INK}" stroke-width="5"/>
        <circle cx="100" cy="112" r="58" fill="${c.light}" stroke="${INK}" stroke-width="6"/>
        <circle cx="100" cy="112" r="50" fill="none" stroke="${c.dark}" stroke-width="3"/>`
    },
    {
      id: 'sandy', name: 'Sandy', blurb: 'hourglass, permanently anxious',
      palette: { light: '#f6d9a0', dark: '#c99a52' },
      dial: { cx: 100, cy: 130, r: 34 },
      eyes: { lx: 88, rx: 112, y: 64, r: 11 },
      mouth: { x: 100, y: 82, w: 18 },
      back: (c) => `
        <rect x="50" y="24" width="100" height="13" rx="6" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <rect x="50" y="172" width="100" height="13" rx="6" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <path d="M60 37 v18 M140 37 v18 M60 154 v18 M140 154 v18" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="100" cy="68" r="34" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M92 96 h16 v12 h-16 z" fill="${c.light}" stroke="${INK}" stroke-width="4"/>
        <circle cx="100" cy="130" r="42" fill="${c.light}" stroke="${INK}" stroke-width="5"/>`,
      front: () => `<path class="pt-drip" d="M100 100 v14" stroke="#d8a54e" stroke-width="4" stroke-linecap="round"/>`
    },
    {
      id: 'sprout', name: 'Sprout', blurb: 'a seedling on a deadline',
      palette: { light: '#d98455', dark: '#a85c33' },
      dial: { cx: 100, cy: 148, r: 30 },
      eyes: { lx: 88, rx: 112, y: 141, r: 10 },
      mouth: { x: 100, y: 160, w: 18 },
      back: (c) => `
        <path d="M100 108 v-26" stroke="#3f8f52" stroke-width="7" stroke-linecap="round"/>
        <path class="pt-sway o-right" d="M100 90 q-30 -6 -34 -32 q30 -2 34 32 z" fill="#57ac68" stroke="${INK}" stroke-width="4"/>
        <path class="pt-sway-late o-left" d="M100 78 q30 -8 36 -34 q-32 0 -36 34 z" fill="#4a9a5c" stroke="${INK}" stroke-width="4"/>
        <path d="M58 112 L142 112 L131 184 L69 184 Z" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <rect x="52" y="100" width="96" height="18" rx="8" fill="${c.dark}" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'shroom', name: 'Button', blurb: 'toadstool, quietly judging you',
      palette: { light: '#e8dcc4', dark: '#c9452f' },
      dial: { cx: 100, cy: 132, r: 28 },
      eyes: { lx: 89, rx: 111, y: 125, r: 9 },
      mouth: { x: 100, y: 143, w: 16 },
      back: (c) => `
        <rect x="70" y="88" width="60" height="82" rx="20" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M30 96 a70 60 0 0 1 140 0 z" fill="${c.dark}" stroke="${INK}" stroke-width="5"/>
        <circle cx="64" cy="76" r="9" fill="${CREAM}"/>
        <circle cx="100" cy="58" r="11" fill="${CREAM}"/>
        <circle cx="136" cy="78" r="8" fill="${CREAM}"/>`
    },
    {
      id: 'cat', name: 'Mochi', blurb: 'cat. will not be rushed',
      palette: { light: '#b9a3d4', dark: '#8a71ad' },
      dial: { cx: 100, cy: 134, r: 32 },
      eyes: { lx: 86, rx: 114, y: 68, r: 11 },
      mouth: { x: 100, y: 86, w: 18 },
      back: (c) => `
        <path class="pt-flick o-bottomleft" d="M148 150 q34 -6 26 -40" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
        <path class="pt-flick o-bottomleft" d="M148 150 q34 -6 26 -40" fill="none" stroke="${c.dark}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="100" cy="134" r="48" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M70 52 L66 20 L94 40 Z" fill="${c.light}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path d="M130 52 L134 20 L106 40 Z" fill="${c.light}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="100" cy="72" r="36" fill="${c.light}" stroke="${INK}" stroke-width="5"/>`,
      front: () => `
        <path d="M62 78 h-18 M62 86 h-16 M138 78 h18 M138 86 h16" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <path d="M96 80 h8 l-4 5 z" fill="${INK}"/>`
    },
    {
      id: 'owl', name: 'Hoot', blurb: 'awake at hours you should not be',
      palette: { light: '#c98f5c', dark: '#94643a' },
      dial: { cx: 100, cy: 140, r: 28 },
      eyes: { lx: 78, rx: 122, y: 84, r: 19 },
      mouth: null,
      back: (c) => `
        <path class="pt-twitch o-bottom" d="M62 44 L58 16 L86 36 Z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path class="pt-twitch-late o-bottom" d="M138 44 L142 16 L114 36 Z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <ellipse cx="100" cy="112" rx="54" ry="62" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M52 100 q-10 40 10 58" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <path d="M148 100 q10 40 -10 58" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>`,
      front: () => `
        <path d="M100 100 l-9 12 h18 z" fill="#e9a13c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M84 170 h-12 M116 170 h12" stroke="#e9a13c" stroke-width="6" stroke-linecap="round"/>`
    },
    {
      id: 'ghost', name: 'Boo', blurb: 'haunts your unfinished tasks',
      palette: { light: '#dfe6f0', dark: '#a9b6cb' },
      dial: { cx: 100, cy: 116, r: 30 },
      eyes: { lx: 84, rx: 116, y: 86, r: 12 },
      mouth: { x: 100, y: 148, w: 16 },
      back: (c) => `
        <path d="M48 108 a52 52 0 0 1 104 0 v56 l-13 -11 l-13 13 l-13 -13 l-13 13 l-13 -13 l-13 11 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
    },
    {
      id: 'robot', name: 'Cog', blurb: 'beeps when the clock runs out',
      palette: { light: '#9fb6c4', dark: '#6c8494' },
      dial: { cx: 100, cy: 104, r: 34 },
      eyes: { lx: 87, rx: 113, y: 95, r: 11 },
      mouth: { x: 100, y: 120, w: 20 },
      back: (c) => `
        <path d="M100 46 v-16" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
        <circle class="pt-blip" cx="100" cy="24" r="9" fill="#c9452f" stroke="${INK}" stroke-width="4"/>
        <rect x="44" y="46" width="112" height="106" rx="20" fill="${c.light}" stroke="${INK}" stroke-width="6"/>
        <rect x="24" y="84" width="20" height="34" rx="8" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <rect x="156" y="84" width="20" height="34" rx="8" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <rect x="70" y="152" width="22" height="22" rx="7" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <rect x="108" y="152" width="22" height="22" rx="7" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>`
    },
    {
      id: 'rocket', name: 'Zip', blurb: 'in a hurry, always',
      palette: { light: '#e8e2d6', dark: '#c9452f' },
      dial: { cx: 100, cy: 96, r: 28 },
      eyes: { lx: 89, rx: 111, y: 88, r: 9 },
      mouth: { x: 100, y: 108, w: 16 },
      back: (c) => `
        <path class="pt-flame o-top" d="M100 148 q-14 22 0 34 q14 -12 0 -34 z" fill="#f0a02c" stroke="${INK}" stroke-width="4"/>
        <path d="M70 112 q-24 18 -20 42 q18 -4 26 -20 z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M130 112 q24 18 20 42 q-18 -4 -26 -20 z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M100 22 q32 38 32 84 v36 q0 14 -32 14 q-32 0 -32 -14 v-36 q0 -46 32 -84 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M70 138 h60" stroke="${INK}" stroke-width="4"/>`
    },
    {
      id: 'mug', name: 'Brew', blurb: 'powered entirely by caffeine',
      palette: { light: '#e7ded0', dark: '#7b5442' },
      dial: { cx: 94, cy: 126, r: 30 },
      eyes: { lx: 83, rx: 105, y: 118, r: 10 },
      mouth: { x: 94, y: 138, w: 18 },
      back: (c) => `
        <path class="pt-steam" d="M78 60 q-10 -12 0 -24 M100 56 q-10 -14 0 -26 M122 60 q-10 -12 0 -24"
              fill="none" stroke="#b9a893" stroke-width="5" stroke-linecap="round"/>
        <path d="M140 96 a24 24 0 0 1 0 42" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
        <path d="M140 96 a24 24 0 0 1 0 42" fill="none" stroke="${c.light}" stroke-width="5" stroke-linecap="round"/>
        <rect x="44" y="80" width="98" height="96" rx="16" fill="${c.light}" stroke="${INK}" stroke-width="6"/>
        <rect x="44" y="80" width="98" height="16" rx="8" fill="${c.dark}" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'frog', name: 'Bog', blurb: 'sits very still, gets a lot done',
      palette: { light: '#6fb266', dark: '#4a8a45' },
      dial: { cx: 100, cy: 140, r: 30 },
      eyes: { lx: 74, rx: 126, y: 82, r: 16 },
      mouth: { x: 100, y: 118, w: 44 },
      back: (c) => `
        <ellipse class="pt-squish" cx="44" cy="168" rx="20" ry="11" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <ellipse class="pt-squish" cx="156" cy="168" rx="20" ry="11" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <circle cx="74" cy="82" r="22" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <circle cx="126" cy="82" r="22" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <ellipse cx="100" cy="130" rx="58" ry="50" fill="${c.light}" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'penguin', name: 'Waddle', blurb: 'formalwear for informal work',
      palette: { light: '#46566b', dark: '#2d394a' },
      dial: { cx: 100, cy: 130, r: 32 },
      eyes: { lx: 88, rx: 112, y: 70, r: 10 },
      mouth: null,
      back: (c) => `
        <path d="M78 176 q-18 4 -22 10 q22 6 30 -4 z" fill="#e9a13c" stroke="${INK}" stroke-width="4"/>
        <path d="M122 176 q18 4 22 10 q-22 6 -30 -4 z" fill="#e9a13c" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="100" cy="112" rx="50" ry="66" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path class="pt-paddle o-top" d="M52 104 q-14 36 4 58" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <path class="pt-paddle-late o-top" d="M148 104 q14 36 -4 58" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>`,
      front: () => `<path d="M100 82 l-8 10 h16 z" fill="#e9a13c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
    },
    {
      id: 'toast', name: 'Crumb', blurb: 'warm, slightly burnt, reliable',
      palette: { light: '#f0c877', dark: '#d09a3e' },
      dial: { cx: 100, cy: 118, r: 32 },
      eyes: { lx: 87, rx: 113, y: 109, r: 10 },
      mouth: { x: 100, y: 133, w: 20 },
      back: (c) => `
        <path d="M44 74 q0 -22 20 -22 q6 -18 24 -18 q12 -10 24 0 q18 0 24 18 q20 0 20 22 v86 q0 14 -14 14 h-84 q-14 0 -14 -14 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path d="M58 84 q0 -14 14 -14 q6 -12 20 -12 q10 -8 18 0 q14 0 20 12 q14 0 14 14 v66 h-86 z"
              fill="${c.dark}" opacity=".5"/>`
    },
    {
      id: 'cactus', name: 'Prick', blurb: 'thrives on neglect',
      palette: { light: '#66ab63', dark: '#3f7f4d' },
      dial: { cx: 100, cy: 106, r: 26 },
      eyes: { lx: 90, rx: 110, y: 99, r: 9 },
      mouth: { x: 100, y: 116, w: 14 },
      back: (c) => `
        <path class="pt-sway o-bottomright" d="M52 122 q-16 0 -16 -18 q0 -16 16 -16 v-8 q0 -10 10 -10 q10 0 10 10 v52 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path class="pt-sway-late o-bottomleft" d="M148 112 q16 0 16 -18 q0 -16 -16 -16 v-8 q0 -10 -10 -10 q-10 0 -10 10 v52 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <rect x="66" y="40" width="68" height="112" rx="34" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M62 146 L138 146 L130 184 L70 184 Z" fill="#d98455" stroke="${INK}" stroke-width="5"/>
        <rect x="56" y="136" width="88" height="16" rx="7" fill="#c06f42" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'moon', name: 'Luna', blurb: 'for the late shift',
      palette: { light: '#f3e6b0', dark: '#d8c375' },
      dial: { cx: 94, cy: 104, r: 30 },
      eyes: { lx: 83, rx: 105, y: 95, r: 10 },
      mouth: { x: 94, y: 118, w: 16 },
      back: (c) => `
        <path d="M104 28 a72 72 0 1 0 40 132 a58 58 0 1 1 -40 -132 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5"/>`,
      front: () => `
        <polygon class="pt-twinkle" points="${star(160, 46, 11, 4)}" fill="#e9c46a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
        <polygon class="pt-twinkle-late" points="${star(176, 92, 8, 3)}" fill="#e9c46a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
    },
    {
      id: 'star', name: 'Twinkle', blurb: 'relentlessly optimistic',
      palette: { light: '#f5cf5b', dark: '#d9a92c' },
      dial: { cx: 100, cy: 104, r: 32 },
      eyes: { lx: 88, rx: 112, y: 95, r: 10 },
      mouth: { x: 100, y: 118, w: 18 },
      back: (c) => `
        <polygon points="${star(100, 102, 76, 32)}" fill="${c.light}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
    },
    {
      id: 'bee', name: 'Buzz', blurb: 'busy by construction',
      palette: { light: '#f2c74c', dark: '#3a261c' },
      dial: { cx: 100, cy: 128, r: 28 },
      eyes: { lx: 89, rx: 111, y: 62, r: 10 },
      mouth: { x: 100, y: 76, w: 16 },
      back: (c) => `
        <path d="M96 40 q-14 -14 -26 -18 M104 40 q14 -14 26 -18" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="66" cy="20" r="6" fill="${INK}"/><circle cx="134" cy="20" r="6" fill="${INK}"/>
        <ellipse class="pt-flap o-right" cx="52" cy="104" rx="26" ry="18" fill="#cfe6f2" stroke="${INK}" stroke-width="4" opacity=".92" transform="rotate(-22 52 104)"/>
        <ellipse class="pt-flap o-left" cx="148" cy="104" rx="26" ry="18" fill="#cfe6f2" stroke="${INK}" stroke-width="4" opacity=".92" transform="rotate(22 148 104)"/>
        <ellipse cx="100" cy="130" rx="52" ry="46" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M64 104 q36 -10 72 0 M62 156 q38 10 76 0" stroke="${INK}" stroke-width="9" fill="none" stroke-linecap="round"/>
        <circle cx="100" cy="66" r="30" fill="${c.light}" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'dino', name: 'Rex', blurb: 'small arms, big ambitions',
      palette: { light: '#69b58c', dark: '#3f8a63' },
      dial: { cx: 100, cy: 132, r: 28 },
      eyes: { lx: 88, rx: 112, y: 64, r: 10 },
      mouth: { x: 100, y: 78, w: 20 },
      back: (c) => `
        <path class="pt-flick o-bottomleft" d="M140 148 q34 2 32 -28 q-18 6 -26 18 z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M116 40 l16 -18 l6 24 z M132 60 l22 -10 l-6 22 z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <rect x="66" y="166" width="22" height="16" rx="7" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <rect x="112" y="166" width="22" height="16" rx="7" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="100" cy="130" rx="50" ry="46" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <circle cx="100" cy="66" r="34" fill="${c.light}" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'octo', name: 'Inky', blurb: 'eight arms, still behind schedule',
      palette: { light: '#d98aa8', dark: '#b05e80' },
      dial: { cx: 100, cy: 96, r: 34 },
      eyes: { lx: 85, rx: 115, y: 86, r: 12 },
      mouth: { x: 100, y: 112, w: 18 },
      back: (c) => `
        <path class="pt-ripple o-top" d="M44 126 q-12 34 4 50 q12 -12 8 -34 z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path class="pt-ripple-a o-top" d="M70 134 q-10 38 2 50 q12 -14 8 -36 z" fill="${c.light}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path class="pt-ripple-b o-top" d="M100 136 q-8 38 0 50 q10 -16 6 -38 z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path class="pt-ripple-a o-top" d="M130 134 q10 38 -2 50 q-12 -14 -8 -36 z" fill="${c.light}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path class="pt-ripple o-top" d="M156 126 q12 34 -4 50 q-12 -12 -8 -34 z" fill="${c.dark}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M40 124 a60 58 0 0 1 120 0 z" fill="${c.light}" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'snail', name: 'Sluggo', blurb: 'slow is a strategy',
      palette: { light: '#e0b978', dark: '#b98a45' },
      dial: { cx: 118, cy: 108, r: 34 },
      eyes: { lx: 44, rx: 66, y: 66, r: 9 },
      mouth: { x: 55, y: 150, w: 14 },
      back: (c) => `
        <path class="pt-sway o-bottom" d="M44 76 v52 M66 74 v54" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
        <path d="M26 168 q-8 -46 34 -46 h98 q10 0 10 12 q0 34 -34 34 z"
              fill="#c9d98a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="118" cy="108" r="46" fill="${c.light}" stroke="${INK}" stroke-width="5"/>`
    },
    {
      id: 'teapot', name: 'Steep', blurb: 'takes exactly as long as it takes',
      palette: { light: '#8fc4c4', dark: '#5d9a9a' },
      dial: { cx: 100, cy: 124, r: 30 },
      eyes: { lx: 88, rx: 112, y: 115, r: 10 },
      mouth: { x: 100, y: 138, w: 18 },
      back: (c) => `
        <path d="M46 106 q-26 6 -30 34 q14 4 22 -8" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
        <path d="M46 106 q-26 6 -30 34 q14 4 22 -8" fill="none" stroke="${c.light}" stroke-width="6" stroke-linecap="round"/>
        <path d="M152 104 a26 26 0 0 1 0 44" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
        <path d="M152 104 a26 26 0 0 1 0 44" fill="none" stroke="${c.light}" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="100" cy="128" rx="56" ry="48" fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M64 84 a38 26 0 0 1 72 0 z" fill="${c.dark}" stroke="${INK}" stroke-width="5"/>
        <circle class="pt-hop-tiny" cx="100" cy="56" r="9" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>`
    },
    {
      id: 'radio', name: 'Static', blurb: 'plays nothing but the tick',
      palette: { light: '#c99a52', dark: '#8a6531' },
      dial: { cx: 92, cy: 114, r: 30 },
      eyes: { lx: 81, rx: 103, y: 105, r: 10 },
      mouth: { x: 92, y: 128, w: 18 },
      back: (c) => `
        <path d="M150 62 L176 22" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
        <circle class="pt-blip" cx="178" cy="18" r="7" fill="#c9452f" stroke="${INK}" stroke-width="4"/>
        <rect x="30" y="62" width="140" height="104" rx="16" fill="${c.light}" stroke="${INK}" stroke-width="6"/>
        <circle cx="146" cy="98" r="12" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <circle cx="146" cy="134" r="12" fill="${c.dark}" stroke="${INK}" stroke-width="4"/>
        <path d="M146 90 v8 M146 126 v8" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
    },
    {
      id: 'egg', name: 'Yolk', blurb: 'about to hatch, any minute now',
      palette: { light: '#fbf3e2', dark: '#e9d9b6' },
      dial: { cx: 100, cy: 124, r: 30 },
      eyes: { lx: 88, rx: 112, y: 115, r: 10 },
      mouth: { x: 100, y: 138, w: 18 },
      back: (c) => `
        <path d="M100 26 q42 30 42 80 a42 52 0 0 1 -84 0 q0 -50 42 -80 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <path d="M58 92 l14 -10 l12 12 l14 -12 l12 12 l14 -12 l14 10"
              fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`
    },
    {
      id: 'blob', name: 'Goo', blurb: 'shapeless, dependable',
      tint: true, palette: { light: '#7fc4a8', dark: '#4e9a7d' },
      dial: { cx: 100, cy: 110, r: 34 },
      eyes: { lx: 86, rx: 114, y: 100, r: 12 },
      mouth: { x: 100, y: 126, w: 20 },
      back: (c) => `
        <path d="M100 34 q58 12 58 74 q0 50 -58 50 q-58 0 -58 -50 q0 -62 58 -74 z"
              fill="${c.light}" stroke="${INK}" stroke-width="5"/>
        <ellipse cx="100" cy="176" rx="44" ry="9" fill="rgba(58,38,28,.12)"/>`
    }
  ];


  // --------------------------------------------------------------- persona
  /* How each creature carries itself, and what it has to say. `idle` and
     `work` name a root animation; `fidgets` are the one-off things it does
     when it thinks you are not looking. Lines fall back to DEFAULT_VOICE. */
  const DEFAULT_VOICE = {
    greet: ['Hello again.', 'Back at it?', 'Ready when you are.'],
    pause: ['Taking five?', 'Paused.', "I'll wait."],
    resume: ['Back to it.', 'Where were we.', 'Continuing.'],
    stopEarly: ['Stopping early?', 'Logged what we had.', "That's alright. Next time."],
    drag: ['Wheee!', 'Put me down!', 'Whoaaa!'],
    drop: ['Oof.', 'Right. Here then.', 'Good spot.'],
    longRun: ["That's a long one.", 'Still going strong.', 'Impressive stamina.'],
    lateNight: ["It's late, you know.", 'Should you still be up?', 'The night is long.'],
    nearlyDone: ['Almost there.', 'Nearly!', 'Last stretch.']
  };

  const PERSONA = {
    tick: { idle: 'breathe', work: 'march', fidgets: ['wiggle', 'lookAround', 'hop'], lines: {
      start: ['Clock is running.', 'Timeline secured.', "Let's make it count."],
      complete: ['Session logged.', 'On schedule. Nice.', 'Filed and stamped.'],
      poke: ['Yes?', "I'm ticking.", "Careful, I'm delicate."],
      chatter: ['Time keeps moving.', 'Still here.', 'All quiet on the desk.'] } },

    pocket: { idle: 'swing', work: 'swing', fidgets: ['lookAround', 'stretch'], lines: {
      start: ['Very good.', 'Commencing.', 'Punctuality is a virtue.'],
      complete: ['Splendid work.', 'Right on time.', 'A job well done.'],
      poke: ['Do mind the glass.', 'Ahem.', 'Yes, quite.'],
      chatter: ["They don't make them like me.", 'Tick. Tock. Tick.', '*polished silence*'] } },

    sandy: { idle: 'breathe', work: 'tip', fidgets: ['shake', 'wiggle'], lines: {
      start: ["Oh no, it's started.", 'Okay okay okay.', "Don't look at me."],
      complete: ['We made it?! We made it.', 'I was so worried.', 'Phew.'],
      poke: ['Eek!', "Please don't tip me.", "I'm very fragile!"],
      chatter: ['Is it time yet?', 'I can feel it draining.', "Something's slipping away."] } },

    sprout: { idle: 'sway', work: 'sway', fidgets: ['stretch', 'wiggle'], lines: {
      start: ["Let's grow something.", 'Little by little.', 'Roots first.'],
      complete: ['Look how far you came.', 'Something bloomed today.', 'Good growth.'],
      poke: ['Mind the leaves.', 'Ooh, sunlight.', '*rustle*'],
      chatter: ['Photosynthesizing.', 'A little water would be nice.', 'Growing. Slowly.'] } },

    shroom: { idle: 'breathe', work: 'bounce', fidgets: ['lookAround', 'shake'], lines: {
      start: ['Finally.', "I'll be watching.", 'Took you long enough.'],
      complete: ['Adequate.', 'I suppose that was fine.', 'Hm. Not bad.'],
      poke: ["Don't.", "I'm poisonous, you know.", 'Rude.'],
      chatter: ['The damp is lovely today.', "I've seen things in this soil.", 'Spores.'] } },

    cat: { idle: 'breathe-slow', work: 'bob', fidgets: ['yawn', 'stretch', 'lookAround'], lines: {
      start: ['Ugh, fine.', "I'll allow it.", "Wake me when it's over."],
      complete: ["You're done? I was napping.", 'Acceptable. Feed me.', 'Mmm. Whatever.'],
      poke: ['Do not.', '*slow blink*', 'You may pet me. Once.'],
      chatter: ['This is my desk now.', 'I could nap here.', 'Knocking this off the edge later.'],
      drag: ['Unhand me.', 'I was comfortable.', '*indignant*'] } },

    owl: { idle: 'breathe', work: 'headbob', fidgets: ['lookAround', 'peek'], lines: {
      start: ['The hunt begins.', 'Focus, like a hunt.', 'Who works? You work.'],
      complete: ['Wise use of the hours.', 'Hoo. Well done.', 'The night approves.'],
      poke: ['Hoo.', 'I see everything.', 'My head turns further than that.'],
      chatter: ["It's always 3am somewhere.", "I don't sleep. I wait.", 'Hoo.'] } },

    ghost: { idle: 'float', work: 'float-fast', fidgets: ['fade', 'wiggle'], lines: {
      start: ['Ooooh. Working.', "I'll haunt you until it's done.", 'Boo. Get to it.'],
      complete: ['You survived.', 'Spookily productive.', 'Ooooooh, nice.'],
      poke: ['You can touch me?', "Rude, I'm incorporeal.", 'Boo.'],
      chatter: ["I've been here longer than you.", 'This desk is haunted. By me.', 'Ooooo.'],
      drag: ['I can phase, you know.', 'Wooooo.', 'Unnecessary.'] } },

    robot: { idle: 'jitter', work: 'march', fidgets: ['shake', 'lookAround', 'spin'], lines: {
      start: ['TIMER ENGAGED.', 'BEGINNING WORK CYCLE.', 'PRODUCTIVITY: INITIATED.'],
      complete: ['CYCLE COMPLETE. BEEP.', 'TASK ARCHIVED.', 'GOOD HUMAN.'],
      poke: ['BOOP DETECTED.', 'PLEASE DO NOT.', 'INPUT RECEIVED.'],
      chatter: ['AWAITING INSTRUCTION.', 'IDLE. IDLE. IDLE.', 'BEEP.'],
      drag: ['RELOCATING.', 'WHEEE. (SIMULATED)', 'COORDINATES UPDATED.'] } },

    rocket: { idle: 'hover', work: 'hover-fast', fidgets: ['hop', 'shake', 'spin'], lines: {
      start: ["LET'S GOOO!", 'Three, two, one...', 'Full throttle!'],
      complete: ['WOOO! Orbit achieved!', 'Nailed it!', 'Again! Again!'],
      poke: ["Careful, I'm fuelled!", "Don't touch the fins!", 'Ready when you are!'],
      chatter: ['Can we go now?', "I'm bored, launch me.", 'Vroom.'] } },

    mug: { idle: 'breathe', work: 'wobble', fidgets: ['wiggle', 'stretch'], lines: {
      start: ['Fresh cup, fresh start.', 'Nice and warm.', "Let's get into it."],
      complete: ['That deserves a refill.', 'Well brewed.', 'Ahh. Good work.'],
      poke: ['Careful, hot.', 'Mind the handle.', '*sloshes*'],
      chatter: ['Going cold over here.', "Steam's getting thin.", 'Another cup?'] } },

    frog: { idle: 'breathe', work: 'hop', fidgets: ['hop', 'yawn', 'lookAround'], lines: {
      start: ['Be the log.', 'Stillness. Then work.', '*settles in*'],
      complete: ['The fly was caught.', 'Ribbit. Well done.', 'Patience paid.'],
      poke: ['Ribbit.', '*blink*', 'I was meditating.'],
      chatter: ['Waiting is working.', 'The pond is calm.', 'Ribbit.'] } },

    penguin: { idle: 'sway', work: 'waddle', fidgets: ['wiggle', 'lookAround', 'hop'], lines: {
      start: ['Suited up.', 'Very professional.', 'Let us proceed.'],
      complete: ['Impeccable.', 'Dressed for success.', '*slides happily*'],
      poke: ['I say.', 'Mind the tux.', '*waddles off*'],
      chatter: ["It's warm in here.", 'Fish would be nice.', 'Formal, always.'] } },

    toast: { idle: 'breathe', work: 'bounce', fidgets: ['wiggle', 'shake'], lines: {
      start: ['Warming up.', "Don't burn out.", "Let's get toasty."],
      complete: ['Perfectly done.', 'Golden.', 'Not burnt! Result.'],
      poke: ['Crumbs!', "Careful, I'm crispy.", '*crumbles slightly*'],
      chatter: ["I'm getting cold.", 'Butter would help.', 'Slightly stale.'] } },

    cactus: { idle: 'sway', work: 'sway', fidgets: ['shake', 'stretch'], lines: {
      start: ['No excuses.', "You don't need coddling.", 'Get on with it.'],
      complete: ['Survived. Good.', 'Told you.', "That's how it's done."],
      poke: ['OW. I warned you.', 'Told you not to.', "Sharp, aren't I."],
      chatter: ["I don't need anything. Ever.", 'Still thriving on nothing.', 'Neglect me harder.'] } },

    moon: { idle: 'float', work: 'drift', fidgets: ['fade', 'lookAround', 'yawn'], lines: {
      start: ['The quiet hours are best.', 'Softly now.', "I'll keep watch."],
      complete: ['Rest now.', 'The night is proud.', 'Beautifully done.'],
      poke: ['Mmm.', '*glows faintly*', 'Gently.'],
      chatter: ["It's late, you know.", 'The stars are out.', 'Sleep is productive too.'] } },

    star: { idle: 'pulse', work: 'spin-slow', fidgets: ['spin', 'hop', 'wiggle'], lines: {
      start: ["You've GOT this!", 'Best session ever!', 'I believe in you!'],
      complete: ['AMAZING! Incredible!', 'I never doubted you!', 'Superstar!'],
      poke: ['Hi hi hi!', "You're the best!", 'Yay!'],
      chatter: ["You're doing great!", 'Just so proud of you.', 'Sparkle sparkle!'] } },

    bee: { idle: 'hover-fast', work: 'hover-fast', fidgets: ['hop', 'shake', 'spin'], lines: {
      start: ['Busybusybusy!', 'No time no time!', 'Work work work!'],
      complete: ['Honey made!', 'Productive! Efficient!', 'Bzzz! Excellent!'],
      poke: ['Bzzt!', 'No touching, working!', 'Busy! Busy!'],
      chatter: ['So much to do!', 'Bzzzzz.', 'Have you seen the flowers?'] } },

    dino: { idle: 'breathe', work: 'stomp', fidgets: ['shake', 'lookAround', 'hop'], lines: {
      start: ['RAAAWR. Work time.', 'Stomp stomp.', 'Tiny arms, big day.'],
      complete: ['ROAR! Extinction avoided.', 'Mighty.', 'Big work, little arms.'],
      poke: ['Rawr?', "I can't reach you.", '*tiny arm flail*'],
      chatter: ['The asteroid can wait.', 'Rawr.', 'I miss the Cretaceous.'] } },

    octo: { idle: 'float', work: 'bob', fidgets: ['wiggle', 'spin', 'stretch'], lines: {
      start: ['All eight arms, engaged.', 'Multitasking. Sort of.', 'Ink flowing.'],
      complete: ['Eight thumbs up.', 'Tidy work.', 'Well handled. All of them.'],
      poke: ['*suckers grip*', 'Which arm was that?', 'Squish.'],
      chatter: ["I've lost track of an arm.", 'Eight arms, one deadline.', 'Blub.'] } },

    snail: { idle: 'creep', work: 'creep', fidgets: ['peek', 'stretch'], lines: {
      start: ['Slow. Steady. Onward.', 'No rush. But movement.', 'Beginning... eventually.'],
      complete: ['Arrived. As promised.', 'Slow is still forward.', 'See? Told you.'],
      poke: ['*retracts slightly*', 'Give me a moment.', 'Patience.'],
      chatter: ['Still going.', "I'll get there.", 'Slime trail of progress.'] } },

    teapot: { idle: 'breathe', work: 'wobble', fidgets: ['wiggle', 'shake'], lines: {
      start: ['Steeping.', 'These things take time.', 'Let it brew.'],
      complete: ['Perfectly steeped.', 'Worth the wait.', 'Pour yourself a break.'],
      poke: ["Careful, I'm hot.", '*whistles softly*', 'Mind the spout.'],
      chatter: ['Nearly ready.', "Don't rush the leaves.", '*gentle bubbling*'] } },

    radio: { idle: 'jitter', work: 'jitter', fidgets: ['shake', 'lookAround'], lines: {
      start: ["...and we're live.", 'Tuning in.', 'Broadcasting focus.'],
      complete: ["And that's the hour.", 'Signing off. Good work.', '*applause track*'],
      poke: ['*static crackle*', 'Adjust my dial, would you.', 'Bzzt... hello?'],
      chatter: ['Nothing but the tick.', '*soft static*', 'Is this thing on?'] } },

    egg: { idle: 'wobble-soft', work: 'wobble', fidgets: ['shake', 'hop', 'peek'], lines: {
      start: ['Any minute now.', "I'm nearly ready!", 'This is it. Maybe.'],
      complete: ['Almost hatched!', 'Getting closer!', 'Progress! For both of us.'],
      poke: ['Careful! Cracks!', 'Eep!', 'Not yet! Not yet!'],
      chatter: ['Soon. Definitely soon.', '*small crack noise*', 'Any day now.'] } },

    blob: { idle: 'blobby', work: 'bounce', fidgets: ['squash', 'wiggle', 'spin'], lines: {
      start: ["Sure. Let's blob.", 'Forming a plan. Sort of.', 'Okay.'],
      complete: ['Blobbed it.', 'Nice.', 'That felt good.'],
      poke: ['Squish.', '*absorbs finger*', 'Boing.'],
      chatter: ['Just vibing.', 'Shapeless and free.', 'Blorp.'] } }
  };

  // Fold the persona into each character so the renderer sees one object.
  for (const def of LIST) {
    const p = PERSONA[def.id] || {};
    def.idle = p.idle || 'breathe';
    def.work = p.work || 'bob';
    def.fidgets = p.fidgets || ['wiggle', 'lookAround'];
    def.voice = Object.assign({}, DEFAULT_VOICE, p.lines || {});
  }

  /** A line for this moment, avoiding an immediate repeat. */
  const lastLine = new Map();
  function say(def, event) {
    const pool = (def.voice && def.voice[event]) || DEFAULT_VOICE[event];
    if (!pool || !pool.length) return '';
    if (pool.length === 1) return pool[0];
    const key = def.id + ':' + event;
    let pick;
    do { pick = pool[Math.floor(Math.random() * pool.length)]; }
    while (pick === lastLine.get(key));
    lastLine.set(key, pick);
    return pick;
  }

  /** One of this creature's preferred fidgets. */
  function fidget(def) {
    const pool = def.fidgets && def.fidgets.length ? def.fidgets : ['wiggle'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ------------------------------------------------------------- rendering
  function mouthPath(kind, m) {
    if (!m) return '';
    const w = m.w || 20;
    const h = w * 0.4;
    const x = m.x - w / 2;
    const y = m.y;
    switch (kind) {
      case 'sleepy':    return `M${S(x + w * 0.28)} ${S(y + 1)} q${S(w * 0.22)} ${S(h * 0.5)} ${S(w * 0.44)} 0`;
      case 'working':   return `M${S(x)} ${S(y - 1)} q${S(w / 2)} ${S(h * 1.35)} ${S(w)} 0`;
      case 'flat':      return `M${S(x + w * 0.1)} ${S(y + 2)} q${S(w * 0.4)} 0 ${S(w * 0.8)} 0`;
      case 'celebrate': return `M${S(x)} ${S(y - 4)} q${S(w / 2)} ${S(h * 2.4)} ${S(w)} 0 q${S(-w / 2)} ${S(h * 0.6)} ${S(-w)} 0 z`;
      default:          return `M${S(x)} ${S(y)} q${S(w / 2)} ${S(h)} ${S(w)} 0`;
    }
  }

  function eyesMarkup(e) {
    const one = (side, cx) => `
      <g class="eye eye--${side}">
        <ellipse class="eye__white" cx="${S(cx)}" cy="${S(e.y)}" rx="${S(e.r)}" ry="${S(e.r * 1.08)}"
                 fill="${WHITE}" stroke="${INK}" stroke-width="${S(Math.max(2.5, e.r * 0.27))}"/>
        <g class="eye__pupil">
          <circle cx="${S(cx)}" cy="${S(e.y + e.r * 0.08)}" r="${S(e.r * 0.48)}" fill="${INK}"/>
          <circle cx="${S(cx + e.r * 0.19)}" cy="${S(e.y - e.r * 0.2)}" r="${S(e.r * 0.16)}" fill="${WHITE}"/>
        </g>
      </g>`;
    return `<g id="eyes">${one('l', e.lx)}${one('r', e.rx)}</g>`;
  }

  function analogFace(def) {
    const { cx, cy, r } = def.dial;
    let ticks = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const long = i % 3 === 0;
      const r1 = r * (long ? 0.72 : 0.82);
      ticks += `<line x1="${S(cx + Math.cos(a) * r1)}" y1="${S(cy + Math.sin(a) * r1)}"
                      x2="${S(cx + Math.cos(a) * r * 0.9)}" y2="${S(cy + Math.sin(a) * r * 0.9)}"/>`;
    }
    return `
      <g id="ticks" opacity=".35" stroke="${INK}" stroke-width="${S(r * 0.055)}" stroke-linecap="round">${ticks}</g>
      <g id="hands">
        <line id="handSlow" x1="${S(cx)}" y1="${S(cy)}" x2="${S(cx)}" y2="${S(cy - r * 0.58)}"
              stroke="${INK}" stroke-width="${S(r * 0.13)}" stroke-linecap="round"/>
        <line id="handFast" x1="${S(cx)}" y1="${S(cy)}" x2="${S(cx)}" y2="${S(cy - r * 0.76)}"
              stroke="#c9452f" stroke-width="${S(r * 0.07)}" stroke-linecap="round"/>
      </g>
      <circle id="handPin" cx="${S(cx)}" cy="${S(cy)}" r="${S(r * 0.1)}" fill="${INK}"/>`;
  }

  /* Digital creatures put the readout where the mouth would be, so the digits
     become the expression. Eyes stay exactly where they were. */
  function digitalFace(def) {
    const { cx, cy, r } = def.dial;
    const boxW = r * 1.5;
    const boxH = r * 0.56;
    const by = cy + r * 0.22;
    return `
      <rect id="digitalPlate" x="${S(cx - boxW / 2)}" y="${S(by - boxH / 2)}"
            width="${S(boxW)}" height="${S(boxH)}" rx="${S(boxH * 0.3)}"
            fill="#2c1f18" stroke="${INK}" stroke-width="${S(r * 0.06)}"/>
      <text id="digitalTime" x="${S(cx)}" y="${S(by + boxH * 0.29)}"
            text-anchor="middle" font-family="Consolas, 'Cascadia Mono', monospace"
            font-size="${S(boxH * 0.78)}" font-weight="700" fill="#ffd479"
            letter-spacing="${S(r * 0.01)}">00:00</text>`;
  }

  function render(def, colors, opts = {}) {
    const c = {
      light: colors.light || def.palette.light,
      dark: colors.dark || def.palette.dark
    };
    const { cx, cy, r } = def.dial;
    const ringR = r + 9;
    const circ = 2 * Math.PI * ringR;
    const digital = opts.faceStyle === 'digital';

    return `
      <g id="petBody">
      <g id="petBack">${def.back(c)}</g>
      <circle id="ringTrack" cx="${S(cx)}" cy="${S(cy)}" r="${S(ringR)}" fill="none"
              stroke="rgba(58,38,28,.16)" stroke-width="7"/>
      <circle id="ringFill" cx="${S(cx)}" cy="${S(cy)}" r="${S(ringR)}" fill="none"
              stroke="${colors.mode}" stroke-width="7" stroke-linecap="round"
              transform="rotate(-90 ${S(cx)} ${S(cy)})"
              stroke-dasharray="${S(circ)}" stroke-dashoffset="${S(circ)}"/>
      <circle id="faceCircle" cx="${S(cx)}" cy="${S(cy)}" r="${S(r)}"
              fill="${CREAM}" stroke="${INK}" stroke-width="4"/>
      <ellipse class="blush" cx="${S(cx - r * 0.68)}" cy="${S(cy + r * 0.2)}" rx="${S(r * 0.2)}" ry="${S(r * 0.13)}" fill="#f08b7a" opacity=".5"/>
      <ellipse class="blush" cx="${S(cx + r * 0.68)}" cy="${S(cy + r * 0.2)}" rx="${S(r * 0.2)}" ry="${S(r * 0.13)}" fill="#f08b7a" opacity=".5"/>
      ${digital ? digitalFace(def) : analogFace(def)}
      ${eyesMarkup(def.eyes)}
      ${def.mouth && !digital
        ? `<path id="mouth" d="${mouthPath('content', def.mouth)}" fill="none" stroke="${INK}"
                 stroke-width="${S(Math.max(3, r * 0.09))}" stroke-linecap="round"/>`
        : ''}
      <g id="petFront">${def.front ? def.front(c) : ''}</g>
      </g>`;
  }

  function byId(id) { return LIST.find((d) => d.id === id) || LIST[0]; }

  function ringCircumference(def) { return 2 * Math.PI * (def.dial.r + 9); }

  global.Characters = {
    list: LIST, render, byId, mouthPath, ringCircumference, say, fidget,
    DEFAULT_VOICE, INK, CREAM
  };
})(window);
