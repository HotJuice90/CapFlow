import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/theme';
import { formatMonthYear } from '@/format/date';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MAX_DOTS = 3;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
export function buildIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Сетка недель месяца (null = пустая ячейка до/после месяца) — общая для всех календарей приложения. */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Пн = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export { WEEKDAYS };

export function MonthCalendar({
  year,
  month,
  markers,
  selected,
  today,
  onSelect,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;
  /** дата → цвета точек-маркеров под числом (до 3 шт., разные типы событий) */
  markers: Map<string, string[]>;
  selected: string | null;
  today: string;
  onSelect: (iso: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const weeks = monthWeeks(year, month);

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={onPrev} hitSlop={12} style={styles.navBtn}>
          <MaterialIcons name="chevron-left" size={22} color={tokens.accent.base} />
        </Pressable>
        <Text style={styles.title}>{formatMonthYear(year, month)}</Text>
        <Pressable onPress={onNext} hitSlop={12} style={styles.navBtn}>
          <MaterialIcons name="chevron-right" size={22} color={tokens.accent.base} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, i >= 5 && styles.weekdayWeekend]}>{w}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={styles.cell} />;
            const dayIso = buildIso(year, month, day);
            const isSelected = dayIso === selected;
            const isToday = dayIso === today;
            const isPast = dayIso < today; // только визуально, логику не трогаем
            const dots = markers.get(dayIso)?.slice(0, MAX_DOTS) ?? [];
            return (
              <Pressable key={di} style={[styles.cell, isPast && styles.cellPast]} onPress={() => onSelect(dayIso)}>
                <View style={[styles.dayCircle, isSelected && !isToday && styles.daySelected, isToday && styles.dayToday]}>
                  <Text style={[styles.dayText, di >= 5 && styles.dayTextWeekend, isSelected && !isToday && styles.dayTextSelected, isToday && styles.dayTextToday]}>
                    {day}
                  </Text>
                </View>
                <View style={styles.dotsRow}>
                  {dots.length > 0
                    ? dots.map((c, i) => <View key={i} style={[styles.dot, { backgroundColor: c }]} />)
                    : <View style={styles.dotSpacer} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.md },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.accent.soft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: tokens.typography.title, fontWeight: '700', color: tokens.text.primary },
  weekRow: { flexDirection: 'row', marginBottom: tokens.spacing.xs },
  weekday: { flex: 1, textAlign: 'center', fontSize: tokens.typography.micro, color: tokens.text.tertiary, fontWeight: '600' },
  weekdayWeekend: { color: '#D48CA6' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  cellPast: { opacity: 0.4 },
  dayCircle: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: tokens.accent.soft, borderRadius: 10 },
  dayToday: { backgroundColor: tokens.accent.base, borderRadius: 18 },
  dayText: { fontSize: tokens.typography.body, color: tokens.text.primary, fontWeight: '500' },
  dayTextWeekend: { color: '#D48CA6' },
  dayTextSelected: { color: tokens.text.primary, fontWeight: '700' },
  dayTextToday: { color: '#FFFFFF', fontWeight: '700' },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 1, height: 4, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotSpacer: { width: 4, height: 4 },
});
