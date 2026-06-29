import type {
  Asset,
  CalcParams,
  CapitalizationMode,
  DerivedValues,
  FinancialInstrument,
  PayoutPeriod,
} from '@/domain/types';
import { calcTax } from './tax';
import { clamp, daysInYear, diffDays, parseLocal } from './dayCount';

/** Версия движка — пишется в Snapshot, чтобы история не «плыла» при смене формул. */
export const ENGINE_VERSION = '1.0.0';

function periodsPerYear(period: PayoutPeriod | undefined): number {
  switch (period) {
    case 'daily': return 365;
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semiannual': return 2;
    case 'annual': return 1;
    default: return 12; // разумный дефолт для капитализации
  }
}

/** Эффективная база актива на момент `now` с учётом капитализации. */
function currentBalance(
  asset: Asset,
  mode: CapitalizationMode,
  payout: PayoutPeriod | undefined,
  now: string | Date,
): number {
  if (mode !== 'capitalize') return asset.amount;
  const ppy = periodsPerYear(payout);
  const elapsedDays = Math.max(0, diffDays(asset.openDate, now));
  const elapsedPeriods = Math.floor((elapsedDays / 365) * ppy);
  const periodRate = asset.rate / 100 / ppy;
  return asset.amount * Math.pow(1 + periodRate, elapsedPeriods);
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
): DerivedValues {
  const annualRate = asset.rate / 100;
  const mode: CapitalizationMode =
    asset.capitalization ?? instrument.capitalization ?? 'none';
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;

  const balanceNow = currentBalance(asset, mode, payout, now);
  const incomePerDay = (balanceNow * annualRate) / daysInYear(now);
  const annualRunRate = asset.amount * annualRate;
  const incomePerMonth = annualRunRate / 12;
  const premiumToKeyRate = asset.rate - params.keyRate;

  if (instrument.behavior === 'term' && asset.endDate) {
    const termDays = Math.max(0, diffDays(asset.openDate, asset.endDate));
    const elapsedDays = clamp(diffDays(asset.openDate, now), 0, termDays);
    const daysRemaining = Math.max(0, diffDays(now, asset.endDate));
    const termProgress = termDays > 0 ? elapsedDays / termDays : 0;

    // Простой процент (по умолчанию): доход линеен по дням.
    const incomeTotalTerm = asset.amount * annualRate * (termDays / 365);
    const earnedSoFar = asset.amount * annualRate * (elapsedDays / 365);
    const remainingToEarn = Math.max(0, incomeTotalTerm - earnedSoFar);

    // Налог считается на доход всего срока (проценты по вкладу облагаются в год выплаты).
    const tax = calcTax(incomeTotalTerm, params);
    const net = incomeTotalTerm - tax;
    const finalAmount = asset.amount + net;

    return {
      incomePerDay,
      incomePerMonth,
      incomeTotalTerm,
      accrued: earnedSoFar,
      tax,
      net,
      finalAmount,
      earnedSoFar,
      remainingToEarn,
      daysRemaining,
      termProgress,
      premiumToKeyRate,
    };
  }

  // Бессрочный (накопительный счёт): нет срока/прогресса.
  const elapsedDays = Math.max(0, diffDays(asset.openDate, now));
  const earnedSoFar = asset.amount * annualRate * (elapsedDays / 365);
  const tax = calcTax(earnedSoFar, params);
  const net = earnedSoFar - tax;

  return {
    incomePerDay,
    incomePerMonth,
    accrued: earnedSoFar,
    tax,
    net,
    earnedSoFar,
    premiumToKeyRate,
    // Прогноз «если ничего не менять»
    forecastNextMonth: annualRunRate / 12,
    forecastNextYear: annualRunRate,
  };
}
