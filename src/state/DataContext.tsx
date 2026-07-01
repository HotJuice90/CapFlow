import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  Asset,
  AssetStatus,
  FinancialInstrument,
  Organization,
  Snapshot,
} from '@/domain/types';
import { repository } from '@/storage/repository';
import { type AppData, type RateSnapshot, emptyAppData } from '@/storage/types';
import { buildDemoData } from '@/data/seed';
import { findBankByName } from '@/domain/banks';
import { fetchCbrRates, fetchCbrHistory } from '@/rates/cbr';
import { calculate, ENGINE_VERSION } from '@/calc';
import { uid } from '@/utils/id';

const RATES_TTL_MS = 22 * 3600 * 1000; // ~раз в сутки

/** Добавляет срез курсов за сегодня в историю (дедуп по дню, последние 90). */
function appendSnapshot(history: RateSnapshot[], rates: AppData['rates']): RateSnapshot[] {
  const date = new Date().toISOString().slice(0, 10);
  const filtered = history.filter((s) => s.date !== date);
  return [...filtered, { date, rates: { ...rates } }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);
}

interface DataContextValue {
  data: AppData;
  loading: boolean;
  hasDemo: boolean;
  reload: () => Promise<void>;
  // активы
  addAsset: (asset: Asset) => Promise<void>;
  updateAsset: (asset: Asset) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  setAssetStatus: (id: string, status: AssetStatus) => Promise<void>;
  duplicateAsset: (id: string) => Promise<string | null>;
  // каталоги
  addOrganization: (org: Organization) => Promise<void>;
  updateOrganization: (org: Organization) => Promise<void>;
  addInstrument: (instrument: FinancialInstrument) => Promise<void>;
  updateInstrument: (instrument: FinancialInstrument) => Promise<void>;
  // настройки/демо
  deleteDemoData: () => Promise<void>;
  reseedDemo: () => Promise<void>;
  updateParams: (patch: Partial<AppData['params']>) => Promise<void>;
  updateRates: (patch: Partial<AppData['rates']>) => Promise<void>;
  refreshRates: () => Promise<void>;
  backfillRateHistory: () => Promise<void>;
  updateSettings: (patch: Partial<AppData['settings']>) => Promise<void>;
  replaceAll: (incoming: AppData) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

/**
 * Сопоставляет лого банка организациям, у которых оно ещё не задано, по точному
 * совпадению названия («Альфа-Банк» → alfa). Чинит и старые демо-данные, засеянные
 * до появления лого банков, и организации, которые пользователь создал вручную
 * с названием банка, не выбирая его через пикер.
 */
function linkBankLogos(orgs: Organization[]): { orgs: Organization[]; changed: boolean } {
  let changed = false;
  const next = orgs.map((o) => {
    if (o.logo) return o;
    const bank = findBankByName(o.name);
    if (!bank) return o;
    changed = true;
    return { ...o, logo: bank.id };
  });
  return { orgs: next, changed };
}

function withDemo(base: AppData): AppData {
  const demo = buildDemoData();
  return {
    ...base,
    organizations: [...base.organizations, ...demo.organizations],
    instruments: [...base.instruments, ...demo.instruments],
    assets: [...base.assets, ...demo.assets],
    seededDemo: true,
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyAppData());
  const [loading, setLoading] = useState(true);

  const persist = useCallback(async (next: AppData) => {
    setData(next);
    await repository.save(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    let loaded = await repository.load();
    // первый запуск — сеем демо-портфель (решение #15)
    if (!loaded.seededDemo) {
      loaded = withDemo(loaded);
      await repository.save(loaded);
    }
    // догоняем лого банков для организаций, созданных до этой фичи
    const { orgs: linkedOrgs, changed: logosChanged } = linkBankLogos(loaded.organizations);
    if (logosChanged) {
      loaded = { ...loaded, organizations: linkedOrgs };
      await repository.save(loaded);
    }
    setData(loaded);
    setLoading(false);

    // авто-обновление курсов ЦБ раз в сутки (не блокирует UI)
    const age = loaded.ratesUpdatedAt
      ? Date.now() - new Date(loaded.ratesUpdatedAt).getTime()
      : Infinity;
    if (age > RATES_TTL_MS) {
      void (async () => {
        try {
          const fetched = await fetchCbrRates();
          const rates = { ...loaded.rates, ...fetched };
          const updated: AppData = {
            ...loaded,
            rates,
            ratesUpdatedAt: new Date().toISOString(),
            ratesHistory: appendSnapshot(loaded.ratesHistory, rates),
          };
          setData(updated);
          await repository.save(updated);
        } catch {
          // офлайн / ЦБ недоступен — оставляем последние известные курсы
        }
      })();
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // --- Активы ---
  const addAsset = useCallback(
    async (asset: Asset) => {
      await persist({ ...data, assets: [...data.assets, asset] });
    },
    [data, persist],
  );

  const updateAsset = useCallback(
    async (asset: Asset) => {
      await persist({
        ...data,
        assets: data.assets.map((a) => (a.id === asset.id ? asset : a)),
      });
    },
    [data, persist],
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      await persist({ ...data, assets: data.assets.filter((a) => a.id !== id) });
    },
    [data, persist],
  );

  const setAssetStatus = useCallback(
    async (id: string, status: AssetStatus) => {
      const asset = data.assets.find((a) => a.id === id);
      let snapshots = data.snapshots;
      // фиксируем Snapshot при закрытии/архивации активного актива (решение #8)
      if (asset && asset.status === 'active' && (status === 'closed' || status === 'archived')) {
        const instr = data.instruments.find((i) => i.id === asset.instrumentId);
        if (instr) {
          const snap: Snapshot = {
            id: uid('snap-'),
            assetId: id,
            createdAt: new Date().toISOString(),
            reason: status,
            excludeFromAnalytics: status === 'archived',
            engineVersion: ENGINE_VERSION,
            derived: calculate(asset, instr, data.params),
            assetSnapshot: { ...asset, status },
          };
          snapshots = [...data.snapshots, snap];
        }
      }
      await persist({
        ...data,
        assets: data.assets.map((a) => (a.id === id ? { ...a, status } : a)),
        snapshots,
      });
    },
    [data, persist],
  );

  const duplicateAsset = useCallback(
    async (id: string) => {
      const src = data.assets.find((a) => a.id === id);
      if (!src) return null;
      const copy: Asset = {
        ...src,
        id: uid('as-'),
        isDemo: false,
        status: 'active',
      };
      await persist({ ...data, assets: [...data.assets, copy] });
      return copy.id;
    },
    [data, persist],
  );

  // --- Каталоги ---
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
        instruments: data.instruments.map((i) =>
          i.id === instrument.id ? instrument : i,
        ),
      });
    },
    [data, persist],
  );

  // --- Демо / настройки ---
  const deleteDemoData = useCallback(async () => {
    await persist({
      ...data,
      organizations: data.organizations.filter((o) => !o.isDemo),
      instruments: data.instruments.filter((i) => !i.isDemo),
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

  const updateRates = useCallback(
    async (patch: Partial<AppData['rates']>) => {
      await persist({ ...data, rates: { ...data.rates, ...patch } });
    },
    [data, persist],
  );

  const refreshRates = useCallback(async () => {
    const fetched = await fetchCbrRates();
    const rates = { ...data.rates, ...fetched };
    await persist({
      ...data,
      rates,
      ratesUpdatedAt: new Date().toISOString(),
      ratesHistory: appendSnapshot(data.ratesHistory, rates),
    });
  }, [data, persist]);

  const backfillRateHistory = useCallback(async () => {
    const hist = await fetchCbrHistory();
    const byDate = new Map<string, RateSnapshot>();
    for (const s of data.ratesHistory) byDate.set(s.date, s);
    for (const s of hist) byDate.set(s.date, s);
    const merged = [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90);
    await persist({ ...data, ratesHistory: merged });
  }, [data, persist]);

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

  const hasDemo = useMemo(() => data.assets.some((a) => a.isDemo), [data.assets]);

  const value = useMemo(
    () => ({
      data,
      loading,
      hasDemo,
      reload,
      addAsset,
      updateAsset,
      deleteAsset,
      setAssetStatus,
      duplicateAsset,
      addOrganization,
      updateOrganization,
      addInstrument,
      updateInstrument,
      deleteDemoData,
      reseedDemo,
      updateParams,
      updateRates,
      refreshRates,
      backfillRateHistory,
      updateSettings,
      replaceAll,
    }),
    [
      data,
      loading,
      hasDemo,
      reload,
      addAsset,
      updateAsset,
      deleteAsset,
      setAssetStatus,
      duplicateAsset,
      addOrganization,
      updateOrganization,
      addInstrument,
      updateInstrument,
      deleteDemoData,
      reseedDemo,
      updateParams,
      updateRates,
      refreshRates,
      backfillRateHistory,
      updateSettings,
      replaceAll,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
