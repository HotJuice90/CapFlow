import React from 'react';
import { StyleSheet, Text } from 'react-native';

/**
 * Единый заголовок экрана: Onest SemiBold 34pt, letter-spacing -1%.
 * Используется на всех корневых табах (главная, календарь, конвертер, аналитика, настройки).
 * Отступ снизу 16, паддинг-топ контейнера экрана задаётся отдельно (канон = 80).
 */
export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 34,
    fontFamily: 'Onest_600SemiBold',
    color: '#212121',
    letterSpacing: -0.34, // -1%
    marginBottom: 16,
  },
});
