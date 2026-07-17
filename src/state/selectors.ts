import type { Asset, AssetView, CurrencyCode, FinancialInstrument, Organization, Snapshot, TaxYearRecord } from '@/domain/types';
import { calculate, calcAssetTax, calcPortfolioTax, calcTax, daysInYear, diffDays, parseLocal, periodsPerYear } from '@/calc';
import type { AppData } from '@/storage/types';
import type { KeyRatePoint } from '@/domain/keyRateHistory';
import { tokens } from '@/theme';
import { uid } from '@/utils/id';
import { CURRENCY_SYMBOL } from '@/format';

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

/** Действующий курс валюты: ручной override приоритетнее автокурса ЦБ. */
export function effectiveRate(data: AppData, code: CurrencyCode): number {
  return data.manualRates[code] ?? data.rates[code] ?? 1;
}

/** Курс code относительно base (сколько base за 1 единицу code) — кросс-курс через ₽. */
export function crossRate(data: AppData, code: CurrencyCode, base: CurrencyCode): number {
  return effectiveRate(data, code) / effectiveRate(data, base);
}

/** manualTotalCapital, пересчитанный из валюты ввода в текущую defaultCurrency —
 *  иначе при смене валюты по умолчанию число просто переинтерпретируется как есть,
 *  без конвертации (см. AppSettings.manualTotalCapitalCurrency). */
export function manualTotalCapitalConverted(data: AppData): number | undefined {
  const raw = data.settings.manualTotalCapital;
  if (raw === undefined) return undefined;
  const from = data.settings.manualTotalCapitalCurrency ?? data.settings.defaultCurrency;
  return raw * crossRate(data, from, data.settings.defaultCurrency);
}

/** Пересчёт суммы из валюты актива в основную валюту приложения (по последним курсам). */
export function convert(amount: number, from: CurrencyCode, data: AppData): number {
  const inRub = amount * effectiveRate(data, from);
  return inRub / effectiveRate(data, data.settings.defaultCurrency);
}

/**
 * Просрочен (срок вышел, но актив ещё не закрыт/архивирован руками) И это
 * случилось в ПРОШЛОМ календарном году — на текущих экранах такое не
 * показываем вообще, только в истории/архиве. В ТЕКУЩЕМ году просроченный
 * актив продолжает жить как обычно (с пометкой «нужно решение» в UI).
 */
export function isPastYearMatured(asset: Asset, instrument: FinancialInstrument, now: Date = new Date()): boolean {
  if (instrument.behavior !== 'term' || asset.status !== 'active' || !asset.endDate) return false;
  const nowIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (diffDays(nowIso, asset.endDate) > 0) return false; // срок ещё не наступил
  const endYear = parseInt(asset.endDate.slice(0, 4), 10);
  return endYear < now.getFullYear();
}

/** Активы в статусе active, развёрнутые в AssetView с расчётами. */
export function buildAssetViews(data: AppData, now: Date = new Date()): AssetView[] {
  const orgById = new Map(data.organizations.map((o) => [o.id, o]));
  const instrById = new Map(data.instruments.map((i) => [i.id, i]));

  const active: { asset: Asset; instrument: FinancialInstrument; organization: Organization }[] = [];
  for (const asset of data.assets) {
    if (asset.status !== 'active') continue;
    const instrument = instrById.get(asset.instrumentId);
    if (!instrument) continue;
    if (isPastYearMatured(asset, instrument, now)) continue;
    const organization = orgById.get(instrument.organizationId);
    if (!organization) continue;
    active.push({ asset, instrument, organization });
  }

  // Необлагаемый лимит (ст. 214.2 НК) — льгота на процентный доход, который
  // человек декларирует и платит САМ. Активы с taxWithheldByBank (площадка
  // удерживает налог сама, свой правовой режим) в этом дележе не участвуют
  // вообще — ни занимают лимит своим доходом, ни получают долю от него
  // (см. calcAssetTax — для них считается плоско, без лимита в принципе).
  const selfReported = active.filter(({ asset }) => !asset.taxWithheldByBank);
  const byOpenDate = [...selfReported].sort((a, b) => {
    const d = a.asset.openDate.localeCompare(b.asset.openDate);
    return d !== 0 ? d : a.asset.id.localeCompare(b.asset.id);
  });
  const limitUsedById = new Map<string, number>();
  let runningLimitUsed = 0;
  for (const { asset } of byOpenDate) {
    limitUsedById.set(asset.id, runningLimitUsed);
    runningLimitUsed += convert((asset.amount * asset.rate) / 100, asset.currency, data);
  }

  return active.map(({ asset, instrument, organization }) => ({
    asset,
    instrument,
    organization,
    derived: calculate(asset, instrument, data.params, now, limitUsedById.get(asset.id) ?? 0),
  }));
}

/**
 * Найти AssetView конкретного актива по id НАПРЯМУЮ, в обход фильтров
 * buildAssetViews (активный/просрочен-прошлый-год) — чтобы страница актива
 * всегда открывалась, даже если в списках/сводках он сейчас не показывается
 * (закрыт, архивный, или просрочен и «спрятан» с прошлого года).
 */
export function findAssetView(data: AppData, id: string | undefined, now: Date = new Date()): AssetView | undefined {
  if (!id) return undefined;
  const fromCurrent = buildAssetViews(data, now).find((v) => v.asset.id === id);
  if (fromCurrent) return fromCurrent;
  const asset = data.assets.find((a) => a.id === id);
  if (!asset) return undefined;
  const instrument = data.instruments.find((i) => i.id === asset.instrumentId);
  if (!instrument) return undefined;
  const organization = data.organizations.find((o) => o.id === instrument.organizationId);
  if (!organization) return undefined;
  return { asset, instrument, organization, derived: calculate(asset, instrument, data.params, now, 0) };
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
    // Честная стоимость (тело с корректировками + начисленное), не сумма открытия —
    // капитал на главной должен расти день ото дня вместе с доходом.
    const cap = convert(v.derived.currentValue, c, data);
    workingCapital += cap;
    incomePerDay += convert(v.derived.incomePerDay, c, data);
    incomePerMonth += convert(v.derived.incomePerMonth, c, data);
    weightedRate += v.derived.currentRate * cap;
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
  if (typeId === 'deposit') return 'Вклады';
  if (typeId === 'savings') return 'Накопительные счета';
  if (typeId === 'bond') return 'Облигации';
  return 'ЦФА';
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
    const cap = convert(v.derived.currentValue, c, data);
    total += cap;
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
    g.capital += cap;
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
    const cap = convert(v.derived.currentValue, c, data);
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
    g.weightedRate += v.derived.currentRate * cap;
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
  /** Из accrued — только активы БЕЗ taxWithheldByBank: именно они делят необлагаемый
   *  лимит (льгота — для тех, кто платит сам, см. calcAssetTax). */
  selfAccrued: number;
  taxYear: number;
  /** Налог на уже накопленный (не прогнозный) доход сверх лимита — на сегодня. */
  taxAccrued: number;
  /** Из taxAccrued — доля активов с флагом «удержит банк сам», уже на сегодня. */
  taxAccruedWithheld: number;
  /** Из taxAccrued — доля активов БЕЗ флага: доплатить самому, уже на сегодня. */
  taxAccruedSelf: number;
  /** Из taxYear — доля активов с флагом «удержит банк сам». */
  taxYearWithheld: number;
  /** Из taxYear — доля активов БЕЗ флага: это придётся доплатить самому. */
  taxYearSelf: number;
  /** Прогноз за год БЕЗ учёта необлагаемого лимита («грязный» налог — та же
   *  методика, что и в списке «Налог по инструментам» на экране аналитики,
   *  чтобы сумма списка совпадала с заголовком карточки, а не с net-цифрой
   *  taxYear, которая после вычета лимита может занижать реальную сумму
   *  «на бумаге» до одного актива из трёх). Для «отложить на налог» на
   *  Главной по-прежнему используем net-версию (taxYearSelf/taxAccruedSelf) —
   *  там лимит учитывать НУЖНО, это честная рекомендация «сколько реально
   *  причитается», а не сумма по списку. */
  taxYearGross: number;
  taxYearSelfGross: number;
  /** Тот же «грязный» приём для «набежало на сегодня» — см. taxYearGross. */
  taxAccruedGross: number;
  /** Реально удержанный банками налог (BalanceAdjustment.taxWithheld) — по ВСЕМ
   *  активам, включая закрытые/архивные: факт, не оценка. */
  taxPaidTotal: number;
  netYear: number;
  avgRate: number;
  keyRate: number;
  premiumToKeyRate: number;
  incomePerMillionYear: number;
  topInstrument?: { name: string; org: string; incomePerDay: number };
  topOrganization?: { name: string; incomePerDay: number };
}

interface ClosedThisYearSnapshot {
  snapshot: Snapshot;
  asset: Asset;
  instrument: FinancialInstrument;
  closedAt: Date;
}

/**
 * Последний снапшот (excludeFromAnalytics=false) по каждому активу, закрытому/
 * архивированному В ЭТОМ календарном году — общая выборка для всего, что
 * должно «видеть» такие активы (реальный доход/налог за этот год), иначе
 * buildAssetViews (только активные) их просто не покажет, а смена промо-вклада
 * на новый «обнулит» уже заработанное и подлежащее налогу.
 */
function closedThisYearSnapshots(data: AppData, now: Date): ClosedThisYearSnapshot[] {
  const instrById = new Map(data.instruments.map((i) => [i.id, i]));
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const latestByAsset = new Map<string, Snapshot>();
  for (const s of data.snapshots) {
    if (s.excludeFromAnalytics) continue;
    const prev = latestByAsset.get(s.assetId);
    if (!prev || s.createdAt > prev.createdAt) latestByAsset.set(s.assetId, s);
  }

  const out: ClosedThisYearSnapshot[] = [];
  for (const snap of latestByAsset.values()) {
    const closedAt = new Date(snap.createdAt); // ISO datetime — не date-only, parseLocal тут не годится
    if (closedAt < yearStart || closedAt > now) continue;
    const asset = snap.assetSnapshot;
    const instrument = instrById.get(asset.instrumentId);
    if (!instrument) continue;
    out.push({ snapshot: snap, asset, instrument, closedAt });
  }
  return out;
}

export interface ClosedYearContribution {
  asset: Asset;
  instrument: FinancialInstrument;
  /** Реально заработано этим активом В ЭТОМ календарном году (delta accrued
   *  между началом года/датой открытия и датой закрытия — не прогноз). */
  realized: number;
}

/**
 * Налогооблагаемый доход АКТИВНОГО актива за ЭТОТ календарный год. Для срочных
 * (behavior='term' с известным endDate) — точная сумма от начала года (или
 * даты открытия, если она позже) до конца года (или даты окончания срока,
 * если она раньше): срок известен заранее, экстраполировать «как будто ставка
 * продержится весь год» тут бессмысленно — так считать нужно только для
 * бессрочных (накопительные без фиксированного срока), для них другого способа
 * прикинуть годовую сумму просто нет.
 */
function thisYearTaxableIncome(
  asset: Asset,
  instrument: FinancialInstrument,
  data: AppData,
  now: Date,
  balanceNow: number,
  currentRate: number,
): number {
  if (instrument.behavior === 'term' && asset.endDate) {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    const openDate = parseLocal(asset.openDate);
    const endDate = parseLocal(asset.endDate);
    const upper = endDate < yearEnd ? endDate : yearEnd;
    const lower = openDate > yearStart ? openDate : yearStart;
    if (lower >= upper) return 0;
    const endAccrued = calculate(asset, instrument, data.params, upper, 0).accrued;
    const startAccrued = calculate(asset, instrument, data.params, lower, 0).accrued;
    return convert(endAccrued - startAccrued, asset.currency, data);
  }
  return convert((balanceNow * currentRate) / 100, asset.currency, data);
}

/** Дельта accrued между началом года (или открытием, если оно позже) и датой
 *  закрытия — тот же приём, что и earnedInPeriod, по замороженному asset/instrument. */
function closedThisYearContributions(data: AppData, now: Date): ClosedYearContribution[] {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const out: ClosedYearContribution[] = [];
  for (const { asset, instrument, closedAt } of closedThisYearSnapshots(data, now)) {
    const openDate = parseLocal(asset.openDate);
    const effectiveStart = openDate > yearStart ? openDate : yearStart;
    if (effectiveStart > closedAt) continue;
    const endAccrued = calculate(asset, instrument, data.params, closedAt, 0).accrued;
    const startAccrued = calculate(asset, instrument, data.params, effectiveStart, 0).accrued;
    const realized = convert(endAccrued - startAccrued, asset.currency, data);
    out.push({ asset, instrument, realized });
  }
  return out;
}

export interface TaxByInstrumentRow {
  key: string;
  name: string;
  typeId: FinancialInstrument['typeId'];
  organizationId: string;
  /** Прогноз/итог за год — для срочных и закрытых это уже финальная, точная
   *  цифра (весь их этот-годовой срок известен наперёд). */
  tax: number;
  /** Только для АКТИВНЫХ бессрочных (без фиксированного срока) — реально
   *  накопленный (не прогнозный) налог с начала года по сегодня. У срочных и
   *  закрытых своего «на сегодня» нет: их `tax` и так точная финальная сумма,
   *  дублировать нечего. */
  taxToDate?: number;
  /** Срочный (известна дата окончания) или уже закрытый актив — сумма налога
   *  за год ФИКСИРОВАНА (весь срок известен наперёд), в отличие от бессрочных,
   *  где `tax` — экстраполяция «если ставка продержится весь год». UI рисует
   *  замочек рядом с суммой. */
  fixed: boolean;
}

/** Реально накопленный (не прогнозный) доход с начала года (или открытия,
 *  если оно позже) до СЕГОДНЯ — та же дельта accrued, что и в
 *  closedThisYearContributions/earnedInPeriod, только верхняя граница —
 *  «сейчас», а не дата закрытия/окончания срока. */
function thisYearAccruedToDate(asset: Asset, instrument: FinancialInstrument, data: AppData, now: Date): number {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const openDate = parseLocal(asset.openDate);
  const lower = openDate > yearStart ? openDate : yearStart;
  if (lower >= now) return 0;
  const nowAccrued = calculate(asset, instrument, data.params, now, 0).accrued;
  const lowerAccrued = calculate(asset, instrument, data.params, lower, 0).accrued;
  return convert(nowAccrued - lowerAccrued, asset.currency, data);
}

/**
 * ГРЯЗНЫЙ налог по каждому инструменту (активу) ЗА ЭТОТ ГОД — доход × ставка
 * НДФЛ, БЕЗ учёта общего необлагаемого лимита (тот делится между активами не
 * попунктно, а как получится — «сколько именно с этого вклада» без лимита
 * посчитать честно нельзя, поэтому тут просто ставка на доход; лимит уже
 * учтён в самом прогнозе выше по карточке). Доход — тот же, что в
 * incomePerYear/taxYear (thisYearTaxableIncome/closedThisYearContributions),
 * не derived.tax (тот на весь срок вклада, для срочных завышает в разы).
 *
 * Для активных БЕССРОЧНЫХ инструментов (нет known endDate — прогноз годовой
 * суммы это экстраполяция «если ставка продержится весь год», а не факт)
 * добавляем taxToDate — сколько РЕАЛЬНО набежало с начала года по сегодня,
 * чтобы не путать прогноз с фактом: раньше оба писались одним числом.
 */
export function taxByInstrument(data: AppData, now: Date = new Date()): TaxByInstrumentRow[] {
  const rate = data.params.taxRate / 100;
  const rows: TaxByInstrumentRow[] = [];
  for (const v of buildAssetViews(data, now)) {
    const annual = thisYearTaxableIncome(v.asset, v.instrument, data, now, v.derived.balanceNow, v.derived.currentRate);
    if (annual <= 0) continue;
    const isPerpetual = !(v.instrument.behavior === 'term' && v.asset.endDate);
    const toDateIncome = isPerpetual ? thisYearAccruedToDate(v.asset, v.instrument, data, now) : 0;
    rows.push({
      key: v.asset.id,
      name: v.asset.title ? `${v.instrument.name} · ${v.asset.title}` : v.instrument.name,
      typeId: v.instrument.typeId,
      organizationId: v.instrument.organizationId,
      tax: annual * rate,
      taxToDate: isPerpetual && toDateIncome > 0 ? toDateIncome * rate : undefined,
      fixed: !isPerpetual,
    });
  }
  for (const cl of closedThisYearContributions(data, now)) {
    if (cl.realized <= 0) continue;
    rows.push({
      key: cl.asset.id,
      name: cl.asset.title ? `${cl.instrument.name} · ${cl.asset.title}` : cl.instrument.name,
      typeId: cl.instrument.typeId,
      organizationId: cl.instrument.organizationId,
      tax: cl.realized * rate,
      fixed: true,
    });
  }
  return rows.sort((a, b) => b.tax - a.tax);
}

export interface TaxByOrganizationRow {
  key: string;
  name: string;
  color: string;
  logo?: string;
  customImageUri?: string;
  /** См. TaxByInstrumentRow.tax — сумма той же величины по всем активам площадки. */
  tax: number;
  /** См. TaxByInstrumentRow.taxToDate — сумма только там, где она определена
   *  (у активных бессрочных); если на площадке таких нет, поля вообще не будет. */
  taxToDate?: number;
  /** См. TaxByInstrumentRow.fixed — true только если ВСЕ активы площадки
   *  фиксированные (срочные/закрытые); один бессрочный в составе площадки
   *  делает итог по ней уже не фиксированным. */
  fixed: boolean;
}

/** То же самое, что taxByInstrument, но сгруппировано по площадке (организации)
 *  вместо актива — та же методика расчёта на каждую строку перед суммированием. */
export function taxByOrganization(data: AppData, now: Date = new Date()): TaxByOrganizationRow[] {
  const orgById = new Map(data.organizations.map((o) => [o.id, o]));
  // Копим отдельно «известное на сегодня» (taxToDate у бессрочных, иначе уже
  // точный tax у срочных/закрытых — см. r.taxToDate ?? r.tax в отрисовке) и
  // «итог/прогноз за год» (просто tax) — те же две величины, что и у строки
  // актива, только суммой по всем активам площадки.
  const groups = new Map<string, { known: number; forecast: number; hasToDate: boolean; allFixed: boolean }>();
  for (const r of taxByInstrument(data, now)) {
    const g = groups.get(r.organizationId) ?? { known: 0, forecast: 0, hasToDate: false, allFixed: true };
    g.known += r.taxToDate ?? r.tax;
    g.forecast += r.tax;
    if (r.taxToDate !== undefined) g.hasToDate = true;
    if (!r.fixed) g.allFixed = false;
    groups.set(r.organizationId, g);
  }
  const rows: TaxByOrganizationRow[] = [];
  for (const [orgId, g] of groups) {
    const org = orgById.get(orgId);
    if (!org) continue;
    rows.push({
      key: orgId,
      name: org.name,
      color: org.color,
      logo: org.logo,
      customImageUri: org.customImageUri,
      tax: g.forecast,
      taxToDate: g.hasToDate ? g.known : undefined,
      fixed: g.allFixed,
    });
  }
  return rows.sort((a, b) => b.tax - a.tax);
}

export function analyticsSummary(data: AppData, now: Date = new Date()): AnalyticsSummary {
  const views = buildAssetViews(data, now);
  let totalCapital = 0;
  let incomePerDay = 0;
  let incomePerMonth = 0;
  let incomePerYear = 0;
  let accrued = 0;
  let weightedRate = 0;
  // Доход по группам «удержит банк сам» / «доплатить самому» — это 2 разных
  // правовых режима (см. calcAssetTax), общий необлагаемый лимит делят между
  // собой только активы «доплатить самому»; «удержит банк» считается отдельно,
  // плоско, без лимита вообще — не пропорциональная прикидка, а честный расчёт.
  const selfAnnualPerAsset: number[] = [];
  const selfAccruedPerAsset: number[] = [];
  let withheldAnnual = 0;
  let withheldAccrued = 0;

  let topInstrument: AnalyticsSummary['topInstrument'];
  const orgIncome = new Map<string, { name: string; income: number }>();

  for (const v of views) {
    const c = v.asset.currency;
    const cap = convert(v.derived.currentValue, c, data);
    const incDay = convert(v.derived.incomePerDay, c, data);
    totalCapital += cap;
    incomePerDay += incDay;
    incomePerMonth += convert(v.derived.incomePerMonth, c, data);
    const acc = convert(v.derived.accrued, c, data);
    accrued += acc;
    if (v.asset.taxWithheldByBank) withheldAccrued += acc;
    else selfAccruedPerAsset.push(acc);
    weightedRate += v.derived.currentRate * cap;
    // Для срочных с известным сроком — точная сумма до конца срока/года (см.
    // thisYearTaxableIncome), для бессрочных — по-прежнему экстраполяция «если
    // ставка продержится весь год» (другого способа прикинуть год нет).
    const annual = thisYearTaxableIncome(v.asset, v.instrument, data, now, v.derived.balanceNow, v.derived.currentRate);
    incomePerYear += annual;
    if (v.asset.taxWithheldByBank) withheldAnnual += annual;
    else selfAnnualPerAsset.push(annual);

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

  // Активы, закрытые в этом году, — их реально заработанное добавляем к тем
  // же годовым/накопленным итогам (капитал/ставку/топ-инструмент не трогаем:
  // актива уже нет, дневной ставки у него тоже нет).
  for (const cl of closedThisYearContributions(data, now)) {
    incomePerYear += cl.realized;
    if (cl.asset.taxWithheldByBank) {
      withheldAnnual += cl.realized;
      withheldAccrued += cl.realized;
    } else {
      selfAnnualPerAsset.push(cl.realized);
      selfAccruedPerAsset.push(cl.realized);
    }
  }

  const avgRate = totalCapital > 0 ? weightedRate / totalCapital : 0;
  const selfAccrued = selfAccruedPerAsset.reduce((sum, v) => sum + v, 0);
  // Факт уплаченного — по ВСЕМ активам (даже закрытым/архивным), не только текущим
  // видам: деньги реально ушли независимо от того, жив ли актив сейчас.
  const taxPaidTotal = data.assets.reduce((sum, a) => {
    const paid = (a.balanceAdjustments ?? []).reduce((s, adj) => s + (adj.taxWithheld ?? 0), 0);
    return sum + convert(paid, a.currency, data);
  }, 0);
  const rate = data.params.taxRate / 100;
  const taxYearSelf = calcPortfolioTax(selfAnnualPerAsset, data.params);
  const taxYearWithheld = calcAssetTax(withheldAnnual, data.params, 0, true);
  const taxYear = taxYearSelf + taxYearWithheld;
  const taxAccruedSelf = calcPortfolioTax(selfAccruedPerAsset, data.params);
  const taxAccruedWithheld = calcAssetTax(withheldAccrued, data.params, 0, true);
  const taxAccrued = taxAccruedSelf + taxAccruedWithheld;
  // «Грязный» вариант (без лимита) — та же плоская ставка×доход методика,
  // что и в taxByInstrument, чтобы сумма списка сходилась с заголовком.
  const taxYearSelfGross = selfAnnualPerAsset.reduce((sum, v) => sum + v, 0) * rate;
  const taxYearGross = taxYearSelfGross + taxYearWithheld;
  const taxAccruedSelfGross = selfAccruedPerAsset.reduce((sum, v) => sum + v, 0) * rate;
  const taxAccruedGross = taxAccruedSelfGross + taxAccruedWithheld;
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
    selfAccrued,
    taxYear,
    taxAccrued,
    taxAccruedWithheld,
    taxAccruedSelf,
    taxYearWithheld,
    taxYearSelf,
    taxYearGross,
    taxYearSelfGross,
    taxAccruedGross,
    taxPaidTotal,
    netYear: incomePerYear - taxYear,
    avgRate,
    keyRate: data.params.keyRate,
    premiumToKeyRate: avgRate - data.params.keyRate,
    incomePerMillionYear: totalCapital > 0 ? (incomePerYear / totalCapital) * 1_000_000 : 0,
    topInstrument,
    topOrganization,
  };
}

export interface RateSpread {
  min: number;
  max: number;
}

/** Разброс текущих ставок по активным активам — самая высокая и самая низкая. */
export function rateSpread(data: AppData, now: Date = new Date()): RateSpread | null {
  const views = buildAssetViews(data, now);
  if (views.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of views) {
    const r = v.derived.currentRate;
    if (r < min) min = r;
    if (r > max) max = r;
  }
  return { min, max };
}

/**
 * Средневзвешенный (по текущей стоимости) срок до планового окончания срочных
 * активов — насколько «заморожен» капитал прямо сейчас. Бессрочные инструменты
 * (вклады/накопительные без endDate — derived.daysRemaining === undefined) в
 * расчёт не входят: у них нет понятия «срок», а не «срок = 0».
 */
export function avgLockDuration(data: AppData, now: Date = new Date()): number | null {
  const views = buildAssetViews(data, now);
  let weightedDays = 0;
  let capital = 0;
  for (const v of views) {
    if (v.derived.daysRemaining === undefined || v.derived.daysRemaining <= 0) continue;
    const cap = convert(v.derived.currentValue, v.asset.currency, data);
    weightedDays += v.derived.daysRemaining * cap;
    capital += cap;
  }
  return capital > 0 ? weightedDays / capital : null;
}

/**
 * «Проценты на проценты» — сколько именно реинвестирование добавило сверх
 * простого %, только по активам с капитализацией. Считаем не приближённой
 * формулой, а честно через движок: пересчитываем тот же актив с
 * capitalization:'none' (остальное — ставка, пополнения, даты — то же самое)
 * и берём разницу currentValue. Без учёта «нашей базы» (тела вклада) —
 * ровно то, что попросили: эффект капитализации, не весь заработок.
 */
export function capitalizationBonus(data: AppData, now: Date = new Date()): number {
  const views = buildAssetViews(data, now);
  let bonus = 0;
  for (const v of views) {
    const mode = v.asset.capitalization ?? v.instrument.capitalization ?? 'none';
    if (mode !== 'capitalize') continue;
    const simpleDerived = calculate({ ...v.asset, capitalization: 'none' }, v.instrument, data.params, now, 0);
    bonus += convert(Math.max(0, v.derived.currentValue - simpleDerived.currentValue), v.asset.currency, data);
  }
  return bonus;
}

// ---------- Ликвидность ----------

export interface LiquidityFrozenItem {
  assetId: string;
  instrumentName: string;
  title?: string;
  typeId: string;
  color: string;
  logo?: string;
  customImageUri?: string;
  amount: number; // в валюте актива — сумма к освобождению (итог на конец срока)
  amountBase: number; // то же в основной валюте
  currency: CurrencyCode;
  unlockDate: string;
  daysRemaining: number;
  /** прогресс срока 0..1 — для мини-кольца в списке (тот же расчёт, что и в «Ближайших событиях») */
  termProgress: number;
}

export interface Liquidity {
  liquid: number; // доступно снять сейчас без потери % (основная валюта)
  frozen: number; // заморожено до срока (основная валюта)
  frozenItems: LiquidityFrozenItem[]; // отсортированы по ближайшей дате разморозки
}

/**
 * Бессрочные инструменты (накопительные счета) можно снять в любой момент
 * без потери процентов — «доступно сейчас». Срочные (вклады, облигации, ЦФА
 * до погашения) при досрочном закрытии обычно теряют процент банка/эмитента —
 * «заморожено», независимо от allowPartialWithdraw (то разрешает частичное
 * снятие суммы, но не гарантирует сохранение ставки — решили не усложнять).
 * Срочный актив, у которого срок уже прошёл (daysRemaining <= 0), — фактически
 * доступен, как и бессрочный.
 */
export function liquidity(data: AppData, now: Date = new Date()): Liquidity {
  const views = buildAssetViews(data, now);
  let liquid = 0;
  let frozen = 0;
  const frozenItems: LiquidityFrozenItem[] = [];
  for (const v of views) {
    const cap = convert(v.derived.currentValue, v.asset.currency, data);
    const isFrozen = v.instrument.behavior === 'term' && (v.derived.daysRemaining ?? 0) > 0;
    if (isFrozen) {
      frozen += cap;
      const amount = v.derived.finalAmount ?? v.derived.currentValue;
      frozenItems.push({
        assetId: v.asset.id,
        instrumentName: v.instrument.name,
        title: v.asset.title,
        typeId: v.instrument.typeId,
        color: v.organization.color,
        logo: v.organization.logo,
        customImageUri: v.organization.customImageUri,
        amount,
        amountBase: convert(amount, v.asset.currency, data),
        currency: v.asset.currency,
        unlockDate: v.asset.endDate ?? now.toISOString().slice(0, 10),
        daysRemaining: v.derived.daysRemaining ?? 0,
        termProgress: v.derived.termProgress ?? 0,
      });
    } else {
      liquid += cap;
    }
  }
  frozenItems.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return { liquid, frozen, frozenItems };
}

export interface Insight {
  icon: string;
  title: string;
  text: string;
}

// Родительный падеж множественного числа для «среди ваших ___» — typeLabel()
// даёт именительный («Вклады»), тут отдельно, под другой синтаксис.
const TYPE_LABEL_GENITIVE: Record<string, string> = {
  deposit: 'вкладов',
  savings: 'накопительных счетов',
  bond: 'облигаций',
  dfa: 'ЦФА',
};

/**
 * Лучшая площадка по ставке СРЕДИ СВОЕГО ЖЕ ТИПА инструмента (вклад
 * сравниваем с вкладом, не с облигацией — иначе сравнение нечестное).
 * Порог 10% разницы — иначе это шум, а не инсайт. null, если сравнивать
 * не с чем (меньше 2 площадок с этим типом) или разрыва нет.
 */
function bestOrgByType(data: AppData, views: AssetView[]): { typeId: string; orgName: string; deltaPct: number } | null {
  const byType = new Map<string, Map<string, { orgId: string; orgName: string; capital: number; weightedRate: number }>>();
  for (const v of views) {
    const cap = convert(v.derived.currentValue, v.asset.currency, data);
    if (cap <= 0) continue;
    const typeId = v.instrument.typeId;
    const orgMap = byType.get(typeId) ?? new Map();
    const agg = orgMap.get(v.organization.id) ?? { orgId: v.organization.id, orgName: v.organization.name, capital: 0, weightedRate: 0 };
    agg.capital += cap;
    agg.weightedRate += v.derived.currentRate * cap;
    orgMap.set(v.organization.id, agg);
    byType.set(typeId, orgMap);
  }

  let best: { typeId: string; orgName: string; deltaPct: number } | null = null;
  for (const [typeId, orgMap] of byType) {
    const orgs = [...orgMap.values()].filter((o) => o.capital > 0).map((o) => ({ ...o, avgRate: o.weightedRate / o.capital }));
    if (orgs.length < 2) continue;
    const top = orgs.reduce((a, b) => (b.avgRate > a.avgRate ? b : a));
    const rest = orgs.filter((o) => o.orgId !== top.orgId);
    const restCapital = rest.reduce((sum, o) => sum + o.capital, 0);
    if (restCapital <= 0) continue;
    const restAvgRate = rest.reduce((sum, o) => sum + o.avgRate * o.capital, 0) / restCapital;
    if (restAvgRate <= 0) continue;
    const deltaPct = ((top.avgRate - restAvgRate) / restAvgRate) * 100;
    if (deltaPct < 10) continue;
    if (!best || deltaPct > best.deltaPct) best = { typeId, orgName: top.orgName, deltaPct };
  }
  return best;
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

  // 2. лучшая площадка по ставке (в рамках своего типа инструмента)
  const orgBest = bestOrgByType(data, views);
  if (orgBest) {
    out.push({
      icon: 'emoji-events',
      title: `${orgBest.orgName} приносит на ${Math.round(orgBest.deltaPct)}% больше`,
      text: `среди ваших ${TYPE_LABEL_GENITIVE[orgBest.typeId] ?? 'активов'}`,
    });
  }

  // 3. средняя ставка vs ключевая
  const s = analyticsSummary(data, now);
  if (views.length > 0) {
    if (s.premiumToKeyRate >= 0) {
      out.push({
        icon: 'trending-up',
        title: 'Портфель обгоняет ключевую',
        text: `Средняя ставка ${s.avgRate.toFixed(1).replace('.', ',')}% — это +${s.premiumToKeyRate.toFixed(1).replace('.', ',')}% к ключевой ставке ЦБ.`,
      });
    } else {
      out.push({
        icon: 'trending-down',
        title: 'Доходность ниже ключевой',
        text: `Средняя ставка портфеля ниже ключевой на ${Math.abs(s.premiumToKeyRate).toFixed(1).replace('.', ',')}%. Возможно, стоит пересмотреть инструменты.`,
      });
    }
  }

  // 4. свободный капитал простаивает — только если задан вручную «капитал вне
  // активов» и там реально лежит заметная доля (от 10%), иначе шум.
  const manualTotal = manualTotalCapitalConverted(data);
  if (manualTotal && manualTotal > 0) {
    const orgTotal = distributionByOrg(data, now).total;
    const free = Math.max(0, manualTotal - orgTotal);
    if (free / manualTotal >= 0.1) {
      out.push({
        icon: 'savings',
        title: 'Есть свободный капитал',
        text: `${Math.round(free).toLocaleString('ru-RU')} ${CURRENCY_SYMBOL[data.settings.defaultCurrency]} ещё не работает — можно разместить и получать доход.`,
      });
    }
  }

  // 5. концентрация в одной площадке — риск, что всё в одном месте. Только
  // если площадок хотя бы 2 (иначе «риск» — это просто факт, что у вас один
  // банк, не инсайт) и на лидера приходится больше 60%.
  const orgDist = distributionByOrg(data, now);
  if (orgDist.groups.length >= 2 && orgDist.total > 0) {
    const top = orgDist.groups[0]; // groups уже отсортированы по капиталу (см. distribution())
    const topShare = top.capital / orgDist.total;
    if (topShare >= 0.6) {
      out.push({
        icon: 'warning',
        title: 'Капитал сосредоточен в одном месте',
        text: `${Math.round(topShare * 100)}% в «${top.label}» — если с площадкой что-то случится, риск выше.`,
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

/**
 * Примерный налог за месяц (не факт, тот же дух, что и monthlyIncomeForecast) —
 * доход месяца по каждому активу, поделённый на «доплатить самому»/«удержит банк»
 * (см. calcAssetTax), лимит на самостоятельную группу берём «с нуля» (не учитывает,
 * сколько лимита уже съедено в другие месяцы года) — оценка, не точный расчёт.
 */
export function monthlyTaxForecast(data: AppData, year: number, month: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const instrById = new Map(data.instruments.map((i) => [i.id, i]));
  const assets = data.assets.filter((a) => a.status === 'active');

  let selfIncome = 0;
  let withheldIncome = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d);
    for (const asset of assets) {
      const instrument = instrById.get(asset.instrumentId);
      if (!instrument) continue;
      const open = parseLocal(asset.openDate);
      const end = asset.endDate ? parseLocal(asset.endDate) : null;
      if (open > day || (end && day > end)) continue;

      const derived = calculate(asset, instrument, data.params, day);
      const incDay = convert(derived.incomePerDay, asset.currency, data);
      if (asset.taxWithheldByBank) withheldIncome += incDay;
      else selfIncome += incDay;
    }
  }

  return calcTax(selfIncome, data.params, 0) + calcAssetTax(withheldIncome, data.params, 0, true);
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
  /** периодическая (не ежедневная) выплата наступает именно в этот день — «заберите» */
  isPayoutDay: boolean;
  /** сколько всего заработано (проценты, не тело) с даты открытия по эту дату */
  accrued: number;
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

    // Периодическая выплата (мес./кв./полугодие/год) — та же арифметика, что и точки
    // в календаре: считаем именно день пересечения границы периода, не каждый день.
    const payout = v.asset.payoutPeriod ?? v.instrument.payoutPeriod;
    let isPayoutDay = false;
    if (!isEndDay && payout && payout !== 'daily' && payout !== 'end') {
      const ppy = periodsPerYear(payout);
      const elapsedToday = diffDays(v.asset.openDate, day);
      if (elapsedToday > 0) {
        const periodToday = Math.floor((elapsedToday * ppy) / 365);
        const periodYesterday = Math.floor(((elapsedToday - 1) * ppy) / 365);
        isPayoutDay = periodToday > periodYesterday;
      }
    }

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
      isPayoutDay,
      accrued: v.derived.accrued,
    });
  }
  // Активы с плашкой (реальная выплата/погашение сегодня) — первыми в списке.
  return out.sort((a, b) => {
    const aEvent = a.isEndDay || a.isPayoutDay;
    const bEvent = b.isEndDay || b.isPayoutDay;
    if (aEvent !== bEvent) return aEvent ? -1 : 1;
    return b.incomePerDayBase - a.incomePerDayBase;
  });
}

/**
 * Состояние счёта по дням — честная сумма (тело + начисленное, см. currentValue),
 * от открытия до сегодня. В отличие от assetIncomeSeries НЕ монотонна: реальные
 * снятия видно как провал, пополнения — как скачок вверх, а не сглаженную кривую.
 * Работает при ЛЮБОМ режиме/периоде (ограничений, как у assetBalanceSeries, нет).
 *
 * Точки — не просто равномерный шаг: даты реальных корректировок баланса ВСЕГДА
 * попадают в выборку явно (иначе округление шага может «съесть» ровно тот день,
 * когда был провал/скачок, и график соврёт, показав плато). Между ними — равномерные
 * точки для гладкости. Общее число ограничено maxPoints — по умолчанию под маленький
 * виджет (широкий график может передать своё значение).
 */
export function assetValueSeries(data: AppData, assetId: string, maxPoints = 30): number[] {
  const asset = data.assets.find((a) => a.id === assetId);
  if (!asset) return [];
  const instrument = data.instruments.find((i) => i.id === asset.instrumentId);
  if (!instrument) return [];

  const start = parseLocal(asset.openDate);
  const today = new Date();
  const end = asset.endDate ? parseLocal(asset.endDate) : null;
  const last = end && end < today ? end : today;

  const totalDays = Math.max(0, diffDays(start, last));
  const step = Math.max(1, Math.ceil(totalDays / maxPoints));

  const offsets = new Set<number>();
  for (let k = 0; k <= totalDays; k += step) offsets.add(k);
  offsets.add(totalDays);
  // Даты реальных корректировок — гарантированно в выборке, не полагаемся на шаг.
  for (const adj of asset.balanceAdjustments ?? []) {
    const k = diffDays(start, parseLocal(adj.date));
    if (k >= 0 && k <= totalDays) offsets.add(k);
  }

  const sorted = [...offsets].sort((a, b) => a - b);
  return sorted.map((k) => {
    const day = new Date(start);
    day.setDate(day.getDate() + k);
    return calculate(asset, instrument, data.params, day).currentValue;
  });
}

export interface AssetTimelineEntry {
  type: 'open' | 'balance' | 'rate';
  /** undefined только у 'open' — это не корректировка, а точка открытия */
  id?: string;
  date: string;
  comment?: string;
  /** для 'open' — сумма/ставка на момент открытия; для 'balance' — сумма после корректировки; для 'rate' — ставка после изменения */
  amount?: number;
  rate?: number;
  /** дельта относительно ПРЕДЫДУЩЕЙ точки ТОГО ЖЕ типа (баланс и ставка — независимые линии) */
  amountDelta?: number;
  rateDelta?: number;
  /** см. BalanceAdjustment.isCorrection — только для 'balance' */
  isCorrection?: boolean;
  /** см. BalanceAdjustment.taxWithheld — только для 'balance' (снятие) */
  taxWithheld?: number;
}

/**
 * Объединённая история актива — баланс и ставка меняются независимо друг от
 * друга (решение: RateAdjustment симметричен BalanceAdjustment), но на детальной
 * карточке актива их удобнее видеть одной лентой, а не в 2 разных экранах.
 * Дельта каждой записи считается относительно предыдущей точки СВОЕГО типа,
 * а не соседней по дате записи другого типа.
 */
export function assetTimeline(asset: Asset): AssetTimelineEntry[] {
  const balancePoints = [
    { date: asset.openDate, amount: asset.amount },
    ...(asset.balanceAdjustments ?? []).map((a) => ({ id: a.id, date: a.date, amount: a.amount, comment: a.comment, isCorrection: a.isCorrection, taxWithheld: a.taxWithheld })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const ratePoints = [
    { date: asset.openDate, rate: asset.rate },
    ...(asset.rateAdjustments ?? []).map((r) => ({ id: r.id, date: r.date, rate: r.rate, comment: r.comment })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const entries: AssetTimelineEntry[] = [
    { type: 'open', date: asset.openDate, amount: asset.amount, rate: asset.rate },
  ];

  for (let i = 1; i < balancePoints.length; i++) {
    const p = balancePoints[i] as (typeof balancePoints)[number] & { id: string; comment?: string; isCorrection?: boolean; taxWithheld?: number };
    entries.push({
      type: 'balance',
      id: p.id,
      date: p.date,
      comment: p.comment,
      amount: p.amount,
      amountDelta: p.amount - balancePoints[i - 1].amount,
      isCorrection: p.isCorrection,
      taxWithheld: p.taxWithheld,
    });
  }
  for (let i = 1; i < ratePoints.length; i++) {
    const p = ratePoints[i] as (typeof ratePoints)[number] & { id: string; comment?: string };
    entries.push({
      type: 'rate',
      id: p.id,
      date: p.date,
      comment: p.comment,
      rate: p.rate,
      rateDelta: p.rate - ratePoints[i - 1].rate,
    });
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export type HeroWindow = number | 'all' | 'year';

interface HistoryItem {
  asset: Asset;
  instrument: FinancialInstrument;
  openDate: Date;
  /** Дата РЕАЛЬНОГО закрытия (последний снапшот), не плановый endDate — null, если ещё активен. */
  closedAt: Date | null;
}

/** Активы (любого статуса) + дата их реального открытия/закрытия — общая база
 *  для всех реконструкций «капитал/доход по дням из первичных данных». */
function buildHistoryItems(data: AppData, now: Date): { items: HistoryItem[]; earliestOpen: number } {
  const instrById = new Map(data.instruments.map((i) => [i.id, i]));
  const closedAtById = new Map<string, string>();
  for (const s of data.snapshots) {
    const prev = closedAtById.get(s.assetId);
    if (!prev || s.createdAt > prev) closedAtById.set(s.assetId, s.createdAt);
  }

  const items = data.assets
    .map((asset): HistoryItem | null => {
      const instrument = instrById.get(asset.instrumentId);
      if (!instrument) return null;
      const openDate = parseLocal(asset.openDate);
      const closedAt = asset.status !== 'active' ? new Date(closedAtById.get(asset.id) ?? now) : null;
      return { asset, instrument, openDate, closedAt };
    })
    .filter((x): x is HistoryItem => x !== null);

  const opens = items.map((it) => it.openDate.getTime());
  const earliestOpen = opens.length ? Math.min(...opens) : now.getTime();
  return { items, earliestOpen };
}

/**
 * Начало периода: `days` число — скользящее окно N дней назад (напр. «Месяц» — 30);
 * `'year'` — КАЛЕНДАРНЫЙ год (1 января текущего года — сегодня), не диапазон
 * в 365 дней — так график совпадает с будущим годовым снапшотом (2026 — это
 * ровно 2026-й, а не последние 365 дней от сегодня); `'all'` — с даты открытия
 * самого первого актива. Ни один режим не уходит в прошлое дальше даты
 * открытия первого актива — иначе при истории короче периода получается
 * искусственно «мёртвая» зона там, где портфеля ещё физически не было.
 */
function resolvePeriodStart(days: HeroWindow, now: Date, earliestOpen: number): Date {
  if (days === 'all') return new Date(earliestOpen);
  if (days === 'year') {
    const jan1 = new Date(now.getFullYear(), 0, 1);
    return new Date(Math.max(jan1.getTime(), earliestOpen));
  }
  const rollingStart = new Date(now);
  rollingStart.setDate(rollingStart.getDate() - (days - 1));
  return new Date(Math.max(rollingStart.getTime(), earliestOpen));
}

/**
 * Реконструкция РЕАЛЬНОГО капитала по дням (тело + начисленные проценты на каждый
 * день, а не только тело) — решение #9: из первичных данных, а не снимков.
 * Учитывает и уже закрытые/архивные активы за те дни, когда они были живы —
 * иначе прошлое занижается всякий раз, когда что-то закрывают.
 */
export function capitalHistorySeries(data: AppData, days: HeroWindow, now: Date = new Date()): number[] {
  const { items, earliestOpen } = buildHistoryItems(data, now);
  const start = resolvePeriodStart(days, now, earliestOpen);

  const totalDays = Math.max(0, diffDays(start, now));
  const out: number[] = [];
  for (let k = 0; k <= totalDays; k++) {
    const day = new Date(start);
    day.setDate(day.getDate() + k);
    let cap = 0;
    for (const { asset, instrument, openDate, closedAt } of items) {
      if (openDate > day) continue;
      if (closedAt && closedAt < day) continue;
      cap += convert(calculate(asset, instrument, data.params, day, 0).currentValue, asset.currency, data);
    }
    out.push(cap);
  }
  return out;
}

/**
 * Сколько реально ЗАРАБОТАНО (начисленные проценты, `accrued`) именно за
 * выбранный период — в отличие от `capitalHistorySeries`, тут пополнения и
 * снятия тела не в счёт, только сам доход. Разница `accrued` на конец и на
 * начало периода по каждому активу (для активов, открытых внутри периода —
 * от даты открытия, т.к. до неё их не существовало).
 */
export function earnedInPeriod(data: AppData, days: HeroWindow, now: Date = new Date()): number {
  const { items, earliestOpen } = buildHistoryItems(data, now);
  const start = resolvePeriodStart(days, now, earliestOpen);

  let earned = 0;
  for (const { asset, instrument, openDate, closedAt } of items) {
    const end = closedAt && closedAt < now ? closedAt : now;
    if (end < start || openDate > end) continue;
    const effectiveStart = openDate > start ? openDate : start;
    const endAccrued = calculate(asset, instrument, data.params, end, 0).accrued;
    const startAccrued = calculate(asset, instrument, data.params, effectiveStart, 0).accrued;
    earned += convert(endAccrued - startAccrued, asset.currency, data);
  }
  return earned;
}

function incomeRunRateOn(data: AppData, day: Date): number {
  const instrById = new Map(data.instruments.map((i) => [i.id, i]));
  let sum = 0;
  for (const a of data.assets) {
    if (a.status !== 'active') continue;
    const instrument = instrById.get(a.instrumentId);
    if (!instrument) continue;
    if (isPastYearMatured(a, instrument, day)) continue;
    if (parseLocal(a.openDate) > day) continue;
    if (a.endDate && parseLocal(a.endDate) < day) continue;
    const derived = calculate(a, instrument, data.params, day, 0);
    sum += convert(derived.incomePerDay, a.currency, data);
  }
  return sum;
}

/** История текущего дневного дохода: учитывает пополнения/снятия и изменения ставок. */
export function incomeRunRateSeries(data: AppData, days = 30, now: Date = new Date()): number[] {
  const series: number[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const day = new Date(now);
    day.setDate(day.getDate() - k);
    series.push(incomeRunRateOn(data, day));
  }
  return series;
}

/**
 * Средний темп дохода в двух соседних окнах по `windowDays` — не точка «ровно
 * N дней назад» против точки «сегодня» (которая целиком зависит от того, в
 * какой именно день внутри периода случилось разовое событие — пополнение,
 * правка ставки), а средняя тенденция по каждому куску времени целиком.
 */
export function incomePaceWindows(
  data: AppData,
  windowDays = 30,
  now: Date = new Date(),
): { prev: number; now: number } {
  const series = incomeRunRateSeries(data, windowDays * 2, now);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return { prev: avg(series.slice(0, windowDays)), now: avg(series.slice(windowDays)) };
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
  const cap = capitalHistorySeries(data, 31);
  return {
    capitalNow: cap[cap.length - 1] ?? 0,
    capitalPrev: cap[0] ?? 0,
    incomeNow: incomeRunRateOn(data, now),
    incomePrev: incomeRunRateOn(data, prev),
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

/** Ключевая ставка на дату `at` (последняя точка не позже неё). История — «новые сверху». */
function keyRateAt(history: KeyRatePoint[], at: string): number {
  let cur = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].date <= at) cur = history[i].rate;
    else break;
  }
  return cur;
}

/** Максимальная ключевая ставка на 1-е число любого месяца года `year` — по НК так считается лимит года. */
function maxKeyRateForYear(history: KeyRatePoint[], year: number): number {
  const ascending = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let max = 0;
  for (let month = 1; month <= 12; month++) {
    const d = `${year}-${String(month).padStart(2, '0')}-01`;
    max = Math.max(max, keyRateAt(ascending, d));
  }
  return max;
}

/**
 * Фиксирует налоговую статистику за календарный ГОД: считаем доход каждого
 * актива, заработанный именно В ГРАНИЦАХ этого года (не с открытия), делим
 * на «удержит банк сам» / «доплатить самому» по флагу актива. Лимит — по
 * максимальной ключевой ставке года (не текущей!), чтобы не «плыл» задним числом.
 */
export function computeTaxYearRecord(data: AppData, year: number): TaxYearRecord {
  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const yearParams = { ...data.params };

  const instrById = new Map(data.instruments.map((i) => [i.id, i]));
  let withheldIncome = 0;
  let selfIncome = 0;

  for (const asset of data.assets) {
    if (asset.isDemo) continue;
    const instrument = instrById.get(asset.instrumentId);
    if (!instrument) continue;
    const before = calculate(asset, instrument, yearParams, jan1).earnedSoFar;
    const after = calculate(asset, instrument, yearParams, dec31).earnedSoFar;
    const income = convert(Math.max(0, after - before), asset.currency, data);
    if (income <= 0) continue;
    if (asset.taxWithheldByBank) withheldIncome += income;
    else selfIncome += income;
  }

  const keyRateUsed = maxKeyRateForYear(data.keyRateHistory, year);
  const taxFreeLimit = (1_000_000 * keyRateUsed) / 100;
  const taxableIncome = withheldIncome + selfIncome;
  // Лимит года — льгота только для «доплатить самому»; «удержит банк» считается
  // отдельно и плоско (свой правовой режим, см. calcAssetTax), не пропорцией.
  const taxToPaySelf = calcTax(selfIncome, { ...yearParams, taxFreeLimit });
  const taxWithheld = calcAssetTax(withheldIncome, yearParams, 0, true);
  const taxDue = taxToPaySelf + taxWithheld;

  return {
    id: uid('taxyr-'),
    year,
    createdAt: new Date().toISOString(),
    keyRateUsed,
    taxFreeLimit,
    taxableIncome,
    taxDue,
    taxWithheld,
    taxToPaySelf,
  };
}
