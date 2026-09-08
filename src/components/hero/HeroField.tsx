import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { HERO_SHADER } from './shader';

/**
 * Компиляция шейдера — на СТАРТЕ приложения и в try/catch. `Make` на ошибке
 * не всегда возвращает null: с нативной стороны она может и бросить, а это
 * модульный уровень — падение здесь уносит всё приложение ещё до первого
 * кадра. Без поля главная просто выглядит как раньше, это переживаемо.
 */
let effect: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
try {
  effect = Skia.RuntimeEffect.Make(HERO_SHADER);
} catch (e) {
  console.warn('HeroField: шейдер не скомпилировался', e);
}

export interface HeroFieldProps {
  /** Высота поля в пикселях. Фиксированная, а не измеренная: шейдеру размер
   *  нужен на ПЕРВОМ кадре, ждать onLayout — значит показать пустой верх. */
  height: number;
  /** 0..1 — насколько капитал сегодня «живой» (см. heroState). */
  intensity: number;
  /** 0..1 — сдвиг палитры в тёплый мятно-зелёный. */
  warmth: number;
}

export function HeroField({ height, intensity, warmth }: HeroFieldProps) {
  const { width } = useWindowDimensions();

  // Собственные часы, а не useClock() из Skia: их можно остановить. Экран
  // Skia перерисовывает на изменение shared value, поэтому замерший time —
  // это ноль работы на GPU, пока пользователь на другой вкладке.
  const time = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    'worklet';
    time.value += (info.timeSincePreviousFrame ?? 16) / 1000;
  }, false);

  useFocusEffect(
    useCallback(() => {
      frame.setActive(true);
      return () => frame.setActive(false);
    }, [frame]),
  );

  // Состояние приезжает не рывком, а перетекает — смена цифр не должна
  // выглядеть как переключение картинки.
  // Стартовое значение — в конструкторе, анимируем только последующие смены:
  // иначе на монтировании поле разгоняется из нуля на глазах у пользователя.
  const k = useSharedValue(intensity);
  const w = useSharedValue(warmth);
  useEffect(() => {
    const opts = { duration: 1400, easing: Easing.inOut(Easing.quad) };
    k.value = withTiming(intensity, opts);
    w.value = withTiming(warmth, opts);
  }, [intensity, warmth, k, w]);

  const uniforms = useDerivedValue(() => ({
    u_res: [width, height],
    u_time: time.value,
    u_intensity: k.value,
    u_warmth: w.value,
  }), [width, height]);

  const style = useMemo(() => [styles.canvas, { width, height }], [width, height]);
  if (!effect) return null;

  return (
    <Canvas style={style} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', top: 0, left: 0 },
});
