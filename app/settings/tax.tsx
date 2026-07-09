import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { tokens, font } from '@/theme';
import { formatMoney, formatPercent } from '@/format';

export default function TaxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateParams } = useData();
  const cur = data.settings.defaultCurrency;

  const years = useMemo(
    () => [...data.taxYearRecords].sort((a, b) => b.year - a.year),
    [data.taxYearRecords],
  );

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: 80, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Налоговые параметры</Text>
          </View>
        </View>

        <View style={styles.list}>
          <TaxRow
            label="Ставка налога"
            hint="НДФЛ на доход от вкладов"
            value={data.params.taxRate}
            suffix="%"
            onChange={(v) => void updateParams({ taxRate: v })}
          />
          <TaxRow
            label="Необлагаемый лимит"
            hint="Доход сверх лимита — в год"
            value={data.params.taxFreeLimit}
            suffix="₽"
            onChange={(v) => void updateParams({ taxFreeLimit: v })}
          />
        </View>

        <Text style={styles.footnote}>
          Доход сверх лимита облагается налогом. По Налоговому кодексу лимит ≈ 1 млн ₽ × максимальная ключевая ставка года.
        </Text>

        {years.length > 0 ? (
          <>
            <Text style={styles.section}>История по годам</Text>
            <View style={styles.list}>
              {years.map((y) => (
                <View key={y.id} style={styles.yearRow}>
                  <View style={styles.yearHeader}>
                    <Text style={styles.yearLabel}>{y.year}</Text>
                    <Text style={styles.yearHint}>лимит {formatMoney(y.taxFreeLimit, { currency: cur, kopecks: 'hide' })} · ключевая {formatPercent(y.keyRateUsed)}</Text>
                  </View>
                  <View style={styles.yearStats}>
                    <YearStat label="Доход за год" value={formatMoney(y.taxableIncome, { currency: cur, kopecks: 'hide' })} />
                    <YearStat label="Налог всего" value={formatMoney(y.taxDue, { currency: cur, kopecks: 'hide' })} />
                  </View>
                  {y.taxDue > 0 ? (
                    <View style={styles.yearStats}>
                      <YearStat label="Удержал банк" value={formatMoney(y.taxWithheld, { currency: cur, kopecks: 'hide' })} />
                      <YearStat label="Доплатить самому" value={formatMoney(y.taxToPaySelf, { currency: cur, kopecks: 'hide' })} accent={y.taxToPaySelf > 0} />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
            <Text style={styles.footnote}>
              Фиксируется один раз, когда год уже закончился — не пересчитывается задним числом. Разбивка «удержал банк / доплатить самому» — оценка по флагу актива, не официальный расчёт ФНС.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

function YearStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

function TaxRow({
  label,
  hint,
  value,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <View style={styles.valueWrap}>
        <TextInput
          style={styles.valueInput}
          value={text}
          keyboardType="numeric"
          selectTextOnFocus
          onChangeText={(t) => {
            const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
            setText(norm);
            const n = parseFloat(norm);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          textAlign="right"
          placeholder="0"
          placeholderTextColor={tokens.text.tertiary}
        />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, flex: 1 },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: 24, color: '#212121', letterSpacing: -0.24 },

  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(249,250,255,0.55)',
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowLabel: { fontFamily: font.medium, fontSize: 16, color: '#212121' },
  rowHint: { fontFamily: font.regular, fontSize: 12, color: 'rgba(33,33,33,0.4)', marginTop: 2 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  valueInput: { fontFamily: font.semibold, fontSize: 18, color: '#212121', minWidth: 50, padding: 0 },
  suffix: { fontFamily: font.regular, fontSize: 16, color: tokens.text.tertiary },

  footnote: {
    fontFamily: font.regular,
    fontSize: 12,
    color: 'rgba(33,33,33,0.4)',
    lineHeight: 18,
    marginTop: tokens.spacing.lg,
    paddingHorizontal: 10,
  },

  section: {
    fontFamily: font.semibold,
    fontSize: 20,
    color: '#212121',
    letterSpacing: -0.2,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  yearRow: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(249,250,255,0.55)',
    gap: 12,
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },
  yearHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  yearLabel: { fontFamily: font.semibold, fontSize: 18, color: '#212121' },
  yearHint: { fontFamily: font.regular, fontSize: 12, color: 'rgba(33,33,33,0.4)' },
  yearStats: { flexDirection: 'row', gap: 16 },
  statLabel: { fontFamily: font.regular, fontSize: 12, color: 'rgba(33,33,33,0.4)' },
  statValue: { fontFamily: font.semibold, fontSize: 15, color: '#212121', marginTop: 2 },
  statValueAccent: { color: tokens.semantic.negative },
});
