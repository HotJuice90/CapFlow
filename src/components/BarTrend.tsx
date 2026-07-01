import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@/theme';

export interface BarPoint {
  label: string;
  value: number;
}

/** Простой бар-чарт тренда: последний столбец подсвечен акцентом. */
export function BarTrend({ points, height = 120 }: { points: BarPoint[]; height?: number }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;

  return (
    <View style={[styles.wrap, { height }]}>
      {points.map((p, i) => {
        const last = i === points.length - 1;
        const h = Math.max(6, ((p.value - min) / span) * (height - 24));
        return (
          <View key={i} style={styles.col}>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { height: h, backgroundColor: last ? tokens.semantic.positive : tokens.accent.light },
                ]}
              />
            </View>
            <Text style={[styles.label, last && styles.labelActive]} numberOfLines={1} ellipsizeMode="clip">{p.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  col: { flex: 1, alignItems: 'center' },
  barTrack: { width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '68%', borderRadius: 8 },
  label: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 6 },
  labelActive: { color: tokens.text.primary, fontWeight: '700' },
});
