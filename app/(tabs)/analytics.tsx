import React, { useMemo, useState } from 'react';
import { Dimensions, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Pattern as SvgPattern, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Card } from '@/components/Card';
import { boxShadow } from '@/theme/shadow';
import { OrgLogo } from '@/components/BankLogo';
import { Donut } from '@/components/Donut';
import { CompareDonut } from '@/components/CompareDonut';
import { Sparkline } from '@/components/Sparkline';
import { useData } from '@/state/DataContext';
import {
  analyticsSummary,
  insights,
  distributionByType,
  distributionByOrg,
  capitalHistorySeries,
  incomePaceWindows,
  manualTotalCapitalConverted,
} from '@/state/selectors';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import { t } from '@/i18n';

const CHART_W = Dimensions.get('window').width - tokens.spacing.screenH * 2 - tokens.spacing.lg * 2;
// Доступная ширина под цифру «Темп дохода» слева/справа от бублика (140) — минус
// паддинг плашки (16*2) и небольшой запас (~пара мм), чтобы автоуменьшение
// шрифта срабатывало чуть раньше, не залезая в кольцо.
const PACE_VALUE_MAX_W = (Dimensions.get('window').width - tokens.spacing.screenH * 2 - 32 - 140) / 2 - 8;

type HeroPeriod = 'month' | 'year' | 'all';
const HERO_PERIODS: { key: HeroPeriod; label: string; days: number | 'all' | 'year' }[] = [
  { key: 'month', label: 'Месяц', days: 30 },
  { key: 'year', label: 'Год', days: 'year' },
  { key: 'all', label: 'Всё время', days: 'all' },
];
const HERO_PERIOD_TAIL: Record<HeroPeriod, string> = {
  month: 'за месяц',
  year: 'за год',
  all: 'за всё время',
};

export default function AnalyticsScreen() {
  const { data } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [heroPeriod, setHeroPeriod] = useState<HeroPeriod>('month');

  const summary = useMemo(() => analyticsSummary(data), [data]);
  const ins = useMemo(() => insights(data), [data]);
  const byType = useMemo(() => distributionByType(data), [data]);
  const byOrg = useMemo(() => distributionByOrg(data), [data]);
  const heroDays = HERO_PERIODS.find((p) => p.key === heroPeriod)!.days;
  const capSeries = useMemo(() => capitalHistorySeries(data, heroDays), [data, heroDays]);
  const incomePace = useMemo(() => incomePaceWindows(data, 30), [data]);

  const cur = data.settings.defaultCurrency;
  const hasAssets = byType.total > 0;

  // «Можно разместить» — временно ручной ввод (настройки → «Капитал вне
  // активов»), пока не решено, как именно заводить свободный капитал как
  // сущность. Не задано — карточку не показываем вообще.
  const manualTotalCapital = manualTotalCapitalConverted(data);
  const freeCapital = manualTotalCapital ? Math.max(0, manualTotalCapital - byOrg.total) : 0;
  // Раз свободный капитал теперь занимает свой сегмент в той же полосе, доли площадок
  // тоже считаем от общего капитала (а не только суммы площадок) — иначе сегменты
  // перестают складываться в 100% одной полосы.
  const grandTotal = manualTotalCapital || byOrg.total;
  const freeCapitalShare = manualTotalCapital ? freeCapital / grandTotal : 0;
  const orgShare = (capital: number) => (manualTotalCapital ? capital / grandTotal : capital / (byOrg.total || 1));

  const first = capSeries[0] ?? 0;
  const lastCap = capSeries[capSeries.length - 1] ?? 0;
  const deltaAbs = lastCap - first;
  // Если в начале периода капитала ещё не было (первый актив открыт позже) —
  // рост в % не определён математически, а «0%» тут откровенно врёт (капитал
  // ведь реально вырос с нуля). Показываем честный абсолют вместо процента.
  const hasDeltaPct = first > 0;
  const deltaPct = hasDeltaPct ? (deltaAbs / first) * 100 : 0;
  const incomeStart = incomePace.prev;
  const incomeNow = incomePace.now;
  const incomeDeltaAbs = incomeNow - incomeStart;
  const incomeDeltaPct = incomeStart > 0 ? (incomeDeltaAbs / incomeStart) * 100 : 0;
  const nowWinsPace = incomeNow >= incomeStart;

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
            {/* Хиро — светлый, в языке остальных виджетов экрана. Только то, чего
                нет в других блоках: якорное число, реальный график капитала (тело +
                проценты по дням, реконструкция из активов — не дублирует «за
                сегодня/месяц» на главной, там про темп, тут про факт) и
                аналитические метрики (ставка/премия/заработано). Состав по типам —
                ниже в «По инструментам». */}
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <Text style={styles.heroLabel}>Общий капитал</Text>
                <View style={[styles.heroDeltaPill, { backgroundColor: deltaAbs >= 0 ? 'rgba(31,169,113,0.12)' : 'rgba(229,72,77,0.12)' }]}>
                  <MaterialIcons
                    name={deltaAbs >= 0 ? 'trending-up' : 'trending-down'}
                    size={14}
                    color={deltaAbs >= 0 ? tokens.semantic.positive : tokens.semantic.negative}
                  />
                  <Text style={[styles.heroDeltaText, { color: deltaAbs >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}>
                    {hasDeltaPct
                      ? `${formatPercentSigned(deltaPct)} ${HERO_PERIOD_TAIL[heroPeriod]}`
                      : `${deltaAbs >= 0 ? '+' : '−'}${formatMoney(Math.abs(deltaAbs), { currency: cur, kopecks: 'hide' })} ${HERO_PERIOD_TAIL[heroPeriod]}`}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(summary.totalCapital, { currency: cur })}
              </Text>

              <View style={styles.heroSpark}>
                <Sparkline data={capSeries} width={CHART_W} height={110} color={tokens.semantic.positive} fromZero />
              </View>

              <View style={styles.heroPeriodRow}>
                {HERO_PERIODS.map((p) => (
                  <Pressable
                    key={p.key}
                    style={[styles.heroPeriodChip, heroPeriod === p.key && styles.heroPeriodChipActive]}
                    onPress={() => setHeroPeriod(p.key)}
                  >
                    <Text style={[styles.heroPeriodText, heroPeriod === p.key && styles.heroPeriodTextActive]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel} numberOfLines={1}>Ставка</Text>
                  <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPercent(summary.avgRate)}
                  </Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel} numberOfLines={1}>К ключевой</Text>
                  <Text
                    style={[styles.heroStatValue, { color: summary.premiumToKeyRate >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatPercentSigned(summary.premiumToKeyRate)}
                  </Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel} numberOfLines={1}>Заработано</Text>
                  <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                    +{formatMoney(summary.accrued, { currency: cur, kopecks: 'hide' })}
                  </Text>
                </View>
              </View>
            </View>

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
                    <Text style={styles.paceUnit}>день</Text>
                    <Text
                      style={[styles.paceValue, { color: tokens.text.tertiary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.55}
                    >
                      +{formatMoney(incomeStart, { currency: cur, kopecks: 'hide' })}
                    </Text>
                  </View>
                </View>

                <View style={styles.paceDonutSpacer} />

                <View style={[styles.paceSide, styles.paceSideRight]}>
                  <View style={styles.paceChip}>
                    <Text style={styles.paceChipText}>Сегодня</Text>
                  </View>
                  <View style={[styles.paceValueBlock, styles.paceValueBlockRight]}>
                    <Text style={styles.paceUnit}>день</Text>
                    <Text
                      style={[styles.paceValue, { color: nowWinsPace ? tokens.semantic.positive : tokens.accent.base }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.55}
                    >
                      +{formatMoney(incomeNow, { currency: cur, kopecks: 'hide' })}
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
                        <Text style={styles.orgPctText}>{Math.round(orgShare(g.capital) * 100)}%</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* key меняется вместе с составом сегментов (площадки + есть/нет
                  свободного капитала) — форсирует чистый ремаунт полосы. Без
                  этого при живом изменении набора сегментов (напр. в архив
                  улетело 2 из 3 площадок, экран не перезапускался) Yoga иногда
                  не пересчитывает flex корректно на inplace-обновлении. */}
              <View
                key={`${byOrg.groups.map((g) => g.key).join('-')}|${freeCapital > 0 ? 'free' : 'none'}`}
                style={styles.allocationBar}
              >
                {byOrg.groups.map((g) => (
                  <View
                    key={g.key}
                    style={[styles.allocationSegment, { flex: Math.max(orgShare(g.capital), 0.01), backgroundColor: g.color }]}
                  />
                ))}
                {manualTotalCapital && freeCapital > 0 ? (
                  <View style={[styles.allocationSegment, styles.freeCapSegment, { flex: Math.max(freeCapitalShare, 0.01) }]}>
                    <Svg width="100%" height="100%">
                      <Defs>
                        <SvgPattern id="freeCapStripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                          <Rect width="6" height="6" fill={hexToRgba('#7143AE', 0.12)} />
                          <Rect width="3" height="6" fill={hexToRgba('#7143AE', 0.32)} />
                        </SvgPattern>
                      </Defs>
                      <Rect width="100%" height="100%" fill="url(#freeCapStripes)" />
                    </Svg>
                  </View>
                ) : null}
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

            {/* Эффективность — ставка и премия к ключевой переехали в хиро,
                тут остаётся то, что туда не влезло по смыслу. */}
            <Text style={styles.section}>Эффективность</Text>
            <Card>
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
  paceValue: { fontSize: 22, lineHeight: 24, fontFamily: font.semibold, marginTop: 0, maxWidth: PACE_VALUE_MAX_W },
  paceDonutSpacer: { width: 140 },
  paceDonutOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: tokens.spacing.sm,
    ...boxShadow(tokens.shadow.card),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { fontSize: 14, lineHeight: 16, fontFamily: font.medium, color: hexToRgba('#212121', 0.5), letterSpacing: -0.28 },
  heroDeltaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  heroDeltaText: { fontSize: 12, lineHeight: 14, fontFamily: font.semibold },
  heroValue: { fontSize: 32, lineHeight: 34, fontFamily: font.semibold, color: '#212121', letterSpacing: -0.64, marginTop: 8 },
  heroSpark: { marginTop: tokens.spacing.md },
  heroPeriodRow: { flexDirection: 'row', gap: 6, marginTop: tokens.spacing.sm },
  heroPeriodChip: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: tokens.radius.pill, backgroundColor: 'rgba(215,226,235,0.5)' },
  heroPeriodChipActive: { backgroundColor: tokens.accent.light },
  heroPeriodText: { fontSize: 12, lineHeight: 14, fontFamily: font.medium, color: hexToRgba('#212121', 0.6) },
  heroPeriodTextActive: { fontFamily: font.semibold, color: '#FFFFFF' },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: tokens.spacing.md },
  heroStat: { flex: 1, backgroundColor: tokens.surface.white, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
  heroStatLabel: { fontSize: 11, lineHeight: 13, fontFamily: font.medium, color: hexToRgba('#212121', 0.4) },
  heroStatValue: { fontSize: 15, lineHeight: 17, fontFamily: font.semibold, color: '#212121', letterSpacing: -0.3 },
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
  freeCapSegment: { overflow: 'hidden' },
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
