import React from 'react';
import { StyleSheet } from 'react-native';

// ВАЖНО: берём именно живой объект экспортов через require — это тот же объект,
// к свойствам которого обращаются экраны (`_reactNative.Text`). `import * as`
// дал бы запечатанный неймспейс, и переопределение не подействовало бы.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RN: any = require('react-native');

/**
 * Делает Onest шрифтом ПО УМОЛЧАНИЮ для всего приложения — без правки каждого стиля.
 *
 * Почему так: в RN 0.85 + React 19 `Text`/`TextInput` — обычные функции-компоненты
 * (ref как проп), у них нет `.render`, поэтому патч render не работает. Зато JSX `<Text>`
 * компилируется в `_reactNative.Text`, который читается при КАЖДОМ рендере. Значит,
 * достаточно переопределить само свойство `Text` в объекте экспортов react-native —
 * и все экраны, независимо от порядка импорта, начнут получать нашу обёртку.
 *
 * Обёртка читает исходный fontWeight и подставляет нужное начертание Onest
 * (на Android именованное семейство игнорирует fontWeight — поэтому семейство на
 * каждый вес своё, а fontWeight гасим в 'normal'). Явный fontFamily не трогаем.
 */

const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': 'Onest_400Regular',
  '200': 'Onest_400Regular',
  '300': 'Onest_400Regular',
  '400': 'Onest_400Regular',
  normal: 'Onest_400Regular',
  '500': 'Onest_500Medium',
  '600': 'Onest_600SemiBold',
  '700': 'Onest_700Bold',
  bold: 'Onest_700Bold',
  '800': 'Onest_800ExtraBold',
  '900': 'Onest_800ExtraBold',
};

function patchProps(props: any) {
  const flat: any = StyleSheet.flatten(props?.style) || {};
  if (flat.fontFamily) return props; // явное семейство выигрывает
  const weight = flat.fontWeight != null ? String(flat.fontWeight) : '400';
  const family = WEIGHT_TO_FAMILY[weight] || 'Onest_400Regular';
  return { ...props, style: [props?.style, { fontFamily: family, fontWeight: 'normal' }] };
}

function override(name: 'Text' | 'TextInput') {
  const Orig: any = RN[name];
  if (!Orig || (Orig as any).__onest) return;
  const Wrapped: any = React.forwardRef((props: any, ref: any) =>
    React.createElement(Orig, { ...patchProps(props), ref }),
  );
  Wrapped.displayName = `Onest(${name})`;
  Wrapped.__onest = true;
  try {
    Object.defineProperty(RN, name, { configurable: true, enumerable: true, value: Wrapped });
  } catch {
    // на случай, если свойство не конфигурируемо — тихо пропускаем
  }
}

let done = false;
export function applyGlobalFont() {
  if (done) return;
  done = true;
  override('Text');
  override('TextInput');
}
