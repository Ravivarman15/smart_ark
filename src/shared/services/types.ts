// Shared service-layer contracts. Every list query in the system should
// accept ListParams and return Paginated<T> so hooks and CRUD UI stay
// pagination-ready from day one (even when the initial impl returns all rows).

export interface ListParams {
  search?: string;
  page?: number;        // 1-based
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  filters?: Record<string, unknown>;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;
