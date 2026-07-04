import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import {
  TextField,
  NumberField,
  DateField,
  SelectField,
  Segmented,
} from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { calculate, diffDays } from '@/calc';
import type {
  Asset,
  CapitalizationMode,
  CurrencyCode,
  FinancialInstrument,
  InstrumentTypeId,
  Organization,
  PayoutPeriod,
} from '@/domain/types';
import { BANKS } from '@/domain/banks';
import { tokens, font } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercentSigned } from '@/format';
import { tapBuzz, successBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';

const CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY'];
const PAYOUT_OPTIONS = [
  { label: 'Ежедневно', value: 'daily', icon: 'calendar-today' },
  { label: 'Ежемесячно', value: 'monthly', icon: 'calendar-month' },
  { label: 'Ежеквартально', value: 'quarterly', icon: 'calendar-range' },
  { label: 'Раз в полгода', value: 'semiannual', icon: 'calendar-clock' },
  { label: 'Ежегодно', value: 'annual', icon: 'calendar-star' },
  { label: 'В конце срока', value: 'end', icon: 'flag-checkered' },
];
const TYPE_OPTIONS: { label: string; value: InstrumentTypeId }[] = [
  { label: 'Вклад', value: 'deposit' },
  { label: 'Накоп. счёт', value: 'savings' },
  { label: 'ЦФА', value: 'dfa' },
];

const ICON_BY_TYPE: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  dfa: 'chart-line',
};

function behaviorFor(typeId: InstrumentTypeId): 'term' | 'perpetual' {
  return typeId === 'savings' ? 'perpetual' : 'term';
}

/** Плавное появление секции: fade + лёгкий подъём (нативный драйвер). */
function FadeIn({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function typeLabel(typeId: string): string {
  return typeId === 'deposit' ? 'Вклад' : typeId === 'savings' ? 'Накопительный счёт' : 'ЦФА';
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Переносит длительность [fromIso, toIso] на сегодня — для даты окончания дубликата вклада. */
function shiftToToday(fromIso: string, toIso: string): string {
  const days = diffDays(fromIso, toIso);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s-]/g, '');
}

/** Выбранный банк: либо существующая организация, либо пресет (создадим при сохранении). */
type BankChoice =
  | { kind: 'org'; org: Organization }
  | { kind: 'preset'; bank: { id: string; name: string; color: string } };

export default function AssetFormScreen() {
  const { id, duplicateFrom } = useLocalSearchParams<{ id?: string; duplicateFrom?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, createAssetBundle, updateAsset } = useData();

  const editing = data.assets.find((a) => a.id === id);
  // Дублирование: подставляем параметры источника как черновик НОВОГО актива —
  // ничего не пишем в хранилище, пока пользователь сам не нажмёт «Сохранить».
  const duplicateSource = !editing ? data.assets.find((a) => a.id === duplicateFrom) : undefined;
  const src = editing ?? duplicateSource;

  const srcInstr = src
    ? data.instruments.find((i) => i.id === src.instrumentId)
    : undefined;
  const srcOrg = srcInstr
    ? data.organizations.find((o) => o.id === srcInstr.organizationId)
    : undefined;

  // Дубликат срочного вклада — переносим ДЛИТЕЛЬНОСТЬ срока на новую дату
  // открытия (сегодня), а не старую абсолютную дату окончания (она могла
  // уже пройти).
  const duplicateEndDate = duplicateSource?.endDate
    ? shiftToToday(duplicateSource.openDate, duplicateSource.endDate)
    : undefined;

  // --- Шаг 1: банк ---
  const [bank, setBank] = useState<BankChoice | null>(srcOrg ? { kind: 'org', org: srcOrg } : null);
  const [bankOpen, setBankOpen] = useState(!srcOrg);
  const [query, setQuery] = useState('');

  // --- Шаг 2: продукт ---
  const [instrumentId, setInstrumentId] = useState<string | undefined>(src?.instrumentId);
  const [newProduct, setNewProduct] = useState(false);
  const [productName, setProductName] = useState('');
  const [typeId, setTypeId] = useState<InstrumentTypeId>('deposit');

  // --- Шаг 3: параметры ---
  const [title, setTitle] = useState(src?.title ?? '');
  const [amount, setAmount] = useState<number | undefined>(src?.amount);
  const [currency, setCurrency] = useState<CurrencyCode>(src?.currency ?? data.settings.defaultCurrency);
  const [rate, setRate] = useState<number | undefined>(src?.rate);
  const [openDate, setOpenDate] = useState<string | undefined>(editing?.openDate ?? todayIso());
  const [endDate, setEndDate] = useState<string | undefined>(editing?.endDate ?? duplicateEndDate);
  const [capitalization, setCapitalization] = useState<CapitalizationMode>(src?.capitalization ?? 'none');
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriod | undefined>(src?.payoutPeriod ?? 'monthly');
  const [comment, setComment] = useState(src?.comment ?? '');

  // Список банков: существующие организации пользователя + пресеты, которых ещё нет.
  const bankList = useMemo<BankChoice[]>(() => {
    const orgs = data.organizations.filter((o) => !o.archived);
    const orgNames = new Set(orgs.map((o) => normalizeName(o.name)));
    const orgLogos = new Set(orgs.map((o) => o.logo).filter(Boolean));
    const presets = BANKS.filter((b) => !orgLogos.has(b.id) && !orgNames.has(normalizeName(b.name)));
    const q = normalizeName(query.trim());
    const all: BankChoice[] = [
      ...orgs.map((org) => ({ kind: 'org' as const, org })),
      ...presets.map((bank) => ({ kind: 'preset' as const, bank })),
    ];
    if (!q) return all;
    return all.filter((c) => normalizeName(c.kind === 'org' ? c.org.name : c.bank.name).includes(q));
  }, [data.organizations, query]);

  // Продукты выбранного банка (только для существующей организации).
  const orgInstruments = useMemo(
    () => (bank?.kind === 'org' ? data.instruments.filter((i) => i.organizationId === bank.org.id) : []),
    [data.instruments, bank],
  );

  const pickBank = (c: BankChoice) => {
    tapBuzz();
    setBank(c);
    setBankOpen(false);
    setQuery('');
    // сбрасываем продукт при смене банка
    setInstrumentId(undefined);
    setNewProduct(c.kind === 'preset' || (c.kind === 'org' && data.instruments.every((i) => i.organizationId !== c.org.id)));
    setProductName('');
  };

  const pickInstrument = (instr: FinancialInstrument) => {
    tapBuzz();
    setInstrumentId(instr.id);
    setNewProduct(false);
    if (instr.capitalization) setCapitalization(instr.capitalization);
    if (instr.payoutPeriod) setPayoutPeriod(instr.payoutPeriod);
  };

  const startNewProduct = () => {
    tapBuzz();
    setInstrumentId(undefined);
    setNewProduct(true);
  };

  const existingInstrument = data.instruments.find((i) => i.id === instrumentId);
  const productChosen = !!existingInstrument || (newProduct && productName.trim().length > 0);
  const isTerm = existingInstrument ? existingInstrument.behavior === 'term' : behaviorFor(typeId) === 'term';

  // Живой предрасчёт: для нового продукта собираем черновик инструмента на лету.
  const previewInstrument: FinancialInstrument | undefined = existingInstrument ?? (productChosen
    ? {
        id: 'draft', organizationId: 'draft', name: productName.trim(), typeId,
        behavior: behaviorFor(typeId), capitalization, payoutPeriod,
      }
    : undefined);

  const preview = useMemo(() => {
    if (!previewInstrument || amount === undefined || rate === undefined || !openDate) return null;
    const draft: Asset = {
      id: editing?.id ?? 'preview',
      instrumentId: previewInstrument.id,
      amount, currency, rate, openDate,
      endDate: isTerm ? endDate : undefined,
      capitalization, payoutPeriod,
      status: 'active',
    };
    return calculate(draft, previewInstrument, data.params);
  }, [previewInstrument, amount, rate, openDate, endDate, currency, capitalization, payoutPeriod, isTerm, data.params, editing?.id]);

  const canSave =
    !!bank && productChosen && !!amount && amount > 0 && rate !== undefined && !!openDate && !!payoutPeriod && (!isTerm || !!endDate);

  const onSave = async () => {
    if (!canSave || !bank || amount === undefined || rate === undefined || !openDate) return;

    // Организация: существующая или создаём из пресета.
    let organization: Organization | undefined;
    let orgId: string;
    if (bank.kind === 'org') {
      orgId = bank.org.id;
    } else {
      organization = { id: uid('org-'), name: bank.bank.name, type: 'Банк', color: bank.bank.color, logo: bank.bank.id };
      orgId = organization.id;
    }

    // Инструмент: существующий или создаём из введённого — параметры актива
    // становятся его дефолтами для следующих активов.
    let instrument: FinancialInstrument | undefined;
    let instrId: string;
    if (existingInstrument) {
      instrId = existingInstrument.id;
    } else {
      instrument = {
        id: uid('fi-'), organizationId: orgId, name: productName.trim(), typeId,
        behavior: behaviorFor(typeId), capitalization, payoutPeriod,
      };
      instrId = instrument.id;
    }

    const asset: Asset = {
      id: editing?.id ?? uid('as-'),
      instrumentId: instrId,
      title: title.trim() || undefined,
      amount, currency, rate, openDate,
      endDate: isTerm ? endDate : undefined,
      capitalization, payoutPeriod,
      comment: comment.trim() || undefined,
      status: editing?.status ?? 'active',
      isDemo: editing?.isDemo,
    };

    // Нельзя сохранить актив 1в1 как уже существующий (тот же продукт, сумма,
    // ставка) — типично при дублировании без правок. Даты НЕ сравниваем: у
    // дубликата openDate всегда «сегодня», а не дата источника, так что по
    // датам они и так почти всегда разные — это не делает их не-дублями.
    const isExactDuplicate = data.assets.some((a) =>
      a.id !== asset.id &&
      a.status === 'active' &&
      a.instrumentId === asset.instrumentId &&
      a.amount === asset.amount &&
      a.currency === asset.currency &&
      a.rate === asset.rate &&
      (a.capitalization ?? 'none') === (asset.capitalization ?? 'none') &&
      (a.payoutPeriod ?? null) === (asset.payoutPeriod ?? null),
    );
    if (isExactDuplicate) {
      appAlert(
        'Такой актив уже есть',
        'Актив с точно такими же продуктом, суммой и ставкой уже существует. Измените что-нибудь перед сохранением.',
        [{ text: 'Понятно' }],
      );
      return;
    }

    if (editing && !organization && !instrument) await updateAsset(asset);
    else await createAssetBundle({ organization, instrument, asset });
    successBuzz();
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
            <Text style={styles.headerTitle}>
              {editing ? 'Редактировать актив' : duplicateSource ? 'Дублировать актив' : 'Новый актив'}
            </Text>
            <View style={{ width: 26 }} />
          </View>

          {/* Шаг 1: банк */}
          <Text style={styles.section}>Банк</Text>
          {bank && !bankOpen ? (
            <Card style={styles.softCard} padded={false}>
              <Pressable style={styles.chosenRow} onPress={() => { tapBuzz(); setBankOpen(true); }}>
                {bank.kind === 'org' ? (
                  <OrgLogo color={bank.org.color} logo={bank.org.logo} size={40} radius={14} />
                ) : (
                  <OrgLogo color={bank.bank.color} logo={bank.bank.id} size={40} radius={14} />
                )}
                <Text style={styles.chosenName} numberOfLines={1}>
                  {bank.kind === 'org' ? bank.org.name : bank.bank.name}
                </Text>
                <Text style={styles.changeText}>Изменить</Text>
              </Pressable>
            </Card>
          ) : (
            <Card style={styles.softCard} padded={false}>
              <View style={styles.searchRow}>
                <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Поиск банка"
                  placeholderTextColor={tokens.text.tertiary}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={tokens.text.tertiary} />
                  </Pressable>
                ) : null}
              </View>
              <ScrollView style={styles.bankList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {bankList.map((c, i) => {
                  const key = c.kind === 'org' ? c.org.id : `preset-${c.bank.id}`;
                  const name = c.kind === 'org' ? c.org.name : c.bank.name;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => pickBank(c)}
                      style={({ pressed }) => [
                        styles.bankRow,
                        i < bankList.length - 1 && styles.rowDivider,
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      {c.kind === 'org' ? (
                        <OrgLogo color={c.org.color} logo={c.org.logo} size={40} radius={14} />
                      ) : (
                        <OrgLogo color={c.bank.color} logo={c.bank.id} size={40} radius={14} />
                      )}
                      <Text style={styles.bankName} numberOfLines={1}>{name}</Text>
                    </Pressable>
                  );
                })}
                {bankList.length === 0 ? (
                  <Text style={styles.emptyHint}>Не нашли — создайте организацию в настройках</Text>
                ) : null}
              </ScrollView>
            </Card>
          )}

          {/* Шаг 2: продукт */}
          {bank ? (
            <FadeIn key={`product-${bank.kind === 'org' ? bank.org.id : bank.bank.id}`}>
              <Text style={styles.section}>Продукт</Text>
              <Card style={styles.softCard}>
                {orgInstruments.length > 0 ? (
                  <View style={{ marginBottom: newProduct ? tokens.spacing.md : 0 }}>
                    {orgInstruments.map((instr, i) => {
                      const active = instrumentId === instr.id;
                      return (
                        <Pressable
                          key={instr.id}
                          onPress={() => pickInstrument(instr)}
                          style={({ pressed }) => [
                            styles.productRow,
                            i < orgInstruments.length - 1 && styles.rowDivider,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <View style={[styles.productIcon, active && styles.productIconActive]}>
                            <MaterialCommunityIcons
                              name={ICON_BY_TYPE[instr.typeId] ?? 'bank-outline'}
                              size={18}
                              color={active ? '#FFFFFF' : tokens.accent.base}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.productName} numberOfLines={1}>{instr.name}</Text>
                            <Text style={styles.productSub} numberOfLines={1}>{typeLabel(instr.typeId)}</Text>
                          </View>
                          {active ? (
                            <MaterialIcons name="check-circle" size={22} color={tokens.accent.base} />
                          ) : (
                            <View style={styles.radioOff} />
                          )}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={startNewProduct}
                      style={({ pressed }) => [styles.newProductRow, pressed && { opacity: 0.6 }]}
                    >
                      <MaterialIcons name="add" size={20} color={tokens.accent.base} />
                      <Text style={styles.newProductText}>Новый продукт</Text>
                    </Pressable>
                  </View>
                ) : null}

                {newProduct || orgInstruments.length === 0 ? (
                  <>
                    <TextField
                      label="Название продукта"
                      value={productName}
                      onChangeText={(t) => { setProductName(t); setNewProduct(true); setInstrumentId(undefined); }}
                      placeholder="Альфа-Вклад Максимум, Яндекс Сейв…"
                    />
                    <Segmented
                      label="Тип"
                      value={typeId}
                      options={TYPE_OPTIONS}
                      onChange={(v) => setTypeId(v)}
                      hint={behaviorFor(typeId) === 'term' ? 'Срочный: есть дата окончания' : 'Бессрочный: работает до закрытия'}
                    />
                  </>
                ) : null}
              </Card>
            </FadeIn>
          ) : null}

          {/* Шаг 3: параметры */}
          {bank && productChosen ? (
            <FadeIn key="params">
              <Text style={styles.section}>Параметры</Text>
              <Card style={styles.softCard}>
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
                  <DateField label="Дата окончания" value={endDate} onChange={setEndDate} />
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
                  label="Период выплаты"
                  value={payoutPeriod}
                  options={PAYOUT_OPTIONS}
                  onChange={(v) => setPayoutPeriod(v as PayoutPeriod)}
                />
                <TextField
                  label="Название актива (необязательно)"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Например: отпуск"
                />
                <TextField
                  label="Комментарий (необязательно)"
                  value={comment}
                  onChangeText={setComment}
                  placeholder=""
                />
              </Card>
            </FadeIn>
          ) : null}

          {/* Живой предрасчёт */}
          {preview ? (
            <FadeIn key="preview">
              <Text style={styles.section}>Предварительный расчёт</Text>
              <Card style={styles.softCard}>
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
            </FadeIn>
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
  softCard: boxShadow('0px 6px 18px rgba(48,69,62,0.05)'),
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.md,
  },
  headerTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  section: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: '#212121',
    letterSpacing: -0.2,
    marginTop: tokens.spacing.lg,
    marginBottom: tokens.spacing.md,
  },

  // банк: поиск + список (стиль как в «Новой организации»)
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#EAF2F9',
  },
  searchInput: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, paddingVertical: tokens.spacing.sm },
  bankList: { maxHeight: 300, paddingHorizontal: tokens.spacing.lg },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#EAF2F9' },
  bankName: { flex: 1, fontFamily: font.medium, fontSize: tokens.typography.body, color: '#212121' },
  emptyHint: { fontFamily: font.regular, paddingVertical: tokens.spacing.xl, color: tokens.text.tertiary, textAlign: 'center' },

  // выбранный банк — компактная строка
  chosenRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md },
  chosenName: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.body, color: '#212121' },
  changeText: { fontFamily: font.semibold, fontSize: tokens.typography.caption, color: tokens.accent.base },

  // продукт
  productRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: 10 },
  productIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.accent.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  productIconActive: { backgroundColor: tokens.accent.base },
  productName: { fontFamily: font.semibold, fontSize: tokens.typography.body, color: '#212121' },
  productSub: { fontFamily: font.regular, fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  radioOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#D8DFE9', marginRight: 1 },
  newProductRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EAF2F9' },
  newProductText: { fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.accent.base },

  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  previewLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  previewValue: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  previewAccent: { color: tokens.accent.base, fontWeight: '700', fontSize: tokens.typography.title },
  sep: { height: 1, backgroundColor: '#EAF2F9' },

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
