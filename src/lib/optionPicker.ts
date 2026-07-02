import { router } from 'expo-router';

export interface PickerOption {
  label: string;
  value: string;
  subtitle?: string;
  /** фирменный цвет организации — подложка/фолбэк иконки */
  color?: string;
  /** id лого банка из реестра (assets/banks) */
  logo?: string;
}

export interface PickerConfig {
  title: string;
  options: PickerOption[];
  current?: string;
  onPick: (value: string) => void;
  onCreateNew?: () => void;
  createLabel?: string;
}

// Мостик для возврата выбора из formSheet-роута в экран-источник
// (экран остаётся смонтированным под шитом, поэтому колбэк жив).
// Паттерн тот же, что у currencyPicker.
let config: PickerConfig | null = null;

export function openOptionPicker(cfg: PickerConfig) {
  config = cfg;
  router.push('/option-picker');
}

export function getPickerConfig(): PickerConfig | null {
  return config;
}

export function pickOptionValue(value: string) {
  config?.onPick(value);
  config = null;
}

export function pickCreateNew() {
  const cb = config?.onCreateNew;
  config = null;
  cb?.();
}
