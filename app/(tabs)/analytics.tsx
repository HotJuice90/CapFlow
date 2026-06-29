import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { Sparkline } from '@/components/Sparkline';
import { Donut } from '@/components/Donut';
import { useData } from '@/state/DataContext';
import {
  analyticsSummary,
  insights,
  distributionByType,
  distributionByOrg,
  capitalSeries,
} from '@/state/selectors';
import { tokens } from '@/theme';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import { t } from '@/i18n';

export default function AnalyticsScreen() {
  const { data } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const summary = useMemo(() => analyticsSummary(data), [data]);
  const ins = useMemo(() => insights(data), [data]);
  const byType = useMemo(() => distributionByType(data), [data]);
  const byOrg = useMemo(() => distributionByOrg(data), [data]);
  const capSeries = useMemo(() => capitalSeries(data, 30), [data]);

  const cur = data.settings.defaultCurrency;
  const hasAssets = byType.total > 0;

  const first = capSeries[0] ?? 0;
  const lastCap = capSeries[capSeries.length - 1] ?? 0;
  const deltaAbs = lastCap - first;
  const deltaPct = first > 0 ? (deltaAbs / first) * 100 : 0;

  // НДФЛ
  const limit = data.params.taxFreeLimit;
  const usedLimit = Math.min(summary.incomePerYear, limit);
  const remainLimit = Math.max(0, limit - summary.incomePerYear);
  const usedPct = limit > 0 ? Math.round((usedLimit / limit) * 100) : 0;

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
        <Text style={styles.screenTitle}>{t.tabs.analytics}</Text>
        <Text style={styles.screenSub}>Как работает ваш капитал</Text>

        {!hasAssets ? (
          <Card style={styles.empty}>
            <MaterialIcons name="insights" size={40} color={tokens.accent.base} />
            <Text style={styles.emptyTitle}>Недостаточно данных</Text>
            <Text style={styles.emptyHint}>Добавьте активы — и аналитика объяснит, как работает капитал.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/asset/form')}>
              <Text style={styles.emptyBtnText}>Добавить актив</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            {/* Якорь — общий капитал */}
            <Card style={styles.anchor}>
              <View style={styles.anchorTop}>
                <Text style={styles.anchorLabel}>Общий капитал</Text>
                <View style={styles.keyChip}>
                  <MaterialIcons name="trending-up" size={13} color={tokens.text.secondary} />
                  <Text style={styles.keyChipText}>Ставка ЦБ {formatPercent(summary.keyRate)}</Text>
                </View>
              </View>
              <View style={styles.anchorMain}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.anchorValue}>{formatMoney(summary.totalCapital, { currency: cur })}</Text>
                  <Text style={styles.anchorDelta}>
                    +{formatMoney(deltaAbs, { currency: cur, kopecks: 'hide' })} ({formatPercentSigned(deltaPct)}) за месяц
                  </Text>
                </View>
                <Sparkline data={capSeries} width={120} height={56} color={tokens.semantic.positive} />
              </View>
              <View style={styles.metricsRow}>
                <Metric label="за сегодня" value={`+${formatMoney(summary.incomePerDay, { currency: cur, kopecks: 'hide' })}`} />
                <Metric label="за месяц" value={`+${formatMoney(summary.incomePerMonth, { currency: cur, kopecks: 'hide' })}`} />
                <Metric label="за год" value={`+${formatMoney(summary.incomePerYear, { currency: cur, abbreviateMillions: true })}`} />
              </View>
            </Card>

            {/* Инсайт */}
            {ins[0] ? (
              <View style={styles.insight}>
                <View style={styles.insightIcon}>
                  <MaterialIcons name={ins[0].icon as keyof typeof MaterialIcons.glyphMap} size={22} color="#7C4DD6" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.insightTag}><Text style={styles.insightTagText}>Инсайт</Text></View>
                  <Text style={styles.insightTitle}>{ins[0].title}</Text>
                  <Text style={styles.insightText}>{ins[0].text}</Text>
                </View>
              </View>
            ) : null}

            {/* По инструментам — донат */}
            <Text style={styles.section}>По инструментам</Text>
            <Card>
              <View style={styles.donutRow}>
                <Donut
                  segments={byType.groups.map((g) => ({ value: g.capital, color: g.color }))}
                  centerLabel={formatMoney(byType.total, { currency: cur, abbreviateMillions: true })}
                  centerSub="всего"
                />
                <View style={styles.legend}>
                  {byType.groups.map((g) => (
                    <View key={g.key} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: g.color }]} />
                      <Text style={styles.legendLabel} numberOfLines={1}>{g.label}</Text>
                      <Text style={styles.legendPct}>{Math.round(g.share * 100)}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            {/* По организациям — бары */}
            <Text style={styles.section}>По организациям</Text>
            <Card>
              {byOrg.groups.map((g, i) => (
                <View key={g.key} style={i > 0 ? styles.orgGap : undefined}>
                  <View style={styles.orgLine}>
                    <View style={[styles.legendDot, { backgroundColor: g.color }]} />
                    <Text style={styles.orgName} numberOfLines={1}>{g.label}</Text>
                    <Text style={styles.orgAmount}>{formatMoney(g.capital, { currency: cur, abbreviateMillions: true })}</Text>
                    <Text style={styles.orgPct}>{Math.round(g.share * 100)}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.max(3, Math.round(g.share * 100))}%`, backgroundColor: g.color }]} />
                  </View>
                </View>
              ))}
            </Card>

            {/* Налоги (НДФЛ) */}
            <Text style={styles.section}>Налоги (НДФЛ)</Text>
            <Card>
              <View style={styles.taxTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taxLabel}>Ожидаемый налог за год</Text>
                  <Text style={styles.taxValue}>{formatMoney(summary.taxYear, { currency: cur })}</Text>
                  <Text style={styles.taxHint}>{formatPercent(data.params.taxRate)} сверх лимита</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taxLabel}>Необлагаемый лимит</Text>
                  <Text style={styles.taxValue}>{formatMoney(limit, { currency: cur })}</Text>
                  <Text style={styles.taxHint}>1 млн × ключевая</Text>
                </View>
              </View>
              <View style={styles.taxBarWrap}>
                <View style={styles.taxTrack}>
                  <View style={[styles.taxFill, { width: `${usedPct}%` }]} />
                </View>
                <View style={styles.taxMeta}>
                  <Text style={styles.taxMetaLeft}>Использовано {formatMoney(usedLimit, { currency: cur, kopecks: 'hide' })} · {usedPct}%</Text>
                  <Text style={styles.taxMetaRight}>Остаток {formatMoney(remainLimit, { currency: cur, kopecks: 'hide' })}</Text>
                </View>
              </View>
            </Card>

            {/* Эффективность */}
            <Text style={styles.section}>Эффективность</Text>
            <Card>
              <Row label="Средняя ставка портфеля" value={formatPercent(summary.avgRate)} />
              <Sep />
              <Row label="Премия к ключевой" value={formatPercentSigned(summary.premium)} accent={summary.premium >= 0} />
              <Sep />
              <Row label="Доход на 1 млн (год)" value={formatMoney(summary.incomePerMillionYear, { currency: cur, kopecks: 'hide' })} />
              {summary.topInstrument ? (
                <>
                  <Sep />
                  <Row
                    label="Самый доходный"
                    sub={summary.topInstrument.name}
                    value={`+${formatMoney(summary.topInstrument.incomePerDay, { currency: cur, kopecks: 'hide' })}/д`}
                  />
                </>
              ) : null}
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Row({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Text style={[styles.rowValue, accent && styles.rowAccent]}>{value}</Text>
    </View>
  );
}

function Sep() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: tokens.typography.display, fontWeight: '600', color: tokens.text.primary },
  screenSub: { fontSize: tokens.typography.label, color: tokens.text.secondary, marginTop: 2, marginBottom: tokens.spacing.lg },
  anchor: { marginBottom: tokens.spacing.lg },
  anchorTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  anchorLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary, fontWeight: '500' },
  keyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tokens.surface.neutral, borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  keyChipText: { fontSize: tokens.typography.micro, color: tokens.text.secondary, fontWeight: '600' },
  anchorMain: { flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.sm },
  anchorValue: { fontSize: tokens.typography.metricLg, fontWeight: '800', color: tokens.text.primary },
  anchorDelta: { fontSize: tokens.typography.caption, color: tokens.semantic.positive, fontWeight: '600', marginTop: 2 },
  metricsRow: { flexDirection: 'row', marginTop: tokens.spacing.lg, paddingTop: tokens.spacing.md, borderTopWidth: 1, borderTopColor: tokens.surface.hairline, gap: tokens.spacing.sm },
  metric: { flex: 1 },
  metricLabel: { fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  metricValue: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.semantic.positive, marginTop: 2 },
  insight: { flexDirection: 'row', gap: tokens.spacing.md, alignItems: 'flex-start', backgroundColor: '#F1ECFB', borderRadius: tokens.radius.lg, padding: tokens.spacing.lg, marginBottom: tokens.spacing.lg },
  insightIcon: { width: 40, height: 40, borderRadius: tokens.radius.sm, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' },
  insightTag: { alignSelf: 'flex-start', backgroundColor: '#7C4DD6', borderRadius: tokens.radius.xs, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  insightTagText: { fontSize: tokens.typography.micro, color: '#FFFFFF', fontWeight: '700' },
  insightTitle: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  insightText: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 3, lineHeight: 18 },
  section: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.lg },
  legend: { flex: 1, gap: tokens.spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: tokens.typography.caption, color: tokens.text.primary, fontWeight: '500' },
  legendPct: { fontSize: tokens.typography.caption, fontWeight: '700', color: tokens.text.primary },
  orgGap: { marginTop: tokens.spacing.lg },
  orgLine: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  orgName: { flex: 1, fontSize: tokens.typography.label, fontWeight: '500', color: tokens.text.primary },
  orgAmount: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  orgPct: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, width: 36, textAlign: 'right' },
  track: { height: 7, borderRadius: 4, backgroundColor: tokens.surface.neutral, overflow: 'hidden', marginTop: tokens.spacing.sm },
  fill: { height: 7, borderRadius: 4 },
  taxTop: { flexDirection: 'row', gap: tokens.spacing.lg },
  taxLabel: { fontSize: tokens.typography.caption, color: tokens.text.secondary },
  taxValue: { fontSize: tokens.typography.title, fontWeight: '700', color: tokens.text.primary, marginTop: 2 },
  taxHint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },
  taxBarWrap: { marginTop: tokens.spacing.lg },
  taxTrack: { height: 8, borderRadius: 4, backgroundColor: tokens.surface.neutral, overflow: 'hidden' },
  taxFill: { height: 8, borderRadius: 4, backgroundColor: '#9A6DD7' },
  taxMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  taxMetaLeft: { fontSize: tokens.typography.caption, color: tokens.text.secondary },
  taxMetaRight: { fontSize: tokens.typography.caption, color: tokens.text.secondary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.sm },
  rowLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  rowSub: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  rowValue: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  rowAccent: { color: tokens.accent.base, fontWeight: '700' },
  sep: { height: 1, backgroundColor: tokens.surface.hairline },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: tokens.typography.label },
});
