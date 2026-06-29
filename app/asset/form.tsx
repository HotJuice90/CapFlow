import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import {
  TextField,
  NumberField,
  DateField,
  SelectField,
  Segmented,
} from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { calculate } from '@/calc';
import type { Asset, CapitalizationMode, CurrencyCode, PayoutPeriod } from '@/domain/types';
import { tokens } from '@/theme';
import { formatMoney, formatPercentSigned } from '@/format';
import { uid } from '@/utils/id';

const CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY'];
const PAYOUT_OPTIONS = [
  { label: 'Ежемесячно', value: 'monthly' },
  { label: 'Ежеквартально', value: 'quarterly' },
  { label: 'Раз в полгода', value: 'semiannual' },
  { label: 'Ежегодно', value: 'annual' },
  { label: 'В конце срока', value: 'end' },
  { label: 'Ежедневно', value: 'daily' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AssetFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, addAsset, updateAsset } = useData();

  const editing = data.assets.find((a) => a.id === id);
  const editingInstr = editing
    ? data.instruments.find((i) => i.id === editing.instrumentId)
    : undefined;

  // --- состояние формы ---
  const [orgId, setOrgId] = useState<string | undefined>(editingInstr?.organizationId);
  const [instrumentId, setInstrumentId] = useState<string | undefined>(editing?.instrumentId);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [amount, setAmount] = useState<number | undefined>(editing?.amount);
  const [currency, setCurrency] = useState<CurrencyCode>(editing?.currency ?? data.settings.defaultCurrency);
  const [rate, setRate] = useState<number | undefined>(editing?.rate);
  const [openDate, setOpenDate] = useState<string | undefined>(editing?.openDate ?? todayIso());
  const [endDate, setEndDate] = useState<string | undefined>(editing?.endDate);
  const [capitalization, setCapitalization] = useState<CapitalizationMode>(
    editing?.capitalization ?? 'none',
  );
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriod | undefined>(editing?.payoutPeriod);
  const [comment, setComment] = useState(editing?.comment ?? '');

  const orgOptions = useMemo(
    () =>
      data.organizations
        .filter((o) => !o.archived)
        .map((o) => ({ label: o.name, value: o.id, color: o.color, subtitle: o.type })),
    [data.organizations],
  );

  const instrumentOptions = useMemo(
    () =>
      data.instruments
        .filter((i) => i.organizationId === orgId)
        .map((i) => ({ label: i.name, value: i.id, subtitle: typeLabel(i.typeId) })),
    [data.instruments, orgId],
  );

  const instrument = data.instruments.find((i) => i.id === instrumentId);
  const isTerm = instrument?.behavior === 'term';

  // выбор инструмента — подставляем дефолты
  const onPickInstrument = (value: string) => {
    setInstrumentId(value);
    const instr = data.instruments.find((i) => i.id === value);
    if (instr) {
      if (instr.capitalization) setCapitalization(instr.capitalization);
      if (instr.payoutPeriod) setPayoutPeriod(instr.payoutPeriod);
    }
  };

  // живой предрасчёт
  const preview = useMemo(() => {
    if (!instrument || amount === undefined || rate === undefined || !openDate) return null;
    const draft: Asset = {
      id: editing?.id ?? 'preview',
      instrumentId: instrument.id,
      amount,
      currency,
      rate,
      openDate,
      endDate: isTerm ? endDate : undefined,
      capitalization,
      payoutPeriod,
      status: 'active',
    };
    return calculate(draft, instrument, data.params);
  }, [instrument, amount, rate, openDate, endDate, currency, capitalization, payoutPeriod, isTerm, data.params, editing?.id]);

  const canSave =
    orgId && instrumentId && amount && amount > 0 && rate !== undefined && openDate && (!isTerm || endDate);

  const onSave = async () => {
    if (!canSave || !instrumentId || amount === undefined || rate === undefined || !openDate) return;
    const asset: Asset = {
      id: editing?.id ?? uid('as-'),
      instrumentId,
      title: title.trim() || undefined,
      amount,
      currency,
      rate,
      openDate,
      endDate: isTerm ? endDate : undefined,
      capitalization,
      payoutPeriod,
      comment: comment.trim() || undefined,
      status: editing?.status ?? 'active',
      isDemo: editing?.isDemo,
    };
    if (editing) await updateAsset(asset);
    else await addAsset(asset);
    router.back();
  };

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + tokens.spacing.sm,
            paddingHorizontal: tokens.spacing.screenH,
            paddingBottom: insets.bottom + 100,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <MaterialIcons name="close" size={26} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>{editing ? 'Редактировать актив' : 'Новый актив'}</Text>
            <View style={{ width: 26 }} />
          </View>

          <Card>
            <SelectField
              label="Организация"
              value={orgId}
              options={orgOptions}
              placeholder="Выберите банк / платформу"
              onChange={(v) => {
                setOrgId(v);
                setInstrumentId(undefined);
              }}
              onCreateNew={() => router.push('/catalog/organization')}
              createLabel="Новая организация"
            />

            <SelectField
              label="Финансовый инструмент"
              value={instrumentId}
              options={instrumentOptions}
              placeholder={orgId ? 'Выберите продукт' : 'Сначала выберите организацию'}
              disabled={!orgId}
              onChange={onPickInstrument}
              onCreateNew={orgId ? () => router.push(`/catalog/instrument?orgId=${orgId}`) : undefined}
              createLabel="Новый инструмент"
            />

            <TextField
              label="Название актива (необязательно)"
              value={title}
              onChangeText={setTitle}
              placeholder="Подушка безопасности, Отпуск 2027…"
            />
          </Card>

          <Text style={styles.section}>Параметры</Text>
          <Card>
            <NumberField
              label="Сумма"
              value={amount}
              onChange={setAmount}
              suffix={currency}
              placeholder="0"
            />
            <Segmented
              label="Валюта"
              value={currency}
              options={CURRENCIES.map((c) => ({ label: c, value: c }))}
              onChange={(v) => setCurrency(v as CurrencyCode)}
            />
            <NumberField label="Ставка" value={rate} onChange={setRate} suffix="%" placeholder="0" />
            <DateField label="Дата открытия" value={openDate} onChange={setOpenDate} />
            {isTerm ? (
              <DateField
                label="Дата окончания"
                value={endDate}
                onChange={setEndDate}
                hint="Для срочных инструментов (вклад, ЦФА)"
              />
            ) : null}
            <Segmented
              label="Проценты"
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
            <TextField
              label="Комментарий (необязательно)"
              value={comment}
              onChangeText={setComment}
              placeholder=""
            />
          </Card>

          {preview ? (
            <>
              <Text style={styles.section}>Предварительный расчёт</Text>
              <Card>
                <PreviewRow
                  label="Доход в день"
                  value={`+${formatMoney(preview.incomePerDay, { currency, kopecks: 'hide' })}`}
                  accent
                />
                <Sep />
                {preview.incomeTotalTerm !== undefined ? (
                  <>
                    <PreviewRow
                      label="Доход за весь срок"
                      value={formatMoney(preview.incomeTotalTerm, { currency })}
                    />
                    <Sep />
                  </>
                ) : null}
                <PreviewRow label="Налог (оценка)" value={formatMoney(preview.tax, { currency })} />
                <Sep />
                <PreviewRow label="Чистыми" value={formatMoney(preview.net, { currency })} />
                <Sep />
                <PreviewRow
                  label="Премия к ключевой"
                  value={`${formatPercentSigned(preview.premiumToKeyRate)}`}
                />
              </Card>
            </>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + tokens.spacing.md }]}>
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            disabled={!canSave}
            onPress={onSave}
          >
            <Text style={styles.saveText}>{editing ? 'Сохранить' : 'Создать актив'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function typeLabel(typeId: string): string {
  return typeId === 'deposit' ? 'Вклад' : typeId === 'savings' ? 'Накопительный счёт' : 'ЦФА';
}

function PreviewRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={[styles.previewValue, accent && styles.previewAccent]}>{value}</Text>
    </View>
  );
}

function Sep() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  headerTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  section: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  previewLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  previewValue: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  previewAccent: { color: tokens.accent.base, fontWeight: '700', fontSize: tokens.typography.title },
  sep: { height: 1, backgroundColor: tokens.surface.hairline },
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
  saveBtnDisabled: { backgroundColor: tokens.text.tertiary },
  saveText: { color: '#FFFFFF', fontSize: tokens.typography.body, fontWeight: '700' },
});
