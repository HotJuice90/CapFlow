import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { formatMoney, type MoneyOptions } from '@/format';

/**
 * Денежное число, которое ПЕРЕТЕКАЕТ в новое значение, а не прыгает.
 *
 * Считает на JS и зовёт обычный `formatMoney`, а не форматирует в worklet.
 * Reanimated анимирует текст через `TextInput` + `useAnimatedProps`, и тогда
 * форматтер пришлось бы написать заново worklet-версией: разряды неразрывным
 * пробелом, копейки запятой, сокращение до «млн», символ валюты. Это копия
 * правил отображения, которая разъедется с оригиналом на первой же правке —
 * ровно тот класс багов, из-за которого график выплат пришлось сводить в одну
 * функцию. Здесь перерисовывается один-единственный текстовый узел, поэтому
 * цена JS-пути невелика, а правила отображения остаются в одном месте.
 *
 * `perSecond` — для величин, которые растут В РЕАЛЬНОМ ВРЕМЕНИ (капитал
 * действительно прибавляет копейки каждую секунду). Для фиксированных на день
 * сумм его передавать нельзя: крутить их — враньё.
 *
 * Часы останавливаются на расфокусе экрана — как у hero-поля.
 */
export interface MoneyFlowProps {
  value: number;
  /** Прирост в секунду; без него число просто перетекает при смене значения. */
  perSecond?: number;
  /** Приписка перед числом — обычно «+». Внутри компонента, чтобы знак не
   *  отрывался от суммы при `adjustsFontSizeToFit`. */
  prefix?: string;
  options?: MoneyOptions;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

/** Длительность перетекания — как у остальных переходов в приложении. */
const DURATION = 450;
/** Кадров в секунду у перетекания: на глаз неотличимо от 60, работы вчетверо меньше. */
const FPS = 30;
/** Тик живого роста: быстрее копейки всё равно не меняются на реальных суммах. */
const TICK_MS = 250;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function MoneyFlow({
  value,
  perSecond = 0,
  prefix = '',
  options,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: MoneyFlowProps) {
  // Стартовое значение — сразу верное: число на первом кадре не должно быть
  // ни нулём, ни промежуточным (тот же канон, что у табов и hero-поля).
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const focused = useRef(true);
  // База живого роста: значение из данных и момент, когда оно пришло.
  const base = useRef({ value, at: Date.now() });

  shownRef.current = shown;

  useEffect(() => {
    base.current = { value, at: Date.now() };
  }, [value]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => { focused.current = false; };
    }, []),
  );

  // Перетекание при смене значения.
  useEffect(() => {
    const from = shownRef.current;
    const to = value;
    if (from === to) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / DURATION);
      setShown(from + (to - from) * easeOutCubic(t));
      if (t >= 1) clearInterval(timer);
    }, 1000 / FPS);
    return () => clearInterval(timer);
  }, [value]);

  // Живой рост — только когда он реальный и экран на виду.
  useEffect(() => {
    if (perSecond <= 0) return;
    const timer = setInterval(() => {
      if (!focused.current) return;
      const elapsed = (Date.now() - base.current.at) / 1000;
      const target = base.current.value + perSecond * elapsed;
      // Во время перетекания не вмешиваемся: иначе два источника правды
      // дёргают число в разные стороны.
      if (Date.now() - base.current.at > DURATION) setShown(target);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [perSecond]);

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
    >
      {prefix}{formatMoney(shown, options)}
    </Text>
  );
}
