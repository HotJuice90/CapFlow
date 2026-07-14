import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ALL_CURRENCIES, CURRENCY_NAME } from '@/components/RatesSection';
import { useData } from '@/state/DataContext';
import { crossRate, effectiveRate } from '@/state/selectors';
import { appAlert } from '@/lib/dialog';
import type { CurrencyCode } from '@/domain/types';
import { tokens, font } from '@/theme';
import { CURRENCY_SYMBOL } from '@/format/money';
import { tapBuzz, successBuzz } from '@/lib/haptics';

export default function ManualRatesSheet() {
  const router = useRouter();
  const { data, setManualRate } = useData();
  const base = data.settings.defaultCurrency;
  const currencies = ALL_CURRENCIES.filter((c) => c !== base);

  const initial = useRef<Partial<Record<CurrencyCode, string>>>(
    Object.fromEntries(currencies.map((code) => [code, String(crossRate(data, code, base))])),
  ).current;
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Set<CurrencyCode>>(new Set());

  const onChangeValue = (code: CurrencyCode, t: string) => {
    const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
    setValues((v) => ({ ...v, [code]: norm }));
    setTouched((s) => new Set(s).add(code));
  };

  const onReset = async (code: CurrencyCode) => {
    tapBuzz();
    await setManualRate(code, undefined);
    setValues((v) => ({ ...v, [code]: String((data.rates[code] ?? 1) / effectiveRate(data, base)) }));
    setTouched((s) => {
      const next = new Set(s);
      next.delete(code);
      return next;
    });
  };

  const onSave = () => {
    if (touched.size === 0) {
      router.back();
      return;
    }
    appAlert('Сохранить курсы?', 'Указанные значения перекроют курс ЦБ для этих валют, пока не сбросишь их заново.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сохранить',
        onPress: async () => {
          const baseRate = effectiveRate(data, base);
          for (const code of touched) {
            const cross = parseFloat(values[code] ?? '');
            if (Number.isFinite(cross) && cross > 0) await setManualRate(code, cross * baseRate);
          }
          successBuzz();
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>Свои курсы</Text>
      <Text style={s.hint}>Собственный курс будет применён ко всем расчётам</Text>
      <ScrollView style={s.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {currencies.map((code, i) => (
          <RateRow
            key={code}
            code={code}
            value={values[code] ?? ''}
            symbol={CURRENCY_SYMBOL[base]}
            hasOverride={data.manualRates[code] !== undefined}
            last={i === currencies.length - 1}
            onChangeText={(t) => onChangeValue(code, t)}
            onReset={() => onReset(code)}
          />
        ))}
      </ScrollView>
      <Pressable style={s.saveBtn} onPress={onSave}>
        <Text style={s.saveText}>Сохранить</Text>
      </Pressable>
    </View>
  );
}

function RateRow({
  code,
  value,
  symbol,
  hasOverride,
  last,
  onChangeText,
  onReset,
}: {
  code: CurrencyCode;
  value: string;
  symbol: string;
  hasOverride: boolean;
  last: boolean;
  onChangeText: (t: string) => void;
  onReset: () => void;
}) {
  return (
    <View style={[s.row, last && s.rowLast]}>
      <View>
        <Text style={s.code}>{code}</Text>
        <Text style={s.name}>{CURRENCY_NAME[code]}</Text>
      </View>
      <View style={s.valueWrap}>
        <TextInput
          style={s.valueInput}
          value={value}
          keyboardType="numeric"
          selectTextOnFocus
          onChangeText={onChangeText}
          textAlign="right"
          placeholder="0"
          placeholderTextColor={tokens.text.tertiary}
        />
        <Text style={s.suffix}>{symbol}</Text>
        {hasOverride ? (
          <Pressable onPress={onReset} hitSlop={8} style={s.resetBtn}>
            <MaterialIcons name="close" size={14} color={tokens.text.tertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: tokens.text.primary, marginBottom: 4 },
  hint: { fontFamily: font.regular, fontSize: 12, color: tokens.text.tertiary, marginBottom: 12 },
  list: { maxHeight: 380 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.surface.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  code: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.primary },
  name: { fontFamily: font.regular, fontSize: 12, color: tokens.text.tertiary, marginTop: 2 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.surface.neutral, alignItems: 'center', justifyContent: 'center' },
  valueInput: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.primary, minWidth: 60, padding: 0 },
  suffix: { fontFamily: font.regular, fontSize: 16, color: tokens.text.tertiary },
  saveBtn: {
    marginTop: 16,
    height: 52,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.accent.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.inverse },
});
