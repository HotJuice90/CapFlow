import type { AssetView, CurrencyCode } from '@/domain/types';
import { calculate, calcPortfolioTax, daysInYear, parseLocal } from '@/calc';
import type { AppData } from '@/storage/types';
import { tokens } from '@/theme';

const CURRENCY_COLOR: Record<string, string> = {
  RUB: '#62709C',
  USD: '#3E63DD',
  EUR: '#9A6DD7',
  TRY: '#F2A900',
  KZT: '#1FA971',
  BYN: '#D7263D',
  CNY: '#E5478B',
  INR: '#FF9933',
  AED: '#00843D',
  BRL: '#009C3B',
  ARS: '#74ACDF',
};

/** Пересчёт суммы из валюты актива в основную валюту приложения (по последним курсам). */
function convert(amount: number, from: CurrencyCode, data: AppData): number {
  const inRub = amount * (data.rates[from] ?? 1);
  return inRub / (data.rates[data.settings.defaultCurrency] ?? 1);
}

/** Активы в статусе active, развёрнутые в AssetView с расчётами. */
export function buildAssetViews(data: AppData, now: Date = new Date()): AssetView[] {
  const orgById = new Map(data.organizations.map((o) => [o.id, o]));
  const instrById = new Map(data.instruments.map((i) => [i.id, i]));

  const views: AssetView[] = [];
  for (const asset of data.assets) {
    if (asset.status !== 'active') continue;
    const instrument = instrById.get(asset.instrumentId);
    if (!instrument) continue;
    const organization = orgById.get(instrument.organizationId);
    if (!organization) continue;
    const derived = calculate(asset, instrument, data.params, now);
    views.push({ asset, instrument, organization, derived });
  }
  return views;
}

export interface PortfolioSummary {
  workingCapital: number;
  incomePerDay: number;
  incomePerMonth: number;
  avgRate: number;
  keyRate: number;
  premiumToKeyRate: number;
}

export function portfolioSummary(data: AppData, now: Date = new Date()): PortfolioSummary {
  const views = buildAssetViews(data, now);
  let workingCapital = 0;
  let incomePerDay = 0;
  let incomePerMonth = 0;
  let weightedRate = 0;

  for (const v of views) {
    const c = v.asset.currency;
    const cap = convert(v.asset.amount, c, data);
    workingCapital += cap;
    incomePerDay += convert(v.derived.incomePerDay, c, data);
    incomePerMonth += convert(v.derived.incomePerMonth, c, data);
    weightedRate += v.asset.rate * cap;
  }

  const avgRate = workingCapital > 0 ? weightedRate / workingCapital : 0;

  return {
    workingCapital,
    incomePerDay,
    incomePerMonth,
    avgRate,
    keyRate: data.params.keyRate,
    premiumToKeyRate: avgRate - data.params.keyRate,
  };
}

function typeLabel(typeId: string): string {
  return typeId === 'deposit' ? 'Вклады' : typeId === 'savings' ? 'Накопительные счета' : 'ЦФА';
}

export interface TypeGroup {
  typeId: string;
  label: string;
  color: string;
  capital: number;
  incomePerMonth: number;
  share: number;
  count: number;
}

/** Группировка работающего капитала по типу инструмента (для блока на главной). */
export function groupByInstrumentType(
  data: AppData,
  now: Date = new Date(),
): { groups: TypeGroup[]; total: number } {
  const views = buildAssetViews(data, now);
  const map = new Map<string, TypeGroup>();
  let total = 0;
  for (const v of views) {
    const c = v.asset.currency;
    total += convert(v.asset.amount, c, data);
    const typeId = v.instrument.typeId;
    const g =
      map.get(typeId) ??
      {
        typeId,
        label: typeLabel(typeId),
        color: tokens.category[typeId] ?? tokens.accent.base,
        capital: 0,
        incomePerMonth: 0,
        share: 0,
        count: 0,
      };
    g.capital += convert(v.asset.amount, c, data);
    g.incomePerMonth += convert(v.derived.incomePerMonth, c, data);
    g.count += 1;
    map.set(typeId, g);
  }
  const groups = [...map.values()]
    .map((g) => ({ ...g, share: total > 0 ? g.capital / total : 0 }))
    .sort((a, b) => b.capital - a.capital);
  return { groups, total };
}

// ---------- Аналитика ----------

export interface DistGroup {
  key: string;
  label: string;
  color: string;
  capital: number;
  incomePerDay: number;
  incomePerMonth: number;
  avgRate: number;
  share: number;
  count: number;
}

function distribution(
  data: AppData,
  views: AssetView[],
  keyFn: (v: AssetView) => string,
  labelFn: (v: AssetView) => string,
  colorFn: (v: AssetView) => string,
): { groups: DistGroup[]; total: number } {
  const map = new Map<string, DistGroup & { weightedRate: number }>();
  let total = 0;
  for (const v of views) {
    const c = v.asset.currency;
    const cap = convert(v.asset.amount, c, data);
    total += cap;
    const key = keyFn(v);
    const g =
      map.get(key) ??
      {
        key,
        label: labelFn(v),
        color: colorFn(v),
        capital: 0,
        incomePerDay: 0,
        incomePerMonth: 0,
        avgRate: 0,
        share: 0,
        count: 0,
        weightedRate: 0,
      };
    g.capital += cap;
    g.incomePerDay += convert(v.derived.incomePerDay, c, data);
    g.incomePerMonth += convert(v.derived.incomePerMonth, c, data);
    g.weightedRate += v.asset.rate * cap;
    g.count += 1;
    map.set(key, g);
  }
  const groups = [...map.values()]
    .map(({ weightedRate, ...g }) => ({
      ...g,
      avgRate: g.capital > 0 ? weightedRate / g.capital : 0,
      share: total > 0 ? g.capital / total : 0,
    }))
    .sort((a, b) => b.capital - a.capital);
  return { groups, total };
}

export function distributionByType(data: AppData, now: Date = new Date()) {
  const views = buildAssetViews(data, now);
  return distribution(
    data,
    views,
    (v) => v.instrument.typeId,
    (v) => typeLabel(v.instrument.typeId),
    (v) => tokens.category[v.instrument.typeId] ?? tokens.accent.base,
  );
}

export function distributionByOrg(data: AppData, now: Date = new Date()) {
  const views = buildAssetViews(data, now);
  return distribution(
    data,
    views,
    (v) => v.organization.id,
    (v) => v.organization.name,
    (v) => v.organization.color,
  );
}

export function distributionByCurrency(data: AppData, now: Date = new Date()) {
  const views = buildAssetViews(data, now);
  return distribution(
    data,
    views,
    (v) => v.asset.currency,
    (v) => v.asset.currency,
    (v) => CURRENCY_COLOR[v.asset.currency] ?? tokens.accent.base,
  );
}

export interface AnalyticsSummary {
  totalCapital: number;
  incomePerDay: number;
  incomePerMonth: number;
  incomePerYear: number;
  accrued: number;
  taxYear: number;
  netYear: number;
  avgRate: number;
  keyRate: number;
  premium: number;
  incomePerMillionYear: number;
  topInstrument?: { name: string; org: string; incomePerDay: number };
  topOrganization?: { name: string; incomePerDay: number };
}

export function analyticsSummary(data: AppData, now: Date = new Date()): AnalyticsSummary {
  const views = buildAssetViews(data, now);
  let totalCapital = 0;
  let incomePerDay = 0;
  let incomePerMonth = 0;
  let incomePerYear = 0;
  let accrued = 0;
  let weightedRate = 0;
  const annualPerAsset: number[] = [];

  let topInstrument: AnalyticsSummary['topInstrument'];
  const orgIncome = new Map<string, { name: string; income: number }>();

  for (const v of views) {
    const c = v.asset.currency;
    const cap = convert(v.asset.amount, c, data);
    const incDay = convert(v.derived.incomePerDay, c, data);
    totalCapital += cap;
    incomePerDay += incDay;
    incomePerMonth += convert(v.derived.incomePerMonth, c, data);
    accrued += convert(v.derived.accrued, c, data);
    weightedRate += v.asset.rate * cap;
    const annual = convert((v.asset.amount * v.asset.rate) / 100, c, data);
    incomePerYear += annual;
    annualPerAsset.push(annual);

    if (!topInstrument || incDay > topInstrument.incomePerDay) {
      topInstrument = {
        name: v.asset.title ? `${v.instrument.name} · ${v.asset.title}` : v.instrument.name,
        org: v.organization.name,
        incomePerDay: incDay,
      };
    }
    const oi = orgIncome.get(v.organization.id) ?? { name: v.organization.name, income: 0 };
    oi.income += incDay;
    orgIncome.set(v.organization.id, oi);
  }

  const avgRate = totalCapital > 0 ? weightedRate / totalCapital : 0;
  const taxYear = calcPortfolioTax(annualPerAsset, data.params);
  let topOrganization: AnalyticsSummary['topOrganization'];
  for (const oi of orgIncome.values()) {
    if (!topOrganization || oi.income > topOrganization.incomePerDay) {
      topOrganization = { name: oi.name, incomePerDay: oi.income };
    }
  }

  return {
    totalCapital,
    incomePerDay,
    incomePerMonth,
    incomePerYear,
    accrued,
    taxYear,
    netYear: incomePerYear - taxYear,
    avgRate,
    keyRate: data.params.keyRate,
    premium: avgRate - data.params.keyRate,
    incomePerMillionYear: totalCapital > 0 ? (incomePerYear / totalCapital) * 1_000_000 : 0,
    topInstrument,
    topOrganization,
  };
}

export interface Insight {
  icon: string;
  title: string;
  text: string;
}

/** 2-3 базовых детерминированных инсайта (решение #10). Возвращает по приоритету. */
export function insights(data: AppData, now: Date = new Date()): Insight[] {
  const views = buildAssetViews(data, now);
  const out: Insight[] = [];

  // 1. ближайшее окончание срочного
  const ending = views
    .filter((v) => v.derived.daysRemaining !== undefined)
    .sort((a, b) => (a.derived.daysRemaining ?? 0) - (b.derived.daysRemaining ?? 0))[0];
  if (ending && (ending.derived.daysRemaining ?? 0) <= 14) {
    out.push({
      icon: 'event-available',
      title: 'Скоро освобождается капитал',
      text: `Через ${ending.derived.daysRemaining} дн. заканчивается «${ending.instrument.name}». Освободится ${Math.round(ending.asset.amount).toLocaleString('ru-RU')} ${ending.asset.currency === 'RUB' ? '₽' : ending.asset.currency}.`,
    });
  }

  // 2. средняя ставка vs ключевая
  const s = analyticsSummary(data, now);
  if (views.length > 0) {
    if (s.premium >= 0) {
      out.push({
        icon: 'trending-up',
        title: 'Портфель обгоняет ключевую',
        text: `Средняя ставка ${s.avgRate.toFixed(1).replace('.', ',')}% — это +${s.premium.toFixed(1).replace('.', ',')}% к ключевой ставке ЦБ.`,
      });
    } else {
      out.push({
        icon: 'trending-down',
        title: 'Доходность ниже ключевой',
        text: `Средняя ставка портфеля ниже ключевой на ${Math.abs(s.premium).toFixed(1).replace('.', ',')}%. Возможно, стоит пересмотреть инструменты.`,
      });
    }
  }

  return out;
}

// ---------- Календарь ----------

export interface CalendarEvent {
  date: string; // YYYY-MM-DD
  assetId: string;
  instrumentName: string;
  title?: string;
  typeId: string;
  color: string; // цвет организации
  amount: number; // освободится в валюте актива (итоговая = тело + чистыми)
  amountBase: number; // то же в основной валюте приложения (для итогов)
  daysRemaining: number;
  currency: CurrencyCode;
}

/** События, влияющие на капитал. MVP: окончание срочных (вклады, ЦФА). */
export function calendarEvents(data: AppData, now: Date = new Date()): CalendarEvent[] {
  const views = buildAssetViews(data, now);
  const out: CalendarEvent[] = [];
  for (const v of views) {
    if (v.instrument.behavior !== 'term' || !v.asset.endDate) continue;
    out.push({
      date: v.asset.endDate.slice(0, 10),
      assetId: v.asset.id,
      instrumentName: v.instrument.name,
      title: v.asset.title,
      typeId: v.instrument.typeId,
      color: v.organization.color,
      amount: v.derived.finalAmount ?? v.asset.amount,
      amountBase: convert(v.derived.finalAmount ?? v.asset.amount, v.asset.currency, data),
      daysRemaining: v.derived.daysRemaining ?? 0,
      currency: v.asset.currency,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface PayoutEvent {
  date: string; // YYYY-MM-DD
  assetId: string;
  instrumentName: string;
  title?: string;
  typeId: string;
  color: string; // цвет организации
  amount: number; // оценка начисления за период, в валюте актива
  amountBase: number; // то же в основной валюте
  currency: CurrencyCode;
}

const PAYOUT_STEP_MONTHS: Partial<Record<string, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Плановые даты начисления процентов (не окончание срока) — для активов с явным
 * payoutPeriod (monthly/quarterly/semiannual/annual). 'daily' не считаем — слишком
 * часто для месячной сетки; 'end'/undefined — это уже calendarEvents() (срок).
 * Работает и для срочных вкладов с промежуточными выплатами, и для бессрочных счетов.
 */
export function payoutEventsForMonth(data: AppData, year: number, month: number, now: Date = new Date()): PayoutEvent[] {
  const views = buildAssetViews(data, now);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const out: PayoutEvent[] = [];

  for (const v of views) {
    // Капитализирующиеся активы считает monthlyIncomeForecast() — там реальный
    // движок calculate() честно даёт «скачок» дохода на дату начисления,
    // а не оценку по формуле простого процента, как здесь.
    const mode = v.asset.capitalization ?? v.instrument.capitalization ?? 'none';
    if (mode === 'capitalize') continue;

    const payout = v.asset.payoutPeriod ?? v.instrument.payoutPeriod;
    const step = payout ? PAYOUT_STEP_MONTHS[payout] : undefined;
    if (!step) continue;

    const open = parseLocal(v.asset.openDate);
    const hardEnd = v.asset.endDate ? parseLocal(v.asset.endDate) : null;
    const periodsPerYear = 12 / step;
    const periodAmount = (v.asset.amount * v.asset.rate) / 100 / periodsPerYear;

    // первое начисление — через один период после открытия
    const occ = new Date(open);
    occ.setMonth(occ.getMonth() + step);
    while (occ < monthStart) occ.setMonth(occ.getMonth() + step);

    while (occ <= monthEnd) {
      if (!hardEnd || occ <= hardEnd) {
        out.push({
          date: isoDate(occ),
          assetId: v.asset.id,
          instrumentName: v.instrument.name,
          title: v.asset.title,
          typeId: v.instrument.typeId,
          color: v.organization.color,
          amount: periodAmount,
          amountBase: convert(periodAmount, v.asset.currency, data),
          currency: v.asset.currency,
        });
      }
      occ.setMonth(occ.getMonth() + step);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface ForecastDayChange {
  assetId: string;
  instrumentName: string;
  title?: string;
  typeId: string;
  color: string;
  currency: CurrencyCode;
  kind: 'end' | 'capStep';
  /** для 'end' — итоговая сумма к выплате; для 'capStep' — новый доход в день после скачка */
  amount: number;
  amountBase: number;
}

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  /** прогнозный доход портфеля в этот день (сумма incomePerDay всех валидных на дату активов) */
  total: number;
  /** почему день «особенный»: погашение вклада или скачок капитализации */
  changes: ForecastDayChange[];
}

/**
 * Прогноз, не факт: для каждого дня месяца прогоняем движок calculate() по каждому
 * активу на ЭТУ дату (не только «сейчас») — он уже честно учитывает капитализацию
 * (currentBalance() внутри), просто раньше вызывался только для today. Отсюда и
 * дневная сумма реально скачет у капитализирующихся счетов, а не растёт гладко.
 * changes — дни, где есть на что посмотреть: актив погашается или капитализация
 * даёт скачок дневного дохода конкретного счёта.
 */
export function monthlyIncomeForecast(data: AppData, year: number, month: number): ForecastDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const orgById = new Map(data.organizations.map((o) => [o.id, o]));
  const instrById = new Map(data.instruments.map((i) => [i.id, i]));
  const assets = data.assets.filter((a) => a.status === 'active');

  const prevIncome = new Map<string, number>(); // incomePerDay актива на предыдущий валидный день
  const out: ForecastDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d);
    let total = 0;
    const changes: ForecastDayChange[] = [];

    for (const asset of assets) {
      const instrument = instrById.get(asset.instrumentId);
      if (!instrument) continue;
      const open = parseLocal(asset.openDate);
      const end = asset.endDate ? parseLocal(asset.endDate) : null;
      const validToday = open <= day && (!end || day <= end);
      if (!validToday) {
        prevIncome.delete(asset.id);
        continue;
      }

      const derived = calculate(asset, instrument, data.params, day);
      total += convert(derived.incomePerDay, asset.currency, data);

      const org = orgById.get(instrument.organizationId);
      const color = org?.color ?? tokens.accent.base;
      const isEndDay = end !== null && day.getTime() === end.getTime();
      const prev = prevIncome.get(asset.id);
      const capStepped = prev !== undefined && Math.abs(derived.incomePerDay - prev) > 1e-9;

      if (isEndDay) {
        const amount = derived.finalAmount ?? asset.amount;
        changes.push({
          assetId: asset.id, instrumentName: instrument.name, title: asset.title,
          typeId: instrument.typeId, color, currency: asset.currency, kind: 'end',
          amount, amountBase: convert(amount, asset.currency, data),
        });
      } else if (capStepped) {
        changes.push({
          assetId: asset.id, instrumentName: instrument.name, title: asset.title,
          typeId: instrument.typeId, color, currency: asset.currency, kind: 'capStep',
          amount: derived.incomePerDay, amountBase: convert(derived.incomePerDay, asset.currency, data),
        });
      }

      prevIncome.set(asset.id, derived.incomePerDay);
    }

    out.push({ date: isoDate(day), total, changes });
  }
  return out;
}

export interface DayContribution {
  assetId: string;
  instrumentName: string;
  title?: string;
  typeId: string;
  color: string;
  currency: CurrencyCode;
  incomePerDay: number;
  incomePerDayBase: number;
  /** для isEndDay — итоговая сумма к выплате (проценты + тело, если применимо) */
  finalAmount?: number;
  finalAmountBase?: number;
  termProgress?: number;
  isEndDay: boolean;
  capStepped: boolean;
}

/** Вклад КАЖДОГО активного на эту дату актива в доход дня — включая простые проценты без событий. */
export function dayContributions(data: AppData, dateIso: string): DayContribution[] {
  const day = parseLocal(dateIso);
  const prevDay = new Date(day);
  prevDay.setDate(prevDay.getDate() - 1);
  const views = buildAssetViews(data, day);
  const out: DayContribution[] = [];
  for (const v of views) {
    const open = parseLocal(v.asset.openDate);
    const end = v.asset.endDate ? parseLocal(v.asset.endDate) : null;
    if (open > day || (end && day > end)) continue;
    const isEndDay = end !== null && day.getTime() === end.getTime();
    let capStepped = false;
    if (!isEndDay && open <= prevDay && (!end || prevDay <= end)) {
      const prevDerived = calculate(v.asset, v.instrument, data.params, prevDay);
      capStepped = Math.abs(v.derived.incomePerDay - prevDerived.incomePerDay) > 1e-9;
    }
    const finalAmount = isEndDay ? v.derived.finalAmount ?? v.asset.amount : undefined;
    out.push({
      assetId: v.asset.id,
      instrumentName: v.instrument.name,
      title: v.asset.title,
      typeId: v.instrument.typeId,
      color: v.organization.color,
      currency: v.asset.currency,
      incomePerDay: v.derived.incomePerDay,
      incomePerDayBase: convert(v.derived.incomePerDay, v.asset.currency, data),
      finalAmount,
      finalAmountBase: finalAmount !== undefined ? convert(finalAmount, v.asset.currency, data) : undefined,
      termProgress: v.derived.termProgress,
      isEndDay,
      capStepped,
    });
  }
  return out.sort((a, b) => b.incomePerDayBase - a.incomePerDayBase);
}

/** Реконструкция капитала по дням за последние N дней (для графика в аналитике). */
export function capitalSeries(data: AppData, days = 30): number[] {
  const today = new Date();
  const out: number[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const day = new Date(today);
    day.setDate(day.getDate() - k);
    let cap = 0;
    for (const a of data.assets) {
      if (a.status !== 'active') continue;
      if (parseLocal(a.openDate) > day) continue;
      if (a.endDate && parseLocal(a.endDate) < day) continue;
      cap += convert(a.amount, a.currency, data);
    }
    out.push(cap);
  }
  return out;
}

function incomePerDayOn(data: AppData, day: Date): number {
  let sum = 0;
  for (const a of data.assets) {
    if (a.status !== 'active') continue;
    if (parseLocal(a.openDate) > day) continue;
    if (a.endDate && parseLocal(a.endDate) < day) continue;
    sum += convert((a.amount * a.rate) / 100 / daysInYear(day), a.currency, data);
  }
  return sum;
}

export interface PeriodComparison {
  capitalNow: number;
  capitalPrev: number;
  incomeNow: number;
  incomePrev: number;
}

/** Сравнение «сейчас vs ~30 дней назад» (реконструкция). */
export function monthComparison(data: AppData, now: Date = new Date()): PeriodComparison {
  const prev = new Date(now);
  prev.setDate(prev.getDate() - 30);
  const cap = capitalSeries(data, 31);
  return {
    capitalNow: cap[cap.length - 1] ?? 0,
    capitalPrev: cap[0] ?? 0,
    incomeNow: incomePerDayOn(data, now),
    incomePrev: incomePerDayOn(data, prev),
  };
}

/** Реконструкция: кумулятивный дневной доход портфеля за последние N дней (для sparkline). */
export function incomeSparkline(data: AppData, days = 30): number[] {
  const today = new Date();
  const series: number[] = [];
  let cumulative = 0;
  for (let k = days - 1; k >= 0; k--) {
    const day = new Date(today);
    day.setDate(day.getDate() - k);
    let dayIncome = 0;
    for (const a of data.assets) {
      if (a.status !== 'active') continue;
      if (parseLocal(a.openDate) > day) continue;
      if (a.endDate && parseLocal(a.endDate) < day) continue;
      dayIncome += convert((a.amount * a.rate) / 100 / daysInYear(day), a.currency, data);
    }
    cumulative += dayIncome;
    series.push(cumulative);
  }
  return series;
}
