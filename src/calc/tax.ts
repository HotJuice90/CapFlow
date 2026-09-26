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

/**
 * Годы, за которые проценты по вкладам и остаткам на счетах НДФЛ не
 * облагались (закон 67-ФЗ от 26.03.2022, доходы 2021 и 2022 годов). Лимит по
 * ключевой ставке тут ни при чём: освобождение полное, с любой суммы.
 *
 * Касается только «доплатить самому» — это и есть проценты по вкладам, по
 * которым ФНС сама присылает уведомление. «Удержит площадка» — купоны у
 * брокера, ЦФА и завёрнутые в «счёт» продукты; их освобождение не касалось
 * (да розничных ЦФА в 2021–2022 толком и не было).
 *
 * Нашлось при сверке со «Сводным расчётом НДФЛ» из личного кабинета ФНС:
 * лимиты за 2023–2025 у нас совпали с официальными, а 2022 год код облагал
 * так же, как последующие.
 */
export const DEPOSIT_TAX_EXEMPT_YEARS: ReadonlySet<number> = new Set([2021, 2022]);
