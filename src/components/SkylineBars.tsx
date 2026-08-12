import React, { Fragment } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { tokens } from '@/theme';

/**
 * «Скайлайн» — прямоугольные столбики внахлёст, силуэтом показывающие реальный
 * диапазон значений (не от нуля и не от базовой линии, а от min до max серии —
 * контраст между провалами/пиками нагляднее); `minSpanRatio` не даёт при этом
 * раздувать микроскопический разброс на всю высоту. У каждого бара — СВОЙ градиент
 * (userSpaceOnUse, координаты жёстко привязаны к его собственным x/y/height),
 * поэтому заливка не «размазывается» по всей ширине графика, а честно гаснет
 * сверху вниз внутри каждого блока отдельно. Сверху — сплошная черта-шапка.
 */
export function SkylineBars({
  data,
  width = 120,
  height = 56,
  color = tokens.accent.base,
  gap = 0,
  minSpanRatio = 0,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  gap?: number;
  /**
   * Минимальный вертикальный масштаб как доля от максимума серии. Ноль —
   * прежнее поведение (разброс всегда растягивается на всю высоту).
   *
   * Зачем: без пола амплитуда ничего не значит. Счёт, открытый 2 дня назад и
   * выросший на 699 ₽ из миллиона (0,07%), рисовался такой же драматичной
   * лестницей, как счёт, с которого сняли 100 000 — просто потому, что
   * растягивать больше нечего. Два актива рядом читались как «тут бурный рост,
   * а тут ровно», хотя на самом деле наоборот.
   *
   * С полом ровная линия честно значит «ничего существенного не произошло», а
   * ступенька появляется только когда реально двигались деньги.
   */
  minSpanRatio?: number;
}) {
  if (data.length < 2) return <Svg width={width} height={height} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(max - min, Math.abs(max) * minSpanRatio);
  const range = span || 1;
  // Пол повыше — самое низкое значение (даже если это провал на снятие) не должно
  // выглядеть, будто там «почти ничего нет», это всё ещё реальные деньги.
  const minBarH = Math.max(3, height * 0.32);
  const usableH = height - minBarH;
  const capH = 0.9;

  const n = data.length;
  const barW = Math.max(1, (width - gap * (n - 1)) / n);

  const bars = data.map((v, i) => {
    const norm = (v - min) / range;
    const h = minBarH + norm * usableH;
    const x = i * (barW + gap);
    const y = height - h;
    return { x, y, h };
  });

  return (
    <Svg width={width} height={height}>
      <Defs>
        {bars.map((b, i) => (
          <LinearGradient key={i} id={`skylineFill${i}`} x1="0" y1={b.y} x2="0" y2={height} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity={0.32} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0.1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        ))}
      </Defs>
      {bars.map((b, i) => (
        <Fragment key={i}>
          <Rect x={b.x} y={b.y} width={barW} height={b.h} fill={`url(#skylineFill${i})`} />
          <Rect x={b.x} y={b.y} width={barW} height={capH} fill={color} />
        </Fragment>
      ))}
    </Svg>
  );
}
