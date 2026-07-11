import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { tokens, font, hexToRgba } from '@/theme';

/**
 * Кольцевой сектор с рУчным скруглением углов (радиус `corner`, а не
 * strokeLinecap="round" на всю толщину штриха) — рисуется как заполненный
 * путь: внешняя дуга → скруглённый угол (квадратичная безье с исходным
 * острым углом как control point — стандартный приём округления угла без
 * тяжёлой тригонометрии) → внутренняя дуга → скруглённый угол обратно.
 * Угол 0° = 3 часа, растёт по часовой (стандартные экранные координаты).
 */
function ringSectorPath(cx: number, cy: number, rInner: number, rOuter: number, a0Deg: number, a1Deg: number, corner: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (r: number, deg: number) => ({ x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) });

  const dOuter = Math.min((corner / rOuter) * (180 / Math.PI), (a1Deg - a0Deg) / 2);
  const dInner = Math.min((corner / rInner) * (180 / Math.PI), (a1Deg - a0Deg) / 2);
  const k = Math.min(corner, (rOuter - rInner) / 2);

  const outerStart = pt(rOuter, a0Deg + dOuter);
  const outerEnd = pt(rOuter, a1Deg - dOuter);
  const outerCornerStart = pt(rOuter, a0Deg);
  const outerCornerEnd = pt(rOuter, a1Deg);
  const edgeEndOuterSide = pt(rOuter - k, a1Deg);
  const edgeEndInnerSide = pt(rInner + k, a1Deg);
  const innerCornerEnd = pt(rInner, a1Deg);
  const innerStart = pt(rInner, a1Deg - dInner);
  const innerEnd = pt(rInner, a0Deg + dInner);
  const innerCornerStart = pt(rInner, a0Deg);
  const edgeStartInnerSide = pt(rInner + k, a0Deg);
  const edgeStartOuterSide = pt(rOuter - k, a0Deg);

  const span = a1Deg - a0Deg;
  const largeArc = span > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `Q ${outerCornerEnd.x} ${outerCornerEnd.y} ${edgeEndOuterSide.x} ${edgeEndOuterSide.y}`,
    `L ${edgeEndInnerSide.x} ${edgeEndInnerSide.y}`,
    `Q ${innerCornerEnd.x} ${innerCornerEnd.y} ${innerStart.x} ${innerStart.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    `Q ${innerCornerStart.x} ${innerCornerStart.y} ${edgeStartInnerSide.x} ${edgeStartInnerSide.y}`,
    `L ${edgeStartOuterSide.x} ${edgeStartOuterSide.y}`,
    `Q ${outerCornerStart.x} ${outerCornerStart.y} ${outerStart.x} ${outerStart.y}`,
    'Z',
  ].join(' ');
}

/**
 * «Перетягивание каната»: у каждой стороны СВОЙ полюс — «было» всегда на
 * 9 часах, «сейчас» на 3 часах — растёт симметрично от своего полюса к
 * чужому (сверху и снизу поровну), при равенстве — ровно вертикальный разрез
 * пополам. База — now/(now+prev): всегда в (0..1), не ломается на любых
 * числах (в отличие от процента роста, который может быть >100% или
 * отрицательным) — но сама по себе слишком сжата (100% роста даёт лишь ~67%
 * кольца, 200% — ~75%). Отклонение от 50% растягиваем в 1.8 раза и упираем в
 * потолок ±45%, чтобы 100% роста давало ~80% кольца, а 200%+ — все примерно
 * одинаковые ~95% (сам процент точнее видно в центре). Между секторами —
 * небольшой зазор (не встык).
 *
 * «Было» — ВСЕГДА статично-нейтральная (текст и дуга), никогда не красится и
 * не полужирнеет, сколько бы она ни занимала кольца. Реагирует только
 * «сейчас»: зелёный при росте, обычный текстовый (не тревожный) цвет при
 * просадке — красный оставлен только проценту в центре, единственному месту
 * с честным знаком.
 */
export function CompareDonut({
  prev,
  now,
  size = 140,
  strokeWidth = 21,
  cornerRadius = 4,
  gapPx = 2,
  neutralColor = '#DADFEA', // чуть темнее accent.soft — той же лавандовой подложки, что у кнопок календаря, но заметнее на кольце
  centerLabel,
  centerSub,
}: {
  prev: number;
  now: number;
  size?: number;
  strokeWidth?: number;
  cornerRadius?: number;
  /** Зазор между секторами в пикселях (переводится в градусы по среднему радиусу кольца). */
  gapPx?: number;
  neutralColor?: string;
  centerLabel?: string;
  centerSub?: string;
}) {
  const safePrev = Math.max(prev, 0);
  const safeNow = Math.max(now, 0);
  const total = safePrev + safeNow;
  const shareNowRaw = total > 0 ? safeNow / total : 0.5;

  const STRETCH = 1.8;
  const MAX_DEVIATION = 0.45;
  const deviation = Math.max(-MAX_DEVIATION, Math.min(MAX_DEVIATION, (shareNowRaw - 0.5) * STRETCH));
  const shareNow = 0.5 + deviation;
  const sharePrev = 1 - shareNow;

  const nowWins = now >= prev;
  const trueAccent = nowWins ? tokens.semantic.positive : tokens.semantic.negative;

  const rOuter = size / 2;
  const rInner = rOuter - strokeWidth;
  const cx = rOuter;
  const cy = rOuter;
  const midRadius = (rOuter + rInner) / 2;
  const gapDeg = (gapPx / midRadius) * (180 / Math.PI);
  const halfGap = gapDeg / 2;

  // «сейчас» центрирован на 0° (3 часа), «было» на 180° (9 часов) — зазор
  // срезаем по halfGap с каждого конца каждого сектора.
  const nowPath = ringSectorPath(cx, cy, rInner, rOuter, -shareNow * 180 + halfGap, shareNow * 180 - halfGap, cornerRadius);
  const prevPath = ringSectorPath(cx, cy, rInner, rOuter, 180 - sharePrev * 180 + halfGap, 180 + sharePrev * 180 - halfGap, cornerRadius);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="nowGrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0" stopColor="#2CE296" />
            <Stop offset="1" stopColor="#21A870" />
          </LinearGradient>
        </Defs>
        <Path d={prevPath} fill={neutralColor} />
        <Path d={nowPath} fill={nowWins ? 'url(#nowGrowGradient)' : tokens.accent.base} />
      </Svg>
      {centerLabel ? (
        <View style={styles.center} pointerEvents="none">
          <Text style={[styles.centerLabel, { color: trueAccent }]} numberOfLines={1} adjustsFontSizeToFit>{centerLabel}</Text>
          {centerSub ? <Text style={styles.centerSub} numberOfLines={1} adjustsFontSizeToFit>{centerSub}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerLabel: { fontSize: 24, lineHeight: 26, fontFamily: font.bold },
  centerSub: { fontSize: 12, lineHeight: 14, fontFamily: font.medium, color: hexToRgba('#212121', 0.5), letterSpacing: -0.24, marginTop: 2 },
});
