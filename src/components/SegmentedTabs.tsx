import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { tapBuzz } from '@/lib/haptics';
import { tokens } from '@/theme';

type Segment<T extends string> = { key: T; label: string };

type SegmentedTabsProps<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
  renderLabel: (segment: Segment<T>, active: boolean) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
  trackColor: string;
  pillColor: string;
};

/**
 * Сегментированный переключатель с одной скользящей плашкой под активным
 * пунктом (вместо мгновенного snap фона) — reanimated withTiming по X.
 * Годится для равноширинных сегментов (flex:1 каждый), пилюля меряется
 * от общей ширины трека / кол-ва сегментов.
 */
export function SegmentedTabs<T extends string>({
  segments,
  value,
  onChange,
  renderLabel,
  style,
  trackColor,
  pillColor,
}: SegmentedTabsProps<T>) {
  const [width, setWidth] = useState(0);
  const idx = Math.max(0, segments.findIndex((s) => s.key === value));
  const segW = width / segments.length;
  const pos = useSharedValue(0);
  // Пилюлю нельзя нарисовать до onLayout — ширины ещё нет. Первую установку
  // делаем БЕЗ анимации: иначе на монтировании она едет из нуля, и при активном
  // не-первом сегменте это видно как влёт плашки слева.
  const positioned = useRef(false);
  const measured = width > 0;

  useEffect(() => {
    if (!measured) return;
    if (!positioned.current) {
      positioned.current = true;
      pos.value = idx * segW;
      return;
    }
    pos.value = withTiming(idx * segW, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [idx, segW, pos, measured]);

  // ТОЛЬКО положение. Ширину сюда класть нельзя: анимированный стиль
  // применяется воркетом на UI-потоке уже ПОСЛЕ коммита, и до первого прохода
  // Reanimated пилюля висела вью нулевой ширины — невидимой. На входе в экран,
  // где JS-поток занят (курсы, история, график), это растягивалось с кадра до
  // секунд и читалось как «активный таб подгружается».
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <Animated.View style={[styles.track, { backgroundColor: trackColor }, style]} onLayout={onLayout}>
      {measured ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            // Ширина и стартовое положение — обычным стилем, они известны на
            // рендере. Анимированный стиль ниже перебивает transform, когда
            // воркет доходит до дела; до этого пилюля уже нарисована и стоит
            // на своём месте, а не съезжает от левого края.
            { backgroundColor: pillColor, width: segW, transform: [{ translateX: idx * segW }] },
            pillStyle,
          ]}
        />
      ) : null}
      {segments.map((s) => {
        const active = s.key === value;
        return (
          <Pressable
            key={s.key}
            // До первого onLayout активный сегмент красится сам: скользящей
            // пилюли ещё нет, и без этого переключатель на первом кадре
            // показывался вообще без выделения — читалось как «подгружается».
            style={[styles.segment, !measured && active && { backgroundColor: pillColor, borderRadius: tokens.radius.pill }]}
            onPress={() => {
              if (!active) {
                tapBuzz();
                onChange(s.key);
              }
            }}
          >
            {renderLabel(s, active)}
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: tokens.radius.pill, position: 'relative' },
  pill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: tokens.radius.pill },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
