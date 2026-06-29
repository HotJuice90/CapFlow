import type { ViewStyle } from 'react-native';

/**
 * boxShadow в RN 0.85+ (кроссплатформенно, мягкая тень без жёсткого контура).
 * Типы RN могут ещё не знать о boxShadow — оборачиваем с приведением.
 */
export function boxShadow(value: string): ViewStyle {
  return { boxShadow: value } as ViewStyle;
}
