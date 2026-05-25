// Re-export the shared safeInsert utility for backward compatibility.
// The implementation moved to `@/shared/services/safeInsert` so other features
// (help, finance, future) can use it without cross-feature imports.
export {
  safeInsert,
  safeInsertBatch,
  isForeignKeyError,
  type SafeInsertResult,
  type PgLikeError,
} from "@/shared/services";
