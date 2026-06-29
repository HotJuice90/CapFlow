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
} from '@/domain/types';
import { repository } from '@/storage/repository';
import { type AppData, emptyAppData } from '@/storage/types';
import { buildDemoData } from '@/data/seed';
import { fetchCbrRates } from '@/rates/cbr';
import { uid } from '@/utils/id';

const RATES_TTL_MS = 22 * 3600 * 1000; // ~раз в сутки

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
}

const DataContext = createContext<DataContextValue | null>(null);

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
          const updated: AppData = {
            ...loaded,
            rates: { ...loaded.rates, ...fetched },
            ratesUpdatedAt: new Date().toISOString(),
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
      await persist({
        ...data,
        assets: data.assets.map((a) => (a.id === id ? { ...a, status } : a)),
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
    await persist({
      ...data,
      rates: { ...data.rates, ...fetched },
      ratesUpdatedAt: new Date().toISOString(),
    });
  }, [data, persist]);

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
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
