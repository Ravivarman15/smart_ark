import { useCallback, useEffect, useState } from "react";

// Minimal localStorage-backed CRUD store. Used by modules whose Supabase
// tables haven't shipped yet (Certificate, eStudy, Live Class) so the UI is
// fully functional and the institute can start entering data immediately.
// Swapping to a real Supabase service later is a one-page edit — same
// signature, same return shape.

const PREFIX = "smartark:";

const read = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const write = <T,>(key: string, value: T[]): void => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(`local-collection:${key}`));
  } catch {
    /* ignore quota errors — the user will see a stale list on next load */
  }
};

export interface LocalCollection<T extends { id: string }> {
  rows: T[];
  add: (row: Omit<T, "id">) => T;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
  replaceAll: (rows: T[]) => void;
}

export function useLocalCollection<T extends { id: string }>(
  key: string,
): LocalCollection<T> {
  const [rows, setRows] = useState<T[]>(() => read<T>(key));

  // Cross-tab sync via storage event + same-tab sync via custom event.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== PREFIX + key) return;
      setRows(read<T>(key));
    };
    const handleLocal = () => setRows(read<T>(key));
    window.addEventListener("storage", handleStorage);
    window.addEventListener(`local-collection:${key}` as keyof WindowEventMap, handleLocal);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        `local-collection:${key}` as keyof WindowEventMap,
        handleLocal,
      );
    };
  }, [key]);

  const add = useCallback(
    (row: Omit<T, "id">) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const next = { ...(row as object), id } as T;
      const current = read<T>(key);
      const merged = [next, ...current];
      write(key, merged);
      setRows(merged);
      return next;
    },
    [key],
  );

  const update = useCallback(
    (id: string, patch: Partial<T>) => {
      const current = read<T>(key);
      const merged = current.map((r) => (r.id === id ? { ...r, ...patch } : r));
      write(key, merged);
      setRows(merged);
    },
    [key],
  );

  const remove = useCallback(
    (id: string) => {
      const current = read<T>(key);
      const merged = current.filter((r) => r.id !== id);
      write(key, merged);
      setRows(merged);
    },
    [key],
  );

  const replaceAll = useCallback(
    (next: T[]) => {
      write(key, next);
      setRows(next);
    },
    [key],
  );

  return { rows, add, update, remove, replaceAll };
}
