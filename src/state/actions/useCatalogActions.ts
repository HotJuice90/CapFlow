import { useCallback, useMemo } from 'react';
import type { FinancialInstrument, Organization } from '@/domain/types';
import type { AppData } from '@/storage/types';

export interface CatalogActions {
  addOrganization: (org: Organization) => Promise<void>;
  updateOrganization: (org: Organization) => Promise<void>;
  /** false — отказ: на площадку ещё ссылается инструмент (см. реализацию). */
  deleteOrganization: (id: string) => Promise<boolean>;
  addInstrument: (instrument: FinancialInstrument) => Promise<void>;
  updateInstrument: (instrument: FinancialInstrument) => Promise<void>;
  /** false — отказ: на инструмент ещё ссылается актив (см. реализацию). */
  deleteInstrument: (id: string) => Promise<boolean>;
}

export function useCatalogActions(data: AppData, persist: (next: AppData) => Promise<void>): CatalogActions {
  const addOrganization = useCallback(
    async (org: Organization) => {
      await persist({ ...data, organizations: [...data.organizations, org] });
    },
    [data, persist],
  );

  const updateOrganization = useCallback(
    async (org: Organization) => {
      await persist({
        ...data,
        organizations: data.organizations.map((o) => (o.id === org.id ? org : o)),
      });
    },
    [data, persist],
  );

  const deleteOrganization = useCallback(
    async (id: string) => {
      // Защита на уровне данных, а не только в UI каталога — иначе инструмент
      // остаётся без площадки и «висит» так, будто не существует, но не удаляется нигде.
      if (data.instruments.some((i) => i.organizationId === id)) return false;
      await persist({ ...data, organizations: data.organizations.filter((o) => o.id !== id) });
      return true;
    },
    [data, persist],
  );

  const addInstrument = useCallback(
    async (instrument: FinancialInstrument) => {
      await persist({ ...data, instruments: [...data.instruments, instrument] });
    },
    [data, persist],
  );

  const updateInstrument = useCallback(
    async (instrument: FinancialInstrument) => {
      await persist({
        ...data,
        instruments: data.instruments.map((i) => (i.id === instrument.id ? instrument : i)),
      });
    },
    [data, persist],
  );

  const deleteInstrument = useCallback(
    async (id: string) => {
      if (data.assets.some((a) => a.instrumentId === id)) return false;
      await persist({ ...data, instruments: data.instruments.filter((i) => i.id !== id) });
      return true;
    },
    [data, persist],
  );

  return useMemo(
    () => ({ addOrganization, updateOrganization, deleteOrganization, addInstrument, updateInstrument, deleteInstrument }),
    [addOrganization, updateOrganization, deleteOrganization, addInstrument, updateInstrument, deleteInstrument],
  );
}
