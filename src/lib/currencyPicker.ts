import { router } from 'expo-router';
import type { CurrencyCode } from '@/domain/types';

// Мостик для возврата выбранной валюты из formSheet-роута в экран-источник
// (экран остаётся смонтированным под шитом, поэтому колбэк жив).
let onPick: ((code: CurrencyCode) => void) | null = null;

export function openCurrencyPicker(cb: (code: CurrencyCode) => void, current?: CurrencyCode) {
  onPick = cb;
  router.push({ pathname: '/currency-picker', params: current ? { current } : {} });
}

export function pickCurrencyValue(code: CurrencyCode) {
  onPick?.(code);
  onPick = null;
}
