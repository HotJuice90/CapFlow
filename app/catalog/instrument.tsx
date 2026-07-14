import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { Toggle } from '@/components/Toggle';
import { TextField, SelectField, Segmented } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { TYPE_ICON } from './instruments';
import { FILTER_ICON, FILTER_COLOR } from './organizations';
import { ORG_TYPES } from '@/domain/types';
import type {
  CapitalizationMode,
  FinancialInstrument,
  InstrumentTypeId,
  PayoutPeriod,
} from '@/domain/types';
import { appAlert } from '@/lib/dialog';
import { tokens, font, hexToRgba } from '@/theme';
import { uid } from '@/utils/id';

const TYPE_OPTIONS: { label: string; value: InstrumentTypeId }[] = [
  { label: 'Вклад', value: 'deposit' },
  { label: 'Накоп. счёт', value: 'savings' },
  { label: 'Облигация', value: 'bond' },
  { label: 'ЦФА', value: 'dfa' },
];

const PAYOUT_OPTIONS = [
  { label: 'Ежедневно', value: 'daily', icon: 'calendar-today' },
  { label: 'Ежемесячно', value: 'monthly', icon: 'calendar-month' },
  { label: 'Ежеквартально', value: 'quarterly', icon: 'calendar-range' },
  { label: 'Раз в полгода', value: 'semiannual', icon: 'calendar-clock' },
  { label: 'Ежегодно', value: 'annual', icon: 'calendar-star' },
  { label: 'В конце срока', value: 'end', icon: 'flag-checkered' },
];

function behaviorFor(typeId: InstrumentTypeId): 'term' | 'perpetual' {
  return typeId === 'savings' ? 'perpetual' : 'term';
}

export default function InstrumentFormScreen() {
  const { id, orgId: orgIdParam, type: typeParam } = useLocalSearchParams<{ id?: string; orgId?: string; type?: InstrumentTypeId }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, addInstrument, updateInstrument, deleteInstrument } = useData();

  const editing = data.instruments.find((i) => i.id === id);
  const assetCount = editing ? data.assets.filter((a) => a.instrumentId === editing.id).length : 0;

  const [orgId, setOrgId] = useState<string | undefined>(editing?.organizationId ?? orgIdParam);
  const [name, setName] = useState(editing?.name ?? '');
  const [comment, setComment] = useState(editing?.comment ?? '');
  const [typeId, setTypeId] = useState<InstrumentTypeId>(editing?.typeId ?? typeParam ?? 'deposit');
  const [capitalization, setCapitalization] = useState<CapitalizationMode>(
    editing?.capitalization ?? 'none',
  );
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriod | undefined>(editing?.payoutPeriod);
  const [allowTopUp, setAllowTopUp] = useState(editing?.allowTopUp ?? false);
  const [allowWithdraw, setAllowWithdraw] = useState(editing?.allowPartialWithdraw ?? false);

  const orgOptions = useMemo(
    () => data.organizations.filter((o) => !o.archived).map((o) => ({
      label: o.name, value: o.id, color: o.color, logo: o.logo, imageUri: o.customImageUri, filterValue: o.type,
    })),
    [data.organizations],
  );
  const orgFilters = useMemo(
    () => ORG_TYPES.map((t) => ({ label: t, icon: FILTER_ICON[t], color: FILTER_COLOR[t] })),
    [],
  );

  // Пополнение/частичное снятие — реальная опция только у вклада (по продукту бывает
  // и так, и так). У НС это всегда true по умолчанию (это же суть счёта — не настройка).
  // У облигации/ЦФА этого нет вообще: купил — держишь до погашения, «докупить» или
  // частично забрать позицию — это не пополнение счёта, а отдельная операция.
  const showFlowToggles = typeId === 'deposit';
  // Капитализация — реальный выбор только у вклада/НС (оба варианта бывают по продукту).
  // У облигации/ЦФА купон выплачивается, а не капитализируется в номинал — фиксируем «Простой %».
  const showCapitalizationChoice = typeId === 'deposit' || typeId === 'savings';
  const effectiveCapitalization: CapitalizationMode = showCapitalizationChoice ? capitalization : 'none';
  // Капитализация без периода начисления бессмысленна — период становится обязательным.
  const needsPayout = effectiveCapitalization === 'capitalize';
  const canSave = name.trim().length > 0 && !!orgId && (!needsPayout || !!payoutPeriod);

  const onSave = async () => {
    if (!canSave || !orgId) return;
    const instr: FinancialInstrument = {
      id: editing?.id ?? uid('fi-'),
      organizationId: orgId,
      name: name.trim(),
      comment: comment.trim() || undefined,
      typeId,
      behavior: behaviorFor(typeId),
      capitalization: effectiveCapitalization,
      payoutPeriod,
      allowTopUp: typeId === 'savings' ? true : showFlowToggles ? allowTopUp : false,
      allowPartialWithdraw: typeId === 'savings' ? true : showFlowToggles ? allowWithdraw : false,
      isDemo: editing?.isDemo,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    if (editing) await updateInstrument(instr);
    else await addInstrument(instr);
    router.back();
  };

  const onDelete = () => {
    if (!editing) return;
    if (assetCount > 0) {
      appAlert('Нельзя удалить', `На этом инструменте открыто ${assetCount} актив(ов). Сначала закройте или перенесите их.`);
      return;
    }
    appAlert('Удалить инструмент?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteInstrument(editing.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 80,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 100,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <MaterialIcons name="close" size={26} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Инструмент' : 'Новый инструмент'}</Text>
          {editing ? (
            <Pressable onPress={onDelete} hitSlop={12}>
              <MaterialIcons name="delete-outline" size={24} color={tokens.semantic.negative} />
            </Pressable>
          ) : (
            <View style={{ width: 26 }} />
          )}
        </View>

        <Card>
          <SelectField
            label="Площадка"
            value={orgId}
            options={orgOptions}
            placeholder="Выберите площадку"
            onChange={setOrgId}
            onCreateNew={() => router.push('/catalog/organization')}
            createLabel="Новая площадка"
            searchable
            filters={orgFilters}
          />
          <TextField
            label="Название"
            value={name}
            onChangeText={setName}
            placeholder="Например: Альфа-Вклад Максимум"
          />
          <TextField
            label="Заметка (необязательно)"
            value={comment}
            onChangeText={setComment}
            placeholder="Любая информация"
          />
        </Card>

        <Text style={styles.section}>Тип</Text>
        <View style={styles.typeChipsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeChips}>
            {TYPE_OPTIONS.map((opt) => {
              const active = opt.value === typeId;
              const color = tokens.category[opt.value] ?? tokens.accent.base;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.typeChip, active && { backgroundColor: color }]}
                  onPress={() => setTypeId(opt.value)}
                >
                  <MaterialCommunityIcons name={TYPE_ICON[opt.value]} size={16} color={active ? tokens.text.inverse : color} />
                  <Text style={[styles.typeChipText, active ? { color: tokens.text.inverse, fontFamily: font.semibold } : { color }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <Text style={styles.typeHint}>
          {behaviorFor(typeId) === 'term' ? 'Срочный: есть дата окончания' : 'Бессрочный: работает до закрытия'}
        </Text>

        <Text style={styles.section}>Параметры</Text>
        <Card>
          {showCapitalizationChoice ? (
            <Segmented
              label="Проценты по умолчанию"
              value={capitalization}
              options={[
                { label: 'Простой %', value: 'none' },
                { label: 'Капитализация', value: 'capitalize' },
              ]}
              onChange={(v) => setCapitalization(v as CapitalizationMode)}
            />
          ) : null}
          <SelectField
            label={needsPayout ? 'Период выплаты' : 'Период выплаты (необязательно)'}
            value={payoutPeriod}
            options={PAYOUT_OPTIONS}
            placeholder="Не указан"
            onChange={(v) => setPayoutPeriod(v as PayoutPeriod)}
            hint={needsPayout ? 'Нужен для капитализации — без него не посчитать начисление' : undefined}
          />
          {showFlowToggles ? (
            <>
              <ToggleRow label="Пополнение" value={allowTopUp} onChange={setAllowTopUp} />
              <ToggleRow label="Частичное снятие" value={allowWithdraw} onChange={setAllowWithdraw} />
            </>
          ) : null}
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + tokens.spacing.md }]}>
        <Pressable style={[styles.saveBtn, !canSave && styles.disabled]} disabled={!canSave} onPress={onSave}>
          <Text style={styles.saveText}>Сохранить</Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Toggle value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  headerTitle: { fontFamily: font.semibold, fontSize: 24, color: tokens.text.primary, letterSpacing: -0.24 },

  section: {
    fontFamily: font.semibold,
    fontSize: 20,
    color: tokens.text.primary,
    letterSpacing: -0.2,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },

  typeChipsWrap: { marginHorizontal: -tokens.spacing.screenH },
  typeChips: { flexDirection: 'row', gap: 8, paddingHorizontal: tokens.spacing.screenH },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: tokens.surface.tabOff,
  },
  typeChipText: { fontFamily: font.medium, fontSize: 14 },
  typeHint: { fontFamily: font.regular, fontSize: 12, color: tokens.text.tertiary, marginTop: 8 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.sm,
  },
  toggleLabel: { fontSize: tokens.typography.body, color: tokens.text.primary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tokens.spacing.screenH,
    paddingTop: tokens.spacing.md,
    backgroundColor: hexToRgba(tokens.surface.white, 0.85),
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
  },
  saveBtn: {
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  disabled: { backgroundColor: tokens.text.tertiary },
  saveText: { color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '700' },
});
