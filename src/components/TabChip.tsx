import React, { useEffect } from 'react';
import { Pressable, StyleProp, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
 * Плавный чип-переключатель (фон + цвет текста crossfade через reanimated
 * вместо мгновенного snap). Иконку красит вызывающий код — она по-прежнему
 * переключается мгновенно, это не так заметно, как скачок фона/текста.
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
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [active, progress]);

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [bgOff, bgOn]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textColorOff, textColorOn]),
  }));

  return (
    <Pressable
      onPress={() => {
        if (!active && haptics) tapBuzz();
        onPress();
      }}
    >
      {/* Цвета дублируются обычным стилем перед анимированным: анимированный
          применяется воркетом уже ПОСЛЕ коммита, и на первом кадре чип иначе
          оставался без фона, а подпись — цвета по умолчанию. Анимированный
          стиль перебивает их, как только доходит до дела. */}
      <Animated.View style={[chipStyle, { backgroundColor: active ? bgOn : bgOff }, bgStyle]}>
        {icon}
        <Animated.Text style={[textStyle, { color: active ? textColorOn : textColorOff }, labelStyle, active && activeFontFamily ? { fontFamily: activeFontFamily } : null]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}
