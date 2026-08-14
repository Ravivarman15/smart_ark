// ──────────────────────────────────────────────────────────────────────────────
// MARKETING MOTION PRIMITIVES
//
// ┌── WHY LazyMotion + `m` INSTEAD OF `motion` ───────────────────────────────┐
// │ Importing `motion.div` pulls Framer Motion's whole feature set into the   │
// │ initial chunk (~34 kB gzipped). `LazyMotion` + `m` ships ~5 kB and loads  │
// │ the DOM animation features as a separate async chunk, so the hero paints  │
// │ before the animation engine has even arrived.                             │
// │                                                                           │
// │ That matters here specifically: these pages are prerendered to static     │
// │ HTML for crawlers, and the brief holds Lighthouse above 95. An animation  │
// │ library in the LCP path would cost more than the animations are worth.    │
// │                                                                           │
// │ Consequence to remember: inside this app you must write <m.div>, never    │
// │ <motion.div>. A gate enforces it, because mixing them silently reinstates │
// │ the full bundle.                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Every primitive below degrades to "render the content, statically" when the
// visitor has asked for reduced motion. Not a dimmed animation — none.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import {
  LazyMotion,
  MotionConfig,
  m,
  useInView,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  type Variants,
} from "framer-motion";

/**
 * Async-loaded DOM feature set.
 *
 * Imports ./motionFeatures, NOT "framer-motion" directly — see that file. A
 * dynamic import of a specifier this module also imports statically cannot be
 * split, so pointing it here is what actually keeps the features out of the
 * eager bundle.
 */
const loadFeatures = () => import("./motionFeatures").then((mod) => mod?.default || mod);

/**
 * Wraps the marketing tree once.
 *
 * MotionConfig `reducedMotion="user"` makes every m.* component below honour
 * the OS setting without each one checking, which is the difference between
 * accessibility that holds and accessibility that holds until someone adds a
 * component and forgets.
 */
export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LazyMotion features={loadFeatures} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>
);

// ── Easing shared with the CSS layer (--mk-ease) ────────────────────────────
export const EASE = [0.22, 1, 0.36, 1] as const;

// ── Reveal ──────────────────────────────────────────────────────────────────

type Direction = "up" | "down" | "left" | "right" | "none";

const OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 18 },
  down: { x: 0, y: -18 },
  left: { x: 18, y: 0 },
  right: { x: -18, y: 0 },
  none: { x: 0, y: 0 },
};

/**
 * Scroll-triggered entrance.
 *
 * `once: true` is deliberate: re-animating on every scroll-back is the single
 * most common way a "premium" page starts feeling cheap, and it makes the page
 * unusable for anyone who scrolls to re-read something.
 *
 * The 18px travel is small on purpose. Large slide-ins push the layout around
 * during scroll and read as a template; the goal is that you notice the page
 * feels considered, not that you notice an animation.
 */
export const Reveal: React.FC<{
  children: React.ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  className?: string;
  /** Renders as this element — use "li"/"section" to keep semantics correct. */
  as?: "div" | "li" | "section" | "article" | "span";
}> = ({ children, direction = "up", delay = 0, duration = 0.5, className, as = "div" }) => {
  const ref = useRef<HTMLDivElement>(null);
  // -12% bottom margin: fire slightly BEFORE the element reaches the viewport
  // edge, so it has finished animating by the time it is properly readable.
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const reduced = useReducedMotion();
  const off = OFFSET[direction];

  const Tag = m[as] as typeof m.div;

  if (reduced) {
    const Static = as as React.ElementType;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Tag
      ref={ref}
      className={className}
      initial={{ opacity: 0, x: off.x, y: off.y }}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : undefined}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
};

// ── Stagger ─────────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * Staggered list entrance.
 *
 * 70ms between children: fast enough that a 6-card grid completes in under half
 * a second, slow enough to read as sequence rather than jitter. Anything above
 * ~120ms makes the last card feel broken on a slow scroll.
 */
export const Stagger: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul";
}> = ({ children, className, as = "div" }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduced = useReducedMotion();

  if (reduced) {
    const Static = as as React.ElementType;
    return <Static className={className}>{children}</Static>;
  }

  const Tag = m[as] as typeof m.div;
  return (
    <Tag
      ref={ref}
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
    >
      {children}
    </Tag>
  );
};

export const StaggerItem: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li";
}> = ({ children, className, as = "div" }) => {
  const reduced = useReducedMotion();
  if (reduced) {
    const Static = as as React.ElementType;
    return <Static className={className}>{children}</Static>;
  }
  const Tag = m[as] as typeof m.div;
  return (
    <Tag className={className} variants={itemVariants}>
      {children}
    </Tag>
  );
};

// ── Counter ─────────────────────────────────────────────────────────────────

const formatIndian = (n: number) => n.toLocaleString("en-IN");

/**
 * Count-up statistic.
 *
 * Renders the FINAL value as text on first paint and only then animates from
 * zero. Two reasons, both structural rather than cosmetic:
 *   1. The prerenderer emits static HTML; a counter that starts at "0" would
 *      put a zero in the crawlable markup.
 *   2. The final string is the widest the element will ever be, so reserving
 *      it up front means the count-up cannot cause layout shift — `tabular-nums`
 *      alone does not fix width changes between "9" and "1,284".
 */
export const Counter: React.FC<{
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}> = ({ to, duration = 1.6, prefix = "", suffix = "", decimals = 0, className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(to);

  useEffect(() => {
    if (reduced || !inView) return;
    const controls = animate(0, to, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, to, duration, reduced]);

  const shown = decimals > 0 ? display.toFixed(decimals) : formatIndian(Math.round(display));

  return (
    <span ref={ref} className={className}>
      {prefix}
      <span className="tabular-nums">{shown}</span>
      {suffix}
    </span>
  );
};

// ── Pointer-reactive tilt ───────────────────────────────────────────────────

/**
 * Subtle 3D tilt following the pointer.
 *
 * Disabled entirely on coarse pointers. On a phone there is no hover, the
 * effect would fire on tap and read as a glitch, and the extra listeners are
 * pure cost on the device class that makes up most of this page's traffic.
 *
 * Spring rather than linear: a linear tilt tracks the cursor exactly and feels
 * like a cheap parallax toy; the spring lags slightly and reads as weight.
 */
export const Tilt: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Maximum rotation in degrees. Above ~8 it stops looking premium. */
  max?: number;
}> = ({ children, className, max = 5 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), { stiffness: 180, damping: 22 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-max, max]), { stiffness: 180, damping: 22 });

  useEffect(() => {
    if (reduced) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setEnabled(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [reduced]);

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <m.div
      ref={ref}
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      {children}
    </m.div>
  );
};

// ── Re-exports so sections import from one place ────────────────────────────
export { m, useReducedMotion, useInView };
