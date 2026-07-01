import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tintToWhite } from '@/theme';

// Цветные
import Alfa from '../../assets/banks/alfa.svg';
import Gazprom from '../../assets/banks/gazprom.svg';
import Mts from '../../assets/banks/mts.svg';
import Otp from '../../assets/banks/otp.svg';
import Ozon from '../../assets/banks/ozon.svg';
import Sber from '../../assets/banks/sber.svg';
import Sovcom from '../../assets/banks/sovcom.svg';
import Tbank from '../../assets/banks/tbank.svg';
import Vtb from '../../assets/banks/vtb.svg';
import Wb from '../../assets/banks/wb.svg';
import Yandex from '../../assets/banks/yandex.svg';
// Белые
import AlfaW from '../../assets/banks/alfa-w.svg';
import GazpromW from '../../assets/banks/gazprom-w.svg';
import MtsW from '../../assets/banks/mts-w.svg';
import OtpW from '../../assets/banks/otp-w.svg';
import OzonW from '../../assets/banks/ozon-w.svg';
import SberW from '../../assets/banks/sber-w.svg';
import SovcomW from '../../assets/banks/sovcom-w.svg';
import TbankW from '../../assets/banks/tbank-w.svg';
import VtbW from '../../assets/banks/vtb-w.svg';
import WbW from '../../assets/banks/wb-w.svg';
import YandexW from '../../assets/banks/yandex-w.svg';

const COLOR: Record<string, React.FC<any>> = {
  alfa: Alfa, gazprombank: Gazprom, mts: Mts, otp: Otp, ozon: Ozon,
  sber: Sber, sovcombank: Sovcom, tinkoff: Tbank, tbank: Tbank, vtb: Vtb, wb: Wb, yandex: Yandex,
};
const WHITE: Record<string, React.FC<any>> = {
  alfa: AlfaW, gazprombank: GazpromW, mts: MtsW, otp: OtpW, ozon: OzonW,
  sber: SberW, sovcombank: SovcomW, tinkoff: TbankW, tbank: TbankW, vtb: VtbW, wb: WbW, yandex: YandexW,
};

export function hasBankLogo(bankId?: string): boolean {
  return !!bankId && !!COLOR[bankId];
}

function letter(name: string) {
  const m = name.trim().match(/[A-Za-zА-Яа-яЁё0-9]/);
  return (m ? m[0] : '?').toUpperCase();
}

interface Props {
  bankId?: string;
  name?: string;
  size?: number;
  variant?: 'color' | 'white';
  fallbackColor?: string;
}

/** Лого банка из SVG-набора. Нет в наборе → буква на цветном круге. */
export function BankLogo({ bankId, name = '', size = 24, variant = 'color', fallbackColor = '#7C6CF6' }: Props) {
  const map = variant === 'white' ? WHITE : COLOR;
  const Svg = bankId ? map[bankId] : undefined;
  if (Svg) return <Svg width={size} height={size} />;
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: variant === 'white' ? 'transparent' : fallbackColor }]}>
      <Text style={{ color: variant === 'white' ? fallbackColor : '#fff', fontSize: size * 0.42, fontWeight: '800' }}>{letter(name)}</Text>
    </View>
  );
}

/**
 * Единый бейдж организации — ЛОГО банка на подложке фирменного цвета,
 * либо цветной кружок-заглушка. Используется ВЕЗДЕ, где показываем организацию,
 * чтобы привязка лого↔банк была сквозной.
 */
export function OrgLogo({
  color, logo, size = 36, radius,
}: {
  color: string; logo?: string; size?: number; radius?: number;
}) {
  const br = radius ?? Math.round(size / 4);
  if (hasBankLogo(logo)) {
    return (
      <View style={[styles.orgBox, { width: size, height: size, borderRadius: br, backgroundColor: tintToWhite(color, 0.88) }]}>
        <BankLogo bankId={logo} size={Math.round(size * 0.78)} />
      </View>
    );
  }
  return <View style={{ width: size, height: size, borderRadius: br, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  fallback: { justifyContent: 'center', alignItems: 'center' },
  orgBox: { alignItems: 'center', justifyContent: 'center' },
});
