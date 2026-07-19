import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { goalsProgress, standaloneGoalsProgress, type GoalProgress, type GoalMetric } from '@/state/selectors';
import { pluralDays, formatDurationApprox } from '@/format/date';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import type { CurrencyCode, GoalKind } from '@/domain/types';

export default function GoalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useData();
  const cur = data.settings.defaultCurrency;

  const progress = useMemo(() => goalsProgress(data), [data]);
  const metrics = useMemo(() => standaloneGoalsProgress(data), [data]);
  const incomeRateMetrics = useMemo(() => metrics.filter((m) => m.goal.kind === 'incomeRate'), [metrics]);
  const capitalMetrics = useMemo(() => metrics.filter((m) => m.goal.kind === 'capital'), [metrics]);
  const archived = useMemo(() => data.goals.filter((g) => g.status === 'archived'), [data.goals]);

  const incompleteAmount = useMemo(() => progress.filter((p) => !p.isComplete), [progress]);
  const completeAmount = useMemo(() => progress.filter((p) => p.isComplete), [progress]);
  const activeAmountGoal = incompleteAmount[0];
  const queuedAmountGoals = incompleteAmount.slice(1);

  const goTo = (id: string) => router.push(`/settings/goal-form?id=${id}`);
  const hasActive = progress.length > 0 || metrics.length > 0;

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.spacing.screenTop,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + tokens.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Цели</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => router.push('/settings/goal-form')} hitSlop={8}>
            <MaterialIcons name="add" size={22} color={tokens.text.inverse} />
          </Pressable>
        </View>

        {!hasActive ? (
          <View style={styles.empty}>
            <MaterialIcons name="flag" size={32} color={tokens.text.tertiary} />
            <Text style={styles.emptyTitle}>Пока нет целей</Text>
            <Text style={styles.emptyHint}>Заведи цель — и доход портфеля начнёт копиться в её счёт.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/settings/goal-form')}>
              <Text style={styles.emptyBtnText}>Создать цель</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {progress.length > 0 ? (
              <>
                <View style={styles.statsCard}>
                  <View style={styles.statItem}>
                    <MaterialIcons name="flag" size={16} color={tokens.accent.base} />
                    <Text style={styles.statValue}>{incompleteAmount.length}</Text>
                    <Text style={styles.statLabel}>{incompleteAmount.length === 1 ? 'цель всего' : 'цели всего'}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <MaterialIcons name="check-circle-outline" size={16} color={tokens.semantic.positive} />
                    <Text style={styles.statValue}>{activeAmountGoal ? 1 : 0}</Text>
                    <Text style={styles.statLabel}>активная цель</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <MaterialIcons name="hourglass-empty" size={16} color={tokens.text.tertiary} />
                    <Text style={styles.statValue}>{queuedAmountGoals.length}</Text>
                    <Text style={styles.statLabel}>в очереди на потом</Text>
                  </View>
                </View>

                {activeAmountGoal && activeAmountGoal.daysRemaining !== null ? (
                  <View style={styles.nearestRow}>
                    <MaterialIcons name="my-location" size={14} color={tokens.text.tertiary} />
                    <Text style={styles.nearestText}>
                      Ближайшая цель ≈ через {activeAmountGoal.daysRemaining} {pluralDays(activeAmountGoal.daysRemaining)}
                    </Text>
                  </View>
                ) : null}

                {activeAmountGoal ? (
                  <>
                    <Text style={styles.section}>Активная цель</Text>
                    <ActiveGoalCard p={activeAmountGoal} cur={cur} onPress={() => goTo(activeAmountGoal.goal.id)} />
                  </>
                ) : null}

                {queuedAmountGoals.length > 0 ? (
                  <>
                    <Text style={styles.section}>Следующие цели</Text>
                    <View style={styles.list}>
                      {queuedAmountGoals.map((p, i) => (
                        <QueuedGoalRow
                          key={p.goal.id}
                          p={p}
                          cur={cur}
                          waitingFor={i === 0 ? null : queuedAmountGoals[i - 1].goal.title}
                          onPress={() => goTo(p.goal.id)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

            {incomeRateMetrics.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по доходу</Text>
                <View style={styles.list}>
                  {incomeRateMetrics.map((m) => (
                    <MetricCard key={m.goal.id} m={m} cur={cur} onPress={() => goTo(m.goal.id)} />
                  ))}
                </View>
              </>
            ) : null}

            {capitalMetrics.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по капиталу</Text>
                <View style={styles.list}>
                  {capitalMetrics.map((m) => (
                    <MetricCard key={m.goal.id} m={m} cur={cur} onPress={() => goTo(m.goal.id)} />
                  ))}
                </View>
              </>
            ) : null}

            {completeAmount.length > 0 ? (
              <>
                <Text style={styles.section}>Завершённые цели</Text>
                <View style={styles.list}>
                  {completeAmount.map((p) => (
                    <CompletedGoalRow key={p.goal.id} p={p} cur={cur} onPress={() => goTo(p.goal.id)} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}

        {archived.length > 0 ? (
          <>
            <Text style={styles.section}>Архив</Text>
            <View style={styles.list}>
              {archived.map((g) => (
                <Pressable key={g.id} style={styles.archivedRow} onPress={() => goTo(g.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.archivedTitle} numberOfLines={1}>{g.title}</Text>
                    <Text style={styles.archivedSub}>
                      {formatMoney(g.targetAmount, { currency: g.currency, kopecks: 'hide' })}
                      {g.kind === 'incomeRate' ? `/${g.incomeRatePeriod === 'month' ? 'мес' : 'день'}` : ''}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

function ActiveGoalCard({ p, cur, onPress }: { p: GoalProgress; cur: CurrencyCode; onPress: () => void }) {
  const { goal, filledAmount, targetAmount, progressPct, deltaToday, daysRemaining } = p;
  const remaining = Math.max(0, targetAmount - filledAmount);
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.activeCard}>
        <View style={styles.activeTopRow}>
          <View style={styles.activeIconTitle}>
            <View style={styles.activeIconBox}>
              <MaterialIcons name="flag" size={18} color={tokens.accent.base} />
            </View>
            <Text style={styles.activeTitle} numberOfLines={1}>{goal.title}</Text>
          </View>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Активная цель</Text>
          </View>
        </View>

        <View style={styles.activeMainRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeRemainLabel}>Осталось</Text>
            <Text style={styles.activeRemainValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(remaining, { currency: cur, kopecks: 'hide' })}
            </Text>
            {deltaToday > 0 ? (
              <View style={styles.deltaRow}>
                <MaterialIcons name="arrow-downward" size={12} color={tokens.semantic.positive} />
                <Text style={styles.deltaText}>на {formatMoney(deltaToday, { currency: cur, kopecks: 'hide' })} ближе сегодня</Text>
              </View>
            ) : null}
          </View>
          {daysRemaining !== null ? (
            <View style={styles.etaBadge}>
              <MaterialIcons name="event" size={14} color={tokens.accent.base} />
              <Text style={styles.etaBadgeValue}>≈{daysRemaining} {pluralDays(daysRemaining)}</Text>
              <Text style={styles.etaBadgeLabel}>до достижения</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }]} />
        </View>
        <Text style={styles.activeSummary}>
          {formatMoney(filledAmount, { currency: cur, kopecks: 'hide' })} из {formatMoney(targetAmount, { currency: cur, kopecks: 'hide' })} • {Math.round(progressPct)}% выполнено
        </Text>
      </Card>
    </Pressable>
  );
}

function QueuedGoalRow({
  p, cur, waitingFor, onPress,
}: { p: GoalProgress; cur: CurrencyCode; waitingFor: string | null; onPress: () => void }) {
  const { goal, filledAmount, targetAmount } = p;
  return (
    <Pressable style={styles.queuedRow} onPress={onPress}>
      <View style={styles.queuedIconBox}>
        <MaterialIcons name="flag" size={16} color={tokens.text.tertiary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.queuedTopRow}>
          <Text style={styles.queuedTitle} numberOfLines={1}>{goal.title}</Text>
          <View style={styles.waitBadge}>
            <Text style={styles.waitBadgeText}>Ожидает</Text>
          </View>
        </View>
        <Text style={styles.queuedAmount}>
          {formatMoney(filledAmount, { currency: cur, kopecks: 'hide' })} из {formatMoney(targetAmount, { currency: cur, kopecks: 'hide' })}
        </Text>
        <Text style={styles.queuedHint} numberOfLines={1}>
          {waitingFor ? `Начнётся после: ${waitingFor}` : 'Начнётся после завершения текущей цели'}
        </Text>
      </View>
    </Pressable>
  );
}

function MetricCard({ m, cur, onPress }: { m: GoalMetric; cur: CurrencyCode; onPress: () => void }) {
  const { goal, currentValue, targetValue, progressPct, isComplete, daysRemaining, growthPerPeriod } = m;
  const kind = goal.kind as GoalKind;
  const periodSuffix = kind === 'incomeRate' ? `/${goal.incomeRatePeriod === 'month' ? 'мес' : 'день'}` : '';
  const growthSuffix = kind === 'incomeRate' ? periodSuffix : '/мес';
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.metricCard}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>{goal.title}</Text>
          {isComplete ? (
            <View style={styles.doneBadge}>
              <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
              <Text style={styles.doneBadgeText}>Достигнуто</Text>
            </View>
          ) : (
            <Text style={styles.rowPct}>{Math.round(progressPct)}%</Text>
          )}
        </View>

        <View style={styles.metricCompareRow}>
          <View>
            <Text style={styles.metricCompareLabel}>Сейчас</Text>
            <Text style={styles.metricCompareValue}>{formatMoney(currentValue, { currency: cur, kopecks: 'hide' })}{periodSuffix}</Text>
          </View>
          <MaterialIcons name="arrow-forward" size={16} color={tokens.text.tertiary} />
          <View>
            <Text style={styles.metricCompareLabel}>Цель</Text>
            <Text style={styles.metricCompareValue}>{formatMoney(targetValue, { currency: cur, kopecks: 'hide' })}{periodSuffix}</Text>
          </View>
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }, isComplete && styles.fillDone]} />
        </View>

        <View style={styles.metricBottomRow}>
          {daysRemaining !== null ? (
            <View style={styles.etaBadgeSmall}>
              <MaterialIcons name="event" size={12} color={tokens.text.tertiary} />
              <Text style={styles.etaBadgeSmallText}>≈{formatDurationApprox(daysRemaining)} до достижения</Text>
            </View>
          ) : <View />}
          <View style={styles.growthPill}>
            <MaterialIcons name="trending-up" size={12} color={tokens.semantic.positive} />
            <Text style={styles.growthPillText}>
              +{formatMoney(growthPerPeriod, { currency: cur, kopecks: 'hide' })}{growthSuffix} текущий прирост
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function CompletedGoalRow({ p, cur, onPress }: { p: GoalProgress; cur: CurrencyCode; onPress: () => void }) {
  const { goal, targetAmount, completedInDays } = p;
  return (
    <Pressable style={styles.archivedRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.archivedTitle} numberOfLines={1}>{goal.title}</Text>
        <Text style={styles.archivedSub}>
          {formatMoney(targetAmount, { currency: cur, kopecks: 'hide' })}
          {completedInDays !== null ? ` • Выполнено за ${completedInDays} ${pluralDays(completedInDays)}` : ''}
        </Text>
      </View>
      <View style={styles.doneBadge}>
        <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
        <Text style={styles.doneBadgeText}>Выполнено</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  backBtn: { width: 24 },
  headerTitle: { fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.accent.base, alignItems: 'center', justifyContent: 'center' },

  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 16,
    backgroundColor: tokens.surface.rowTint,
    ...boxShadow(tokens.shadow.subtle),
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: tokens.surface.hairline },
  statValue: { fontFamily: font.bold, fontSize: 20, color: tokens.text.primary, letterSpacing: -0.2 },
  statLabel: { fontFamily: font.regular, fontSize: tokens.typography.micro, color: tokens.text.tertiary, textAlign: 'center' },

  nearestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: tokens.spacing.md, paddingHorizontal: 4 },
  nearestText: { fontFamily: font.medium, fontSize: tokens.typography.hint, color: tokens.text.secondary },

  list: { gap: 10 },
  row: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: tokens.surface.rowTint,
    gap: 10,
    ...boxShadow(tokens.shadow.subtle),
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  rowTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.text.primary },
  rowPct: { fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.accent.base },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: hexToRgba(tokens.semantic.positive, 0.12), borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.semantic.positive },
  track: { height: 8, borderRadius: 4, backgroundColor: hexToRgba('#909497', 0.16), overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: tokens.accent.base },
  fillDone: { backgroundColor: tokens.semantic.positive },

  section: { fontFamily: font.semibold, fontSize: 20, color: tokens.text.primary, letterSpacing: -0.2, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },

  // --- Активная цель (крупная карточка) ---
  activeCard: { gap: tokens.spacing.md },
  activeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  activeIconTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, minWidth: 0 },
  activeIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: hexToRgba(tokens.accent.base, 0.12), alignItems: 'center', justifyContent: 'center' },
  activeTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.text.primary },
  activeBadge: { backgroundColor: hexToRgba(tokens.accent.base, 0.12), borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.accent.base },
  activeMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  activeRemainLabel: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary },
  activeRemainValue: { fontFamily: font.bold, fontSize: 28, color: tokens.text.primary, letterSpacing: -0.3, marginTop: 2 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  deltaText: { fontFamily: font.medium, fontSize: tokens.typography.hint, color: tokens.semantic.positive },
  etaBadge: {
    alignItems: 'center', backgroundColor: hexToRgba(tokens.accent.base, 0.08),
    borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
  },
  etaBadgeValue: { fontFamily: font.semibold, fontSize: tokens.typography.caption, color: tokens.accent.base },
  etaBadgeLabel: { fontFamily: font.regular, fontSize: 10, color: tokens.text.tertiary },
  activeSummary: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.secondary },

  // --- Следующие цели (компактные строки очереди) ---
  queuedRow: {
    flexDirection: 'row', gap: tokens.spacing.md,
    borderRadius: 20, padding: 16,
    backgroundColor: tokens.surface.rowTint, ...boxShadow(tokens.shadow.subtle),
  },
  queuedIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.surface.neutral, alignItems: 'center', justifyContent: 'center' },
  queuedTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  queuedTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.text.primary },
  waitBadge: { backgroundColor: tokens.surface.neutral, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  waitBadgeText: { fontFamily: font.medium, fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  queuedAmount: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.secondary, marginTop: 2 },
  queuedHint: { fontFamily: font.regular, fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },

  // --- Метрики (Темп дохода / Капитал) ---
  metricCard: { gap: tokens.spacing.md },
  metricCompareRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.lg },
  metricCompareLabel: { fontFamily: font.regular, fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  metricCompareValue: { fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.text.primary, marginTop: 2 },
  metricBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  etaBadgeSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  etaBadgeSmallText: { fontFamily: font.regular, fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  growthPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: hexToRgba(tokens.semantic.positive, 0.1), borderRadius: tokens.radius.pill,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  growthPillText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.semantic.positive },

  archivedRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: tokens.surface.rowTint, ...boxShadow(tokens.shadow.subtle),
  },
  archivedTitle: { fontFamily: font.medium, fontSize: tokens.typography.label, color: tokens.text.secondary },
  archivedSub: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary, marginTop: 2 },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontFamily: font.regular, fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: tokens.text.inverse, fontFamily: font.semibold, fontSize: tokens.typography.label },
});
