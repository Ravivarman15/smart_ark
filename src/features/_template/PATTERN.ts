// REFERENCE PATTERN — do not import this file.
//
// Every feature folder under src/features/<name>/ MUST follow this layout:
//
//   features/<name>/
//     types/<name>.types.ts          // domain types (app-facing, not DB rows)
//     schemas/<name>.schema.ts       // zod validation for forms
//     services/<name>.service.ts     // extends BaseService; only place that calls supabase.from()
//     hooks/use<Name>s.ts            // list query
//     hooks/use<Name>.ts             // single fetch
//     hooks/useCreate<Name>.ts       // create mutation
//     hooks/useUpdate<Name>.ts       // update mutation w/ optimistic apply
//     hooks/useDelete<Name>.ts       // delete / deactivate mutation
//     hooks/index.ts                 // barrel
//     components/                    // feature-specific UI (Table, FormFields)
//     pages/                         // route-level components (one per route)
//     utils/                         // pure helpers (no React, no supabase)
//     index.ts                       // public barrel — outer code only imports from here
//
// Rules:
//   1. NO `supabase.from(...)` outside services/. Pages/hooks call the service.
//   2. NO direct cross-feature imports of internals — always import the
//      feature's public barrel (`@/features/<name>`).
//   3. NO new query keys outside src/core/constants/queryKeys.ts.
//   4. NO new permission strings outside src/contexts/StaffRightsContext.tsx
//      (ACTION_DEFS) — keeps RBAC catalogue authoritative.
//
// See src/features/students/* for the canonical implementation.

export {};
