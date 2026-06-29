/**
 * Учёт дней. День-каунт actual/365-366 (решение #2): делим на реальное число
 * дней в году. Всё считается относительно локального устройства (решение спеки).
 *
 * Парсим даты в локальном времени, чтобы ISO-строки 'YYYY-MM-DD' не «уезжали»
 * на сутки в часовых поясах западнее UTC.
 */

export function parseLocal(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Индекс календарного дня (целое) — стабилен к часовым поясам. */
function dayIndex(value: string | Date): number {
  const d = parseLocal(value);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Целое число дней между датами: b − a. */
export function diffDays(a: string | Date, b: string | Date): number {
  return dayIndex(b) - dayIndex(a);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Число дней в году конкретной даты (365/366). */
export function daysInYear(value: string | Date): number {
  return isLeapYear(parseLocal(value).getFullYear()) ? 366 : 365;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
