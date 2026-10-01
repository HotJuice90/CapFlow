import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { formatMoney, type MoneyOptions } from '@/format';

/**
 * Денежное число, цифры которого ПЕРЕКАТЫВАЮТСЯ снизу вверх, а не прыгают.
 *
 * Считает и форматирует на JS обычным `formatMoney`, а не в worklet. Reanimated
 * анимирует текст через `TextInput` + `useAnimatedProps`, и тогда форматтер
 * пришлось бы написать заново worklet-версией: разряды неразрывным пробелом,
 * копейки запятой, сокращение до «млн», символ валюты. Это копия правил
 * отображения, которая разъедется с оригиналом на первой же правке. Здесь
 * двигаются два-три текстовых узла, цена невелика, а правила остаются в
 * одном месте.
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

/** Длительность переката — как у остальных переходов в приложении. */
const DURATION = 420;
/** Шаг живого роста: одна копейка. Меньше на экране всё равно не видно. */
const STEP = 0.01;
/** Границы темпа: быстрее — мельтешит, медленнее — выглядит замершим. */
const MIN_TICK_MS = 220;
const MAX_TICK_MS = 3000;

/**
 * Делит «−1 250,50 ₽» на три части: целая, дробная и хвост с валютой.
 *
 * Перекатываем их по отдельности, а не строку целиком: копейки меняются
 * каждые полсекунды, и гонять вместе с ними все разряды — это уже не
 * счётчик, а мельтешение. Валюта не двигается вовсе, она не число.
 */
function split(text: string): [string, string, string] {
  const comma = text.indexOf(',');
  if (comma >= 0) {
    let end = comma + 1;
    while (end < text.length && text[end] >= '0' && text[end] <= '9') end++;
    return [text.slice(0, comma), text.slice(comma, end), text.slice(end)];
  }
  let end = text.length;
  while (end > 0 && !(text[end - 1] >= '0' && text[end - 1] <= '9')) end--;
  return [text.slice(0, end), '', text.slice(end)];
}

export function MoneyFlow({ value, perSecond = 0, prefix = '', options, style }: MoneyFlowProps) {
  // Стартовое значение сразу верное: число на первом кадре не должно быть ни
  // нулём, ни промежуточным (тот же канон, что у табов и hero-поля).
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const base = useRef({ value, at: Date.now() });
  const focused = useRef(true);
  shownRef.current = shown;

  // Новое значение из данных — перекат к нему и новая база живого роста.
  useEffect(() => {
    base.current = { value, at: Date.now() };
    setShown(value);
  }, [value]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      // Пока экран был в стороне, часы стояли: догоняем правду одним шагом,
      // чтобы потом снова идти ровно.
      if (perSecond > 0) {
        const elapsed = (Date.now() - base.current.at) / 1000;
        setShown(base.current.value + perSecond * elapsed);
      }
      return () => { focused.current = false; };
    }, [perSecond]),
  );

  // Живой рост. Шагаем РОВНО по копейке через равные промежутки, а не
  // пересчитываем от часов каждые N мс: при пересчёте копейка менялась то
  // через один тик, то через два, и ритм выходил рваный («раз-два-три, пауза,
  // раз-два»). Темп тот же самый, просто разложен поровну.
  useEffect(() => {
    if (perSecond <= 0) return;
    const tick = Math.min(MAX_TICK_MS, Math.max(MIN_TICK_MS, 1000 / (perSecond / STEP)));
    const timer = setInterval(() => {
      if (!focused.current) return;
      setShown((v) => v + STEP);
    }, tick);
    return () => clearInterval(timer);
  }, [perSecond]);

  const [int, frac, tail] = split(formatMoney(shown, options));

  return (
    <View style={s.row}>
      {prefix ? <Text style={style}>{prefix}</Text> : null}
      <Roll text={int} style={style} />
      {frac ? <Roll text={frac} style={style} /> : null}
      {tail ? <Text style={style}>{tail}</Text> : null}
    </View>
  );
}

/**
 * Кусок текста, который при смене уезжает вверх, а новый приходит снизу.
 *
 * Высоту берём из `lineHeight` стиля, а не меряем: замер приходит ПОСЛЕ
 * первого кадра, и до него обрезка схлопнула бы строку в ноль — та же грабля,
 * что с анимированной шириной у табов.
 */
function Roll({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const height = StyleSheet.flatten(style)?.lineHeight;
  const [curr, setCurr] = useState(text);
  const [prev, setPrev] = useState<string | null>(null);
  const t = useSharedValue(0);

  useEffect(() => {
    if (text === curr) return;
    setPrev(curr);
    setCurr(text);
    t.value = 1;
    t.value = withTiming(0, { duration: DURATION, easing: Easing.out(Easing.cubic) });
  }, [text, curr, t]);

  // Без известной высоты строки перекат не показываем — лучше честный текст,
  // чем схлопнутая в ноль строка.
  const currStyle = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * (height ?? 0) }] }));
  const prevStyle = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (t.value - 1) * (height ?? 0) }] }));

  if (!height) return <Text style={style}>{text}</Text>;

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
