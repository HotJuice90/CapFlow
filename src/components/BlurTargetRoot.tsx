import React, { useCallback, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { setBlurTarget, clearBlurTarget } from '@/lib/blurTarget';

/**
 * Корень экрана, который таб-бар размывает под собой. Оборачивает ТОЛЬКО
 * контент — сам бар рендерит навигатор через проп `tabBar`, то есть он не
 * потомок экрана и в цель не попадает. Если когда-нибудь бар начнут рисовать
 * руками внутри экрана, его придётся вынести соседом: иначе он попытается
 * размыть сам себя.
 *
 * Регистрация именно на `useFocusEffect`, а не `useEffect`: экраны в `(tabs)`
 * остаются смонтированными все разом, и по обычному эффекту целью стал бы
 * любой из них, а не тот, который человек видит.
 */
export function BlurTargetRoot({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View | null>(null);

  useFocusEffect(
    useCallback(() => {
      const token = setBlurTarget(ref);
      return () => clearBlurTarget(token);
    }, []),
  );

  return (
    <BlurTargetView ref={ref} style={[styles.root, style]}>
      {children}
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
