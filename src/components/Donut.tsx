import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { tokens } from '@/theme';

export interface DonutSegment {
  value: number;
  color: string;
}

/** Кольцевая диаграмма. Сегменты через strokeDasharray; центр — подпись. */
export function Donut({
  segments,
  size = 150,
  strokeWidth = 24,
  centerLabel,
  centerSub,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={tokens.surface.neutral} strokeWidth={strokeWidth} fill="none" />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {segments.map((seg, i) => {
            const len = (seg.value / total) * c;
            const el = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
                strokeLinecap="butt"
              />
            );
            acc += len;
            return el;
          })}
        </G>
      </Svg>
      {centerLabel ? (
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerLabel} numberOfLines={1}>{centerLabel}</Text>
          {centerSub ? <Text style={styles.centerSub}>{centerSub}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerLabel: { fontSize: tokens.typography.label, fontWeight: '800', color: tokens.text.primary },
  centerSub: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 1 },
});
