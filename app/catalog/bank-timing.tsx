import React, { useMemo } from 'react';
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
  CLOSE_RULE,
  MOVE_RULES,
  OPEN_GROUPS,
  TIMING_AS_OF,
  pluralPlatforms,
  timingForOrg,
  timingsBy,
  type BankTiming,
} from '@/domain/bankTiming';
import { tokens, font, hexToRgba } from '@/theme';
import { formatDateFull, pluralDays } from '@/format/date';

/**
 * «Когда открывать счёт» — памятка по срокам у 44 площадок.
 *
 * Главный вопрос у неё один: открывать до 1 числа или после. Поэтому главный
 * блок — вертикальная ось «1 число», а банки стоят по её сторонам. Ось именно
 * ГРАНИЦА, без данных: строки по сторонам не парные, и любое содержимое в
 * центре начали бы читать как связь между соседями, которой нет.
 *
 * Третья группа (период считается от даты открытия) ось ломает — она идёт
 * отдельным блоком чипами, и она же самая большая.
 *
 * Сверху — полоса текущего месяца: она превращает справочник в ответ «окно
 * открытия через N дней». Ниже — площадки пользователя: приложение знает, что
 * у него за банки, и строка про его собственный Газпромбанк полезнее тех же
 * сведений, найденных в списке из 44 названий.
 */
export default function BankTimingScreen() {
  const insets = useSafeAreaInsets();
  const { data } = useData();

  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // Окно — последний день месяца и следующее 1-е: обе стороны оси попадают в
  // него, поэтому «до окна» считаем до последнего дня.
  const toWindow = daysInMonth - day;
  const inWindow = day === daysInMonth || day === 1;

  /** Площадки пользователя, про которые памятка что-то знает. */
  const mine = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; color: string; logo?: string; imageUri?: string; timing: BankTiming }[] = [];
    for (const o of data.organizations) {
      if (o.archived) continue;
      const timing = timingForOrg(o);
      if (!timing || seen.has(timing.name)) continue;
      seen.add(timing.name);
      out.push({ name: o.name, color: o.color, logo: o.logo, imageUri: o.customImageUri, timing });
    }
    return out;
  }, [data.organizations]);

  const left = timingsBy('lastDay');
  const right = timingsBy('firstDay');
  const anyDay = timingsBy('anyDay');

  const open = (t: BankTiming) => {
    tapBuzz();
    openBankTimingSheet(t.name);
  };

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
        <SubHeader title="Когда открывать" />

        {/* Полоса месяца. Прогресс-заливки намеренно нет: на дорожке уже две
            метки — «сегодня» и окно, — а третий слой делал бы из ответа
            диаграмму. */}
        <Card>
          <Text style={st.stripLabel}>{inWindow ? 'Окно открытия' : 'До окна открытия'}</Text>
          <Text style={[st.stripValue, inWindow && { color: tokens.accent.base }]}>
            {inWindow ? 'сегодня' : `${toWindow} ${pluralDays(toWindow)}`}
          </Text>

          <View style={st.strip}>
            <View style={st.track}>
              <View style={[st.window, { width: `${100 / daysInMonth}%` }]} />
              <View
                style={[
                  st.today,
                  // Крайние дни упёрлись бы точкой в торец дорожки — поджимаем,
                  // чтобы она осталась целиком видимой.
                  { left: `${Math.min(97, Math.max(1, ((day - 0.5) / daysInMonth) * 100))}%` },
                ]}
              />
            </View>
            <View style={st.boundary} />
            <View style={st.nextCell} />
          </View>
          <View style={st.stripAxis}>
            <Text style={st.stripTick}>1-е</Text>
            <Text style={st.stripTick}>
              {daysInMonth}-е · 1-е
            </Text>
          </View>
        </Card>

        {mine.length > 0 ? (
          <>
            <Text style={st.section}>Твои площадки</Text>
            <Card padded={false}>
              <View style={st.mineInner}>
                {mine.map((m, i) => (
                  <Pressable
                    key={m.timing.name}
                    style={[st.mineRow, i > 0 && st.mineRowNext]}
                    onPress={() => open(m.timing)}
                  >
                    <OrgLogo color={m.color} logo={m.logo} imageUri={m.imageUri} size={32} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.mineName} numberOfLines={1}>{m.name}</Text>
                      <Text style={st.mineHint} numberOfLines={1}>
                        Открывать {groupTitle(m.timing)}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={tokens.text.tertiary} />
                  </Pressable>
                ))}
              </View>
            </Card>
          </>
        ) : null}

        <Text style={st.section}>Открывать счёт</Text>
        <Card>
          {/* Ось. Подписи групп стоят по своим сторонам и сами объясняют чип —
              отдельная легенда была бы третьим прочтением одного и того же. */}
          <View style={st.axisChipRow}>
            <View style={st.axisChip}>
              <Text style={st.axisChipText}>1 число</Text>
            </View>
          </View>
          <View style={st.axisBody}>
            <View style={st.axisLine} />
            <View style={st.axisCols}>
              <View style={st.colLeft}>
                <Text style={[st.colTitle, st.alignRight]}>в последний{'\n'}день месяца</Text>
                {left.map((t) => (
                  <Pressable key={t.name} onPress={() => open(t)} style={st.nameHit}>
                    <Text style={[st.name, st.alignRight]} numberOfLines={1}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={st.colRight}>
                <Text style={st.colTitle}>с 1-го{'\n'}числа</Text>
                {right.map((t) => (
                  <Pressable key={t.name} onPress={() => open(t)} style={st.nameHit}>
                    <Text style={st.name} numberOfLines={1}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </Card>

        <Text style={st.section}>Можно в любой день</Text>
        <Card>
          <Text style={st.groupHint}>{OPEN_GROUPS[2].hint}</Text>
          <View style={st.chips}>
            {anyDay.map((t) => (
              <Pressable key={t.name} style={st.chip} onPress={() => open(t)}>
                {t.bankId ? <OrgLogo color={tokens.accent.base} logo={t.bankId} size={16} variant="bare" /> : null}
                <Text style={st.chipText}>{t.name}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Text style={st.section}>Правила</Text>
        <Card>
          <Rule icon="close-circle-outline" tint={tokens.value.outflow} title="Закрытие" text={CLOSE_RULE} />
          <View style={st.ruleSep} />
          <Rule
            icon="swap-vertical"
            tint={tokens.accent.base}
            title="Пополнение и вывод"
            text={MOVE_RULES.map((r) => `• ${r}`).join('\n')}
          />
          <View style={st.ruleSep} />
          <Rule
            icon="information-outline"
            tint={tokens.text.tertiary}
            title="Откуда данные"
            text={`Памятка на ${formatDateFull(TIMING_AS_OF)} — ${BANK_TIMING.length} ${pluralPlatforms(BANK_TIMING.length)}. Это сводка, а не условия договора: банки меняют правила, а список обновляется вместе с приложением. Перед открытием счёта сверяйся с тарифами банка.`}
          />
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

function groupTitle(t: BankTiming): string {
  return OPEN_GROUPS.find((g) => g.key === t.openWhen)!.title;
}

function Rule({ icon, tint, title, text }: { icon: string; tint: string; title: string; text: string }) {
  return (
    <View style={st.rule}>
      <View style={[st.ruleIcon, { backgroundColor: hexToRgba(tint, 0.12) }]}>
        <MaterialCommunityIcons name={icon as never} size={16} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.ruleTitle}>{title}</Text>
        <Text style={st.ruleText}>{text}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  section: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginTop: 40,
    marginBottom: 14,
    paddingLeft: 8,
  },

  // --- Полоса месяца ---
  stripLabel: { fontSize: tokens.typography.label, lineHeight: 17, color: tokens.text.secondary },
  stripValue: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: font.semibold,
    color: tokens.text.primary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  strip: { flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.lg },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: hexToRgba(tokens.accent.base, 0.12),
    overflow: 'hidden',
  },
  window: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: tokens.accent.base },
  today: {
    position: 'absolute',
    top: 1,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
    backgroundColor: tokens.accent.deep,
  },
  boundary: { width: 1, height: 16, backgroundColor: hexToRgba(tokens.accent.base, 0.35), marginHorizontal: 4 },
  nextCell: { width: 12, height: 10, borderRadius: 5, backgroundColor: tokens.accent.base },
  stripAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.sm },
  stripTick: { fontSize: tokens.typography.hint, lineHeight: 15, color: tokens.text.tertiary },

  // --- Площадки пользователя ---
  mineInner: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  mineRowNext: { marginTop: tokens.spacing.lg },
  mineName: { fontSize: tokens.typography.labelLg, lineHeight: 17, fontWeight: '600', color: tokens.text.primary },
  mineHint: { fontSize: tokens.typography.hint, lineHeight: 16, color: tokens.text.secondary, marginTop: 2 },

  // --- Ось «1 число» ---
  axisChipRow: { alignItems: 'center' },
  axisChip: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(tokens.accent.base, 0.10),
  },
  axisChipText: { fontSize: tokens.typography.hint, lineHeight: 15, fontFamily: font.semibold, color: tokens.accent.deep },
  axisBody: { marginTop: tokens.spacing.sm },
  axisLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: hexToRgba(tokens.accent.base, 0.18),
  },
  axisCols: { flexDirection: 'row' },
  // Колонки «обнимают» ось: левая выровнена вправо, правая влево — тогда линия
  // читается как граница, а не как случайный разделитель двух таблиц.
  colLeft: { flex: 1, minWidth: 0, paddingRight: tokens.spacing.md },
  colRight: { flex: 1, minWidth: 0, paddingLeft: tokens.spacing.md },
  alignRight: { textAlign: 'right' },
  colTitle: {
    fontSize: tokens.typography.hint,
    lineHeight: 15,
    color: tokens.text.tertiary,
    marginBottom: tokens.spacing.sm,
  },
  nameHit: { paddingVertical: 5 },
  name: { fontSize: tokens.typography.label, lineHeight: 16, fontWeight: '500', color: tokens.text.primary },

  // --- Чипы «в любой день» ---
  groupHint: { fontSize: tokens.typography.hint, lineHeight: 16, color: tokens.text.tertiary, marginBottom: tokens.spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.chip,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(tokens.accent.base, 0.06),
  },
  chipText: { fontSize: tokens.typography.label, lineHeight: 16, fontWeight: '500', color: tokens.text.primary },

  // --- Правила ---
  rule: { flexDirection: 'row', gap: tokens.spacing.md },
  ruleIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { fontSize: tokens.typography.label, lineHeight: 17, fontWeight: '600', color: tokens.text.primary },
  ruleText: { fontSize: tokens.typography.caption, lineHeight: 18, color: tokens.text.secondary, marginTop: 4 },
  ruleSep: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.lg },
});
