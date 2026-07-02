import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
  type DayContribution,
} from '@/state/selectors';
import { tokens } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercent } from '@/format';
import { formatDateShort } from '@/format/date';
import { t } from '@/i18n';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pluralInstruments(n: number): string {
  const abs = n % 100;
  const last = abs % 10;
  const word = abs > 10 && abs < 20 ? 'инструментов' : last === 1 ? 'инструмент' : last >= 2 && last <= 4 ? 'инструмента' : 'инструментов';
  return `${n} ${word}`;
}

const TYPE_LABEL: Record<string, string> = {
  deposit: 'Вклад',
  savings: 'Накопительный счёт',
  dfa: 'ЦФА',
};

const PAYOUT_LABEL: Record<string, string> = {
  daily: 'Ежедневно',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  semiannual: 'Раз в полгода',
  annual: 'Ежегодно',
  end: 'В конце срока',
};


export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data } = useData();

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<string>(todayIso);

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

  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const daysLeft = isCurrentMonth ? daysInMonth - now.getDate() : daysInMonth;

  // Точка = «инструмент работает в этот день». У каждого активного актива своя
  // точка КАЖДЫЙ день его жизни: вклад закончился — точка исчезла. Живой календарь.
  const markers = useMemo(() => {
    const map = new Map<string, string[]>();
    const daysInM = new Date(view.year, view.month + 1, 0).getDate();
    for (let d = 1; d <= daysInM; d++) {
      const dayIso = `${view.year}-${pad2(view.month + 1)}-${pad2(d)}`;
      const colors: string[] = [];
      for (const v of views) {
        if (dayIso < v.asset.openDate) continue;
        if (v.asset.endDate && dayIso > v.asset.endDate) continue;
        colors.push(v.organization.color);
      }
      if (colors.length > 0) map.set(dayIso, colors);
    }
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
          paddingTop: 80,
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
                <Stat label="Прогноз за месяц" value={`+${formatMoney(monthForecastSum, { currency: cur, abbreviateMillions: true, kopecks: 'hide' })}`} color="#009933" />
                <View style={styles.statSep} />
                <Stat label="Освободится" value={formatMoney(monthReleaseSum, { currency: cur, abbreviateMillions: true, kopecks: 'hide' })} color="#586692" />
                <View style={styles.statSep} />
                <Stat label={isCurrentMonth ? 'До конца месяца' : 'Дней в месяце'} value={`${daysLeft}`} />
              </View>
            </Card>

            {/* Сетка */}
            <Card style={styles.softShadow}>
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
  const rate = view?.asset.rate;
  const payout = view?.asset.payoutPeriod ?? view?.instrument.payoutPeriod;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !isLast && styles.rowDivider, pressed && { opacity: 0.6 }]}>
      {org ? (
        <OrgLogo color={org.color} logo={org.logo} size={44} radius={16} variant="solid" />
      ) : (
        <View style={[styles.iconFallback, { backgroundColor: c.color }]} />
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName} numberOfLines={1}>{c.instrumentName}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{org?.name ?? ''}</Text>
          </View>
          <Text style={styles.rowAmount} numberOfLines={1}>
            {c.incomePerDay >= 0 ? '+' : ''}{formatMoney(c.incomePerDay, { currency: c.currency, abbreviateMillions: true })}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {rate !== undefined ? (
            <View style={[styles.pill, styles.pillPct]}><Text style={styles.pillText}>{formatPercent(rate)}</Text></View>
          ) : null}
          <View style={styles.pill}><Text style={styles.pillText}>{TYPE_LABEL[c.typeId] ?? c.typeId}</Text></View>
          {payout ? (
            <View style={styles.pill}><Text style={styles.pillText}>{PAYOUT_LABEL[payout] ?? payout}</Text></View>
          ) : null}
        </ScrollView>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  softShadow: boxShadow('0px 6px 18px rgba(48,69,62,0.05)'),
  statsCard: { marginBottom: tokens.spacing.lg, ...boxShadow('0px 6px 18px rgba(48,69,62,0.05)') },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, lineHeight: 18, fontWeight: '600', color: '#212121', letterSpacing: -0.36 },
  statLabel: { fontSize: 12, lineHeight: 12, color: 'rgba(33,33,33,0.3)', marginTop: 6, letterSpacing: -0.24, textAlign: 'center' },
  statSep: { width: 1, height: 30, backgroundColor: '#EAF2F9' },

  dayCard: { marginTop: tokens.spacing.lg, ...boxShadow('0px 6px 18px rgba(48,69,62,0.05)') },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EAF2F9',
  },
  dayHeaderDate: { fontSize: 24, fontWeight: '600', color: '#212121', letterSpacing: -0.24 },
  dayHeaderCount: { fontSize: 12, color: 'rgba(33,33,33,0.3)', marginTop: 4, letterSpacing: -0.24 },
  dayHeaderRight: { alignItems: 'flex-end', alignSelf: 'stretch', justifyContent: 'space-between' },
  dayHeaderAmount: { fontSize: 20, fontWeight: '700', color: '#009933' },
  dayHeaderSub: { fontSize: 12, color: 'rgba(33,33,33,0.3)', letterSpacing: -0.24 },
  negative: { color: tokens.semantic.negative },

  dayEmpty: { fontSize: tokens.typography.label, color: tokens.text.tertiary, padding: tokens.spacing.lg, textAlign: 'center' },
  dayList: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },

  row: { flexDirection: 'row', gap: 12, paddingVertical: 16 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#EAF2F9' },
  iconFallback: { width: 44, height: 44, borderRadius: 16 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: tokens.spacing.sm },
  rowName: { fontSize: 18, lineHeight: 18, fontWeight: '600', color: '#212121', letterSpacing: -0.36 },
  rowSub: { fontSize: 14, lineHeight: 14, color: tokens.text.tertiary, marginTop: 6, letterSpacing: -0.28 },
  rowAmount: { fontSize: 17, fontWeight: '600', color: '#586692', letterSpacing: -0.17 },

  pillRow: { flexDirection: 'row', gap: 2, marginTop: 10 },
  pill: { backgroundColor: '#F9FAFF', borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  pillPct: { paddingHorizontal: 8 },
  pillText: { fontSize: 11, fontWeight: '500', color: 'rgba(33,33,33,0.8)' },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: tokens.typography.label },
});
