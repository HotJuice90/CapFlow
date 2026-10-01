import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { formatMoney, type MoneyOptions } from '@/format';

/**
 * Денежное число, у которого меняющиеся ЦИФРЫ перекатываются снизу вверх.
 *
 * Считает и форматирует на JS обычным `formatMoney`, а не в worklet. Reanimated
 * анимирует текст через `TextInput` + `useAnimatedProps`, и тогда форматтер
 * пришлось бы написать заново worklet-версией: разряды неразрывным пробелом,
 * копейки запятой, сокращение до «млн», символ валюты. Это копия правил
 * отображения, которая разъедется с оригиналом на первой же правке.
 *
 * `perSecond` — для величин, которые растут В РЕАЛЬНОМ ВРЕМЕНИ (капитал
 * действительно прибавляет копейки каждую секунду). Для фиксированных на день
 * сумм его передавать нельзя: крутить их — враньё.
 *
 * Часы останавливаются на расфокусе экрана — как у hero-поля.
 */
export interface MoneyFlowProps {
  value: number;
  /** Прирост в секунду; без него число перекатывается только при смене значения. */
  perSecond?: number;
  /** Приписка перед числом — обычно «+». Не перекатывается: знак не меняется. */
  prefix?: string;
  options?: MoneyOptions;
  style?: StyleProp<TextStyle>;
}

/**
 * Перекат заметно короче шага живого роста. Пока было наоборот, следующая
 * копейка приходила раньше, чем доезжала предыдущая, и число не замирало
 * никогда — выглядело как сорвавшийся счётчик.
 */
const ROLL_MS = 200;
/** Шаг живого роста: одна копейка. Меньше на экране всё равно не видно. */
const STEP = 0.01;
/** Границы темпа: быстрее — мельтешит, медленнее — выглядит замершим. */
const MIN_TICK_MS = 300;
const MAX_TICK_MS = 3000;

const isDigit = (c: string) => c >= '0' && c <= '9';

export function MoneyFlow({ value, perSecond = 0, prefix = '', options, style }: MoneyFlowProps) {
  // Стартовое значение сразу верное: число на первом кадре не должно быть ни
  // нулём, ни промежуточным (тот же канон, что у табов и hero-поля).
  const [shown, setShown] = useState(value);
  const base = useRef({ value, at: Date.now() });
  const focused = useRef(true);

  useEffect(() => {
    base.current = { value, at: Date.now() };
    setShown(value);
  }, [value]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      // Пока экран был в стороне, часы стояли: догоняем правду одним шагом,
      // чтобы дальше снова идти ровно.
      if (perSecond > 0) {
        setShown(base.current.value + perSecond * ((Date.now() - base.current.at) / 1000));
      }
      return () => { focused.current = false; };
    }, [perSecond]),
  );

  // Живой рост. Шагаем РОВНО по копейке через равные промежутки, а не
  // пересчитываем от часов каждые N мс: при пересчёте копейка менялась то
  // через один тик, то через два, и ритм выходил рваный.
  useEffect(() => {
    if (perSecond <= 0) return;
    const tick = Math.min(MAX_TICK_MS, Math.max(MIN_TICK_MS, 1000 / (perSecond / STEP)));
    const timer = setInterval(() => {
      if (focused.current) setShown((v) => v + STEP);
    }, tick);
    return () => clearInterval(timer);
  }, [perSecond]);

  const text = prefix + formatMoney(shown, options);
  const chars = [...text];

  return (
    <View style={s.row}>
      {chars.map((c, i) =>
        isDigit(c) ? (
          // Ключ — позиция СПРАВА: когда число перескакивает разряд
          // (999 → 1 000), левый отсчёт сдвинул бы все ячейки, и перекатилось
          // бы всё число целиком вместо одной цифры.
          <Digit key={`d${chars.length - i}`} char={c} style={style} />
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
function Digit({ char, style }: { char: string; style?: StyleProp<TextStyle> }) {
  const height = StyleSheet.flatten(style)?.lineHeight;
  const [curr, setCurr] = useState(char);
  const [prev, setPrev] = useState<string | null>(null);
  const t = useSharedValue(0);

  useEffect(() => {
    if (char === curr) return;
    setPrev(curr);
    setCurr(char);
    t.value = 1;
    t.value = withTiming(0, { duration: ROLL_MS, easing: Easing.out(Easing.cubic) });
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
