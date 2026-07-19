import { useCallback, useMemo } from 'react';
import type { AppData } from '@/storage/types';
import { emptyAppData } from '@/storage/types';
import { buildDemoData } from '@/data/seed';

export interface SettingsActions {
  deleteDemoData: () => Promise<void>;
  reseedDemo: () => Promise<void>;
  updateParams: (patch: Partial<AppData['params']>) => Promise<void>;
  updateSettings: (patch: Partial<AppData['settings']>) => Promise<void>;
  replaceAll: (incoming: AppData) => Promise<void>;
}

export function useSettingsActions(data: AppData, persist: (next: AppData) => Promise<void>): SettingsActions {
  const deleteDemoData = useCallback(async () => {
    // Демо-организация/инструмент, на который уже ссылается РЕАЛЬНЫЙ (не демо)
    // инструмент/актив, не должна исчезать — иначе он остаётся без площадки
    // и перестаёт резолвиться нигде (актив «висит» так, будто не существует).
    // Вместо удаления такая запись «усыновляется» — снимаем с неё isDemo.
    const usedInstrumentIds = new Set(
      data.assets.filter((a) => !a.isDemo).map((a) => a.instrumentId),
    );
    const instruments = data.instruments
      .filter((i) => !i.isDemo || usedInstrumentIds.has(i.id))
      .map((i) => (usedInstrumentIds.has(i.id) ? { ...i, isDemo: false } : i));

    const usedOrgIds = new Set(instruments.filter((i) => !i.isDemo).map((i) => i.organizationId));
    const organizations = data.organizations
      .filter((o) => !o.isDemo || usedOrgIds.has(o.id))
      .map((o) => (usedOrgIds.has(o.id) ? { ...o, isDemo: false } : o));

    await persist({
      ...data,
      organizations,
      instruments,
      assets: data.assets.filter((a) => !a.isDemo),
    });
  }, [data, persist]);

  const reseedDemo = useCallback(async () => {
    if (data.assets.some((a) => a.isDemo)) return;
    const demo = buildDemoData();
    await persist({
      ...data,
      organizations: [...data.organizations, ...demo.organizations],
      instruments: [...data.instruments, ...demo.instruments],
      assets: [...data.assets, ...demo.assets],
    });
  }, [data, persist]);

  const updateParams = useCallback(
    async (patch: Partial<AppData['params']>) => {
      await persist({ ...data, params: { ...data.params, ...patch } });
    },
    [data, persist],
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppData['settings']>) => {
      await persist({ ...data, settings: { ...data.settings, ...patch } });
    },
    [data, persist],
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
      await persist(merged);
    },
    [persist],
  );

  return useMemo(
    () => ({ deleteDemoData, reseedDemo, updateParams, updateSettings, replaceAll }),
    [deleteDemoData, reseedDemo, updateParams, updateSettings, replaceAll],
  );
}
