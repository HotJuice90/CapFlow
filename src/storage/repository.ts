import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AppData, DEFAULT_RATES, emptyAppData, SCHEMA_VERSION } from './types';

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
