import { useCallback, useEffect, useState } from "react";
import type { StudentFilters } from "../utils/studentFilters";

// ─────────────────────────────────────────────────────────────────────────────
// Saved filter presets for Manage Students.
//
// Persisted in localStorage (not the DB) on purpose: the report_presets table
// is gated behind a migration that isn't applied on every deployment, and these
// are per-user view shortcuts — losing them on a different device is acceptable
// and avoids a hard DB dependency for a green build. Built-in "default views"
// live in studentFilters.ts; this hook owns the user's custom saved filters.
// ─────────────────────────────────────────────────────────────────────────────

export interface SavedPreset {
  id: string;
  name: string;
  filters: StudentFilters;
}

const STORAGE_KEY = "smartark.students.filterPresets.v1";

const read = (): SavedPreset[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPreset[]) : [];
  } catch {
    return [];
  }
};

const write = (presets: SavedPreset[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* quota / private mode — presets simply won't persist */
  }
};

export const useStudentFilterPresets = () => {
  const [presets, setPresets] = useState<SavedPreset[]>(() => read());

  // Keep multiple open tabs roughly in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPresets(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const savePreset = useCallback((name: string, filters: StudentFilters) => {
    setPresets((prev) => {
      const trimmed = name.trim();
      // Overwrite a same-named preset rather than duplicating it.
      const without = prev.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase());
      const next = [
        ...without,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: trimmed, filters },
      ].sort((a, b) => a.name.localeCompare(b.name));
      write(next);
      return next;
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      write(next);
      return next;
    });
  }, []);

  return { presets, savePreset, deletePreset };
};
