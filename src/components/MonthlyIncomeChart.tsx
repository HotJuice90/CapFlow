import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CurrencyCode } from '@/domain/types';
import type { MonthIncomeYear } from '@/state/selectors';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { tapBuzz } from '@/lib/haptics';

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
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
 * Ось нуля рисуется ОДНОЙ сплошной линией поверх всей ширины, а не кусочками
 * внутри колонок. Иначе она рвётся зазорами между столбиками и почти не видна,
 * а тогда жёлтое читается как нижняя часть того же столбика — то есть график
 * выглядит составным, и вся метафора «доход вверх, налог вниз» пропадает.
 *
 * Обе половины меряются ОДНИМ масштабом: налог — это доля от дохода, и если
 * растянуть его на всю нижнюю зону, он визуально сравняется с доходом и соврёт
 * о своём весе.
 *
 * Налог везде — С УЧЁТОМ ЛИМИТА, то есть как платится на самом деле: пока
 * годовой лимит не выбран, налога нет вовсе. Плоский показывается только в
 * плашке, зачёркнутым рядом — «столько было бы без льготы».
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
  const maxTax = Math.max(...data.months.map((m) => m.taxWithLimit), 0);
  const negativeH = maxTax > 0 ? Math.max(6, Math.round(POSITIVE_H * (maxTax / maxEarned))) : 6;

  return (
    <View style={styles.card}>
      <View style={styles.totals}>
        <View style={styles.totalItem}>
          <Text style={[styles.totalValue, { color: tokens.semantic.positive }]} numberOfLines={1}>
            +{formatMoney(data.totalEarned, { currency, kopecks: 'hide' })}
          </Text>
          <Text style={styles.totalLabel}>Доход за год</Text>
        </View>
        <View style={[styles.totalItem, styles.totalRight]}>
          <Text style={[styles.totalValue, { color: tokens.semantic.warning }]} numberOfLines={1}>
            −{formatMoney(data.totalTaxWithLimit, { currency, kopecks: 'hide' })}
          </Text>
          <Text style={styles.totalLabel}>Налог</Text>
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
              <View style={[styles.plotUp, { height: POSITIVE_H }]}>
                <View
                  style={[
                    styles.barUp,
                    {
                      height: Math.max(2, (m.earned / maxEarned) * POSITIVE_H),
                      backgroundColor: active
                        ? tokens.semantic.positive
                        : hexToRgba(tokens.semantic.positive, 0.4),
                    },
                  ]}
                />
              </View>
              <View style={[styles.plotDown, { height: negativeH }]}>
                {m.taxWithLimit > 0 ? (
                  <View
                    style={[
                      styles.barDown,
                      {
                        height: Math.max(2, (m.taxWithLimit / (maxTax || 1)) * negativeH),
                        backgroundColor: active
                          ? tokens.semantic.warning
                          : hexToRgba(tokens.semantic.warning, 0.4),
                      },
                    ]}
                  />
                ) : null}
              </View>
              <Text style={[styles.monthLabel, active && styles.monthLabelActive]}>
                {MONTH_SHORT[m.month]}
              </Text>
            </Pressable>
          );
        })}
        {/* Сплошная ось поверх колонок — см. комментарий у компонента. */}
        <View style={[styles.axis, { top: POSITIVE_H }]} pointerEvents="none" />
      </View>

      {row ? (
        <View style={styles.detail}>
          <View style={styles.detailHead}>
            <Text style={styles.detailMonth}>{MONTH_FULL[row.month]}</Text>
            <Text style={styles.detailAssets}>{row.assets} {pluralAssets(row.assets)}</Text>
          </View>

          {/* Чистыми — результат, доход и налог под ним слагаемые. */}
          <Text style={styles.netValue} numberOfLines={1}>
            {formatMoney(row.earned - row.taxWithLimit, { currency, kopecks: 'hide' })}
          </Text>
          <Text style={styles.netLabel}>Чистыми</Text>

          <View style={styles.detailRow}>
            <View style={styles.detailCell}>
              <Text style={[styles.detailValue, { color: tokens.semantic.positive }]} numberOfLines={1}>
                +{formatMoney(row.earned, { currency, kopecks: 'hide' })}
              </Text>
              <Text style={styles.detailLabel}>Доход</Text>
            </View>
            <View style={[styles.detailCell, { alignItems: 'flex-end' }]}>
              <View style={styles.taxRow}>
                {/* Зачёркнутое — сколько было бы без необлагаемого лимита, тем же
                    жёлтым, что и столбик: это «старая цена». Фактический налог
                    рядом — и когда он нулевой, он чёрный, потому что ноль это не
                    предупреждение, а результат льготы. */}
                {row.taxWithLimit < row.tax - 0.5 ? (
                  <Text style={styles.taxStruck} numberOfLines={1}>
                    {formatMoney(row.tax, { currency, kopecks: 'hide' })}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.detailValue,
                    { color: row.taxWithLimit > 0.5 ? tokens.semantic.warning : tokens.text.primary },
                  ]}
                  numberOfLines={1}
                >
                  {row.taxWithLimit > 0.5 ? '−' : ''}{formatMoney(row.taxWithLimit, { currency, kopecks: 'hide' })}
                </Text>
              </View>
              <Text style={styles.detailLabel}>Налог</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
  },

  // Число сверху, подпись под ним — тот же порядок, что в сводке календаря,
  // строке площадки и строке актива.
  totals: { flexDirection: 'row', marginBottom: tokens.spacing.lg },
  totalItem: { flex: 1 },
  totalRight: { alignItems: 'flex-end' },
  totalValue: { fontFamily: font.semibold, fontSize: 17, lineHeight: 19, letterSpacing: -0.2 },
  totalLabel: { fontSize: tokens.typography.micro, lineHeight: 13, color: tokens.text.tertiary, marginTop: 3 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, position: 'relative' },
  col: { flex: 1, alignItems: 'center' },
  plotUp: { width: '100%', justifyContent: 'flex-end' },
  barUp: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  plotDown: { width: '100%', justifyContent: 'flex-start' },
  barDown: { width: '100%', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  axis: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: hexToRgba(tokens.text.primary, 0.28),
  },
  monthLabel: {
    fontSize: tokens.typography.micro,
    lineHeight: 13,
    color: tokens.text.tertiary,
    marginTop: 8,
  },
  monthLabelActive: { color: tokens.text.primary, fontFamily: font.semibold },

  detail: {
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
  },
  detailHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  detailMonth: { fontFamily: font.semibold, fontSize: tokens.typography.label, lineHeight: 16, color: tokens.text.primary },
  detailAssets: { fontSize: tokens.typography.micro, color: tokens.text.tertiary },

  netValue: {
    fontFamily: font.semibold,
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: tokens.text.primary,
    marginTop: tokens.spacing.md,
  },
  netLabel: { fontSize: tokens.typography.micro, lineHeight: 13, color: tokens.text.tertiary, marginTop: 3 },

  detailRow: { flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.md },
  detailCell: { flex: 1 },
  detailValue: { fontFamily: font.semibold, fontSize: 15, lineHeight: 17, letterSpacing: -0.2 },
  detailLabel: { fontSize: tokens.typography.micro, lineHeight: 13, color: tokens.text.tertiary, marginTop: 3 },
  taxRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  taxStruck: {
    fontSize: tokens.typography.caption,
    lineHeight: 15,
    color: hexToRgba(tokens.semantic.warning, 0.75),
    textDecorationLine: 'line-through',
  },
});
