import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ActiveGoalCard, MetricCard } from '@/components/goals/GoalCard';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { goalsProgress, standaloneGoalsProgress, type GoalProgress } from '@/state/selectors';
import { pluralDays, formatDurationApprox } from '@/format/date';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { tapBuzz } from '@/lib/haptics';
import type { CurrencyCode, Goal } from '@/domain/types';

export default function GoalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateGoal } = useData();
  const cur = data.settings.defaultCurrency;

  const progress = useMemo(() => goalsProgress(data), [data]);
  const metrics = useMemo(() => standaloneGoalsProgress(data), [data]);
  // Полные списки (для счётчиков наверху) — завершённые считаем независимо от
  // статуса, это факт, а не текущее место в очереди. Видимые же секции ниже
  // показывают только status==='active': как только цель архивируешь кнопкой
  // в карточке, она пропадает из своей секции и уезжает в «Архив» —
  // подтверждение, что тап реально что-то сделал, а не просто спрятал иконку.
  // Архивная-и-НЕ-достигнутая метрика — по сути отложенная запись без
  // активного прогресса, в счёт «в игре» не идёт вообще (ни в счётчики,
  // ни в секции). Архивная-но-достигнутая считается (это факт), но видна
  // только в «Архиве» — из своей секции она уезжает при архивировании.
  const incomeRateMetrics = useMemo(
    () => metrics.filter((m) => m.goal.kind === 'incomeRate' && (m.goal.status === 'active' || m.isComplete)),
    [metrics],
  );
  const capitalMetrics = useMemo(
    () => metrics.filter((m) => m.goal.kind === 'capital' && (m.goal.status === 'active' || m.isComplete)),
    [metrics],
  );
  const incomeRateMetricsVisible = useMemo(() => incomeRateMetrics.filter((m) => m.goal.status === 'active'), [incomeRateMetrics]);
  const capitalMetricsVisible = useMemo(() => capitalMetrics.filter((m) => m.goal.status === 'active'), [capitalMetrics]);

  const incompleteAmount = useMemo(() => progress.filter((p) => !p.isComplete && p.goal.status === 'active'), [progress]);
  const completeAmount = useMemo(() => progress.filter((p) => p.isComplete), [progress]);
  const completeAmountVisible = useMemo(() => completeAmount.filter((p) => p.goal.status === 'active'), [completeAmount]);
  const activeAmountGoal = incompleteAmount[0];
  const queuedAmountGoals = incompleteAmount.slice(1);

  const completeGoalIds = useMemo(
    () => new Set([...completeAmount.map((p) => p.goal.id), ...metrics.filter((m) => m.isComplete).map((m) => m.goal.id)]),
    [completeAmount, metrics],
  );
  // Для архивной секции: у целей по сумме есть completedInDays (сколько заняло
  // достижение) — у метрик такого нет, они не «копятся» во времени.
  const completeAmountById = useMemo(() => new Map(completeAmount.map((p) => [p.goal.id, p])), [completeAmount]);
  const archived = useMemo(() => data.goals.filter((g) => g.status === 'archived'), [data.goals]);

  // Три параллельных типа целей не противоречат друг другу — счётчик наверху
  // просто суммирует все, независимо от типа (в отличие от очереди-водопада,
  // которая касается только «Суммы»). Архивная-и-недостигнутая (по сути
  // отложенная) в этот счёт не идёт — она уже не «в игре».
  const allGoalsCount = incompleteAmount.length + completeAmount.length + incomeRateMetrics.length + capitalMetrics.length;
  const activeCount = (activeAmountGoal ? 1 : 0)
    + incomeRateMetrics.filter((m) => !m.isComplete).length
    + capitalMetrics.filter((m) => !m.isComplete).length;
  const completedCount = completeAmount.length
    + incomeRateMetrics.filter((m) => m.isComplete).length
    + capitalMetrics.filter((m) => m.isComplete).length;

  const goTo = (id: string) => router.push(`/settings/goal-form?id=${id}`);
  const archiveGoal = async (goal: Goal) => {
    tapBuzz();
    await updateGoal({ ...goal, status: 'archived', archivedAt: new Date().toISOString() });
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
            {/* Сводка — сознательно БЕЗ карточки (лежит прямо на фоне экрана), чтобы
                не сливаться с настоящими карточками целей ниже: тот же приём, что
                и хиро на аналитике/главной. Крупные цифры, иконка+подпись — одной
                строкой над числом (не рядом с ним, как в обычных тайлах). */}
            <View style={styles.summaryRow}>
              <SummaryStat icon="flag" color={tokens.accent.base} label="Все цели" value={allGoalsCount} />
              <View style={styles.summaryDivider} />
              <SummaryStat icon="bolt" color={tokens.semantic.warning} label="Активные" value={activeCount} />
              <View style={styles.summaryDivider} />
              <SummaryStat icon="emoji-events" color={tokens.semantic.positive} label="Завершённые" value={completedCount} />
            </View>
            {activeAmountGoal && activeAmountGoal.daysRemaining !== null ? (
              <View style={styles.nearestRow}>
                <MaterialIcons name="event" size={14} color={tokens.text.tertiary} />
                <Text style={styles.nearestText}>
                  Ближайшее достижение — через ~ {formatDurationApprox(activeAmountGoal.daysRemaining)}
                </Text>
              </View>
            ) : null}

            {progress.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по сумме</Text>
                <View style={styles.list}>
                  {completeAmountVisible.map((p) => (
                    <ActiveGoalCard key={p.goal.id} p={p} cur={cur} onPress={() => goTo(p.goal.id)} onArchive={() => archiveGoal(p.goal)} />
                  ))}
                  {activeAmountGoal ? (
                    <ActiveGoalCard p={activeAmountGoal} cur={cur} onPress={() => goTo(activeAmountGoal.goal.id)} onArchive={() => archiveGoal(activeAmountGoal.goal)} />
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

            {incomeRateMetricsVisible.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по доходу</Text>
                <View style={styles.list}>
                  {incomeRateMetricsVisible.map((m) => (
                    <MetricCard key={m.goal.id} m={m} cur={cur} onPress={() => goTo(m.goal.id)} onArchive={() => archiveGoal(m.goal)} />
                  ))}
                </View>
              </>
            ) : null}

            {capitalMetricsVisible.length > 0 ? (
              <>
                <Text style={styles.section}>Цели по капиталу</Text>
                <View style={styles.list}>
                  {capitalMetricsVisible.map((m) => (
                    <MetricCard key={m.goal.id} m={m} cur={cur} onPress={() => goTo(m.goal.id)} onArchive={() => archiveGoal(m.goal)} />
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
              {archived.map((g) => {
                const doneP = completeAmountById.get(g.id);
                const isDoneMetric = !doneP && completeGoalIds.has(g.id);
                return (
                  <Pressable key={g.id} style={styles.archivedRow} onPress={() => goTo(g.id)}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={styles.archivedTopRow}>
                        <Text style={styles.archivedTitle} numberOfLines={1}>{g.title}</Text>
                        {doneP || isDoneMetric ? (
                          <View style={styles.doneBadge}>
                            <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
                            <Text style={styles.doneBadgeText}>{g.kind === 'amount' || !g.kind ? 'Выполнено' : 'Достигнуто'}</Text>
                          </View>
                        ) : null}
                      </View>
                      {doneP ? (
                        <>
                          <View style={styles.archivedTrack}>
                            <View style={styles.archivedFill} />
                          </View>
                          <View style={styles.archivedDoneRow}>
                            <Text style={styles.archivedDoneSum}>
                              {formatMoney(g.targetAmount, { currency: g.currency, kopecks: 'hide' })}
                            </Text>
                            {doneP.completedInDays !== null ? (
                              <Text style={styles.archivedDoneSub}>за {doneP.completedInDays} {pluralDays(doneP.completedInDays)}</Text>
                            ) : null}
                          </View>
                        </>
                      ) : (
                        <Text style={styles.archivedSub}>
                          {formatMoney(g.targetAmount, { currency: g.currency, kopecks: 'hide' })}
                          {g.kind === 'incomeRate' ? `/${g.incomeRatePeriod === 'month' ? 'мес' : 'день'}` : ''}
                        </Text>
                      )}
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

function SummaryStat({
  icon, color, label, value,
}: { icon: React.ComponentProps<typeof MaterialIcons>['name']; color: string; label: string; value: number }) {
  return (
    <View style={styles.summaryStat}>
      <View style={styles.summaryTopRow}>
        <View style={[styles.summaryIconBox, { backgroundColor: hexToRgba(color, 0.12) }]}>
          <MaterialIcons name={icon} size={13} color={color} />
        </View>
        <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  backBtn: { width: 24 },
  headerTitle: { fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.accent.base, alignItems: 'center', justifyContent: 'center' },

  // Сводка — без карточки, прямо на фоне (см. комментарий у JSX). Иконка+подпись
  // одной строкой НАД числом (не сбоку от него, как в обычных тайлах-плашках) —
  // так крупная цифра ничем не разбавлена и сразу читается как главный акцент.
  summaryRow: { flexDirection: 'row', alignItems: 'stretch', gap: tokens.spacing.md },
  summaryStat: { flex: 1, minWidth: 0, gap: 8 },
  summaryDivider: { width: 1, backgroundColor: tokens.surface.hairline },
  summaryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryIconBox: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontFamily: font.medium, fontSize: tokens.typography.caption, color: tokens.text.tertiary, flexShrink: 1 },
  summaryValue: { fontFamily: font.extrabold, fontSize: 34, lineHeight: 36, color: tokens.text.primary, letterSpacing: -0.5 },
  nearestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: tokens.spacing.lg },
  nearestText: { fontFamily: font.medium, fontSize: tokens.typography.hint, color: tokens.text.secondary },

  list: { gap: 10 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: hexToRgba(tokens.semantic.positive, 0.12), borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontFamily: font.semibold, fontSize: tokens.typography.micro, color: tokens.semantic.positive },

  section: { fontFamily: font.semibold, fontSize: 20, color: tokens.text.primary, letterSpacing: -0.2, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },

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
  archivedTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  archivedTitle: { flex: 1, fontFamily: font.medium, fontSize: tokens.typography.label, color: tokens.text.secondary },
  archivedSub: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary },
  archivedTrack: { height: 6, borderRadius: 3, backgroundColor: hexToRgba('#909497', 0.16), overflow: 'hidden' },
  archivedFill: { height: '100%', width: '100%', borderRadius: 3, backgroundColor: tokens.semantic.positive },
  archivedDoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  archivedDoneSum: { fontFamily: font.semibold, fontSize: tokens.typography.hint, color: tokens.text.secondary },
  archivedDoneSub: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontFamily: font.regular, fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: tokens.text.inverse, fontFamily: font.semibold, fontSize: tokens.typography.label },
});
