import React from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Столбчатый график роста от базовой точки (сумма открытия). Накопительный
 * счёт — деньги не уходят в минус, поэтому бар всегда один: растёт от базы
 * вверх (пополнение/капитализация) или чуть опускается (снятие), но никогда
 * не «падает в ноль» и всегда одного, зелёного, цвета. База сидит на середине
 * высоты контейнера; масштаб — по корню из % отклонения, чтобы одно крупное
 * снятие/пополнение не «съедало» видимость мелких ежедневных начислений рядом.
 */
export function GrowthBars({
  data,
  baseline,
  width = 120,
  height = 56,
  color = '#3DDC97',
  gap = 3,
}: {
  data: number[];
  /** сумма, которая на графике соответствует середине высоты (обычно — баланс на день открытия) */
  baseline?: number;
  width?: number;
  height?: number;
  color?: string;
  gap?: number;
}) {
  if (data.length < 2) return <Svg width={width} height={height} />;

  const base = baseline ?? data[0] ?? 0;
  const half = height / 2;
  const minBarH = Math.max(3, height * 0.06);

  // % отклонение от базы, сжатое корнем — большой скачок не глушит мелкие бары рядом.
  const pcts = data.map((v) => (base !== 0 ? (v - base) / base : 0));
  const maxAbsPct = Math.max(...pcts.map((p) => Math.abs(p)), 1e-6);
  const norm = Math.sqrt(maxAbsPct) || 1;

  const n = data.length;
  const barW = Math.max(1, (width - gap * (n - 1)) / n);
  const radius = Math.min(barW / 2, 3);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="barFill" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      {data.map((v, i) => {
        const pct = pcts[i];
        const magnitude = (Math.sqrt(Math.abs(pct)) / norm) * half; // 0..half
        // База — 50% высоты; рост тянет бар к потолку, снятие — вниз, но не ниже пола.
        const h = Math.max(minBarH, pct >= 0 ? half + magnitude : half - magnitude);
        const x = i * (barW + gap);
        const y = height - h;
        return (
          <Rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={radius}
            ry={radius}
            fill="url(#barFill)"
          />
        );
      })}
    </Svg>
  );
}
