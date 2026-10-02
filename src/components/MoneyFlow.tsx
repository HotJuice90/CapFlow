import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { formatMoney, type MoneyOptions } from '@/format';
import { positionAt } from './odometer';

/**
 * Денежное число-одометр: при появлении экрана набегает с 90% суммы, быстро
 * прокручивается и тормозит до медленного переката последней цифры.
 *
 * Это украшение, а не отражение расчёта. Живой счётчик «сколько накапало за
 * секунду» пробовали и выкинули: его темп зависит от размера капитала, и у
 * крупных сумм копейки мельтешили.
 *
 * Как устроено. Каждая цифра — лента «0…9 0» в окошке высотой в строку, и
 * двигает её UI-поток: одно общее число `u` анимируется через `withTiming`, а
 * каждая лента вычисляет из него своё смещение. React за всё время набега не
 * перерисовывается ни разу. Прошлые версии гоняли состояние через JS 25 раз
 * в секунду, и каждая смена цифры перезапускала её перекат с нуля, — плавности
 * так не бывает в принципе.
 *
 * `u` — это ЦИФРЫ итоговой строки, склеенные в целое: «1 877,21 ₽» → 187721,
 * «6,9 млн ₽» → 69. Анимируем в единицах отображения, а не в рублях, поэтому
 * в покое ленты показывают ровно то, что выдал `formatMoney`, — с его
 * округлением, копейками и «млн», без второй копии правил.
 */
export interface MoneyFlowProps {
  value: number;
  /** Приписка перед числом — обычно «+». Не перекатывается: знак не меняется. */
  prefix?: string;
  options?: MoneyOptions;
  style?: StyleProp<TextStyle>;
}

/** Набег при появлении экрана. */
const INTRO_MS = 650;
/** Смена значения, пока экран на виду (месяц в графике, свежие данные). */
const CHANGE_MS = 450;
/** Откуда стартуем — 90% суммы. */
const START_AT = 0.9;
const STRIP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const isDigit = (c: string) => c >= '0' && c <= '9';

export function MoneyFlow({ value, prefix = '', options, style }: MoneyFlowProps) {
  const text = prefix + formatMoney(value, options);
  const { target, count, signature } = useMemo(() => {
    let digits = '';
    for (const c of text) if (isDigit(c)) digits += c;
    return {
      target: digits ? Number(digits) : 0,
      count: digits.length,
      // Каркас строки без цифр: разряды, запятая, «млн», валюта.
      signature: text.replace(/\d/g, '#'),
    };
  }, [text]);

  // Стартовое значение сразу итоговое: до фокуса экрана число верное.
  const u = useSharedValue(target);
  const shape = useRef(signature);

  // Новое значение, пока экран на виду. Если каркас тот же — плавно катимся
  // к нему; если поменялся (стало больше разрядов, появились копейки) —
  // ставим сразу: единицы `u` у старого и нового каркаса разные.
  useEffect(() => {
    if (shape.current !== signature) {
      shape.current = signature;
      u.value = target;
      return;
    }
    u.value = withTiming(target, { duration: CHANGE_MS, easing: Easing.out(Easing.cubic) });
  }, [target, signature, u]);

  useFocusEffect(
    useCallback(() => {
      if (count === 0) return;
      // Стартуем не ниже наименьшего числа с тем же количеством разрядов:
      // иначе слева на время набега вылез бы лишний ноль.
      const floor = count > 1 ? Math.pow(10, count - 1) : 0;
      u.value = Math.max(Math.round(target * START_AT), floor);
      u.value = withTiming(target, { duration: INTRO_MS, easing: Easing.out(Easing.cubic) });
    }, [target, count, u]),
  );

  const height = StyleSheet.flatten(style)?.lineHeight;
  const textStyle = [style, s.tnum, height ? { height } : null];
  const chars = [...text];
  let place = count;

  return (
    <View style={s.row}>
      {chars.map((c, i) => {
        const key = chars.length - i;
        if (!isDigit(c)) return <Text key={`s${key}`} style={textStyle}>{c}</Text>;
        place -= 1;
        // Без известной высоты строки ленту не рисуем — лучше честный текст,
        // чем окошко, схлопнутое в ноль.
        if (!height) return <Text key={`d${key}`} style={textStyle}>{c}</Text>;
        return <Column key={`d${place}`} u={u} place={place} height={height} textStyle={textStyle} />;
      })}
    </View>
  );
}

/** Лента одного разряда в окошке высотой в строку. */
function Column({
  u,
  place,
  height,
  textStyle,
}: {
  u: SharedValue<number>;
  place: number;
  height: number;
  textStyle: StyleProp<TextStyle>;
}) {
  const strip = useAnimatedStyle(() => ({
    transform: [{ translateY: -positionAt(u.value, place) * height }],
  }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={strip}>
        {STRIP.map((d, j) => (
          <Text key={j} style={textStyle}>{d}</Text>
        ))}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  // Табличные цифры: в Onest они пропорциональные (единица почти вдвое уже
  // нуля), и без `tnum` число дрожало бы по ширине на каждом шаге ленты.
  tnum: { fontVariant: ['tabular-nums'] },
});
