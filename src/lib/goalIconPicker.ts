import { router } from 'expo-router';
import type { GoalIconName } from '@/domain/goalIcons';

// Мостик для возврата выбранной иконки из formSheet-роута в экран-источник
// (тот же паттерн, что currencyPicker/optionPicker) — экран остаётся
// смонтированным под шитом, поэтому колбэк жив.
let onPick: ((icon: GoalIconName) => void) | null = null;

export function openGoalIconPicker(cb: (icon: GoalIconName) => void, current?: GoalIconName) {
  onPick = cb;
  router.push({ pathname: '/goal-icon-picker', params: current ? { current } : {} });
}

export function pickGoalIconValue(icon: GoalIconName) {
  onPick?.(icon);
  onPick = null;
}
