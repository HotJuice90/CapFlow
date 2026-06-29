import type { AssetView, CurrencyCode } from '@/domain/types';
import { calculate, calcPortfolioTax, daysInYear, parseLocal } from '@/calc';
import type { AppData } from '@/storage/types';
import { tokens } from '@/theme';

const CURRENCY_COLOR: Record<string, string> = {
  RUB: '#10B3A3',
  USD: '#3E63DD',
  EUR: '#9A6DD7',
  TRY: '#F2A900',
  CNY: '#E5478B',
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
