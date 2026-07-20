import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { formatDurationApprox, pluralDays } from '@/format/date';
import type { CurrencyCode, GoalKind } from '@/domain/types';
import type { GoalProgress, GoalMetric } from '@/state/selectors';

/**
 * Общие крупные карточки целей — единственное место, где они описаны.
 * Используются и на экране «Цели», и в слайдере на главной: если меняем
 * дизайн карточки, он подтягивается сразу в обоих местах.
 */

export function ActiveGoalCard({
  p, cur, onPress, onArchive,
}: { p: GoalProgress; cur: CurrencyCode; onPress: () => void; onArchive?: () => void }) {
  const { goal, filledAmount, targetAmount, progressPct, isComplete, deltaToday, daysRemaining, completedInDays } = p;
  const remaining = Math.max(0, targetAmount - filledAmount);
  const canArchive = !!onArchive && goal.status === 'active';
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.cardInner}>
          <View style={styles.topRow}>
            <View style={styles.iconTitle}>
              <View style={styles.iconBox}>
                <MaterialIcons name="flag" size={18} color={tokens.accent.base} />
              </View>
              <Text style={styles.title} numberOfLines={1}>{goal.title}</Text>
            </View>
            {isComplete ? (
              <View style={styles.doneBadge}>
                <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
                <Text style={styles.doneBadgeText}>Готово</Text>
              </View>
            ) : (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Активная цель</Text>
              </View>
            )}
          </View>

          {isComplete ? (
            <>
              <View style={styles.track}>
                <View style={[styles.fill, styles.fillDone, { width: '100%' }]} />
              </View>
              <View style={styles.celebrateBlock}>
                <Text style={styles.celebrateTitle}>🎉 Цель достигнута!</Text>
                <Text style={styles.celebrateSub}>
                  {completedInDays !== null ? `Выполнена за ${completedInDays} ${pluralDays(completedInDays)}` : 'Выполнена'}
                </Text>
                {canArchive ? (
                  <Pressable style={styles.archiveBtn} onPress={onArchive}>
                    <MaterialIcons name="archive" size={16} color={tokens.accent.base} />
                    <Text style={styles.archiveBtnText}>В архив</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <View style={styles.mainRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.remainLabel}>Осталось</Text>
                  <Text style={styles.remainValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMoney(remaining, { currency: cur, kopecks: 'hide' })}
                  </Text>
                  {deltaToday > 0 ? (
                    <View style={styles.deltaRow}>
                      <MaterialIcons name="add" size={12} color={tokens.semantic.positive} />
                      <Text style={styles.deltaText}>{formatMoney(deltaToday, { currency: cur, kopecks: 'hide' })} сегодня</Text>
                    </View>
                  ) : null}
                </View>
                {daysRemaining !== null ? (
                  <View style={styles.etaBadge}>
                    <MaterialIcons name="event" size={14} color={tokens.accent.base} />
                    <Text style={styles.etaBadgeValue}>~ {formatDurationApprox(daysRemaining)}</Text>
                    <Text style={styles.etaBadgeLabel}>до достижения</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }]} />
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerPct}>{Math.round(progressPct)}%</Text>
                <Text style={styles.footerAmount}>
                  {formatMoney(filledAmount, { currency: cur, kopecks: 'hide' })} из {formatMoney(targetAmount, { currency: cur, kopecks: 'hide' })}
                </Text>
              </View>
            </>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

export function MetricCard({
  m, cur, onPress, onArchive,
}: { m: GoalMetric; cur: CurrencyCode; onPress: () => void; onArchive?: () => void }) {
  const { goal, currentValue, targetValue, progressPct, isComplete, daysRemaining } = m;
  const kind = goal.kind as GoalKind;
  const isCapital = kind === 'capital';
  const periodSuffix = kind === 'incomeRate' ? `/${goal.incomeRatePeriod === 'month' ? 'мес' : 'день'}` : '';
  const remaining = Math.max(0, targetValue - currentValue);
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.cardInner}>
          <View style={styles.topRow}>
            <View style={styles.iconTitle}>
              <View style={styles.iconBox}>
                <MaterialIcons name={isCapital ? 'account-balance' : 'trending-up'} size={18} color={tokens.accent.base} />
              </View>
              <Text style={styles.title} numberOfLines={1}>{goal.title}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              {isComplete ? (
                <View style={styles.doneBadge}>
                  <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
                  <Text style={styles.doneBadgeText}>Достигнуто</Text>
                </View>
              ) : (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Активная цель</Text>
                </View>
              )}
              {isComplete && onArchive && goal.status === 'active' ? (
                <Pressable onPress={onArchive} hitSlop={10}>
                  <MaterialIcons name="archive" size={18} color={tokens.text.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {isCapital ? (
            <>
              <View style={styles.mainRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.remainLabel}>Осталось</Text>
                  <Text style={styles.remainValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMoney(remaining, { currency: cur, kopecks: 'hide' })}
                  </Text>
                </View>
                {daysRemaining !== null ? (
                  <View style={styles.etaBadge}>
                    <MaterialIcons name="event" size={14} color={tokens.accent.base} />
                    <Text style={styles.etaBadgeValue}>~ {formatDurationApprox(daysRemaining)}</Text>
                    <Text style={styles.etaBadgeLabel}>до достижения</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }, isComplete && styles.fillDone]} />
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerPct}>{Math.round(progressPct)}%</Text>
                <Text style={styles.footerAmount}>
                  {formatMoney(currentValue, { currency: cur, kopecks: 'hide' })} из {formatMoney(targetValue, { currency: cur, kopecks: 'hide' })}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.mainRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.remainLabel}>Сейчас</Text>
                  <Text style={styles.remainValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMoney(currentValue, { currency: cur, kopecks: 'hide' })}{periodSuffix}
                  </Text>
                </View>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }, isComplete && styles.fillDone]} />
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerPct}>{Math.round(progressPct)}%</Text>
                <Text style={styles.footerTargetHint}>
                  Цель: {formatMoney(targetValue, { currency: cur, kopecks: 'hide' })}{periodSuffix}
                </Text>
              </View>
            </>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Card применяет `style` к внешнему теневому слою, а не к контенту — поэтому
  // gap для внутренних отступов вешаем на собственную обёртку внутри Card.
  cardInner: { gap: tokens.spacing.md },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  iconTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, minWidth: 0 },
  iconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: hexToRgba(tokens.accent.base, 0.12), alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.text.primary },
  activeBadge: { backgroundColor: hexToRgba(tokens.semantic.warning, 0.14), borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.semantic.warning },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: hexToRgba(tokens.semantic.positive, 0.12), borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.semantic.positive },

  mainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  remainLabel: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary },
  remainValue: { fontFamily: font.bold, fontSize: 28, color: tokens.text.primary, letterSpacing: -0.3, marginTop: 4 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  deltaText: { fontFamily: font.medium, fontSize: tokens.typography.hint, color: tokens.semantic.positive },
  etaBadge: {
    alignItems: 'center', backgroundColor: tokens.surface.neutral,
    borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
  },
  etaBadgeValue: { fontFamily: font.semibold, fontSize: tokens.typography.caption, color: tokens.accent.base },
  etaBadgeLabel: { fontFamily: font.regular, fontSize: 10, color: tokens.text.tertiary },

  track: { height: 8, borderRadius: 4, backgroundColor: hexToRgba('#909497', 0.16), overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: tokens.accent.base },
  fillDone: { backgroundColor: tokens.semantic.positive },

  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerPct: { fontFamily: font.bold, fontSize: tokens.typography.label, color: tokens.accent.base },
  footerAmount: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.secondary },
  footerTargetHint: { fontFamily: font.regular, fontSize: tokens.typography.micro, color: tokens.text.tertiary },

  celebrateBlock: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  celebrateTitle: { fontFamily: font.bold, fontSize: tokens.typography.label, color: tokens.text.primary },
  celebrateSub: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.secondary },
  archiveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: hexToRgba(tokens.accent.base, 0.1), borderRadius: tokens.radius.pill,
    paddingHorizontal: 16, paddingVertical: 9, marginTop: 6,
  },
  archiveBtnText: { fontFamily: font.semibold, fontSize: tokens.typography.caption, color: tokens.accent.base },
});
