import { router } from 'expo-router';

export interface PickerOption {
  label: string;
  value: string;
  subtitle?: string;
  /** фирменный цвет организации — подложка/фолбэк иконки */
  color?: string;
  /** id лого банка из реестра (assets/banks) */
  logo?: string;
  /** локальный путь к загруженной пользователем картинке — приоритетнее logo/color */
  imageUri?: string;
  /** иконка MaterialCommunityIcons — для пунктов без цвета/лого (период, тип …) */
  icon?: string;
  /** цвет подложки+иконки для icon-варианта (бледный тон в покое, сплошной — когда выбран) */
  iconColor?: string;
  /** значение для фильтра по типу (см. PickerConfig.filters) — не участвует в отображении */
  filterValue?: string;
}

export interface PickerFilter {
  label: string;
  icon: string;
  color: string;
}

export interface PickerConfig {
  title: string;
  options: PickerOption[];
  current?: string;
  onPick: (value: string) => void;
  onCreateNew?: () => void;
  createLabel?: string;
  /** показать строку поиска по label */
  searchable?: boolean;
  /** чипы-фильтр по option.filterValue; первый пункт «Все» добавляется автоматически */
  filters?: PickerFilter[];
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
