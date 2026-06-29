import type { CalcParams } from '@/domain/types';

/**
 * Налог (решение #1) — настраиваемый: ставка и необлагаемый лимит берутся из
 * настроек (CalcParams). Структурно как НК РФ: налог на процентный доход сверх
 * годового необлагаемого лимита.
 *
 * MVP-упрощение: на карточке актива налог считается «отдельно стоящим» (как если
 * бы этот актив был единственным). На портфельном уровне доходы суммируются и
 * лимит применяется ОДИН раз за год — поэтому per-asset и портфельный налог могут
 * не сходиться копейка-в-копейку. Точную поактивную аллокацию — после MVP.
 */

/** Налог на заданный годовой процентный доход. */
export function calcTax(taxableIncome: number, params: CalcParams): number {
  const overLimit = Math.max(0, taxableIncome - params.taxFreeLimit);
  return overLimit * (params.taxRate / 100);
}

/** Портфельный налог: суммируем доходы по году, лимит применяем один раз. */
export function calcPortfolioTax(taxableIncomes: number[], params: CalcParams): number {
  const total = taxableIncomes.reduce((acc, v) => acc + v, 0);
  return calcTax(total, params);
}
