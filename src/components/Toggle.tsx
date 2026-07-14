import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { tokens } from '@/theme';

/** Свой переключатель вместо системного Switch — плоский, в акцентном цвете бренда. */
export function Toggle({
  value,
  onChange,
  interactive = true,
  offColor = tokens.surface.neutral,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  /** false — только визуал, без своего Pressable (тап уже обрабатывает родитель, напр. SettingsRow). */
  interactive?: boolean;
  /** Цвет трека в OFF — дефолт рассчитан на белую карточку под тумблером.
   *  На голом фоне экрана он сливается, для таких мест передать более
   *  контрастный (см. tabChip в каталоге инструментов). */
  offColor?: string;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [offColor, tokens.accent.base],
  });
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });

  const track = (
    <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbX }] }]} />
    </Animated.View>
  );

  if (!interactive) return track;

  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8}>
      {track}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 46, height: 28, borderRadius: 14 },
  thumb: {
    position: 'absolute',
    top: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.surface.white,
    boxShadow: '0px 1px 3px rgba(0,0,0,0.15)',
  },
});
