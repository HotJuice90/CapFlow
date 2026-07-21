import { useCallback, useMemo } from 'react';
import type { FreeCapitalEntry } from '@/domain/types';
import type { AppData } from '@/storage/types';

export interface FreeCapitalActions {
  addFreeCapitalEntry: (entry: FreeCapitalEntry) => Promise<void>;
  updateFreeCapitalEntry: (entry: FreeCapitalEntry) => Promise<void>;
  deleteFreeCapitalEntry: (id: string) => Promise<void>;
}

export function useFreeCapitalActions(data: AppData, persist: (next: AppData) => Promise<void>): FreeCapitalActions {
  const addFreeCapitalEntry = useCallback(
    async (entry: FreeCapitalEntry) => {
      await persist({ ...data, freeCapitalEntries: [...data.freeCapitalEntries, entry] });
    },
    [data, persist],
  );

  const updateFreeCapitalEntry = useCallback(
    async (entry: FreeCapitalEntry) => {
      await persist({ ...data, freeCapitalEntries: data.freeCapitalEntries.map((e) => (e.id === entry.id ? entry : e)) });
    },
    [data, persist],
  );

  const deleteFreeCapitalEntry = useCallback(
    async (id: string) => {
      await persist({ ...data, freeCapitalEntries: data.freeCapitalEntries.filter((e) => e.id !== id) });
    },
    [data, persist],
  );

  return useMemo(
    () => ({ addFreeCapitalEntry, updateFreeCapitalEntry, deleteFreeCapitalEntry }),
    [addFreeCapitalEntry, updateFreeCapitalEntry, deleteFreeCapitalEntry],
  );
}
