import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type GoalIconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** По умолчанию, пока пользователь не выбрал свою — нейтральный «прицел». */
export const DEFAULT_GOAL_ICON: GoalIconName = 'target';

/**
 * Набор иконок для целей — финансовые + самые популярные бытовые категории,
 * на что обычно копят. Без загрузки своего фото — только выбор из набора.
 */
// 30 = ровно 5 рядов по 6 в сетке пикера (goal-icon-picker.tsx) — без
// неровного хвоста в последнем ряду, добавляя новую иконку сюда, добавляй
// сразу 6 (или столько, чтобы остаток снова делился на 6).
export const GOAL_ICONS: GoalIconName[] = [
  'target',
  'piggy-bank-outline',
  'wallet-outline',
  'bank-outline',
  'trending-up',
  'credit-card-outline',
  'gift-outline',
  'airplane',
  'palm-tree',
  'home-outline',
  'home-city-outline',
  'hammer-wrench',
  'car',
  'baby-face-outline',
  'school-outline',
  'ring',
  'heart-outline',
  'medical-bag',
  'sofa',
  'laptop',
  'dumbbell',
  'paw',
  'diamond-stone',
  'party-popper',
  'tshirt-crew-outline',
  'shoe-heel',
  'gamepad-variant',
  'necklace',
  'watch-variant',
  'shopping-outline',
];
