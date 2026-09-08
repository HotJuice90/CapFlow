import { useCallback, useMemo } from 'react';
import type { FinancialInstrument, Organization } from '@/domain/types';
import type { Persist } from './persist';

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

export function useCatalogActions(persist: Persist): CatalogActions {
  const addOrganization = useCallback(
    async (org: Organization) => {
      await persist((prev) => ({ ...prev, organizations: [...prev.organizations, org] }));
    },
    [persist],
  );

  const updateOrganization = useCallback(
    async (org: Organization) => {
      await persist((prev) => ({
        ...prev,
        organizations: prev.organizations.map((o) => (o.id === org.id ? org : o)),
      }));
    },
    [persist],
  );

  const deleteOrganization = useCallback(
    async (id: string) => {
      let ok = true;
      await persist((prev) => {
        // Защита на уровне данных, а не только в UI каталога — иначе инструмент
        // остаётся без площадки и «висит» так, будто не существует, но не удаляется нигде.
        // Проверяем внутри апдейтера (по свежим данным), отказ отдаём наружу флагом:
        // вернуть `prev` как есть — сигнал persist'у ничего не писать.
        if (prev.instruments.some((i) => i.organizationId === id)) { ok = false; return prev; }
        return { ...prev, organizations: prev.organizations.filter((o) => o.id !== id) };
      });
      return ok;
    },
    [persist],
  );

  const addInstrument = useCallback(
    async (instrument: FinancialInstrument) => {
      await persist((prev) => ({ ...prev, instruments: [...prev.instruments, instrument] }));
    },
    [persist],
  );

  const updateInstrument = useCallback(
    async (instrument: FinancialInstrument) => {
      await persist((prev) => ({
        ...prev,
        instruments: prev.instruments.map((i) => (i.id === instrument.id ? instrument : i)),
      }));
    },
    [persist],
  );

  const deleteInstrument = useCallback(
    async (id: string) => {
      let ok = true;
      await persist((prev) => {
        if (prev.assets.some((a) => a.instrumentId === id)) { ok = false; return prev; }
        return { ...prev, instruments: prev.instruments.filter((i) => i.id !== id) };
      });
      return ok;
    },
    [persist],
  );

  return useMemo(
    () => ({ addOrganization, updateOrganization, deleteOrganization, addInstrument, updateInstrument, deleteInstrument }),
    [addOrganization, updateOrganization, deleteOrganization, addInstrument, updateInstrument, deleteInstrument],
  );
}
