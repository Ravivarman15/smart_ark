import { useMemo } from "react";
import { moduleCatalogService } from "../services/moduleCatalog.service";

/**
 * Read the catalog. Memoised because the service is synchronous and
 * returns the same array reference — but the hook indirection means a
 * future DB-backed catalog can swap in without touching consumers.
 */
export const useModuleCatalog = () => useMemo(() => moduleCatalogService.list(), []);
