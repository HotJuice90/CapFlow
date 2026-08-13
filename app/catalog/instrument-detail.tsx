import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { TYPE_LABEL } from '@/domain/labels';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { PAYOUT_LABEL } from './instruments';
import { formatDateFull } from '@/format/date';
import { tokens, font } from '@/theme';

// Иконка по типу инструмента — та же пара, что и в AssetRow/TypeCardsRow.
const ICON_BY_TYPE: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
};

export default function InstrumentDetailSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data } = useData();

  const instrument = data.instruments.find((i) => i.id === id);
  const org = instrument ? data.organizations.find((o) => o.id === instrument.organizationId) : undefined;
  const assetCount = instrument ? data.assets.filter((a) => a.instrumentId === instrument.id).length : 0;

  if (!instrument || !org) return null;

  // У облигации/ЦФА нет ни выбора процентов (всегда «Простой %»), ни пополнения/
  // частичного снятия (купил — держишь до погашения) — показывать эти строки
  // для них нечего, та же логика, что и в форме инструмента.
  const showCapitalization = instrument.typeId === 'deposit' || instrument.typeId === 'savings';
  const showFlowInfo = instrument.typeId === 'deposit' || instrument.typeId === 'savings';

  const rows: { label: string; value: string; wrap?: boolean }[] = [
    { label: 'Тип', value: TYPE_LABEL[instrument.typeId] ?? instrument.typeId },
    ...(instrument.createdAt ? [{ label: 'Добавлен', value: formatDateFull(instrument.createdAt) }] : []),
    { label: 'Поведение', value: instrument.behavior === 'term' ? 'Срочный' : 'Бессрочный' },
    ...(showCapitalization ? [{ label: 'Проценты', value: instrument.capitalization === 'capitalize' ? 'Капитализация' : 'Простой %' }] : []),
    { label: 'Период выплаты', value: instrument.payoutPeriod ? PAYOUT_LABEL[instrument.payoutPeriod] : 'Не указан' },
    ...(showFlowInfo ? [
      { label: 'Пополнение', value: instrument.allowTopUp ? 'Разрешено' : 'Нет' },
      { label: 'Частичное снятие', value: instrument.allowPartialWithdraw ? 'Разрешено' : 'Нет' },
    ] : []),
  ];
  // Комментарий — единственное поле, которое переносим, а не режем в одну строку.
  if (instrument.comment) rows.push({ label: 'Заметка', value: instrument.comment, wrap: true });

  const onEdit = () => {
    router.back();
    router.push(`/catalog/instrument?id=${instrument.id}`);
  };

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />

      <View style={s.header}>
        <OrgLogo
          color={org.color}
          logo={org.logo}
          imageUri={org.customImageUri}
          size={48}
          radius={16}
          fallbackIcon={ICON_BY_TYPE[instrument.typeId]}
        />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{instrument.name}</Text>
          <Text style={s.orgName}>{org.name}</Text>
        </View>
      </View>

      <View style={s.list}>
        {rows.map((r, i) => (
          <View key={r.label} style={[s.row, i === rows.length - 1 && s.rowLast]}>
            <Text style={s.rowLabel}>{r.label}</Text>
            <Text style={s.rowValue} numberOfLines={r.wrap ? undefined : 1}>{r.value}</Text>
          </View>
        ))}
      </View>

      <Text style={s.hint}>
        {assetCount > 0 ? `Используется в ${assetCount} актив${assetCount === 1 ? 'е' : 'ах'}` : 'Пока не используется ни в одном активе'}
      </Text>

      <Pressable style={s.editBtn} onPress={onEdit}>
        <Text style={s.editText}>Изменить</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 24 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: tokens.text.primary },
  orgName: { fontFamily: font.regular, fontSize: 13, color: tokens.text.tertiary, marginTop: 2 },

  list: { marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.surface.hairline,
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontFamily: font.regular, fontSize: 14, color: tokens.text.secondary },
  rowValue: { fontFamily: font.medium, fontSize: 14, color: tokens.text.primary, flexShrink: 1, textAlign: 'right' },

  hint: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary, textAlign: 'center', marginBottom: 16 },

  editBtn: {
    height: 52,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.accent.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.inverse },
});
