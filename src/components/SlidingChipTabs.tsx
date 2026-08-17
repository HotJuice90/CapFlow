import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
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
 *
 * Намеренно на КЛАССИЧЕСКОМ `Animated`, а не на reanimated. Причина не в
 * привычке: `Animated.Value` кладётся прямо в стиль, его текущее значение
 * читается при рендере и попадает в нативные пропсы того же коммита, а
 * `setValue` толкает значение в нативную вью сразу. Поэтому плашка встаёт на
 * место в том же кадре, в котором пришли замеры.
 *
 * `useAnimatedStyle` из reanimated так не умеет: он считается на UI-потоке ВНЕ
 * коммита React, апдейты shared value уезжают туда асинхронно, и до их приезда
 * анимированный стиль навязывает width: 0, перебивая любой обычный стиль (он
 * всегда главнее). На занятом JS-потоке это давало «активный таб появляется
 * позже заливки» — ловили несколько сборок подряд.
 *
 * Запрет на классический `Animated` из CLAUDE.md здесь НЕ действует: он про
 * ЖЕСТОВЫЕ анимации, где native driver не умеет width/backgroundColor и всё
 * дёргается на JS-потоке при нативном флике. Тут анимация от тапа, жеста нет.
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
  const [pillX] = useState(() => new Animated.Value(0));
  const [pillW] = useState(() => new Animated.Value(0));
  // Первую установку делаем без анимации: иначе плашка едет из нуля на
  // монтировании, и при активном не-первом чипе это видно как влёт слева.
  const placed = useRef(false);

  const movePill = (key: T, animate: boolean) => {
    const l = layouts[key];
    if (!l) return;
    if (animate) {
      Animated.parallel([
        // useNativeDriver: false обязателен — width нативному драйверу не
        // отдать, а гнать половину анимации по одному пути, половину по
        // другому нельзя. Для тапа это безопасно: JS-поток свободен, в
        // отличие от жестовой анимации, где кадры пришлось бы делить с фликом.
        Animated.timing(pillX, { toValue: l.x, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(pillW, { toValue: l.width, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    } else {
      pillX.setValue(l.x);
      pillW.setValue(l.width);
    }
  };

  useEffect(() => {
    movePill(value, placed.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onItemLayout = (key: T) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layouts[key] = { x, width };
    if (key === value && !placed.current) {
      placed.current = true;
      movePill(key, false);
    }
  };

  return (
    <View style={[styles.track, trackStyle]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { backgroundColor: pillColor, width: pillW, transform: [{ translateX: pillX }] }]}
      />
      {items.map((item) => {
        const active = item.key === value;
        return (
          <ChipLabel
            key={item.key}
            active={active}
            label={item.label}
            chipStyle={chipStyle}
            textStyle={textStyle}
            textColorOff={textColorOff}
            textColorOn={textColorOn}
            activeFontFamily={activeFontFamily}
            onLayout={onItemLayout(item.key)}
            onPress={() => {
              if (!active) {
                tapBuzz();
                onChange(item.key);
              }
            }}
          />
        );
      })}
    </View>
  );
}

/** Подпись чипа с crossfade цвета — тот же приём, что и в TabChip. */
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
  const [progress] = useState(() => new Animated.Value(active ? 1 : 0));
  // Стартовое состояние задано в самом значении, поэтому на монтировании
  // анимировать нечего — иначе подпись въезжала бы в свой же цвет.
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const color = progress.interpolate({ inputRange: [0, 1], outputRange: [textColorOff, textColorOn] });

  return (
    <Pressable style={chipStyle} onLayout={onLayout} onPress={onPress}>
      <Animated.Text style={[textStyle, { color }, active && activeFontFamily ? { fontFamily: activeFontFamily } : null]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const styles = {
  track: { flexDirection: 'row' as const, position: 'relative' as const },
  pill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, borderRadius: tokens.radius.pill },
};
