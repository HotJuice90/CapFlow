import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/theme';
import { formatMonthYear } from '@/format/date';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function iso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

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
  markers: Set<string>;
  selected: string | null;
  today: string;
  onSelect: (iso: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Пн = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={onPrev} hitSlop={12} style={styles.navBtn}>
          <MaterialIcons name="chevron-left" size={26} color={tokens.text.primary} />
        </Pressable>
        <Text style={styles.title}>{formatMonthYear(year, month)}</Text>
        <Pressable onPress={onNext} hitSlop={12} style={styles.navBtn}>
          <MaterialIcons name="chevron-right" size={26} color={tokens.text.primary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={styles.cell} />;
            const dayIso = iso(year, month, day);
            const isSelected = dayIso === selected;
            const isToday = dayIso === today;
            const hasEvent = markers.has(dayIso);
            return (
              <Pressable key={di} style={styles.cell} onPress={() => onSelect(dayIso)}>
                <View style={[styles.dayCircle, isSelected && styles.daySelected, !isSelected && isToday && styles.dayToday]}>
                  <Text style={[styles.dayText, isSelected && styles.dayTextSelected, !isSelected && isToday && styles.dayTextToday]}>
                    {day}
                  </Text>
                </View>
                <View style={[styles.dot, hasEvent && !isSelected && styles.dotOn]} />
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
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: tokens.typography.title, fontWeight: '700', color: tokens.text.primary },
  weekRow: { flexDirection: 'row', marginBottom: tokens.spacing.xs },
  weekday: { flex: 1, textAlign: 'center', fontSize: tokens.typography.micro, color: tokens.text.tertiary, fontWeight: '600' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: tokens.accent.base },
  dayToday: { borderWidth: 1.5, borderColor: tokens.accent.base },
  dayText: { fontSize: tokens.typography.label, color: tokens.text.primary, fontWeight: '500' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  dayTextToday: { color: tokens.accent.base, fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: tokens.semantic.warning },
});
