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
import { tapBuzz } from '@/lib/haptics';
import type { CurrencyCode, Goal, GoalKind } from '@/domain/types';

export default function GoalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateGoal } = useData();
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

  // Три параллельных типа целей не противоречат друг другу — счётчик наверху
  // просто суммирует все, независимо от типа (в отличие от очереди-водопада,
  // которая касается только «Суммы»).
  const allGoalsCount = progress.length + metrics.length;
  const activeCount = (activeAmountGoal ? 1 : 0) + metrics.filter((m) => !m.isComplete).length;
  const completedCount = completeAmount.length + metrics.filter((m) => m.isComplete).length;

  const goTo = (id: string) => router.push(`/settings/goal-form?id=${id}`);
  const archiveGoal = async (goal: Goal) => {
    tapBuzz();
    await updateGoal({ ...goal, status: 'archived' });
  };
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
            <Card>
              <View style={styles.cardInner}>
                <View style={styles.counterRow}>
                  <CounterTile icon="flag" color={tokens.accent.base} label="Все цели" value={allGoalsCount} />
                  <CounterTile icon="bolt" color={tokens.accent.base} label="Активные" value={activeCount} />
                  <CounterTile icon="emoji-events" color={tokens.semantic.positive} label="Завершённые" value={completedCount} />
                </View>
                {activeAmountGoal && activeAmountGoal.daysRemaining !== null ? (
                  <View style={styles.nearestRow}>
                    <MaterialIcons name="event" size={14} color={tokens.text.tertiary} />
                    <Text style={styles.nearestText}>
                      Ближайшее достижение — через ≈{activeAmountGoal.daysRemaining} {pluralDays(activeAmountGoal.daysRemaining)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>

            {progress.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по сумме</Text>
                <View style={styles.list}>
                  {activeAmountGoal ? (
                    <ActiveGoalCard p={activeAmountGoal} cur={cur} onPress={() => goTo(activeAmountGoal.goal.id)} />
                  ) : null}
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

            {incomeRateMetrics.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по доходу</Text>
                <View style={styles.list}>
                  {incomeRateMetrics.map((m) => (
                    <MetricCard key={m.goal.id} m={m} cur={cur} onPress={() => goTo(m.goal.id)} onArchive={() => archiveGoal(m.goal)} />
                  ))}
                </View>
              </>
            ) : null}

            {capitalMetrics.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по капиталу</Text>
                <View style={styles.list}>
                  {capitalMetrics.map((m) => (
                    <MetricCard key={m.goal.id} m={m} cur={cur} onPress={() => goTo(m.goal.id)} onArchive={() => archiveGoal(m.goal)} />
                  ))}
                </View>
              </>
            ) : null}

            {completeAmount.length > 0 ? (
              <>
                <Text style={styles.section}>Завершённые цели</Text>
                <View style={styles.list}>
                  {completeAmount.map((p) => (
                    <CompletedGoalRow key={p.goal.id} p={p} cur={cur} onPress={() => goTo(p.goal.id)} onArchive={() => archiveGoal(p.goal)} />
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

function CounterTile({
  icon, color, label, value,
}: { icon: React.ComponentProps<typeof MaterialIcons>['name']; color: string; label: string; value: number }) {
  return (
    <View style={styles.counterTile}>
      <View style={[styles.counterIconBox, { backgroundColor: hexToRgba(color, 0.12) }]}>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ActiveGoalCard({ p, cur, onPress }: { p: GoalProgress; cur: CurrencyCode; onPress: () => void }) {
  const { goal, filledAmount, targetAmount, progressPct, deltaToday, daysRemaining } = p;
  const remaining = Math.max(0, targetAmount - filledAmount);
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.cardInner}>
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
                  <MaterialIcons name="add" size={12} color={tokens.semantic.positive} />
                  <Text style={styles.deltaText}>{formatMoney(deltaToday, { currency: cur, kopecks: 'hide' })} сегодня</Text>
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
          <View style={styles.cardFooterRow}>
            <Text style={styles.cardFooterPct}>{Math.round(progressPct)}%</Text>
            <Text style={styles.cardFooterAmount}>
              {formatMoney(filledAmount, { currency: cur, kopecks: 'hide' })} из {formatMoney(targetAmount, { currency: cur, kopecks: 'hide' })}
            </Text>
          </View>
        </View>
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
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
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

function MetricCard({
  m, cur, onPress, onArchive,
}: { m: GoalMetric; cur: CurrencyCode; onPress: () => void; onArchive: () => void }) {
  const { goal, currentValue, targetValue, progressPct, isComplete, daysRemaining, growthPerPeriod } = m;
  const kind = goal.kind as GoalKind;
  const periodSuffix = kind === 'incomeRate' ? `/${goal.incomeRatePeriod === 'month' ? 'мес' : 'день'}` : '';
  const growthSuffix = kind === 'incomeRate' ? periodSuffix : '/мес';
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.cardInner}>
          <View style={styles.activeTopRow}>
            <View style={styles.activeIconTitle}>
              <View style={styles.activeIconBox}>
                <MaterialIcons name={kind === 'incomeRate' ? 'trending-up' : 'account-balance'} size={18} color={tokens.accent.base} />
              </View>
              <Text style={styles.activeTitle} numberOfLines={1}>{goal.title}</Text>
            </View>
            {isComplete ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                <View style={styles.doneBadge}>
                  <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
                  <Text style={styles.doneBadgeText}>Достигнуто</Text>
                </View>
                <Pressable onPress={onArchive} hitSlop={10}>
                  <MaterialIcons name="archive" size={18} color={tokens.text.tertiary} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.activeMainRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeRemainLabel}>Сейчас</Text>
              <Text style={styles.activeRemainValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(currentValue, { currency: cur, kopecks: 'hide' })}{periodSuffix}
              </Text>
            </View>
            <View style={styles.etaBadge}>
              {kind === 'capital' && daysRemaining !== null ? (
                <>
                  <MaterialIcons name="event" size={14} color={tokens.accent.base} />
                  <Text style={styles.etaBadgeValue}>≈{formatDurationApprox(daysRemaining)}</Text>
                  <Text style={styles.etaBadgeLabel}>до достижения</Text>
                </>
              ) : (
                <>
                  <Text style={styles.etaBadgeLabel}>Цель</Text>
                  <Text style={styles.etaBadgeValue}>{formatMoney(targetValue, { currency: cur, kopecks: 'hide' })}{periodSuffix}</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }, isComplete && styles.fillDone]} />
          </View>

          <View style={styles.cardFooterRow}>
            <Text style={styles.cardFooterPct}>{Math.round(progressPct)}%</Text>
            <View style={styles.growthRow}>
              <MaterialIcons name="trending-up" size={12} color={tokens.semantic.positive} />
              <Text style={styles.growthText}>
                +{formatMoney(growthPerPeriod, { currency: cur, kopecks: 'hide' })}{growthSuffix} прирост
              </Text>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function CompletedGoalRow({
  p, cur, onPress, onArchive,
}: { p: GoalProgress; cur: CurrencyCode; onPress: () => void; onArchive: () => void }) {
  const { goal, targetAmount, completedInDays } = p;
  return (
    <View style={styles.archivedRow}>
      <Pressable style={{ flex: 1 }} onPress={onPress}>
        <Text style={styles.archivedTitle} numberOfLines={1}>{goal.title}</Text>
        <Text style={styles.archivedSub}>
          {formatMoney(targetAmount, { currency: cur, kopecks: 'hide' })}
          {completedInDays !== null ? ` • Выполнено за ${completedInDays} ${pluralDays(completedInDays)}` : ''}
        </Text>
      </Pressable>
      <View style={styles.doneBadge}>
        <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
        <Text style={styles.doneBadgeText}>Выполнено</Text>
      </View>
      <Pressable onPress={onArchive} hitSlop={10}>
        <MaterialIcons name="archive" size={18} color={tokens.text.tertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  backBtn: { width: 24 },
  headerTitle: { fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.accent.base, alignItems: 'center', justifyContent: 'center' },

  // Card применяет `style` к внешнему теневому слою, а не к контенту — поэтому
  // gap для внутренних отступов вешаем на собственную обёртку внутри Card,
  // а не на сам Card (иначе gap молча не работает и всё слипается).
  cardInner: { gap: tokens.spacing.md },

  counterRow: { flexDirection: 'row', gap: tokens.spacing.sm },
  counterTile: { flex: 1, alignItems: 'center', gap: 4 },
  counterIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  counterValue: { fontFamily: font.extrabold, fontSize: 22, color: tokens.text.primary, letterSpacing: -0.2, marginTop: 2 },
  counterLabel: { fontFamily: font.medium, fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  nearestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: tokens.spacing.md, borderTopWidth: 1, borderTopColor: tokens.surface.hairline },
  nearestText: { fontFamily: font.medium, fontSize: tokens.typography.hint, color: tokens.text.secondary },

  list: { gap: 10 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: hexToRgba(tokens.semantic.positive, 0.12), borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.semantic.positive },
  track: { height: 8, borderRadius: 4, backgroundColor: hexToRgba('#909497', 0.16), overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: tokens.accent.base },
  fillDone: { backgroundColor: tokens.semantic.positive },

  section: { fontFamily: font.semibold, fontSize: 20, color: tokens.text.primary, letterSpacing: -0.2, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },

  // --- Общий стиль крупных карточек (активная цель по сумме / метрики) ---
  activeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  activeIconTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, minWidth: 0 },
  activeIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: hexToRgba(tokens.accent.base, 0.12), alignItems: 'center', justifyContent: 'center' },
  activeTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.text.primary },
  activeBadge: { backgroundColor: hexToRgba(tokens.accent.base, 0.12), borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.accent.base },
  activeMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  activeRemainLabel: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary },
  activeRemainValue: { fontFamily: font.bold, fontSize: 28, color: tokens.text.primary, letterSpacing: -0.3, marginTop: 4 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  deltaText: { fontFamily: font.medium, fontSize: tokens.typography.hint, color: tokens.semantic.positive },
  etaBadge: {
    alignItems: 'center', backgroundColor: tokens.surface.neutral,
    borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
  },
  etaBadgeValue: { fontFamily: font.semibold, fontSize: tokens.typography.caption, color: tokens.accent.base },
  etaBadgeLabel: { fontFamily: font.regular, fontSize: 10, color: tokens.text.tertiary },
  cardFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardFooterPct: { fontFamily: font.bold, fontSize: tokens.typography.label, color: tokens.accent.base },
  cardFooterAmount: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.secondary },
  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  growthText: { fontFamily: font.medium, fontSize: tokens.typography.hint, color: tokens.semantic.positive },

  // --- Следующие цели (компактные строки очереди — та же секция, что активная) ---
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
  queuedAmount: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.secondary },
  queuedHint: { fontFamily: font.regular, fontSize: tokens.typography.micro, color: tokens.text.tertiary },

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
