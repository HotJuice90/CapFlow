import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useData } from '@/state/DataContext';
import type { CurrencyCode } from '@/domain/types';
import { tokens } from '@/theme';
import { CURRENCY_SYMBOL } from '@/format';
import { timeAgo } from '@/format/date';
import { tapBuzz } from '@/lib/haptics';
import { Flag } from '@/components/Flag';
import { openCurrencyPicker } from '@/lib/currencyPicker';
import { ScreenTitle } from '@/components/ScreenTitle';

// ─── Constants ────────────────────────────────────────────────────────────────

// Порядок строго как в макете Figma (node 255-2981)
const ALL_CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'KZT', 'BYN', 'CNY', 'INR', 'AED', 'BRL', 'ARS'];
const HIST_TABS: CurrencyCode[] = ['USD', 'EUR', 'TRY', 'KZT'];

const CURRENCY_NAME: Record<CurrencyCode, string> = {
  RUB: 'Российский рубль',
  USD: 'Доллар США',
  EUR: 'Евро',
  TRY: 'Турецкая лира',
  KZT: 'Казахстанский тенге',
  BYN: 'Белорусский рубль',
  CNY: 'Китайский юань',
  INR: 'Индийская рупия',
  AED: 'Дирхам ОАЭ',
  BRL: 'Бразильский реал',
  ARS: 'Аргентинское песо',
};

const CHART_LINE = '#6B7ECB';
const CHART_FILL = '#7D90C7';

const D = {
  bg1: '#F2F4F9', bg2: '#E0EDF4', bg3: '#F5F7FF',
  sourceText: '#2B2B2B', sourceLabel: '#909497',
  placeholder: 'rgba(144,148,151,0.45)',
  rateHint: '#7D90C7',
  updated: 'rgba(33,33,33,0.3)',
  bigRate: '#5C667B',
  resetBg: '#A8B6E2', resetBorder: '#E2EDF8',
  chipBg: '#F7F7F7',
  divider: '#EAECF2',
  tabBarBg: 'rgba(215,226,235,0.5)',
  tabActiveBg: '#A8B6E2',
  badgeNeg: '#C11818', badgeNegBg: 'rgba(229,139,139,0.1)',
  badgePos: '#1A8A1A', badgePosBg: 'rgba(139,229,139,0.1)',
};

type Slots = [CurrencyCode, CurrencyCode, CurrencyCode];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toRub(amount: number, c: CurrencyCode, rates: Record<CurrencyCode, number>): number {
  return amount * (rates[c] ?? 1);
}
function fromRub(rub: number, c: CurrencyCode, rates: Record<CurrencyCode, number>): number {
  const r = rates[c] ?? 1;
  return r > 0 ? rub / r : 0;
}
function convert(amount: number, from: CurrencyCode, to: CurrencyCode, rates: Record<CurrencyCode, number>): number {
  return fromRub(toRub(amount, from, rates), to, rates);
}

/** Форматированное значение для показа (с разделителями тысяч). */
function displayAmount(value: number): string {
  if (!isFinite(value) || value === 0) return '0';
  const s = value < 0.01 ? value.toFixed(4) : value.toFixed(2).replace(/\.?0+$/, '');
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${grouped},${dec}` : grouped;
}

/** Голая редактируемая строка (без группировки), '' для нуля. */
function toEditable(value: number): string {
  if (!isFinite(value) || value === 0) return '';
  const s = value < 0.01 ? value.toFixed(4) : value.toFixed(2).replace(/\.?0+$/, '');
  return s.replace('.', ',');
}

function parseRaw(text: string): number {
  return parseFloat(text.replace(/\s/g, '').replace(',', '.')) || 0;
}

/** Не даём выбрать одинаковые валюты: конфликтный слот получает первую свободную. */
function resolveDuplicates(next: Slots, changedIdx: number): Slots {
  for (let j = 0; j < 3; j++) {
    if (j !== changedIdx && next[j] === next[changedIdx]) {
      const used = next.filter((_, k) => k !== j);
      const free = ALL_CURRENCIES.find((c) => !used.includes(c)) ?? next[j];
      next[j] = free;
    }
  }
  return next;
}

// ─── Area Chart (всегда синий, уходит в прозрачность, без нижней границы) ──────

/** Гладкая кривая через точки — монотонный кубический сплайн (Фрица–Карлсона):
 *  не выскакивает за пределы данных и не делает «рывков», как Q-Безье через середины. */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return '';
  // секущие наклоны
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    dy[i] = pts[i + 1].y - pts[i].y;
    m[i] = dy[i] / (dx[i] || 1);
  }
  // касательные в точках
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else t[i] = (m[i - 1] + m[i]) / 2;
  }
  // ограничение монотонности
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i];
    const h = Math.hypot(a, b);
    if (h > 3) { const s = 3 / h; t[i] = s * a * m[i]; t[i + 1] = s * b * m[i]; }
  }
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i].x + dx[i] / 3;
    const y1 = pts[i].y + (t[i] * dx[i]) / 3;
    const x2 = pts[i + 1].x - dx[i] / 3;
    const y2 = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C ${x1.toFixed(2)} ${y1.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

function AreaChart({ data, width, height }: { data: number[]; width: number; height: number }) {
  if (data.length < 2) return null;
  const dataMin = Math.min(...data);
  const dataMax = Math.max(...data);
  const span = (dataMax - dataMin) || 1;
  // Воздух сверху и снизу: данные занимают ~70% высоты — колебания пологие, не пики.
  const headroom = span * 0.21;
  const lo = dataMin - headroom;
  const range = span + headroom * 2;
  const pad = 7;

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - pad - ((v - lo) / range) * (height - pad * 2),
  }));

  const linePath = monotonePath(pts);
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        {/* Мягкий fill: затухает до самого низа (offset 1) — без видимого шва-перехода */}
        <SvgLinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={CHART_FILL} stopOpacity="0.7" />
          <Stop offset="0.45" stopColor={CHART_FILL} stopOpacity="0.28" />
          <Stop offset="0.75" stopColor={CHART_FILL} stopOpacity="0.08" />
          <Stop offset="1" stopColor={CHART_FILL} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      <G opacity={0.4}>
        <Path d={areaPath} fill="url(#chartFill)" />
        <Path d={linePath} stroke={CHART_LINE} strokeWidth={1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

// ─── Currency pill (flag + code + chevron) ────────────────────────────────────

function CurrencyPill({ currency, large = false, onPress }: {
  currency: CurrencyCode; large?: boolean; onPress?: () => void;
}) {
  return (
    <Pressable style={[s.pill, large && s.pillLg]} onPress={onPress} hitSlop={8}>
      <Flag code={currency} size={large ? 32 : 28} />
      <Text style={[s.pillCode, large && s.pillCodeLg]}>{currency}</Text>
      <MaterialIcons name="keyboard-arrow-down" size={large ? 14 : 12} color="rgba(33,33,33,0.45)" />
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const DEFAULT_SLOTS: Slots = ['RUB', 'USD', 'EUR'];
const SLOTS_KEY = 'converter_slots';

export default function ConverterScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { data, refreshRates, backfillRateHistory } = useData();

  const [slots, setSlots] = useState<Slots>(DEFAULT_SLOTS);
  const [activeIdx, setActiveIdx] = useState(0);
  const [amountText, setAmountText] = useState(''); // текст в активном поле; '' = плейсхолдер
  const [histTab, setHistTab] = useState<CurrencyCode>('USD');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);
  const [topCardH, setTopCardH] = useState(114);
  const [chartH, setChartH] = useState(220);
  const [histPeriod, setHistPeriod] = useState<'day' | 'month'>('day');

  const refs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];
  const rates = data.rates as Record<CurrencyCode, number>;

  useEffect(() => {
    AsyncStorage.getItem(SLOTS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as Slots;
        if (Array.isArray(saved) && saved.length === 3) setSlots(saved);
      } catch {}
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  }, [slots]);

  // Период истории курса не запоминаем — при каждом возврате на вкладку
  // (не только при первом монтировании — таб-экраны не размонтируются)
  // сбрасываем на «День».
  useFocusEffect(useCallback(() => { setHistPeriod('day'); }, []));

  const activeAmount = useMemo(() => parseRaw(amountText), [amountText]);
  const isEmpty = activeAmount === 0;

  // Значение для конкретного поля: активное — сырой текст, остальные — пересчёт.
  const valueFor = (idx: number): number =>
    idx === activeIdx ? activeAmount : convert(activeAmount, slots[activeIdx], slots[idx], rates);

  const fieldText = (idx: number): string => {
    if (idx === activeIdx) return amountText;
    return isEmpty ? '' : displayAmount(valueFor(idx));
  };

  const handleChange = (idx: number, text: string) => {
    if (idx !== activeIdx) setActiveIdx(idx);
    setAmountText(text.replace(/[^\d.,]/g, ''));
  };

  const handleFocus = (idx: number) => {
    if (idx === activeIdx) return;
    // переносим текущее значение в фокусируемое поле (в его валюте)
    setAmountText(toEditable(valueFor(idx)));
    setActiveIdx(idx);
  };

  const resetAmounts = () => {
    tapBuzz();
    setAmountText('');
    setActiveIdx(0);
  };

  const openPicker = (slotIdx: number) => {
    openCurrencyPicker((code) => {
      setSlots((prev) => {
        const next = [...prev] as Slots;
        next[slotIdx] = code;
        return resolveDuplicates(next, slotIdx);
      });
    }, slots[slotIdx]);
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try { await refreshRates(); } catch {} finally { setRefreshing(false); }
  };

  const doBackfill = async () => {
    setLoadingHist(true);
    try { await backfillRateHistory(); } catch {} finally { setLoadingHist(false); }
  };

  // Окно «последний месяц»: ровно 30 календарных дней назад от сегодня.
  // Если start попадает на выходной — берём последнюю пятницу до него (курс ЦБ
  // на пятницу действует и в выходные → сопоставимо с источниками вроде Яндекса).
  const { histSnaps, all } = useMemo(() => {
    const p = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const today = new Date();
    // Ровно «месяц назад» (как у Яндекса): 30.06 → 30.05. setDate(-30) даёт 31.05
    // из-за арифметики «день 0», поэтому только setMonth(-1).
    const start = new Date(today);
    start.setMonth(start.getMonth() - 1);
    const startIso = toIso(start);

    const allSnaps = data.ratesHistory.filter((s) => typeof s.rates[histTab] === 'number');
    const inWindow = allSnaps.filter((s) => s.date >= startIso);
    // последняя точка ДО окна = курс «на дату старта» (пятница перед выходными)
    const baseBefore = [...allSnaps].reverse().find((s) => s.date < startIso);
    const snaps =
      baseBefore && (!inWindow.length || inWindow[0].date !== baseBefore.date)
        ? [{ ...baseBefore, date: startIso }, ...inWindow]
        : inWindow;

    return { histSnaps: snaps, all: allSnaps };
  }, [data.ratesHistory, histTab]);

  const histSeries = histSnaps.map((snap) => snap.rates[histTab] as number);
  const hasHistory = histSeries.length >= 2;

  // Бейдж изменения — переключается тапом по иконке слева между «за сутки»
  // (последнее обновление ЦБ vs предыдущее) и «за месяц» (весь видимый график).
  const dayPrev = all[all.length - 2]?.rates[histTab];
  const dayLast = all[all.length - 1]?.rates[histTab];
  const monthFirst = histSeries[0];
  const monthLast = histSeries[histSeries.length - 1];

  const histFirst = (histPeriod === 'day' ? dayPrev : monthFirst) ?? 0;
  const histLast = (histPeriod === 'day' ? dayLast : monthLast) ?? 0;
  const histDelta = histLast - histFirst;
  const histPct = histFirst > 0 ? (histDelta / histFirst) * 100 : 0;
  const histRateUp = histLast > histFirst; // курс валюты вырос — стрелка ▲, вне зависимости от смысла для рубля
  const histRubbleUp = histLast < histFirst; // рубль крепнет, когда валюта дешевеет — определяет ТОЛЬКО цвет

  const rateLabel = (c: CurrencyCode) =>
    `1 ${CURRENCY_SYMBOL[c]} = ${displayAmount(rates[c] ?? 0)} ${CURRENCY_SYMBOL.RUB}`;

  // Поле ввода (используется и для верхней карточки, и для нижних столбцов)
  const AmountInput = (idx: number, big: boolean) => (
    <TextInput
      ref={refs[idx]}
      style={big ? s.bigInput : s.colInput}
      value={fieldText(idx)}
      onChangeText={(t) => handleChange(idx, t)}
      onFocus={() => handleFocus(idx)}
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor={D.placeholder}
      selectionColor={D.resetBg}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[D.bg1, D.bg2, D.bg3]}
        locations={[0.027, 0.565, 0.992]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={{ flex: 1, paddingTop: 80, paddingHorizontal: 16, paddingBottom: insets.bottom + 66 }}
      >
        <ScreenTitle>Конвертер</ScreenTitle>

        {/* ── Карточки (поле 0 сверху, поля 1|2 снизу) + кнопка сброса ── */}
        <View style={s.cardsBlock}>
          {/* Верхнее поле */}
          <Pressable
            style={s.topCard}
            onPress={() => refs[0].current?.focus()}
            onLayout={(e) => setTopCardH(e.nativeEvent.layout.height)}
          >
            <View style={s.topLeft}>
              <Text style={s.topLabel}>{CURRENCY_NAME[slots[0]]}</Text>
              {AmountInput(0, true)}
            </View>
            <CurrencyPill currency={slots[0]} large onPress={() => openPicker(0)} />
          </Pressable>

          {/* Нижние два поля */}
          <View style={s.bottomCard}>
            <Pressable style={s.col} onPress={() => refs[1].current?.focus()}>
              <CurrencyPill currency={slots[1]} onPress={() => openPicker(1)} />
              {AmountInput(1, false)}
              <Text style={s.rateHint}>{rateLabel(slots[1])}</Text>
            </Pressable>

            <View style={s.divider} />

            <Pressable style={s.col} onPress={() => refs[2].current?.focus()}>
              <CurrencyPill currency={slots[2]} onPress={() => openPicker(2)} />
              {AmountInput(2, false)}
              <Text style={s.rateHint}>{rateLabel(slots[2])}</Text>
            </Pressable>
          </View>

          {/* Кнопка сброса показаний */}
          <Pressable style={[s.resetBtn, { top: topCardH - 22 }]} onPress={resetAmounts} hitSlop={8}>
            <MaterialIcons name="close" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* ── Строка обновления ── */}
        <View style={s.footerRow}>
          <Text style={s.updatedText}>Курс: ЦБ РФ</Text>
          <Pressable style={s.footerRight} onPress={doRefresh} disabled={refreshing}>
            <Text style={s.updatedText}>
              {refreshing ? 'Обновляю…' : `Обновлено: ${data.ratesUpdatedAt ? timeAgo(data.ratesUpdatedAt) : '—'}`}
            </Text>
            <MaterialIcons name="refresh" size={13} color={D.updated} />
          </Pressable>
        </View>

        {/* ── Динамика курса ── */}
        <View style={s.histSection}>
          <Text style={s.histTitle}>Динамика курса</Text>

          <View style={s.histHeaderRow}>
            <View style={s.tabBar}>
              {HIST_TABS.map((c) => (
                <Pressable
                  key={c}
                  style={[s.tab, histTab === c && s.tabActive]}
                  onPress={() => { tapBuzz(); setHistTab(c); }}
                >
                  <Text style={[s.tabText, histTab === c && s.tabTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.bigRate}>{displayAmount(rates[histTab] ?? 0)} {CURRENCY_SYMBOL.RUB}</Text>
          </View>

          {hasHistory && (
            <View style={s.subRow}>
              <Pressable
                style={s.periodToggle}
                onPress={() => { tapBuzz(); setHistPeriod((p) => (p === 'day' ? 'month' : 'day')); }}
                hitSlop={8}
              >
                <MaterialIcons name="swap-horiz" size={16} color={D.updated} />
                <Text style={s.periodToggleText}>{histPeriod === 'day' ? 'День' : 'Месяц'}</Text>
              </Pressable>
              <View style={[s.badge, { backgroundColor: histRubbleUp ? D.badgePosBg : D.badgeNegBg }]}>
                <Text style={[s.badgeText, { color: histRubbleUp ? D.badgePos : D.badgeNeg }]}>
                  {histRateUp ? '▲' : '▼'} {displayAmount(Math.abs(histDelta))} {CURRENCY_SYMBOL.RUB} · {Math.abs(histPct).toFixed(1).replace('.', ',')}%
                </Text>
              </View>
            </View>
          )}

          {/* График — во всю ширину экрана, как фоновый. Высота — что осталось до низа. */}
          <View
            style={[s.chartWrap, { marginHorizontal: -16, width: screenW }]}
            onLayout={(e) => setChartH(e.nativeEvent.layout.height)}
          >
            {hasHistory ? (
              <AreaChart data={histSeries} width={screenW} height={Math.max(120, chartH)} />
            ) : (
              <View style={s.emptyChart}>
                <Text style={s.emptyChartText}>
                  График появится по мере ежедневных обновлений.{'\n'}Можно загрузить сразу историю за 30 дней.
                </Text>
                <Pressable style={s.loadHistBtn} onPress={doBackfill} disabled={loadingHist}>
                  {loadingHist
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <MaterialIcons name="download" size={18} color="#FFF" />}
                  <Text style={s.loadHistBtnText}>{loadingHist ? 'Загружаю…' : 'Загрузить историю'}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  cardsBlock: { gap: 6, position: 'relative' },

  // Верхняя карточка
  topCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0px 4px 14px rgba(48,69,62,0.08)',
  },
  topLeft: { flex: 1, gap: 16, paddingRight: 12 },
  topLabel: { fontSize: 14, fontFamily: 'Onest_500Medium', color: D.sourceLabel },
  bigInput: {
    fontSize: 36, fontFamily: 'Onest_600SemiBold', color: D.sourceText,
    letterSpacing: -0.72, padding: 0,
  },

  // Нижняя карточка (2 столбца + дивайдер)
  bottomCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'stretch',
    boxShadow: '0px 4px 14px rgba(48,69,62,0.08)',
  },
  col: { flex: 1, gap: 14 },
  colInput: {
    fontSize: 28, fontFamily: 'Onest_600SemiBold', color: '#212121',
    letterSpacing: -0.56, padding: 0,
  },
  divider: { width: 1, backgroundColor: D.divider, marginHorizontal: 16, alignSelf: 'stretch' },
  rateHint: { fontSize: 13, fontFamily: 'Onest_600SemiBold', color: D.rateHint },

  // Кнопка сброса
  resetBtn: {
    position: 'absolute', right: 0,
    backgroundColor: D.resetBg, borderWidth: 6, borderColor: D.resetBorder,
    borderRadius: 35, padding: 8, zIndex: 10,
  },

  // Чип валюты
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: D.chipBg, borderRadius: 35,
    paddingLeft: 4, paddingRight: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  pillLg: { gap: 8 },
  pillCode: {
    fontSize: 14, fontFamily: 'Onest_500Medium', color: '#212121',
    textTransform: 'uppercase', letterSpacing: -0.56,
  },
  pillCodeLg: { fontSize: 16, letterSpacing: -0.64 },

  // Строка обновления
  footerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, marginTop: 10,
  },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updatedText: { fontSize: 13, fontFamily: 'Onest_400Regular', color: D.updated, letterSpacing: -0.26 },

  // История
  histSection: { marginTop: 40, flex: 1 },
  histTitle: { fontSize: 24, fontFamily: 'Onest_600SemiBold', color: '#212121', letterSpacing: -0.24, marginBottom: 12 },
  histHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  periodToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingVertical: 4 },
  periodToggleText: { fontSize: 13, fontFamily: 'Onest_400Regular', color: D.updated, letterSpacing: -0.26 },
  tabBar: { flexDirection: 'row', backgroundColor: D.tabBarBg, borderRadius: 35, padding: 1 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 35 },
  tabActive: { backgroundColor: D.tabActiveBg },
  tabText: {
    fontSize: 14, fontFamily: 'Onest_500Medium', textTransform: 'uppercase',
    letterSpacing: -0.56, color: 'rgba(33,33,33,0.5)',
  },
  tabTextActive: { color: '#FFFFFF' },
  bigRate: { fontSize: 24, lineHeight: 24, fontFamily: 'Onest_600SemiBold', color: D.bigRate },
  badge: {
    borderRadius: 35, padding: 8, gap: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 14, lineHeight: 14, fontFamily: 'Onest_500Medium', letterSpacing: -0.14 },

  // График
  chartWrap: { marginTop: 0, overflow: 'hidden', flex: 1 },
  emptyChart: { paddingHorizontal: 16, paddingVertical: 28, alignItems: 'center' },
  emptyChartText: {
    fontSize: 13, fontFamily: 'Onest_400Regular',
    color: tokens.text.secondary, textAlign: 'center', lineHeight: 20, marginBottom: 16,
  },
  loadHistBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: D.resetBg, borderRadius: 35, paddingHorizontal: 20, paddingVertical: 12,
  },
  loadHistBtnText: { color: '#FFF', fontFamily: 'Onest_700Bold', fontSize: 14 },
});
