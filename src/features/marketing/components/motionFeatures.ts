// ──────────────────────────────────────────────────────────────────────────────
// LazyMotion feature bundle — deliberately its own module.
//
// `import("framer-motion").then(m => m.domAnimation)` inside motion.tsx does
// NOT split: that file also imports `m` and `LazyMotion` statically from the
// same specifier, and Rollup cannot put one module in two chunks. The dynamic
// import silently collapses into the static one and the whole animation
// feature set lands in the eager bundle — no warning, no error, just a slower
// first paint.
//
// Re-exporting through a module that imports NOTHING else gives Rollup a clean
// boundary, so the DOM animation features become a chunk of their own that
// arrives after the hero has painted.
// ──────────────────────────────────────────────────────────────────────────────

export { domAnimation as default } from "framer-motion";
