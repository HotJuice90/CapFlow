import { useCallback, useMemo } from 'react';
import type { AppData } from '@/storage/types';
import { emptyAppData } from '@/storage/types';
import { buildDemoData } from '@/data/seed';
import type { Persist } from './persist';

export interface SettingsActions {
  deleteDemoData: () => Promise<void>;
  reseedDemo: () => Promise<void>;
  updateParams: (patch: Partial<AppData['params']>) => Promise<void>;
  updateSettings: (patch: Partial<AppData['settings']>) => Promise<void>;
  replaceAll: (incoming: AppData) => Promise<void>;
}

export function useSettingsActions(persist: Persist): SettingsActions {
  const deleteDemoData = useCallback(async () => {
    await persist((prev) => {
      // Демо-организация/инструмент, на который уже ссылается РЕАЛЬНЫЙ (не демо)
      // инструмент/актив, не должна исчезать — иначе он остаётся без площадки
      // и перестаёт резолвиться нигде (актив «висит» так, будто не существует).
      // Вместо удаления такая запись «усыновляется» — снимаем с неё isDemo.
      const usedInstrumentIds = new Set(
        prev.assets.filter((a) => !a.isDemo).map((a) => a.instrumentId),
      );
      const instruments = prev.instruments
        .filter((i) => !i.isDemo || usedInstrumentIds.has(i.id))
        .map((i) => (usedInstrumentIds.has(i.id) ? { ...i, isDemo: false } : i));

      const usedOrgIds = new Set(instruments.filter((i) => !i.isDemo).map((i) => i.organizationId));
      const organizations = prev.organizations
        .filter((o) => !o.isDemo || usedOrgIds.has(o.id))
        .map((o) => (usedOrgIds.has(o.id) ? { ...o, isDemo: false } : o));

      return {
        ...prev,
        organizations,
        instruments,
        assets: prev.assets.filter((a) => !a.isDemo),
      };
    });
  }, [persist]);

  const reseedDemo = useCallback(async () => {
    await persist((prev) => {
      if (prev.assets.some((a) => a.isDemo)) return prev;
      const demo = buildDemoData();
      return {
        ...prev,
        organizations: [...prev.organizations, ...demo.organizations],
        instruments: [...prev.instruments, ...demo.instruments],
        assets: [...prev.assets, ...demo.assets],
      };
    });
  }, [persist]);

  const updateParams = useCallback(
    async (patch: Partial<AppData['params']>) => {
      await persist((prev) => ({ ...prev, params: { ...prev.params, ...patch } }));
    },
    [persist],
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppData['settings']>) => {
      await persist((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    },
    [persist],
  );

  const replaceAll = useCallback(
    async (incoming: AppData) => {
      const base = emptyAppData();
      const merged: AppData = {
        ...base,
        ...incoming,
        params: { ...base.params, ...incoming.params },
        settings: { ...base.settings, ...incoming.settings },
        rates: { ...base.rates, ...incoming.rates },
        ratesUpdatedAt: incoming.ratesUpdatedAt ?? null,
      };
      await persist(() => merged);
    },
    [persist],
  );

  return useMemo(
    () => ({ deleteDemoData, reseedDemo, updateParams, updateSettings, replaceAll }),
    [deleteDemoData, reseedDemo, updateParams, updateSettings, replaceAll],
  );
}
