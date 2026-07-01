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
import { CapitalRingHero } from '@/components/CapitalRingHero';
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
} from '@/state/selectors';
import type { AssetView } from '@/domain/types';
import { tokens } from '@/theme';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
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

const SHORT_TYPE_LABEL: Record<string, string> = {
  deposit: 'Вклады',
  savings: 'Счета',
  dfa: 'ЦФА',
};

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
  const cur = data.settings.defaultCurrency;
  const topType = grouped.groups[0];
  const capitalDeltaPct = comp.capitalPrev > 0 ? ((comp.capitalNow - comp.capitalPrev) / comp.capitalPrev) * 100 : undefined;

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
            <CapitalRingHero
              label="Капитал сейчас"
              bigValue={formatMoney(summary.workingCapital, { currency: cur, abbreviateMillions: true })}
              deltaPct={capitalDeltaPct}
              ringGroups={grouped.groups.map((g) => ({ value: g.capital, color: g.color }))}
              ringCenterLabel={topType ? `${Math.round(topType.share * 100)}%` : undefined}
              ringCenterSub={topType ? SHORT_TYPE_LABEL[topType.typeId] ?? topType.label : undefined}
              chips={[
                { icon: 'trending-up', label: 'Доход в день', value: `+${formatMoney(summary.incomePerDay, { currency: cur, kopecks: 'hide' })}` },
                { icon: 'percent-outline', label: 'Средняя ставка', value: formatPercent(summary.avgRate), delta: formatPercentSigned(summary.premiumToKeyRate) },
              ]}
              spark={spark}
            />

            <Text style={styles.sectionTitle}>Капитал по инструментам</Text>
            <TypeCardsRow groups={grouped.groups} currency={cur} />

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
                              {formatMoney(v.derived.finalAmount ?? v.asset.amount, { currency: v.asset.currency, abbreviateMillions: true })}
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
  listInner: { paddingHorizontal: tokens.spacing.lg },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  eventName: { fontSize: tokens.typography.label, fontWeight: '500', color: tokens.text.primary },
  eventSub: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },
  eventAmount: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: tokens.typography.label },
});
