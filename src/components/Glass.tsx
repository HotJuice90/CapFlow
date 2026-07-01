import React from 'react';
import { View, ViewStyle } from 'react-native';
import { tokens } from '@/theme';

// Стеклянная плашка: полупрозрачный фон + тонкая светлая рамка + мягкая тёплая тень.
// Имитация стекла без blur (надёжно на Android).
export function Glass({
  children, style, strong, soft, radius = 20,
}: {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  strong?: boolean;
  soft?: boolean;
  radius?: number;
}) {
  const bg = strong ? 'rgba(255,255,255,0.96)' : soft ? 'rgba(255,255,255,0.55)' : tokens.surface.glass;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: tokens.surface.glassBorder,
          boxShadow: tokens.shadow.floating,
        },
        style as any,
      ]}
    >
      {children}
    </View>
  );
}
