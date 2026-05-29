export { BaseService } from "./base.service";
export { AppError, type AppErrorKind } from "./errors";
export { type ListParams, type Paginated, DEFAULT_PAGE_SIZE } from "./types";
export {
  safeInsert,
  safeInsertBatch,
  isForeignKeyError,
  type SafeInsertResult,
  type PgLikeError,
} from "./safeInsert";
export {
  safeInsertWithColumnFallback,
  safeUpdateWithColumnFallback,
  isMissingColumnError,
  extractMissingColumn,
  type ColumnFallbackResult,
  type ColumnFallbackOptions,
} from "./columnFallback";
