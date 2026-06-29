import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '@/theme';

/** Фон экрана — диагональный пастельный градиент (мята → лаванда → голубой). */
export function ScreenBackground({ children }: { children: React.ReactNode }) {
  const g = tokens.backgroundGradient;
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={g.colors}
        locations={g.locations}
        start={g.start}
        end={g.end}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
