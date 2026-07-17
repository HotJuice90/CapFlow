import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { useData } from '@/state/DataContext';
import {
  buildAssetViews,
  portfolioSummary,
  groupByInstrumentType,
  incomeSparkline,
  monthComparison,
  analyticsSummary,
  liquidity,
} from '@/state/selectors';
import type { AssetView } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercentSigned } from '@/format';
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

function pluralPlatform(n: number): string {
  return n === 1 ? 'площадке' : 'площадках';
}

/** «Во что превратился доход» — игровой пересчёт дохода за день в бытовые
 *  покупки. Цены — ориентировочные средние по РФ, не завязаны на реальные
 *  данные (это флёр, не финансовый расчёт). */
type ConvKey = 'coffee' | 'dinner' | 'gas' | 'payment' | 'car' | 'custom';
const CONVERSION_ITEMS: {
  key: ConvKey;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  chipLabel: string;
  manyLabel: string;
  price: number;
}[] = [
  { key: 'coffee', icon: 'coffee-outline', chipLabel: 'чашка', manyLabel: 'чашек кофе', price: 300 },
  { key: 'dinner', icon: 'silverware-fork-knife', chipLabel: 'ужин', manyLabel: 'ужинов в кафе', price: 700 },
  { key: 'gas', icon: 'gas-station-outline', chipLabel: 'бак', manyLabel: 'баков бензина', price: 3500 },
  { key: 'payment', icon: 'home-city-outline', chipLabel: 'платёж', manyLabel: 'платежей по ипотеке', price: 30000 },
  { key: 'car', icon: 'car-outline', chipLabel: 'машина', manyLabel: 'машин', price: 1_500_000 },
];

export default function HomeScreen() {
  const { data, loading } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sortIdx, setSortIdx] = useState(0);
  const [convKey, setConvKey] = useState<ConvKey>('coffee');
  const [customPrice, setCustomPrice] = useState('');

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

  const convActiveItem = CONVERSION_ITEMS.find((i) => i.key === convKey);
  const convCustomPrice = parseInt(customPrice.replace(/\D/g, ''), 10) || 0;
  const convPrice = convKey === 'custom' ? convCustomPrice : (convActiveItem?.price ?? 0);
  const convManyLabel = convKey === 'custom' ? 'своих покупок' : (convActiveItem?.manyLabel ?? '');
  const convCount = convPrice > 0 ? summary.incomePerDay / convPrice : 0;
  const convCountText = convCount === 0 ? '0' : convCount >= 100 ? Math.round(convCount).toLocaleString('ru-RU') : convCount.toFixed(1).replace('.', ',');

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

            <Text style={styles.sectionTitle}>Во что превратился доход</Text>
            <Card>
              <View style={styles.convIconCircle}>
                <MaterialCommunityIcons name="coffee-outline" size={20} color={tokens.category.dfa} />
              </View>
              <Text style={styles.convIntro}>сегодня твои деньги — это</Text>
              <View style={styles.convBigRow}>
                <Text style={styles.convBigNumber} numberOfLines={1} adjustsFontSizeToFit>{convCountText}</Text>
                <Text style={styles.convBigLabel} numberOfLines={1}> {convManyLabel}</Text>
              </View>
              <Text style={styles.convSub}>…пока ты просто жил свой день</Text>

              <View style={styles.convChipsWrap}>
                {CONVERSION_ITEMS.map((item) => (
                  <Pressable
                    key={item.key}
                    style={[styles.convChip, convKey === item.key && styles.convChipActive]}
                    onPress={() => setConvKey(item.key)}
                  >
                    <MaterialCommunityIcons name={item.icon} size={14} color={convKey === item.key ? tokens.text.inverse : tokens.text.secondary} />
                    <Text style={[styles.convChipText, convKey === item.key && styles.convChipTextActive]}>{item.chipLabel}</Text>
                  </Pressable>
                ))}
                {convKey === 'custom' ? (
                  <View style={[styles.convChip, styles.convChipActive, styles.convChipInput]}>
                    <TextInput
                      value={customPrice}
                      onChangeText={setCustomPrice}
                      placeholder="цена, ₽"
                      placeholderTextColor={hexToRgba(tokens.text.inverse, 0.6)}
                      keyboardType="number-pad"
                      style={styles.convChipInputText}
                      autoFocus
                    />
                  </View>
                ) : (
                  <Pressable style={[styles.convChip, styles.convChipDashed]} onPress={() => setConvKey('custom')}>
                    <MaterialCommunityIcons name="plus" size={14} color={tokens.text.secondary} />
                    <Text style={styles.convChipText}>своё</Text>
                  </Pressable>
                )}
              </View>
            </Card>

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
  convIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: hexToRgba(tokens.category.dfa, 0.12), alignItems: 'center', justifyContent: 'center' },
  convIntro: { fontSize: tokens.typography.caption, fontFamily: font.regular, color: tokens.text.tertiary, marginTop: tokens.spacing.md },
  convBigRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginTop: 8 },
  convBigNumber: { fontSize: tokens.typography.metric, fontFamily: font.extrabold, color: tokens.text.primary },
  convBigLabel: { fontSize: tokens.typography.title, fontFamily: font.semibold, color: tokens.category.dfa },
  convSub: { fontSize: tokens.typography.caption, fontFamily: font.regular, color: tokens.text.tertiary, marginTop: 4 },
  convChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: tokens.spacing.lg },
  convChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tokens.surface.neutral, borderRadius: tokens.radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  convChipActive: { backgroundColor: tokens.category.dfa },
  convChipText: { fontSize: tokens.typography.caption, fontFamily: font.medium, color: tokens.text.secondary },
  convChipTextActive: { color: tokens.text.inverse },
  convChipDashed: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: tokens.surface.hairline },
  convChipInput: { paddingVertical: 4, minWidth: 90 },
  convChipInputText: { fontSize: tokens.typography.caption, fontFamily: font.medium, color: tokens.text.inverse, padding: 0 },
});
