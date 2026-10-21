import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { axisScale, formatAxisLabel, monotonePath } from './CapitalAxisChart';
import { font, hexToRgba, tokens } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney } from '@/format';
import { formatDateTiny } from '@/format/date';
import type { CurrencyCode } from '@/domain/types';

export interface DepositChartPoint {
  /** ISO 'YYYY-MM-DD' */
  iso: string;
  value: number;
}

/**
 * График срочного вклада на весь срок: факт до сегодня — сплошной линией с
 * заливкой, дальше — прогноз пунктиром с бледной заливкой. У вклада это не
 * гадание: конец срока и ставка известны, вторая половина — расчёт.
 *
 * Ось — та же, что у капитала в аналитике (axisScale/подписи-таблетки), чтобы
 * два графика приложения не жили по разным правилам.
 *
 * Подписей «сегодня» внизу нет: у вклада, открытого вчера, она упиралась бы в
 * левый край и спорила с осью. Сегодня — просто точка на линии, значение —
 * тултипом по тапу в любом месте графика (ближайшая точка). Даты начала и
 * конца срока стоят на полосе прямо под графиком — второй раз их не пишем.
 */
export function DepositChart({
  points,
  todayIndex,
  width,
  height = 150,
  currency,
}: {
  points: DepositChartPoint[];
  /** Индекс точки «сегодня» в points. */
  todayIndex: number;
  width: number;
  height?: number;
  currency: CurrencyCode;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  if (points.length < 2) return <View style={{ width, height }} />;

  const values = points.map((p) => p.value);
  const { gridValues, axisMin, axisMax } = axisScale(Math.min(...values), Math.max(0, ...values));
  const padTop = 16;
  const padBottom = 12;
  const innerH = height - padTop - padBottom;
  const span = axisMax - axisMin || 1;
  const toY = (v: number) => padTop + innerH - ((v - axisMin) / span) * innerH;

  // Точки на краях (сегодня в первый день, конец срока) не должны резаться
  // краем SVG — данные сжимаем внутрь на радиус ореола.
  const M = 8;
  const plotW = width - M * 2;
  const first = Date.parse(points[0].iso);
  const total = Date.parse(points[points.length - 1].iso) - first || 1;
  // X — по ДАТЕ, а не по номеру точки: «сегодня» вставлено в ряд отдельно и
  // нарушает равный шаг.
  const xy = points.map((p) => ({ x: M + ((Date.parse(p.iso) - first) / total) * plotW, y: toY(p.value) }));

  const t = Math.min(Math.max(todayIndex, 0), xy.length - 1);
  const fact = xy.slice(0, t + 1);
  const forecast = xy.slice(t);
  const factLine = fact.length >= 2 ? monotonePath(fact) : '';
  const forecastLine = forecast.length >= 2 ? monotonePath(forecast) : '';
  const areaOf = (pts: { x: number; y: number }[], line: string) =>
    `${line} L${pts[pts.length - 1].x} ${height} L${pts[0].x} ${height} Z`;

  const color = tokens.accent.base;
  const today = xy[t];
  const end = xy[xy.length - 1];

  const onPress = (x: number) => {
    let best = 0;
    for (let i = 1; i < xy.length; i++) {
      if (Math.abs(xy[i].x - x) < Math.abs(xy[best].x - x)) best = i;
    }
    // Повторный тап по той же точке — убрать тултип.
    setSelected((cur) => (cur === best ? null : best));
  };

  const TIP_W = 112;
  const sel = selected !== null ? xy[selected] : undefined;
  const tipLeft = sel ? Math.min(Math.max(0, sel.x - TIP_W / 2), width - TIP_W) : 0;
  // Над точкой; если не влезает сверху — под ней.
  const tipTop = sel ? (sel.y - 52 >= 0 ? sel.y - 52 : sel.y + 14) : 0;

  return (
    <Pressable style={{ width, height }} onPress={(e) => onPress(e.nativeEvent.locationX)}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="depFact" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.2} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="depForecast" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.08} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {gridValues.map((v) => (
          <Line
            key={v}
            x1={0}
            y1={toY(v)}
            x2={width}
            y2={toY(v)}
            stroke="rgba(152,162,183,0.35)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        ))}
        {forecastLine ? <Path d={areaOf(forecast, forecastLine)} fill="url(#depForecast)" /> : null}
        {factLine ? <Path d={areaOf(fact, factLine)} fill="url(#depFact)" /> : null}
        {forecastLine ? (
          <Path
            d={forecastLine}
            stroke={hexToRgba(color, 0.6)}
            strokeWidth={2}
            strokeDasharray="5,5"
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
        {factLine ? (
          <Path d={factLine} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {sel ? (
          <Line
            x1={sel.x}
            y1={sel.y}
            x2={sel.x}
            y2={height}
            stroke={hexToRgba(color, 0.35)}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        ) : null}
        {/* Конец срока — полое кольцо: это ещё не факт. */}
        <Circle cx={end.x} cy={end.y} r={4} fill={tokens.surface.white} stroke={color} strokeWidth={2} />
        <Circle cx={today.x} cy={today.y} r={7} fill={color} fillOpacity={0.22} />
        <Circle cx={today.x} cy={today.y} r={4} fill={color} />
        {sel && selected !== t && selected !== xy.length - 1 ? (
          <Circle cx={sel.x} cy={sel.y} r={3.5} fill={color} />
        ) : null}
      </Svg>
      {gridValues.map((v) => (
        <View key={v} pointerEvents="none" style={[styles.axisLabel, { top: toY(v) - 11 }]}>
          <Text style={styles.axisLabelText}>{formatAxisLabel(v)}</Text>
        </View>
      ))}
      {sel && selected !== null ? (
        <View pointerEvents="none" style={[styles.tip, boxShadow(tokens.shadow.cardSoft), { left: tipLeft, top: tipTop, width: TIP_W }]}>
          <Text style={styles.tipValue} numberOfLines={1}>
            {formatMoney(points[selected].value, { currency, kopecks: 'hide' })}
          </Text>
          <Text style={styles.tipDate} numberOfLines={1}>
            {selected === t ? 'сегодня' : formatDateTiny(points[selected].iso)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  axisLabel: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(249,250,255,0.6)',
    borderRadius: 100,
    paddingHorizontal: tokens.spacing.tight,
    paddingVertical: tokens.spacing.chip,
  },
  axisLabelText: { fontSize: 11, fontFamily: font.medium, color: '#8A99C4' },
  tip: {
    position: 'absolute',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.surface.white,
  },
  tipValue: { fontSize: 13, lineHeight: 16, fontFamily: font.semibold, color: tokens.text.primary },
  tipDate: { fontSize: 11, lineHeight: 13, color: tokens.text.tertiary, marginTop: 1 },
});
