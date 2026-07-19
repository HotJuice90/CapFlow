import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { goalsProgress, standaloneGoalsProgress, type GoalProgress, type GoalMetric } from '@/state/selectors';
import { pluralDays } from '@/format/date';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import type { CurrencyCode } from '@/domain/types';

export default function GoalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useData();
  const cur = data.settings.defaultCurrency;

  const progress = useMemo(() => goalsProgress(data), [data]);
  const metrics = useMemo(() => standaloneGoalsProgress(data), [data]);
  const archived = useMemo(() => data.goals.filter((g) => g.status === 'archived'), [data.goals]);
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
          <View style={styles.list}>
            {progress.map((p) => (
              <GoalRow key={p.goal.id} p={p} cur={cur} onPress={() => router.push(`/settings/goal-form?id=${p.goal.id}`)} />
            ))}
            {metrics.map((m) => (
              <MetricRow key={m.goal.id} m={m} cur={cur} onPress={() => router.push(`/settings/goal-form?id=${m.goal.id}`)} />
            ))}
          </View>
        )}

        {archived.length > 0 ? (
          <>
            <Text style={styles.section}>Архив</Text>
            <View style={styles.list}>
              {archived.map((g) => (
                <Pressable key={g.id} style={styles.archivedRow} onPress={() => router.push(`/settings/goal-form?id=${g.id}`)}>
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

function GoalRow({ p, cur, onPress }: { p: GoalProgress; cur: CurrencyCode; onPress: () => void }) {
  const { goal, filledAmount, targetAmount, progressPct, isComplete, daysRemaining } = p;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle} numberOfLines={1}>{goal.title}</Text>
        {isComplete ? (
          <View style={styles.doneBadge}>
            <MaterialIcons name="check" size={12} color={tokens.semantic.positive} />
            <Text style={styles.doneBadgeText}>Готово</Text>
          </View>
        ) : (
          <Text style={styles.rowPct}>{Math.round(progressPct)}%</Text>
        )}
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }, isComplete && styles.fillDone]} />
      </View>

      <View style={styles.rowBottom}>
        <Text style={styles.rowAmount}>
          {formatMoney(filledAmount, { currency: cur, kopecks: 'hide' })} из {formatMoney(targetAmount, { currency: cur, kopecks: 'hide' })}
        </Text>
        {!isComplete && daysRemaining !== null ? (
          <Text style={styles.rowDays}>≈ {daysRemaining} {pluralDays(daysRemaining)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function MetricRow({ m, cur, onPress }: { m: GoalMetric; cur: CurrencyCode; onPress: () => void }) {
  const { goal, currentValue, targetValue, progressPct, isComplete } = m;
  const suffix = goal.kind === 'incomeRate' ? `/${goal.incomeRatePeriod === 'month' ? 'мес' : 'день'}` : '';
  return (
    <Pressable style={styles.row} onPress={onPress}>
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

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progressPct))}%` }, isComplete && styles.fillDone]} />
      </View>

      <Text style={styles.rowAmount}>
        {formatMoney(currentValue, { currency: cur, kopecks: 'hide' })}{suffix} из {formatMoney(targetValue, { currency: cur, kopecks: 'hide' })}{suffix}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  backBtn: { width: 24 },
  headerTitle: { fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.accent.base, alignItems: 'center', justifyContent: 'center' },

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
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowAmount: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.secondary },
  rowDays: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary },

  section: { fontFamily: font.semibold, fontSize: 20, color: tokens.text.primary, letterSpacing: -0.2, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
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
