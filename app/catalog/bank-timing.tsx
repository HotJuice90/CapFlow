import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { SubHeader } from '@/components/SubHeader';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { openBankTimingSheet } from '@/lib/bankTimingSheet';
import { tapBuzz } from '@/lib/haptics';
import {
  BANK_TIMING,
  RULES,
  TIMING_AS_OF,
  brandOf,
  pluralPlatforms,
  timingForOrg,
  timingsBy,
  type BankTiming,
} from '@/domain/bankTiming';
import type { Organization } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatDateFull, formatDateShort, pluralDays } from '@/format/date';

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * «Когда открывать счёт» — инфографика по срокам у 42 площадок.
 *
 * Экран отвечает на один вопрос, и вёрстка идёт в порядке ответа:
 *  1. Герой прямо на фоне — сколько дней до окна и линейка месяца, где видно,
 *     где ты сейчас и где окно. Без своей плашки: это ответ, а не блок.
 *  2. Ось «последний день | 1-е число» с банками по сторонам. Ось — ГРАНИЦА
 *     без данных: строки по сторонам не парные, и содержимое в центре читали
 *     бы как связь между соседями. Лого в карточках всегда слева, в обеих
 *     колонках: зеркальная раскладка (лого вдоль оси) читалась хуже.
 *  3. Банки «в любой день» — той же карточкой, сеткой.
 *  4. Правила — заголовком вперёд.
 *
 * Свои площадки не вынесены отдельным блоком, а подсвечены на месте и подняты
 * в начало своей группы: так сразу видно не только «что у меня», но и «где
 * мои банки относительно оси». Подсветка — только фоном и тенью: бейдж-галочка
 * и обводка поверх этого были лишним третьим и четвёртым сигналом.
 */
export default function BankTimingScreen() {
  const insets = useSafeAreaInsets();
  const { data } = useData();

  const now = new Date();
  const day = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastDay = new Date(year, month, daysInMonth);
  // В сам день 1-го правая колонка открывается СЕГОДНЯ, а не через месяц.
  const firstDay = day === 1 ? now : new Date(year, month + 1, 1);
  const toWindow = daysInMonth - day;

  /** Имя записи памятки → площадка пользователя (для лого и подсветки). */
  const mine = useMemo(() => {
    const map = new Map<string, Organization>();
    for (const o of data.organizations) {
      if (o.archived) continue;
      const t = timingForOrg(o);
      if (t && !map.has(t.name)) map.set(t.name, o);
    }
    return map;
  }, [data.organizations]);

  /** Свои — первыми, дальше порядок источника. */
  const ordered = (list: BankTiming[]) => [
    ...list.filter((t) => mine.has(t.name)),
    ...list.filter((t) => !mine.has(t.name)),
  ];
  const left = ordered(timingsBy('lastDay'));
  const right = ordered(timingsBy('firstDay'));
  const anyDay = ordered(timingsBy('anyDay'));

  const open = (t: BankTiming) => {
    tapBuzz();
    openBankTimingSheet(t.name);
  };

  // --- Герой ---
  let heroLabel = 'До окна открытия';
  let heroNumber = String(toWindow);
  let heroUnit: string | null = pluralDays(toWindow);
  let heroSub = `${formatDateShort(lastDay)} и ${formatDateShort(firstDay)}`;
  if (day === daysInMonth) {
    heroLabel = 'Окно открыто';
    heroNumber = 'Сегодня';
    heroUnit = null;
    heroSub = 'Последний день месяца — время для банков слева';
  } else if (day === 1) {
    heroLabel = 'Окно открыто';
    heroNumber = 'Сегодня';
    heroUnit = null;
    heroSub = 'Первое число — время для банков справа';
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.spacing.screenTop,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SubHeader title="Когда открывать счёт" />

        <View style={st.hero}>
          <Text style={st.heroLabel}>{heroLabel}</Text>
          <View style={st.heroNumberRow}>
            <Text style={st.heroNumber}>{heroNumber}</Text>
            {heroUnit ? <Text style={st.heroUnit}>{heroUnit}</Text> : null}
          </View>
          <Text style={st.heroSub}>{heroSub}</Text>

          <MonthRuler day={day} daysInMonth={daysInMonth} month={month} />
        </View>

        <Text style={[st.sectionTitle, st.sectionHead]}>Когда открыть счёт</Text>

        {/* Ось. В шапках — правило, а не дата: конкретные числа уже в герое,
            а «31 октября» над колонкой читалось бы как «только в этот день
            этого месяца». «Конец месяца» тоже не годится — для левых банков
            важен именно последний день: открыв 28-го, теряешь неполный месяц. */}
        <View>
          <View style={st.axisLine} />
          <View style={st.axisHead}>
            <Text style={[st.axisDate, st.alignRight]} numberOfLines={1}>Последний день</Text>
            <View style={st.axisNode} />
            <Text style={st.axisDate} numberOfLines={1}>С 1-го числа</Text>
          </View>
          <View style={st.axisCols}>
            <View style={st.axisCol}>
              {left.map((t) => (
                <BankCard key={t.name} t={t} own={mine.get(t.name)} onPress={() => open(t)} />
              ))}
            </View>
            <View style={st.axisCol}>
              {right.map((t) => (
                <BankCard key={t.name} t={t} own={mine.get(t.name)} onPress={() => open(t)} />
              ))}
            </View>
          </View>
        </View>

        <Text style={[st.sectionTitle, st.sectionGap]}>В любой день</Text>
        <View style={st.grid}>
          {anyDay.map((t) => (
            <View key={t.name} style={st.gridCell}>
              <BankCard t={t} own={mine.get(t.name)} onPress={() => open(t)} />
            </View>
          ))}
        </View>

        <Text style={[st.sectionTitle, st.sectionGap]}>Как не потерять проценты</Text>
        <Card>
          {RULES.map((r, i) => (
            <View key={r.title} style={[st.rule, i > 0 && st.ruleNext]}>
              <View style={st.ruleIcon}>
                <MaterialCommunityIcons name={r.icon as never} size={18} color={tokens.accent.base} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.ruleTitle}>{r.title}</Text>
                <Text style={st.ruleText}>{r.text}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Text style={st.footnote}>
          Памятка на {formatDateFull(TIMING_AS_OF)} · {BANK_TIMING.length} {pluralPlatforms(BANK_TIMING.length)}
          {'\n'}Это сводка, а не условия договора — перед открытием сверяйся с тарифами банка.
        </Text>
      </ScrollView>
    </ScreenBackground>
  );
}

/**
 * Линейка месяца: штрих на каждый день + 1-е следующего месяца за границей.
 * Прошедшие дни темнее будущих, «сегодня» — тёмный штрих с подписью, окно —
 * два высоких штриха в акценте по обе стороны границы месяца. Дорожка с
 * точкой отвечала на тот же вопрос, но не давала почувствовать масштаб —
 * сколько дней ещё впереди.
 */
function MonthRuler({ day, daysInMonth, month }: { day: number; daysInMonth: number; month: number }) {
  const [w, setW] = useState(0);
  const n = daysInMonth + 1;
  const cell = w / n;
  const LABEL_W = 64;
  // Подпись «сегодня» центрируется над штрихом, но у краёв прижимается к ним —
  // иначе 1-го и 2-го числа она уезжала бы за экран.
  const todayLeft = Math.min(Math.max(0, (day - 0.5) * cell - LABEL_W / 2), Math.max(0, w - LABEL_W));
  const todayAlign = todayLeft <= 0 ? 'left' : todayLeft >= w - LABEL_W ? 'right' : 'center';

  return (
    <View style={st.ruler} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={st.rulerTop}>
        {w > 0 ? (
          <Text style={[st.todayLabel, { left: todayLeft, width: LABEL_W, textAlign: todayAlign }]}>сегодня</Text>
        ) : null}
      </View>
      <View style={st.ticks}>
        {Array.from({ length: n }, (_, i) => {
          const next = i === daysInMonth;
          const d = i + 1;
          const isWindow = next || d === daysInMonth;
          const isToday = !next && d === day;
          return (
            <View key={i} style={st.tickCell}>
              <View
                style={[
                  st.tick,
                  !next && d < day && st.tickPast,
                  isWindow && st.tickWindow,
                  isToday && st.tickToday,
                ]}
              />
            </View>
          );
        })}
        {w > 0 ? <View style={[st.monthSep, { left: daysInMonth * cell }]} /> : null}
      </View>
      <View style={st.rulerLabels}>
        <Text style={st.rulerLabel}>1 {MONTH_SHORT[month]}</Text>
        <Text style={[st.rulerLabel, st.rulerLabelWindow]}>
          {daysInMonth} {MONTH_SHORT[month]} · 1 {MONTH_SHORT[(month + 1) % 12]}
        </Text>
      </View>
    </View>
  );
}

/**
 * Карточка площадки. Лого одного размера у всех: своё фото/цвет площадки
 * пользователя → SVG из нашего набора → монограмма. Монограмма в одном
 * приглушённом тоне, а не в «фирменном» цвете: выдумывать брендбук 30 банкам,
 * для которых у нас нет лого, хуже, чем честно показать букву.
 */
function BankCard({ t, own, onPress }: { t: BankTiming; own?: Organization; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.bank,
        own ? [st.bankOwn, boxShadow(tokens.shadow.subtle)] : st.bankOther,
        pressed && st.pressed,
      ]}
    >
      {own ? (
        <OrgLogo color={own.color} logo={own.logo} imageUri={own.customImageUri} size={30} radius={9} />
      ) : t.bankId ? (
        <OrgLogo color={tokens.accent.base} logo={t.bankId} size={30} radius={9} />
      ) : (
        <View style={st.mono}>
          <Text style={st.monoText}>{brandOf(t).charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={st.bankText}>
        <Text
          style={[st.bankName, own && st.bankNameOwn]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {brandOf(t)}
        </Text>
        {t.product ? (
          <Text
            style={st.bankProduct}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t.product}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  // --- Герой ---
  hero: { marginTop: tokens.spacing.sm },
  heroLabel: { fontSize: tokens.typography.label, lineHeight: 16, fontFamily: font.medium, color: tokens.text.tertiary },
  heroNumberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  heroNumber: { fontSize: 52, lineHeight: 56, fontFamily: font.semibold, color: tokens.text.primary, letterSpacing: -1.2 },
  heroUnit: { fontSize: 22, lineHeight: 26, fontFamily: font.medium, color: tokens.text.secondary, letterSpacing: -0.3 },
  heroSub: { fontSize: tokens.typography.labelLg, lineHeight: 18, fontFamily: font.medium, color: tokens.text.secondary, marginTop: 4 },

  // --- Линейка ---
  ruler: { marginTop: tokens.spacing.xl },
  rulerTop: { height: 16 },
  todayLabel: {
    position: 'absolute',
    top: 0,
    fontSize: tokens.typography.micro,
    lineHeight: 13,
    fontFamily: font.semibold,
    color: tokens.text.primary,
  },
  ticks: { flexDirection: 'row', alignItems: 'flex-end', height: 34, marginTop: 4 },
  tickCell: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  tick: { width: 3, height: 12, borderRadius: 1.5, backgroundColor: hexToRgba(tokens.accent.base, 0.18) },
  tickPast: { backgroundColor: hexToRgba(tokens.accent.base, 0.45) },
  tickWindow: { width: 4, height: 34, borderRadius: 2, backgroundColor: tokens.accent.base },
  tickToday: { width: 4, height: 22, borderRadius: 2, backgroundColor: tokens.text.primary },
  monthSep: {
    position: 'absolute',
    top: -6,
    bottom: 0,
    width: 1,
    backgroundColor: hexToRgba(tokens.accent.base, 0.35),
  },
  rulerLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.sm },
  rulerLabel: { fontSize: tokens.typography.hint, lineHeight: 15, fontFamily: font.medium, color: tokens.text.tertiary },
  rulerLabelWindow: { color: tokens.accent.base },

  // --- Секции ---
  sectionHead: { marginTop: 48, marginBottom: 14, paddingLeft: 8 },
  sectionTitle: { fontSize: tokens.typography.title, lineHeight: 24, fontFamily: font.semibold, color: tokens.text.primary },
  sectionGap: { marginTop: 40, marginBottom: 14, paddingLeft: 8 },

  // --- Ось ---
  axisLine: {
    position: 'absolute',
    left: '50%',
    top: 10,
    bottom: 0,
    width: 1,
    marginLeft: -0.5,
    backgroundColor: hexToRgba(tokens.accent.base, 0.22),
  },
  axisHead: { flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.md },
  axisDate: { flex: 1, fontSize: 17, lineHeight: 20, fontFamily: font.semibold, color: tokens.text.primary },
  axisNode: { width: 9, height: 9, borderRadius: 4.5, marginHorizontal: 11, backgroundColor: tokens.accent.base },
  alignRight: { textAlign: 'right' },
  axisCols: { flexDirection: 'row', gap: 24 },
  axisCol: { flex: 1, minWidth: 0, gap: 8 },

  // --- Карточка площадки ---
  bank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
  },
  bankOther: { backgroundColor: hexToRgba(tokens.surface.white, 0.6) },
  bankOwn: { backgroundColor: tokens.surface.white },
  pressed: { opacity: 0.6 },
  bankText: { flex: 1, minWidth: 0 },
  bankName: { fontSize: tokens.typography.label, lineHeight: 17, fontFamily: font.medium, color: tokens.text.primary },
  bankNameOwn: { fontFamily: font.semibold },
  bankProduct: {
    fontSize: tokens.typography.micro,
    lineHeight: 14,
    fontFamily: font.regular,
    color: tokens.text.tertiary,
    marginTop: 1,
  },
  mono: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRgba(tokens.accent.base, 0.1),
  },
  monoText: { fontSize: 13, lineHeight: 15, fontFamily: font.semibold, color: tokens.accent.deep },

  // --- Сетка «в любой день» ---
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  gridCell: { width: '50%', paddingHorizontal: 4, paddingBottom: 8 },

  // --- Правила ---
  rule: { flexDirection: 'row', gap: tokens.spacing.md },
  ruleNext: {
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
  },
  ruleIcon: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRgba(tokens.accent.base, 0.08),
  },
  ruleTitle: { fontSize: tokens.typography.labelLg, lineHeight: 18, fontFamily: font.semibold, color: tokens.text.primary },
  ruleText: { fontSize: tokens.typography.caption, lineHeight: 18, color: tokens.text.secondary, marginTop: 3 },

  footnote: {
    fontSize: tokens.typography.hint,
    lineHeight: 17,
    color: tokens.text.tertiary,
    textAlign: 'center',
    marginTop: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.lg,
  },
});
