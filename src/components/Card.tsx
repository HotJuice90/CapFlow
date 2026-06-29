import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme';
import { boxShadow } from '@/theme/shadow';

/**
 * Карточка по паттерну гайда: тень и контент — РАЗНЫЕ слои.
 * Внешний View держит только тень (без overflow), внутренний — overflow:hidden
 * для скругления содержимого/градиента/вотермарки.
 */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[styles.shadowLayer, boxShadow(tokens.shadow.card), style]}>
      <View style={[styles.contentLayer, padded && styles.padded]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowLayer: {
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.surface.white,
  },
  contentLayer: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    backgroundColor: tokens.surface.white,
  },
  padded: {
    padding: tokens.spacing.lg,
  },
});
