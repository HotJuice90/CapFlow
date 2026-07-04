import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Text as SvgText, Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { tokens, font } from '@/theme';
import { formatDateFull } from '@/format/date';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';

// Цвета трендов — 1в1 из Figma (не токены приложения: это конкретно палитра
// «ключевой ставки», зелёный/красный там ярче и холоднее бренд-акцента).
const TREND_DOWN = '#18C186';
const TREND_UP = '#C11848';
const TREND_FLAT = '#6693A9';

function formatRate(v: number): string {
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}

function formatDelta(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  const abs = Math.abs(v);
  // Шильдик всегда с одним знаком после запятой (N,N): −0,5, +2,0.
  // Исключение — четвертьпунктовый шаг ЦБ (−0,25): его показываем с двумя.
  const decimals = Math.round(abs * 100) % 10 === 0 ? 1 : 2;
  return `${sign}${abs.toFixed(decimals).replace('.', ',')}`;
}

/** Иконки трендов в строке — зигзаг из Figma. В оригинале стоит transform:
 * scaleY(-1) (класс -scale-y-100) — без него зигзаг рисуется вверх ногами. */
function TrendIcon({ dir, size = 24 }: { dir: number; size?: number }) {
  const d =
    dir < 0
      ? 'M18.5858 8H15V6H20.5C21.3284 6 22 6.67157 22 7.5V13H20V9.41421L13.7071 15.7071C13.3166 16.0976 12.6834 16.0976 12.2929 15.7071L9 12.4142L3.70711 17.7071L2.29289 16.2929L8.29289 10.2929C8.68342 9.90237 9.31658 9.90237 9.70711 10.2929L13 13.5858L18.5858 8Z'
      : dir > 0
        ? 'M18.5858 16H15V18H20.5C21.3284 18 22 17.3284 22 16.5V11H20V14.5858L14.7071 9.29289C14.3166 8.90237 13.6834 8.90237 13.2929 9.29289L10 12.5858L3.70711 6.29289L2.29289 7.70711L9.29289 14.7071C9.68342 15.0976 10.3166 15.0976 10.7071 14.7071L14 11.4142L18.5858 16Z'
        : 'M2.91399 13L2.91399 11H18.0856L15.7927 8.70711L17.2069 7.29289L20.4998 10.5858C21.2808 11.3668 21.2808 12.6332 20.4998 13.4142L17.2069 16.7071L15.7927 15.2929L18.0856 13H2.91399Z';
  const color = dir < 0 ? TREND_DOWN : dir > 0 ? TREND_UP : TREND_FLAT;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ scaleY: -1 }] }}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

// Скруглённый треугольник для рекорд-маркера (макс/мин за всю историю) —
// точный путь из Figma, viewBox 12×12. Вниз — тот же путь, повёрнутый на 180°.
const TRIANGLE_PATH =
  'M9.59961 8.5168C9.59961 8.22721 9.53561 7.94968 9.42192 7.74623L6.74828 2.96175C6.33478 2.21223 5.66437 2.21223 5.25088 2.96175L2.57729 7.74623C2.4636 7.94968 2.39961 8.2272 2.39961 8.51679C2.39961 9.11482 2.66706 9.59961 2.99698 9.59961L9.00224 9.59961C9.33216 9.59961 9.59961 9.11482 9.59961 8.5168Z';

/** Маленький треугольник — рекордный максимум/минимум за всю историю. */
function RecordMark({ kind }: { kind: 'max' | 'min' }) {
  const color = kind === 'max' ? TREND_UP : TREND_DOWN;
  return (
    <Svg width={9} height={9} viewBox="0 0 12 12" style={[styles.recordMark, kind === 'min' && { transform: [{ rotate: '180deg' }] }]}>
      <Path d={TRIANGLE_PATH} fill={color} />
    </Svg>
  );
}

/** Иконка обновления из Figma — новая версия из двух отдельных заливок
 * (две дуги-стрелки), без общего контура с «дыркой» — раньше рисовалась криво. */
function RefreshIcon({ size = 18, color = '#212121' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path
        d="M16.5 8.25001C16.9142 8.25001 17.25 8.5858 17.25 9.00001C17.25 13.5564 13.5563 17.25 9 17.25C6.73436 17.25 4.68357 16.3339 3.19336 14.8565C3.18825 15.083 3.18793 15.3567 3.18945 15.6973L3.19629 17.1865C3.19804 17.6005 2.86413 17.9374 2.4502 17.9395C2.03609 17.9413 1.69831 17.6074 1.69629 17.1934L1.68945 15.7041C1.68688 15.1281 1.6839 14.6323 1.72754 14.2324C1.77286 13.8174 1.87675 13.4111 2.15332 13.0537C2.26917 12.904 2.40305 12.7692 2.55273 12.6533C2.91011 12.3768 3.31642 12.2738 3.73145 12.2285C4.13139 12.1848 4.62693 12.1879 5.20312 12.1904L6.69238 12.1973C7.10652 12.1991 7.44119 12.5361 7.43945 12.9502C7.4376 13.3644 7.09976 13.6991 6.68555 13.6973L5.19629 13.6904C4.7497 13.6884 4.41848 13.688 4.15723 13.7002C5.38472 14.9648 7.09994 15.75 9 15.75C12.7279 15.75 15.75 12.7279 15.75 9.00001C15.75 8.5858 16.0858 8.25001 16.5 8.25001Z"
        fill={color}
      />
      <Path
        d="M15.4883 7.61573e-06C15.9025 -0.0018404 16.2403 0.332872 16.2422 0.747078L16.249 2.23634C16.2516 2.81237 16.2546 3.30816 16.2109 3.70802C16.1656 4.12289 16.0616 4.5285 15.7852 4.88575C15.6693 5.03542 15.5354 5.1703 15.3857 5.28614C15.0284 5.56271 14.6221 5.6666 14.207 5.71192C13.8071 5.7556 13.3115 5.7516 12.7354 5.74903L11.2461 5.7422C10.8319 5.74035 10.4972 5.40347 10.499 4.98927C10.5009 4.57508 10.8387 4.24035 11.2529 4.2422L12.7422 4.24903C13.1893 4.25103 13.5208 4.25156 13.7822 4.23927C12.5591 3.01057 10.8693 2.25001 9 2.25001C5.27208 2.25001 2.25 5.27209 2.25 9.00001C2.25 9.41422 1.91421 9.75001 1.5 9.75001C1.08579 9.75001 0.75 9.41422 0.75 9.00001C0.750004 4.44366 4.44365 0.750008 9 0.750008C11.2338 0.750008 13.2593 1.63999 14.7441 3.08106C14.7492 2.85495 14.7505 2.5817 14.749 2.2422L14.7422 0.752937C14.7406 0.339048 15.0744 0.00205927 15.4883 7.61573e-06Z"
        fill={color}
      />
    </Svg>
  );
}

export default function KeyRateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, refreshKeyRate } = useData();
  const [loading, setLoading] = useState(false);

  // Сохранённая история (см. AppData.keyRateHistory) — не гоняем весь список
  // с сети каждый раз, только домердживаем свежее по кнопке.
  const history = data.keyRateHistory;
  const latest = history[0];
  const oldestYear = new Date(history[history.length - 1].date).getFullYear();
  const maxRate = Math.max(...history.map((p) => p.rate));
  const minRate = Math.min(...history.map((p) => p.rate));

  // Ширина SVG под цифры — впритык к их числу символов (эмпирически ~44px/символ
  // при fontSize 76 и letterSpacing -2), чтобы «%» рядом не гулял по экрану.
  const rateStr = formatRate(latest.rate);
  const numberW = rateStr.length * 44;

  const onRefresh = async () => {
    tapBuzz();
    setLoading(true);
    try {
      await refreshKeyRate();
      successBuzz();
    } catch {
      warnBuzz();
      appAlert('Не удалось обновить', 'Нет связи с cbr.ru — показываю последние известные данные.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: 80, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Ключевая ставка ЦБ</Text>
          </View>
          <Pressable onPress={onRefresh} hitSlop={12} style={styles.refreshBtn} disabled={loading}>
            <View style={loading ? { opacity: 0.4 } : undefined}>
              <RefreshIcon size={18} color={tokens.text.primary} />
            </View>
          </Pressable>
        </View>

        {/* Крупная ставка градиентом по центру — мягкое размытое свечение позади,
            «%» приподнят и бледный, почти вплотную к верху цифр (как в макете). */}
        <View style={styles.hero}>
          <Svg width={480} height={480} style={styles.glow} pointerEvents="none">
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#ECD0FF" stopOpacity={0.22} />
                <Stop offset="0.2" stopColor="#ECD0FF" stopOpacity={0.17} />
                <Stop offset="0.4" stopColor="#ECD0FF" stopOpacity={0.11} />
                <Stop offset="0.6" stopColor="#ECD0FF" stopOpacity={0.06} />
                <Stop offset="0.8" stopColor="#ECD0FF" stopOpacity={0.02} />
                <Stop offset="1" stopColor="#ECD0FF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="240" cy="240" r="240" fill="url(#glow)" />
          </Svg>

          <View style={styles.valueRow}>
            <Svg width={numberW} height={84}>
              <Defs>
                <LinearGradient id="rateGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={tokens.accent.light} />
                  <Stop offset="1" stopColor={tokens.accent.base} />
                </LinearGradient>
              </Defs>
              <SvgText
                x="100%"
                y="66"
                textAnchor="end"
                fontSize="76"
                fontFamily={font.semibold}
                letterSpacing="-2"
                fill="url(#rateGrad)"
              >
                {rateStr}
              </SvgText>
            </Svg>
            <Text style={styles.percent}>%</Text>
          </View>
        </View>

        {/* «Динамика» — без общего белого бенто: заголовок и плашки лежат прямо
            на фоне экрана, у каждой плашки своя полупрозрачная заливка. */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Динамика</Text>
          <Text style={styles.cardSubtitle}>{history.length} изменений с {oldestYear}</Text>
        </View>

        <View style={styles.list}>
          {history.map((point, i) => {
            const prev = history[i + 1];
            const delta = prev ? point.rate - prev.rate : undefined;
            const dir = delta === undefined ? 0 : Math.sign(delta);
            const isMax = point.rate === maxRate;
            const isMin = point.rate === minRate;
            // Для ключевой ставки принято обратное биржевому: снижение — «хорошо» (зелёное),
            // повышение — «плохо» (красное) — так подаёт сам ЦБ и финансовые СМИ.
            return (
              <View key={point.date} style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={[styles.iconBox, iconTint(dir)]}>
                    <TrendIcon dir={dir} size={22} />
                  </View>
                  <Text style={styles.rowDate}>{formatDateFull(point.date)}</Text>
                </View>
                <View style={styles.rowRight}>
                  <View style={styles.rateRow}>
                    <Text style={styles.rowRate}>{formatRate(point.rate)}%</Text>
                    {isMax ? <RecordMark kind="max" /> : isMin ? <RecordMark kind="min" /> : null}
                  </View>
                  {delta !== undefined ? (
                    <View style={styles.deltaPill}>
                      <Text style={styles.deltaText}>{formatDelta(delta)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

function iconTint(dir: number) {
  if (dir < 0) return styles.iconDown;
  if (dir > 0) return styles.iconUp;
  return styles.iconFlat;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xl,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, flex: 1 },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: 24, color: '#212121', letterSpacing: -0.24 },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  hero: { alignItems: 'center', justifyContent: 'center', paddingVertical: tokens.spacing.xl },
  glow: { position: 'absolute' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-start' },
  percent: {
    fontFamily: font.semibold,
    fontSize: 30,
    lineHeight: 34,
    color: 'rgba(0,0,0,0.2)',
    marginTop: 4,
    marginLeft: 2,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: tokens.spacing.md,
  },
  cardTitle: { fontFamily: font.semibold, fontSize: 20, color: '#212121', letterSpacing: -0.2 },
  cardSubtitle: { fontFamily: font.regular, fontSize: 12, color: 'rgba(33,33,33,0.3)', letterSpacing: -0.24 },

  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 69,
    borderRadius: 20,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(249,250,255,0.5)',
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },

  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  iconBox: { width: 49, aspectRatio: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  iconUp: { backgroundColor: 'rgba(193,24,72,0.05)' },
  iconDown: { backgroundColor: 'rgba(24,193,134,0.05)' },
  iconFlat: { backgroundColor: 'rgba(102,147,169,0.05)' },
  rowDate: { fontFamily: font.medium, fontSize: 16, color: tokens.text.secondary },

  rowRight: { alignItems: 'flex-end', gap: 4 },
  rateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  rowRate: { fontFamily: font.semibold, fontSize: 18, lineHeight: 18, color: '#212121' },
  recordMark: { marginTop: 1 },
  deltaPill: { backgroundColor: '#f9faff', borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 6 },
  deltaText: { fontFamily: font.medium, fontSize: 11, lineHeight: 11, color: 'rgba(33,33,33,0.8)' },
});
