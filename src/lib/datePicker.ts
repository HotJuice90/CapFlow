import { router } from 'expo-router';

export interface DatePickerConfig {
  title: string;
  value?: string; // ISO 'YYYY-MM-DD', текущий выбор
  minDate?: string;
  maxDate?: string;
  onPick: (iso: string) => void;
}

// Мостик для возврата даты из formSheet-роута в экран-источник (тот же паттерн,
// что currencyPicker/optionPicker) — экран остаётся смонтированным под шитом.
let config: DatePickerConfig | null = null;

export function openDatePicker(cfg: DatePickerConfig) {
  config = cfg;
  router.push('/date-picker');
}

export function getDatePickerConfig(): DatePickerConfig | null {
  return config;
}

export function pickDateValue(iso: string) {
  config?.onPick(iso);
  config = null;
}
