import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
import { analyticsSummary } from '@/state/selectors';
import type { CurrencyCode } from '@/domain/types';
import { tokens, hexToRgba } from '@/theme';
import { CURRENCY_SYMBOL, formatMoney, formatPercent } from '@/format';
import { timeAgo } from '@/format/date';
import { calcTax } from '@/calc';
import { tapBuzz } from '@/lib/haptics';
import { Flag } from '@/components/Flag';
import { openCurrencyPicker } from '@/lib/currencyPicker';
import { ScreenTitle } from '@/components/ScreenTitle';

// ─── Constants ────────────────────────────────────────────────────────────────

// Порядок строго как в макете Figma (node 255-2981)
const ALL_CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'KZT', 'BYN', 'CNY', 'INR', 'AED', 'BRL', 'ARS'];

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
  updated: hexToRgba(tokens.text.primary, 0.3),
  bigRate: '#5C667B',
  resetBg: tokens.accent.light, resetBorder: '#E2EDF8',
  chipBg: '#F7F7F7',
  divider: '#EAECF2',
  tabBarBg: tokens.surface.tabOff,
  tabActiveBg: tokens.accent.light,
  badgeNeg: '#C11818', badgeNegBg: 'rgba(229,139,139,0.1)',
  badgePos: '#1A8A1A', badgePosBg: 'rgba(139,229,139,0.1)',
  badgeNeutral: '#7A828E', badgeNeutralBg: 'rgba(122,130,142,0.1)',
};

// ─── Калькулятор вклада ─────────────────────────────────────────────────────
const DEP_PERIODS: { label: string; days: number }[] = [
  { label: '7 дней', days: 7 },
  { label: '1 мес', days: 30 },
  { label: '3 мес', days: 91 },
  { label: '6 мес', days: 182 },
  { label: '1 год', days: 365 },
];

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

function CurrencyPill({ currency, large = false, editable = true, onPress }: {
  currency: CurrencyCode; large?: boolean; editable?: boolean; onPress?: () => void;
}) {
  return (
    <Pressable style={[s.pill, large && s.pillLg]} onPress={editable ? onPress : undefined} hitSlop={8}>
      <Flag code={currency} size={large ? 32 : 28} />
      <Text style={[s.pillCode, large && s.pillCodeLg]}>{currency}</Text>
      {editable ? (
        <MaterialIcons name="keyboard-arrow-down" size={large ? 14 : 12} color={hexToRgba(tokens.text.primary, 0.45)} />
      ) : null}
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

  const [mode, setMode] = useState<'currency' | 'deposit'>('currency');

  const [slots, setSlots] = useState<Slots>(() =>
    resolveDuplicates([data.settings.defaultCurrency, DEFAULT_SLOTS[1], DEFAULT_SLOTS[2]], 0),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [amountText, setAmountText] = useState(''); // текст в активном поле; '' = плейсхолдер
  const [histTab, setHistTab] = useState<CurrencyCode>('USD');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);
  const [topCardH, setTopCardH] = useState(114);
  const [chartH, setChartH] = useState(220);
  const [histPeriod, setHistPeriod] = useState<'day' | 'month'>('day');

  // Калькулятор вклада — сумма/ставка вводятся вручную (не привязаны к
  // реальной площадке), срок — пресетами. Ставка по умолчанию = текущая
  // ключевая, разумная отправная точка для прикидки.
  const [depAmountText, setDepAmountText] = useState('100000');
  const [depRateText, setDepRateText] = useState(() => String(data.params.keyRate).replace('.', ','));
  const [depDays, setDepDays] = useState(30);

  const refs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];
  const rates = data.rates as Record<CurrencyCode, number>;
  const base = data.settings.defaultCurrency;
  // Основную валюту из табов не показываем — курс «сам к себе» не нужен;
  // порядок как везде — из общего списка валют.
  const histTabs = useMemo(() => ALL_CURRENCIES.filter((c) => c !== base), [base]);

  useEffect(() => {
    AsyncStorage.getItem(SLOTS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as Slots;
        // Первый слот не восстанавливаем из сохранённого — он всегда привязан
        // к основной валюте из настроек, а не к тому, что было выбрано раньше.
        if (Array.isArray(saved) && saved.length === 3) {
          setSlots(resolveDuplicates([data.settings.defaultCurrency, saved[1], saved[2]], 0));
        }
      } catch {}
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  }, [slots]);

  // Держим первый слот синхронным с основной валютой — если её меняют в
  // настройках (в т.ч. с экрана «Валюты и курсы»), верхнее поле следует за ней.
  useEffect(() => {
    setSlots((prev) => {
      if (prev[0] === data.settings.defaultCurrency) return prev;
      return resolveDuplicates([data.settings.defaultCurrency, prev[1], prev[2]], 0);
    });
  }, [data.settings.defaultCurrency]);

  // Период истории курса не запоминаем — при каждом возврате на вкладку
  // (не только при первом монтировании — таб-экраны не размонтируются)
  // сбрасываем на «День».
  useFocusEffect(useCallback(() => { setHistPeriod('day'); }, []));

  // Выбранный таб совпал с основной валютой (её сменили в настройках) — переключаем на первый доступный.
  useEffect(() => {
    if (histTab === base) setHistTab(histTabs[0]);
  }, [base, histTab, histTabs]);

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

    const allSnaps = data.ratesHistory.filter(
      (s) => typeof s.rates[histTab] === 'number' && typeof s.rates[base] === 'number',
    );
    const inWindow = allSnaps.filter((s) => s.date >= startIso);
    // последняя точка ДО окна = курс «на дату старта» (пятница перед выходными)
    const baseBefore = [...allSnaps].reverse().find((s) => s.date < startIso);
    const snaps =
      baseBefore && (!inWindow.length || inWindow[0].date !== baseBefore.date)
        ? [{ ...baseBefore, date: startIso }, ...inWindow]
        : inWindow;

    return { histSnaps: snaps, all: allSnaps };
  }, [data.ratesHistory, histTab, base]);

  // Кросс-курс через ₽: histTab к базовой валюте, а не всегда к рублю.
  const crossOf = (snap: { rates: Partial<Record<CurrencyCode, number>> }): number =>
    (snap.rates[histTab] as number) / (snap.rates[base] as number);

  const histSeries = histSnaps.map(crossOf);
  const hasHistory = histSeries.length >= 2;

  // Бейдж изменения — переключается тапом по иконке слева между «за сутки»
  // (последнее обновление ЦБ vs предыдущее) и «за месяц» (весь видимый график).
  const dayPrev = all.length > 1 ? crossOf(all[all.length - 2]) : undefined;
  const dayLast = all.length > 0 ? crossOf(all[all.length - 1]) : undefined;
  const monthFirst = histSeries[0];
  const monthLast = histSeries[histSeries.length - 1];

  const histFirst = (histPeriod === 'day' ? dayPrev : monthFirst) ?? 0;
  const histLast = (histPeriod === 'day' ? dayLast : monthLast) ?? 0;
  const histDelta = histLast - histFirst;
  const histPct = histFirst > 0 ? (histDelta / histFirst) * 100 : 0;
  // ЦБ не публикует новый курс в выходные — курс, заданный в пятницу, держится
  // и в субботу-воскресенье-понедельник, поэтому «дневная» дельта иногда честно
  // нулевая. Красная стрелка «вниз» в этом случае выглядит как ошибка — показываем
  // нейтральное «без изменений» вместо направления.
  const histFlat = histDelta === 0;
  const histRateUp = histLast > histFirst; // курс валюты вырос — стрелка ▲, вне зависимости от смысла для рубля
  const histRubbleUp = histLast < histFirst; // рубль крепнет, когда валюта дешевеет — определяет ТОЛЬКО цвет

  const rateLabel = (c: CurrencyCode) =>
    `1 ${CURRENCY_SYMBOL[c]} = ${displayAmount(rates[c] ?? 0)} ${CURRENCY_SYMBOL.RUB}`;

  // ── Калькулятор вклада: простой % (без капитализации — это прикидка, не
  // расчёт конкретного продукта), налог честный — с учётом реально уже
  // занятого лимита текущим портфелем (не с нуля).
  const depAmount = parseRaw(depAmountText);
  const depRate = parseRaw(depRateText);
  const depGross = depAmount * (depRate / 100) * (depDays / 365);
  const depLimitUsed = useMemo(() => analyticsSummary(data).selfAccrued, [data]);
  const depTax = calcTax(depGross, data.params, depLimitUsed);
  const depNet = depGross - depTax;

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
        style={{ flex: 1, paddingTop: tokens.spacing.screenTop, paddingHorizontal: 16, paddingBottom: insets.bottom + 66 }}
      >
        <ScreenTitle>Калькулятор</ScreenTitle>

        {/* ── Режим: валюты / вклад — на всю ширину, текстом (иконки-кружки
            терялись на фоне карточек, тут акцент виден однозначно) ── */}
        <View style={s.modeBar}>
          {([
            { key: 'currency' as const, label: 'Валюты' },
            { key: 'deposit' as const, label: 'Вклад' },
          ]).map(({ key, label }) => (
            <Pressable
              key={key}
              style={[s.modeTab, mode === key && s.modeTabActive]}
              onPress={() => { if (mode !== key) { tapBuzz(); setMode(key); } }}
            >
              <Text style={[s.modeTabText, mode === key && s.modeTabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'currency' ? (
        <>
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
            <CurrencyPill currency={slots[0]} large editable={false} />
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
            <MaterialIcons name="close" size={20} color={tokens.text.inverse} />
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
            <View style={s.tabBarClip}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
                {histTabs.map((c) => (
                  <Pressable
                    key={c}
                    style={[s.tab, histTab === c && s.tabActive]}
                    onPress={() => { tapBuzz(); setHistTab(c); }}
                  >
                    <Text style={[s.tabText, histTab === c && s.tabTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <Text style={s.bigRate}>{displayAmount((rates[histTab] ?? 0) / (rates[base] ?? 1))} {CURRENCY_SYMBOL[base]}</Text>
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
              <View style={[s.badge, { backgroundColor: histFlat ? D.badgeNeutralBg : histRubbleUp ? D.badgePosBg : D.badgeNegBg }]}>
                <Text style={[s.badgeText, { color: histFlat ? D.badgeNeutral : histRubbleUp ? D.badgePos : D.badgeNeg }]}>
                  {histFlat ? '–' : histRateUp ? '▲' : '▼'} {displayAmount(Math.abs(histDelta))} {CURRENCY_SYMBOL[base]} · {Math.abs(histPct).toFixed(1).replace('.', ',')}%
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
                    ? <ActivityIndicator size="small" color={tokens.text.inverse} />
                    : <MaterialIcons name="download" size={18} color={tokens.text.inverse} />}
                  <Text style={s.loadHistBtnText}>{loadingHist ? 'Загружаю…' : 'Загрузить историю'}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
        </>
        ) : (
        <>
        {/* ── Калькулятор вклада ── */}
        <View style={s.cardsBlock}>
          <View style={s.topCard}>
            <View style={s.topLeft}>
              <Text style={s.topLabel}>Сумма</Text>
              <TextInput
                style={s.bigInput}
                value={depAmountText}
                onChangeText={(t) => setDepAmountText(t.replace(/[^\d.,]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={D.placeholder}
                selectionColor={D.resetBg}
              />
            </View>
            <Text style={s.depCurrencyStatic}>{CURRENCY_SYMBOL.RUB}</Text>
          </View>

          <View style={s.bottomCard}>
            <View style={s.col}>
              <Text style={s.depColLabel}>Ставка, % годовых</Text>
              <TextInput
                style={s.colInput}
                value={depRateText}
                onChangeText={(t) => setDepRateText(t.replace(/[^\d.,]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={D.placeholder}
                selectionColor={D.resetBg}
              />
            </View>

            <View style={s.divider} />

            <View style={s.col}>
              <Text style={s.depColLabel}>Срок</Text>
              <Text style={s.colInput}>{DEP_PERIODS.find((p) => p.days === depDays)?.label ?? `${depDays} дн.`}</Text>
            </View>
          </View>
        </View>

        {/* ── Срок — пресеты, тот же визуальный язык, что таб-бар валют выше ── */}
        <View style={s.depPeriodRow}>
          {DEP_PERIODS.map((p) => (
            <Pressable
              key={p.days}
              style={[s.depPeriodChip, depDays === p.days && s.depPeriodChipActive]}
              onPress={() => { tapBuzz(); setDepDays(p.days); }}
            >
              <Text style={[s.depPeriodChipText, depDays === p.days && s.depPeriodChipTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Прогноз — та же карточка «доход/налог/чисто», что на детали актива ── */}
        <View style={s.depResultCard}>
          <Text style={s.histTitle}>Прогноз</Text>
          <View style={s.depResultRow}>
            <DepCol
              icon="trending-up"
              iconColor="#586692"
              iconBg={tokens.accent.soft}
              label="Доход"
              value={formatMoney(Math.max(0, depGross), { currency: 'RUB', kopecks: 'hide' })}
            />
            <View style={s.depResultSep} />
            <DepCol
              icon="percent"
              iconColor="#C11818"
              iconBg={hexToRgba(tokens.semantic.negative, 0.12)}
              label="Налог"
              value={formatMoney(Math.max(0, depTax), { currency: 'RUB', kopecks: 'hide' })}
            />
            <View style={s.depResultSep} />
            <DepCol
              icon="account-balance-wallet"
              iconColor={tokens.semantic.positive}
              iconBg={hexToRgba(tokens.semantic.positive, 0.12)}
              label="Чистыми"
              value={formatMoney(Math.max(0, depNet), { currency: 'RUB', kopecks: 'hide' })}
              valueColor={tokens.semantic.positive}
            />
          </View>
          <Text style={s.depResultHint}>
            {depAmount > 0 && depRate > 0
              ? `${formatMoney(depAmount, { currency: 'RUB', kopecks: 'hide' })} под ${formatPercent(depRate, 1)} на ${DEP_PERIODS.find((p) => p.days === depDays)?.label ?? `${depDays} дн.`}`
              : 'Заполните сумму и ставку'}
          </Text>
        </View>
        </>
        )}
      </View>
    </View>
  );
}

function DepCol({
  icon, iconColor, iconBg, label, value, valueColor,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={s.depCol}>
      <View style={s.depColHead}>
        <View style={[s.depColIcon, { backgroundColor: iconBg }]}>
          <MaterialIcons name={icon} size={13} color={iconColor} />
        </View>
        <Text style={s.depColHeadLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[s.depColValue, valueColor ? { color: valueColor } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  cardsBlock: { gap: tokens.spacing.chip, position: 'relative' },

  // Верхняя карточка
  topCard: {
    backgroundColor: tokens.surface.white, borderRadius: 20, padding: tokens.spacing.sheet,
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
    backgroundColor: tokens.surface.white, borderRadius: 20, padding: tokens.spacing.sheet,
    flexDirection: 'row', alignItems: 'stretch',
    boxShadow: '0px 4px 14px rgba(48,69,62,0.08)',
  },
  col: { flex: 1, gap: 14 },
  colInput: {
    fontSize: 28, fontFamily: 'Onest_600SemiBold', color: tokens.text.primary,
    letterSpacing: -0.56, padding: 0,
  },
  divider: { width: 1, backgroundColor: D.divider, marginHorizontal: 16, alignSelf: 'stretch' },
  rateHint: { fontSize: 13, fontFamily: 'Onest_600SemiBold', color: D.rateHint },

  // Кнопка сброса
  resetBtn: {
    position: 'absolute', right: 0,
    backgroundColor: D.resetBg, borderWidth: 6, borderColor: D.resetBorder,
    borderRadius: tokens.radius.pill, padding: 8, zIndex: 10,
  },

  // Чип валюты
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.chip,
    backgroundColor: D.chipBg, borderRadius: tokens.radius.pill,
    paddingLeft: 4, paddingRight: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  pillLg: { gap: 8 },
  pillCode: {
    fontSize: 14, fontFamily: 'Onest_500Medium', color: tokens.text.primary,
    textTransform: 'uppercase', letterSpacing: -0.56,
  },
  pillCodeLg: { fontSize: 16, letterSpacing: -0.64 },

  // Строка обновления
  footerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.tight, marginTop: tokens.spacing.tight,
  },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updatedText: { fontSize: 13, fontFamily: 'Onest_400Regular', color: D.updated, letterSpacing: -0.26 },

  // История
  histSection: { marginTop: 40, flex: 1 },
  histTitle: { fontSize: tokens.typography.header, fontFamily: 'Onest_600SemiBold', color: tokens.text.primary, letterSpacing: -0.24, marginBottom: 12 },
  histHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  periodToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: tokens.spacing.tight, paddingVertical: 4 },
  periodToggleText: { fontSize: 13, fontFamily: 'Onest_400Regular', color: D.updated, letterSpacing: -0.26 },
  // Пилюля — тот же размер, что раньше вмещал ровно 4 валюты; остальные скроллятся внутри неё.
  // overflow:hidden именно на этой обёртке — иначе скролл обрезает контент прямоугольно,
  // а не по скруглению пилюли.
  tabBarClip: { width: 204, borderRadius: tokens.radius.pill, overflow: 'hidden' },
  tabBar: { flexDirection: 'row', backgroundColor: D.tabBarBg, padding: 1 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: tokens.radius.pill },
  tabActive: { backgroundColor: D.tabActiveBg },
  tabText: {
    fontSize: 14, fontFamily: 'Onest_500Medium', textTransform: 'uppercase',
    letterSpacing: -0.56, color: hexToRgba(tokens.text.primary, 0.5),
  },
  tabTextActive: { color: tokens.text.inverse },
  bigRate: { fontSize: tokens.typography.header, lineHeight: 24, fontFamily: 'Onest_600SemiBold', color: D.bigRate, flexShrink: 0 },
  badge: {
    borderRadius: tokens.radius.pill, padding: 8, gap: tokens.spacing.tight,
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
    backgroundColor: D.resetBg, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.spacing.sheet, paddingVertical: 12,
  },
  loadHistBtnText: { color: tokens.text.inverse, fontFamily: 'Onest_700Bold', fontSize: 14 },

  // ── Переключатель режима (Валюты / Вклад) — на всю ширину, под заголовком ──
  modeBar: {
    flexDirection: 'row', backgroundColor: D.tabBarBg, borderRadius: tokens.radius.pill,
    padding: 2, gap: 2, marginBottom: tokens.spacing.lg,
  },
  modeTab: {
    flex: 1, paddingVertical: 10, borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  modeTabActive: { backgroundColor: tokens.accent.base },
  modeTabText: {
    fontSize: 14, fontFamily: 'Onest_500Medium', color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.28,
  },
  modeTabTextActive: { color: tokens.text.inverse, fontFamily: 'Onest_600SemiBold' },

  // ── Калькулятор вклада ──
  depCurrencyStatic: { fontSize: tokens.typography.title, fontFamily: 'Onest_600SemiBold', color: D.sourceLabel },
  depColLabel: { fontSize: 14, fontFamily: 'Onest_500Medium', color: D.sourceLabel },
  depPeriodRow: { flexDirection: 'row', gap: tokens.spacing.chip, marginTop: tokens.spacing.chip, flexWrap: 'wrap' },
  depPeriodChip: { paddingHorizontal: tokens.spacing.tight, paddingVertical: tokens.spacing.chip, borderRadius: tokens.radius.pill, backgroundColor: tokens.surface.white },
  depPeriodChipActive: { backgroundColor: tokens.accent.light },
  depPeriodChipText: { fontSize: 13, fontFamily: 'Onest_500Medium', color: tokens.text.secondary },
  depPeriodChipTextActive: { color: tokens.text.inverse, fontFamily: 'Onest_600SemiBold' },
  depResultCard: {
    backgroundColor: tokens.surface.white, borderRadius: 20, padding: tokens.spacing.sheet,
    marginTop: tokens.spacing.xl, boxShadow: '0px 4px 14px rgba(48,69,62,0.08)',
  },
  depResultRow: { flexDirection: 'row', alignItems: 'stretch', marginTop: tokens.spacing.md },
  depResultSep: { width: 1, backgroundColor: D.divider, marginHorizontal: tokens.spacing.md },
  depCol: { flex: 1, minWidth: 0 },
  depColHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.chip, marginBottom: tokens.spacing.chip },
  depColIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  depColHeadLabel: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.24, flexShrink: 1 },
  depColValue: { fontSize: 17, lineHeight: 17, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.34, marginTop: tokens.spacing.chip },
  depResultHint: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), marginTop: tokens.spacing.md, letterSpacing: -0.24 },
});
