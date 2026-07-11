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
  CurrencyCode,
  FinancialInstrument,
  Organization,
  Snapshot,
  TaxYearRecord,
} from '@/domain/types';
import { repository } from '@/storage/repository';
import { type AppData, type RateSnapshot, emptyAppData } from '@/storage/types';
import { buildDemoData } from '@/data/seed';
import { findBankByName } from '@/domain/banks';
import { fetchCbrRates, fetchCbrHistory } from '@/rates/cbr';
import { fetchKeyRateHistory, mergeKeyRateHistory, EARLIEST_DATE } from '@/rates/keyRate';
import { KEY_RATE_HISTORY } from '@/domain/keyRateHistory';
import { calculate, ENGINE_VERSION } from '@/calc';
import { computeTaxYearRecord } from './selectors';
import { uid } from '@/utils/id';
import { setAbbreviateMillionsDefault, setKopecksDefault } from '@/format';

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
  createAssetBundle: (bundle: { organization?: Organization; instrument?: FinancialInstrument; asset: Asset }) => Promise<void>;
  updateAsset: (asset: Asset) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  setAssetStatus: (id: string, status: AssetStatus) => Promise<void>;
  // каталоги
  addOrganization: (org: Organization) => Promise<void>;
  updateOrganization: (org: Organization) => Promise<void>;
  /** false — отказ: на площадку ещё ссылается инструмент (см. реализацию). */
  deleteOrganization: (id: string) => Promise<boolean>;
  addInstrument: (instrument: FinancialInstrument) => Promise<void>;
  updateInstrument: (instrument: FinancialInstrument) => Promise<void>;
  /** false — отказ: на инструмент ещё ссылается актив (см. реализацию). */
  deleteInstrument: (id: string) => Promise<boolean>;
  // настройки/демо
  deleteDemoData: () => Promise<void>;
  reseedDemo: () => Promise<void>;
  updateParams: (patch: Partial<AppData['params']>) => Promise<void>;
  setManualRate: (code: CurrencyCode, value: number | undefined) => Promise<void>;
  refreshRates: () => Promise<void>;
  backfillRateHistory: () => Promise<void>;
  resetRateHistory: () => Promise<void>;
  refreshKeyRate: () => Promise<void>;
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

/**
 * Дозаполняет taxYearRecords за уже ЗАКОНЧИВШИЕСЯ годы, которых там ещё нет
 * (текущий год никогда не трогаем — он фиксируется только на следующий год).
 * Чистая функция: если добавлять нечего — возвращает ТОТ ЖЕ объект (по ссылке),
 * это используется как признак «ничего не изменилось» и в reload(), и в эффекте.
 */
function ensureTaxYearRecords(data: AppData): AppData {
  const currentYear = new Date().getFullYear();
  const realAssets = data.assets.filter((a) => !a.isDemo);
  if (realAssets.length === 0) return data;
  const existingYears = new Set(data.taxYearRecords.map((r) => r.year));
  const earliestYear = Math.min(...realAssets.map((a) => parseInt(a.openDate.slice(0, 4), 10)));
  const newRecords: TaxYearRecord[] = [];
  for (let y = earliestYear; y < currentYear; y++) {
    if (!existingYears.has(y)) newRecords.push(computeTaxYearRecord(data, y));
  }
  if (newRecords.length === 0) return data;
  return { ...data, taxYearRecords: [...data.taxYearRecords, ...newRecords] };
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
    // фиксируем налоговую статистику за уже законченные годы, если её ещё нет
    const withTaxYears = ensureTaxYearRecords(loaded);
    if (withTaxYears !== loaded) {
      loaded = withTaxYears;
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

  // Синхронизируем дефолт formatMoney с настройкой — иначе саб-компонентам без
  // доступа к useData (Stat, EarnedStripe и т.п.) пришлось бы прокидывать это пропсами.
  // Важно: делаем это прямо в рендере, а не в useEffect — эффекты родителя выполняются
  // ПОСЛЕ рендера детей, так что при переключении тумблера дети успевали бы отрендериться
  // со старым значением (отставание на один тик, тумблер и цифры на экране расходились).
  setAbbreviateMillionsDefault(data.settings.abbreviateMillions);
  setKopecksDefault(data.settings.kopecks);

  // Догоняем годовую налоговую статистику реактивно (не только при полном
  // перезапуске приложения) — иначе актив, добавленный задним числом в уже
  // запущенном приложении, «повиснет» без записи до следующего рестарта.
  useEffect(() => {
    if (loading) return;
    const next = ensureTaxYearRecords(data);
    if (next !== data) void persist(next);
  }, [data, loading, persist]);

  // --- Активы ---
  const addAsset = useCallback(
    async (asset: Asset) => {
      await persist({ ...data, assets: [...data.assets, asset] });
    },
    [data, persist],
  );

  /** Атомарное создание актива вместе с новыми организацией/инструментом (флоу
   * «Новый актив»): последовательные addOrganization+addInstrument+addAsset из
   * одного обработчика затирали бы друг друга — каждый persist от одного data. */
  const createAssetBundle = useCallback(
    async (bundle: { organization?: Organization; instrument?: FinancialInstrument; asset: Asset }) => {
      await persist({
        ...data,
        organizations: bundle.organization ? [...data.organizations, bundle.organization] : data.organizations,
        instruments: bundle.instrument ? [...data.instruments, bundle.instrument] : data.instruments,
        assets: [...data.assets, bundle.asset],
      });
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

  const deleteOrganization = useCallback(
    async (id: string) => {
      // Защита на уровне данных, а не только в UI каталога (см. deleteDemoData
      // выше) — иначе инструмент остаётся без площадки и «висит» так, будто
      // не существует, но не удаляется нигде.
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
        instruments: data.instruments.map((i) =>
          i.id === instrument.id ? instrument : i,
        ),
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

  // --- Демо / настройки ---
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

  const setManualRate = useCallback(
    async (code: CurrencyCode, value: number | undefined) => {
      const manualRates = { ...data.manualRates };
      if (value === undefined) delete manualRates[code];
      else manualRates[code] = value;
      await persist({ ...data, manualRates });
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

  /**
   * Полный пересбор истории курсов с нуля — выбрасывает всё старое (в т.ч.
   * записи, задвоенные старым багом бэкфилла, когда архивный запрос на «сегодня»
   * перетирал живое значение), тянет архив заново (уже без «сегодня» в диапазоне)
   * и добавляет актуальный курс на сегодня отдельным live-запросом.
   */
  const resetRateHistory = useCallback(async () => {
    const hist = await fetchCbrHistory();
    const fetched = await fetchCbrRates();
    const rates = { ...data.rates, ...fetched };
    const withToday = appendSnapshot(hist, rates);
    await persist({
      ...data,
      rates,
      ratesUpdatedAt: new Date().toISOString(),
      ratesHistory: withToday.slice(-90),
    });
  }, [data, persist]);

  const refreshKeyRate = useCallback(async () => {
    const stored = data.keyRateHistory.length > 0 ? data.keyRateHistory : KEY_RATE_HISTORY;
    const fromDate = stored[0]?.date ?? EARLIEST_DATE;
    const fetched = await fetchKeyRateHistory(fromDate);
    const merged = mergeKeyRateHistory(stored, fetched);
    await persist({
      ...data,
      keyRateHistory: merged,
      params: { ...data.params, keyRate: merged[0].rate },
    });
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
      createAssetBundle,
      updateAsset,
      deleteAsset,
      setAssetStatus,
      addOrganization,
      updateOrganization,
      deleteOrganization,
      addInstrument,
      updateInstrument,
      deleteInstrument,
      deleteDemoData,
      reseedDemo,
      updateParams,
      setManualRate,
      refreshRates,
      backfillRateHistory,
      resetRateHistory,
      refreshKeyRate,
      updateSettings,
      replaceAll,
    }),
    [
      data,
      loading,
      hasDemo,
      reload,
      addAsset,
      createAssetBundle,
      updateAsset,
      deleteAsset,
      setAssetStatus,
      addOrganization,
      updateOrganization,
      deleteOrganization,
      addInstrument,
      updateInstrument,
      deleteInstrument,
      deleteDemoData,
      reseedDemo,
      updateParams,
      setManualRate,
      refreshRates,
      backfillRateHistory,
      resetRateHistory,
      refreshKeyRate,
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
