import { useEffect, useId } from 'react';
import {
  AnimatePresence, LayoutGroup, animate, motion, useIsPresent,
  useMotionValue, useReducedMotion, useTransform,
} from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { SPRING } from '../lib/motion';

const EASE = [0.22, 1, 0.36, 1];
const formatCount = (value) => Math.round(value).toLocaleString('en-US');

// Keep the outgoing screen long enough to leave, without allowing its
// controls to receive another click or keyboard focus during the exit.
function Screen({ children, direction }) {
  const reducedMotion = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.div
      className="eggy-screen"
      inert={!present}
      aria-hidden={!present || undefined}
      custom={direction}
      variants={{
        enter: (dir) => ({ opacity: reducedMotion ? 1 : 0, x: reducedMotion ? 0 : dir * 14 }),
        visible: { opacity: 1, x: 0, transition: { duration: reducedMotion ? 0 : 0.36, ease: EASE } },
        leave: (dir) => ({
          opacity: reducedMotion ? 1 : 0,
          x: reducedMotion ? 0 : dir * -8,
          transition: { duration: reducedMotion ? 0 : 0.13, ease: 'easeOut' },
        }),
      }}
      initial="enter"
      animate="visible"
      exit="leave"
    >
      {children}
    </motion.div>
  );
}

export function ScreenTransition({ viewKey, direction = 1, resetScroll = false, children }) {
  return (
    <AnimatePresence
      initial={false}
      mode="wait"
      custom={direction}
      onExitComplete={resetScroll ? () => window.scrollTo({ top: 0, behavior: 'instant' }) : undefined}
    >
      <Screen key={viewKey} direction={direction}>{children}</Screen>
    </AnimatePresence>
  );
}

export function SegmentedControl({ options, value, onChange, className = '', style, label }) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  return (
    <LayoutGroup id={id}>
      <div className={`eggy-segment flex ${className}`} style={style} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => value !== option.id && onChange(option.id)}
            aria-pressed={value === option.id}
            className={`eggy-segment-item eggy-focus relative flex-1 px-3 py-1.5 text-xs ${value === option.id ? 'is-active' : ''}`}
          >
            {value === option.id && (
              <motion.span
                layoutId="selection"
                className="eggy-segment-selection"
                transition={reducedMotion ? { duration: 0 } : SPRING}
                aria-hidden="true"
              />
            )}
            <span className="relative z-[1] whitespace-nowrap">
              {option.label}
              {option.count !== undefined && <span className="eggy-segment-count"> ({option.count})</span>}
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

// Motion values update the text node without rerendering the dashboard on
// every frame. Assistive technology receives the actual, final amount.
export function AnimatedNumber({ value, format = formatCount, suffix = '' }) {
  const reducedMotion = useReducedMotion();
  const current = useMotionValue(value);
  const formatted = useTransform(current, (number) => `${format(number)}${suffix}`);
  useEffect(() => {
    if (reducedMotion) {
      current.set(value);
      return;
    }
    const animation = animate(current, value, { duration: 0.62, ease: EASE });
    return () => animation.stop();
  }, [current, value, reducedMotion]);
  return (
    <span className="eggy-number">
      <span className="sr-only">{format(value)}{suffix}</span>
      <motion.span aria-hidden="true">{formatted}</motion.span>
    </span>
  );
}

export function SaveFeedback({ visible, children }) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="eggy-feedback-slot" role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            className="eggy-save-feedback"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.26, ease: EASE }}
          >
            <div className="flex items-center gap-1.5 py-1">
              <motion.span
                className="flex shrink-0"
                initial={reducedMotion ? false : { scale: 0.6, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={SPRING}
              >
                <CheckCircle2 size={16} />
              </motion.span>
              <p className="text-sm font-medium">{children}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
