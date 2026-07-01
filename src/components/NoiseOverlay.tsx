import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * Тонкий зернистый шум поверх градиента фона — чтобы гладкий градиент не выглядел
 * «пластиково». Никаких SVG-фильтров (feTurbulence/Pattern) — в установленной версии
 * react-native-svg они не гарантированно забинжены в нативный рендер (риск краша,
 * как с expo-blur), поэтому просто россыпь мелких точек, посчитанная один раз.
 */
export function NoiseOverlay({ density = 220 }: { density?: number }) {
  const { width, height } = useWindowDimensions();

  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number; opacity: number; dark: boolean }[] = [];
    for (let i = 0; i < density; i++) {
      out.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.5 + Math.random() * 1,
        opacity: 0.025 + Math.random() * 0.035,
        dark: Math.random() > 0.5,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {dots.map((d, i) => (
        <Circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill={d.dark ? '#1A2520' : '#FFFFFF'}
          fillOpacity={d.opacity}
        />
      ))}
    </Svg>
  );
}
