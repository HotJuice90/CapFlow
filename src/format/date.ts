/**
 * Даты (раздел «Правила отображения»):
 *  - основной формат: «31 июля», «5 января»;
 *  - полная дата только где действительно нужно: «31.07.2026».
 */

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Принимает ISO-строку 'YYYY-MM-DD' или Date. */
function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** «31 июля» */
export function formatDateShort(value: string | Date): string {
  const d = toDate(value);
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;
}

/** «31.07.2026» */
export function formatDateFull(value: string | Date): string {
  const d = toDate(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Склонение «день/дня/дней» для бейджей «осталось N дней». */
export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** «обновлено» относительно времени: «только что», «5 минут назад», «2 часа назад», «вчера». */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'никогда';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} ${plural(min, ['минуту', 'минуты', 'минут'])} назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ${plural(hours, ['час', 'часа', 'часов'])} назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
}
