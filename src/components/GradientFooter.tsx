import React from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '@/theme';

/**
 * Подложка нижнего футера (прибитая кнопка «Сохранить»/«Создать») — не
 * плоский цвет-приближение фона экрана (пробовали — не совпадает с реальным
 * диагональным градиентом), а буквально тот же градиент, что рисует
 * ScreenBackground: во весь экран, прижат к низу, а контейнер обрезает
 * (overflow:hidden) всё, кроме той полосы, где реально сидит футер. Раз фон
 * не динамический (всегда один и тот же), это даёт точное продолжение —
 * не приближение.
 */
export function GradientFooter({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { height: screenH } = useWindowDimensions();
  const g = tokens.backgroundGradient;
  return (
    <View style={[styles.clip, style]}>
      <LinearGradient
        colors={g.colors}
        locations={g.locations}
        start={g.start}
        end={g.end}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: screenH }}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
