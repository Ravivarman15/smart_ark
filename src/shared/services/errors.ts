// Typed errors raised by the service layer.
// Callers (React Query hooks, components) can `instanceof` check these
// instead of pattern-matching on string messages.

export type AppErrorKind =
  | "NotFound"
  | "Validation"
  | "PermissionDenied"
  | "Conflict"
  | "Network"
  | "Unknown";

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly cause?: unknown;

  constructor(kind: AppErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.cause = cause;
  }

  static notFound(entity: string, id?: string) {
    return new AppError("NotFound", id ? `${entity} ${id} not found` : `${entity} not found`);
  }

  static validation(message: string, cause?: unknown) {
    return new AppError("Validation", message, cause);
  }

  static permission(message = "Permission denied") {
    return new AppError("PermissionDenied", message);
  }

  static conflict(message: string, cause?: unknown) {
    return new AppError("Conflict", message, cause);
  }

  static fromSupabase(err: { message?: string; code?: string } | null, fallback = "Database error") {
    if (!err) return new AppError("Unknown", fallback);
    // Supabase Postgres error codes worth specialising
    if (err.code === "23505") return new AppError("Conflict", err.message || "Duplicate record", err);
    if (err.code === "PGRST116") return new AppError("NotFound", err.message || "Not found", err);
    if (err.code === "42501") return new AppError("PermissionDenied", err.message || "Denied by RLS", err);
    return new AppError("Unknown", err.message || fallback, err);
  }
}
