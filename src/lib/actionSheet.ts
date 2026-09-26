import { router } from 'expo-router';

export interface SheetAction {
  key: string;
  label: string;
  /** Короткое пояснение под названием — что именно произойдёт. */
  subtitle?: string;
  /** Иконка MaterialCommunityIcons. */
  icon: string;
  /** Разрушительное действие — красный тон. */
  danger?: boolean;
  onPress: () => void;
}

export interface ActionSheetConfig {
  title: string;
  actions: SheetAction[];
}

// Мостик между экраном и formSheet-роутом — тот же паттерн, что у optionPicker:
// экран остаётся смонтированным под шитом, поэтому колбэки живы.
let config: ActionSheetConfig | null = null;

export function openActionSheet(cfg: ActionSheetConfig) {
  config = cfg;
  // Приведение — потому что типизированные маршруты expo-router генерирует
  // `expo start`, а мы собираемся без Metro: новый файл роута в типах не
  // появляется. Сам маршрут настоящий — app/action-sheet.tsx.
  router.push('/action-sheet' as never);
}

export function getActionSheet(): ActionSheetConfig | null {
  return config;
}

/**
 * Выполнить действие ПОСЛЕ того, как шит закрылся. Почти все действия сами
 * что-то открывают — диалог, пикер даты, форму; поверх ещё не закрытого шита
 * они либо не показываются, либо закрываются вместе с ним.
 */
export function runSheetAction(key: string) {
  const action = config?.actions.find((a) => a.key === key);
  config = null;
  router.back();
  if (action) setTimeout(action.onPress, 80);
}
