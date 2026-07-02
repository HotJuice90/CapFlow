import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { TextField, SelectField, Segmented } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import type {
  CapitalizationMode,
  FinancialInstrument,
  InstrumentTypeId,
  PayoutPeriod,
} from '@/domain/types';
import { tokens } from '@/theme';
import { uid } from '@/utils/id';

const TYPE_OPTIONS: { label: string; value: InstrumentTypeId }[] = [
  { label: 'Вклад', value: 'deposit' },
  { label: 'Накоп. счёт', value: 'savings' },
  { label: 'ЦФА', value: 'dfa' },
];

const PAYOUT_OPTIONS = [
  { label: 'Ежемесячно', value: 'monthly' },
  { label: 'Ежеквартально', value: 'quarterly' },
  { label: 'Раз в полгода', value: 'semiannual' },
  { label: 'Ежегодно', value: 'annual' },
  { label: 'В конце срока', value: 'end' },
  { label: 'Ежедневно', value: 'daily' },
];

function behaviorFor(typeId: InstrumentTypeId): 'term' | 'perpetual' {
  return typeId === 'savings' ? 'perpetual' : 'term';
}

export default function InstrumentFormScreen() {
  const { id, orgId: orgIdParam } = useLocalSearchParams<{ id?: string; orgId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, addInstrument, updateInstrument } = useData();

  const editing = data.instruments.find((i) => i.id === id);

  const [orgId, setOrgId] = useState<string | undefined>(editing?.organizationId ?? orgIdParam);
  const [name, setName] = useState(editing?.name ?? '');
  const [typeId, setTypeId] = useState<InstrumentTypeId>(editing?.typeId ?? 'deposit');
  const [capitalization, setCapitalization] = useState<CapitalizationMode>(
    editing?.capitalization ?? 'none',
  );
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriod | undefined>(editing?.payoutPeriod);
  const [allowTopUp, setAllowTopUp] = useState(editing?.allowTopUp ?? false);
  const [allowWithdraw, setAllowWithdraw] = useState(editing?.allowPartialWithdraw ?? false);

  const orgOptions = useMemo(
    () => data.organizations.filter((o) => !o.archived).map((o) => ({ label: o.name, value: o.id, color: o.color, logo: o.logo })),
    [data.organizations],
  );

  const canSave = name.trim().length > 0 && !!orgId;

  const onSave = async () => {
    if (!canSave || !orgId) return;
    const instr: FinancialInstrument = {
      id: editing?.id ?? uid('fi-'),
      organizationId: orgId,
      name: name.trim(),
      typeId,
      behavior: behaviorFor(typeId),
      capitalization,
      payoutPeriod,
      allowTopUp,
      allowPartialWithdraw: allowWithdraw,
      isDemo: editing?.isDemo,
    };
    if (editing) await updateInstrument(instr);
    else await addInstrument(instr);
    router.back();
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.sm,
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
          <View style={{ width: 26 }} />
        </View>

        <Card>
          <SelectField
            label="Организация"
            value={orgId}
            options={orgOptions}
            placeholder="Выберите организацию"
            onChange={setOrgId}
            onCreateNew={() => router.push('/catalog/organization')}
            createLabel="Новая организация"
          />
          <TextField
            label="Название"
            value={name}
            onChangeText={setName}
            placeholder="Альфа-Вклад Максимум, Яндекс Сейв…"
          />
          <Segmented
            label="Тип"
            value={typeId}
            options={TYPE_OPTIONS}
            onChange={(v) => setTypeId(v)}
            hint={behaviorFor(typeId) === 'term' ? 'Срочный: есть дата окончания' : 'Бессрочный: работает до закрытия'}
          />
          <Segmented
            label="Проценты по умолчанию"
            value={capitalization}
            options={[
              { label: 'Простой %', value: 'none' },
              { label: 'Капитализация', value: 'capitalize' },
            ]}
            onChange={(v) => setCapitalization(v as CapitalizationMode)}
          />
          <SelectField
            label="Период выплаты (необязательно)"
            value={payoutPeriod}
            options={PAYOUT_OPTIONS}
            placeholder="Не указан"
            onChange={(v) => setPayoutPeriod(v as PayoutPeriod)}
          />
          <ToggleRow label="Пополнение" value={allowTopUp} onChange={setAllowTopUp} />
          <ToggleRow label="Частичное снятие" value={allowWithdraw} onChange={setAllowWithdraw} />
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
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: tokens.accent.base, false: tokens.surface.neutral }}
        thumbColor="#FFFFFF"
      />
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
  headerTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
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
    backgroundColor: 'rgba(255,255,255,0.85)',
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
  saveText: { color: '#FFFFFF', fontSize: tokens.typography.body, fontWeight: '700' },
});
