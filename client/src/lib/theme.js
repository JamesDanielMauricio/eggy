// Design tokens for the "elevated warm" look: the cream-and-barnwood identity
// with a real surface/elevation/motion system behind it.
//
// Keep the values here in sync with the CSS custom properties at the top of
// index.css. CSS is the main home now — index.css also exposes them to
// Tailwind as utilities (`text-ink`, `bg-card`, `font-display`, …) — and this
// JS copy is for the places that need a colour as a value: charts, and
// colours chosen at runtime (profit green vs loss red).

export const COLORS = {
  ink: '#241C13',
  inkSoft: '#6A5F4E',
  // Darkened from #9C9282, which was only 3.0:1 on a card — below WCAG AA's
  // 4.5:1 for the small dates, captions and labels that use it. 4.8:1 now.
  muted: '#7A7060',

  // Surfaces, from recessed to raised.
  paper: '#EDF0E2',
  paperDeep: '#E4E8D4',
  card: '#FFFDF8',
  cardAlt: '#FAF7EE',

  // Brand
  barnwood: '#3D2817',
  barnwoodDeep: '#2A1B0F',
  yolk: '#E5A62E',
  yolkDeep: '#C4881A',
  gold: '#D9A94B',

  // Semantic
  moss: '#4D7A3E',
  mossDeep: '#3C6230',
  brick: '#9B4433',
  brickDeep: '#7E3527',
  // Text for pending (utang) amounts and badges. yolkDeep, used before, is
  // 3.0:1 on a card; this deeper amber is 5.6:1 and still reads as "yolk".
  pending: '#8F5C10',

  // Lines — hairline is for dividers inside a surface, cardBorder for the
  // edge of a raised surface against the page.
  cardBorder: '#E9E3D1',
  hairline: '#EFE9DA',
  inputBorder: '#DDD6C2',
};

// Chart marks. Checked with the data-viz palette validator against the card
// surface: the old moss/brick pair was only ΔE 2.9 apart under deuteranopia —
// revenue and expense bars looked identical to roughly 1 in 12 men. This pair
// keeps green = money in, red = money out, but differs in lightness too, so
// it's ΔE 14.3 apart for every type of colour vision, and both clear 3:1
// against the card.
export const CHART = {
  revenue: '#36681F',
  expenses: '#D77A61',
  // Single hue for the egg-size bars (4.1:1 on a card). One series, one
  // colour: each bar is labelled, so colour isn't needed to tell them apart.
  sizes: '#A8701D',
  grid: COLORS.cardBorder,
  axisText: COLORS.inkSoft,
  // Plot height, shared by the chart and its loading placeholder so the
  // card doesn't jump when the chart code arrives.
  height: 220,
};

// Layered shadows rather than a single blur: a tight contact shadow plus a
// wider ambient one is what reads as real depth. Tinted with the barnwood
// brown so shadows sit in the warm palette instead of going gray.
export const ELEVATION = {
  sm: '0 1px 2px rgba(61,40,23,0.04), 0 1px 3px rgba(61,40,23,0.06)',
  md: '0 2px 4px rgba(61,40,23,0.04), 0 4px 12px rgba(61,40,23,0.07)',
  lg: '0 4px 8px rgba(61,40,23,0.05), 0 12px 28px rgba(61,40,23,0.09)',
  xl: '0 8px 16px rgba(61,40,23,0.06), 0 24px 48px rgba(61,40,23,0.11)',
};

// Self-hosted variable fonts (see main.jsx); the fallbacks only show for the
// moment before the font file arrives.
export const FONT_DISPLAY = "'Bitter Variable', Georgia, serif";
export const FONT_BODY = "'Work Sans Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// `eggy-input` carries the border, focus ring and transition.
//
// text-base (16px), not text-sm: iOS Safari auto-zooms the page on focus for
// any input rendering below 16px, and there's no way to opt out of that
// short of disabling pinch-zoom app-wide (an accessibility regression). 16px
// is the smallest size that keeps every input/select in the app zoom-free.
export const inputClasses = 'eggy-input w-full text-base';
