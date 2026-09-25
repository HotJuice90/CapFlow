import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AppData, emptyAppData } from './types';
import { migrate } from './migrate';

/**
 * Абстракция хранилища (решение #14). Весь UI работает ТОЛЬКО через этот интерфейс —
 * замена AsyncStorage → expo-sqlite будет точечной, без переписывания экранов.
 */
export interface Repository {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
  /** Сведения о неудачной загрузке (см. RESCUE_KEY) — или null, если всё прочиталось. */
  loadFailure(): LoadFailure | null;
  /** Сырой текст аварийной копии, если она есть. */
  readRescue(): Promise<RescueCopy | null>;
  dropRescue(): Promise<void>;
}

export interface LoadFailure {
  /** `parse` — файл не JSON, `migrate` — JSON прочитался, но упала миграция. */
  kind: 'parse' | 'migrate';
  message: string;
}

export interface RescueCopy {
  savedAt: string;
  raw: string;
}

const STORAGE_KEY = 'capflow:data:v1';
/**
 * Аварийная копия последнего НЕПРОЧИТАННОГО состояния.
 *
 * Раньше любое исключение при загрузке (битый JSON, но и любая ошибка внутри
 * migrate) молча возвращало пустые данные. Дальше DataProvider видел
 * `seededDemo: false`, засевал демо и СОХРАНЯЛ — то есть настоящие данные
 * пользователя затирались демо-портфелем безвозвратно. Для приложения про
 * деньги это худший из возможных сценариев, и защищаться от него надо не
 * аккуратностью migrate (её всегда не хватит), а тем, что сырой текст
 * откладывается в сторону ДО того, как что-то будет перезаписано.
 */
const RESCUE_KEY = 'capflow:data:v1:rescue';

export function createAsyncStorageRepository(): Repository {
  let failure: LoadFailure | null = null;

  return {
    async load() {
      failure = null;
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyAppData();

      let parsed: AppData;
      try {
        parsed = JSON.parse(raw) as AppData;
      } catch (e) {
        failure = { kind: 'parse', message: String(e) };
        await AsyncStorage.setItem(RESCUE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
        return emptyAppData();
      }

      try {
        return migrate(parsed);
      } catch (e) {
        // JSON целый — значит данные, скорее всего, живые, а сломалась миграция.
        // Такое чинится кодом, поэтому копию храним и НЕ даём приложению
        // молча начать с чистого листа (см. DataProvider: демо не сеется,
        // пока есть незакрытая аварийная копия).
        failure = { kind: 'migrate', message: String(e) };
        await AsyncStorage.setItem(RESCUE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
        return emptyAppData();
      }
    },

    loadFailure() {
      return failure;
    },

    async readRescue() {
      const raw = await AsyncStorage.getItem(RESCUE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as RescueCopy;
      } catch {
        return null;
      }
    },

    async dropRescue() {
      await AsyncStorage.removeItem(RESCUE_KEY);
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
