import { useCallback, useMemo } from 'react';
import type { FreeCapitalEntry } from '@/domain/types';
import type { Persist } from './persist';

export interface FreeCapitalActions {
  addFreeCapitalEntry: (entry: FreeCapitalEntry) => Promise<void>;
  updateFreeCapitalEntry: (entry: FreeCapitalEntry) => Promise<void>;
  deleteFreeCapitalEntry: (id: string) => Promise<void>;
}

export function useFreeCapitalActions(persist: Persist): FreeCapitalActions {
  const addFreeCapitalEntry = useCallback(
    async (entry: FreeCapitalEntry) => {
      await persist((prev) => ({ ...prev, freeCapitalEntries: [...prev.freeCapitalEntries, entry] }));
    },
    [persist],
  );

  const updateFreeCapitalEntry = useCallback(
    async (entry: FreeCapitalEntry) => {
      await persist((prev) => ({
        ...prev,
        freeCapitalEntries: prev.freeCapitalEntries.map((e) => (e.id === entry.id ? entry : e)),
      }));
    },
    [persist],
  );

  const deleteFreeCapitalEntry = useCallback(
    async (id: string) => {
      await persist((prev) => ({ ...prev, freeCapitalEntries: prev.freeCapitalEntries.filter((e) => e.id !== id) }));
    },
    [persist],
  );

  return useMemo(
    () => ({ addFreeCapitalEntry, updateFreeCapitalEntry, deleteFreeCapitalEntry }),
    [addFreeCapitalEntry, updateFreeCapitalEntry, deleteFreeCapitalEntry],
  );
}
