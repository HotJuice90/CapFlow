import type {
  Asset,
  CalcParams,
  CapitalizationMode,
  DerivedValues,
  FinancialInstrument,
  PayoutPeriod,
} from '@/domain/types';
import { calcAssetTax } from './tax';
import { clamp, daysInMonth, daysInYear, diffDays, parseLocal } from './dayCount';

/** Версия движка — пишется в Snapshot, чтобы история не «плыла» при смене формул. */
export const ENGINE_VERSION = '1.1.0';

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
  /** см. BalanceAdjustment.isCorrection — точка открытия им никогда не бывает */
  isCorrection?: boolean;
}

interface RatePoint {
  date: string; // ISO 'YYYY-MM-DD'
  rate: number; // годовая ставка, %
}

/**
 * Точки изменения баланса (открытие + пополнения/снятия), отсортированные по дате.
 * Открытие — всегда первая точка, даже если корректировок нет.
 */
function balanceTimeline(asset: Asset): BalancePoint[] {
  const points: BalancePoint[] = [
    { date: asset.openDate, amount: asset.amount },
    ...(asset.balanceAdjustments ?? []).map((a) => ({ date: a.date, amount: a.amount, isCorrection: a.isCorrection })),
  ];
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Точки изменения СТАВКИ (открытие + история изменений) — тот же принцип, что
 * и у баланса, только банк меняет не сумму, а процент (актуально для НС).
 */
function rateTimeline(asset: Asset): RatePoint[] {
  const points: RatePoint[] = [
    { date: asset.openDate, rate: asset.rate },
    ...(asset.rateAdjustments ?? []).map((r) => ({ date: r.date, rate: r.rate })),
  ];
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Ставка, действующая на дату `at` (последняя точка ставки не позже `at`). */
function rateAt(timeline: RatePoint[], at: string | Date): number {
  let cur = timeline[0].rate;
  for (const p of timeline) {
    if (diffDays(p.date, at) >= 0) cur = p.rate;
    else break;
  }
  return cur;
}

/**
 * Единый проход по ОБЪЕДИНЁННЫМ границам баланса И ставки — считает и текущее
 * тело счёта, и накопленный доход за один проход, посегментно.
 *
 * На дате явной корректировки баланса тело ПЕРЕЗАПИСЫВАЕТСЯ — это факт из банка,
 * он главнее любой модельной оценки роста. На дате смены только ставки (без
 * корректировки баланса) тело продолжает расти как считала модель — капитализация
 * не прерывается, просто дальше по новой ставке. Простой процент (не капитализация)
 * не растит тело вовсе — между сегментами меняется только применяемая ставка.
 *
 * Обычная корректировка (пополнение/снятие) — реальное движение денег: доход за
 * предыдущий отрезок всё равно считается по формуле (ставка × дни), просто на
 * старом теле. А вот `isCorrection` — это НЕ движение денег, а «модель разошлась
 * с фактом банка» (см. BalanceAdjustment.isCorrection): для такой точки доход за
 * ПРЕДЫДУЩИЙ отрезок берём как факт (новое тело минус старое), а не по формуле —
 * иначе «Начислено» продолжает копить доход, которого по факту не было.
 */
function walkAccrual(
  balance: BalancePoint[],
  rates: RatePoint[],
  mode: CapitalizationMode,
  payout: PayoutPeriod | undefined,
  now: string | Date,
): { balanceNow: number; accrued: number } {
  const balanceAt = new Map(balance.map((p) => [p.date, p.amount]));
  const correctionAt = new Set(balance.filter((p) => p.isCorrection).map((p) => p.date));
  const checkpoints = [...new Set([...balance.map((p) => p.date), ...rates.map((p) => p.date)])].sort((a, b) =>
    a.localeCompare(b),
  );

  let principal = balance[0].amount;
  let accrued = 0;

  for (let i = 0; i < checkpoints.length; i++) {
    const date = checkpoints[i];
    if (diffDays(date, now) < 0) continue; // граница ещё не наступила — не учитываем вовсе
    const explicitAmount = balanceAt.get(date);
    if (explicitAmount !== undefined) principal = explicitAmount;

    const daysToNow = diffDays(date, now);
    if (daysToNow <= 0) continue; // граница ровно «сегодня» — сегмент нулевой длины
    const next = checkpoints[i + 1];
    const daysToNext = next ? diffDays(date, next) : Infinity;
    const segmentDays = Math.min(daysToNow, daysToNext);
    if (segmentDays <= 0) continue;

    // Отрезок упирается ровно в следующую точку-ИСПРАВЛЕНИЕ (не в «сейчас» раньше
    // срока) — заменяем модельный доход на фактическую разницу тела.
    const nextAmount = next !== undefined ? balanceAt.get(next) : undefined;
    if (nextAmount !== undefined && next !== undefined && correctionAt.has(next) && segmentDays === daysToNext) {
      accrued += nextAmount - principal;
      principal = nextAmount;
      continue;
    }

    const r = rateAt(rates, date);
    if (mode === 'capitalize') {
      const ppy = periodsPerYear(payout);
      const elapsedPeriods = Math.floor((segmentDays * ppy) / 365);
      const periodRate = r / 100 / ppy;
      const growth = principal * (Math.pow(1 + periodRate, elapsedPeriods) - 1);
      accrued += growth;
      principal += growth;
    } else {
      accrued += principal * (r / 100) * (segmentDays / 365);
    }
  }

  return { balanceNow: principal, accrued };
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
  const mode: CapitalizationMode =
    asset.capitalization ?? instrument.capitalization ?? 'none';
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const timeline = balanceTimeline(asset);
  const rates = rateTimeline(asset);
  // Ставка «на сейчас» — из истории изменений, а не открытия: банк мог поменять
  // ставку на счёте, дальнейший прогноз должен идти уже по актуальной.
  const currentRate = rateAt(rates, now);
  const effectiveRate = currentRate / 100;

  const { balanceNow, accrued: accruedToNow } = walkAccrual(timeline, rates, mode, payout, now);
  const incomePerDay = (balanceNow * effectiveRate) / daysInYear(now);
  // Прогноз вперёд (месяц/год) — от ТЕКУЩЕГО баланса, а не от суммы открытия:
  // при капитализации проценты уже легли на баланс и сами приносят доход.
  const annualRunRate = balanceNow * effectiveRate;
  // Месяц — по факту дней в ТЕКУЩЕМ календарном месяце (как считают банки:
  // прогноз «за июль» = дневной доход × 31, а не среднемесячное /12).
  const incomePerMonth = incomePerDay * daysInMonth(now);
  const premiumToKeyRate = currentRate - params.keyRate;

  // Налог на месяц: считаем эффективную (после общего лимита) годовую ставку
  // налога и переносим её на месячный доход — та же логика, что и «доход».
  const annualTax = calcAssetTax(annualRunRate, params, limitAlreadyUsed, asset.taxWithheldByBank);
  const effectiveTaxRate = annualRunRate > 0 ? annualTax / annualRunRate : 0;
  const monthlyTax = incomePerMonth * effectiveTaxRate;
  const monthlyNet = incomePerMonth - monthlyTax;

  if (instrument.behavior === 'term' && asset.endDate) {
    const termDays = Math.max(0, diffDays(asset.openDate, asset.endDate));
    const elapsedDays = clamp(diffDays(asset.openDate, now), 0, termDays);
    const daysRemaining = Math.max(0, diffDays(now, asset.endDate));
    const termProgress = termDays > 0 ? elapsedDays / termDays : 0;

    // Простой процент (по умолчанию): доход линеен по дням, по текущей ставке.
    const incomeTotalTerm = asset.amount * effectiveRate * (termDays / 365);
    // «Уже заработано» — посегментно, чтобы честно учитывать пополнения/снятия И смену ставки.
    const accrualNow = diffDays(asset.openDate, now) > termDays ? asset.endDate : now;
    const { accrued: earnedSoFar } = walkAccrual(timeline, rates, mode, payout, accrualNow);
    const remainingToEarn = Math.max(0, incomeTotalTerm - earnedSoFar);

    // Налог считается на доход всего срока (проценты по вкладу облагаются в год выплаты).
    const tax = calcAssetTax(incomeTotalTerm, params, limitAlreadyUsed, asset.taxWithheldByBank);
    const net = incomeTotalTerm - tax;
    const finalAmount = asset.amount + net;

    return {
      balanceNow,
      // При капитализации начисленное уже в теле; при простом % — лежит рядом.
      currentValue: mode === 'capitalize' ? balanceNow : balanceNow + earnedSoFar,
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
      currentRate,
      premiumToKeyRate,
    };
  }

  // Бессрочный (накопительный счёт): нет срока/прогресса. Тот же `now`, что и
  // для balanceNow выше — accrued уже посчитан в том же проходе, второй раз не считаем.
  const earnedSoFar = accruedToNow;
  const tax = calcAssetTax(earnedSoFar, params, limitAlreadyUsed, asset.taxWithheldByBank);
  const net = earnedSoFar - tax;

  return {
    balanceNow,
    // При капитализации начисленное уже в теле; при простом % — лежит рядом.
    currentValue: mode === 'capitalize' ? balanceNow : balanceNow + earnedSoFar,
    incomePerDay,
    incomePerMonth,
    accrued: earnedSoFar,
    tax,
    net,
    monthlyTax,
    monthlyNet,
    earnedSoFar,
    currentRate,
    premiumToKeyRate,
    // Прогноз «если ничего не менять»
    forecastNextMonth: incomePerMonth,
    forecastNextYear: annualRunRate,
  };
}
