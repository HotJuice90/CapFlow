import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { formatMoney, type MoneyOptions } from '@/format';

/**
 * Денежное число, которое НАБЕГАЕТ при появлении экрана: стартует с 90%
 * итоговой суммы, быстро прокручивается и тормозит до медленного переката
 * последней цифры.
 *
 * Это украшение, а не отражение расчёта. Живой счётчик «сколько накапало за
 * секунду» мы пробовали и выкинули: темп зависит от размера капитала, и у
 * крупных сумм копейки мельтешили до неприятного. Декоративный разгон
 * выглядит одинаково у всех и ничего не обещает.
 *
 * Форматирует обычным `formatMoney`, а не worklet-копией правил отображения:
 * Reanimated анимирует текст через `TextInput` + `useAnimatedProps`, и тогда
 * разряды, копейки, «млн» и символ валюты пришлось бы написать заново — копия
 * разъехалась бы с оригиналом на первой же правке.
 */
export interface MoneyFlowProps {
  value: number;
  /** Приписка перед числом — обычно «+». Не перекатывается: знак не меняется. */
  prefix?: string;
  options?: MoneyOptions;
  style?: StyleProp<TextStyle>;
}

/** Длительность набега. */
const INTRO_MS = 1100;
/** Кадров в секунду у набега: на сильном замедлении больше не нужно. */
const FPS = 25;
/** Откуда стартуем — 90% суммы: число на первом кадре почти верное. */
const START_AT = 0.9;
/** Перекат цифры: быстрый на разгоне, медленный на последних шагах. */
const ROLL_FAST = 90;
const ROLL_SLOW = 380;

const isDigit = (c: string) => c >= '0' && c <= '9';

/** Сильное замедление: первые кадры летят, последние еле ползут. */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

export function MoneyFlow({ value, prefix = '', options, style }: MoneyFlowProps) {
  // Стартовое значение сразу верное: пока экран не в фокусе, число не должно
  // быть ни нулём, ни промежуточным.
  const [shown, setShown] = useState(value);
  // Длительность переката берётся на момент смены цифры: в начале набега она
  // короткая, к концу — длинная. Отсюда и ощущение торможения.
  const [rollMs, setRollMs] = useState(ROLL_SLOW);
  const running = useRef(false);

  // Пришли новые данные — показываем их сразу, перекатом без разгона.
  useEffect(() => {
    if (!running.current) setShown(value);
  }, [value]);

  useFocusEffect(
    useCallback(() => {
      if (value === 0) return;
      running.current = true;
      const from = value * START_AT;
      const started = Date.now();
      setShown(from);
      const timer = setInterval(() => {
        const t = Math.min(1, (Date.now() - started) / INTRO_MS);
        const k = easeOutQuint(t);
        setShown(from + (value - from) * k);
        setRollMs(ROLL_FAST + (ROLL_SLOW - ROLL_FAST) * k);
        if (t >= 1) {
          clearInterval(timer);
          running.current = false;
        }
      }, 1000 / FPS);
      return () => {
        clearInterval(timer);
        running.current = false;
        setShown(value);
        setRollMs(ROLL_SLOW);
      };
    }, [value]),
  );

  const chars = [...(prefix + formatMoney(shown, options))];

  return (
    <View style={s.row}>
      {chars.map((c, i) =>
        isDigit(c) ? (
          // Ключ — позиция СПРАВА: когда число перескакивает разряд
          // (999 → 1 000), левый отсчёт сдвинул бы все ячейки, и перекатилось
          // бы всё число целиком вместо одной цифры.
          <Digit key={`d${chars.length - i}`} char={c} style={style} ms={rollMs} />
        ) : (
          <Text key={`s${chars.length - i}`} style={style}>{c}</Text>
        ),
      )}
    </View>
  );
}

/**
 * Одна цифра: при смене уезжает вверх, новая приходит снизу.
 *
 * Высоту берём из `lineHeight` стиля, а не меряем: замер приходит ПОСЛЕ
 * первого кадра, и до него обрезка схлопнула бы строку в ноль — та же грабля,
 * что с анимированной шириной у табов.
 */
function Digit({ char, style, ms }: { char: string; style?: StyleProp<TextStyle>; ms: number }) {
  const height = StyleSheet.flatten(style)?.lineHeight;
  const [curr, setCurr] = useState(char);
  const [prev, setPrev] = useState<string | null>(null);
  const t = useSharedValue(0);
  const msRef = useRef(ms);
  msRef.current = ms;

  useEffect(() => {
    if (char === curr) return;
    setPrev(curr);
    setCurr(char);
    t.value = 1;
    t.value = withTiming(0, { duration: msRef.current, easing: Easing.out(Easing.cubic) });
  }, [char, curr, t]);

  const currStyle = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * (height ?? 0) }] }));
  const prevStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (t.value - 1) * (height ?? 0) }],
  }));

  // Без известной высоты строки перекат не показываем — лучше честный текст,
  // чем схлопнутая в ноль строка.
  if (!height) return <Text style={style}>{char}</Text>;

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.Text style={[style, currStyle]}>{curr}</Animated.Text>
      {prev !== null ? (
        <Animated.Text style={[style, s.ghost, prevStyle]} pointerEvents="none">{prev}</Animated.Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  ghost: { position: 'absolute', left: 0, top: 0 },
});
