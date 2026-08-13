import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CurrencyCode } from '@/domain/types';
import type { MonthIncomeYear } from '@/state/selectors';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { tapBuzz } from '@/lib/haptics';

const MONTH_SHORT = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];
const MONTH_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const POSITIVE_H = 96;

function pluralAssets(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'актив';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'актива';
  return 'активов';
}

/**
 * Доход по месяцам: столбик вверх — заработано, вниз — налог.
 *
 * Обе половины меряются ОДНИМ масштабом, а не каждая своим: налог — это те же
 * 13% от дохода, и если растянуть его на всю нижнюю половину, он визуально
 * сравняется с доходом и будет врать о своём весе. Поэтому нижняя зона ровно
 * во столько раз меньше верхней, во сколько максимальный налог меньше
 * максимального дохода.
 *
 * Столбики рисуют ПЛОСКИЙ налог (ставка × доход) — та же методика, что в
 * налоговой карточке аналитики. В плашке под графиком показывается налог С
 * УЧЁТОМ ЛИМИТА: это не расхождение, а более точная цифра, и она подписана.
 */
export function MonthlyIncomeChart({
  data,
  currency,
}: {
  data: MonthIncomeYear;
  currency: CurrencyCode;
}) {
  const last = data.months.length - 1;
  const [selected, setSelected] = useState(last);
  // Месяц сменился/данные обновились — держим выбор в пределах массива.
  const idx = Math.min(selected, last);
  const row = data.months[idx];

  const maxEarned = Math.max(...data.months.map((m) => m.earned), 1);
  const maxTax = Math.max(...data.months.map((m) => m.tax), 0);
  const negativeH = Math.round(POSITIVE_H * (maxTax / maxEarned)) || 1;

  return (
    <View style={styles.card}>
      <View style={styles.totals}>
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>Доход за год</Text>
          <Text style={[styles.totalValue, { color: tokens.semantic.positive }]} numberOfLines={1}>
            +{formatMoney(data.totalEarned, { currency, kopecks: 'hide' })}
          </Text>
        </View>
        <View style={[styles.totalItem, styles.totalRight]}>
          <Text style={styles.totalLabel}>Налог</Text>
          <Text style={[styles.totalValue, { color: tokens.semantic.warning }]} numberOfLines={1}>
            −{formatMoney(data.totalTaxWithLimit, { currency, kopecks: 'hide' })}
          </Text>
        </View>
      </View>

      <View style={styles.chart}>
        {data.months.map((m, i) => {
          const active = i === idx;
          return (
            <Pressable
              key={m.month}
              style={styles.col}
              onPress={() => { tapBuzz(); setSelected(i); }}
            >
              <View style={[styles.plot, { height: POSITIVE_H }]}>
                <View
                  style={[
                    styles.barUp,
                    {
                      height: Math.max(2, (m.earned / maxEarned) * POSITIVE_H),
                      backgroundColor: active
                        ? tokens.semantic.positive
                        : hexToRgba(tokens.semantic.positive, 0.45),
                    },
                  ]}
                />
              </View>
              <View style={styles.zeroLine} />
              <View style={[styles.plotDown, { height: negativeH }]}>
                <View
                  style={[
                    styles.barDown,
                    {
                      height: maxTax > 0 ? Math.max(2, (m.tax / maxTax) * negativeH) : 1,
                      backgroundColor: active
                        ? tokens.semantic.warning
                        : hexToRgba(tokens.semantic.warning, 0.45),
                    },
                  ]}
                />
              </View>
              <Text style={[styles.monthLabel, active && styles.monthLabelActive]}>
                {MONTH_SHORT[m.month]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {row ? (
        <View style={styles.detail}>
          <View style={styles.detailHead}>
            <Text style={styles.detailMonth}>{MONTH_FULL[row.month]}</Text>
            <Text style={styles.detailAssets}>{row.assets} {pluralAssets(row.assets)}</Text>
          </View>
          <View style={styles.detailRow}>
            <DetailCell label="Доход" value={`+${formatMoney(row.earned, { currency, kopecks: 'hide' })}`} color={tokens.semantic.positive} />
            <DetailCell label="Налог с лимитом" value={`−${formatMoney(row.taxWithLimit, { currency, kopecks: 'hide' })}`} color={tokens.semantic.warning} />
            <DetailCell label="Чистыми" value={formatMoney(row.earned - row.taxWithLimit, { currency, kopecks: 'hide' })} align="right" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DetailCell({
  label,
  value,
  color,
  align = 'left',
}: {
  label: string;
  value: string;
  color?: string;
  align?: 'left' | 'right';
}) {
  return (
    <View style={[styles.detailCell, align === 'right' && { alignItems: 'flex-end' }]}>
      <Text style={styles.detailLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.detailValue, !!color && { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
  },

  totals: { flexDirection: 'row', marginBottom: tokens.spacing.lg },
  totalItem: { flex: 1 },
  totalRight: { alignItems: 'flex-end' },
  totalLabel: { fontSize: tokens.typography.micro, lineHeight: 13, color: tokens.text.tertiary },
  totalValue: { fontFamily: font.semibold, fontSize: 17, lineHeight: 19, letterSpacing: -0.2, marginTop: 3 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  col: { flex: 1, alignItems: 'center' },
  // Столбик растёт снизу вверх от нулевой линии, поэтому зона выравнивается по низу.
  plot: { width: '100%', justifyContent: 'flex-end' },
  barUp: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  zeroLine: { width: '100%', height: 1, backgroundColor: hexToRgba(tokens.text.primary, 0.12) },
  plotDown: { width: '100%', justifyContent: 'flex-start' },
  barDown: { width: '100%', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  monthLabel: {
    fontSize: tokens.typography.micro,
    lineHeight: 13,
    color: tokens.text.tertiary,
    marginTop: 6,
  },
  monthLabelActive: { color: tokens.text.primary, fontFamily: font.semibold },

  detail: {
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
  },
  detailHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: tokens.spacing.md },
  detailMonth: { fontFamily: font.semibold, fontSize: tokens.typography.label, lineHeight: 16, color: tokens.text.primary },
  detailAssets: { fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  detailRow: { flexDirection: 'row', gap: tokens.spacing.sm },
  detailCell: { flex: 1 },
  detailLabel: { fontSize: tokens.typography.micro, lineHeight: 13, color: tokens.text.tertiary },
  detailValue: {
    fontFamily: font.semibold,
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    color: tokens.text.primary,
    marginTop: 3,
  },
});
