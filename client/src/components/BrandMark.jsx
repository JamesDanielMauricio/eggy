import { COLORS } from '../lib/theme';

// The egg "stamp" used in the header and on the login screen: a ring tilted
// a few degrees like an ink stamp, with the egg counter-rotated upright.
// `onDark` is for the barnwood header, where the fill is a translucent wash.
export default function BrandMark({ size = 44, onDark = false }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        border: `2px solid ${COLORS.yolk}`,
        backgroundColor: onDark ? 'rgba(229,166,46,0.12)' : COLORS.barnwood,
        boxShadow: `0 0 0 4px ${COLORS.yolk}1A`,
        transform: 'rotate(-6deg)',
      }}
      aria-hidden="true"
    >
      <span style={{ transform: 'rotate(6deg)', fontSize: Math.round(size * 0.42), lineHeight: 1 }}>🥚</span>
    </div>
  );
}
