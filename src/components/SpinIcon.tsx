import React, { useEffect } from 'react';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const LAP_MS = 700;

/**
 * Крутит children на 360° по кругу, пока spinning === true (кнопки
 * «обновить» — курсы, ключевая ставка и т.п.). Круг всегда доводится
 * до конца целиком: если данные пришли раньше — доезжаем текущий
 * оборот и на этом останавливаемся (без отката назад к 0, это
 * выглядело бы как перемотка в обратную сторону).
 */
export function SpinIcon({ spinning, children }: { spinning: boolean; children: React.ReactNode }) {
  const rotation = useSharedValue(0);
  const wantSpin = useSharedValue(spinning);
  const active = useSharedValue(0);

  useEffect(() => {
    wantSpin.value = spinning;
    if (spinning && active.value === 0) {
      active.value = 1;
      spinLap(rotation, wantSpin, active);
    }
  }, [spinning, rotation, wantSpin, active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function spinLap(rotation: SharedValue<number>, wantSpin: SharedValue<boolean>, active: SharedValue<number>) {
  'worklet';
  rotation.value = withTiming(rotation.value + 360, { duration: LAP_MS, easing: Easing.linear }, (finished) => {
    if (finished) {
      if (wantSpin.value) {
        spinLap(rotation, wantSpin, active);
      } else {
        active.value = 0;
      }
    }
  });
}

/**
 * Один оборот на каждый вызов (счётчик trigger инкрементится снаружи) —
 * кнопки сброса (не «обновить», а разовое действие). direction: -1 —
 * против часовой. Изи-ин с резким доводом в конце (Easing.in(cubic)) —
 * не линейно, чувствуется «щелчок» на финише.
 */
export function RotateOnTap({
  trigger,
  direction = -1,
  duration = 260,
  children,
}: {
  trigger: number;
  direction?: 1 | -1;
  duration?: number;
  children: React.ReactNode;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    rotation.value = withTiming(rotation.value + direction * 360, { duration, easing: Easing.in(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
