// ── Setup feature — public surface ───────────────────────────────────────────
// Academic structure configuration: academic years, standards, subjects,
// course types, batches, timetable and taxes. Pages are lazy-loaded directly
// in App.tsx (default exports) and intentionally excluded from this barrel.

export * from "./types";
export * from "./schemas/setup.schema";
export * from "./utils";
export * from "./services";
export * from "./hooks";
export * from "./components";
