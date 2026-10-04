import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OrgLogo } from '@/components/BankLogo';
import { getBankTimingSheet } from '@/lib/bankTimingSheet';
import { BANK_TIMING, CLOSE_RULE, OPEN_GROUPS } from '@/domain/bankTiming';
import { findBank } from '@/domain/banks';
import { tokens, font, hexToRgba } from '@/theme';

/**
 * Памятка по одной площадке: открытие, выплата, закрытие, особенности.
 *
 * Правило закрытия у большинства банков общее, поэтому в блоке «Закрытие» всегда
 * стоит общее правило, а `closeNote` идёт к нему исключением — иначе человек
 * видел бы пустое место и думал, что про его банк просто ничего не известно.
 */
export default function BankTimingDetail() {
  const name = getBankTimingSheet();
  const timing = BANK_TIMING.find((t) => t.name === name);

  useEffect(() => {
    if (!timing) router.back();
  }, [timing]);

  if (!timing) return null;

  const group = OPEN_GROUPS.find((g) => g.key === timing.openWhen)!;
  const bank = findBank(timing.bankId);

  return (
    <View style={st.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={st.grabber} />

      <View style={st.head}>
        <OrgLogo color={bank?.color ?? tokens.accent.base} logo={timing.bankId} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.title} numberOfLines={2}>{timing.name}</Text>
          <Text style={st.subtitle}>Накопительный счёт</Text>
        </View>
      </View>

      <Block icon="calendar-plus" tint={tokens.accent.base} title="Открывать">
        <Text style={st.value}>{capitalize(group.title)}</Text>
        <Text style={st.text}>{timing.openNote ? `${timing.openNote} ${group.hint}` : group.hint}</Text>
      </Block>

      <Block icon="cash-check" tint={tokens.value.earned} title="Выплата процентов">
        <Text style={st.value}>{timing.payout ?? 'Нет данных'}</Text>
        <Text style={st.text}>
          {timing.payout
            ? 'В этот же день деньги можно выводить.'
            : 'В памятке по этой площадке дата выплаты не указана — уточни в банке.'}
        </Text>
      </Block>

      <Block icon="close-circle-outline" tint={tokens.value.outflow} title="Закрытие">
        <Text style={timing.closeNote ? st.value : st.text}>{timing.closeNote ?? CLOSE_RULE}</Text>
        {timing.closeNote ? <Text style={st.text}>{CLOSE_RULE}</Text> : null}
      </Block>

      {timing.note ? (
        <Block icon="alert-circle-outline" tint={tokens.semantic.warning} title="Важно">
          <Text style={st.value}>{timing.note}</Text>
        </Block>
      ) : null}
    </View>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Block({
  icon, tint, title, children,
}: {
  icon: string; tint: string; title: string; children: React.ReactNode;
}) {
  return (
    <View style={[st.block, { backgroundColor: hexToRgba(tint, 0.07) }]}>
      <View style={st.blockHead}>
        <View style={[st.iconBox, { backgroundColor: hexToRgba(tint, 0.16) }]}>
          <MaterialCommunityIcons name={icon as never} size={16} color={tint} />
        </View>
        <Text style={st.blockTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  sheet: {
    backgroundColor: tokens.surface.white,
    paddingHorizontal: tokens.spacing.sheet,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: tokens.radius.grabber,
    backgroundColor: '#E5E8EE',
    alignSelf: 'center',
    marginBottom: 14,
  },

  head: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.lg },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: tokens.text.primary },
  subtitle: { fontSize: tokens.typography.hint, lineHeight: 16, color: tokens.text.tertiary, marginTop: 2 },

  block: {
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
    marginBottom: tokens.spacing.tight,
  },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
  iconBox: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  blockTitle: {
    flexShrink: 1,
    fontSize: tokens.typography.label,
    lineHeight: 17,
    fontWeight: '600',
    color: tokens.text.primary,
  },
  value: { fontSize: tokens.typography.labelLg, lineHeight: 20, fontWeight: '600', color: tokens.text.primary },
  text: { fontSize: tokens.typography.caption, lineHeight: 18, color: tokens.text.secondary, marginTop: 4 },
});
