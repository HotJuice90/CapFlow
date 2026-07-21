import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    pos.value = withTiming(idx * segW, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [idx, segW, pos]);

  const pillStyle = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: pos.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <Animated.View style={[styles.track, { backgroundColor: trackColor }, style]} onLayout={onLayout}>
      {width > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: pillColor }, pillStyle]} />
      ) : null}
      {segments.map((s) => {
        const active = s.key === value;
        return (
          <Pressable
            key={s.key}
            style={styles.segment}
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
