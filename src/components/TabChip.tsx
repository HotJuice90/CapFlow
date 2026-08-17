import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { tapBuzz } from '@/lib/haptics';

type TabChipProps = {
  active: boolean;
  onPress: () => void;
  label: string;
  icon?: React.ReactNode;
  chipStyle: StyleProp<ViewStyle>;
  bgOff: string;
  bgOn: string;
  textStyle: StyleProp<TextStyle>;
  textColorOff: string;
  textColorOn: string;
  activeFontFamily?: string;
  haptics?: boolean;
};

/**
 * Плавный чип-переключатель (фон + цвет текста crossfade вместо мгновенного
 * snap). Иконку красит вызывающий код — она по-прежнему переключается
 * мгновенно, это не так заметно, как скачок фона/текста.
 *
 * Классический `Animated`, как в SegmentedTabs/SlidingChipTabs (там же
 * подробный разбор почему): значение анимации попадает в нативные пропсы того
 * же коммита, поэтому чип покрашен верно с первого кадра и дублировать цвета
 * обычным стилем «на подстраховку» не нужно.
 */
export function TabChip({
  active,
  onPress,
  label,
  icon,
  chipStyle,
  bgOff,
  bgOn,
  textStyle,
  textColorOff,
  textColorOn,
  activeFontFamily,
  haptics = true,
}: TabChipProps) {
  const [progress] = useState(() => new Animated.Value(active ? 1 : 0));
  // Первое состояние выставлено прямо в конструкторе значения выше, поэтому
  // эффект на монтировании анимировать нечего — иначе чип въезжал бы в свой
  // же цвет из противоположного.
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // useNativeDriver: false — цвет нативному драйверу не отдать. Для тапа это
    // безопасно, жеста здесь нет.
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const backgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [bgOff, bgOn] });
  const color = progress.interpolate({ inputRange: [0, 1], outputRange: [textColorOff, textColorOn] });

  return (
    <Pressable
      onPress={() => {
        if (!active && haptics) tapBuzz();
        onPress();
      }}
    >
      <Animated.View style={[chipStyle, { backgroundColor }]}>
        {icon}
        <Animated.Text style={[textStyle, { color }, active && activeFontFamily ? { fontFamily: activeFontFamily } : null]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}
