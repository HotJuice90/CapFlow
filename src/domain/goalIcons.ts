import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type GoalIconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** По умолчанию, пока пользователь не выбрал свою — нейтральный «прицел». */
export const DEFAULT_GOAL_ICON: GoalIconName = 'target';

/**
 * Набор иконок для целей — финансовые + самые популярные бытовые категории,
 * на что обычно копят. Без загрузки своего фото — только выбор из набора.
 */
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
];
