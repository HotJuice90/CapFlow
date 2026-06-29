import type {
  Asset,
  CalcParams,
  CurrencyCode,
  FinancialInstrument,
  Organization,
  Snapshot,
} from '@/domain/types';
import type { KopecksMode } from '@/format/money';

export interface AppSettings {
  defaultCurrency: CurrencyCode;
  kopecks: KopecksMode;
  theme: 'light'; // тёмную добавим позже (решение #10)
}

/** Полный слепок данных приложения. Один JSON — удобно для экспорта/импорта (решение #11). */
export interface AppData {
  schemaVersion: number;
  organizations: Organization[];
  instruments: FinancialInstrument[];
  assets: Asset[];
  snapshots: Snapshot[];
  params: CalcParams;
  settings: AppSettings;
  /** курсы: сколько ₽ за 1 единицу валюты (RUB = 1). Источник позже — API ЦБ. */
  rates: Record<CurrencyCode, number>;
  /** демо уже посеяно (чтобы не сеять повторно после удаления) */
  seededDemo: boolean;
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_RATES: Record<CurrencyCode, number> = {
  RUB: 1,
  USD: 92,
  EUR: 100,
  TRY: 2.7,
  CNY: 13,
};

export const DEFAULT_PARAMS: CalcParams = {
  taxRate: 13,
  keyRate: 16,
  // необлагаемый лимит ≈ 1 млн × ключевая ставка (структура НК), но значение настраиваемое
  taxFreeLimit: 160_000,
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCurrency: 'RUB',
  kopecks: 'auto',
  theme: 'light',
};

export function emptyAppData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    organizations: [],
    instruments: [],
    assets: [],
    snapshots: [],
    params: { ...DEFAULT_PARAMS },
    settings: { ...DEFAULT_SETTINGS },
    rates: { ...DEFAULT_RATES },
    seededDemo: false,
  };
}
