import React, { useMemo, useState } from 'react';
import { Dimensions, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Pattern as SvgPattern, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Card } from '@/components/Card';
import { boxShadow } from '@/theme/shadow';
import { OrgLogo } from '@/components/BankLogo';
import { InfoTap } from '@/components/InfoTap';
import { CompareDonut } from '@/components/CompareDonut';
import { CapitalAxisChart } from '@/components/CapitalAxisChart';
import { MonthlyIncomeChart } from '@/components/MonthlyIncomeChart';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { SlidingChipTabs } from '@/components/SlidingChipTabs';
import { useData } from '@/state/DataContext';
import { tapBuzz } from '@/lib/haptics';
import {
  analyticsSummary,
  insights,
  distributionByType,
  distributionByOrg,
  capitalHistorySeries,
  earnedInPeriod,
  incomePaceWindows,
  freeCapitalBalance,
  rateSpread,
  taxByInstrument,
  taxByOrganization,
  buildAssetViews,
  capitalizationBonus,
  convert,
  monthlyIncomeHistory,
  type DistGroup,
  type TaxByInstrumentRow,
} from '@/state/selectors';
import type { CurrencyCode, Organization } from '@/domain/types';
import { tokens, font, hexToRgba, rowText } from '@/theme';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import { t } from '@/i18n';

// Иконка по типу инструмента — та же пара, что и в AssetRow.
const TAX_TYPE_ICON: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
};

// Доступная ширина под цифру «Темп дохода» слева/справа от бублика (140) — минус
// паддинг плашки (16*2) и небольшой запас (~пара мм), чтобы автоуменьшение
// шрифта срабатывало чуть раньше, не залезая в кольцо.
const PACE_VALUE_MAX_W = (Dimensions.get('window').width - tokens.spacing.screenH * 2 - 32 - 140) / 2 - 8;

type HeroPeriod = 'year' | 'month' | 'all';
const HERO_PERIODS: { key: HeroPeriod; label: string; days: number | 'all' | 'year' | 'month' }[] = [
  { key: 'month', label: 'Месяц', days: 'month' },
  { key: 'year', label: 'Год', days: 'year' },
  { key: 'all', label: 'Всё время', days: 'all' },
];
// Ширина графика без «карточки» — он теперь лежит прямо на фоне экрана,
// только с обычным полем страницы по бокам (без доп. паддинга плашки).
const GRAPH_W = Dimensions.get('window').width - tokens.spacing.screenH * 2;

// Высота плитки «Эффективность» — фиксированная, посчитана от ширины ОБЫЧНОЙ
// (двух в ряд) плитки при aspectRatio 1.31. Если плиток нечётное число, последняя
// в одиночной строке растягивается по ширине (flexGrow), но высота не должна
// раздуваться следом — поэтому не aspectRatio на самой плитке, а готовое число.
const EFF_TILE_W = (Dimensions.get('window').width - tokens.spacing.screenH * 2 - 10) / 2;
const EFF_TILE_H = EFF_TILE_W / 1.31;

// Точная ширина колонки «Состав портфеля», рассчитанная под ровно 3 карточки
// в ряд: экран − поля страницы (16×2) − паддинг карточки (16×2) − 2 зазора
// между колонками (4×2), делённое на 3. Меньше этого — уже не минимум, а
// сжатие; при 4+ типах контент естественно станет шире и появится скролл.
const VESSEL_COL_W = (Dimensions.get('window').width - tokens.spacing.screenH * 2 - tokens.spacing.lg * 2 - 6 * 2) / 3;

export default function AnalyticsScreen() {
  const { data } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [heroPeriod, setHeroPeriod] = useState<HeroPeriod>('month');
  const [taxTab, setTaxTab] = useState<'assets' | 'orgs'>('assets');

  const summary = useMemo(() => analyticsSummary(data), [data]);
  const ins = useMemo(() => insights(data), [data]);
  // Один случайный инсайт из всех подходящих сейчас — выбирается один раз за
  // холодный старт приложения (при монтировании экрана), не при каждом
  // заходе на вкладку и не при ре-рендере от смены данных.
  const [insightSeed] = useState(() => Math.random());
  const activeInsight = ins.length > 0 ? ins[Math.floor(insightSeed * ins.length)] : undefined;
  const byType = useMemo(() => distributionByType(data), [data]);
  const byOrg = useMemo(() => distributionByOrg(data), [data]);
  const monthlyIncome = useMemo(() => monthlyIncomeHistory(data, new Date().getFullYear()), [data]);
  const heroDays = HERO_PERIODS.find((p) => p.key === heroPeriod)!.days;
  const capSeries = useMemo(() => capitalHistorySeries(data, heroDays), [data, heroDays]);
  const earnedPeriod = useMemo(() => earnedInPeriod(data, heroDays), [data, heroDays]);
  const incomePace = useMemo(() => incomePaceWindows(data, 30), [data]);
  const spread = useMemo(() => rateSpread(data), [data]);
  const taxAssetRows = useMemo(() => taxByInstrument(data), [data]);
  const taxOrgRows = useMemo(() => taxByOrganization(data), [data]);
  // Закрытые активы выносим из основного списка: они не действуют, а место
  // занимают наравне с работающими — и без пометки читались как обычные.
  const isAssetsTab = taxTab === 'assets';
  const taxRows = isAssetsTab ? taxAssetRows.filter((r) => !r.closed) : taxOrgRows;
  const closedTaxRows = isAssetsTab ? taxAssetRows.filter((r) => r.closed) : [];
  const closedTaxTotal = closedTaxRows.reduce((sum, r) => sum + r.tax, 0);

  const cur = data.settings.defaultCurrency;
  const hasAssets = byType.total > 0;

  // % прироста капитала за выбранный период — тот же ряд, что рисует график,
  // просто первое/последнее значение вместо всей кривой.
  const periodStartCap = capSeries[0] ?? 0;
  const periodEndCap = capSeries[capSeries.length - 1] ?? 0;
  const periodGrowthPct = periodStartCap > 0 ? ((periodEndCap - periodStartCap) / periodStartCap) * 100 : 0;

  // «Можно разместить» — реальный баланс ленты свободных денег (настройки →
  // «Капитал вне активов»), не разница с ручного тотала. Пусто — карточку не показываем.
  const freeCapital = freeCapitalBalance(data);
  // Раз свободный капитал теперь занимает свой сегмент в той же полосе, доли площадок
  // тоже считаем от общего капитала (а не только суммы площадок) — иначе сегменты
  // перестают складываться в 100% одной полосы.
  const grandTotal = byOrg.total + freeCapital;
  const freeCapitalShare = grandTotal > 0 ? freeCapital / grandTotal : 0;
  const orgShare = (capital: number) => capital / (grandTotal || byOrg.total || 1);

  // Плитки «Эффективность» — отдельный набор метрик, не строки списка (список
  // уже занят под «Налоги»/«Размещение капитала»), поэтому собираем массив и
  // рендерим сеткой 2×N, а не построчно с разделителями.
  const effTiles: {
    key: string; icon: keyof typeof MaterialIcons.glyphMap; color: string;
    label: string; sub?: string; value: string; valueColor?: string;
  }[] = [
    {
      key: 'income1m', icon: 'trending-up', color: tokens.accent.base,
      label: 'Доход\nна 1 млн', value: formatMoney(summary.incomePerMillionYear, { currency: cur, kopecks: 'hide' }),
    },
  ];
  if (summary.topInstrument) {
    effTiles.push({
      key: 'top', icon: 'emoji-events', color: tokens.semantic.positive,
      label: 'Лидер\nдохода', sub: summary.topInstrument.name,
      value: `+${formatMoney(summary.topInstrument.incomePerDay, { currency: cur, kopecks: 'hide' })}/д`,
      valueColor: tokens.semantic.positive,
    });
  }
  // Лучшая ставка — не то же самое, что «Самый доходный»: тот может лидировать
  // просто по размеру позиции, тут — именно по проценту.
  const bestRateView = buildAssetViews(data).reduce<null | ReturnType<typeof buildAssetViews>[number]>(
    (best, v) => (!best || v.derived.currentRate > best.derived.currentRate ? v : best), null,
  );
  if (bestRateView) {
    effTiles.push({
      key: 'bestRate', icon: 'stars', color: tokens.category.dfa,
      label: 'Лучшая\nставка', sub: bestRateView.instrument.name,
      value: formatPercent(bestRateView.derived.currentRate),
      valueColor: tokens.category.dfa,
    });
  }
  if (freeCapital > 0) {
    // % в работе вместо суммы в деньгах — сумма уже видна крупно в
    // «Размещении капитала» и в плашке «Можно разместить», дублировать не надо.
    // Показываем только когда есть свободные деньги — иначе тут всегда 100%, бесполезно.
    effTiles.push({
      key: 'workingShare', icon: 'account-balance-wallet', color: tokens.accent.base,
      label: 'Активный\nкапитал', value: `${Math.round((byOrg.total / grandTotal) * 100)}%`,
    });
  }
  // Чистая ставка — средняя ставка за вычетом НДФЛ. Именно от avgRate, а не от
  // summary.netYear/totalCapital: netYear считает налогооблагаемый доход в
  // границах ТЕКУЩЕГО календарного года (см. thisYearTaxableIncome) — у
  // недавно открытых активов это меньше полного годового дохода, и деление на
  // totalCapital даёт заниженную ставку, а не «среднюю минус налог».
  if (summary.totalCapital > 0) {
    effTiles.push({
      key: 'netRate', icon: 'verified', color: tokens.semantic.positive,
      label: 'Чистая\nставка', value: formatPercent(summary.avgRate * (1 - data.params.taxRate / 100)),
      valueColor: tokens.semantic.positive,
    });
  }
  if (spread && spread.max > spread.min) {
    effTiles.push({
      key: 'spread', icon: 'height', color: tokens.category.bond,
      label: 'Вилка\nставок', value: `${formatPercent(spread.min)} – ${formatPercent(spread.max)}`,
    });
  }
  // Капитализация — сколько именно принесло реинвестирование процентов (не
  // весь доход, а только «проценты на проценты»), считаем через движок.
  const capBonus = useMemo(() => capitalizationBonus(data), [data]);
  if (capBonus > 0) {
    effTiles.push({
      key: 'capBonus', icon: 'auto-graph', color: '#1C93B5',
      label: 'Эффект\nкапитализации', value: `+${formatMoney(capBonus, { currency: cur, kopecks: 'hide' })}`,
      valueColor: '#1C93B5',
    });
  }
  // Средний актив — размер позиции, а не доходность (то, чем занят «Лучшая
  // ставка»/«Самый доходный») — сколько бы вышло, поделить капитал поровну на
  // все. «Максимальный» убрали — он уже виден в «Размещении капитала» выше.
  const allViews = buildAssetViews(data);
  if (allViews.length > 0) {
    effTiles.push({
      key: 'avgAsset', icon: 'balance', color: tokens.text.secondary,
      label: 'Средний\nразмер актива', value: formatMoney(summary.totalCapital / allViews.length, { currency: cur, kopecks: 'hide' }),
    });
  }

  const incomeStart = incomePace.prev;
  const incomeNow = incomePace.now;
  const incomeDeltaAbs = incomeNow - incomeStart;
  const incomeDeltaPct = incomeStart > 0 ? (incomeDeltaAbs / incomeStart) * 100 : 0;
  const nowWinsPace = incomeNow >= incomeStart;

  // НДФЛ: сколько налога уже набежало на сегодня из прогноза за весь год —
  // обе величины про сам налог, поэтому сравнение честное (в отличие от
  // прежней попытки сравнивать налог с необлагаемым лимитом). Рядом — метка
  // «сколько прошло года»: если она левее заливки, налог набегает медленнее
  // года (обычно значит — ещё не пробили лимит), если правее — уже пробили
  // и теперь копится быстрее календаря.
  // Доля прогноза, которую факт уже набрал. Обе величины — с учётом лимита
  // (net), как и всё в шапке карточки.
  const taxAccruedPct = summary.taxYear > 0 ? Math.round((summary.taxAccrued / summary.taxYear) * 100) : 0;
  const nowDate = new Date();
  const yearStart = new Date(nowDate.getFullYear(), 0, 1).getTime();
  const yearEnd = new Date(nowDate.getFullYear() + 1, 0, 1).getTime();
  const yearProgressPct = ((nowDate.getTime() - yearStart) / (yearEnd - yearStart)) * 100;
  // Инсайт вместо геометрического сравнения бара с меткой: на сколько п.п.
  // налог набегает быстрее/медленнее равномерного темпа календаря (>0 — уже
  // пробили необлагаемый лимит и дальше облагается весь доход).

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
        <ScreenTitle>{t.tabs.analytics}</ScreenTitle>

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
            {/* Хиро — по макету (node 467:4593). Капитал + график лежат прямо на фоне
                экрана (без своей плашки), ниже — отдельная светлая карточка с
                переключателем периода, заработанным ЗА ПЕРИОД (не лайфтайм — тот
                же движок earnedInPeriod, реагирует на Год/Месяц/Всё время) и
                средней ставкой + премией к ключевой в одной ячейке. Состав по
                типам — ниже в «По инструментам», не дублируем тут. */}
            <View style={styles.heroCapitalBlock}>
              <View style={styles.heroLabelRow}>
                <Text style={styles.heroLabel}>Мой капитал</Text>
                {periodStartCap > 0 ? (
                  <View
                    style={[
                      styles.heroGrowthPill,
                      { backgroundColor: periodGrowthPct >= 0 ? hexToRgba(tokens.semantic.positive, 0.1) : hexToRgba(tokens.semantic.negative, 0.1) },
                    ]}
                  >
                    <Text style={[styles.heroGrowthText, { color: periodGrowthPct >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}>
                      {formatPercentSigned(periodGrowthPct, 1)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(summary.totalCapital + freeCapital, { currency: cur })}
              </Text>
            </View>

            <CapitalAxisChart data={capSeries} width={GRAPH_W} height={210} />

            <View style={styles.heroSummaryCard}>
              <View style={styles.heroSummaryLeft}>
                <SlidingChipTabs
                  items={HERO_PERIODS.map((p) => ({ key: p.key, label: p.label }))}
                  value={heroPeriod}
                  onChange={setHeroPeriod}
                  trackStyle={styles.heroPeriodRow}
                  chipStyle={styles.heroPeriodChip}
                  pillColor={tokens.accent.light}
                  textStyle={styles.heroPeriodText}
                  textColorOff={hexToRgba(tokens.text.primary, 0.5)}
                  textColorOn={tokens.text.inverse}
                />
                <View style={{ minWidth: 0 }}>
                  <Text
                    style={[styles.heroEarnedValue, { color: earnedPeriod >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {earnedPeriod >= 0 ? '+' : '−'}{formatMoney(Math.abs(earnedPeriod), { currency: cur })}
                  </Text>
                  <Text style={styles.heroEarnedLabel}>Доход за период</Text>
                </View>
              </View>

              <View style={styles.heroDivider} />

              <Pressable
                style={styles.heroRateCell}
                onPress={() => { tapBuzz(); router.push('/settings/key-rate'); }}
              >
                <Text style={styles.heroRateLabel} numberOfLines={1}>Средняя ставка</Text>
                <View style={styles.heroRatePillBg}>
                  <Text style={styles.heroRateValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPercent(summary.avgRate)}
                  </Text>
                  <View style={styles.heroRateDeltaRow}>
                    <Text style={[styles.heroRateArrow, { color: summary.premiumToKeyRate >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}>
                      {summary.premiumToKeyRate >= 0 ? '↑' : '↓'}
                    </Text>
                    <Text style={styles.heroRateDeltaText} numberOfLines={1}>
                      {formatPercentSigned(summary.premiumToKeyRate)} КС
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>

            {/* Инсайт — тёплая карточка-подсказка (лампочка), фон картинкой из Figma */}
            {activeInsight ? (
              <ImageBackground
                source={require('../../assets/decor/insight-bg.png')}
                style={styles.insight}
                imageStyle={styles.insightBg}
                resizeMode="cover"
              >
                <View style={styles.insightIcon}>
                  <MaterialIcons name={activeInsight.icon as keyof typeof MaterialIcons.glyphMap} size={22} color={tokens.semantic.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.insightTag}><Text style={styles.insightTagText}>ИНСАЙТ</Text></View>
                  <Text style={styles.insightTitle}>{activeInsight.title}</Text>
                  <Text style={styles.insightText}>{activeInsight.text}</Text>
                </View>
              </ImageBackground>
            ) : null}

            {/* Темп дохода — «перетягивание каната»: пончик из двух сегментов
                (было/стало) сам показывает пропорцию роста/просадки, темп —
                числом в центре. Слева/справа — абсолютные цифры периодов.
                Никакого графика-тренда — он уже есть в хиро выше. */}
            {/* Прямо под инсайтом, без своего верхнего отступа секции (40px) —
                инсайт уже даёт нужный зазор своим marginBottom. */}
            <Text style={[styles.section, { marginTop: 0 }]}>Темп дохода</Text>
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

            {/* Состав портфеля — «сосуды» с жидкостью по типу (перекликается с
                бокалом в «Можно разместить» ниже). Ширина колонки зафиксирована
                (107 — минимум из Figma, рассчитан под 3 карточки в ряд), при
                4+ типах лишнее уезжает в горизонтальный скролл, а не сжимается. */}
            <Text style={[styles.section, { marginTop: tokens.spacing.xxl + tokens.spacing.lg }]}>Состав портфеля</Text>
            <Card>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vesselRow}>
                {byType.groups.map((g) => (
                  <View key={g.key} style={styles.vesselCol}>
                    <View style={styles.vesselTop}>
                      <Text style={styles.vesselLabel} numberOfLines={2}>{VESSEL_LABEL[g.key] ?? g.label}</Text>
                      <View style={styles.vessel}>
                        <LinearGradient
                          colors={[hexToRgba(g.color, 0.55), g.color]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={[styles.vesselFill, { height: `${Math.max(g.share * 100, 10)}%` }]}
                        />
                        <View style={styles.vesselShine} />
                        <MaterialCommunityIcons name={typeIcon(g.key)} size={26} color={hexToRgba(g.color, 0.4)} />
                      </View>
                    </View>
                    <Text style={styles.vesselPct}>{Math.round(g.share * 100)}%</Text>
                  </View>
                ))}
              </ScrollView>
            </Card>

            {/* Размещение капитала — строки по площадкам + единая пропорциональная полоса */}
            <Text style={styles.section}>Размещение капитала</Text>
            <View style={styles.orgCard}>
              <View style={styles.orgGroup}>
                {byOrg.groups.map((g, i) => {
                  const org = data.organizations.find((o) => o.id === g.key);
                  return (
                    <View key={g.key} style={i > 0 ? styles.orgItemWithSep : undefined}>
                      {i > 0 ? <View style={styles.orgSep} /> : null}
                      <OrgAllocationRow
                        group={g}
                        org={org}
                        cur={cur}
                        sharePct={Math.round(orgShare(g.capital) * 100)}
                        assets={buildOrgChildren(
                          allViews.filter((v) => v.organization.id === g.key),
                          data,
                          orgShare,
                          Math.round(orgShare(g.capital) * 100),
                        )}
                      />
                    </View>
                  );
                })}
              </View>

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
                {freeCapital > 0 ? (
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

              {freeCapital > 0 ? (
                // ImageBackground сам не нажимается — оборачиваем в Pressable.
                // Ведёт в кошелёк: увидел «можно разместить» — сразу к ленте
                // свободных денег, а не искать её через настройки.
                <Pressable
                  style={({ pressed }) => pressed && styles.freeCapPressed}
                  onPress={() => { tapBuzz(); router.push('/settings/capital'); }}
                >
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
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.section}>Доход по месяцам</Text>
            <MonthlyIncomeChart data={monthlyIncome} currency={cur} />

            {/* Налоги (НДФЛ) — операционный расклад «на сегодня» (доплатить
                самому, что удержит банк, с учётом лимита — честная
                рекомендация «сколько реально отложить») уже есть на Главной;
                тут — прогноз по факту начисления: итог за год + разбивка по
                механизму (банк/сам), плюс реально уплаченное за всё время как
                отдельная, явно подписанная лайфтайм-цифра (не годовая, чтобы
                не путать масштаб). Вся карточка — «грязный» налог (taxYearGross/
                taxAccruedGross, БЕЗ лимита): та же плоская ставка×доход
                методика, что и в списке ниже, чтобы сумма списка сходилась с
                заголовком (net-версия с лимитом узнаваемо «теряла» активы —
                свободный лимит гасил их до 0, и в сумме визуально пропадал
                кто-то из списка). Ставка НДФЛ — не константа (настраивается
                по стране/года), тап ведёт к источнику. */}
            <Text style={styles.section}>Налоги (НДФЛ)</Text>
            <View style={styles.taxCard}>
              {/* ФАКТ. Разбивка «банк / сам» стоит рядом с фактом, а не только
                  с прогнозом: раньше эти два числа висели под полосой и
                  выглядели фактом, хотя были прогнозными. Обе величины —
                  с учётом лимита, поэтому разбивка в точности складывается в
                  заголовок, и цифры совпадают с графиком «Доход по месяцам». */}
              <View style={styles.taxHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taxLabel}>Уже набежало</Text>
                  <Text style={styles.taxValue}>{formatMoney(summary.taxAccrued, { currency: cur })}</Text>
                </View>
                <Pressable style={styles.taxRatePill} onPress={() => { tapBuzz(); router.push('/settings/tax'); }}>
                  <Text style={styles.taxRatePillText}>{formatPercent(data.params.taxRate)}</Text>
                  <MaterialIcons name="chevron-right" size={14} color={tokens.category.dfa} />
                </Pressable>
              </View>

              <View style={styles.taxTileRow}>
                <View style={styles.taxTileWide}>
                  <View style={styles.taxTileCol}>
                    <Text style={styles.taxTileLabel}>Удержал банк</Text>
                    <Text style={styles.taxTileValue}>{formatMoney(summary.taxAccruedWithheld, { currency: cur, kopecks: 'hide' })}</Text>
                  </View>
                  <View style={styles.taxTileDivider} />
                  <View style={styles.taxTileCol}>
                    <Text style={styles.taxTileLabel}>Отложить самому</Text>
                    <Text style={styles.taxTileValue}>{formatMoney(summary.taxAccruedSelf, { currency: cur, kopecks: 'hide' })}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.taxSep} />

              {/* ПРОГНОЗ. Полоса живёт здесь: она про то, какую долю прогноза
                  уже набрал факт, то есть принадлежит прогнозу, а не факту. */}
              <View style={styles.taxHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taxLabel}>К концу года</Text>
                  <Text style={[styles.taxValue, { color: tokens.text.secondary }]}>~ {formatMoney(summary.taxYear, { currency: cur, kopecks: 'hide' })}</Text>
                </View>
              </View>

              <View style={styles.taxBarWrap}>
                <View style={styles.taxTrack}>
                  <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                    <Defs>
                      <SvgPattern id="taxTrackStripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                        <Rect width="6" height="6" fill={hexToRgba(tokens.category.dfa, 0.08)} />
                        <Rect width="3" height="6" fill={hexToRgba(tokens.category.dfa, 0.18)} />
                      </SvgPattern>
                    </Defs>
                    <Rect width="100%" height="100%" fill="url(#taxTrackStripes)" />
                  </Svg>
                  <LinearGradient
                    colors={['#BDA0E5', tokens.category.dfa]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.taxFill, { width: `${Math.min(Math.max(taxAccruedPct, 0), 100)}%` }]}
                  />
                </View>
              </View>

              <View style={styles.taxTileRow}>
                <View style={styles.taxTileWide}>
                  <View style={styles.taxTileCol}>
                    <Text style={styles.taxTileLabel}>Удержит банк</Text>
                    <Text style={styles.taxTileValue}>~ {formatMoney(summary.taxYearWithheld, { currency: cur, kopecks: 'hide' })}</Text>
                  </View>
                  <View style={styles.taxTileDivider} />
                  <View style={styles.taxTileCol}>
                    <Text style={styles.taxTileLabel}>Самостоятельно</Text>
                    <Text style={styles.taxTileValue}>~ {formatMoney(summary.taxYearSelf, { currency: cur, kopecks: 'hide' })}</Text>
                  </View>
                </View>
              </View>

              {taxAssetRows.length > 0 || taxOrgRows.length > 0 ? (
                <>
                  <View style={styles.taxSepToTabs} />
                  <SegmentedTabs
                    segments={[
                      { key: 'assets' as const, label: 'Активы' },
                      { key: 'orgs' as const, label: 'Площадки' },
                    ]}
                    value={taxTab}
                    onChange={setTaxTab}
                    style={styles.taxTabPillWrap}
                    trackColor={tokens.surface.tabOff}
                    pillColor={tokens.accent.light}
                    renderLabel={(seg, active) => (
                      <Text style={[styles.taxTabSegmentText, active && styles.taxTabSegmentTextActive]}>{seg.label}</Text>
                    )}
                  />
                  {/* Лимит портфельный: честно разложить его по активам нельзя
                      (см. flatTax в app/asset/[id].tsx), поэтому в списке ставка
                      плоская. Из-за этого сумма списка выше цифр в шапке —
                      подписываем, чтобы разница читалась как замысел. */}
                  <Text style={styles.taxListHint}>Без учёта необлагаемого лимита</Text>
                  {taxRows.map((r, i) => {
                    const primary = r.taxToDate ?? r.tax;
                    const secondary = r.taxToDate !== undefined ? r.tax : undefined;
                    return (
                      <View key={r.key}>
                        {i > 0 ? <View style={styles.taxByInstrumentSep} /> : null}
                        <Pressable
                          style={({ pressed }) => [styles.taxByInstrumentRow, pressed && styles.taxRowPressed]}
                          onPress={() => {
                            tapBuzz();
                            router.push('typeId' in r ? `/asset/${r.key}` : `/catalog/organization?id=${r.key}`);
                          }}
                        >
                          {'typeId' in r ? (
                            <View style={[styles.taxRowIconBox, { backgroundColor: hexToRgba(tokens.category[r.typeId] ?? tokens.accent.base, 0.1) }]}>
                              <MaterialCommunityIcons
                                name={TAX_TYPE_ICON[r.typeId] ?? 'bank-outline'}
                                size={19}
                                color={tokens.category[r.typeId] ?? tokens.accent.base}
                              />
                            </View>
                          ) : (
                            <OrgLogo
                              color={r.color}
                              logo={r.logo}
                              imageUri={r.customImageUri}
                              size={34}
                              radius={tokens.radius.sm}
                            />
                          )}
                          <Text style={styles.taxByInstrumentName} numberOfLines={1}>{r.name}</Text>
                          <View style={{ alignItems: 'flex-end' }}>
                            <View style={styles.taxByInstrumentValueRow}>
                              {r.fixed ? (
                                <InfoTap
                                  title="Срочный актив"
                                  message="Для срочных и уже закрытых активов итоговая сумма налога известна заранее. Поэтому она не меняется при ежедневном пересчёте.

Расчёт обновится только в том случае, если изменятся условия актива, например при досрочном закрытии."
                                >
                                  <MaterialIcons name="lock-outline" size={11} color={tokens.text.tertiary} style={styles.taxFixedLock} />
                                </InfoTap>
                              ) : null}
                              <Text style={styles.taxByInstrumentValue}>{formatMoney(primary, { currency: cur, kopecks: 'hide' })}</Text>
                            </View>
                            {/* Вторая строка только у бессрочных: у срочного
                                значима одна цифра — итоговая. */}
                            {secondary !== undefined ? (
                              <Text style={styles.taxByInstrumentSubValue}>год ~ {formatMoney(secondary, { currency: cur, kopecks: 'hide' })}</Text>
                            ) : null}
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                  {closedTaxRows.length > 0 ? (
                    <ClosedTaxGroup rows={closedTaxRows} total={closedTaxTotal} currency={cur} />
                  ) : null}
                </>
              ) : null}
            </View>

            {/* Эффективность — сетка плиток-статов, а не список: раньше это была
                1:1 копия строчного паттерна из «Налогов» прямо над ней, и блоки
                визуально сливались, хотя по смыслу это разные вещи. */}
            <Text style={styles.section}>Эффективность</Text>
            <View style={styles.effGrid}>
              {effTiles.map((t) => (
                <View key={t.key} style={styles.effTile}>
                  {/* Едва заметный градиент цвета иконки — из противоположного
                      (нижне-правого) угла к иконке, а не сплошная заливка. */}
                  <LinearGradient
                    colors={['transparent', hexToRgba(t.color, 0.04)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.effTileHeaderRow}>
                    <View style={[styles.effTileIconBox, { backgroundColor: hexToRgba(t.color, 0.16) }]}>
                      <MaterialIcons name={t.icon} size={19} color={t.color} />
                    </View>
                    <Text style={styles.effTileLabel} numberOfLines={2}>{t.label}</Text>
                  </View>
                  <View>
                    <Text
                      style={[styles.effTileValue, t.valueColor ? { color: t.valueColor } : null]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {t.value}
                    </Text>
                    {t.sub ? <Text style={styles.effTileSub} numberOfLines={1}>{t.sub}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

// Сокращение только для узких карточек «Состав портфеля» (как в макете
// Figma) — общий typeLabel() в selectors.ts трогать не надо, он делит
// формулировку с главным экраном, где места больше.
const VESSEL_LABEL: Record<string, string> = { savings: 'Накоп. счета' };

// Те же иконки, что и везде в приложении для типа инструмента (AssetRow,
// TypeCardsRow, каталог, поиск) — MaterialCommunityIcons, не свой набор.
function typeIcon(typeId: string): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (typeId) {
    case 'savings': return 'piggy-bank-outline';
    case 'deposit': return 'bank-outline';
    case 'bond': return 'certificate-outline';
    case 'dfa': return 'chart-line';
    default: return 'dots-horizontal';
  }
}



/**
 * Округляет доли до целых так, чтобы их сумма В ТОЧНОСТИ равнялась `target`
 * (методом наибольшего остатка). Нужно, потому что процент площадки — это по
 * смыслу сумма процентов её активов, и если округлять каждый независимо, при
 * раскрытии 25 + 16 давало бы 41 против 40 в шапке. Отдельно округлённые числа,
 * не сходящиеся с итогом, — ровно тот повод не доверять цифрам, от которого мы
 * тут и избавляемся.
 */
function roundSharesTo(values: number[], target: number): number[] {
  const floors = values.map(Math.floor);
  let remainder = target - floors.reduce((a, b) => a + b, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}


function pluralClosed(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'закрытый актив';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'закрытых актива';
  return 'закрытых активов';
}

/**
 * Закрытые активы одной свёрнутой строкой с общей суммой.
 *
 * Раньше они шли вперемешку с действующими и ничем не помечались: список рос
 * полотном, а закрытый счёт визуально не отличался от работающего. Налог по
 * ним никуда не девается (обязательство осталось), поэтому убрать совсем
 * нельзя — но и место наравне с действующими им ни к чему.
 */
function ClosedTaxGroup({
  rows,
  total,
  currency,
}: {
  rows: TaxByInstrumentRow[];
  total: number;
  currency: CurrencyCode;
}) {
  const [open, setOpen] = useState(false);
  const spin = useSharedValue(0);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 180}deg` }] }));

  const toggle = () => {
    tapBuzz();
    spin.value = withTiming(open ? 0 : 1, { duration: 180 });
    setOpen((v) => !v);
  };

  return (
    <View>
      {/* Заголовок группы, а не строка-актив: без иконки слева, чтобы не
          притворяться таким же элементом списка, как действующие активы. */}
      <Pressable style={styles.taxClosedHead} onPress={toggle}>
        <Text style={styles.taxClosedTitle}>Закрытые</Text>
        <Animated.View style={chevron}>
          <MaterialIcons name="keyboard-arrow-down" size={18} color={tokens.text.tertiary} />
        </Animated.View>
        <Text style={styles.taxClosedTotal}>{formatMoney(total, { currency, kopecks: 'hide' })}</Text>
      </Pressable>

      {open
        ? rows.map((r, i) => (
            <View key={r.key}>
              {i > 0 ? <View style={styles.taxByInstrumentSep} /> : null}
              <View style={styles.taxByInstrumentRow}>
                <View style={[styles.taxRowIconBox, { backgroundColor: hexToRgba(tokens.category[r.typeId] ?? tokens.accent.base, 0.1) }]}>
                  <MaterialCommunityIcons
                    name={TAX_TYPE_ICON[r.typeId] ?? 'bank-outline'}
                    size={19}
                    color={tokens.category[r.typeId] ?? tokens.accent.base}
                  />
                </View>
                <View style={styles.taxClosedNameWrap}>
                  <Text style={[styles.taxByInstrumentName, { flex: 0, flexShrink: 1 }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.taxClosedBadge}>закрыт</Text>
                </View>
                <Text style={styles.taxByInstrumentValue}>
                  {formatMoney(r.tax, { currency, kopecks: 'hide' })}
                </Text>
              </View>
            </View>
          ))
        : null}
    </View>
  );
}

function pluralAssets(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'актив';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'актива';
  return 'активов';
}


/** Дети строки площадки: суммы в базовой валюте + доли, сходящиеся с шапкой. */
function buildOrgChildren(
  views: ReturnType<typeof buildAssetViews>,
  data: Parameters<typeof convert>[2],
  orgShare: (capital: number) => number,
  orgPct: number,
): { id: string; name: string; color: string; capital: number; pct: number }[] {
  const rows = views
    // В базовую валюту — как и сумма шапки; иначе актив в долларах показал бы
    // своё сырое число с «₽».
    .map((v) => ({
      id: v.asset.id,
      name: v.asset.title || v.instrument.name,
      color: v.organization.color,
      capital: convert(v.derived.currentValue, v.asset.currency, data),
    }))
    .sort((a, b) => b.capital - a.capital);
  const pcts = roundSharesTo(rows.map((r) => orgShare(r.capital) * 100), orgPct);
  return rows.map((r, i) => ({ ...r, pct: pcts[i] }));
}

/**
 * Строка «Размещения капитала» — аккордеон по площадке.
 *
 * Зачем раскрытие: строка тут — это ОРГАНИЗАЦИЯ (сумма всех её активов), а не
 * актив. При одном активе на банк группировка невидима, и экран читается
 * третьим списком активов с почему-то другими числами — на этом легко сравнить
 * сумму банка с суммой актива и решить, что приложение врёт. Количество рядом
 * с названием и раскрытие состава делают группировку явной.
 *
 * Внутри показываем currentValue каждого актива (а не «вложено», как на
 * Главной) — тогда дети складываются РОВНО в сумму шапки. Разъехавшийся итог
 * в раскрытом списке был бы хуже, чем отсутствие раскрытия вовсе.
 */
function OrgAllocationRow({
  group,
  org,
  cur,
  sharePct,
  assets,
}: {
  group: DistGroup;
  org: Organization | undefined;
  cur: CurrencyCode;
  sharePct: number;
  assets: { id: string; name: string; color: string; capital: number; pct: number }[];
}) {
  const [open, setOpen] = useState(false);
  // Шеврон смотрит ВНИЗ в закрытом виде и ВВЕРХ в открытом: «вправо» читается
  // как переход на другой экран, а не как раскрытие на месте.
  const spin = useSharedValue(0);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 180}deg` }] }));

  const toggle = () => {
    tapBuzz();
    spin.value = withTiming(open ? 0 : 1, { duration: 180 });
    setOpen((v) => !v);
  };

  // При одном активе раскрывать нечего: состав повторил бы сумму шапки, добавив
  // только название. Прячем шеврон и само раскрытие — количество при этом
  // остаётся, чтобы строки читались единообразно.
  const single = group.count === 1;

  const head = (
    <>
      <OrgLogo color={group.color} logo={org?.logo} imageUri={org?.customImageUri} size={44} radius={16} variant="solid" />
      <View style={styles.orgInfo}>
        <Text style={styles.orgAmount} numberOfLines={1}>
          {formatMoney(group.capital, { currency: cur })}
        </Text>
        <View style={styles.orgNameRow}>
          {/* Количество тем же шрифтом, что и банк — вложенный Text без своего
              стиля наследует orgName; отличается только точка-разделитель. */}
          <Text style={styles.orgName} numberOfLines={1}>
            {group.label}
            <Text style={styles.orgMetaSep}> · </Text>
            {group.count} {pluralAssets(group.count)}
          </Text>
          {single ? null : (
            <Animated.View style={chevron}>
              <MaterialIcons name="keyboard-arrow-down" size={18} color={tokens.text.tertiary} />
            </Animated.View>
          )}
        </View>
      </View>
      <View style={styles.orgPctChip}>
        <Text style={styles.orgPctText}>{sharePct}%</Text>
      </View>
    </>
  );

  return (
    <View>
      {/* Без подсветки нажатия: строка раскрывается тут же, и мерцание всей
          строки на каждый тап только раздражает — обратная связь и так есть
          (шеврон + появившийся состав), плюс тактильная. */}
      {single ? (
        <View style={styles.orgRow}>{head}</View>
      ) : (
        <Pressable style={styles.orgRow} onPress={toggle}>{head}</Pressable>
      )}

      {open && !single ? (
        <View style={styles.orgChildren}>
          {/* Ставку тут не показываем: в блоке уже есть процент со смыслом «доля
              портфеля», и два разных процента рядом путали. У актива справа —
              его собственная доля, и суммы долей дают процент площадки. */}
          {assets.map((a) => (
            <View key={a.id} style={styles.orgChildRow}>
              <View style={[styles.orgChildDot, { backgroundColor: a.color }]} />
              <Text style={styles.orgChildName} numberOfLines={1}>{a.name}</Text>
              <Text style={styles.orgChildAmount} numberOfLines={1}>
                {formatMoney(a.capital, { currency: cur, kopecks: 'hide' })}
              </Text>
              <Text style={styles.orgChildPct}>{a.pct}%</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  insight: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'center',
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    // Симметрично верхнему зазору (heroSummaryCard.marginBottom) — у инсайта
    // нет своего заголовка, поэтому обычный 40px отступ секции тут не нужен.
    marginBottom: tokens.spacing.xl,
    overflow: 'hidden',
  },
  insightBg: { borderRadius: tokens.radius.lg },
  insightIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: hexToRgba(tokens.surface.white, 0.7),
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTag: {
    alignSelf: 'flex-start',
    backgroundColor: hexToRgba(tokens.semantic.warning, 0.05),
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    marginBottom: 4,
  },
  insightTagText: { fontSize: 9, lineHeight: 11, fontFamily: font.regular, color: tokens.semantic.warning },
  insightTitle: { fontSize: tokens.typography.body, lineHeight: tokens.typography.body + 2, fontFamily: font.semibold, color: tokens.text.primary },
  insightText: { fontSize: tokens.typography.caption, lineHeight: tokens.typography.caption + 2, fontFamily: font.regular, color: hexToRgba(tokens.text.primary, 0.4), marginTop: 6 },
  section: { fontSize: tokens.typography.title, fontFamily: font.semibold, color: tokens.text.primary, marginTop: 40, marginBottom: 14, paddingLeft: 8 },
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
    backgroundColor: tokens.surface.white,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: tokens.spacing.chip,
  },
  paceChipText: { fontSize: tokens.typography.micro, lineHeight: 13, fontFamily: font.medium, color: hexToRgba(tokens.text.primary, 0.8) },
  paceValueBlock: { alignItems: 'flex-start' },
  paceValueBlockRight: { alignItems: 'flex-end' },
  paceUnit: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.medium, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.24 },
  paceValue: { fontSize: 22, lineHeight: 24, fontFamily: font.semibold, marginTop: 0, maxWidth: PACE_VALUE_MAX_W },
  paceDonutSpacer: { width: 140 },
  paceDonutOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heroCapitalBlock: { gap: 8, marginBottom: 6 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroLabel: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.medium, color: tokens.text.tertiary },
  heroGrowthPill: { borderRadius: tokens.radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  heroGrowthText: { fontSize: tokens.typography.hint, lineHeight: 13, fontFamily: font.medium },
  heroValue: { fontSize: tokens.typography.display, lineHeight: tokens.typography.display + 2, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.34 },
  heroSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
    marginTop: -12,
    marginBottom: tokens.spacing.xl,
    ...boxShadow(tokens.shadow.card),
  },
  heroSummaryLeft: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 20 },
  heroPeriodRow: {
    flexDirection: 'row',
    gap: 2,
    padding: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(215,226,235,0.2)',
  },
  heroPeriodChip: { alignItems: 'center', justifyContent: 'center', height: 25, paddingHorizontal: tokens.spacing.tight, borderRadius: tokens.radius.pill },
  heroPeriodText: { fontSize: tokens.typography.caption, lineHeight: 15, fontFamily: font.medium, color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.26 },
  heroEarnedValue: { fontSize: 26, lineHeight: 28, fontFamily: font.semibold, letterSpacing: -0.24 },
  heroEarnedLabel: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: tokens.text.tertiary, marginTop: 4 },
  heroDivider: { width: 1, alignSelf: 'stretch', backgroundColor: tokens.surface.hairline },
  heroRateCell: { alignItems: 'center', gap: 12, paddingTop: 7 },
  heroRateLabel: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.24 },
  // Тонированная плашка вокруг ставки+дельты — в Figma это не голые числа,
  // а единый блок с подложкой (accent.light@0.1).
  heroRatePillBg: {
    alignItems: 'flex-end', gap: 6, backgroundColor: hexToRgba(tokens.accent.light, 0.1),
    borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  heroRateValue: { fontSize: tokens.typography.title, lineHeight: tokens.typography.title + 2, fontFamily: font.semibold, color: tokens.accent.base, letterSpacing: -0.2 },
  heroRateDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heroRateArrow: { fontSize: 10 },
  heroRateDeltaText: { fontSize: tokens.typography.micro, lineHeight: 13, fontFamily: font.medium, color: tokens.text.tertiary },
  // minWidth:'100%' (не width!) — контейнер растягивается на всю ширину,
  // когда контента мало (карточки делят место поровну), но НЕ мешает ему
  // стать шире экрана, когда карточек много — иначе скролл в ScrollView
  // просто не включался бы (width жёстко обрезал контент).
  vesselRow: { flexDirection: 'row', gap: 6, flexGrow: 1, minWidth: '100%' },
  // Фикс. ширина (107 — минимум из Figma, под 3 карточки в строке без сжатия);
  // если карточек 3 или меньше — flexGrow растягивает их вместе на всю ширину.
  vesselCol: { flex: 1, minWidth: VESSEL_COL_W, alignItems: 'center', gap: 12 },
  vesselTop: { width: '100%', alignItems: 'center', gap: 10 },
  vessel: {
    width: '100%',
    height: 76,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(152,162,183,0.14)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vesselFill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  vesselShine: {
    position: 'absolute',
    top: -10,
    left: -8,
    width: 22,
    height: 110,
    backgroundColor: hexToRgba(tokens.surface.white, 0.25),
    transform: [{ rotate: '-18deg' }],
  },
  vesselPct: { fontSize: 18, lineHeight: 20, fontFamily: font.semibold, color: tokens.text.primary },
  vesselLabel: { fontSize: tokens.typography.hint, lineHeight: tokens.typography.hint + 2, fontFamily: font.medium, color: tokens.text.tertiary, textAlign: 'center' },
  orgCard: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
    ...boxShadow(tokens.shadow.card),
  },
  // Группа строк площадок — gap:10 между строкой/разделителем/строкой (было
  // marginVertical:16 на разделителе — вдвое больше, чем в Figma).
  // 15 + разделитель + 15 = 30 между содержимым строк — единый ритм со
  // строками активов в календаре (там те же 15 как paddingVertical).
  orgGroup: { gap: 15 },
  // Разделитель и строка под ним — в одной обёртке (нужен общий key), без
  // своего gap тут было бы 10px только НАД разделителем (от orgGroup) и 0
  // ПОД ним — нужно 10 с обеих сторон.
  orgItemWithSep: { gap: 15 },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  orgSep: { height: 1, backgroundColor: tokens.surface.hairline },
  orgInfo: { flex: 1, minWidth: 0, gap: tokens.spacing.xs },
  orgAmount: { fontSize: 17, lineHeight: 19, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.2 },
  // flexShrink — чтобы длинное «Банк · Название актива» обрезалось, а не
  // выдавливало шеврон за край строки.
  // Тот же подзаголовок, что у строки актива на главной и в календаре
  // (src/theme/rowText.ts). marginTop гасим: вертикальный зазор тут уже даёт
  // gap у orgInfo, иначе отступ сложился бы дважды.
  orgName: { ...rowText.subtitle, marginTop: 0, flexShrink: 1 },
  orgPctChip: { width: 44, height: 44, borderRadius: tokens.radius.md, backgroundColor: hexToRgba(tokens.surface.white, 0.92), alignItems: 'center', justifyContent: 'center' },
  orgPctText: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.semibold, color: tokens.accent.base },
  orgNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taxListHint: {
    fontSize: tokens.typography.micro,
    lineHeight: 14,
    color: tokens.text.tertiary,
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.xs,
  },
  taxClosedHead: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: tokens.spacing.lg, paddingBottom: tokens.spacing.sm },
  taxClosedTitle: { fontFamily: font.semibold, fontSize: tokens.typography.label, lineHeight: 16, color: tokens.text.secondary },
  taxClosedTotal: { flex: 1, textAlign: 'right', fontFamily: font.semibold, fontSize: tokens.typography.label, lineHeight: 16, color: tokens.text.secondary },
  taxClosedNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  taxClosedBadge: {
    fontSize: tokens.typography.micro,
    color: tokens.text.tertiary,
    backgroundColor: hexToRgba(tokens.text.tertiary, 0.12),
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  orgMetaSep: { fontSize: tokens.typography.micro, color: hexToRgba(tokens.text.tertiary, 0.6) },
  orgChildren: { marginTop: 12, marginLeft: 44 + tokens.spacing.md, gap: 10 },
  orgChildRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orgChildDot: { width: 6, height: 6, borderRadius: 3 },
  orgChildName: { flex: 1, fontSize: tokens.typography.caption, color: tokens.text.secondary },
  orgChildAmount: { fontFamily: font.semibold, fontSize: tokens.typography.caption, color: tokens.text.primary },
  // Ширина фиксирована, чтобы проценты детей стояли колонкой под чипом площадки.
  orgChildPct: { width: 34, textAlign: 'right', fontSize: tokens.typography.micro, color: tokens.text.tertiary },
  // marginTop 24 — то же расстояние, что Figma держит между всеми тремя
  // секциями карточки (gap-[24px] на контейнере): строки → полоса → плашка.
  allocationBar: { flexDirection: 'row', gap: 2, height: 20, marginTop: tokens.spacing.lg },
  allocationSegment: { borderRadius: 4 },
  freeCapSegment: { overflow: 'hidden' },
  freeCapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    marginTop: tokens.spacing.lg,
    backgroundColor: hexToRgba('#7143AE', 0.08),
    overflow: 'hidden',
  },
  freeCapBg: { borderRadius: 16 },
  freeCapPressed: { opacity: 0.6 },
  freeCapInfo: { gap: 6 },
  freeCapValue: { fontSize: tokens.typography.title, lineHeight: tokens.typography.title + 2, fontFamily: font.semibold, color: '#7143AE', letterSpacing: -0.2 },
  freeCapLabel: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.medium, color: tokens.text.tertiary },
  freeCapPctChip: { width: 44, height: 44, borderRadius: 12, backgroundColor: hexToRgba(tokens.surface.white, 0.5), alignItems: 'center', justifyContent: 'center' },
  freeCapPctText: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.semibold, color: tokens.accent.base },
  taxCard: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
    ...boxShadow(tokens.shadow.card),
  },
  taxHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  // Шапка: было 12pt Regular и marginTop:4 до суммы — заметно теснее Figma
  // (14pt Medium, gap 10 до суммы). Тут акцент на воздух, как просили.
  taxLabel: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.medium, color: tokens.text.tertiary },
  taxValue: { fontSize: tokens.typography.header, lineHeight: 26, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.24, marginTop: 10 },
  // Шеврон справа визуально «весит» больше текста — при равном паддинге
  // с обеих сторон казалось, что справа лишний пробел, поджал.
  taxRatePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: hexToRgba(tokens.category.dfa, 0.12), borderRadius: tokens.radius.pill, paddingLeft: tokens.spacing.tight, paddingRight: tokens.spacing.chip, paddingVertical: 6 },
  taxRatePillText: { fontSize: tokens.typography.caption, lineHeight: 15, fontFamily: font.semibold, color: tokens.category.dfa, letterSpacing: -0.13 },
  taxBarWrap: { marginTop: tokens.spacing.lg },
  taxTrack: { height: 10, borderRadius: tokens.radius.pill, overflow: 'hidden' },
  taxFill: { height: '100%', borderRadius: tokens.radius.pill },
  taxMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 },
  taxMetaBigValue: { fontSize: 18, lineHeight: 20, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.18 },
  taxMetaSmallLabel: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.12 },
  taxSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.sheet },
  // Именно разделитель перед табами Активы/Площадки — на 2px меньше зазора,
  // чем обычный taxSep.
  taxSepToTabs: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: 18 },
  taxTileRow: { flexDirection: 'row', gap: 4 },
  taxTileWide: { flex: 1, flexDirection: 'row', backgroundColor: hexToRgba('#909497', 0.08), borderRadius: tokens.radius.sm, padding: 10 },
  taxTileCol: { flex: 1 },
  taxTileDivider: { width: 1, backgroundColor: hexToRgba('#909497', 0.2), marginHorizontal: 10 },
  taxTileLabel: { fontSize: tokens.typography.micro, lineHeight: 13, fontFamily: font.regular, color: '#909497', letterSpacing: -0.11 },
  taxTileValue: { fontSize: tokens.typography.label, lineHeight: 17, fontFamily: font.semibold, color: tokens.text.primary, marginTop: 4, letterSpacing: -0.14 },
  taxTabPillWrap: {
    flexDirection: 'row',
    padding: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.surface.tabOff,
    marginBottom: tokens.spacing.xl,
  },
  // lineHeight не был задан явно — нативный интерлиньяж Onest раздувал таб
  // выше паддинга, из-за чего он казался «толще», чем 10px на самом деле.
  taxTabSegmentText: {
    fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.medium,
    color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.14, paddingVertical: 10,
  },
  taxTabSegmentTextActive: { fontFamily: font.semibold, color: tokens.text.inverse },
  taxRowIconBox: { width: 34, height: 34, borderRadius: tokens.radius.sm, alignItems: 'center', justifyContent: 'center' },
  taxByInstrumentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  taxRowPressed: { opacity: 0.6 },
  taxByInstrumentName: { flex: 1, fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.regular, color: tokens.text.secondary, letterSpacing: -0.14 },
  taxByInstrumentValueRow: { flexDirection: 'row', alignItems: 'center' },
  taxFixedLock: { marginRight: 6 },
  taxByInstrumentValue: { fontSize: tokens.typography.body, lineHeight: 18, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.16 },
  taxByInstrumentSubValue: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.12, marginTop: 4 },
  taxByInstrumentSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: 10 },
  // Сетка плиток-статов — сознательно другой паттерн, чем построчные списки
  // выше (Налоги/Размещение капитала), чтобы блок не сливался с ними.
  effGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Высота — фиксированная (EFF_TILE_H), а не aspectRatio: при нечётном числе
  // плиток последняя в одиночной строке растягивается по ширине (flexGrow),
  // это нормально, но высота не должна раздуваться следом.
  effTile: {
    flexBasis: '48%', flexGrow: 1, height: EFF_TILE_H, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 18,
    justifyContent: 'space-between', backgroundColor: '#F9FAFF', overflow: 'hidden',
  },
  effTileHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  effTileIconBox: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  effTileLabel: { flex: 1, fontSize: 12, lineHeight: 14, fontFamily: font.medium, color: tokens.text.secondary },
  effTileValue: { fontSize: 22, lineHeight: 24, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.22 },
  effTileSub: { fontSize: tokens.typography.micro, lineHeight: 13, fontFamily: font.regular, color: tokens.text.tertiary, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontFamily: font.semibold, color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: tokens.text.inverse, fontFamily: font.semibold, fontSize: tokens.typography.label },
});
