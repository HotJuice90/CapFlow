import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AppData, DEFAULT_RATES, emptyAppData, SCHEMA_VERSION } from './types';
import { KEY_RATE_HISTORY } from '@/domain/keyRateHistory';
import { mergeKeyRateHistory } from '@/rates/keyRate';

/**
 * Абстракция хранилища (решение #14). Весь UI работает ТОЛЬКО через этот интерфейс —
 * замена AsyncStorage → expo-sqlite будет точечной, без переписывания экранов.
 */
export interface Repository {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}

const STORAGE_KEY = 'capflow:data:v1';

function migrate(data: AppData): AppData {
  // бэкафилл полей, появившихся позже (для уже установленных копий)
  const next: AppData = { ...data };
  // мерж с дефолтами — добавляет валюты, появившиеся позже (напр. CNY)
  next.rates = { ...DEFAULT_RATES, ...data.rates };
  if (!next.ratesHistory) next.ratesHistory = [];
  if (!next.manualRates) next.manualRates = {};
  if (!next.taxYearRecords) next.taxYearRecords = [];
  if (!next.goals) next.goals = [];
  if (!next.freeCapitalEntries) next.freeCapitalEntries = [];

  // Смена фирменного цвета банка в реестре (src/domain/banks.ts) НЕ доходит до
  // уже заведённых площадок: цвет копируется в организацию в момент создания
  // (`color: bank.color`) и дальше живёт в данных. Поэтому переносим точечно —
  // только ровно то старое значение, которое заменили в реестре.
  //
  // Сплошным «выровнять все по реестру» делать нельзя: цвет площадки
  // редактируется вручную (ColorField в app/catalog/organization.tsx), и такая
  // миграция затёрла бы осознанный выбор пользователя.
  const REBRANDED: { logo: string; from: string; to: string }[] = [
    { logo: 'tbank', from: '#1D1D1B', to: '#FFDD2D' },
  ];
  if (next.organizations?.length) {
    next.organizations = next.organizations.map((o) => {
      const hit = REBRANDED.find((r) => r.logo === o.logo && o.color?.toUpperCase() === r.from);
      return hit ? { ...o, color: hit.to } : o;
    });
  }
  if (next.settings.abbreviateMillions === undefined) {
    next.settings = { ...next.settings, abbreviateMillions: true };
  }
  if (next.settings.kopecks === undefined) {
    next.settings = { ...next.settings, kopecks: 'auto' };
  }
  // Самовосстанавливающийся мердж, не только «если пусто» — если сохранённая
  // история где-то обрезалась (напр. неудачный live-фетч), старый бэйзлайн
  // с 2013 года всё равно домердживается на каждой загрузке, не только один раз.
  next.keyRateHistory = mergeKeyRateHistory(KEY_RATE_HISTORY, next.keyRateHistory ?? []);
  if (next.schemaVersion < SCHEMA_VERSION) next.schemaVersion = SCHEMA_VERSION;
  return next;
}

export function createAsyncStorageRepository(): Repository {
  return {
    async load() {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyAppData();
      try {
        return migrate(JSON.parse(raw) as AppData);
      } catch {
        // повреждённые данные — не роняем приложение, начинаем чисто
        return emptyAppData();
      }
    },
    async save(data) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
    async clear() {
      await AsyncStorage.removeItem(STORAGE_KEY);
    },
  };
}

/** Единый экземпляр репозитория для приложения. */
export const repository: Repository = createAsyncStorageRepository();
