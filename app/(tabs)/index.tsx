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
import { HeroCard } from '@/components/HeroCard';
import { CapitalByType } from '@/components/CapitalByType';
import { AssetRow } from '@/components/AssetRow';
import { useData } from '@/state/DataContext';
import {
  buildAssetViews,
  portfolioSummary,
  groupByInstrumentType,
  incomeSparkline,
  calendarEvents,
} from '@/state/selectors';
import type { AssetView } from '@/domain/types';
import { tokens } from '@/theme';
import { formatMoney } from '@/format';
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

export default function HomeScreen() {
  const { data, loading } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sortIdx, setSortIdx] = useState(0);

  const views = useMemo(() => buildAssetViews(data), [data]);
  const summary = useMemo(() => portfolioSummary(views, data.params.keyRate), [views, data.params.keyRate]);
  const grouped = useMemo(() => groupByInstrumentType(data), [data]);
  const spark = useMemo(() => incomeSparkline(data, 30), [data]);
  const upcoming = useMemo(() => calendarEvents(data).slice(0, 3), [data]);

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

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.lg,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.wordmark}>CapFlow</Text>
          <Pressable style={styles.addBtn} onPress={() => router.push('/asset/form')} hitSlop={8}>
            <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <Pressable style={styles.searchBar} onPress={() => router.push('/search')}>
          <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
          <Text style={styles.searchPlaceholder}>Поиск активов, организаций…</Text>
        </Pressable>

        {hasAssets ? (
          <>
            <HeroCard
              incomePerDay={summary.incomePerDay}
              incomePerMonth={summary.incomePerMonth}
              workingCapital={summary.workingCapital}
              avgRate={summary.avgRate}
              premiumToKeyRate={summary.premiumToKeyRate}
              spark={spark}
              currency={cur}
            />

            <Text style={styles.sectionTitle}>Капитал по инструментам</Text>
            <CapitalByType groups={grouped.groups} total={grouped.total} currency={cur} />

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
                    {upcoming.map((e, i) => (
                      <View key={e.assetId}>
                        {i > 0 && <View style={styles.divider} />}
                        <Pressable style={styles.eventRow} onPress={() => router.push(`/asset/${e.assetId}`)}>
                          <View style={styles.dateChip}>
                            <Text style={styles.dateChipText}>{formatDateShort(e.date)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.eventName} numberOfLines={1}>{e.instrumentName}</Text>
                            <Text style={styles.eventSub}>{e.daysRemaining} {pluralDays(e.daysRemaining)}</Text>
                          </View>
                          <Text style={styles.eventAmount}>
                            {formatMoney(e.amount, { currency: e.currency, abbreviateMillions: true })}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
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
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.md },
  wordmark: { fontSize: tokens.typography.display, fontWeight: '800', color: tokens.text.primary, letterSpacing: -0.5 },
  addBtn: { width: 44, height: 44, borderRadius: tokens.radius.pill, backgroundColor: tokens.accent.base, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    marginBottom: tokens.spacing.xl,
    borderWidth: 1,
    borderColor: tokens.surface.glassBorder,
  },
  searchPlaceholder: { fontSize: tokens.typography.label, color: tokens.text.tertiary },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
  link: { fontSize: tokens.typography.label, color: tokens.accent.base, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { fontSize: tokens.typography.caption, color: tokens.text.secondary, fontWeight: '500' },
  listInner: { paddingHorizontal: tokens.spacing.lg },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  dateChip: { backgroundColor: tokens.accent.soft, borderRadius: tokens.radius.xs, paddingHorizontal: tokens.spacing.sm, paddingVertical: 4, minWidth: 64, alignItems: 'center' },
  dateChipText: { fontSize: tokens.typography.caption, color: tokens.accent.deep, fontWeight: '700' },
  eventName: { fontSize: tokens.typography.label, fontWeight: '500', color: tokens.text.primary },
  eventSub: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },
  eventAmount: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: tokens.typography.label },
});
