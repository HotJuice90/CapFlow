/**
 * Проценты (раздел «Правила отображения»):
 *  - целые — без десятичной части: «18%»;
 *  - дробные — до двух знаков после запятой: «14,25%» (ставки ЦБ и банков
 *    часто квотируются с точностью до сотых, одного знака не хватает).
 */

const MINUS = '−';

export function formatPercent(value: number, decimals = 2): string {
  const abs = Math.abs(value);
  const factor = 10 ** decimals;
  const rounded = Math.round(abs * factor) / factor;
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
  const sign = value < 0 ? MINUS : '';
  return `${sign}${body}%`;
}

/** Со знаком — для «премии к ключевой»: «+2,25%», «−1%». */
export function formatPercentSigned(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? MINUS : '';
  const abs = Math.abs(value);
  const factor = 10 ** decimals;
  const rounded = Math.round(abs * factor) / factor;
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
  return `${sign}${body}%`;
}
