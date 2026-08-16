import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tapBuzz } from '@/lib/haptics';
import { tokens } from '@/theme';

type Item<T extends string> = { key: T; label: string };
type Layout = { x: number; width: number };

type SlidingChipTabsProps<T extends string> = {
  items: Item<T>[];
  value: T;
  onChange: (key: T) => void;
  trackStyle?: StyleProp<ViewStyle>;
  chipStyle: StyleProp<ViewStyle>;
  pillColor: string;
  textStyle: StyleProp<TextStyle>;
  textColorOff: string;
  textColorOn: string;
  activeFontFamily?: string;
};

/**
 * Ряд чипов с ОДНОЙ ползущей плашкой-подложкой под активным пунктом (не
 * равноширинные flex-сегменты, как SegmentedTabs, а измеренные onLayout
 * произвольной ширины — годится для скроллящихся рядов валют/периодов).
 * Плашка — SharedValue x/width, withTiming к позиции активного чипа.
 */
export function SlidingChipTabs<T extends string>({
  items,
  value,
  onChange,
  trackStyle,
  chipStyle,
  pillColor,
  textStyle,
  textColorOff,
  textColorOn,
  activeFontFamily,
}: SlidingChipTabsProps<T>) {
  const layouts = useRef<Partial<Record<T, Layout>>>({}).current;
  // Именно состояние, а не ref: до первого onLayout пилюли нет вовсе, и активный
  // чип должен покраситься сам — а для этого нужен ре-рендер по факту замера.
  const [measured, setMeasured] = useState(false);
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);

  const applyPill = (animate: boolean) => {
    const l = layouts[value];
    if (!l) return;
    if (animate) {
      pillX.value = withTiming(l.x, { duration: 260, easing: Easing.out(Easing.cubic) });
      pillW.value = withTiming(l.width, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else {
      pillX.value = l.x;
      pillW.value = l.width;
    }
  };

  useEffect(() => {
    applyPill(measured);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onItemLayout = (key: T) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layouts[key] = { x, width };
    if (key === value && !measured) {
      applyPill(false);
      setMeasured(true);
    }
  };

  // Пока замеров нет (pillW === 0), воркет НЕ возвращает геометрию вообще —
  // иначе он затирал бы статическую ширину нулём. Анимированный стиль всегда
  // перебивает обычный, поэтому «подстраховать» его статикой не выйдет: пока
  // width лежал здесь, статическая ширина ниже была мёртвым кодом, пилюля
  // висела нулевой, а фолбэк-фон к тому моменту уже снимался по measured —
  // получался белый текст на пустом треке.
  const pillStyle = useAnimatedStyle(() =>
    (pillW.value > 0
      ? { width: pillW.value, transform: [{ translateX: pillX.value }] }
      : {}),
  );

  // Замеренная геометрия активного чипа обычным стилем. Анимированный стиль
  // применяется воркетом уже ПОСЛЕ коммита, и без этого пилюля до первого
  // прохода Reanimated висит вью нулевой ширины — невидимой; на занятом
  // JS-потоке это тянется секундами и читается как «таб подгружается».
  const cur = layouts[value];

  return (
    <View style={[styles.track, trackStyle]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          { backgroundColor: pillColor },
          cur ? { width: cur.width, transform: [{ translateX: cur.x }] } : null,
          pillStyle,
        ]}
      />
      {items.map((item) => (
        <ChipLabel
          key={item.key}
          active={item.key === value}
          label={item.label}
          // До первого замера пилюли нет — активный чип красится собственным
          // фоном, иначе на первом кадре ряд показывался без выделения вообще.
          chipStyle={[chipStyle, !measured && item.key === value && { backgroundColor: pillColor }]}
          textStyle={textStyle}
          textColorOff={textColorOff}
          textColorOn={textColorOn}
          activeFontFamily={activeFontFamily}
          onLayout={onItemLayout(item.key)}
          onPress={() => {
            if (item.key !== value) {
              tapBuzz();
              onChange(item.key);
            }
          }}
        />
      ))}
    </View>
  );
}

function ChipLabel({
  active, label, chipStyle, textStyle, textColorOff, textColorOn, activeFontFamily, onLayout, onPress,
}: {
  active: boolean;
  label: string;
  chipStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  textColorOff: string;
  textColorOn: string;
  activeFontFamily?: string;
  onLayout: (e: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [active, progress]);

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textColorOff, textColorOn]),
  }));

  return (
    <Pressable style={chipStyle} onLayout={onLayout} onPress={onPress}>
      {/* Цвет дублируется обычным стилем: анимированный применяется воркетом
          после коммита, и на первом кадре подпись иначе брала цвет по
          умолчанию, а не своё состояние. */}
      <Animated.Text style={[textStyle, { color: active ? textColorOn : textColorOff }, labelStyle, active && activeFontFamily ? { fontFamily: activeFontFamily } : null]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const styles = {
  track: { flexDirection: 'row' as const, position: 'relative' as const },
  pill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, borderRadius: tokens.radius.pill },
};
