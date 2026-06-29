import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { Sparkline } from '@/components/Sparkline';
import { useData } from '@/state/DataContext';
import type { CurrencyCode } from '@/domain/types';
import { tokens } from '@/theme';
import { formatMoney } from '@/format';
import { timeAgo } from '@/format/date';
import { t } from '@/i18n';

const ALL: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'CNY'];
const NAME: Record<CurrencyCode, string> = {
  RUB: 'Российский рубль',
  USD: 'Доллар США',
  EUR: 'Евро',
  TRY: 'Турецкая лира',
  CNY: 'Китайский юань',
};
const FLAG: Record<CurrencyCode, string> = {
  RUB: '🇷🇺',
  USD: '🇺🇸',
  EUR: '🇪🇺',
  TRY: '🇹🇷',
  CNY: '🇨🇳',
};

function trimNum(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return String(Number(n.toFixed(2)));
}

export default function ConverterScreen() {
  const insets = useSafeAreaInsets();
  const { data, refreshRates, backfillRateHistory } = useData();

  const [slots, setSlots] = useState<CurrencyCode[]>(['RUB', 'USD', 'EUR', 'CNY']);
  const [active, setActive] = useState(0);
  const [amount, setAmount] = useState('100000');
  const [picker, setPicker] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);

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
  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshRates();
    } catch {
      // офлайн — оставляем последние курсы
    } finally {
      setRefreshing(false);
    }
  };
  const doBackfill = async () => {
    setLoadingHist(true);
    try {
      await backfillRateHistory();
    } catch {
      // архив ЦБ недоступен
    } finally {
      setLoadingHist(false);
    }
  };

  const histCurrencies = Array.from(new Set(slots.filter((c) => c !== 'RUB')));
  const seriesFor = (c: CurrencyCode): number[] =>
    data.ratesHistory.map((s) => s.rates[c]).filter((x): x is number => typeof x === 'number');
  const hasHistory = histCurrencies.some((c) => seriesFor(c).length >= 2);

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
          <Pressable style={styles.iconBtn} onPress={() => setAmount('')} hitSlop={8}>
            <MaterialIcons name="restart-alt" size={20} color={tokens.accent.base} />
          </Pressable>
        </View>

        {/* Основная полоса */}
        <Text style={styles.label}>У меня есть</Text>
        <Card style={[styles.mainCard, active === 0 && styles.activeCard]} padded={false}>
          <View style={styles.mainInner}>
            <TextInput
              style={styles.mainInput}
              value={displayFor(0)}
              onChangeText={(text) => changeSlot(0, text)}
              onFocus={() => focusSlot(0)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={tokens.text.tertiary}
            />
            <Pressable style={styles.mainChip} onPress={() => setPicker(0)}>
              <Text style={styles.flagBig}>{FLAG[slots[0]]}</Text>
              <Text style={styles.codeBig}>{slots[0]}</Text>
              <MaterialIcons name="expand-more" size={20} color={tokens.text.tertiary} />
            </Pressable>
          </View>
        </Card>

        <Text style={[styles.label, { marginTop: tokens.spacing.lg }]}>Я получу</Text>
        <View style={styles.grid}>
          {[1, 2, 3].map((i) => (
            <Pressable key={i} style={[styles.cell, active === i && styles.activeCell]} onPress={() => focusSlot(i)}>
              <Pressable style={styles.cellHead} onPress={() => setPicker(i)} hitSlop={6}>
                <Text style={styles.flagSmall}>{FLAG[slots[i]]}</Text>
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

        {/* Источник курса + обновление */}
        <View style={styles.updatedRow}>
          <Text style={styles.updatedText} numberOfLines={1}>
            Курс ЦБ РФ · обновлено {timeAgo(data.ratesUpdatedAt)}
          </Text>
          <Pressable style={styles.refreshBtn} onPress={doRefresh} disabled={refreshing} hitSlop={8}>
            {refreshing ? (
              <ActivityIndicator size="small" color={tokens.accent.base} />
            ) : (
              <MaterialIcons name="refresh" size={18} color={tokens.accent.base} />
            )}
            <Text style={styles.refreshText}>{refreshing ? 'Обновляю…' : 'Обновить'}</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { marginTop: tokens.spacing.lg }]}>История курса</Text>
        <Card>
          {hasHistory ? (
            histCurrencies.map((c, i) => {
              const series = seriesFor(c);
              const first = series[0] ?? 0;
              const last = series[series.length - 1] ?? 0;
              const pct = first > 0 ? ((last - first) / first) * 100 : 0;
              // курс валюты растёт = рубль дешевеет (bad для рубля), инвертируем
              const rubbleUp = last < first;
              return (
                <View key={c} style={[styles.histRow, i > 0 && styles.histGap]}>
                  <Text style={styles.flagSmall}>{FLAG[c]}</Text>
                  <View style={{ width: 56 }}>
                    <Text style={styles.histCode}>{c}</Text>
                    <Text style={styles.histRate}>{formatMoney(data.rates[c] ?? 0, { currency: 'RUB', kopecks: 'auto' })}</Text>
                  </View>
                  <View style={styles.histChart}>
                    {series.length >= 2 ? (
                      <Sparkline data={series} width={110} height={36} color={rubbleUp ? tokens.semantic.positive : tokens.semantic.negative} />
                    ) : (
                      <Text style={styles.histNone}>—</Text>
                    )}
                  </View>
                  <Text style={[styles.histPct, { color: rubbleUp ? tokens.semantic.positive : tokens.semantic.negative }]}>
                    {rubbleUp ? '+' : '−'}{Math.abs(pct).toFixed(1).replace('.', ',')}%
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={styles.histEmpty}>
              <Text style={styles.histEmptyText}>График появится по мере ежедневных обновлений. Можно сразу подгрузить историю за 30 дней с ЦБ.</Text>
              <Pressable style={styles.histBtn} onPress={doBackfill} disabled={loadingHist}>
                {loadingHist ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="download" size={18} color="#FFFFFF" />}
                <Text style={styles.histBtnText}>{loadingHist ? 'Загружаю…' : 'Загрузить историю'}</Text>
              </Pressable>
            </View>
          )}
        </Card>
      </ScrollView>

      {/* Пикер валюты */}
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Валюта окна</Text>
            {ALL.map((c) => (
              <Pressable key={c} style={styles.optionRow} onPress={() => picker !== null && setCurrency(picker, c)}>
                <Text style={styles.flagBig}>{FLAG[c]}</Text>
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
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.surface.white, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: tokens.typography.caption, color: tokens.text.secondary, fontWeight: '500', marginBottom: tokens.spacing.sm },
  mainCard: { borderWidth: 1.5, borderColor: 'transparent' },
  activeCard: { borderColor: tokens.accent.base },
  mainInner: { flexDirection: 'row', alignItems: 'center', padding: tokens.spacing.lg },
  mainInput: { flex: 1, fontSize: tokens.typography.metric, fontWeight: '800', color: tokens.text.primary, padding: 0 },
  mainChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: tokens.spacing.sm },
  flagBig: { fontSize: 24 },
  codeBig: { fontSize: tokens.typography.body, fontWeight: '700', color: tokens.text.primary },
  grid: { flexDirection: 'row', gap: tokens.spacing.sm },
  cell: { flex: 1, backgroundColor: tokens.surface.white, borderRadius: tokens.radius.md, padding: tokens.spacing.md, borderWidth: 1.5, borderColor: 'transparent' },
  activeCell: { borderColor: tokens.accent.base },
  cellHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagSmall: { fontSize: 16 },
  codeSmall: { fontSize: tokens.typography.caption, fontWeight: '700', color: tokens.text.primary },
  cellInput: { fontSize: tokens.typography.title, fontWeight: '800', color: tokens.text.primary, padding: 0, marginTop: tokens.spacing.sm },
  cellRate: { fontSize: 10, color: tokens.text.tertiary, marginTop: 4 },
  updatedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: tokens.spacing.lg },
  updatedText: { flex: 1, fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  refreshText: { fontSize: tokens.typography.caption, color: tokens.accent.base, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,28,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: tokens.surface.white, borderTopLeftRadius: tokens.radius.xl, borderTopRightRadius: tokens.radius.xl, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl },
  sheetTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginBottom: tokens.spacing.md },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md, borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  optionCode: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  optionName: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  histGap: { marginTop: tokens.spacing.md, paddingTop: tokens.spacing.md, borderTopWidth: 1, borderTopColor: tokens.surface.hairline },
  histCode: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  histRate: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 1 },
  histChart: { flex: 1, alignItems: 'center' },
  histNone: { fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  histPct: { fontSize: tokens.typography.caption, fontWeight: '700', width: 52, textAlign: 'right' },
  histEmpty: { alignItems: 'center' },
  histEmptyText: { fontSize: tokens.typography.caption, color: tokens.text.secondary, textAlign: 'center', lineHeight: 18 },
  histBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, backgroundColor: tokens.accent.base, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md, marginTop: tokens.spacing.md },
  histBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: tokens.typography.label },
});
