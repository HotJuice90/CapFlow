import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercent } from '@/format';
import { taxFreeLimitForYear } from '@/rates/keyRate';

export default function TaxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateParams } = useData();
  const cur = data.settings.defaultCurrency;

  // Лимит по закону для текущего года — из истории ключевой ставки.
  const legalLimit = useMemo(
    () => taxFreeLimitForYear(data.keyRateHistory, new Date().getFullYear()),
    [data.keyRateHistory],
  );
  const manual = data.params.taxFreeLimitManual === true;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const years = useMemo(
    () => [...data.taxYearRecords].sort((a, b) => b.year - a.year),
    [data.taxYearRecords],
  );

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: tokens.spacing.screenTop, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
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
            hint={manual ? 'Задан вручную' : 'Считается по ключевой ставке'}
            value={data.params.taxFreeLimit}
            suffix="₽"
            onChange={(v) => void updateParams({ taxFreeLimit: v, taxFreeLimitManual: true })}
          />
        </View>

        <Text style={styles.footnote}>
          Доход сверх лимита облагается налогом. По Налоговому кодексу лимит = 1 млн ₽ × максимальная ключевая ставка на 1-е число месяца в году.
          {manual ? ' Сейчас значение задано вручную и за ставкой не следует.' : ' Пересчитывается сам при изменении ключевой ставки.'}
        </Text>

        {/* Возврат к закону нужен именно кнопкой: молча перетирать введённое
            человеком число нельзя, а оставлять его навсегда — значит дать ему
            устареть при следующей смене ставки ЦБ. */}
        {manual && Math.round(legalLimit) !== Math.round(data.params.taxFreeLimit) ? (
          <Pressable
            style={styles.legalBtn}
            onPress={() => void updateParams({ taxFreeLimit: legalLimit, taxFreeLimitManual: false })}
          >
            <MaterialIcons name="auto-fix-high" size={18} color={tokens.accent.base} />
            <Text style={styles.legalBtnText}>
              Вернуть по закону — {formatMoney(legalLimit, { currency: cur, kopecks: 'hide' })}
            </Text>
          </Pressable>
        ) : null}

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
                  {/* Срок — по НК: налог по уведомлению ФНС платится до 1 декабря
                      следующего года. Показываем, только пока он не прошёл:
                      для старых лет это уже история, а не напоминание. */}
                  {y.taxToPaySelf > 0 && todayIso <= `${y.year + 1}-12-01` ? (
                    <Text style={styles.deadline}>
                      Уплатить до 1 декабря {y.year + 1} — ФНС пришлёт уведомление
                    </Text>
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
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },

  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: tokens.surface.rowTint,
    ...boxShadow(tokens.shadow.subtle),
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowLabel: { fontFamily: font.medium, fontSize: 16, color: tokens.text.primary },
  rowHint: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), marginTop: 2 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  valueInput: { fontFamily: font.semibold, fontSize: 18, color: tokens.text.primary, minWidth: 50, padding: 0 },
  suffix: { fontFamily: font.regular, fontSize: 16, color: tokens.text.tertiary },

  legalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm,
    alignSelf: 'flex-start',
    marginTop: tokens.spacing.md,
    marginHorizontal: tokens.spacing.tight,
    paddingHorizontal: 14, paddingVertical: tokens.spacing.tight,
    borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(tokens.accent.base, 0.08),
  },
  legalBtnText: {
    fontFamily: font.medium,
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    color: tokens.accent.base,
  },
  deadline: {
    fontFamily: font.medium,
    fontSize: tokens.typography.hint,
    lineHeight: tokens.typography.hint + 3,
    color: tokens.semantic.warning,
    marginTop: tokens.spacing.sm,
  },
  footnote: {
    fontFamily: font.regular,
    fontSize: tokens.typography.hint,
    color: hexToRgba(tokens.text.primary, 0.4),
    lineHeight: 18,
    marginTop: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.tight,
  },

  section: {
    fontFamily: font.semibold,
    fontSize: 20,
    color: tokens.text.primary,
    letterSpacing: -0.2,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  yearRow: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: tokens.surface.rowTint,
    gap: 12,
    ...boxShadow(tokens.shadow.subtle),
  },
  yearHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  yearLabel: { fontFamily: font.semibold, fontSize: 18, color: tokens.text.primary },
  yearHint: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4) },
  yearStats: { flexDirection: 'row', gap: 16 },
  statLabel: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4) },
  statValue: { fontFamily: font.semibold, fontSize: tokens.typography.labelLg, color: tokens.text.primary, marginTop: 2 },
  statValueAccent: { color: tokens.semantic.negative },
});
