import React from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { tokens } from '@/theme';

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
      <Text style={{ color: variant === 'white' ? fallbackColor : tokens.text.inverse, fontSize: size * 0.42, fontWeight: '800' }}>{letter(name)}</Text>
    </View>
  );
}

/**
 * Единый бейдж организации. Три варианта:
 *  - tint (по умолчанию) — ЦВЕТНАЯ иконка на белой подложке с тонкой обводкой;
 *  - solid — БЕЛАЯ иконка на фирменном цвете банка;
 *  - bare — сама иконка без подложки/обводки (для мест, где рядом уже есть
 *    карточка-подложка другого элемента и своя плашка банка была бы лишней).
 * Используется ВЕЗДЕ, где показываем организацию, чтобы привязка лого↔банк была сквозной.
 */
export function OrgLogo({
  color, logo, imageUri, size = 36, radius, variant = 'tint', iconScale, bordered = true, fallbackIcon,
}: {
  color: string; logo?: string; imageUri?: string; size?: number; radius?: number;
  variant?: 'tint' | 'solid' | 'bare';
  /** доля площадки, которую занимает сама иконка внутри подложки (канон:
   *  0.6 — tint (цвет на белом), 0.7 — solid (белый на цвете, оптически «съёживается» сильнее). */
  iconScale?: number;
  /** волосяная рамка у белой подложки tint (канон — есть). Выключить там, где
   *  подложка и так лежит на белом фоне — отдельная рамка там избыточна. */
  bordered?: boolean;
  /** иконка на случай, если нет ни лого из каталога, ни своего фото — например,
   *  дефолт по типу площадки (Банк/Брокер/…), а не просто закрашенный квадрат. */
  fallbackIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const br = radius ?? Math.round(size / 4);
  const scale = iconScale ?? (variant === 'solid' ? 0.7 : 0.6);
  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={{ width: size, height: size, borderRadius: variant === 'bare' ? 0 : br }}
        resizeMode="cover"
      />
    );
  }
  if (hasBankLogo(logo)) {
    if (variant === 'solid') {
      return (
        <View style={[styles.orgBox, { width: size, height: size, borderRadius: br, backgroundColor: color }]}>
          <BankLogo bankId={logo} size={Math.round(size * scale)} variant="white" />
        </View>
      );
    }
    if (variant === 'bare') {
      return (
        <View style={[styles.orgBox, { width: size, height: size }]}>
          <BankLogo bankId={logo} size={size} variant="color" />
        </View>
      );
    }
    return (
      <View style={[styles.orgBox, styles.orgBoxLight, !bordered && styles.orgBoxNoBorder, { width: size, height: size, borderRadius: br }]}>
        <BankLogo bankId={logo} size={Math.round(size * scale)} variant="color" />
      </View>
    );
  }
  if (fallbackIcon) {
    return (
      <View style={[styles.orgBox, { width: size, height: size, borderRadius: br, backgroundColor: color }]}>
        <MaterialCommunityIcons name={fallbackIcon} size={Math.round(size * 0.55)} color={tokens.text.inverse} />
      </View>
    );
  }
  return <View style={{ width: size, height: size, borderRadius: br, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  fallback: { justifyContent: 'center', alignItems: 'center' },
  orgBox: { alignItems: 'center', justifyContent: 'center' },
  orgBoxLight: { backgroundColor: tokens.surface.white, borderWidth: 1, borderColor: tokens.surface.hairline },
  orgBoxNoBorder: { borderWidth: 0 },
});
