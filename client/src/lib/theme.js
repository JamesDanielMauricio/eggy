// Design tokens for the "elevated warm" look: the same cream-and-barnwood
// identity the app always had, but with a real surface/elevation/motion
// system behind it instead of one flat card style repeated everywhere.
//
// Keep the values here in sync with the CSS custom properties at the top of
// index.css — the JS side is for inline styles, the CSS side is for the
// things inline styles can't express (:hover, :active, :focus-visible,
// keyframes). Both read from this same palette by hand.

export const COLORS = {
  // Ink — deepened slightly so body text clears contrast comfortably on cream.
  ink: '#241C13',
  inkSoft: '#6A5F4E',
  muted: '#9C9282',

  // Surfaces, from recessed to raised. The old theme had a single `card`
  // colour, which left no way to show depth or nest a panel inside a card.
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

  // Lines — hairline is for dividers inside a surface, cardBorder for the
  // edge of a raised surface against the page.
  cardBorder: '#E9E3D1',
  hairline: '#EFE9DA',
  inputBorder: '#DDD6C2',
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

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const EASE = {
  // Decelerating — the default for anything entering or settling.
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  // Slight overshoot, for confirmations that should feel physical.
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
};

export const FONT_DISPLAY = "'Bitter', Georgia, serif";
export const FONT_BODY = "'Work Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// `eggy-input` carries the focus ring and transition; the colour/font come
// from inputStyle so a caller can still override them per field.
//
// text-base (16px), not text-sm: iOS Safari auto-zooms the page on focus for
// any input rendering below 16px, and there's no way to opt out of that
// short of disabling pinch-zoom app-wide (an accessibility regression). 16px
// is the smallest size that keeps every input/select in the app zoom-free.
export const inputClasses = 'eggy-input w-full text-base';
export const inputStyle = {
  backgroundColor: '#FFFFFF',
  border: `1px solid ${COLORS.inputBorder}`,
  color: COLORS.ink,
  fontFamily: FONT_BODY,
};

// Currency and counts sit in columns down the records list and the stat
// grid, so they need equal-width digits to line up. Deliberately NOT applied
// to the big hero figure, where tabular digits read loose.
export const NUM_TABULAR = { fontVariantNumeric: 'tabular-nums' };
