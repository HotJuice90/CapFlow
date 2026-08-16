import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

/**
 * Столбики залиты градиентом того же построения, что и сектор роста в бублике
 * «Темп дохода» (CompareDonut): светлый верх → базовый токен внизу. Прозрачность
 * для неактивных месяцев не используется вовсе — полупрозрачные столбики
 * подмешивали фон карточки и читались выцветшими, а не «другими».
 *
 * Направление вертикальное, а не горизонтальное как в бублике: столбик узкий,
 * поперёк градиент просто не успевает развернуться.
 */
const BAR_GRADIENT = {
  earned: ['#2CE296', tokens.semantic.positive],
  withheld: [tokens.accent.light, tokens.accent.base],
  tax: ['#FFC94A', tokens.semantic.warning],
} as const;
const GRADIENT_TOP = { x: 0, y: 0 };
const GRADIENT_BOTTOM = { x: 0, y: 1 };
/** Разделителем служит сам зазор: все зелёные столбики кончаются на одной
 *  высоте, все жёлтые с неё начинаются, и просвет фона между ними читается как
 *  ось. Нарисованная линия поверх этого выглядела грубо. */
const AXIS_GAP = 1;

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
 * Ось нуля НЕ рисуется линией: разделителем служит сам зазор между зелёным и
 * жёлтым — все столбики кончаются и начинаются на одной высоте, поэтому просвет
 * читается как ось сам по себе, а нарисованная поверх линия выглядела грубо.
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
  const maxTax = Math.max(...data.months.map((m) => m.taxSelf), 0);
  // Нижняя зона в том же масштабе, что и верхняя, но не меньше 14px: налог
  // обычно на порядок меньше дохода, и без нижнего предела зона схлопывается
  // в пару пикселей — ось тогда некуда «отложить вниз».
  const negativeH = Math.max(14, Math.round(POSITIVE_H * (maxTax / maxEarned)));

  return (
    <View style={styles.card}>
      <View style={styles.totals}>
        <View style={styles.totalItem}>
          <Text style={[styles.totalValue, { color: tokens.semantic.positive }]} numberOfLines={1}>
            +{formatMoney(data.totalEarned, { currency, kopecks: 'hide' })}
          </Text>
          <Text style={styles.totalLabel}>Доход за год</Text>
        </View>
        {/* Раньше тут был ОДИН «Налог» — сумма обоих видов, и она не билась ни
            с чем в плашке ниже. Показываем те же две величины, что и там. */}
        <View style={[styles.totalItem, styles.totalRight]}>
          <Text style={[styles.totalValue, { color: tokens.accent.base }]} numberOfLines={1}>
            {formatMoney(data.totalTaxWithheld, { currency, kopecks: 'hide' })}
          </Text>
          <Text style={styles.totalLabel}>Удержал банк</Text>
        </View>
        <View style={[styles.totalItem, styles.totalRight]}>
          <Text style={[styles.totalValue, { color: tokens.semantic.warning }]} numberOfLines={1}>
            {formatMoney(data.totalTaxSelf, { currency, kopecks: 'hide' })}
          </Text>
          <Text style={styles.totalLabel}>Отложить самому</Text>
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
                {/* Удержанное банком — сегмент ВНУТРИ дохода: эти деньги были
                    частью дохода и уже вычтены, до счёта они не дошли. */}
                <View
                  style={[
                    styles.barUp,
                    { height: Math.max(2, (m.earned / maxEarned) * (POSITIVE_H - AXIS_GAP)) },
                  ]}
                >
                  <LinearGradient
                    colors={BAR_GRADIENT.earned}
                    start={GRADIENT_TOP}
                    end={GRADIENT_BOTTOM}
                    style={styles.barNet}
                  />
                  {m.taxWithheld > 0 ? (
                    <LinearGradient
                      colors={BAR_GRADIENT.withheld}
                      start={GRADIENT_TOP}
                      end={GRADIENT_BOTTOM}
                      style={{ height: `${Math.min(100, (m.taxWithheld / (m.earned || 1)) * 100)}%` }}
                    />
                  ) : null}
                  {/* Выбранный месяц = тот же цвет, притемнённый наложением.
                      Так активным читается более НАСЫЩЕННЫЙ столбик, а не
                      единственный непрозрачный среди выцветших. */}
                  {active ? <View style={styles.barShade} pointerEvents="none" /> : null}
                </View>
              </View>
              <View style={[styles.plotDown, { height: negativeH }]}>
                {m.taxSelf > 0 ? (
                  <View
                    style={[
                      styles.barDown,
                      { height: Math.max(2, (m.taxSelf / (maxTax || 1)) * (negativeH - AXIS_GAP)) },
                    ]}
                  >
                    <LinearGradient
                      colors={BAR_GRADIENT.tax}
                      start={GRADIENT_TOP}
                      end={GRADIENT_BOTTOM}
                      style={StyleSheet.absoluteFill}
                    />
                    {active ? <View style={styles.barShade} pointerEvents="none" /> : null}
                  </View>
                ) : null}
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
            <View style={styles.detailCell}>
              <Text style={[styles.detailValue, { color: tokens.accent.base }]} numberOfLines={1}>
                {formatMoney(row.taxWithheld, { currency, kopecks: 'hide' })}
              </Text>
              <Text style={styles.detailLabel}>Удержал банк</Text>
            </View>
            <View style={[styles.detailCell, { alignItems: 'flex-end' }]}>
              <View style={styles.taxRow}>
                {/* Зачёркнутое — сколько пришлось бы отложить без льготы.
                    Ноль чёрным: это не предупреждение, а результат лимита. */}
                {row.taxSelf < row.taxSelfFlat - 0.5 ? (
                  <Text style={styles.taxStruck} numberOfLines={1}>
                    {formatMoney(row.taxSelfFlat, { currency, kopecks: 'hide' })}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.detailValue,
                    { color: row.taxSelf > 0.5 ? tokens.semantic.warning : tokens.text.primary },
                  ]}
                  numberOfLines={1}
                >
                  {formatMoney(row.taxSelf, { currency, kopecks: 'hide' })}
                </Text>
              </View>
              <Text style={styles.detailLabel}>Отложить самому</Text>
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
  totals: { flexDirection: 'row', gap: 6, marginBottom: tokens.spacing.lg },
  totalItem: { flex: 1 },
  totalRight: { alignItems: 'flex-end' },
  totalValue: { fontFamily: font.semibold, fontSize: 15, lineHeight: 17, letterSpacing: -0.2, color: tokens.text.primary },
  totalLabel: { fontSize: tokens.typography.micro, lineHeight: 13, color: tokens.text.tertiary, marginTop: 3 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, position: 'relative' },
  col: { flex: 1, alignItems: 'center' },
  plotUp: { width: '100%', justifyContent: 'flex-end', paddingBottom: AXIS_GAP },
  barUp: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden' },
  barNet: { flex: 1 },
  plotDown: { width: '100%', justifyContent: 'flex-start', paddingTop: AXIS_GAP },
  barDown: { width: '100%', borderBottomLeftRadius: 4, borderBottomRightRadius: 4, overflow: 'hidden' },
  // Притемнение выбранного столбика — поверх градиента, внутри скруглённой
  // обрезки, поэтому повторяет форму столбика без отдельного радиуса.
  barShade: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: hexToRgba('#000000', 0.2),
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

  detailRow: { flexDirection: 'row', gap: 6, marginTop: tokens.spacing.md },
  detailCell: { flex: 1 },
  detailValue: { fontFamily: font.semibold, fontSize: 14, lineHeight: 16, letterSpacing: -0.2, color: tokens.text.primary },
  detailLabel: { fontSize: tokens.typography.micro, lineHeight: 13, color: tokens.text.tertiary, marginTop: 3 },
  taxRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  taxStruck: {
    fontSize: tokens.typography.micro,
    lineHeight: 15,
    color: hexToRgba(tokens.semantic.warning, 0.75),
    textDecorationLine: 'line-through',
  },
});
