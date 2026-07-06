import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { tokens } from '@/theme';

/** Свой переключатель вместо системного Switch — плоский, в акцентном цвете бренда. */
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.surface.neutral, tokens.accent.base],
  });
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });

  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8}>
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 46, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 3px rgba(0,0,0,0.15)',
  },
});
