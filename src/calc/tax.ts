import type { CalcParams } from '@/domain/types';

/**
 * Налог (решение #1) — настраиваемый: ставка и необлагаемый лимит берутся из
 * настроек (CalcParams). Структурно как НК РФ: налог на процентный доход сверх
 * годового необлагаемого лимита — лимит ОДИН на все активы, не на каждый отдельно.
 *
 * На карточке актива `limitAlreadyUsed` — сколько лимита уже «съели» другие активы
 * (см. `buildAssetViews` в selectors.ts, распределяет лимит по дате открытия).
 */

/** Налог на заданный годовой процентный доход. `limitAlreadyUsed` — часть лимита, занятая другими активами. */
export function calcTax(taxableIncome: number, params: CalcParams, limitAlreadyUsed = 0): number {
  const remainingLimit = Math.max(0, params.taxFreeLimit - limitAlreadyUsed);
  const overLimit = Math.max(0, taxableIncome - remainingLimit);
  return overLimit * (params.taxRate / 100);
}

/** Портфельный налог: суммируем доходы по году, лимит применяем один раз. */
export function calcPortfolioTax(taxableIncomes: number[], params: CalcParams): number {
  const total = taxableIncomes.reduce((acc, v) => acc + v, 0);
  return calcTax(total, params);
}
