import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { tokens } from '@/theme';

/**
 * «Перетягивание каната»: в отличие от обычного Donut (дуги одна за другой
 * от 12 часов), тут у каждой стороны СВОЙ полюс — «было» всегда на 9 часах,
 * «сейчас» на 3 часах. Доля каждой стороны растёт симметрично от своего
 * полюса к чужому (сверху и снизу поровну), поэтому при равенстве получается
 * ровно вертикальный разрез пополам. База — now/(now+prev): всегда в (0..1),
 * не ломается на любых числах (в отличие от процента роста, который может
 * быть >100% или отрицательным) — но сама по себе слишком сжата (100% роста
 * даёт лишь ~67% кольца, 200% — ~75%). Отклонение от 50% растягиваем в 1.8
 * раза и упираем в потолок ±45%, чтобы 100% роста давало ~80% кольца, а
 * 200%+ — все примерно одинаковые ~95% (сам процент точнее видно в центре).
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
  size = 96,
  strokeWidth = 14,
  neutralColor = '#DADFEA', // чуть темнее accent.soft — той же лавандовой подложки, что у кнопок календаря, но заметнее на кольце
  centerLabel,
  centerSub,
}: {
  prev: number;
  now: number;
  size?: number;
  strokeWidth?: number;
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
  const nowColor = nowWins ? tokens.semantic.positive : tokens.accent.base;

  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* «Было» — центр дуги на 9 часах (180°), всегда статична, рисуется первой. */}
        <G rotation={180 - sharePrev * 180} origin={`${center}, ${center}`}>
          <Circle
            cx={center} cy={center} r={r}
            stroke={neutralColor} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${sharePrev * c} ${c - sharePrev * c}`}
            strokeLinecap="butt"
          />
        </G>
        {/* «Сейчас» — центр дуги на 3 часах (0°), всегда реагирует и рисуется
            поверх (скруглённые концы не подрезаются соседней дугой). */}
        <G rotation={-shareNow * 180} origin={`${center}, ${center}`}>
          <Circle
            cx={center} cy={center} r={r}
            stroke={nowColor} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${shareNow * c} ${c - shareNow * c}`}
            strokeLinecap="round"
          />
        </G>
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
  centerLabel: { fontSize: tokens.typography.title, fontWeight: '800' },
  centerSub: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },
});
