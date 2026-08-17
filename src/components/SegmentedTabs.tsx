import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
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
 * пунктом (вместо мгновенного snap фона). Годится для равноширинных сегментов
 * (flex:1 каждый), плашка меряется от общей ширины трека / кол-ва сегментов.
 *
 * Намеренно на КЛАССИЧЕСКОМ `Animated` — см. подробный разбор в
 * SlidingChipTabs: `Animated.Value` попадает в нативные пропсы того же
 * коммита, тогда как `useAnimatedStyle` считается на UI-потоке вне коммита и
 * до приезда апдейта навязывает нулевую геометрию, перебивая обычный стиль.
 * Запрет классического `Animated` из CLAUDE.md касается жестовых анимаций,
 * здесь анимация от тапа.
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
  const [pos] = useState(() => new Animated.Value(0));
  // Первую установку делаем без анимации: иначе плашка едет из нуля на
  // монтировании, и при активном не-первом сегменте это влёт слева.
  const placed = useRef(false);

  useEffect(() => {
    if (segW <= 0) return;
    if (!placed.current) {
      placed.current = true;
      pos.setValue(idx * segW);
      return;
    }
    // Ширина сегмента здесь постоянна, двигается только позиция — значит
    // transform можно отдать нативному драйверу.
    Animated.timing(pos, {
      toValue: idx * segW,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [idx, segW, pos]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <Animated.View style={[styles.track, { backgroundColor: trackColor }, style]} onLayout={onLayout}>
      {/* Ширина — обычным числом: она известна из замера трека и не
          анимируется, у всех сегментов одинаковая. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { backgroundColor: pillColor, width: segW, transform: [{ translateX: pos }] }]}
      />
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
