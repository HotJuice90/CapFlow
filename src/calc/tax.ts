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

/**
 * Налог на доход актива с учётом того, КТО его платит (решение: taxWithheldByBank).
 * Необлагаемый лимит (1 млн × ключевая ставка, ст. 214.2 НК) — льгота именно на
 * ПРОЦЕНТНЫЙ доход по вкладам/счетам, который САМ человек декларирует и платит.
 * Если площадка/брокер удерживает налог сама (брокерский счёт, ЦФА-обёртка) —
 * это другой правовой режим, лимит к нему не имеет отношения вообще: ни занимать
 * его чужим доходом, ни получать долю от него. Считаем плоско: ставка × доход.
 */
export function calcAssetTax(
  taxableIncome: number,
  params: CalcParams,
  limitAlreadyUsed: number,
  taxWithheldByBank: boolean | undefined,
): number {
  if (taxWithheldByBank) return Math.max(0, taxableIncome) * (params.taxRate / 100);
  return calcTax(taxableIncome, params, limitAlreadyUsed);
}
