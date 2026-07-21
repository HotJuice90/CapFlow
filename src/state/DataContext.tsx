import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Organization, TaxYearRecord } from '@/domain/types';
import { repository } from '@/storage/repository';
import { type AppData, emptyAppData } from '@/storage/types';
import { buildDemoData } from '@/data/seed';
import { findBankByName } from '@/domain/banks';
import { fetchCbrRates } from '@/rates/cbr';
import { computeTaxYearRecord } from './selectors';
import { setAbbreviateMillionsDefault, setKopecksDefault } from '@/format';
import { useAssetActions, type AssetActions } from './actions/useAssetActions';
import { useCatalogActions, type CatalogActions } from './actions/useCatalogActions';
import { useFreeCapitalActions, type FreeCapitalActions } from './actions/useFreeCapitalActions';
import { useGoalActions, type GoalActions } from './actions/useGoalActions';
import { useRatesActions, appendSnapshot, type RatesActions } from './actions/useRatesActions';
import { useSettingsActions, type SettingsActions } from './actions/useSettingsActions';

const RATES_TTL_MS = 22 * 3600 * 1000; // ~раз в сутки

interface DataContextValue extends AssetActions, CatalogActions, FreeCapitalActions, GoalActions, RatesActions, SettingsActions {
  data: AppData;
  loading: boolean;
  hasDemo: boolean;
  reload: () => Promise<void>;
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

  const assetActions = useAssetActions(data, persist);
  const catalogActions = useCatalogActions(data, persist);
  const freeCapitalActions = useFreeCapitalActions(data, persist);
  const goalActions = useGoalActions(data, persist);
  const ratesActions = useRatesActions(data, persist);
  const settingsActions = useSettingsActions(data, persist);

  const hasDemo = useMemo(() => data.assets.some((a) => a.isDemo), [data.assets]);

  const value = useMemo(
    () => ({
      data,
      loading,
      hasDemo,
      reload,
      ...assetActions,
      ...catalogActions,
      ...freeCapitalActions,
      ...goalActions,
      ...ratesActions,
      ...settingsActions,
    }),
    [data, loading, hasDemo, reload, assetActions, catalogActions, freeCapitalActions, goalActions, ratesActions, settingsActions],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
