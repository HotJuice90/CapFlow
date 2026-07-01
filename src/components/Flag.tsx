import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import type { CurrencyCode } from '@/domain/types';

// Круглые флаги-иконки (из макета Figma). Рендерятся как изображения —
// в отличие от эмодзи-флагов, которые на Android часто не отображаются.
const FLAGS: Record<CurrencyCode, any> = {
  RUB: require('../../assets/flags/RUB.png'),
  USD: require('../../assets/flags/USD.png'),
  EUR: require('../../assets/flags/EUR.png'),
  TRY: require('../../assets/flags/TRY.png'),
  KZT: require('../../assets/flags/KZT.png'),
  BYN: require('../../assets/flags/BYN.png'),
  CNY: require('../../assets/flags/CNY.png'),
  INR: require('../../assets/flags/INR.png'),
  AED: require('../../assets/flags/AED.png'),
  BRL: require('../../assets/flags/BRL.png'),
  ARS: require('../../assets/flags/ARS.png'),
};

export function Flag({ code, size = 28, style }: { code: CurrencyCode; size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={FLAGS[code]}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      resizeMode="cover"
    />
  );
}
