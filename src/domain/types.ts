/**
 * Продуктовая модель данных CapFlow (не схема БД).
 * Архитектура строится вокруг ПОВЕДЕНИЯ инструмента, а не его названия.
 */

export type CurrencyCode = 'RUB' | 'USD' | 'EUR' | 'TRY' | 'CNY';

/** Поведение инструмента (архитектурный уровень). MVP: term | perpetual. */
export type InstrumentBehavior = 'term' | 'perpetual'; // Срочный | Бессрочный
// после MVP: 'market' (Рыночный) | 'cash' (Денежный)

/** Тип инструмента (пользовательский уровень). */
export type InstrumentTypeId = 'deposit' | 'savings' | 'dfa'; // Вклад | Накопительный | ЦФА(после MVP)

/** Период выплаты/начисления процентов. */
export type PayoutPeriod =
  | 'daily'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'end'; // в конце срока

/** Обработка начисленных процентов (решение #3). По умолчанию — простой процент. */
export type CapitalizationMode = 'none' | 'capitalize';

export interface Organization {
  id: string;
  name: string;
  /** банк / платформа ЦФА / брокер … */
  type: string;
  /** фирменный цвет бренда (hex) — используется ВЕЗДЕ одинаково для этой сущности */
  color: string;
  /** ключ/идентификатор лого (опц.) */
  logo?: string;
  archived?: boolean;
  isDemo?: boolean;
}

export interface FinancialInstrument {
  id: string;
  organizationId: string;
  name: string;
  typeId: InstrumentTypeId;
  behavior: InstrumentBehavior;
  allowTopUp?: boolean;
  allowPartialWithdraw?: boolean;
  capitalization?: CapitalizationMode;
  payoutPeriod?: PayoutPeriod;
  comment?: string;
  isDemo?: boolean;
}

export type AssetStatus = 'active' | 'closed' | 'archived';

/** Конкретный инструмент, открытый пользователем. Хранятся только первичные данные. */
export interface Asset {
  id: string;
  instrumentId: string;
  /** пользовательское название (опц.): «Подушка безопасности», «Отпуск 2027» */
  title?: string;
  amount: number; // первоначальная сумма
  currency: CurrencyCode;
  rate: number; // годовая ставка, % (напр. 18.5)
  openDate: string; // ISO 'YYYY-MM-DD'
  endDate?: string; // ISO, для срочных
  autoRenew?: boolean;
  /** переопределяет настройки инструмента, если заданы */
  capitalization?: CapitalizationMode;
  payoutPeriod?: PayoutPeriod;
  comment?: string;
  status: AssetStatus;
  isDemo?: boolean;
}

/** Параметры расчёта (хранятся; результаты вычислений — нет). */
export interface CalcParams {
  taxRate: number; // % (напр. 13)
  taxFreeLimit: number; // необлагаемый лимит в год, в основной валюте
  keyRate: number; // ключевая ставка ЦБ, %
}

/** Производные значения. Никогда не сохраняются — считаются на лету. */
export interface DerivedValues {
  incomePerDay: number;
  incomePerMonth: number;
  incomeTotalTerm?: number; // для срочных
  accrued: number; // начислено на «сейчас»
  tax: number; // расчётная оценка налога
  net: number; // чистыми
  finalAmount?: number; // итоговая сумма (срочные)
  earnedSoFar: number; // уже заработано
  remainingToEarn?: number; // осталось заработать
  daysRemaining?: number; // осталось дней (срочные)
  termProgress?: number; // 0..1 (срочные)
  premiumToKeyRate: number; // ставка − ключевая ставка
  /** прогноз для бессрочных «если ничего не менять» */
  forecastNextMonth?: number;
  forecastNextYear?: number;
}

/** Снимок состояния актива на момент закрытия/архивации (решение #8). */
export interface Snapshot {
  id: string;
  assetId: string;
  createdAt: string; // ISO datetime
  reason: 'closed' | 'archived';
  /** архивные снапшоты не участвуют в расчётах доходности */
  excludeFromAnalytics: boolean;
  engineVersion: string;
  derived: DerivedValues;
  assetSnapshot: Asset;
}

/** Связка актива с его инструментом и организацией (для UI/расчётов). */
export interface AssetView {
  asset: Asset;
  instrument: FinancialInstrument;
  organization: Organization;
  derived: DerivedValues;
}
