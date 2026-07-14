import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Flag } from './Flag';
import { useData } from '@/state/DataContext';
import { crossRate } from '@/state/selectors';
import { openCurrencyPicker } from '@/lib/currencyPicker';
import { tapBuzz } from '@/lib/haptics';
import type { CurrencyCode } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { CURRENCY_SYMBOL } from '@/format/money';
import { timeAgo } from '@/format/date';

export const ALL_CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'KZT', 'BYN', 'CNY', 'INR', 'AED', 'BRL', 'ARS'];
export const CURRENCY_NAME: Record<CurrencyCode, string> = {
  RUB: 'Российский рубль',
  USD: 'Доллар США',
  EUR: 'Евро',
  TRY: 'Турецкая лира',
  KZT: 'Казахстанский тенге',
  BYN: 'Белорусский рубль',
  CNY: 'Китайский юань',
  INR: 'Индийская рупия',
  AED: 'Дирхам ОАЭ',
  BRL: 'Бразильский реал',
  ARS: 'Аргентинское песо',
};

/** Курсы 91,23 привычны, но кросс-курс к недолларовой базе может быть < 1 —
 *  тогда 2 знака после запятой округлят всё в «0,00». Даём больше точности
 *  только для таких мелких значений. */
function formatRate(value: number, base: CurrencyCode): string {
  const decimals = Math.abs(value) < 1 ? 4 : 2;
  return `${value.toFixed(decimals).replace('.', ',')} ${CURRENCY_SYMBOL[base]}`;
}

export function RatesSection() {
  const { data, updateSettings, resetRateHistory } = useData();
  const [rebuilding, setRebuilding] = useState(false);
  const base = data.settings.defaultCurrency;
  const currencies = ALL_CURRENCIES.filter((c) => c !== base);

  const doRebuildHistory = async () => {
    setRebuilding(true);
    try {
      await resetRateHistory();
    } catch {
      // офлайн
    } finally {
      setRebuilding(false);
    }
  };

  const changeBaseCurrency = () => {
    tapBuzz();
    openCurrencyPicker((code) => { void updateSettings({ defaultCurrency: code }); }, base);
  };

  return (
    <>
      <Pressable style={styles.baseRow} onPress={changeBaseCurrency}>
        <View style={styles.rowLeft}>
          <Flag code={base} size={36} />
          <View>
            <Text style={styles.rowCode}>{base}</Text>
            <Text style={styles.rowName}>{CURRENCY_NAME[base]}</Text>
          </View>
        </View>
        <Text style={styles.baseChange}>Изменить</Text>
      </Pressable>

      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Курс ЦБ РФ</Text>
        <Text style={styles.cardSubtitle}>Обновлено {timeAgo(data.ratesUpdatedAt)}</Text>
      </View>
      <View style={styles.list}>
        {currencies.map((code) => {
          const shownCross = crossRate(data, code, base);
          const cbrCross = (data.rates[code] ?? 1) / (data.rates[base] ?? 1);
          const overridden = Math.abs(shownCross - cbrCross) > 1e-9;
          return (
            <View key={code} style={styles.row}>
              <View style={styles.rowLeft}>
                <Flag code={code} size={36} />
                <View>
                  <Text style={styles.rowCode}>{code}</Text>
                  <Text style={styles.rowName}>{CURRENCY_NAME[code]}</Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowRate}>{formatRate(shownCross, base)}</Text>
                {overridden ? (
                  <View style={styles.cbrPill}>
                    <Text style={styles.cbrText}>ЦБ {formatRate(cbrCross, base)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <Pressable style={styles.rebuildBtn} onPress={doRebuildHistory} disabled={rebuilding}>
        {rebuilding ? (
          <ActivityIndicator size="small" color={tokens.text.tertiary} />
        ) : (
          <MaterialIcons name="history" size={16} color={tokens.text.tertiary} />
        )}
        <Text style={styles.rebuildText}>{rebuilding ? 'Пересобираю…' : 'Пересобрать историю курсов'}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  baseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 69,
    borderRadius: 20,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: tokens.spacing.tight,
    backgroundColor: tokens.surface.white,
    marginBottom: tokens.spacing.xl,
    ...boxShadow(tokens.shadow.subtle),
  },
  baseChange: { fontFamily: font.medium, fontSize: 14, color: tokens.accent.base },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.tight,
    marginBottom: tokens.spacing.md,
  },
  cardTitle: { fontFamily: font.semibold, fontSize: 20, color: tokens.text.primary, letterSpacing: -0.2 },
  cardSubtitle: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.24 },
  list: { gap: 4, marginBottom: tokens.spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 69,
    borderRadius: 20,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: tokens.spacing.tight,
    backgroundColor: tokens.surface.rowTint,
    ...boxShadow(tokens.shadow.subtle),
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCode: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.primary },
  rowName: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), marginTop: 1 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowRate: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.primary },
  cbrPill: { backgroundColor: '#f9faff', borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 6 },
  cbrText: { fontFamily: font.medium, fontSize: 11, lineHeight: 11, color: hexToRgba(tokens.text.primary, 0.8) },
  rebuildBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.chip, justifyContent: 'center', paddingVertical: tokens.spacing.md },
  rebuildText: { fontFamily: font.medium, fontSize: 13, color: tokens.text.tertiary },
});
