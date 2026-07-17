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
import type { CurrencyCode } from '@/domain/types';
import { tokens, hexToRgba } from '@/theme';
import { CURRENCY_SYMBOL, formatMoney } from '@/format';
import { timeAgo } from '@/format/date';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';
import { Flag } from '@/components/Flag';
import { openCurrencyPicker } from '@/lib/currencyPicker';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Toggle } from '@/components/Toggle';
import WalletAddIcon from '../../assets/icons/converter/wallet-add.svg';
import ArrowDownIcon from '../../assets/icons/converter/arrow-down.svg';
import RotateLeftIcon from '../../assets/icons/converter/rotate-left.svg';

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

// Сверено с Figma (Converter Screen / Валюты, Вклад) — везде, где есть
// подходящий токен, используем его напрямую; ниже только то, что реально
// сырое (не заведено в tokens.ts, взято 1:1 из макета).
const D = {
  bg1: '#F2F4F9', bg2: '#E0EDF4', bg3: '#F5F7FF',
  placeholder: 'rgba(144,148,151,0.45)',
  resetBg: tokens.accent.light, resetBorder: '#E2EDF8',
  chipBg: '#F7F7F7', // фон чипа валюты (Country_shoose) — свой, не surface.neutral
  divider: '#EAECF2',
  tabBarBg: tokens.surface.tabOff,
  tabActiveBg: tokens.accent.light,
  badgeNegBg: 'rgba(229,139,139,0.1)', badgePosBg: 'rgba(139,229,139,0.1)',
  badgeNeutral: tokens.text.tertiary, badgeNeutralBg: 'rgba(122,130,142,0.1)',
};

// ─── Калькулятор вклада ─────────────────────────────────────────────────────
const DEP_PERIODS: { label: string; days: number }[] = [
  { label: '7 дней', days: 7 },
  { label: '1 мес.', days: 30 },
  { label: '3 мес.', days: 91 },
  { label: '6 мес.', days: 182 },
  { label: '1 год', days: 365 },
];
const DEP_RATE_PRESETS = [10, 11, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16];

/** Компактный процент без лишних нулей, для быстрых чипов ставки. */
function fmtPct(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
  return `${s.replace('.', ',')}%`;
}

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

/** Живая группировка тысяч прямо во время ввода (целую часть — по 3 цифры),
 *  дробную часть после запятой/точки не трогаем. */
function groupWhileTyping(text: string): string {
  const sepIdx = text.search(/[.,]/);
  const intPart = (sepIdx === -1 ? text : text.slice(0, sepIdx)).replace(/\s/g, '');
  const rest = sepIdx === -1 ? '' : text.slice(sepIdx);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return grouped + rest;
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
  // Воздух снизу больше, чем сверху — график подтянут ближе к цифрам над ним,
  // а не висит по центру блока.
  const topHeadroom = span * 0.08;
  const bottomHeadroom = span * 0.21;
  const lo = dataMin - bottomHeadroom;
  const range = span + topHeadroom + bottomHeadroom;
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

// ─── Currency pill (flag + code + chevron) ─────────────────────────────────────
// В Figma верхний и нижние чипы — один и тот же размер (флаг 28px, текст 16px),
// отдельного «крупного» варианта нет.

function CurrencyPill({ currency, editable = true, onPress }: {
  currency: CurrencyCode; editable?: boolean; onPress?: () => void;
}) {
  return (
    <Pressable style={s.pill} onPress={editable ? onPress : undefined} hitSlop={8}>
      <View style={s.pillIconRow}>
        <Flag code={currency} size={28} />
        <Text style={s.pillCode}>{currency}</Text>
      </View>
      {editable ? (
        <ArrowDownIcon width={12} height={12} color={tokens.text.tertiary} />
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

  // Калькулятор вклада — сумма/ставка/срок вводятся вручную (не привязаны к
  // реальной площадке), чипы под ставкой и сроком — быстрые пресеты, которые
  // просто подставляют значение в то же поле. Сумма по умолчанию пустая
  // (плейсхолдер «0»), ставка — 12% (популярная по факту, не ключевая — её
  // банки не дают), срок — 30 дней.
  const [depAmountText, setDepAmountText] = useState('');
  const [depRateText, setDepRateText] = useState('12');
  const [depDaysText, setDepDaysText] = useState('30');
  const [depMode, setDepMode] = useState<'simple' | 'compound'>('simple');

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
    setAmountText(groupWhileTyping(text.replace(/[^\d.,]/g, '')));
  };

  const handleFocus = (idx: number) => {
    if (idx === activeIdx) return;
    // переносим текущее значение в фокусируемое поле (в его валюте)
    setAmountText(groupWhileTyping(toEditable(valueFor(idx))));
    setActiveIdx(idx);
  };

  const resetAmounts = () => {
    tapBuzz();
    setAmountText('');
    setActiveIdx(0);
  };

  const resetDeposit = () => {
    tapBuzz();
    setDepAmountText('');
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
    tapBuzz();
    setRefreshing(true);
    try {
      await refreshRates();
      successBuzz();
    } catch {
      warnBuzz();
    } finally {
      setRefreshing(false);
    }
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

  // ── Калькулятор вклада: одноразовая прикидка, не расчёт конкретного продукта
  // и не привязана к реальному портфелю — капитализация приближённая
  // (ежедневная), налог плоской ставкой без необлагаемого лимита (лимит зависит
  // от остального портфеля за год, тут это только сбивало бы с толку).
  const depAmount = parseRaw(depAmountText);
  const depRate = parseRaw(depRateText);
  const depDays = parseInt(depDaysText, 10) || 0;
  const depGross = depMode === 'compound'
    ? depAmount * (Math.pow(1 + depRate / 100 / 365, depDays) - 1)
    : depAmount * (depRate / 100) * (depDays / 365);
  const depTax = Math.max(0, depGross) * (data.params.taxRate / 100);

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
          <Pressable
            style={s.topCard}
            onPress={() => refs[0].current?.focus()}
            onLayout={(e) => setTopCardH(e.nativeEvent.layout.height)}
          >
            <View style={s.topLeft}>
              <Text style={s.topLabel}>{CURRENCY_NAME[slots[0]]}</Text>
              {AmountInput(0, true)}
            </View>
            <CurrencyPill currency={slots[0]} editable={false} />
          </Pressable>

          {/* Нижние два поля */}
          <View style={s.bottomCard}>
            <Pressable style={s.col} onPress={() => refs[1].current?.focus()}>
              <CurrencyPill currency={slots[1]} onPress={() => openPicker(1)} />
              <View style={s.colValueGroup}>
                {AmountInput(1, false)}
                <Text style={s.rateHint}>{rateLabel(slots[1])}</Text>
              </View>
            </Pressable>

            <View style={s.divider} />

            <Pressable style={s.col} onPress={() => refs[2].current?.focus()}>
              <CurrencyPill currency={slots[2]} onPress={() => openPicker(2)} />
              <View style={s.colValueGroup}>
                {AmountInput(2, false)}
                <Text style={s.rateHint}>{rateLabel(slots[2])}</Text>
              </View>
            </Pressable>
          </View>

          {/* Кнопка сброса показаний */}
          <Pressable style={[s.resetBtn, { top: topCardH - 22 }]} onPress={resetAmounts} hitSlop={8}>
            <RotateLeftIcon width={20} height={20} color={tokens.text.inverse} />
          </Pressable>
        </View>

        {/* ── Строка обновления ── */}
        <View style={s.footerRow}>
          <Text style={s.updatedText}>Курс: ЦБ РФ</Text>
          <Pressable style={s.footerRight} onPress={doRefresh} disabled={refreshing}>
            <Text style={s.updatedText}>
              {refreshing ? 'Обновляю…' : `Обновлено: ${data.ratesUpdatedAt ? timeAgo(data.ratesUpdatedAt) : '—'}`}
            </Text>
            <MaterialIcons name="refresh" size={13} color={tokens.text.tertiary} />
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
                <MaterialIcons name="swap-horiz" size={16} color={tokens.text.tertiary} />
                <Text style={s.periodToggleText}>{histPeriod === 'day' ? 'День' : 'Месяц'}</Text>
              </Pressable>
              <View style={[s.badge, { backgroundColor: histFlat ? D.badgeNeutralBg : histRubbleUp ? D.badgePosBg : D.badgeNegBg }]}>
                <Text style={[s.badgeText, { color: histFlat ? D.badgeNeutral : histRubbleUp ? tokens.semantic.positive : tokens.semantic.negative }]}>
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
          <View style={s.topCard} onLayout={(e) => setTopCardH(e.nativeEvent.layout.height)}>
            <View style={s.topLeft}>
              <Text style={s.topLabel}>Сумма</Text>
              <TextInput
                style={s.bigInput}
                value={depAmountText}
                onChangeText={(t) => setDepAmountText(groupWhileTyping(t.replace(/[^\d.,]/g, '')))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={D.placeholder}
                selectionColor={D.resetBg}
              />
            </View>
            <Text style={s.depCurrencyStatic}>{CURRENCY_SYMBOL[base]}</Text>
          </View>

          {/* Кнопка сброса — тот же rotate-left, что у валют */}
          <Pressable style={[s.resetBtn, { top: topCardH - 22 }]} onPress={resetDeposit} hitSlop={8}>
            <RotateLeftIcon width={20} height={20} color={tokens.text.inverse} />
          </Pressable>

          <View style={s.bottomCard}>
            <View style={s.col}>
              <Text style={s.depColLabel}>Ставка, %</Text>
              <View style={s.depColGroup}>
                <TextInput
                  style={s.colInput}
                  value={depRateText}
                  onChangeText={(t) => setDepRateText(t.replace(/[^\d.,]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={D.placeholder}
                  selectionColor={D.resetBg}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.depChipsRow}>
                  {DEP_RATE_PRESETS.map((r) => (
                    <Pressable key={r} style={s.depChip} onPress={() => { tapBuzz(); setDepRateText(fmtPct(r).replace('%', '')); }}>
                      <Text style={s.depChipText}>{fmtPct(r)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={s.divider} />

            <View style={s.col}>
              <Text style={s.depColLabel}>Срок, дней</Text>
              <View style={s.depColGroup}>
                <TextInput
                  style={s.colInput}
                  value={depDaysText}
                  onChangeText={(t) => setDepDaysText(t.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={D.placeholder}
                  selectionColor={D.resetBg}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.depChipsRow}>
                  {DEP_PERIODS.map((p) => (
                    <Pressable key={p.days} style={s.depChip} onPress={() => { tapBuzz(); setDepDaysText(String(p.days)); }}>
                      <Text style={s.depChipText}>{p.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>

        {/* ── Доход за срок + тумблер капитализации ── */}
        <View style={s.depResultHeader}>
          <Text style={s.depResultTitle}>Доход за срок</Text>
          <View style={s.depCapRow}>
            <Text style={s.depCapLabel}>Капит.</Text>
            <Toggle
              value={depMode === 'compound'}
              onChange={(v) => { tapBuzz(); setDepMode(v ? 'compound' : 'simple'); }}
              offColor={tokens.surface.tabOff}
            />
          </View>
        </View>

        {/* ── Результат — полупрозрачная строка (как в «Настройках»), налог доп. инфой ── */}
        <View style={s.depResultCard}>
          <View style={s.depResultIcon}>
            <WalletAddIcon width={22} height={22} color={tokens.semantic.positive} />
          </View>
          <View style={s.depResultRight}>
            <Text style={s.depResultValue}>{formatMoney(Math.max(0, depGross), { currency: base })}</Text>
            <Text style={s.depResultTaxHint}>
              {depTax > 0 ? `Возможный налог: ${formatMoney(depTax, { currency: base })}` : 'Налог: не облагается'}
            </Text>
          </View>
        </View>
        </>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  cardsBlock: { gap: tokens.spacing.chip, position: 'relative' },

  // Верхняя карточка — фон «стекло» (surface.glass), радиус lg — как у нижней.
  topCard: {
    backgroundColor: tokens.surface.glass, borderRadius: tokens.radius.lg, padding: tokens.spacing.sheet,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0px 4px 14px rgba(48,69,62,0.08)',
  },
  topLeft: { flex: 1, gap: 20, paddingRight: 12 },
  topLabel: { fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', color: tokens.text.tertiary },
  // Без lineHeight/height/textAlignVertical — именно с них начались прыжки
  // числа между плейсхолдером и введённым значением. До того, как их сюда
  // добавили в рамках Figma-сверки, поле работало нормально — возвращаем
  // как было, точная высота карточки тут менее важна, чем рабочий инпут.
  bigInput: {
    fontSize: tokens.typography.display,
    fontFamily: 'Onest_600SemiBold', color: tokens.text.primary,
    letterSpacing: -0.34, padding: 0,
  },

  // Нижняя карточка (2 столбца + дивайдер) — плотнее, чем изначально в
  // Figma (20/12): col — gap между чипом валюты и группой (число+курс);
  // colValueGroup — gap внутри группы (число→курс).
  bottomCard: {
    backgroundColor: tokens.surface.glass, borderRadius: tokens.radius.lg, padding: tokens.spacing.sheet,
    flexDirection: 'row', alignItems: 'stretch',
    boxShadow: '0px 4px 14px rgba(48,69,62,0.08)',
  },
  col: { flex: 1, gap: tokens.spacing.md },
  colValueGroup: { gap: tokens.spacing.sm },
  colInput: {
    fontSize: 26,
    fontFamily: 'Onest_600SemiBold', color: tokens.text.primary,
    letterSpacing: -0.52, padding: 0,
  },
  divider: { width: 1, backgroundColor: D.divider, marginHorizontal: 16, alignSelf: 'stretch' },
  rateHint: { fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', color: tokens.text.tertiary },

  // Кнопка сброса
  resetBtn: {
    position: 'absolute', right: 0,
    backgroundColor: D.resetBg, borderWidth: 6, borderColor: D.resetBorder,
    borderRadius: tokens.radius.pill, padding: 8, zIndex: 10,
  },

  // Чип валюты — один размер везде (флаг 28px, текст 16px), внешний gap 10
  // (до стрелки), внутренний gap 8 (флаг-текст) — как в Figma.
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.tight,
    backgroundColor: D.chipBg, borderRadius: tokens.radius.pill,
    paddingLeft: 4, paddingRight: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  pillIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillCode: {
    fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', color: tokens.text.primary,
    textTransform: 'uppercase', letterSpacing: -0.56,
  },

  // Строка обновления
  footerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.tight, marginTop: tokens.spacing.tight,
  },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updatedText: { fontSize: 13, lineHeight: 15, fontFamily: 'Onest_400Regular', color: tokens.text.tertiary, letterSpacing: -0.26 },

  // История
  histSection: { marginTop: tokens.spacing.xxl, flex: 1 },
  histTitle: { fontSize: tokens.typography.title, lineHeight: tokens.typography.title + 2, fontFamily: 'Onest_600SemiBold', color: tokens.text.primary, letterSpacing: -0.2, marginBottom: 12 },
  histHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  periodToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: tokens.spacing.tight, paddingVertical: 4 },
  periodToggleText: { fontSize: 13, lineHeight: 15, fontFamily: 'Onest_400Regular', color: tokens.text.tertiary, letterSpacing: -0.26 },
  // Пилюля — тот же размер, что раньше вмещал ровно 4 валюты; остальные скроллятся внутри неё.
  // overflow:hidden именно на этой обёртке — иначе скролл обрезает контент прямоугольно,
  // а не по скруглению пилюли.
  tabBarClip: { width: 204, borderRadius: tokens.radius.pill, overflow: 'hidden' },
  tabBar: { flexDirection: 'row', backgroundColor: D.tabBarBg, padding: 1 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: tokens.radius.pill },
  tabActive: { backgroundColor: D.tabActiveBg },
  // letterSpacing -0.56 — не декоративный, а часть расчёта ширины: tabBarClip
  // (204px) откалиброван ровно под 4 валюты с этим трекингом, без него текст
  // шире и «хвост» пятой валюты вылезает из-под обрезки.
  tabText: {
    fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', textTransform: 'uppercase',
    letterSpacing: -0.56, color: tokens.text.tertiary,
  },
  tabTextActive: { color: tokens.text.inverse },
  bigRate: { fontSize: tokens.typography.header, lineHeight: tokens.typography.header + 2, fontFamily: 'Onest_600SemiBold', color: tokens.accent.deep, letterSpacing: -0.24, flexShrink: 0 },
  badge: {
    borderRadius: tokens.radius.pill, paddingHorizontal: tokens.spacing.chip, paddingVertical: tokens.spacing.xs, gap: tokens.spacing.chip,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 12, lineHeight: 14, fontFamily: 'Onest_500Medium', letterSpacing: -0.12 },

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

  // ── Переключатель режима (Валюты / Вклад) — на всю ширину, под заголовком.
  // Активный таб — вплотную к краям (без своего паддинга/gap), инактивный текст —
  // акцентным цветом (не серым): так в Figma, а не «выключенное» состояние ──
  modeBar: {
    flexDirection: 'row', backgroundColor: D.tabBarBg, borderRadius: tokens.radius.pill,
    marginBottom: tokens.spacing.lg,
  },
  // Высота — естественная (paddingVertical 11×2 + lineHeight 16 = 38),
  // без forced height: lineHeight fontSize+2 — тот же минимум, что и везде.
  modeTab: {
    flex: 1, paddingVertical: 11, borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  modeTabActive: { backgroundColor: tokens.accent.base },
  modeTabText: { fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', color: tokens.accent.base },
  modeTabTextActive: { color: tokens.text.inverse, fontFamily: 'Onest_600SemiBold' },

  // ── Калькулятор вклада ──
  depCurrencyStatic: { fontSize: tokens.typography.header, lineHeight: tokens.typography.header + 2, fontFamily: 'Onest_600SemiBold', color: tokens.text.tertiary, letterSpacing: -0.24 },
  depColLabel: { fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', color: tokens.text.tertiary },
  depColGroup: { gap: tokens.spacing.lg },
  // Быстрые пресеты под ставкой/сроком — мелкие чипы, скроллятся, если не влезли.
  depChipsRow: { flexDirection: 'row', gap: 2 },
  depChip: { paddingHorizontal: tokens.spacing.tight, paddingVertical: tokens.spacing.chip, borderRadius: tokens.radius.pill, backgroundColor: tokens.surface.neutral },
  depChipText: { fontSize: tokens.typography.micro, lineHeight: tokens.typography.micro + 2, fontFamily: 'Onest_400Regular', color: tokens.text.secondary },

  depResultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: tokens.spacing.tight, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
  depResultTitle: { fontSize: tokens.typography.title, lineHeight: tokens.typography.title + 2, fontFamily: 'Onest_600SemiBold', color: tokens.text.primary, letterSpacing: -0.2 },
  depCapRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  depCapLabel: { fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', color: tokens.text.secondary },

  // Полупрозрачная строка (как в «Настройках» — tokens.surface.rowTint), не
  // карточка-бенто: иконка слева, один явный акцент (доход) + налог доп. инфой справа.
  depResultCard: {
    backgroundColor: tokens.surface.rowTint, borderRadius: tokens.radius.lg, padding: tokens.spacing.sheet,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0px 4px 14px rgba(48,69,62,0.05)',
  },
  depResultIcon: {
    width: 48, height: 48, borderRadius: tokens.radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: hexToRgba(tokens.semantic.positive, 0.05),
  },
  depResultRight: { alignItems: 'flex-end', gap: tokens.spacing.chip },
  depResultValue: { fontSize: tokens.typography.header, lineHeight: tokens.typography.header + 2, fontFamily: 'Onest_600SemiBold', color: tokens.accent.deep, letterSpacing: -0.24 },
  depResultTaxHint: { fontSize: 13, lineHeight: 15, fontFamily: 'Onest_400Regular', color: tokens.text.tertiary, letterSpacing: -0.26 },
});
