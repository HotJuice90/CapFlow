import React, { useMemo } from 'react';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
} from '@/state/selectors';
import { tokens } from '@/theme';
import { t } from '@/i18n';

export default function HomeScreen() {
  const { data, loading } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const views = useMemo(() => buildAssetViews(data), [data]);
  const summary = useMemo(
    () => portfolioSummary(views, data.params.keyRate),
    [views, data.params.keyRate],
  );
  const grouped = useMemo(() => groupByInstrumentType(data), [data]);
  const spark = useMemo(() => incomeSparkline(data, 30), [data]);

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.accent.base} />
        </View>
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

            <Text style={[styles.sectionTitle, { marginTop: tokens.spacing.xl }]}>
              {t.home.yourAssets}
            </Text>
            <Card padded={false}>
              <View style={styles.listInner}>
                {views.map((v, i) => (
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xl,
  },
  wordmark: {
    fontSize: tokens.typography.display,
    fontWeight: '800',
    color: tokens.text.primary,
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.accent.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginBottom: tokens.spacing.md,
  },
  listInner: { paddingHorizontal: tokens.spacing.lg },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginTop: tokens.spacing.md,
  },
  emptyHint: {
    fontSize: tokens.typography.label,
    color: tokens.text.secondary,
    textAlign: 'center',
    marginTop: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
  },
  emptyBtn: {
    marginTop: tokens.spacing.lg,
    backgroundColor: tokens.accent.base,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.pill,
  },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: tokens.typography.label },
});
