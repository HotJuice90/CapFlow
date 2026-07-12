import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Circle, Line } from 'react-native-svg';
import { font } from '@/theme';

/** Круглый шаг сетки (1/2/5 × 10^n), ближайший к value/steps — тот же приём,
 *  что у любого нормального графика с осью: 5,92 млн → шаг 2 млн (2/4/6). */
function niceStep(maxValue: number, steps = 3): number {
  if (maxValue <= 0) return 1;
  const rough = maxValue / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function formatAxisLabel(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}М`;
  }
  if (value >= 1_000) return `${Math.round(value / 1000)}К`;
  return String(Math.round(value));
}

/**
 * На длинных рядах (Год, Всё время) отдельные дни всё равно не различимы
 * глазами — прореживаем до реальных значений (не усреднение) с шагом,
 * подобранным под ~12 точек на весь ряд (примерно раз в месяц на годовом
 * диапазоне). Шаг адаптивный, а не жёстко «раз в 30 дней» — иначе молодое
 * «Всё время» короче пары месяцев схлопнется в 2-3 точки. Отсчёт — от
 * СЕГОДНЯ назад, чтобы последняя точка (индикатор текущего значения) всегда
 * была точной; самый первый день ряда тоже сохраняем как якорь.
 */
function downsampleForDisplay(data: number[]): number[] {
  if (data.length <= 60) return data;
  const TARGET_POINTS = 12;
  const stride = Math.max(1, Math.round(data.length / TARGET_POINTS));
  const out: number[] = [];
  for (let i = data.length - 1; i >= 0; i -= stride) out.unshift(data[i]);
  if (out[0] !== data[0]) out.unshift(data[0]);
  return out;
}

/**
 * Монотонный кубический сплайн (алгоритм Фритча—Карлсона, тот же, что за
 * d3.curveMonotoneX) — кривая проходит РОВНО через каждую точку данных (ни
 * одно реальное значение не «съедается» сглаживанием), а между точками не
 * даёт выбросов за пределы соседних значений.
 *
 * Без этого ограничителя (пробовали убрать ради ещё большего скругления)
 * на стыке «резкий скачок за 1 день → плато» касательная тянет кривую выше
 * реального значения, и у самой заметной точки — индикатора текущего
 * значения — появляется уродливый «крючок»-перелёт. Так что зануление
 * касательной на плато и лимитер перелёта (s>9) — не перестраховка, а
 * обязательное условие корректности при однодневных скачках капитала.
 */
function monotonePath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n < 2) return '';
  if (n === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  const dx: number[] = [];
  const d: number[] = []; // секущие наклоны между соседними точками
  for (let i = 0; i < n - 1; i++) {
    const deltaX = points[i + 1].x - points[i].x;
    dx.push(deltaX);
    d.push(deltaX === 0 ? 0 : (points[i + 1].y - points[i].y) / deltaX);
  }

  const m: number[] = new Array(n); // касательные в каждой точке
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] === 0 || d[i] === 0 || (d[i - 1] < 0) !== (d[i] < 0)) {
      m[i] = 0;
    } else {
      m[i] = (d[i - 1] + d[i]) / 2;
    }
  }

  // Ограничитель Фритча—Карлсона: не даёт кривой выпирать за пределы
  // соседних значений (никаких «горбов» на плато и перелётов на изломах).
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const segDx = dx[i];
    const c1x = points[i].x + segDx / 3;
    const c1y = points[i].y + (m[i] * segDx) / 3;
    const c2x = points[i + 1].x - segDx / 3;
    const c2y = points[i + 1].y - (m[i + 1] * segDx) / 3;
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${points[i + 1].x.toFixed(1)} ${points[i + 1].y.toFixed(1)}`;
  }
  return path;
}

/**
 * График капитала с осью (пунктирные линии сетки + подписи-таблетки). Шкала
 * опирается на «круглый» максимум (niceStep), а не на голый min/max ряда.
 */
export function CapitalAxisChart({
  data,
  width,
  height = 178,
}: {
  data: number[];
  width: number;
  height?: number;
}) {
  const max = Math.max(0, ...data);
  const step = niceStep(max || 1);
  // «Круглый» потолок для сетки/подписей (2М/4М/6М) — на нём и держатся ярлыки.
  const niceMax = step * Math.max(1, Math.ceil(max / step));
  const gridValues = [step, step * 2, niceMax].filter((v, i, arr) => v <= niceMax && arr.indexOf(v) === i);
  // Реальный максимум растёт непрерывно (капает процент), а niceMax — круглыми
  // ступенями, так что сразу после пробития очередной ступени пик ложится
  // вплотную к верхнему краю. Даём отдельный запас в масштабе (не в подписях),
  // чтобы точка/линия у максимума никогда не «утыкалась в потолок».
  const axisMax = niceMax + step * 0.5;

  const padTop = 16;
  // Запас снизу — чтобы низкие участки ряда (просадки на «Годе») не «прилипали»
  // к плашке под графиком: якорь нуля теперь не у самого края SVG.
  const padBottom = 24;
  const innerH = height - padTop - padBottom;
  const valueToY = (v: number) => padTop + innerH - (v / axisMax) * innerH;

  if (data.length < 2) return <View style={{ width, height }} />;

  const plotData = downsampleForDisplay(data);

  // Точка-индикатор на конце (r=7 у внешнего кольца) не должна обрезаться краем
  // SVG — оставляем ей запас, сжимая сами данные в (width - DOT_MARGIN).
  const DOT_MARGIN = 8;
  const plotW = width - DOT_MARGIN;
  const points = plotData.map((v, i) => ({ x: (i / (plotData.length - 1)) * plotW, y: valueToY(v) }));
  const line = monotonePath(points);
  const area = `${line} L${points[points.length - 1].x} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="capChartFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#21A870" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#21A870" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="capChartLine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#2CE296" />
            <Stop offset="0.54" stopColor="#21A870" />
          </LinearGradient>
        </Defs>
        {gridValues.map((v) => (
          <Line
            key={v}
            x1={0}
            y1={valueToY(v)}
            x2={width}
            y2={valueToY(v)}
            stroke="rgba(152,162,183,0.35)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        ))}
        <Path d={area} fill="url(#capChartFill)" />
        <Path d={line} stroke="url(#capChartLine)" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={last.x} cy={last.y} r={4} fill="#21A870" />
        <Circle cx={last.x} cy={last.y} r={7} fill="#21A870" fillOpacity={0.25} />
      </Svg>
      {gridValues.map((v) => (
        <View key={v} style={[styles.axisLabel, { top: valueToY(v) - 11 }]}>
          <Text style={styles.axisLabelText}>{formatAxisLabel(v)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  axisLabel: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(249,250,255,0.6)',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  axisLabelText: { fontSize: 11, fontFamily: font.medium, color: '#8A99C4' },
});
