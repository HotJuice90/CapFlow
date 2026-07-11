import type { CurrencyCode } from '@/domain/types';

/**
 * Денежный формат — единый по всему приложению (раздел «Правила отображения»):
 *  - разделитель тысяч — пробел;
 *  - символ валюты ПОСЛЕ числа, через пробел: «1 250 000 ₽»;
 *  - копейки — через запятую: «1 250,50 ₽»;
 *  - сокращаем только млн и выше: «2,4 млн ₽»; < 1 млн всегда полностью;
 *  - отрицательные — со знаком «−» (цвет задаёт UI).
 */

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  TRY: '₺',
  KZT: '₸',
  BYN: 'Br',
  CNY: '¥',
  INR: '₹',
  AED: 'AED',
  BRL: 'R$',
  ARS: '$',
};

const NBSP = ' '; // неразрывный пробел внутри числа
const MINUS = '−'; // настоящий минус

/** Способ показа копеек (решение/настройка округления). */
export type KopecksMode = 'hide' | 'show' | 'auto';

export interface MoneyOptions {
  currency?: CurrencyCode;
  kopecks?: KopecksMode; // по умолчанию 'auto'
  /** По умолчанию берётся из настроек пользователя (см. setAbbreviateMillionsDefault) — обзорные экраны не передают это явно. */
  abbreviateMillions?: boolean;
  withSymbol?: boolean; // по умолчанию true
}

/** Синхронизируется из DataContext при изменении data.settings.abbreviateMillions —
 *  так обзорным экранам (включая вложенные саб-компоненты без доступа к useData)
 *  не нужно прокидывать настройку явно на каждый formatMoney. */
let abbreviateMillionsDefault = true;
export function setAbbreviateMillionsDefault(value: boolean): void {
  abbreviateMillionsDefault = value;
}

/** Тот же приём для копеек (settings.kopecks) — вызовы без явного kopecks
 *  берут этот дефолт. Места, которым нужно жёстко скрыть копейки независимо
 *  от настройки (напр. узкие чипы), продолжают явно передавать kopecks: 'hide'. */
let kopecksDefault: KopecksMode = 'auto';
export function setKopecksDefault(value: KopecksMode): void {
  kopecksDefault = value;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function formatNumber(value: number, kopecks: KopecksMode): string {
  const abs = Math.abs(value);
  const hasFraction = Math.round(abs * 100) % 100 !== 0;
  const showKopecks = kopecks === 'show' || (kopecks === 'auto' && hasFraction);

  if (showKopecks) {
    const fixed = abs.toFixed(2);
    const [int, frac] = fixed.split('.');
    return `${groupThousands(int)},${frac}`;
  }
  return groupThousands(String(Math.round(abs)));
}

export function formatMoney(value: number, options: MoneyOptions = {}): string {
  const {
    currency,
    kopecks = kopecksDefault,
    abbreviateMillions = abbreviateMillionsDefault,
    withSymbol = true,
  } = options;

  const sign = value < 0 ? MINUS : '';
  let body: string;

  if (abbreviateMillions && Math.abs(value) >= 1_000_000) {
    const millions = Math.abs(value) / 1_000_000;
    // один знак после запятой: «2,4 млн»
    const rounded = Math.round(millions * 10) / 10;
    const str = Number.isInteger(rounded)
      ? String(rounded)
      : String(rounded).replace('.', ',');
    body = `${str}${NBSP}млн`;
  } else {
    body = formatNumber(value, kopecks);
  }

  const symbol = withSymbol && currency ? ` ${CURRENCY_SYMBOL[currency]}` : '';
  return `${sign}${body}${symbol}`;
}
