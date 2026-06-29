/**
 * Проценты (раздел «Правила отображения»):
 *  - целые — без десятичной части: «18%»;
 *  - дробные — с одним знаком после запятой: «16,5%».
 */

const MINUS = '−';

export function formatPercent(value: number): string {
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 10) / 10;
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
  const sign = value < 0 ? MINUS : '';
  return `${sign}${body}%`;
}

/** Со знаком — для «премии к ключевой»: «+2,5%», «−1%». */
export function formatPercentSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? MINUS : '';
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 10) / 10;
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
  return `${sign}${body}%`;
}
