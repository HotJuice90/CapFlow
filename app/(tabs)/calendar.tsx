import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { MonthCalendar } from '@/components/MonthCalendar';
import { useData } from '@/state/DataContext';
import { calendarEvents, type CalendarEvent } from '@/state/selectors';
import { tokens } from '@/theme';
import { formatMoney } from '@/format';
import { formatDateShort, pluralDays } from '@/format/date';
import { t } from '@/i18n';

const ICON_BY_TYPE = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  dfa: 'chart-line',
} as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function typeLabel(typeId: string): string {
  return typeId === 'deposit' ? 'Вклад' : typeId === 'savings' ? 'Накопительный счёт' : 'ЦФА';
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data } = useData();

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<string>(todayIso);

  const events = useMemo(() => calendarEvents(data), [data]);
  const cur = data.settings.defaultCurrency;

  const monthPrefix = `${view.year}-${pad2(view.month + 1)}`;
  const monthEvents = useMemo(() => events.filter((e) => e.date.startsWith(monthPrefix)), [events, monthPrefix]);
  const markers = useMemo(() => new Set(monthEvents.map((e) => e.date)), [monthEvents]);
  const monthSum = monthEvents.reduce((s, e) => s + e.amount, 0);
  const dayEvents = useMemo(() => events.filter((e) => e.date === selected), [events, selected]);
  const daySum = dayEvents.reduce((s, e) => s + e.amount, 0);

  const prevMonth = () =>
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  const nextMonth = () =>
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));

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
        <Text style={styles.screenTitle}>{t.tabs.calendar}</Text>

        {events.length === 0 ? (
          <Card style={styles.empty}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={40} color={tokens.accent.base} />
            <Text style={styles.emptyTitle}>Нет будущих событий</Text>
            <Text style={styles.emptyHint}>Здесь появятся окончания вкладов и погашения ЦФА — даты, когда освободится капитал.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/asset/form')}>
              <Text style={styles.emptyBtnText}>Добавить актив</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            {/* Сводка месяца */}
            <Card style={styles.summary}>
              <Text style={styles.summaryLabel}>В этом месяце освободится</Text>
              <Text style={styles.summaryValue}>{formatMoney(monthSum, { currency: cur })}</Text>
              <Text style={styles.summarySub}>
                {monthEvents.length > 0
                  ? `${monthEvents.length} ${pluralEvents(monthEvents.length)}`
                  : 'событий нет'}
              </Text>
            </Card>

            {/* Сетка */}
            <Card>
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

            {/* Выбранный день */}
            <Text style={styles.section}>{formatDateShort(selected)}</Text>
            {dayEvents.length === 0 ? (
              <Card style={styles.dayEmpty}>
                <Text style={styles.dayEmptyText}>В этот день событий нет</Text>
              </Card>
            ) : (
              <>
                <Card style={styles.dayTotalCard}>
                  <Text style={styles.dayTotalLabel}>Освободится</Text>
                  <Text style={styles.dayTotalValue}>{formatMoney(daySum, { currency: cur })}</Text>
                </Card>
                {dayEvents.map((e) => (
                  <EventCard key={e.assetId} e={e} onPress={() => router.push(`/asset/${e.assetId}`)} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function EventCard({ e, onPress }: { e: CalendarEvent; onPress: () => void }) {
  const icon = ICON_BY_TYPE[e.typeId as keyof typeof ICON_BY_TYPE] ?? 'bank-outline';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Card style={styles.eventCard}>
        <View style={styles.eventRow}>
          <View style={[styles.iconBox, { backgroundColor: e.color }]}>
            <MaterialCommunityIcons name={icon} size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventType}>{typeLabel(e.typeId)}</Text>
            <Text style={styles.eventName} numberOfLines={1}>
              {e.instrumentName}
              {e.title ? ` · ${e.title}` : ''}
            </Text>
          </View>
          <View style={styles.eventRight}>
            <Text style={styles.eventAmount}>{formatMoney(e.amount, { currency: e.currency, abbreviateMillions: true })}</Text>
            <Text style={styles.eventDays}>{e.daysRemaining} {pluralDays(e.daysRemaining)}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function pluralEvents(n: number): string {
  const abs = n % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'событий';
  if (last === 1) return 'событие';
  if (last >= 2 && last <= 4) return 'события';
  return 'событий';
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: tokens.typography.display, fontWeight: '600', color: tokens.text.primary, marginBottom: tokens.spacing.lg },
  summary: { marginBottom: tokens.spacing.lg },
  summaryLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary, fontWeight: '500' },
  summaryValue: { fontSize: tokens.typography.metricLg, fontWeight: '800', color: tokens.text.primary, marginTop: tokens.spacing.xs },
  summarySub: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  section: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
  dayEmpty: { alignItems: 'center', paddingVertical: tokens.spacing.xl },
  dayEmptyText: { fontSize: tokens.typography.label, color: tokens.text.tertiary },
  dayTotalCard: { marginBottom: tokens.spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTotalLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  dayTotalValue: { fontSize: tokens.typography.title, fontWeight: '800', color: tokens.accent.base },
  eventCard: { marginBottom: tokens.spacing.md },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  iconBox: { width: 44, height: 44, borderRadius: tokens.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F9FAFB' },
  eventType: { fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  eventName: { fontSize: tokens.typography.body, fontWeight: '500', color: tokens.text.primary, marginTop: 1 },
  eventRight: { alignItems: 'flex-end' },
  eventAmount: { fontSize: tokens.typography.body, fontWeight: '700', color: tokens.text.primary },
  eventDays: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  emptyBtn: { marginTop: tokens.spacing.lg, backgroundColor: tokens.accent.base, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.pill },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: tokens.typography.label },
});
