import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { HomeIncomeHero } from '@/components/HomeIncomeHero';
import { TypeCardsRow } from '@/components/TypeCardsRow';
import { Donut } from '@/components/Donut';
import { AssetRow } from '@/components/AssetRow';
import { useData } from '@/state/DataContext';
import {
  buildAssetViews,
  portfolioSummary,
  groupByInstrumentType,
  incomeSparkline,
  monthComparison,
  analyticsSummary,
} from '@/state/selectors';
import type { AssetView } from '@/domain/types';
import { tokens, hexToRgba } from '@/theme';
import { formatMoney, formatPercent } from '@/format';
import { formatDateShort, pluralDays } from '@/format/date';
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

export default function HomeScreen() {
  const { data, loading } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sortIdx, setSortIdx] = useState(0);

  const views = useMemo(() => buildAssetViews(data), [data]);
  const summary = useMemo(() => portfolioSummary(data), [data]);
  const grouped = useMemo(() => groupByInstrumentType(data), [data]);
  const spark = useMemo(() => incomeSparkline(data, 30), [data]);
  const comp = useMemo(() => monthComparison(data), [data]);
  const taxSummary = useMemo(() => analyticsSummary(data), [data]);

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
          paddingTop: 80,
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
              <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {hasAssets ? (
          <>
            <HomeIncomeHero
              dayValue={formatMoney(summary.incomePerDay, { currency: cur, kopecks: 'hide' })}
              monthValue={formatMoney(summary.incomePerMonth, { currency: cur, kopecks: 'hide' })}
              capitalValue={formatMoney(summary.workingCapital, { currency: cur })}
              capitalDeltaPct={capitalDeltaPct}
              avgRate={formatPercent(summary.avgRate)}
              topInstrument={taxSummary.topInstrument ? {
                name: taxSummary.topInstrument.name,
                org: taxSummary.topInstrument.org,
                value: formatMoney(taxSummary.topInstrument.incomePerDay, { currency: cur, kopecks: 'hide' }),
              } : undefined}
              spark={spark}
            />

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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.xl },
  wordmark: { fontSize: tokens.typography.display, fontWeight: '800', color: tokens.text.primary, letterSpacing: -0.5 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  iconBtn: {
    width: 44, height: 44, borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: tokens.surface.glassBorder,
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
  archiveLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: tokens.spacing.md },
  archiveLinkText: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, fontWeight: '500' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  eventName: { fontSize: tokens.typography.label, fontWeight: '500', color: tokens.text.primary },
  eventSub: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },
  eventAmount: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  taxLabel: { fontSize: tokens.typography.caption, color: tokens.text.secondary },
  taxBig: { fontSize: tokens.typography.metric, fontWeight: '800', color: tokens.text.primary, marginTop: 2 },
  taxBarWrap: { marginTop: tokens.spacing.md },
  taxTrack: { height: 8, borderRadius: 4, backgroundColor: tokens.surface.neutral, overflow: 'hidden' },
  taxFill: { height: 8, borderRadius: 4, backgroundColor: '#9A6DD7' },
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
    backgroundColor: hexToRgba('#9A6DD7', 0.1),
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  taxRecommendLabel: { flex: 1, fontSize: tokens.typography.caption, color: tokens.text.secondary },
  taxRecommendValue: { fontSize: tokens.typography.label, fontWeight: '800', color: '#9A6DD7' },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: tokens.typography.label },
});
