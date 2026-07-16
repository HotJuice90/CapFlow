import React, { useMemo, useState } from 'react';
import { Dimensions, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Pattern as SvgPattern, Rect } from 'react-native-svg';
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
  manualTotalCapitalConverted,
  rateSpread,
  avgLockDuration,
  taxByInstrument,
  taxByOrganization,
} from '@/state/selectors';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercent, formatPercentSigned, pluralDays } from '@/format';
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
const HERO_PERIODS: { key: HeroPeriod; label: string; days: number | 'all' | 'year' }[] = [
  { key: 'month', label: 'Месяц', days: 30 },
  { key: 'year', label: 'Год', days: 'year' },
  { key: 'all', label: 'Всё время', days: 'all' },
];
// Ширина графика без «карточки» — он теперь лежит прямо на фоне экрана,
// только с обычным полем страницы по бокам (без доп. паддинга плашки).
const GRAPH_W = Dimensions.get('window').width - tokens.spacing.screenH * 2;

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
  const heroDays = HERO_PERIODS.find((p) => p.key === heroPeriod)!.days;
  const capSeries = useMemo(() => capitalHistorySeries(data, heroDays), [data, heroDays]);
  const earnedPeriod = useMemo(() => earnedInPeriod(data, heroDays), [data, heroDays]);
  const incomePace = useMemo(() => incomePaceWindows(data, 30), [data]);
  const spread = useMemo(() => rateSpread(data), [data]);
  const lockDays = useMemo(() => avgLockDuration(data), [data]);
  const taxAssetRows = useMemo(() => taxByInstrument(data), [data]);
  const taxOrgRows = useMemo(() => taxByOrganization(data), [data]);
  const taxRows = taxTab === 'assets' ? taxAssetRows : taxOrgRows;

  const cur = data.settings.defaultCurrency;
  const hasAssets = byType.total > 0;

  // % прироста капитала за выбранный период — тот же ряд, что рисует график,
  // просто первое/последнее значение вместо всей кривой.
  const periodStartCap = capSeries[0] ?? 0;
  const periodEndCap = capSeries[capSeries.length - 1] ?? 0;
  const periodGrowthPct = periodStartCap > 0 ? ((periodEndCap - periodStartCap) / periodStartCap) * 100 : 0;

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
  const taxAccruedPct = summary.taxYearGross > 0 ? Math.round((summary.taxAccruedGross / summary.taxYearGross) * 100) : 0;
  const nowDate = new Date();
  const yearStart = new Date(nowDate.getFullYear(), 0, 1).getTime();
  const yearEnd = new Date(nowDate.getFullYear() + 1, 0, 1).getTime();
  const yearProgressPct = ((nowDate.getTime() - yearStart) / (yearEnd - yearStart)) * 100;
  // Инсайт вместо геометрического сравнения бара с меткой: на сколько п.п.
  // налог набегает быстрее/медленнее равномерного темпа календаря (>0 — уже
  // пробили необлагаемый лимит и дальше облагается весь доход).
  const taxPaceDeltaPct = taxAccruedPct - yearProgressPct;

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
                {formatMoney(summary.totalCapital, { currency: cur })}
              </Text>
            </View>

            <CapitalAxisChart data={capSeries} width={GRAPH_W} height={210} />

            <View style={styles.heroSummaryCard}>
              <View style={styles.heroSummaryLeft}>
                <View style={styles.heroPeriodRow}>
                  {HERO_PERIODS.map((p) => (
                    <Pressable
                      key={p.key}
                      style={[styles.heroPeriodChip, heroPeriod === p.key && styles.heroPeriodChipActive]}
                      onPress={() => { tapBuzz(); setHeroPeriod(p.key); }}
                    >
                      <Text style={[styles.heroPeriodText, heroPeriod === p.key && styles.heroPeriodTextActive]}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ minWidth: 0 }}>
                  <Text
                    style={[styles.heroEarnedValue, { color: earnedPeriod >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {earnedPeriod >= 0 ? '+' : '−'}{formatMoney(Math.abs(earnedPeriod), { currency: cur })}
                  </Text>
                  <Text style={styles.heroEarnedLabel}>Заработано за период</Text>
                </View>
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroRateCell}>
                <Text style={styles.heroRateLabel} numberOfLines={1}>Средняя ставка</Text>
                <View style={styles.heroRatePillBg}>
                  <Text style={styles.heroRateValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPercent(summary.avgRate)}
                  </Text>
                  <Pressable
                    style={styles.heroRateDeltaRow}
                    onPress={() => { tapBuzz(); router.push('/settings/key-rate'); }}
                  >
                    <Text style={[styles.heroRateArrow, { color: summary.premiumToKeyRate >= 0 ? tokens.semantic.positive : tokens.semantic.negative }]}>
                      {summary.premiumToKeyRate >= 0 ? '↑' : '↓'}
                    </Text>
                    <Text style={styles.heroRateDeltaText} numberOfLines={1}>
                      {formatPercentSigned(summary.premiumToKeyRate)} КС
                    </Text>
                  </Pressable>
                </View>
              </View>
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

            {/* По инструментам — «сосуды» с жидкостью по типу (перекликается с
                бокалом в «Можно разместить» ниже): компактно в ряд, при
                добавлении новых типов колонки просто станут уже, а не
                растянут карточку по высоте. */}
            <Text style={[styles.section, { marginTop: tokens.spacing.xxl + tokens.spacing.lg }]}>По инструментам</Text>
            <Card>
              <View style={styles.vesselRow}>
                {byType.groups.map((g) => (
                  <View key={g.key} style={styles.vesselCol}>
                    <View style={styles.vessel}>
                      <LinearGradient
                        colors={[hexToRgba(g.color, 0.55), g.color]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={[styles.vesselFill, { height: `${Math.max(g.share * 100, 10)}%` }]}
                      />
                      <View style={styles.vesselShine} />
                      <MaterialIcons name={typeIcon(g.key)} size={26} color={hexToRgba(g.color, 0.4)} />
                    </View>
                    <Text style={styles.vesselPct}>{Math.round(g.share * 100)}%</Text>
                    <Text style={styles.vesselLabel} numberOfLines={2}>{g.label}</Text>
                  </View>
                ))}
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
              <View style={styles.taxHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taxLabel}>Набежало на сегодня</Text>
                  <Text style={styles.taxValue}>{formatMoney(summary.taxAccruedGross, { currency: cur })}</Text>
                </View>
                <Pressable style={styles.taxRatePill} onPress={() => { tapBuzz(); router.push('/settings/tax'); }}>
                  <Text style={styles.taxRatePillText}>{formatPercent(data.params.taxRate)}</Text>
                  <MaterialIcons name="chevron-right" size={14} color={tokens.category.dfa} />
                </Pressable>
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
                <View style={styles.taxMeta}>
                  <View style={styles.taxMetaInlineRow}>
                    <Text style={styles.taxMetaBigValue}>{taxAccruedPct}%</Text>
                    {Math.abs(taxPaceDeltaPct) >= 1 ? (
                      <InfoTap
                        title="Темп начисления налога"
                        message="Показывает, насколько текущий налог отстаёт от ожидаемого или опережает его. Если значение ниже — налог пока накапливается медленнее прогноза. Если выше — быстрее. На это влияют сроки выплат, доходность активов и необлагаемый лимит."
                      >
                        <View style={styles.taxPaceRow}>
                          <MaterialIcons
                            name={taxPaceDeltaPct > 0 ? 'trending-up' : 'trending-down'}
                            size={12}
                            color={tokens.text.tertiary}
                          />
                          <Text style={styles.taxPaceText}>{Math.abs(Math.round(taxPaceDeltaPct))}%</Text>
                        </View>
                      </InfoTap>
                    ) : null}
                  </View>
                  <View style={styles.taxMetaInlineRow}>
                    <Text style={styles.taxMetaSmallLabel}>Прогноз:</Text>
                    <Text style={[styles.taxMetaBigValue, { color: tokens.text.tertiary }]}>~ {formatMoney(summary.taxYearGross, { currency: cur, kopecks: 'hide' })}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.taxSep} />

              <View style={styles.taxTileRow}>
                <View style={styles.taxTileWide}>
                  <View style={styles.taxTileCol}>
                    <Text style={styles.taxTileLabel}>Удержит банк</Text>
                    <Text style={styles.taxTileValue}>~ {formatMoney(summary.taxYearWithheld, { currency: cur, kopecks: 'hide' })}</Text>
                  </View>
                  <View style={styles.taxTileDivider} />
                  <View style={styles.taxTileCol}>
                    <Text style={styles.taxTileLabel}>Самостоятельно</Text>
                    <Text style={styles.taxTileValue}>~ {formatMoney(summary.taxYearSelfGross, { currency: cur, kopecks: 'hide' })}</Text>
                  </View>
                </View>
                <View style={styles.taxTilePaid}>
                  <Text style={styles.taxTileLabel}>Уплачено</Text>
                  <Text style={[styles.taxTileValue, { color: tokens.semantic.positive }]}>{formatMoney(summary.taxPaidTotal, { currency: cur, kopecks: 'hide' })}</Text>
                </View>
              </View>

              {taxAssetRows.length > 0 || taxOrgRows.length > 0 ? (
                <>
                  <View style={styles.taxSep} />
                  <View style={styles.taxTabPillWrap}>
                    <Pressable
                      style={[styles.taxTabSegment, taxTab === 'assets' && styles.taxTabSegmentActive]}
                      onPress={() => { tapBuzz(); setTaxTab('assets'); }}
                    >
                      <Text style={[styles.taxTabSegmentText, taxTab === 'assets' && styles.taxTabSegmentTextActive]}>Активы</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.taxTabSegment, taxTab === 'orgs' && styles.taxTabSegmentActive]}
                      onPress={() => { tapBuzz(); setTaxTab('orgs'); }}
                    >
                      <Text style={[styles.taxTabSegmentText, taxTab === 'orgs' && styles.taxTabSegmentTextActive]}>Площадки</Text>
                    </Pressable>
                  </View>
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
                            {secondary !== undefined ? (
                              <Text style={styles.taxByInstrumentSubValue}>год ~ {formatMoney(secondary, { currency: cur, kopecks: 'hide' })}</Text>
                            ) : null}
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </>
              ) : null}
            </View>

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
              {manualTotalCapital ? (
                <>
                  <Sep />
                  <Row label="Задействовано" value={formatMoney(byOrg.total, { currency: cur, kopecks: 'hide' })} />
                  <Sep />
                  <Row label="Свободно" value={formatMoney(freeCapital, { currency: cur, kopecks: 'hide' })} />
                </>
              ) : null}
              {spread && spread.max > spread.min ? (
                <>
                  <Sep />
                  <Row label="Разброс ставки" value={`${formatPercent(spread.min)} – ${formatPercent(spread.max)}`} />
                </>
              ) : null}
              {lockDays !== null ? (
                <>
                  <Sep />
                  <Row label="Заморожено в среднем" value={`${Math.round(lockDays)} ${pluralDays(Math.round(lockDays))}`} />
                </>
              ) : null}
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function typeIcon(typeId: string): keyof typeof MaterialIcons.glyphMap {
  switch (typeId) {
    case 'savings': return 'savings';
    case 'deposit': return 'account-balance';
    case 'bond': return 'receipt-long';
    case 'dfa': return 'stars';
    default: return 'category';
  }
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
  insight: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'center',
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    marginBottom: tokens.spacing.lg,
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
  section: { fontSize: tokens.typography.title, fontFamily: font.semibold, color: tokens.text.primary, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
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
  heroPeriodChipActive: { backgroundColor: tokens.accent.light },
  heroPeriodText: { fontSize: tokens.typography.caption, lineHeight: 15, fontFamily: font.medium, color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.26 },
  heroPeriodTextActive: { color: tokens.text.inverse },
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
  heroRateValue: { fontSize: tokens.typography.title, lineHeight: tokens.typography.title + 2, fontFamily: font.semibold, color: '#586692', letterSpacing: -0.2 },
  heroRateDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heroRateArrow: { fontSize: 10 },
  heroRateDeltaText: { fontSize: tokens.typography.micro, lineHeight: 13, fontFamily: font.medium, color: tokens.text.tertiary },
  vesselRow: { flexDirection: 'row', gap: 10 },
  vesselCol: { flex: 1, alignItems: 'center' },
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
  vesselPct: { fontSize: tokens.typography.labelLg, lineHeight: 17, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.3, marginTop: 8 },
  vesselLabel: { fontSize: tokens.typography.micro, lineHeight: 13, fontFamily: font.regular, color: '#909497', letterSpacing: -0.22, textAlign: 'center', marginTop: 2 },
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
  orgAmount: { fontSize: tokens.typography.title, lineHeight: 22, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.4 },
  orgName: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.28 },
  orgPctChip: { width: 50, height: 50, borderRadius: 12, backgroundColor: tokens.surface.white, alignItems: 'center', justifyContent: 'center' },
  orgPctText: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.semibold, color: '#586692' },
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
  freeCapLabel: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.regular, color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.28 },
  freeCapPctChip: { width: 40, height: 40, borderRadius: 12, backgroundColor: hexToRgba(tokens.surface.white, 0.5), alignItems: 'center', justifyContent: 'center' },
  freeCapPctText: { fontSize: tokens.typography.body, lineHeight: 18, fontFamily: font.semibold, color: '#586692' },
  taxCard: {
    backgroundColor: '#F9FAFF',
    borderRadius: 20,
    padding: 16,
    ...boxShadow(tokens.shadow.card),
  },
  taxHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  taxLabel: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: '#909497', letterSpacing: -0.24 },
  taxValue: { fontSize: tokens.typography.header, lineHeight: 26, fontFamily: font.semibold, color: tokens.text.primary, marginTop: 4 },
  taxRatePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: hexToRgba(tokens.category.dfa, 0.12), borderRadius: tokens.radius.pill, paddingHorizontal: tokens.spacing.tight, paddingVertical: 6 },
  taxRatePillText: { fontSize: tokens.typography.caption, lineHeight: 15, fontFamily: font.semibold, color: tokens.category.dfa, letterSpacing: -0.13 },
  taxBarWrap: { marginTop: tokens.spacing.lg },
  taxTrack: { height: 10, borderRadius: tokens.radius.pill, overflow: 'hidden' },
  taxFill: { height: '100%', borderRadius: tokens.radius.pill },
  taxMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  taxMetaInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taxMetaBigValue: { fontSize: 18, lineHeight: 20, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.18 },
  taxMetaSmallLabel: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.12 },
  taxPaceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taxPaceText: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.12 },
  taxSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.lg },
  taxTileRow: { flexDirection: 'row', gap: 8 },
  taxTileWide: { flex: 1, flexDirection: 'row', backgroundColor: hexToRgba('#909497', 0.08), borderRadius: tokens.radius.sm, padding: 10 },
  taxTilePaid: { backgroundColor: hexToRgba(tokens.semantic.positive, 0.08), borderRadius: tokens.radius.sm, paddingHorizontal: 12, paddingVertical: 10 },
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
  taxTabSegment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: tokens.radius.pill },
  taxTabSegmentActive: { backgroundColor: tokens.accent.light },
  taxTabSegmentText: { fontSize: tokens.typography.label, fontFamily: font.medium, color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.14 },
  taxTabSegmentTextActive: { fontFamily: font.semibold, color: tokens.text.inverse },
  taxRowIconBox: { width: 34, height: 34, borderRadius: tokens.radius.sm, alignItems: 'center', justifyContent: 'center' },
  taxByInstrumentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  taxRowPressed: { opacity: 0.6 },
  taxByInstrumentName: { flex: 1, fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.regular, color: tokens.text.secondary, letterSpacing: -0.14 },
  taxByInstrumentValueRow: { flexDirection: 'row', alignItems: 'center' },
  taxFixedLock: { marginRight: 6 },
  taxByInstrumentValue: { fontSize: tokens.typography.body, lineHeight: 18, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -0.16 },
  taxByInstrumentSubValue: { fontSize: tokens.typography.hint, lineHeight: 14, fontFamily: font.regular, color: tokens.text.tertiary, letterSpacing: -0.12, marginTop: 4 },
  taxByInstrumentSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.sm },
  rowLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  rowSub: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  rowValue: { fontSize: tokens.typography.body, fontFamily: font.semibold, color: tokens.text.primary },
  rowAccent: { color: tokens.accent.base, fontFamily: font.bold },
  sep: { height: 1, backgroundColor: tokens.surface.hairline },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontFamily: font.semibold, color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: tokens.text.inverse, fontFamily: font.semibold, fontSize: tokens.typography.label },
});
