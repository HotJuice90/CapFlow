import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurTargetRoot } from '@/components/BlurTargetRoot';
import { tokens } from '@/theme';

/**
 * Фон экрана — диагональный пастельный градиент (мята → лаванда → голубой).
 *
 * Заодно служит целью живого блюра таб-бара: размывать надо именно то, что под
 * баром, то есть фон вместе с контентом. Экраны, которые рисуют свой корень
 * мимо этого компонента (конвертер), оборачиваются в `BlurTargetRoot` сами.
 */
export function ScreenBackground({ children }: { children: React.ReactNode }) {
  const g = tokens.backgroundGradient;
  return (
    <BlurTargetRoot>
      <LinearGradient
        colors={g.colors}
        locations={g.locations}
        start={g.start}
        end={g.end}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </BlurTargetRoot>
  );
}
