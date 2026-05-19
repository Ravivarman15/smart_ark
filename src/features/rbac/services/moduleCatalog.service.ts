import { MODULE_CATALOG, MODULES_BY_ID, SUBMODULES_BY_ID } from "../constants/catalog";
import type { ModuleDef, ModuleId } from "../constants/catalog";

// The "service" surface for the catalog. Even though the catalog itself is a
// TypeScript constant (see catalog.ts), exposing it through a service keeps
// the consumer contract uniform — every other feature reads through a
// service, RBAC shouldn't be the exception.
//
// If the catalog moves to a DB table in the future, this is the *only* file
// that has to change.

class ModuleCatalogService {
  list(): ModuleDef[] {
    return MODULE_CATALOG;
  }

  getModule(id: ModuleId | string): ModuleDef | undefined {
    return MODULES_BY_ID[id as ModuleId];
  }

  getSubmodule(id: string) {
    return SUBMODULES_BY_ID[id];
  }
}

export const moduleCatalogService = new ModuleCatalogService();
