import React, { useMemo } from 'react';
import { Dimensions, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Card } from '@/components/Card';
import { boxShadow } from '@/theme/shadow';
import { CapitalRingHero } from '@/components/CapitalRingHero';
import { OrgLogo } from '@/components/BankLogo';
import { Donut } from '@/components/Donut';
import { CompareDonut } from '@/components/CompareDonut';
import { BarTrend, type BarPoint } from '@/components/BarTrend';
import { useData } from '@/state/DataContext';
import {
  analyticsSummary,
  insights,
  distributionByType,
  distributionByOrg,
  capitalSeries,
  incomePaceWindows,
} from '@/state/selectors';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercent, formatPercentSigned, CURRENCY_SYMBOL } from '@/format';
import { formatDateShort } from '@/format/date';
import { t } from '@/i18n';

const CHART_W = Dimensions.get('window').width - tokens.spacing.screenH * 2 - tokens.spacing.lg * 2;

const SHORT_TYPE_LABEL: Record<string, string> = {
  deposit: 'Вклады',
  savings: 'Счета',
  dfa: 'ЦФА',
};

/** Дневной ряд → N корзин (последний день корзины — значение бара). */
function bucketSeries(series: number[], buckets: number): BarPoint[] {
  const n = series.length;
  if (n === 0) return [];
  const bucketSize = Math.ceil(n / buckets);
  const today = new Date();
  const out: BarPoint[] = [];
  for (let b = 0; b < buckets; b++) {
    const endIdx = Math.min(n - 1, (b + 1) * bucketSize - 1);
    const daysAgo = n - 1 - endIdx;
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    out.push({ label: daysAgo === 0 ? 'Сейчас' : formatDateShort(d), value: series[endIdx] });
  }
  return out;
}

export default function AnalyticsScreen() {
  const { data } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const summary = useMemo(() => analyticsSummary(data), [data]);
  const ins = useMemo(() => insights(data), [data]);
  const byType = useMemo(() => distributionByType(data), [data]);
  const byOrg = useMemo(() => distributionByOrg(data), [data]);
  const capSeries = useMemo(() => capitalSeries(data, 30), [data]);
  const incomePace = useMemo(() => incomePaceWindows(data, 30), [data]);
  const trendBars = useMemo(() => bucketSeries(capSeries, 5), [capSeries]);

  const cur = data.settings.defaultCurrency;
  const hasAssets = byType.total > 0;

  // «Можно разместить» — временно ручной ввод (настройки → «Капитал вне
  // активов»), пока не решено, как именно заводить свободный капитал как
  // сущность. Не задано — карточку не показываем вообще.
  const manualTotalCapital = data.settings.manualTotalCapital;
  const freeCapital = manualTotalCapital ? Math.max(0, manualTotalCapital - byOrg.total) : 0;
  const freeCapitalShare = manualTotalCapital ? freeCapital / manualTotalCapital : 0;

  const first = capSeries[0] ?? 0;
  const lastCap = capSeries[capSeries.length - 1] ?? 0;
  const deltaAbs = lastCap - first;
  const deltaPct = first > 0 ? (deltaAbs / first) * 100 : 0;
  const incomeStart = incomePace.prev;
  const incomeNow = incomePace.now;
  const incomeDeltaAbs = incomeNow - incomeStart;
  const incomeDeltaPct = incomeStart > 0 ? (incomeDeltaAbs / incomeStart) * 100 : 0;
  const nowWinsPace = incomeNow >= incomeStart;
  const topType = byType.groups[0];

  // НДФЛ
  const limit = data.params.taxFreeLimit;
  const usedLimit = Math.min(summary.incomePerYear, limit);
  const remainLimit = Math.max(0, limit - summary.incomePerYear);
  const usedPct = limit > 0 ? Math.round((usedLimit / limit) * 100) : 0;

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
        <ScreenTitle>{t.tabs.analytics}</ScreenTitle>
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
            <CapitalRingHero
              label="Общий капитал"
              bigValue={formatMoney(summary.totalCapital, { currency: cur })}
              deltaPct={deltaPct}
              ringGroups={byType.groups.map((g) => ({ value: g.capital, color: g.color }))}
              ringCenterLabel={topType ? `${Math.round(topType.share * 100)}%` : undefined}
              ringCenterSub={topType ? SHORT_TYPE_LABEL[topType.key] ?? topType.label : undefined}
              chips={[
                { icon: 'calendar-today', label: 'За сегодня', value: `+${formatMoney(summary.incomePerDay, { currency: cur, kopecks: 'hide' })}` },
                { icon: 'calendar-month', label: 'За месяц', value: `+${formatMoney(summary.incomePerMonth, { currency: cur, kopecks: 'hide' })}` },
                { icon: 'chart-timeline-variant', label: 'За год', value: `+${formatMoney(summary.incomePerYear, { currency: cur })}` },
              ]}
              spark={capSeries}
            />

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

            {/* Темп дохода — «перетягивание каната»: пончик из двух сегментов
                (было/стало) сам показывает пропорцию роста/просадки, темп —
                числом в центре. Слева/справа — абсолютные цифры периодов.
                Никакого графика-тренда — он уже есть в хиро выше. */}
            <Text style={styles.section}>Темп дохода</Text>
            <View style={styles.paceCard}>
              <View style={styles.paceRow}>
                <View style={styles.paceSide}>
                  <View style={styles.paceChip}>
                    <Text style={styles.paceChipText}>Месяц назад</Text>
                  </View>
                  <View style={styles.paceValueBlock}>
                    <Text style={styles.paceUnit}>{CURRENCY_SYMBOL[cur]} / день</Text>
                    <Text style={[styles.paceValue, { color: tokens.text.tertiary }]} numberOfLines={1}>
                      +{formatMoney(incomeStart, { currency: cur, kopecks: 'hide', withSymbol: false })}
                    </Text>
                  </View>
                </View>

                <View style={styles.paceDonutSpacer} />

                <View style={[styles.paceSide, styles.paceSideRight]}>
                  <View style={styles.paceChip}>
                    <Text style={styles.paceChipText}>Сегодня</Text>
                  </View>
                  <View style={[styles.paceValueBlock, styles.paceValueBlockRight]}>
                    <Text style={styles.paceUnit}>{CURRENCY_SYMBOL[cur]} / день</Text>
                    <Text
                      style={[styles.paceValue, { color: nowWinsPace ? tokens.semantic.positive : tokens.accent.base }]}
                      numberOfLines={1}
                    >
                      +{formatMoney(incomeNow, { currency: cur, kopecks: 'hide', withSymbol: false })}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.paceDonutOverlay} pointerEvents="none">
                <CompareDonut
                  prev={incomeStart}
                  now={incomeNow}
                  size={140}
                  strokeWidth={21}
                  gapPx={2}
                  centerLabel={`${incomeDeltaAbs >= 0 ? '+' : '−'}${Math.round(Math.abs(incomeDeltaPct))}%`}
                  centerSub={`${incomeDeltaAbs >= 0 ? '+' : '−'}${formatMoney(Math.abs(incomeDeltaAbs), { currency: cur, kopecks: 'hide' })}/д`}
                />
              </View>
            </View>

            {/* Тренд капитала */}
            <Text style={styles.section}>Тренд капитала</Text>
            <Card>
              <View style={styles.trendTop}>
                <Text style={styles.trendDelta}>
                  {deltaAbs >= 0 ? '+' : '−'}{formatMoney(Math.abs(deltaAbs), { currency: cur, kopecks: 'hide' })}
                </Text>
                <View style={[styles.trendPill, { backgroundColor: deltaPct >= 0 ? 'rgba(31,169,113,0.12)' : 'rgba(229,72,77,0.12)' }]}>
                  <Text style={[styles.trendPillText, { color: deltaPct >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}>
                    {formatPercentSigned(deltaPct)} за 30 дней
                  </Text>
                </View>
              </View>
              <BarTrend points={trendBars} height={110} />
            </Card>

            {/* По инструментам — донат */}
            <Text style={styles.section}>По инструментам</Text>
            <Card>
              <View style={styles.donutRow}>
                <Donut
                  segments={byType.groups.map((g) => ({ value: g.capital, color: g.color }))}
                  centerLabel={formatMoney(byType.total, { currency: cur })}
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

            {/* Размещение капитала — строки по площадкам + единая пропорциональная полоса */}
            <Text style={styles.section}>Размещение капитала</Text>
            <View style={styles.orgCard}>
              {byOrg.groups.map((g, i) => {
                const org = data.organizations.find((o) => o.id === g.key);
                return (
                  <View key={g.key}>
                    {i > 0 ? <View style={styles.orgSep} /> : null}
                    <View style={styles.orgRow}>
                      <OrgLogo color={g.color} logo={org?.logo} imageUri={org?.customImageUri} size={44} radius={16} variant="solid" />
                      <View style={styles.orgInfo}>
                        <Text style={styles.orgAmount} numberOfLines={1}>
                          {formatMoney(g.capital, { currency: cur })}
                        </Text>
                        <Text style={styles.orgName} numberOfLines={1}>{g.label}</Text>
                      </View>
                      <View style={styles.orgPctChip}>
                        <Text style={styles.orgPctText}>{Math.round(g.share * 100)}%</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              <View style={styles.allocationBar}>
                {byOrg.groups.map((g) => (
                  <View
                    key={g.key}
                    style={[styles.allocationSegment, { flex: Math.max(g.share, 0.01), backgroundColor: g.color }]}
                  />
                ))}
              </View>

              {manualTotalCapital ? (
                <ImageBackground
                  source={require('../../assets/decor/free-capital-jar.png')}
                  style={styles.freeCapCard}
                  imageStyle={styles.freeCapBg}
                  resizeMode="cover"
                >
                  <View style={styles.freeCapInfo}>
                    <Text style={styles.freeCapValue}>
                      {formatMoney(freeCapital, { currency: cur, kopecks: 'hide' })}
                    </Text>
                    <Text style={styles.freeCapLabel}>Можно разместить</Text>
                  </View>
                  <View style={styles.freeCapPctChip}>
                    <Text style={styles.freeCapPctText}>{Math.round(freeCapitalShare * 100)}%</Text>
                  </View>
                </ImageBackground>
              ) : null}
            </View>

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
              <Row label="Премия к ключевой" value={formatPercentSigned(summary.premiumToKeyRate)} accent={summary.premiumToKeyRate >= 0} />
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
  screenSub: { fontSize: tokens.typography.label, color: tokens.text.secondary, marginTop: -8, marginBottom: tokens.spacing.lg },
  insight: { flexDirection: 'row', gap: tokens.spacing.md, alignItems: 'flex-start', backgroundColor: '#F1ECFB', borderRadius: tokens.radius.lg, padding: tokens.spacing.lg, marginBottom: tokens.spacing.lg },
  insightIcon: { width: 40, height: 40, borderRadius: tokens.radius.sm, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' },
  insightTag: { alignSelf: 'flex-start', backgroundColor: '#7C4DD6', borderRadius: tokens.radius.xs, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  insightTagText: { fontSize: tokens.typography.micro, color: '#FFFFFF', fontWeight: '700' },
  insightTitle: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  insightText: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 3, lineHeight: 18 },
  section: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
  paceCard: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
    position: 'relative',
    // Высота — не фиксируем: плашка обнимает только текст (паддинг 16 сверху/
    // снизу + контент), а кольцо (выносной абсолютный слой) центрируется по
    // фактической высоте плашки и торчит настолько, насколько выйдет само.
    ...boxShadow(tokens.shadow.card),
  },
  paceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  paceSide: { gap: 13, alignItems: 'flex-start' },
  paceSideRight: { alignItems: 'flex-end' },
  paceChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  paceChipText: { fontSize: 11, lineHeight: 13, fontFamily: font.medium, color: hexToRgba('#212121', 0.8) },
  paceValueBlock: { alignItems: 'flex-start' },
  paceValueBlockRight: { alignItems: 'flex-end' },
  paceUnit: { fontSize: 12, lineHeight: 14, fontFamily: font.medium, color: hexToRgba('#212121', 0.3), letterSpacing: -0.24 },
  paceValue: { fontSize: 22, lineHeight: 24, fontFamily: font.semibold, marginTop: 0 },
  paceDonutSpacer: { width: 140 },
  paceDonutOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  trendTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.lg },
  trendDelta: { fontSize: tokens.typography.title, fontWeight: '800', color: tokens.text.primary },
  trendPill: { borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  trendPillText: { fontSize: tokens.typography.caption, fontWeight: '700' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.lg },
  legend: { flex: 1, gap: tokens.spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: tokens.typography.caption, color: tokens.text.primary, fontWeight: '500' },
  legendPct: { fontSize: tokens.typography.caption, fontWeight: '700', color: tokens.text.primary },
  orgCard: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 24,
    ...boxShadow(tokens.shadow.card),
  },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  orgSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: 16 },
  orgInfo: { flex: 1, minWidth: 0, gap: 6 },
  orgAmount: { fontSize: 20, lineHeight: 22, fontFamily: font.semibold, color: '#212121', letterSpacing: -0.4 },
  orgName: { fontSize: 14, lineHeight: 16, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.28 },
  orgPctChip: { width: 50, height: 50, borderRadius: 12, backgroundColor: tokens.surface.white, alignItems: 'center', justifyContent: 'center' },
  orgPctText: { fontSize: 14, lineHeight: 16, fontFamily: font.semibold, color: '#586692' },
  allocationBar: { flexDirection: 'row', gap: 2, height: 20, marginTop: tokens.spacing.md },
  allocationSegment: { borderRadius: 4 },
  freeCapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    backgroundColor: hexToRgba('#7143AE', 0.08),
    overflow: 'hidden',
  },
  freeCapBg: { borderRadius: 16 },
  freeCapInfo: { gap: 6 },
  freeCapValue: { fontSize: 18, lineHeight: 20, fontFamily: font.semibold, color: '#7143AE', letterSpacing: -0.36 },
  freeCapLabel: { fontSize: 14, lineHeight: 16, fontFamily: font.regular, color: hexToRgba('#212121', 0.5), letterSpacing: -0.28 },
  freeCapPctChip: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  freeCapPctText: { fontSize: 16, lineHeight: 18, fontFamily: font.semibold, color: '#586692' },
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
