import type {
  Asset,
  CalcParams,
  CapitalizationMode,
  DerivedValues,
  FinancialInstrument,
  PayoutPeriod,
} from '@/domain/types';
import { calcTax } from './tax';
import { clamp, daysInMonth, daysInYear, diffDays, parseLocal } from './dayCount';

/** Версия движка — пишется в Snapshot, чтобы история не «плыла» при смене формул. */
export const ENGINE_VERSION = '1.0.0';

export function periodsPerYear(period: PayoutPeriod | undefined): number {
  switch (period) {
    case 'daily': return 365;
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semiannual': return 2;
    case 'annual': return 1;
    default: return 12; // разумный дефолт для капитализации
  }
}

interface BalancePoint {
  date: string; // ISO 'YYYY-MM-DD'
  amount: number;
}

/**
 * Точки изменения баланса (открытие + пополнения/снятия), отсортированные по дате.
 * Открытие — всегда первая точка, даже если корректировок нет.
 */
function balanceTimeline(asset: Asset): BalancePoint[] {
  const points: BalancePoint[] = [
    { date: asset.openDate, amount: asset.amount },
    ...(asset.balanceAdjustments ?? []).map((a) => ({ date: a.date, amount: a.amount })),
  ];
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Последняя точка баланса на дату `now` или раньше — «якорь», от которого считаем дальше. */
function anchorAt(timeline: BalancePoint[], now: string | Date): BalancePoint {
  let anchor = timeline[0];
  for (const p of timeline) {
    if (diffDays(p.date, now) >= 0) anchor = p;
    else break;
  }
  return anchor;
}

/** Эффективная база актива на момент `now` — от ПОСЛЕДНЕЙ известной точки баланса. */
function currentBalance(
  timeline: BalancePoint[],
  mode: CapitalizationMode,
  payout: PayoutPeriod | undefined,
  rate: number,
  now: string | Date,
): number {
  const anchor = anchorAt(timeline, now);
  if (mode !== 'capitalize') return anchor.amount;
  const ppy = periodsPerYear(payout);
  const elapsedDays = Math.max(0, diffDays(anchor.date, now));
  const elapsedPeriods = Math.floor((elapsedDays * ppy) / 365);
  const periodRate = rate / 100 / ppy;
  return anchor.amount * Math.pow(1 + periodRate, elapsedPeriods);
}

/**
 * Сколько всего заработано (проценты, не тело) от открытия до `now` — посегментно
 * между корректировками баланса. Капитализация — рост баланса внутри сегмента
 * (пополнение само по себе не «доход»); простой процент — плоско по каждому сегменту.
 */
function accruedInterest(
  timeline: BalancePoint[],
  mode: CapitalizationMode,
  payout: PayoutPeriod | undefined,
  rate: number,
  now: string | Date,
): number {
  let total = 0;
  for (let i = 0; i < timeline.length; i++) {
    const point = timeline[i];
    const daysToNow = diffDays(point.date, now);
    if (daysToNow <= 0) continue;
    const next = timeline[i + 1];
    const daysToNext = next ? diffDays(point.date, next.date) : Infinity;
    const segmentDays = Math.min(daysToNow, daysToNext);
    if (segmentDays <= 0) continue;

    if (mode === 'capitalize') {
      const ppy = periodsPerYear(payout);
      const elapsedPeriods = Math.floor((segmentDays * ppy) / 365);
      const periodRate = rate / 100 / ppy;
      total += point.amount * (Math.pow(1 + periodRate, elapsedPeriods) - 1);
    } else {
      total += point.amount * (rate / 100) * (segmentDays / 365);
    }
  }
  return total;
}

/**
 * Главная функция движка. Возвращает производные значения для актива.
 * `now` — текущий момент (по умолчанию устройство).
 */
export function calculate(
  asset: Asset,
  instrument: FinancialInstrument,
  params: CalcParams,
  now: string | Date = new Date(),
  /** сколько необлагаемого лимита уже занято другими активами портфеля (см. buildAssetViews) */
  limitAlreadyUsed = 0,
): DerivedValues {
  const annualRate = asset.rate / 100;
  const mode: CapitalizationMode =
    asset.capitalization ?? instrument.capitalization ?? 'none';
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const timeline = balanceTimeline(asset);

  const balanceNow = currentBalance(timeline, mode, payout, asset.rate, now);
  const incomePerDay = (balanceNow * annualRate) / daysInYear(now);
  // Прогноз вперёд (месяц/год) — от ТЕКУЩЕГО баланса, а не от суммы открытия:
  // при капитализации проценты уже легли на баланс и сами приносят доход.
  const annualRunRate = balanceNow * annualRate;
  // Месяц — по факту дней в ТЕКУЩЕМ календарном месяце (как считают банки:
  // прогноз «за июль» = дневной доход × 31, а не среднемесячное /12).
  const incomePerMonth = incomePerDay * daysInMonth(now);
  const premiumToKeyRate = asset.rate - params.keyRate;

  // Налог на месяц: считаем эффективную (после общего лимита) годовую ставку
  // налога и переносим её на месячный доход — та же логика, что и «доход».
  const annualTax = calcTax(annualRunRate, params, limitAlreadyUsed);
  const effectiveTaxRate = annualRunRate > 0 ? annualTax / annualRunRate : 0;
  const monthlyTax = incomePerMonth * effectiveTaxRate;
  const monthlyNet = incomePerMonth - monthlyTax;

  if (instrument.behavior === 'term' && asset.endDate) {
    const termDays = Math.max(0, diffDays(asset.openDate, asset.endDate));
    const elapsedDays = clamp(diffDays(asset.openDate, now), 0, termDays);
    const daysRemaining = Math.max(0, diffDays(now, asset.endDate));
    const termProgress = termDays > 0 ? elapsedDays / termDays : 0;

    // Простой процент (по умолчанию): доход линеен по дням.
    const incomeTotalTerm = asset.amount * annualRate * (termDays / 365);
    // «Уже заработано» — посегментно, чтобы честно учитывать пополнения/снятия.
    const accrualNow = diffDays(asset.openDate, now) > termDays ? asset.endDate : now;
    const earnedSoFar = accruedInterest(timeline, mode, payout, asset.rate, accrualNow);
    const remainingToEarn = Math.max(0, incomeTotalTerm - earnedSoFar);

    // Налог считается на доход всего срока (проценты по вкладу облагаются в год выплаты).
    const tax = calcTax(incomeTotalTerm, params, limitAlreadyUsed);
    const net = incomeTotalTerm - tax;
    const finalAmount = asset.amount + net;

    return {
      balanceNow,
      incomePerDay,
      incomePerMonth,
      incomeTotalTerm,
      accrued: earnedSoFar,
      tax,
      net,
      monthlyTax,
      monthlyNet,
      finalAmount,
      earnedSoFar,
      remainingToEarn,
      daysRemaining,
      termProgress,
      premiumToKeyRate,
    };
  }

  // Бессрочный (накопительный счёт): нет срока/прогресса.
  const earnedSoFar = accruedInterest(timeline, mode, payout, asset.rate, now);
  const tax = calcTax(earnedSoFar, params, limitAlreadyUsed);
  const net = earnedSoFar - tax;

  return {
    balanceNow,
    incomePerDay,
    incomePerMonth,
    accrued: earnedSoFar,
    tax,
    net,
    monthlyTax,
    monthlyNet,
    earnedSoFar,
    premiumToKeyRate,
    // Прогноз «если ничего не менять»
    forecastNextMonth: incomePerMonth,
    forecastNextYear: annualRunRate,
  };
}
