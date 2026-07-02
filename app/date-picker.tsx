import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { WEEKDAYS, buildIso } from '@/components/MonthCalendar';
import { getDatePickerConfig, pickDateValue } from '@/lib/datePicker';
import { tapBuzz } from '@/lib/haptics';
import { tokens, font } from '@/theme';

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const YEAR_ITEM_HEIGHT = 48;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function firstWeekdayMon(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
function todayIso(): string {
  const d = new Date();
  return buildIso(d.getFullYear(), d.getMonth(), d.getDate());
}
function chipLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return `${WEEKDAYS[dow]}, ${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/**
 * JS-driven bottom sheet (Modal + Animated), а не native formSheet — на Android
 * нативный formSheet дёргает высоту при смене числа строк сетки (5↔6 недель).
 * Здесь высота — обычный layout RN, меняется без скачков «дыры» под шитом.
 */
export default function DatePickerSheet() {
  const insets = useSafeAreaInsets();
  const cfg = getDatePickerConfig();
  const today = todayIso();
  const initial = cfg?.value ?? today;

  const [year, setYear] = useState(Number(initial.slice(0, 4)));
  const [month, setMonth] = useState(Number(initial.slice(5, 7)) - 1);
  const [selected, setSelected] = useState(initial);
  const [yearMode, setYearMode] = useState(false);
  const [pendingYear, setPendingYear] = useState(year);

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(1)).current; // 1 = за экраном, 0 = на месте

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = (after?: () => void) => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => { after?.(); router.back(); });
  };

  // Свайп вниз — закрываем. yearModeRef нужен, потому что PanResponder.create
  // вызывается один раз и держит первый замык, а не текущий стейт.
  const yearModeRef = useRef(yearMode);
  yearModeRef.current = yearMode;

  const onDragMove = (_: unknown, g: { dy: number }) => { if (g.dy > 0) slide.setValue(g.dy / 500); };
  const onDragRelease = (_: unknown, g: { dy: number; vy: number }) => {
    if (g.dy > 120 || g.vy > 0.8) dismiss();
    else Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };

  // Грабер — цепляет жест сразу по касанию (как раньше, самый отзывчивый вариант).
  const grabberPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: onDragMove,
      onPanResponderRelease: onDragRelease,
    }),
  ).current;

  // Остальной шит (кроме колеса года — там своя прокрутка) — забирает жест
  // только по явному движению вниз, чтобы не ломать тапы по дням/кнопкам.
  const bodyPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        !yearModeRef.current && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: onDragMove,
      onPanResponderRelease: onDragRelease,
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  useEffect(() => {
    if (!cfg) router.back();
  }, [cfg]);
  if (!cfg) return null;

  const cells: (number | null)[] = [];
  const fw = firstWeekdayMon(year, month);
  const dim = daysInMonth(year, month);
  for (let i = 0; i < fw; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const pickDay = (day: number) => {
    tapBuzz();
    setSelected(buildIso(year, month, day));
  };

  const confirm = () => dismiss(() => { tapBuzz(); pickDateValue(selected); });
  const cancel = () => dismiss();

  // В режиме выбора года кнопки футера применяют/отменяют ГОД, а не весь шит.
  const onFooterCancel = () => { if (yearMode) setYearMode(false); else cancel(); };
  const onFooterOk = () => {
    if (yearMode) { tapBuzz(); setYear(pendingYear); setYearMode(false); }
    else confirm();
  };
  const openYearMode = () => { setPendingYear(year); setYearMode(true); };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 500] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={cancel}>
      <View style={s.root}>
        <Animated.View style={[s.overlay, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cancel} />
        </Animated.View>

        <Animated.View
          style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 12, transform: [{ translateY }] }]}
          {...bodyPan.panHandlers}
        >
          <View style={s.dragZone} {...grabberPan.panHandlers}>
            <View style={s.grabber} />
          </View>

          <View style={s.headRow}>
            <Text style={s.title}>{cfg.title}</Text>
            <View style={s.chip}>
              <Text style={s.chipText}>{chipLabel(selected)}</Text>
            </View>
          </View>

          {yearMode ? (
            <YearWheel
              year={pendingYear}
              onSettle={setPendingYear}
              onPick={(y) => { tapBuzz(); setYear(y); setYearMode(false); }}
            />
          ) : (
            <View>
              <View style={s.monthRow}>
                <Pressable onPress={prevMonth} hitSlop={12} style={s.navBtn}>
                  <MaterialIcons name="chevron-left" size={22} color={tokens.accent.base} />
                </Pressable>
                <Pressable onPress={openYearMode} hitSlop={8} style={s.monthTitleWrap}>
                  <Text style={s.monthTitle}>{MONTHS_NOMINATIVE[month]} {year}</Text>
                  <MaterialIcons name="arrow-drop-down" size={20} color={tokens.text.tertiary} />
                </Pressable>
                <Pressable onPress={nextMonth} hitSlop={12} style={s.navBtn}>
                  <MaterialIcons name="chevron-right" size={22} color={tokens.accent.base} />
                </Pressable>
              </View>

              <View style={s.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={w} style={[s.weekday, i >= 5 && s.weekend]}>{w}</Text>
                ))}
              </View>

              <View style={s.grid}>
                {cells.map((day, idx) => {
                  if (day === null) return <View key={idx} style={s.cell} />;
                  const dayIso = buildIso(year, month, day);
                  const isSelected = dayIso === selected;
                  const isToday = dayIso === today;
                  const isWeekend = idx % 7 >= 5;
                  return (
                    <Pressable key={idx} style={s.cell} onPress={() => pickDay(day)}>
                      <View style={[s.dayCircle, isSelected && s.daySelected, !isSelected && isToday && s.dayToday]}>
                        <Text style={[s.dayText, isWeekend && !isSelected && s.weekend, isSelected && s.dayTextSelected]}>
                          {day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={s.footer}>
            <Pressable onPress={onFooterCancel} hitSlop={8}>
              <Text style={s.cancelText}>Отмена</Text>
            </Pressable>
            <Pressable onPress={onFooterOk} hitSlop={8}>
              <Text style={s.okText}>OK</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Колесо года в духе Apple: прокрутка ничего не применяет сама по себе — только
 * двигает подсветку (opacity/scale — нативный драйвер, без стейта на каждый
 * кадр, поэтому гладко). Значение фиксируется кнопкой OK либо прямым тапом.
 */
function YearWheel({ year, onSettle, onPick }: { year: number; onSettle: (y: number) => void; onPick: (y: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const minYear = new Date().getFullYear() - 60;
  const maxYear = new Date().getFullYear() + 20;
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);
  const selectedIndex = year - minYear;

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * YEAR_ITEM_HEIGHT, animated: false });
    }, 10);
    return () => clearTimeout(t);
  }, [selectedIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / YEAR_ITEM_HEIGHT);
    onSettle(minYear + Math.max(0, Math.min(years.length - 1, idx)));
  };

  return (
    <View style={s.wheelWrap}>
      <View pointerEvents="none" style={s.wheelBand} />
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={YEAR_ITEM_HEIGHT}
        decelerationRate="fast"
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: YEAR_ITEM_HEIGHT * 2 }}
      >
        {years.map((y, i) => {
          const center = i * YEAR_ITEM_HEIGHT;
          const inputRange = [center - YEAR_ITEM_HEIGHT * 2, center - YEAR_ITEM_HEIGHT, center, center + YEAR_ITEM_HEIGHT, center + YEAR_ITEM_HEIGHT * 2];
          const opacity = scrollY.interpolate({ inputRange, outputRange: [0.14, 0.4, 1, 0.4, 0.14], extrapolate: 'clamp' });
          const scale = scrollY.interpolate({ inputRange, outputRange: [0.72, 0.85, 1.15, 0.85, 0.72], extrapolate: 'clamp' });
          return (
            <Pressable key={y} style={s.wheelItem} onPress={() => onPick(y)}>
              <Animated.Text style={[s.wheelText, { opacity, transform: [{ scale }] }]}>{y}</Animated.Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,30,28,0.45)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  dragZone: { paddingVertical: 10, marginBottom: 8, marginTop: -8 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E8EE', alignSelf: 'center' },

  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: '#212121' },
  chip: { backgroundColor: tokens.accent.soft, borderRadius: tokens.radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: tokens.accent.base },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.accent.soft, alignItems: 'center', justifyContent: 'center' },
  monthTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  monthTitle: { fontFamily: font.semibold, fontSize: 17, color: '#212121' },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontFamily: font.semibold, fontSize: 11, color: tokens.text.tertiary },
  weekend: { color: '#D48CA6' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: tokens.accent.base, borderRadius: 19 },
  dayToday: { borderWidth: 1.5, borderColor: tokens.accent.base, borderRadius: 19 },
  dayText: { fontFamily: font.medium, fontSize: 15, color: '#212121' },
  dayTextSelected: { fontFamily: font.semibold, color: '#FFFFFF' },

  wheelWrap: { height: YEAR_ITEM_HEIGHT * 5, justifyContent: 'center' },
  wheelBand: {
    position: 'absolute', left: 0, right: 0, top: YEAR_ITEM_HEIGHT * 2, height: YEAR_ITEM_HEIGHT,
    borderRadius: 14, backgroundColor: tokens.accent.soft, borderWidth: 1, borderColor: tokens.accent.light,
  },
  wheelItem: { height: YEAR_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontFamily: font.semibold, fontSize: 20, color: tokens.accent.base },

  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 24,
    marginTop: 8,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#EAF2F9',
  },
  cancelText: { fontFamily: font.medium, fontSize: 15, color: tokens.text.tertiary },
  okText: { fontFamily: font.semibold, fontSize: 15, color: tokens.accent.base },
});
