import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { NumberField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import type { CurrencyCode } from '@/domain/types';
import { tokens } from '@/theme';
import { CURRENCY_SYMBOL, formatMoney } from '@/format';
import { t } from '@/i18n';

const ALL: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'CNY'];
const NAME: Record<CurrencyCode, string> = {
  RUB: 'Российский рубль',
  USD: 'Доллар США',
  EUR: 'Евро',
  TRY: 'Турецкая лира',
  CNY: 'Китайский юань',
};

function trimNum(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return String(Number(n.toFixed(2)));
}

export default function ConverterScreen() {
  const insets = useSafeAreaInsets();
  const { data, updateRates } = useData();

  const [slots, setSlots] = useState<CurrencyCode[]>(['RUB', 'USD', 'EUR', 'CNY']);
  const [active, setActive] = useState(0);
  const [amount, setAmount] = useState('100000');
  const [picker, setPicker] = useState<number | null>(null);
  const [showRates, setShowRates] = useState(false);

  const rates = data.rates;
  const parsed = parseFloat(amount.replace(',', '.')) || 0;

  const numericFor = (i: number) =>
    i === active ? parsed : (parsed * (rates[slots[active]] ?? 1)) / (rates[slots[i]] ?? 1);
  const displayFor = (i: number) =>
    i === active ? amount : formatMoney(numericFor(i), { withSymbol: false, kopecks: 'auto' });

  const focusSlot = (i: number) => {
    if (i === active) return;
    setActive(i);
    setAmount(trimNum(numericFor(i)));
  };
  const changeSlot = (i: number, text: string) => {
    if (i !== active) setActive(i);
    setAmount(text.replace(/[^0-9.,]/g, ''));
  };
  const setCurrency = (i: number, c: CurrencyCode) => {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? c : s)));
    setPicker(null);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 90,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.screenTitle}>{t.tabs.converter}</Text>
          <Pressable style={styles.resetBtn} onPress={() => setAmount('')} hitSlop={8}>
            <MaterialIcons name="restart-alt" size={20} color={tokens.accent.base} />
          </Pressable>
        </View>

        {/* Основная полоса */}
        <Text style={styles.label}>У меня есть</Text>
        <Card style={[styles.mainCard, active === 0 && styles.activeCard]} padded={false}>
          <View style={styles.mainInner}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.mainInput}
                value={displayFor(0)}
                onChangeText={(text) => changeSlot(0, text)}
                onFocus={() => focusSlot(0)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={tokens.text.tertiary}
              />
              <Text style={styles.mainSecondary}>{formatMoney(parsed, { currency: slots[0] })}</Text>
            </View>
            <Pressable style={styles.mainChip} onPress={() => setPicker(0)}>
              <View style={styles.symBig}><Text style={styles.symBigText}>{CURRENCY_SYMBOL[slots[0]]}</Text></View>
              <View>
                <View style={styles.codeRow}>
                  <Text style={styles.codeBig}>{slots[0]}</Text>
                  <MaterialIcons name="expand-more" size={18} color={tokens.text.tertiary} />
                </View>
                <Text style={styles.nameSmall} numberOfLines={1}>{NAME[slots[0]]}</Text>
              </View>
            </Pressable>
          </View>
        </Card>

        {/* Я получу */}
        <View style={styles.getRow}>
          <Text style={styles.label}>Я получу</Text>
          <Pressable style={styles.tuneLink} onPress={() => setShowRates((s) => !s)} hitSlop={8}>
            <Text style={styles.tuneText}>Настроить курсы</Text>
            <MaterialIcons name="edit" size={14} color={tokens.accent.base} />
          </Pressable>
        </View>

        {/* 3 окошка в ряд */}
        <View style={styles.grid}>
          {[1, 2, 3].map((i) => (
            <Pressable
              key={i}
              style={[styles.cell, active === i && styles.activeCell]}
              onPress={() => focusSlot(i)}
            >
              <Pressable style={styles.cellHead} onPress={() => setPicker(i)} hitSlop={6}>
                <View style={styles.symSmall}><Text style={styles.symSmallText}>{CURRENCY_SYMBOL[slots[i]]}</Text></View>
                <Text style={styles.codeSmall}>{slots[i]}</Text>
                <MaterialIcons name="expand-more" size={14} color={tokens.text.tertiary} />
              </Pressable>
              <TextInput
                style={styles.cellInput}
                value={displayFor(i)}
                onChangeText={(text) => changeSlot(i, text)}
                onFocus={() => focusSlot(i)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={tokens.text.tertiary}
              />
              <Text style={styles.cellRate} numberOfLines={1}>
                1 {slots[i]} = {formatMoney(rates[slots[i]] ?? 1, { currency: 'RUB', kopecks: 'auto' })}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.source}>Курсы заданы вручную · авто-курс ЦБ подключим позже</Text>

        {showRates ? (
          <Card style={{ marginTop: tokens.spacing.md }}>
            <Text style={styles.ratesHint}>Сколько ₽ за 1 единицу валюты.</Text>
            {ALL.filter((c) => c !== 'RUB').map((c) => (
              <NumberField
                key={c}
                label={`${c} — ${NAME[c]}`}
                value={rates[c]}
                onChange={(v) => void updateRates({ [c]: v ?? 0 })}
                suffix="₽"
              />
            ))}
          </Card>
        ) : null}
      </ScrollView>

      {/* Пикер валюты */}
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Валюта окна</Text>
            {ALL.map((c) => (
              <Pressable key={c} style={styles.optionRow} onPress={() => picker !== null && setCurrency(picker, c)}>
                <View style={styles.symSmall}><Text style={styles.symSmallText}>{CURRENCY_SYMBOL[c]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionCode}>{c}</Text>
                  <Text style={styles.optionName}>{NAME[c]}</Text>
                </View>
                {picker !== null && slots[picker] === c ? (
                  <MaterialIcons name="check" size={20} color={tokens.accent.base} />
                ) : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.md },
  screenTitle: { fontSize: tokens.typography.display, fontWeight: '600', color: tokens.text.primary },
  resetBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.surface.white, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: tokens.typography.caption, color: tokens.text.secondary, fontWeight: '500', marginBottom: tokens.spacing.sm },
  mainCard: { borderWidth: 1.5, borderColor: 'transparent' },
  activeCard: { borderColor: tokens.accent.base },
  mainInner: { flexDirection: 'row', alignItems: 'center', padding: tokens.spacing.lg },
  mainInput: { fontSize: tokens.typography.metric, fontWeight: '800', color: tokens.text.primary, padding: 0 },
  mainSecondary: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  mainChip: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  symBig: { width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.surface.neutral, alignItems: 'center', justifyContent: 'center' },
  symBigText: { fontSize: tokens.typography.title, fontWeight: '700', color: tokens.text.primary },
  codeRow: { flexDirection: 'row', alignItems: 'center' },
  codeBig: { fontSize: tokens.typography.body, fontWeight: '700', color: tokens.text.primary },
  nameSmall: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, maxWidth: 110 },
  getRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: tokens.spacing.lg },
  tuneLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tuneText: { fontSize: tokens.typography.caption, color: tokens.accent.base, fontWeight: '600' },
  grid: { flexDirection: 'row', gap: tokens.spacing.sm },
  cell: {
    flex: 1,
    backgroundColor: tokens.surface.white,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  activeCell: { borderColor: tokens.accent.base },
  cellHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  symSmall: { width: 24, height: 24, borderRadius: 12, backgroundColor: tokens.surface.neutral, alignItems: 'center', justifyContent: 'center' },
  symSmallText: { fontSize: tokens.typography.caption, fontWeight: '700', color: tokens.text.primary },
  codeSmall: { fontSize: tokens.typography.caption, fontWeight: '700', color: tokens.text.primary },
  cellInput: { fontSize: tokens.typography.title, fontWeight: '800', color: tokens.text.primary, padding: 0, marginTop: tokens.spacing.sm },
  cellRate: { fontSize: 10, color: tokens.text.tertiary, marginTop: 4 },
  source: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: tokens.spacing.md },
  ratesHint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginBottom: tokens.spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,28,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: tokens.surface.white, borderTopLeftRadius: tokens.radius.xl, borderTopRightRadius: tokens.radius.xl, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl },
  sheetTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginBottom: tokens.spacing.md },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md, borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  optionCode: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  optionName: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 1 },
});
