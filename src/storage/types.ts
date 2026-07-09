import type {
  Asset,
  CalcParams,
  CurrencyCode,
  FinancialInstrument,
  Organization,
  Snapshot,
  TaxYearRecord,
} from '@/domain/types';
import type { KopecksMode } from '@/format/money';
import { KEY_RATE_HISTORY, type KeyRatePoint } from '@/domain/keyRateHistory';

export interface AppSettings {
  defaultCurrency: CurrencyCode;
  kopecks: KopecksMode;
  theme: 'light'; // тёмную добавим позже (решение #10)
  navBar: 'light' | 'dark'; // оформление плавающего навбара
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
  /** курсы: сколько ₽ за 1 единицу валюты (RUB = 1). Источник — API ЦБ РФ. */
  rates: Record<CurrencyCode, number>;
  /** ручной override курса ЦБ (решение пользователя) — приоритетнее rates,
   *  если задан. rates при этом продолжает обновляться с ЦБ в фоне, чтобы
   *  можно было показать «курс ЦБ: X» рядом с ручным значением. */
  manualRates: Partial<Record<CurrencyCode, number>>;
  /** когда курсы обновлялись последний раз (ISO), null — ещё ни разу */
  ratesUpdatedAt: string | null;
  /** история курсов по дням (для графика «курс за период») */
  ratesHistory: RateSnapshot[];
  /** история ключевой ставки ЦБ (точки изменений, новые сверху) — не меняется задним числом,
   *  поэтому храним и при «Обновить» только домердживаем свежие записи, не тянем всё заново */
  keyRateHistory: KeyRatePoint[];
  /** демо уже посеяно (чтобы не сеять повторно после удаления) */
  seededDemo: boolean;
  /** зафиксированная налоговая статистика по прошлым годам (решение — фиксируем
   *  год только когда он уже закончился, задним числом не пересчитываем) */
  taxYearRecords: TaxYearRecord[];
}

export interface RateSnapshot {
  date: string; // YYYY-MM-DD
  rates: Partial<Record<CurrencyCode, number>>; // ₽ за 1 единицу
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_RATES: Record<CurrencyCode, number> = {
  RUB: 1,
  USD: 92,
  EUR: 100,
  TRY: 2.7,
  KZT: 0.20,
  BYN: 28,
  CNY: 13,
  INR: 1.05,
  AED: 25,
  BRL: 16.5,
  ARS: 0.09,
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
  navBar: 'light',
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
    manualRates: {},
    ratesUpdatedAt: null,
    ratesHistory: [],
    keyRateHistory: [...KEY_RATE_HISTORY],
    seededDemo: false,
    taxYearRecords: [],
  };
}
