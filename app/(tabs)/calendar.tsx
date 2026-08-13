import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Card } from '@/components/Card';
import { MonthCalendar } from '@/components/MonthCalendar';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import {
  buildAssetViews,
  dayContributions,
  monthlyIncomeForecast,
  monthlyTaxForecast,
  type DayContribution,
} from '@/state/selectors';
import { diffDays, periodsPerYear } from '@/calc';
import type { CurrencyCode } from '@/domain/types';
import { tokens, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney } from '@/format';
import { formatDateShort } from '@/format/date';
import { t } from '@/i18n';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const MONTH_PROGRESS_HEIGHT = 3;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pluralInstruments(n: number): string {
  const abs = n % 100;
  const last = abs % 10;
  const word = abs > 10 && abs < 20 ? 'инструментов' : last === 1 ? 'инструмент' : last >= 2 && last <= 4 ? 'инструмента' : 'инструментов';
  return `${n} ${word}`;
}

// Иконка по типу инструмента — та же пара, что и в AssetRow/TypeCardsRow.
const ICON_BY_TYPE: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
};

/** Тусклая версия «рост»-зелёного — точка обычного дня с капитализацией. */
const DIM_POSITIVE = hexToRgba(tokens.semantic.positive, 0.32);


export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data } = useData();

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<string>(todayIso);

  // Возвращаемся на таб — сбрасываем на сегодня, а не на то, что листали в прошлый раз.
  useFocusEffect(
    useCallback(() => {
      const n = new Date();
      setView({ year: n.getFullYear(), month: n.getMonth() });
      setSelected(`${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`);
    }, []),
  );

  const views = useMemo(() => buildAssetViews(data), [data]);
  const viewsById = useMemo(() => new Map(views.map((v) => [v.asset.id, v])), [views]);
  const cur = data.settings.defaultCurrency;

  // Прогноз, не факт: у каждого дня месяца есть валидная сумма (движок calculate()
  // прогнан на эту дату для каждого актива) — даже без «событий» число меняется
  // день ото дня у активов с капитализацией.
  const forecast = useMemo(() => monthlyIncomeForecast(data, view.year, view.month), [data, view.year, view.month]);

  const monthForecastSum = forecast.reduce((s, f) => s + f.total, 0);
  const monthReleaseSum = forecast.reduce(
    (s, f) => s + f.changes.filter((c) => c.kind === 'end').reduce((s2, c) => s2 + c.amountBase, 0),
    0,
  );
  const monthTaxSum = useMemo(() => monthlyTaxForecast(data, view.year, view.month), [data, view.year, view.month]);

  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const daysLeft = isCurrentMonth ? daysInMonth - now.getDate() : daysInMonth;
  // Прогресс месяца для полоски-бордера над сеткой: будущий месяц — 0, прошедший — 1,
  // текущий — доля прожитых дней.
  const isFutureMonth = view.year > now.getFullYear() || (view.year === now.getFullYear() && view.month > now.getMonth());
  const monthProgress = isCurrentMonth ? now.getDate() / daysInMonth : isFutureMonth ? 0 : 1;

  // Цвет полоски — по декадам (1-10 / 11-20 / 21-конец), внутри декады насыщенность
  // растёт от «еле заметно» к «в полную силу» — тот же приём градиента, что у бублика
  // «Темп дохода» (CompareDonut), просто на прямой полосе.
  const effectiveDay = isCurrentMonth ? now.getDate() : isFutureMonth ? 1 : daysInMonth;
  const decadeIndex = effectiveDay <= 10 ? 0 : effectiveDay <= 20 ? 1 : 2;
  const decadeHue = [tokens.semantic.positive, tokens.semantic.warning, tokens.accent.base][decadeIndex];
  const decadeStart = decadeIndex === 0 ? 1 : decadeIndex === 1 ? 11 : 21;
  const decadeEnd = decadeIndex === 0 ? 10 : decadeIndex === 1 ? 20 : daysInMonth;
  const decadeIntensity = (effectiveDay - decadeStart + 1) / (decadeEnd - decadeStart + 1);

  // Точка = «в этот день реально что-то произошло»:
  // — тусклая точка: объединяющий индикатор «сегодня есть хоть одна ежедневная
  //   выплата» — ОДНА на день, не по штуке на актив (иначе опять ковёр из точек);
  // — полноцветная точка банка: ровно на дни фактической периодической выплаты
  //   этого актива или на дату окончания вклада — своя точка на каждый банк/событие.
  const markers = useMemo(() => {
    const map = new Map<string, string[]>();
    const dailyDays = new Set<string>();
    const push = (dayIso: string, color: string) => {
      const arr = map.get(dayIso);
      if (arr) arr.push(color);
      else map.set(dayIso, [color]);
    };
    const monthStart = `${view.year}-${pad2(view.month + 1)}-01`;
    const daysInM = new Date(view.year, view.month + 1, 0).getDate();
    const monthEnd = `${view.year}-${pad2(view.month + 1)}-${pad2(daysInM)}`;

    for (const v of views) {
      const payout = v.asset.payoutPeriod ?? v.instrument.payoutPeriod;
      const openDate = v.asset.openDate;
      const endDate = v.asset.endDate;

      if (payout === 'daily') {
        for (let d = 1; d <= daysInM; d++) {
          const dayIso = `${view.year}-${pad2(view.month + 1)}-${pad2(d)}`;
          if (dayIso < openDate || (endDate && dayIso > endDate)) continue;
          dailyDays.add(dayIso);
        }
      } else if (payout && payout !== 'end') {
        // Периодическая выплата (мес./кв./полугодие/год) — точка ровно на дни
        // пересечения границы периода, той же арифметикой, что и капитализация в движке.
        const ppy = periodsPerYear(payout);
        for (let d = 1; d <= daysInM; d++) {
          const dayIso = `${view.year}-${pad2(view.month + 1)}-${pad2(d)}`;
          if (dayIso < openDate || (endDate && dayIso > endDate)) continue;
          const elapsedToday = diffDays(openDate, dayIso);
          if (elapsedToday <= 0) continue;
          const periodToday = Math.floor((elapsedToday * ppy) / 365);
          const periodYesterday = Math.floor(((elapsedToday - 1) * ppy) / 365);
          if (periodToday > periodYesterday) push(dayIso, v.organization.color);
        }
      }

      // Погашение вклада — отдельная точка цветом банка, независимо от периода выплаты.
      if (endDate && endDate >= monthStart && endDate <= monthEnd) {
        push(endDate, v.organization.color);
      }
    }
    for (const dayIso of dailyDays) push(dayIso, DIM_POSITIVE);
    return map;
  }, [views, view.year, view.month]);

  // Список под календарём — КАЖДЫЙ валидный на этот день актив с его дневной
  // работой. Календарь раскладывает общий доход на дни: вклад делится ровно,
  // капитализация даёт рост по копейкам. Выплаты здесь не выводим — только точки.
  const dayItems: DayContribution[] = useMemo(() => dayContributions(data, selected), [data, selected]);

  // «Доход за день» = сумма строк ниже.
  const selectedTotal = useMemo(() => dayItems.reduce((s, c) => s + c.incomePerDayBase, 0), [dayItems]);

  const prevMonth = () =>
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  const nextMonth = () =>
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));

  const hasAssets = views.length > 0;

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
        <ScreenTitle>{t.tabs.calendar}</ScreenTitle>

        {!hasAssets ? (
          <Card style={styles.empty}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={40} color={tokens.accent.base} />
            <Text style={styles.emptyTitle}>Нет активов</Text>
            <Text style={styles.emptyHint}>Добавьте вклад или накопительный счёт — здесь появится прогноз дохода по дням.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/asset/form')}>
              <Text style={styles.emptyBtnText}>Добавить актив</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            {/* Компактная сводка месяца — в стиле нижней таблички дня */}
            <Card style={styles.statsCard} padded={false}>
              <View style={styles.statsRow}>
                <Stat label="Прогноз за месяц" value={`+${formatMoney(monthForecastSum, { currency: cur, kopecks: 'hide' })}`} color={tokens.semantic.positive} />
                <View style={styles.statSep} />
                <Stat label="Налог за месяц" value={`−${formatMoney(monthTaxSum, { currency: cur, kopecks: 'hide' })}`} color={tokens.semantic.warning} />
                <View style={styles.statSep} />
                <Stat label="Освободится" value={formatMoney(monthReleaseSum, { currency: cur, kopecks: 'hide' })} color="#586692" />
                <View style={styles.statSep} />
                <Stat label={isCurrentMonth ? 'До конца месяца' : 'Дней в месяце'} value={`${daysLeft}`} />
              </View>
            </Card>

            {/* Сетка — прогресс месяца border-top'ом: полоска НЕ внутри паддинга,
                чтобы её углы срезались той же маской contentLayer (overflow:hidden),
                что и у самой карточки — тогда она ровно «от закругления до закругления». */}
            <Card style={styles.softShadow} padded={false}>
              <View style={[styles.monthProgressTrack, { backgroundColor: hexToRgba(decadeHue, 0.12) }]}>
                <LinearGradient
                  colors={[hexToRgba(decadeHue, 0.3), hexToRgba(decadeHue, 0.3 + 0.7 * decadeIntensity)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.monthProgressFill, { width: `${monthProgress * 100}%` }]}
                />
              </View>
              <View style={styles.monthGridInner}>
                <MonthCalendar
                  year={view.year}
                  month={view.month}
                  markers={markers}
                  selected={selected}
                  today={todayIso}
                  onSelect={setSelected}
                  onPrev={prevMonth}
                  onNext={nextMonth}
                />
              </View>
            </Card>

            {/* Выбранный день — один сплошной блок: сводка сверху + список инструментов */}
            <Card style={styles.dayCard} padded={false}>
              <View style={styles.dayHeader}>
                <View>
                  <Text style={styles.dayHeaderDate}>{formatDateShort(selected)}</Text>
                  <Text style={styles.dayHeaderCount}>{pluralInstruments(dayItems.length)}</Text>
                </View>
                <View style={styles.dayHeaderRight}>
                  <Text style={[styles.dayHeaderAmount, selectedTotal < 0 && styles.negative]}>
                    {selectedTotal >= 0 ? '+' : ''}{formatMoney(selectedTotal, { currency: cur })}
                  </Text>
                  <Text style={styles.dayHeaderSub}>Доход за день</Text>
                </View>
              </View>

              {dayItems.length > 0 ? (
                <View style={styles.dayList}>
                  {dayItems.map((c, i) => (
                    <InstrumentRow
                      key={c.assetId}
                      c={c}
                      view={viewsById.get(c.assetId)}
                      isLast={i === dayItems.length - 1}
                      onPress={() => router.push(`/asset/${c.assetId}`)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.dayEmpty}>На эту дату нет активных инструментов</Text>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function InstrumentRow({
  c,
  view,
  isLast,
  onPress,
}: {
  c: DayContribution;
  view: ReturnType<typeof buildAssetViews>[number] | undefined;
  isLast: boolean;
  onPress: () => void;
}) {
  const org = view?.organization;

  // Реальная выплата сегодня (не ежедневная рутина): погашение вклада ИЛИ
  // периодическая выплата процентов (мес./кв./полугодие/год).
  const isEvent = c.isEndDay || c.isPayoutDay;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.rowWrap, !isLast && styles.rowDivider, pressed && { opacity: 0.6 }]}>
      <View style={styles.row}>
        {org ? (
          <OrgLogo
            color={org.color}
            logo={org.logo}
            imageUri={org.customImageUri}
            size={44}
            radius={16}
            variant="solid"
            fallbackIcon={view ? ICON_BY_TYPE[view.instrument.typeId] : undefined}
          />
        ) : (
          <View style={[styles.iconFallback, { backgroundColor: c.color }]} />
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              {/* Как на главной: своё название актива важнее названия продукта. */}
              <Text style={styles.rowName} numberOfLines={1}>{view?.asset.title || c.instrumentName}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{org?.name ?? ''}</Text>
            </View>
            <Text style={styles.rowAmount} numberOfLines={1}>
              {c.incomePerDay >= 0 ? '+' : ''}{formatMoney(c.incomePerDay, { currency: c.currency })}
            </Text>
          </View>
        </View>
      </View>

      {isEvent ? <EarnedStripe amount={c.accrued} currency={c.currency} /> : null}
    </Pressable>
  );
}

/** Полоска «Доход за период» с бликом, бегущим по контуру (SVG-обводка + strokeDashoffset). */
function EarnedStripe({ amount, currency }: { amount: number; currency: CurrencyCode }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const strokeW = 1.5;
  const radius = tokens.radius.xs - strokeW / 2;
  const perimeter = size
    ? 2 * (size.w - strokeW - 2 * radius) + 2 * (size.h - strokeW - 2 * radius) + 2 * Math.PI * radius
    : 0;
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -perimeter] });

  return (
    <View
      style={styles.earnedStripe}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
      }}
    >
      {size ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id="glow" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={tokens.text.inverse} stopOpacity="0" />
              <Stop offset="0.5" stopColor={tokens.text.inverse} stopOpacity="0.4" />
              <Stop offset="1" stopColor={tokens.text.inverse} stopOpacity="0" />
            </SvgGradient>
            <SvgGradient id="core" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={tokens.text.inverse} stopOpacity="0" />
              <Stop offset="0.35" stopColor={tokens.text.inverse} stopOpacity="1" />
              <Stop offset="0.65" stopColor={tokens.text.inverse} stopOpacity="1" />
              <Stop offset="1" stopColor={tokens.text.inverse} stopOpacity="0" />
            </SvgGradient>
          </Defs>
          {/* спокойное дно рамки */}
          <Rect
            x={strokeW / 2} y={strokeW / 2}
            width={size.w - strokeW} height={size.h - strokeW}
            rx={radius} ry={radius}
            fill="none"
            stroke={hexToRgba(tokens.semantic.positive, 0.1)}
            strokeWidth={strokeW}
          />
          {/* мягкое свечение блика — короткое, круглые концы, чтобы читалось как точка света */}
          <AnimatedRect
            x={strokeW / 2} y={strokeW / 2}
            width={size.w - strokeW} height={size.h - strokeW}
            rx={radius} ry={radius}
            fill="none"
            stroke="url(#glow)"
            strokeWidth={strokeW * 3}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(perimeter * 0.11, 1)}, ${perimeter}`}
            strokeDashoffset={dashOffset}
          />
          {/* яркое ядро поверх */}
          <AnimatedRect
            x={strokeW / 2} y={strokeW / 2}
            width={size.w - strokeW} height={size.h - strokeW}
            rx={radius} ry={radius}
            fill="none"
            stroke="url(#core)"
            strokeWidth={strokeW * 1.4}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(perimeter * 0.07, 1)}, ${perimeter}`}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      ) : null}
      <View style={styles.earnedStripeInner}>
        <View style={styles.earnedStripeLeft}>
          <MaterialCommunityIcons name="flag-checkered" size={14} color={tokens.semantic.positive} />
          <Text style={styles.earnedStripeText}>Доход за период</Text>
        </View>
        <Text style={styles.earnedStripeAmount}>
          +{formatMoney(amount, { currency })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  softShadow: boxShadow(tokens.shadow.subtle),
  monthProgressTrack: { height: MONTH_PROGRESS_HEIGHT },
  monthProgressFill: { height: MONTH_PROGRESS_HEIGHT },
  monthGridInner: { padding: tokens.spacing.lg, paddingTop: tokens.spacing.lg + MONTH_PROGRESS_HEIGHT },
  statsCard: { marginBottom: tokens.spacing.lg, ...boxShadow(tokens.shadow.subtle) },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, lineHeight: 18, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.36 },
  statLabel: { fontSize: tokens.typography.hint, lineHeight: 12, color: hexToRgba(tokens.text.primary, 0.3), marginTop: tokens.spacing.chip, letterSpacing: -0.24, textAlign: 'center' },
  statSep: { width: 1, height: 30, backgroundColor: tokens.surface.hairline },

  dayCard: { marginTop: tokens.spacing.lg, ...boxShadow(tokens.shadow.subtle) },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: tokens.spacing.sheet,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.surface.hairline,
  },
  dayHeaderDate: { fontSize: tokens.typography.header, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.24 },
  dayHeaderCount: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.3), marginTop: 4, letterSpacing: -0.24 },
  dayHeaderRight: { alignItems: 'flex-end', alignSelf: 'stretch', justifyContent: 'space-between' },
  dayHeaderAmount: { fontSize: 20, fontWeight: '700', color: tokens.semantic.positive },
  dayHeaderSub: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.24 },
  negative: { color: tokens.semantic.negative },

  dayEmpty: { fontSize: tokens.typography.label, color: tokens.text.tertiary, padding: tokens.spacing.lg, textAlign: 'center' },
  dayList: { paddingHorizontal: 16, paddingTop: tokens.spacing.tight, paddingBottom: 8 },

  rowWrap: { paddingVertical: 16 },
  // center: без пилюль текстовый блок (две однострочные строки) ниже логотипа,
  // и при дефолтном stretch он бы прижался к его верху.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  iconFallback: { width: 44, height: 44, borderRadius: 16 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: tokens.spacing.sm },
  rowName: { fontSize: 18, lineHeight: 18, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.36 },
  rowSub: { fontSize: 14, lineHeight: 14, color: tokens.text.tertiary, marginTop: tokens.spacing.chip, letterSpacing: -0.28 },
  rowAmount: { fontSize: 17, fontWeight: '600', color: '#586692', letterSpacing: -0.17 },

  // Полоска-баннер под строкой — показывается только в дни реальной выплаты/погашения.
  // Цвет универсальный (зелёный «рост»), не завязан на бренд-цвет банка.
  // Рамка рисуется SVG-обводкой поверх (см. EarnedStripe) — тут только контент.
  earnedStripe: {
    marginTop: tokens.spacing.tight,
    marginLeft: 56,
    borderRadius: tokens.radius.xs,
  },
  earnedStripeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.tight,
    paddingVertical: 7,
    borderRadius: tokens.radius.xs,
    backgroundColor: hexToRgba(tokens.semantic.positive, 0.08),
  },
  earnedStripeLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earnedStripeText: { fontSize: tokens.typography.hint, fontWeight: '500', color: tokens.text.secondary, letterSpacing: -0.12 },
  earnedStripeAmount: { fontSize: 13, fontWeight: '700', letterSpacing: -0.13, color: tokens.semantic.positive },


  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: tokens.text.inverse, fontWeight: '600', fontSize: tokens.typography.label },
});
