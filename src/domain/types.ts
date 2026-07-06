/**
 * Продуктовая модель данных CapFlow (не схема БД).
 * Архитектура строится вокруг ПОВЕДЕНИЯ инструмента, а не его названия.
 */

export type CurrencyCode =
  | 'RUB' | 'USD' | 'EUR' | 'TRY' | 'KZT' | 'BYN'
  | 'CNY' | 'INR' | 'AED' | 'BRL' | 'ARS';

/** Поведение инструмента (архитектурный уровень). MVP: term | perpetual. */
export type InstrumentBehavior = 'term' | 'perpetual'; // Срочный | Бессрочный
// после MVP: 'market' (Рыночный) | 'cash' (Денежный)

/** Тип инструмента (пользовательский уровень). Только прогнозируемая доходность —
 *  см. «Философия» в CLAUDE.md: фикс./почти фикс. ставка, никакого рыночного дохода. */
export type InstrumentTypeId = 'deposit' | 'savings' | 'bond' | 'dfa'; // Вклад | Накопительный | Облигация | ЦФА

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

/** Типы организаций — единый список для формы создания и табов каталога. */
export const ORG_TYPES = ['Банк', 'Агрегатор', 'Платформа ЦФА', 'Брокер', 'Другое'] as const;

export interface Organization {
  id: string;
  name: string;
  /** банк / платформа ЦФА / брокер … */
  type: string;
  /** фирменный цвет бренда (hex) — используется ВЕЗДЕ одинаково для этой сущности */
  color: string;
  /** ключ/идентификатор лого из каталога банков (опц.) */
  logo?: string;
  /** локальный путь к загруженной пользователем картинке лого — приоритетнее logo/color */
  customImageUri?: string;
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
  /** когда шаблон добавлен в каталог (ISO), не дата открытия конкретного вклада */
  createdAt?: string;
}

export type AssetStatus = 'active' | 'closed' | 'archived';

/**
 * Пополнение/снятие по счёту — реальная жизнь накопительного счёта: деньги
 * туда-обратно двигаются. Хранит АБСОЛЮТНЫЙ баланс на дату, не дельту —
 * так однозначнее и для капитализации, и для расчёта на минимальный остаток.
 */
export interface BalanceAdjustment {
  id: string;
  date: string; // ISO 'YYYY-MM-DD' — баланс становится таким начиная с этой даты
  amount: number; // новый баланс целиком (не «сколько добавили»)
  comment?: string;
}

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
  /** история пополнений/снятий, отсортирована по дате не обязательно — движок сам сортирует */
  balanceAdjustments?: BalanceAdjustment[];
}

/** Параметры расчёта (хранятся; результаты вычислений — нет). */
export interface CalcParams {
  taxRate: number; // % (напр. 13)
  taxFreeLimit: number; // необлагаемый лимит в год, в основной валюте
  keyRate: number; // ключевая ставка ЦБ, %
}

/** Производные значения. Никогда не сохраняются — считаются на лету. */
export interface DerivedValues {
  /** текущий баланс (тело) на «сейчас» — с учётом капитализации и корректировок баланса */
  balanceNow: number;
  incomePerDay: number;
  incomePerMonth: number;
  incomeTotalTerm?: number; // для срочных
  accrued: number; // начислено на «сейчас»
  tax: number; // расчётная оценка налога (на весь срок/накопленное)
  net: number; // чистыми (на весь срок/накопленное)
  monthlyTax: number; // налог с дохода за ближайший месяц
  monthlyNet: number; // чистыми за ближайший месяц (incomePerMonth − monthlyTax)
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
