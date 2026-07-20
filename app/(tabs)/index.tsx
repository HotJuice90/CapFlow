import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { Sparkline } from '@/components/Sparkline';
import { TypeCardsRow } from '@/components/TypeCardsRow';
import { Donut } from '@/components/Donut';
import { AssetRow } from '@/components/AssetRow';
import { ActiveGoalCard, MetricCard } from '@/components/goals/GoalCard';
import { useData } from '@/state/DataContext';
import {
  buildAssetViews,
  portfolioSummary,
  groupByInstrumentType,
  incomeSparkline,
  monthComparison,
  analyticsSummary,
  liquidity,
  goalsProgress,
  standaloneGoalsProgress,
  type GoalProgress,
  type GoalMetric,
} from '@/state/selectors';
import type { AssetView, Goal } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercentSigned } from '@/format';
import { formatDateShort, pluralDays } from '@/format/date';
import { tapBuzz } from '@/lib/haptics';
import { t } from '@/i18n';

type SortKey = 'income' | 'amount' | 'rate' | 'end' | 'added';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'added', label: 'по добавлению' },
  { key: 'income', label: 'по доходу/день' },
  { key: 'amount', label: 'по сумме' },
  { key: 'rate', label: 'по ставке' },
  { key: 'end', label: 'по сроку' },
];

function sortViews(views: AssetView[], key: SortKey): AssetView[] {
  const v = [...views];
  switch (key) {
    case 'income': return v.sort((a, b) => b.derived.incomePerDay - a.derived.incomePerDay);
    case 'amount': return v.sort((a, b) => b.asset.amount - a.asset.amount);
    case 'rate': return v.sort((a, b) => b.asset.rate - a.asset.rate);
    case 'end': return v.sort((a, b) => (a.derived.daysRemaining ?? Infinity) - (b.derived.daysRemaining ?? Infinity));
    default: return v;
  }
}

/** Прогресс срока (0..1) для активов с датой окончания — для мини-кольца в списке событий. */
function termProgress(view: AssetView): number {
  const { asset, derived } = view;
  if (!asset.endDate || derived.daysRemaining === undefined) return 0;
  const totalDays = Math.max(
    1,
    Math.round((new Date(asset.endDate).getTime() - new Date(asset.openDate).getTime()) / 86_400_000),
  );
  return Math.min(1, Math.max(0, 1 - derived.daysRemaining / totalDays));
}

function pluralPlatform(n: number): string {
  return n === 1 ? 'площадке' : 'площадках';
}

export default function HomeScreen() {
  const { data, loading, updateGoal } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sortIdx, setSortIdx] = useState(0);
  // Индекс текущего слайда целей + анимированное значение под него — точки
  // пагинации плавно доезжают (Animated.timing) при смене индекса, а не
  // дёргаются вслед за сырыми пикселями скролла (тот скачет на iOS/Android
  // по-разному в момент снэпа страницы).
  const [goalSlideIdx, setGoalSlideIdx] = useState(0);
  const goalDotAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(goalDotAnim, {
      toValue: goalSlideIdx,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [goalSlideIdx, goalDotAnim]);

  const views = useMemo(() => buildAssetViews(data), [data]);
  const summary = useMemo(() => portfolioSummary(data), [data]);
  const grouped = useMemo(() => groupByInstrumentType(data), [data]);
  const spark = useMemo(() => incomeSparkline(data, 30), [data]);
  const comp = useMemo(() => monthComparison(data), [data]);
  const taxSummary = useMemo(() => analyticsSummary(data), [data]);
  const liq = useMemo(() => liquidity(data), [data]);
  const liqTotal = liq.liquid + liq.frozen;
  const liqLiquidShare = liqTotal > 0 ? liq.liquid / liqTotal : 0;

  const upcoming = useMemo(
    () =>
      views
        .filter((v) => v.instrument.behavior === 'term' && v.asset.endDate && v.derived.daysRemaining !== undefined)
        .sort((a, b) => (a.derived.daysRemaining ?? 0) - (b.derived.daysRemaining ?? 0))
        .slice(0, 3),
    [views],
  );

  const sort = SORTS[sortIdx];
  const sortedViews = useMemo(() => sortViews(views, sort.key), [views, sort.key]);

  // Цели — водопад по всем активным, но на Главной показываем только «голову
  // очереди» (первую незаполненную) — остальные ждут своей очереди, отдельно
  // им сейчас копиться не в что.
  const goals = useMemo(() => goalsProgress(data), [data]);
  // Приоритет как на экране «Цели»: сперва уже достигнутая-но-неархивная (её
  // давно пора отметить/убрать в архив), потом та, что реально ещё копится.
  // Архивную НЕ подставляем как заглушку — если активных/неархивных нет,
  // слайда для этой категории просто не будет (не висит мёртвым грузом).
  const activeGoal = goals.find((g) => g.isComplete && g.goal.status === 'active')
    ?? goals.find((g) => !g.isComplete && g.goal.status === 'active');
  // «Темп дохода»/«Капитал» — измерители, не участвуют в очереди, поэтому
  // на Главную попадает первая ещё не архивная цель каждого вида (createdAt) —
  // достигнутая-но-неархивная тоже годится (не перестаёт быть достижением),
  // архивная — нет, вне зависимости от isComplete.
  const metrics = useMemo(() => standaloneGoalsProgress(data), [data]);
  const incomeRateGoal = metrics.find((m) => m.goal.kind === 'incomeRate' && m.goal.status === 'active');
  const capitalGoal = metrics.find((m) => m.goal.kind === 'capital' && m.goal.status === 'active');
  const hasAnyGoal = !!activeGoal || !!incomeRateGoal || !!capitalGoal;
  type GoalSlide =
    | { kind: 'amount'; p: GoalProgress }
    | { kind: 'incomeRate' | 'capital'; m: GoalMetric };
  const goalSlides: GoalSlide[] = [
    ...(activeGoal ? [{ kind: 'amount' as const, p: activeGoal }] : []),
    ...(incomeRateGoal ? [{ kind: 'incomeRate' as const, m: incomeRateGoal }] : []),
    ...(capitalGoal ? [{ kind: 'capital' as const, m: capitalGoal }] : []),
  ];
  const archiveGoal = async (goal: Goal) => {
    tapBuzz();
    await updateGoal({ ...goal, status: 'archived', archivedAt: new Date().toISOString() });
  };
  // Если архивировали слайд и число страниц сократилось — индекс мог указывать
  // за пределы нового списка, точки пагинации тогда рисовали бы не то.
  useEffect(() => {
    if (goalSlideIdx > Math.max(0, goalSlides.length - 1)) setGoalSlideIdx(0);
  }, [goalSlides.length, goalSlideIdx]);

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.center}><ActivityIndicator color={tokens.accent.base} /></View>
      </ScreenBackground>
    );
  }

  const hasAssets = views.length > 0;
  const hasArchived = data.assets.some((a) => a.status !== 'active');
  const cur = data.settings.defaultCurrency;
  const capitalDeltaPct = comp.capitalPrev > 0 ? ((comp.capitalNow - comp.capitalPrev) / comp.capitalPrev) * 100 : undefined;
  const hasCapitalDelta = typeof capitalDeltaPct === 'number' && isFinite(capitalDeltaPct);
  const capitalDeltaPositive = (capitalDeltaPct ?? 0) >= 0;
  const orgCount = new Set(views.map((v) => v.organization.id)).size;

  // Прогресс по лимиту считаем от УЖЕ накопленного дохода (на сегодня), а не от
  // прогноза за год. Лимит — льгота только для активов «доплатить самому»:
  // те, где банк удерживает налог сам, в этом дележе не участвуют вообще.
  const taxLimit = data.params.taxFreeLimit;
  const taxUsed = Math.min(taxSummary.selfAccrued, taxLimit);
  const taxRemain = Math.max(0, taxLimit - taxSummary.selfAccrued);
  const taxUsedPct = taxLimit > 0 ? Math.min(100, Math.round((taxUsed / taxLimit) * 100)) : 0;
  // За вычетом уже уплаченного — та же логика, что и «К доплате при снятии» на
  // карточке актива: не валовый налог на весь доход, а то, что ЕЩЁ спишут.
  const taxWithheldRemaining = Math.max(0, taxSummary.taxAccruedWithheld - taxSummary.taxPaidTotal);
  // Итог для планирования: с точки зрения кошелька это один и тот же налог —
  // просто одна часть уйдёт банку автоматически, другая — самому по декларации.
  const taxRecommendedSetAside = taxSummary.taxAccruedSelf + taxWithheldRemaining;

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.spacing.screenTop,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.wordmark}>CapFlow</Text>
          <View style={styles.topActions}>
            <Pressable style={styles.iconBtn} onPress={() => router.push('/search')} hitSlop={8}>
              <MaterialIcons name="search" size={22} color={tokens.text.secondary} />
            </Pressable>
            <Pressable style={styles.addBtn} onPress={() => router.push('/asset/form')} hitSlop={8}>
              <MaterialCommunityIcons name="plus" size={24} color={tokens.text.inverse} />
            </Pressable>
          </View>
        </View>

        {hasAssets ? (
          <>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>Сегодня принесёт</Text>
                <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
                  +{formatMoney(summary.incomePerDay, { currency: cur, kopecks: 'hide' })}
                </Text>
              </View>
              <View style={styles.heroMonthPill}>
                <View style={styles.heroMonthIconRow}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={13} color={tokens.text.tertiary} />
                  <Text style={styles.heroMonthLabel}>в месяц</Text>
                </View>
                <Text style={styles.heroMonthValue} numberOfLines={1} adjustsFontSizeToFit>
                  +{formatMoney(summary.incomePerMonth, { currency: cur, kopecks: 'hide' })}
                </Text>
              </View>
            </View>

            {spark.length >= 2 ? (
              <View style={styles.heroSparkWrap}>
                <Sparkline data={spark} width={SPARK_W} height={42} color={tokens.semantic.positive} />
              </View>
            ) : null}

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatTile}>
                <View style={styles.heroStatLabelRow}>
                  <MaterialCommunityIcons name="wallet-outline" size={14} color={tokens.text.tertiary} />
                  <Text style={styles.heroStatLabel} numberOfLines={1}>Капитал в работе</Text>
                </View>
                <View style={styles.heroStatValueRow}>
                  <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMoney(summary.workingCapital, { currency: cur, kopecks: 'hide' })}
                  </Text>
                  {hasCapitalDelta ? (
                    <MaterialCommunityIcons
                      name={capitalDeltaPositive ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={capitalDeltaPositive ? tokens.semantic.positive : tokens.semantic.negative}
                    />
                  ) : null}
                </View>
                {hasCapitalDelta ? (
                  <Text style={[styles.heroStatDelta, { color: capitalDeltaPositive ? tokens.semantic.positive : tokens.semantic.negative }]}>
                    {formatPercentSigned(capitalDeltaPct as number)}
                  </Text>
                ) : null}
              </View>
              <View style={styles.heroStatTile}>
                <View style={styles.heroStatLabelRow}>
                  <MaterialCommunityIcons name="star-outline" size={14} color={tokens.text.tertiary} />
                  <Text style={styles.heroStatLabel} numberOfLines={1}>Активов в работе</Text>
                </View>
                <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  {views.length} на {orgCount} {pluralPlatform(orgCount)}
                </Text>
              </View>
            </View>

            {taxSummary.topInstrument ? (
              <View style={styles.heroLeaderPill}>
                <View style={styles.heroLeaderIcon}>
                  <MaterialCommunityIcons name="star-four-points" size={14} color={tokens.semantic.positive} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.heroLeaderLabel}>Лидер дохода</Text>
                  <Text style={styles.heroLeaderName} numberOfLines={1}>{taxSummary.topInstrument.name}</Text>
                </View>
                <Text style={styles.heroLeaderValue} numberOfLines={1}>
                  +{formatMoney(taxSummary.topInstrument.incomePerDay, { currency: cur, kopecks: 'hide' })}/д
                </Text>
              </View>
            ) : null}

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Текущие цели</Text>
              {hasAnyGoal ? (
                <Pressable onPress={() => router.push('/settings/goals')} hitSlop={8}>
                  <Text style={styles.link}>Все цели</Text>
                </Pressable>
              ) : null}
            </View>
            {goalSlides.length > 0 ? (
              <>
                {/* Каждая «страница» — во весь экран (а не в ширину карточки), сама карточка
                    внутри неё с обычным паддингом 16 — визуально всё как было, ровно по центру,
                    ничего не торчит. Разрыв паддинга экрана на самом ScrollView (marginHorizontal:
                    -screenH) — это не сдвигает карточку, а просто убирает жёсткую границу клипа
                    ровно по 16px: раньше вьюпорт скролла обрезался там же, где кончается карточка,
                    и тень тыкалась в невидимую стену; теперь у неё есть прозрачный запас с боков
                    и сверху/снизу (paddingVertical страницы) под тень и под въезд соседней карточки. */}
                <View style={styles.goalSliderClip}>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => setGoalSlideIdx(Math.round(e.nativeEvent.contentOffset.x / SLIDE_W))}
                    onScrollEndDrag={(e) => setGoalSlideIdx(Math.round(e.nativeEvent.contentOffset.x / SLIDE_W))}
                  >
                    {goalSlides.map((slide, i) => (
                      <View key={i} style={styles.goalSlidePage}>
                        {slide.kind === 'amount' ? (
                          <ActiveGoalCard
                            p={slide.p}
                            cur={cur}
                            onPress={() => router.push(`/settings/goal-form?id=${slide.p.goal.id}`)}
                            onArchive={() => archiveGoal(slide.p.goal)}
                          />
                        ) : (
                          <MetricCard
                            m={slide.m}
                            cur={cur}
                            onPress={() => router.push(`/settings/goal-form?id=${slide.m.goal.id}`)}
                            onArchive={() => archiveGoal(slide.m.goal)}
                          />
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </View>
                {goalSlides.length > 1 ? (
                  <View style={styles.goalDotsWrap}>
                    <View style={styles.goalDots}>
                      {goalSlides.map((_, i) => {
                        const dotInputRange = [i - 1, i, i + 1];
                        return (
                          <Animated.View
                            key={i}
                            style={[
                              styles.goalDot,
                              {
                                width: goalDotAnim.interpolate({
                                  inputRange: dotInputRange,
                                  outputRange: [DOT_W, DOT_ACTIVE_W, DOT_W],
                                  extrapolate: 'clamp',
                                }),
                                backgroundColor: goalDotAnim.interpolate({
                                  inputRange: dotInputRange,
                                  outputRange: [GOAL_DOT_OFF, GOAL_DOT_ON, GOAL_DOT_OFF],
                                  extrapolate: 'clamp',
                                }),
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <Pressable onPress={() => router.push('/settings/goal-form')}>
                <Card>
                  <View style={styles.goalEmptyRow}>
                    <View style={styles.goalEmptyIcon}>
                      <MaterialIcons name="flag" size={20} color={tokens.accent.base} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.goalEmptyTitle}>Заведи цель</Text>
                      <Text style={styles.goalEmptyHint}>Доход портфеля начнёт копиться в её счёт</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                  </View>
                </Card>
              </Pressable>
            )}

            {liq.frozen > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Ликвидность</Text>
                <Card>
                  <View>
                    <Text style={styles.liqLabel}>Доступно сейчас</Text>
                    <Text style={[styles.liqValue, { color: tokens.semantic.positive }]}>
                      {formatMoney(liq.liquid, { currency: cur, kopecks: 'hide' })}
                    </Text>
                  </View>

                  <View style={styles.liqBarWrap}>
                    <View style={styles.liqTrack}>
                      <LinearGradient
                        colors={[hexToRgba(tokens.semantic.positive, 0.5), tokens.semantic.positive]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.liqFill, { width: `${Math.min(Math.max(liqLiquidShare * 100, 0), 100)}%` }]}
                      />
                    </View>
                  </View>

                  <View style={styles.liqMeta}>
                    <Text style={styles.liqMetaBigValue}>{Math.round(liqLiquidShare * 100)}%</Text>
                    <View style={styles.liqMetaInlineRow}>
                      <MaterialIcons name="lock" size={14} color={tokens.text.tertiary} />
                      <Text style={[styles.liqMetaBigValue, { color: tokens.text.tertiary }]}>
                        {formatMoney(liq.frozen, { currency: cur, kopecks: 'hide' })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.liqSep} />
                  {liq.frozenItems.map((it, i) => (
                    <View key={it.assetId}>
                      {i > 0 ? <View style={styles.liqItemSep} /> : null}
                      <Pressable
                        style={({ pressed }) => [styles.liqRow, pressed && styles.liqRowPressed]}
                        onPress={() => router.push(`/asset/${it.assetId}`)}
                      >
                        <View style={styles.liqRing}>
                          <View style={[styles.liqLockCircle, { backgroundColor: hexToRgba(tokens.category[it.typeId] ?? tokens.accent.base, 0.16) }]}>
                            <MaterialIcons name="lock" size={15} color={tokens.category[it.typeId] ?? tokens.accent.base} />
                          </View>
                          <Donut
                            segments={[
                              { value: it.termProgress, color: tokens.category[it.typeId] ?? tokens.accent.base },
                              { value: 1 - it.termProgress, color: tokens.surface.neutral },
                            ]}
                            size={38}
                            strokeWidth={4.5}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.liqRowName} numberOfLines={1}>
                            {it.title ? `${it.instrumentName} · ${it.title}` : it.instrumentName}
                          </Text>
                          <Text style={styles.liqRowSub} numberOfLines={1}>
                            через {it.daysRemaining} {pluralDays(it.daysRemaining)} · до {formatDateShort(it.unlockDate)}
                          </Text>
                        </View>
                        <Text style={styles.liqRowValue}>{formatMoney(it.amountBase, { currency: cur, kopecks: 'hide' })}</Text>
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Капитал по инструментам</Text>
            <TypeCardsRow groups={grouped.groups} currency={cur} />

            <Text style={styles.sectionTitle}>Налог</Text>
            <Card>
              <Text style={styles.taxLabel}>Доплатить самому — на сегодня</Text>
              <Text style={styles.taxBig} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(taxSummary.taxAccruedSelf, { currency: cur })}
              </Text>

              <View style={styles.taxDivider} />

              <View style={styles.taxFooterRow}>
                <Text style={styles.taxFooterLabel}>Свободный лимит использован</Text>
                <Text style={styles.taxFooterLabel}>{taxUsedPct}%</Text>
              </View>
              <View style={styles.taxBarWrap}>
                <View style={styles.taxTrack}>
                  <View style={[styles.taxFill, { width: `${taxUsedPct}%` }]} />
                </View>
              </View>
              <View style={styles.taxFooterRow}>
                <Text style={styles.taxFooterLabel}>Заработано {formatMoney(taxSummary.selfAccrued, { currency: cur })}</Text>
                <Text style={styles.taxFooterLabel}>Остаток {formatMoney(taxRemain, { currency: cur })}</Text>
              </View>

              {taxSummary.taxPaidTotal > 0.5 || taxSummary.taxAccruedWithheld > 0.5 ? (
                <>
                  <View style={styles.taxDivider} />
                  <View style={styles.taxSplitRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taxFooterLabel}>Уже заплатили</Text>
                      <Text style={styles.taxSplitValue}>
                        {formatMoney(taxSummary.taxPaidTotal, { currency: cur })}
                      </Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.taxFooterLabel}>Ещё удержит банк</Text>
                      <Text style={styles.taxSplitValue}>
                        {formatMoney(taxWithheldRemaining, { currency: cur })}
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}

              {taxRecommendedSetAside > 0.5 ? (
                <View style={styles.taxRecommendBox}>
                  <Text style={styles.taxRecommendLabel}>Рекомендуем отложить — оба способа вместе</Text>
                  <Text style={styles.taxRecommendValue}>
                    {formatMoney(taxRecommendedSetAside, { currency: cur, kopecks: 'hide' })}
                  </Text>
                </View>
              ) : null}
            </Card>

            {upcoming.length > 0 ? (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Ближайшие события</Text>
                  <Pressable onPress={() => router.push('/calendar')} hitSlop={8}>
                    <Text style={styles.link}>Календарь</Text>
                  </Pressable>
                </View>
                <Card padded={false}>
                  <View style={styles.listInner}>
                    {upcoming.map((v, i) => {
                      const progress = termProgress(v);
                      const daysRemaining = v.derived.daysRemaining ?? 0;
                      return (
                        <View key={v.asset.id}>
                          {i > 0 && <View style={styles.divider} />}
                          <Pressable style={styles.eventRow} onPress={() => router.push(`/asset/${v.asset.id}`)}>
                            <Donut
                              segments={[
                                { value: progress, color: tokens.accent.base },
                                { value: 1 - progress, color: tokens.surface.neutral },
                              ]}
                              size={38}
                              strokeWidth={4.5}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.eventName} numberOfLines={1}>{v.instrument.name}</Text>
                              <Text style={styles.eventSub}>
                                {formatDateShort(v.asset.endDate as string)} · {daysRemaining} {pluralDays(daysRemaining)}
                              </Text>
                            </View>
                            <Text style={styles.eventAmount}>
                              {formatMoney(v.derived.finalAmount ?? v.asset.amount, { currency: v.asset.currency })}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </>
            ) : null}

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{t.home.yourAssets}</Text>
              <Pressable
                style={styles.sortBtn}
                onPress={() => setSortIdx((i) => (i + 1) % SORTS.length)}
                hitSlop={8}
              >
                <MaterialIcons name="swap-vert" size={16} color={tokens.text.secondary} />
                <Text style={styles.sortText}>{sort.label}</Text>
              </Pressable>
            </View>
            <Card padded={false}>
              <View style={styles.listInner}>
                {sortedViews.map((v, i) => (
                  <View key={v.asset.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <AssetRow view={v} />
                  </View>
                ))}
                {hasArchived ? (
                  <>
                    <View style={styles.divider} />
                    <Pressable style={styles.archiveLink} onPress={() => router.push('/archive')} hitSlop={8}>
                      <MaterialCommunityIcons name="archive-outline" size={15} color={tokens.text.tertiary} />
                      <Text style={styles.archiveLinkText}>Архив</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </Card>
          </>
        ) : (
          <EmptyAssets />
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function EmptyAssets() {
  const router = useRouter();
  return (
    <Card style={styles.empty}>
      <MaterialCommunityIcons name="bank-plus" size={40} color={tokens.accent.base} />
      <Text style={styles.emptyTitle}>{t.home.emptyTitle}</Text>
      <Text style={styles.emptyHint}>{t.home.emptyHint}</Text>
      <Pressable style={styles.emptyBtn} onPress={() => router.push('/asset/form')}>
        <Text style={styles.emptyBtnText}>{t.home.addAsset}</Text>
      </Pressable>
    </Card>
  );
}

const SPARK_W = Dimensions.get('window').width - tokens.spacing.screenH * 2;
const SLIDE_W = Dimensions.get('window').width;
const DOT_W = 6;
const DOT_GAP = 6;
const DOT_ACTIVE_W = 16;
const GOAL_DOT_OFF = hexToRgba(tokens.text.tertiary, 0.3);
const GOAL_DOT_ON = hexToRgba(tokens.accent.base, 1);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.xl },
  wordmark: { fontSize: tokens.typography.display, fontWeight: '800', color: tokens.text.primary, letterSpacing: -0.5 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  iconBtn: {
    width: 44, height: 44, borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(tokens.surface.white, 0.85), borderWidth: 1, borderColor: tokens.surface.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: { width: 44, height: 44, borderRadius: tokens.radius.pill, backgroundColor: tokens.accent.base, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
  link: { fontSize: tokens.typography.label, color: tokens.accent.base, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { fontSize: tokens.typography.caption, color: tokens.text.secondary, fontWeight: '500' },
  listInner: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.xs },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  archiveLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.chip, paddingVertical: tokens.spacing.md },
  archiveLinkText: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, fontWeight: '500' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  eventName: { fontSize: tokens.typography.label, fontWeight: '500', color: tokens.text.primary },
  eventSub: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },
  eventAmount: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  taxLabel: { fontSize: tokens.typography.caption, color: tokens.text.secondary },
  taxBig: { fontSize: tokens.typography.metric, fontWeight: '800', color: tokens.text.primary, marginTop: 2 },
  taxBarWrap: { marginTop: tokens.spacing.md },
  taxTrack: { height: 8, borderRadius: 4, backgroundColor: tokens.surface.neutral, overflow: 'hidden' },
  taxFill: { height: 8, borderRadius: 4, backgroundColor: tokens.category.dfa },
  taxDivider: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.md },
  taxFooterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  taxFooterLabel: { fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  taxSplitRow: { flexDirection: 'row' },
  taxSplitValue: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary, marginTop: 2 },
  taxRecommendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.md,
    backgroundColor: hexToRgba(tokens.category.dfa, 0.1),
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  taxRecommendLabel: { flex: 1, fontSize: tokens.typography.caption, color: tokens.text.secondary },
  taxRecommendValue: { fontSize: tokens.typography.label, fontWeight: '800', color: tokens.category.dfa },
  liqLabel: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.medium, color: tokens.text.tertiary },
  liqValue: { fontSize: tokens.typography.header, lineHeight: 26, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.24, marginTop: 10 },
  liqBarWrap: { marginTop: tokens.spacing.lg },
  liqTrack: { height: 10, borderRadius: tokens.radius.pill, overflow: 'hidden', backgroundColor: hexToRgba('#909497', 0.18) },
  liqFill: { height: '100%', borderRadius: tokens.radius.pill },
  liqMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  liqMetaInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liqMetaBigValue: { fontSize: 18, lineHeight: 20, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.18 },
  liqSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.sheet },
  liqItemSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: 10 },
  liqRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  liqRowPressed: { opacity: 0.6 },
  liqRing: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  liqLockCircle: { position: 'absolute', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  liqRowName: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.regular, color: tokens.text.secondary, letterSpacing: -0.14 },
  liqRowSub: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.12, marginTop: 2 },
  liqRowValue: { fontSize: tokens.typography.body, lineHeight: 18, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.16 },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: tokens.text.inverse, fontWeight: '600', fontSize: tokens.typography.label },
  heroLabel: { fontSize: tokens.typography.label, fontFamily: font.medium, color: tokens.text.tertiary },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  heroValue: { fontSize: tokens.typography.metricLg, fontFamily: font.extrabold, color: tokens.semantic.positive, marginTop: 4, letterSpacing: -0.6 },
  heroMonthPill: {
    minWidth: 112,
    backgroundColor: hexToRgba(tokens.surface.white, 0.7),
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  heroMonthIconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMonthLabel: { fontSize: tokens.typography.micro, fontFamily: font.medium, color: tokens.text.tertiary },
  heroMonthValue: { fontSize: tokens.typography.body, fontFamily: font.bold, color: tokens.text.primary, marginTop: 2 },
  heroSparkWrap: { marginTop: tokens.spacing.md },
  heroStatsRow: { flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.lg },
  heroStatTile: { flex: 1, minWidth: 0, backgroundColor: tokens.surface.neutral, borderRadius: tokens.radius.md, padding: 12 },
  heroStatLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatLabel: { fontSize: tokens.typography.micro, fontFamily: font.medium, color: tokens.text.tertiary, flexShrink: 1 },
  heroStatValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  heroStatValue: { fontSize: tokens.typography.body, fontFamily: font.bold, color: tokens.text.primary },
  heroStatDelta: { fontSize: tokens.typography.micro, fontFamily: font.semibold, marginTop: 2 },
  heroLeaderPill: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm,
    backgroundColor: hexToRgba(tokens.semantic.positive, 0.08),
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    marginTop: tokens.spacing.sm,
  },
  heroLeaderIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: hexToRgba(tokens.semantic.positive, 0.16), alignItems: 'center', justifyContent: 'center' },
  heroLeaderLabel: { fontSize: tokens.typography.micro, fontFamily: font.regular, color: tokens.text.tertiary },
  heroLeaderName: { fontSize: tokens.typography.caption, fontFamily: font.semibold, color: tokens.text.primary, marginTop: 1 },
  heroLeaderValue: { fontSize: tokens.typography.caption, fontFamily: font.bold, color: tokens.semantic.positive },
  goalSliderClip: { marginHorizontal: -tokens.spacing.screenH },
  goalSlidePage: { width: SLIDE_W, paddingHorizontal: tokens.spacing.screenH, paddingVertical: 14 },
  goalDotsWrap: { alignItems: 'center', marginTop: tokens.spacing.sm },
  goalDots: { flexDirection: 'row', alignItems: 'center', gap: DOT_GAP },
  goalDot: { height: DOT_W, borderRadius: DOT_W / 2 },
  goalEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  goalEmptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: hexToRgba(tokens.accent.base, 0.12), alignItems: 'center', justifyContent: 'center' },
  goalEmptyTitle: { fontSize: tokens.typography.label, fontFamily: font.semibold, color: tokens.text.primary },
  goalEmptyHint: { fontSize: tokens.typography.hint, fontFamily: font.regular, color: tokens.text.tertiary, marginTop: 2 },
});
