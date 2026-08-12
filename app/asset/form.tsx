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
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ScreenBackground } from '@/components/ScreenBackground';
import { GradientFooter } from '@/components/GradientFooter';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { Toggle } from '@/components/Toggle';
import { TabChip } from '@/components/TabChip';
import { SlidingChipTabs } from '@/components/SlidingChipTabs';
import {
  Field,
  TextField,
  NumberField,
  DateField,
  SelectField,
  Segmented,
  ColorField,
} from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { calculate, diffDays } from '@/calc';
import { openDatePicker } from '@/lib/datePicker';
import type {
  Asset,
  BalanceAdjustment,
  CapitalizationMode,
  CurrencyCode,
  FinancialInstrument,
  InstrumentTypeId,
  Organization,
  PayoutPeriod,
} from '@/domain/types';
import { ORG_TYPES } from '@/domain/types';
import { BANKS, BRAND_COLORS } from '@/domain/banks';
import { TYPE_ICON } from '../catalog/instruments';
import { ALL, FILTERS, FILTER_ICON, FILTER_COLOR, type Filter } from '../catalog/organizations';
import { ALL_CURRENCIES } from '@/components/RatesSection';
import { tokens, font, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercentSigned, CURRENCY_SYMBOL } from '@/format';
import { tapBuzz, successBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';

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
  { label: 'Облигация', value: 'bond' },
  { label: 'ЦФА', value: 'dfa' },
];
const ORG_TYPE_OPTIONS = ORG_TYPES.map((t) => ({ label: t, value: t, icon: FILTER_ICON[t], iconColor: FILTER_COLOR[t] }));
function behaviorFor(typeId: InstrumentTypeId): 'term' | 'perpetual' {
  return typeId === 'savings' ? 'perpetual' : 'term';
}

// Сетка каталога банков — 5 в ряд, во всю ширину, паддинг = гэп между иконками
// (симметрично со всех сторон), а не «сколько влезет» фиксированным размером тайла.
const BANK_GRID_COLUMNS = 5;
const BANK_GRID_GAP = 10;
function bankTileSize(screenW: number): number {
  const contentW = screenW - tokens.spacing.screenH * 2 - BANK_GRID_GAP * 2;
  return (contentW - BANK_GRID_GAP * (BANK_GRID_COLUMNS - 1)) / BANK_GRID_COLUMNS;
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
  if (typeId === 'deposit') return 'Вклад';
  if (typeId === 'savings') return 'Накопительный счёт';
  if (typeId === 'bond') return 'Облигация';
  return 'ЦФА';
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

/** Черновик новой площадки — та же форма данных, что у Organization, но без id (создаётся при сохранении актива). */
interface NewOrgDraft {
  name: string;
  type: string;
  color: string;
  logo?: string;
  customImageUri?: string;
}

export default function AssetFormScreen() {
  const { id, duplicateFrom } = useLocalSearchParams<{ id?: string; duplicateFrom?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const bankTileW = bankTileSize(screenW);
  const { data, createAssetBundle, updateAsset, addFreeCapitalEntry } = useData();

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

  // --- Шаг 1: площадка (те же механизмы, что в «Площадках»: поиск+фильтры по
  // существующим, каталог банков или своя площадка с фото — прямо тут, без
  // перехода на другой экран). ---
  const [orgId, setOrgId] = useState<string | undefined>(srcOrg?.id);
  const [newOrgDraft, setNewOrgDraft] = useState<NewOrgDraft | undefined>();
  const [platformOpen, setPlatformOpen] = useState(!srcOrg);
  const [platformStage, setPlatformStage] = useState<'picking' | 'creating'>('picking');
  const [platformFilter, setPlatformFilter] = useState<Filter>(ALL);
  const [platformQuery, setPlatformQuery] = useState('');
  // Свой скроллбар для списка площадок (нативный не стилизуется под наш акцент/
  // форму) — трек+ползунок считаем сами из позиции скролла и высоты контента.
  const [bankScrollY, setBankScrollY] = useState(0);
  const [bankContentH, setBankContentH] = useState(0);
  const [bankContainerH, setBankContainerH] = useState(0);
  const [orgMode, setOrgMode] = useState<'catalog' | 'custom'>('catalog');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<string>('Банк');
  const [customColor, setCustomColor] = useState(BRAND_COLORS[4]);
  const [customImageUri, setCustomImageUri] = useState<string | undefined>();

  // --- Шаг 2: продукт ---
  const [instrumentId, setInstrumentId] = useState<string | undefined>(src?.instrumentId);
  const [newProduct, setNewProduct] = useState(false);
  const [productName, setProductName] = useState('');
  const [typeId, setTypeId] = useState<InstrumentTypeId>('deposit');
  const [allowTopUp, setAllowTopUp] = useState(false);
  const [allowWithdraw, setAllowWithdraw] = useState(false);

  // --- Шаг 3: параметры ---
  const [title, setTitle] = useState(src?.title ?? '');
  const [amount, setAmount] = useState<number | undefined>(src?.amount);
  const [fundFromFree, setFundFromFree] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>(src?.currency ?? data.settings.defaultCurrency);
  const [rate, setRate] = useState<number | undefined>(src?.rate);
  const [openDate, setOpenDate] = useState<string | undefined>(editing?.openDate ?? todayIso());
  const [endDate, setEndDate] = useState<string | undefined>(editing?.endDate ?? duplicateEndDate);
  const [capitalization, setCapitalization] = useState<CapitalizationMode>(src?.capitalization ?? 'none');
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriod | undefined>(src?.payoutPeriod);
  const [taxWithheldByBank, setTaxWithheldByBank] = useState(src?.taxWithheldByBank ?? false);

  // Снимок состояния сразу после загрузки экрана — с ним сравниваем текущие
  // значения, чтобы понять, начал ли пользователь что-то менять (для
  // подтверждения на закрытие без сохранения).
  const initial = useRef({
    orgId, instrumentId, title, amount, currency, rate, openDate, endDate, capitalization, payoutPeriod,
  }).current;
  const isDirty =
    orgId !== initial.orgId ||
    !!newOrgDraft ||
    instrumentId !== initial.instrumentId ||
    newProduct ||
    title !== initial.title ||
    amount !== initial.amount ||
    currency !== initial.currency ||
    rate !== initial.rate ||
    openDate !== initial.openDate ||
    endDate !== initial.endDate ||
    capitalization !== initial.capitalization ||
    payoutPeriod !== initial.payoutPeriod;

  const handleClose = () => {
    if (isDirty) {
      appAlert('Выйти без сохранения?', 'Введённые данные не сохранятся.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const chosenOrg = orgId ? data.organizations.find((o) => o.id === orgId) : undefined;
  const platform: { name: string; type: string; color: string; logo?: string; customImageUri?: string } | undefined =
    chosenOrg
      ? { name: chosenOrg.name, type: chosenOrg.type, color: chosenOrg.color, logo: chosenOrg.logo, customImageUri: chosenOrg.customImageUri }
      : newOrgDraft
      ? { name: newOrgDraft.name, type: newOrgDraft.type, color: newOrgDraft.color, logo: newOrgDraft.logo, customImageUri: newOrgDraft.customImageUri }
      : undefined;
  const platformTypeIcon = platform ? (FILTER_ICON as Record<string, keyof typeof MaterialCommunityIcons.glyphMap>)[platform.type] ?? 'view-grid-outline' : undefined;

  // Существующие площадки — поиск + фильтр по типу, как на экране «Площадки».
  const existingOrgs = useMemo(() => {
    const q = platformQuery.trim().toLowerCase();
    return data.organizations.filter(
      (o) => !o.archived && (platformFilter === ALL || o.type === platformFilter) && (!q || o.name.toLowerCase().includes(q)),
    );
  }, [data.organizations, platformFilter, platformQuery]);

  // Каталог банков — как на экране «Новая площадка».
  const filteredBanks = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return BANKS;
    return BANKS.filter((b) => b.name.toLowerCase().includes(q));
  }, [catalogQuery]);

  // Продукты выбранной площадки (у новой площадки продуктов пока нет).
  const orgInstruments = useMemo(
    () => (chosenOrg ? data.instruments.filter((i) => i.organizationId === chosenOrg.id) : []),
    [data.instruments, chosenOrg],
  );

  const resetProductStep = () => {
    setInstrumentId(undefined);
    setNewProduct(true);
    setProductName('');
  };

  const openPlatformPicker = () => {
    tapBuzz();
    setPlatformStage('picking');
    setPlatformOpen(true);
  };

  const pickExistingOrg = (org: Organization) => {
    tapBuzz();
    setOrgId(org.id);
    setNewOrgDraft(undefined);
    setPlatformOpen(false);
    setInstrumentId(undefined);
    setNewProduct(data.instruments.every((i) => i.organizationId !== org.id));
    setProductName('');
  };

  // Площадка — стабильный идентификатор конкретного банка: не даём завести
  // дубль, если такой уже есть в списке пользователя (та же защита, что в
  // форме «Новая площадка»).
  const pickCatalogBank = (bank: { id: string; name: string; color: string; type?: string }) => {
    const duplicate = data.organizations.find((o) => !o.archived && o.logo === bank.id);
    if (duplicate) {
      appAlert('Уже добавлено', `«${duplicate.name}» уже есть в списке площадок. Выбрать её?`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выбрать', onPress: () => pickExistingOrg(duplicate) },
      ]);
      return;
    }
    tapBuzz();
    setNewOrgDraft({ name: bank.name, type: bank.type ?? 'Банк', color: bank.color, logo: bank.id });
    setOrgId(undefined);
    setPlatformOpen(false);
    resetProductStep();
  };

  const pickPlatformImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert('Нет доступа', 'Разреши доступ к галерее в настройках телефона, чтобы загрузить фото.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const dir = `${FileSystem.documentDirectory}org-logos/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const dest = `${dir}${uid('logo-')}.jpg`;
    await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
    tapBuzz();
    setCustomImageUri(dest);
  };

  const confirmCustomOrg = () => {
    if (!customName.trim()) return;
    tapBuzz();
    setNewOrgDraft({ name: customName.trim(), type: customType, color: customColor, customImageUri });
    setOrgId(undefined);
    setPlatformOpen(false);
    resetProductStep();
  };

  const pickInstrument = (instr: FinancialInstrument) => {
    tapBuzz();
    setInstrumentId(instr.id);
    setNewProduct(false);
    setTypeId(instr.typeId);
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
  // Реальный тип продукта: у существующего инструмента — его собственный, у
  // нового — то, что выбрано чипами. Определяет, какие поля дальше показывать.
  const effectiveTypeId: InstrumentTypeId = existingInstrument?.typeId ?? typeId;
  const isTerm = existingInstrument ? existingInstrument.behavior === 'term' : behaviorFor(effectiveTypeId) === 'term';

  // Пополнение/частичное снятие — реальная опция только у вклада. У НС это
  // всегда true по умолчанию (суть счёта, не настройка). У облигации/ЦФА —
  // купил и держишь до погашения, этого понятия нет вовсе.
  const showFlowToggles = effectiveTypeId === 'deposit';
  // Капитализация — реальный выбор только у вклада/НС. У облигации/ЦФА купон
  // выплачивается, а не капитализируется в номинал — фиксируем «Простой %».
  const showCapitalizationChoice = effectiveTypeId === 'deposit' || effectiveTypeId === 'savings';
  const effectiveCapitalization: CapitalizationMode = showCapitalizationChoice ? capitalization : 'none';
  // Капитализация без периода начисления бессмысленна — период становится обязательным.
  const needsPayout = effectiveCapitalization === 'capitalize';

  // Живой предрасчёт: для нового продукта собираем черновик инструмента на лету.
  const previewInstrument: FinancialInstrument | undefined = existingInstrument ?? (productChosen
    ? {
        id: 'draft', organizationId: 'draft', name: productName.trim(), typeId: effectiveTypeId,
        behavior: behaviorFor(effectiveTypeId), capitalization: effectiveCapitalization, payoutPeriod,
      }
    : undefined);

  const preview = useMemo(() => {
    if (!previewInstrument || amount === undefined || rate === undefined || !openDate) return null;
    const draft: Asset = {
      id: editing?.id ?? 'preview',
      instrumentId: previewInstrument.id,
      amount, currency, rate, openDate,
      endDate: isTerm ? endDate : undefined,
      capitalization: effectiveCapitalization, payoutPeriod,
      status: 'active',
    };
    return calculate(draft, previewInstrument, data.params);
  }, [previewInstrument, amount, rate, openDate, endDate, currency, effectiveCapitalization, payoutPeriod, isTerm, data.params, editing?.id]);

  const canSave =
    !!platform && productChosen && !!amount && amount > 0 && rate !== undefined && !!openDate &&
    (!needsPayout || !!payoutPeriod) && (!isTerm || !!endDate);

  // Баланс свободных денег именно в валюте актива — без конвертации по курсу,
  // чтобы списание было точным (лента считает сумму по каждой валюте отдельно).
  const freeBalanceInCurrency = useMemo(
    () => data.freeCapitalEntries.filter((e) => e.currency === currency).reduce((sum, e) => sum + e.amount, 0),
    [data.freeCapitalEntries, currency],
  );

  const commit = async (
    asset: Asset,
    organization: Organization | undefined,
    instrument: FinancialInstrument | undefined,
  ) => {
    if (editing && !organization && !instrument) await updateAsset(asset);
    else await createAssetBundle({ organization, instrument, asset });
    if (!editing && fundFromFree && amount !== undefined) {
      await addFreeCapitalEntry({
        id: uid('fce-'),
        date: asset.openDate,
        amount: -amount,
        currency,
        comment: title.trim() || productName.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
    }
    successBuzz();
    router.back();
  };

  /**
   * Правка суммы у актива, который уже прожил хотя бы день, — развилка, без
   * которой график капитала врёт. `asset.amount` — это тело НА ДАТУ ОТКРЫТИЯ, и
   * история (`capitalHistorySeries`) пересчитывает каждый день от него. Значит
   * молча переписать сумму = переписать всё прошлое актива задним числом: если
   * часть денег реально ушла вчера на новый счёт, старый актив «всегда» был
   * меньше, а новый добавляет свою сумму со своей даты — и на графике вылезает
   * скачок капитала на пустом месте (деньги-то просто переложили).
   * Поэтому спрашиваем то же, что и шит «Изменить баланс»: исправление это
   * (сумма всегда была такой) или движение денег (изменилась с какой-то даты).
   */
  const askAmountChangeKind = (asset: Asset) => {
    appAlert(
      'Сумма изменилась',
      'Что произошло на самом деле? «Так было всегда» перепишет историю актива новой суммой. «Деньги двигались» оставит прошлое как было и запишет изменение с нужной даты — тогда график капитала не даст ложный скачок.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Деньги двигались', onPress: () => askMoveDate(asset) },
        { text: 'Так было всегда', onPress: () => { void commit(asset, undefined, undefined); } },
      ],
    );
  };

  const askMoveDate = (asset: Asset) => {
    const today = todayIso();
    openDatePicker({
      title: 'Когда изменилась сумма',
      value: today,
      minDate: asset.openDate,
      maxDate: today,
      onPick: (iso) => {
        // Тело на дату открытия возвращаем исходное, а новую сумму пишем
        // корректировкой баланса — ровно так же, как это делает шит
        // «Изменить баланс» (BalanceAdjustment.amount = НОВЫЙ баланс).
        const adjustment: BalanceAdjustment = { id: uid('badj-'), date: iso, amount: asset.amount };
        void commit(
          {
            ...asset,
            amount: initial.amount ?? asset.amount,
            balanceAdjustments: [...(asset.balanceAdjustments ?? []), adjustment],
          },
          undefined,
          undefined,
        );
      },
    });
  };

  const onSave = async () => {
    if (!canSave || !platform || amount === undefined || rate === undefined || !openDate) return;

    // Площадка: существующая или создаём из черновика (каталог/своя).
    let organization: Organization | undefined;
    let orgIdFinal: string;
    if (chosenOrg) {
      orgIdFinal = chosenOrg.id;
    } else if (newOrgDraft) {
      organization = {
        id: uid('org-'),
        name: newOrgDraft.name,
        type: newOrgDraft.type,
        color: newOrgDraft.color,
        logo: newOrgDraft.logo,
        customImageUri: newOrgDraft.customImageUri,
      };
      orgIdFinal = organization.id;
    } else {
      return;
    }

    // Инструмент: существующий или создаём из введённого — параметры актива
    // становятся его дефолтами для следующих активов.
    let instrument: FinancialInstrument | undefined;
    let instrId: string;
    if (existingInstrument) {
      instrId = existingInstrument.id;
    } else {
      instrument = {
        id: uid('fi-'), organizationId: orgIdFinal, name: productName.trim(), typeId: effectiveTypeId,
        behavior: behaviorFor(effectiveTypeId), capitalization: effectiveCapitalization, payoutPeriod,
        allowTopUp: effectiveTypeId === 'savings' ? true : showFlowToggles ? allowTopUp : false,
        allowPartialWithdraw: effectiveTypeId === 'savings' ? true : showFlowToggles ? allowWithdraw : false,
        createdAt: new Date().toISOString(),
      };
      instrId = instrument.id;
    }

    const asset: Asset = {
      id: editing?.id ?? uid('as-'),
      instrumentId: instrId,
      title: title.trim() || undefined,
      amount, currency, rate, openDate,
      endDate: isTerm ? endDate : undefined,
      capitalization: effectiveCapitalization, payoutPeriod,
      status: editing?.status ?? 'active',
      isDemo: editing?.isDemo,
      taxWithheldByBank,
      // При редактировании updateAsset ЗАМЕНЯЕТ весь объект — не теряем историю.
      balanceAdjustments: editing?.balanceAdjustments,
      rateAdjustments: editing?.rateAdjustments,
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
        'Актив с точно таким же инструментом, суммой и ставкой уже существует. Измените что-нибудь перед сохранением.',
        [{ text: 'Понятно' }],
      );
      return;
    }

    // Сумму у уже живущего актива нельзя менять молча — см. askAmountChangeKind.
    // Актив, открытый сегодня, истории ещё не имеет: там переписывать нечего.
    const rewritesHistory =
      !!editing && !organization && !instrument &&
      initial.amount !== undefined && amount !== initial.amount &&
      asset.openDate < todayIso();
    if (rewritesHistory) {
      askAmountChangeKind(asset);
      return;
    }

    await commit(asset, organization, instrument);
  };

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: tokens.spacing.screenTop,
            paddingHorizontal: tokens.spacing.screenH,
            paddingBottom: insets.bottom + 100,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="close" size={24} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>
              {editing ? 'Редактировать актив' : duplicateSource ? 'Дублировать актив' : 'Новый актив'}
            </Text>
          </View>

          {/* Шаг 1: площадка */}
          <Text style={styles.section}>Площадка</Text>
          {platform && !platformOpen ? (
            <Card style={styles.softCard} padded={false}>
              <Pressable style={styles.chosenRow} onPress={openPlatformPicker}>
                <OrgLogo color={platform.color} logo={platform.logo} imageUri={platform.customImageUri} size={40} radius={14} fallbackIcon={platformTypeIcon} />
                <Text style={styles.chosenName} numberOfLines={1}>{platform.name}</Text>
                <Text style={styles.changeText}>Изменить</Text>
              </Pressable>
            </Card>
          ) : platformStage === 'picking' ? (
            <>
              {/* Табы фильтра — прямо на фоне экрана, не внутри карточки: иначе
                  непонятно, что по ним вообще можно тапать (выглядели частью
                  статичного списка). */}
              <View style={styles.tabBarRowOuter}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {FILTERS.map((t) => {
                    const active = t === platformFilter;
                    const color = FILTER_COLOR[t];
                    return (
                      <TabChip
                        key={t}
                        active={active}
                        onPress={() => setPlatformFilter(t)}
                        label={t}
                        icon={<MaterialCommunityIcons name={FILTER_ICON[t]} size={15} color={active ? tokens.text.inverse : color} />}
                        chipStyle={styles.tabChip}
                        bgOff={tokens.surface.tabOff}
                        bgOn={color}
                        textStyle={styles.tabChipText}
                        textColorOff={color}
                        textColorOn={tokens.text.inverse}
                        activeFontFamily={font.semibold}
                      />
                    );
                  })}
                </ScrollView>
              </View>

              <Card style={styles.softCard} padded={false}>
                <View style={styles.platformInnerPicking}>
                  <View style={styles.searchRow}>
                    <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
                    <TextInput
                      style={styles.searchInput}
                      value={platformQuery}
                      onChangeText={setPlatformQuery}
                      placeholder="Поиск по названию"
                      placeholderTextColor={tokens.text.tertiary}
                    />
                    {platformQuery.length > 0 ? (
                      <Pressable onPress={() => setPlatformQuery('')} hitSlop={8}>
                        <MaterialIcons name="close" size={18} color={tokens.text.tertiary} />
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Окно на ~5 позиций со своим скроллбаром (нативный не красится
                      под акцент) — трек светло-серый, ползунок акцентный синий,
                      виден только когда реально есть что скроллить. */}
                  <View style={styles.bankListWrap}>
                    <ScrollView
                      style={styles.bankList}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      scrollEventThrottle={16}
                      onScroll={(e) => setBankScrollY(e.nativeEvent.contentOffset.y)}
                      onContentSizeChange={(_w, h) => setBankContentH(h)}
                      onLayout={(e) => setBankContainerH(e.nativeEvent.layout.height)}
                    >
                      {existingOrgs.map((org, i) => (
                        <Pressable
                          key={org.id}
                          onPress={() => pickExistingOrg(org)}
                          style={({ pressed }) => [styles.bankRow, i < existingOrgs.length - 1 && styles.rowDivider, pressed && { opacity: 0.6 }]}
                        >
                          <OrgLogo
                            color={org.color}
                            logo={org.logo}
                            imageUri={org.customImageUri}
                            size={40}
                            radius={14}
                            fallbackIcon={(FILTER_ICON as Record<string, keyof typeof MaterialCommunityIcons.glyphMap>)[org.type] ?? 'view-grid-outline'}
                          />
                          <Text style={styles.bankName} numberOfLines={1}>{org.name}</Text>
                        </Pressable>
                      ))}
                      {existingOrgs.length === 0 ? (
                        <Text style={styles.emptyHint}>Ничего не нашлось</Text>
                      ) : null}
                    </ScrollView>
                    {existingOrgs.length > 5 && bankContentH > bankContainerH && bankContainerH > 0 ? (
                      <View style={styles.bankScrollTrack}>
                        <View
                          style={[
                            styles.bankScrollThumb,
                            {
                              height: Math.max(24, (bankContainerH / bankContentH) * bankContainerH),
                              transform: [{
                                translateY: Math.min(
                                  bankContainerH - Math.max(24, (bankContainerH / bankContentH) * bankContainerH),
                                  Math.max(0, (bankScrollY / (bankContentH - bankContainerH)) * (bankContainerH - Math.max(24, (bankContainerH / bankContentH) * bankContainerH))),
                                ),
                              }],
                            },
                          ]}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>

              {/* Скролл есть — значит кнопка ЖИВЁТ снаружи, не последней строкой
                  внутри списка (там её не видно, пока не долистаешь). */}
              <Pressable
                onPress={() => setPlatformStage('creating')}
                style={({ pressed }) => [styles.newPlatformBtn, pressed && { opacity: 0.6 }]}
              >
                <MaterialIcons name="add" size={20} color={tokens.accent.base} />
                <Text style={styles.newProductText}>Новая площадка</Text>
              </Pressable>
            </>
          ) : (
            <Card style={styles.softCard} padded={false}>
              <View style={styles.platformInner}>
                <Pressable onPress={() => setPlatformStage('picking')} hitSlop={8} style={styles.backLink}>
                  <MaterialIcons name="arrow-back-ios-new" size={13} color={tokens.text.tertiary} />
                  <Text style={styles.backLinkText}>К списку площадок</Text>
                </Pressable>

                <View style={styles.modeRow}>
                  <Pressable
                    style={[styles.modeChip, orgMode === 'catalog' && styles.modeChipActive]}
                    onPress={() => setOrgMode('catalog')}
                  >
                    <MaterialCommunityIcons name="view-grid-outline" size={17} color={orgMode === 'catalog' ? tokens.text.inverse : tokens.accent.base} />
                    <Text style={[styles.modeText, orgMode === 'catalog' && styles.modeTextActive]}>Из каталога</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeChip, orgMode === 'custom' && styles.modeChipActive]}
                    onPress={() => setOrgMode('custom')}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={17} color={orgMode === 'custom' ? tokens.text.inverse : tokens.accent.base} />
                    <Text style={[styles.modeText, orgMode === 'custom' && styles.modeTextActive]}>Своя</Text>
                  </Pressable>
                </View>

                {orgMode === 'catalog' ? (
                  <>
                    <View style={styles.searchRow}>
                      <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
                      <TextInput
                        style={styles.searchInput}
                        value={catalogQuery}
                        onChangeText={setCatalogQuery}
                        placeholder="Поиск в каталоге"
                        placeholderTextColor={tokens.text.tertiary}
                      />
                      {catalogQuery.length > 0 ? (
                        <Pressable onPress={() => setCatalogQuery('')} hitSlop={8}>
                          <MaterialIcons name="close" size={18} color={tokens.text.tertiary} />
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.bankGrid}>
                      {filteredBanks.map((bank) => (
                        <Pressable key={bank.id} style={{ width: bankTileW }} onPress={() => pickCatalogBank(bank)}>
                          <OrgLogo color={bank.color} logo={bank.id} size={bankTileW} radius={Math.round(bankTileW / 3.2)} />
                        </Pressable>
                      ))}
                      {filteredBanks.length === 0 ? (
                        <Text style={styles.bankEmpty}>Не нашли — переключитесь на «Свою»</Text>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.logoRow}>
                      {customImageUri ? (
                        <OrgLogo color={customColor} imageUri={customImageUri} size={72} radius={22} />
                      ) : (
                        <Pressable style={[styles.logoPlaceholder, { borderColor: customColor }]} onPress={pickPlatformImage}>
                          <MaterialCommunityIcons name="bank-outline" size={28} color={customColor} />
                        </Pressable>
                      )}
                      <View style={styles.logoActions}>
                        <Pressable style={styles.uploadBtn} onPress={pickPlatformImage}>
                          <MaterialIcons name="add-a-photo" size={16} color={tokens.accent.base} />
                          <Text style={styles.uploadText}>{customImageUri ? 'Заменить лого' : 'Загрузить лого'}</Text>
                        </Pressable>
                        {customImageUri ? (
                          <Pressable onPress={() => setCustomImageUri(undefined)} hitSlop={8} style={styles.removePhotoBtn}>
                            <MaterialIcons name="close" size={16} color={tokens.text.tertiary} />
                            <Text style={styles.removePhotoText}>Убрать лого</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.customFields}>
                      <TextField label="Название" value={customName} onChangeText={setCustomName} placeholder="Например: Мой банк" />
                      <SelectField label="Тип" value={customType} options={ORG_TYPE_OPTIONS} onChange={setCustomType} />
                      <ColorField
                        label="Цвет бренда"
                        value={customColor}
                        onChange={(c) => { setCustomColor(c); setCustomImageUri(undefined); }}
                        colors={BRAND_COLORS}
                      />
                    </View>
                    <Pressable
                      style={[styles.confirmBtn, !customName.trim() && styles.confirmBtnDisabled]}
                      disabled={!customName.trim()}
                      onPress={confirmCustomOrg}
                    >
                      <Text style={styles.confirmBtnText}>Добавить площадку</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Card>
          )}

          {/* Шаг 2: продукт */}
          {platform ? (
            <FadeIn key={`product-${chosenOrg?.id ?? newOrgDraft?.name ?? 'new'}`}>
              <Text style={styles.section}>Инструмент</Text>
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
                              name={TYPE_ICON[instr.typeId] ?? 'bank-outline'}
                              size={18}
                              color={active ? tokens.text.inverse : tokens.accent.base}
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
                      <Text style={styles.newProductText}>Новый инструмент</Text>
                    </Pressable>
                  </View>
                ) : null}

                {newProduct || orgInstruments.length === 0 ? (
                  <TextField
                    label="Название инструмента"
                    value={productName}
                    onChangeText={(t) => { setProductName(t); setNewProduct(true); setInstrumentId(undefined); }}
                    placeholder="Альфа-Вклад Максимум, Яндекс Сейв…"
                  />
                ) : null}
              </Card>

              {newProduct || orgInstruments.length === 0 ? (
                <>
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

                  {showFlowToggles ? (
                    <Card style={[styles.softCard, { marginTop: tokens.spacing.md }]}>
                      <ToggleRow label="Пополнение" value={allowTopUp} onChange={setAllowTopUp} />
                      <ToggleRow label="Частичное снятие" value={allowWithdraw} onChange={setAllowWithdraw} />
                    </Card>
                  ) : null}
                </>
              ) : null}
            </FadeIn>
          ) : null}

          {/* Шаг 3: параметры */}
          {platform && productChosen ? (
            <FadeIn key="params">
              <Text style={styles.section}>Параметры</Text>
              <Card style={styles.softCard}>
                <NumberField
                  label="Сумма"
                  value={amount}
                  onChange={setAmount}
                  suffix={CURRENCY_SYMBOL[currency]}
                  placeholder="0"
                  grouped
                />
                {!editing ? (
                  <>
                    <ToggleRow
                      label="Списать из свободных денег"
                      value={fundFromFree}
                      onChange={setFundFromFree}
                    />
                    {fundFromFree ? (
                      <Text style={styles.freeCapitalHint}>
                        {freeBalanceInCurrency > 0
                          ? `Доступно: ${formatMoney(freeBalanceInCurrency, { currency })}`
                          : 'Нет свободных денег в этой валюте — баланс уйдёт в минус'}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                <Field label="Валюта">
                  <View style={styles.currencyBarClip}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <SlidingChipTabs
                        items={ALL_CURRENCIES.map((c) => ({ key: c, label: c }))}
                        value={currency}
                        onChange={setCurrency}
                        trackStyle={styles.currencyBar}
                        chipStyle={styles.currencyTab}
                        pillColor={tokens.accent.light}
                        textStyle={styles.currencyTabText}
                        textColorOff={hexToRgba(tokens.text.primary, 0.5)}
                        textColorOn={tokens.text.inverse}
                      />
                    </ScrollView>
                  </View>
                </Field>
                <NumberField label="Ставка" value={rate} onChange={setRate} suffix="%" placeholder="0" />
                <DateField label="Дата открытия" value={openDate} onChange={setOpenDate} />
                {isTerm ? (
                  <DateField label="Дата окончания" value={endDate} onChange={setEndDate} />
                ) : null}
                {showCapitalizationChoice ? (
                  <Segmented
                    label="Проценты"
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
                <ToggleRow
                  label="Налог удерживает банк"
                  value={taxWithheldByBank}
                  onChange={setTaxWithheldByBank}
                  style={{ marginBottom: tokens.spacing.lg }}
                />
                <TextField
                  label="Заметка (необязательно)"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Например: отпуск"
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

        <GradientFooter style={[styles.footer, { paddingBottom: insets.bottom + tokens.spacing.md }]}>
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            disabled={!canSave}
            onPress={onSave}
          >
            <Text style={styles.saveText}>{editing ? 'Сохранить' : 'Создать актив'}</Text>
          </Pressable>
        </GradientFooter>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  style,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.toggleRow, style]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Toggle value={value} onChange={onChange} />
    </View>
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
  softCard: boxShadow(tokens.shadow.subtle),
  // Тот же стиль, что и таб-бар «Динамика курса» в конвертере (валют/истории) —
  // единая пилюля-подложка с ползущим активным сегментом, просто без фиксированной
  // ширины на 4 таба: тут 10 валют, лента сама растёт и скроллится.
  // Обёртка со скруглением+обрезкой: у самой пилюли-трека правый край торчит
  // за пределы видимой области скролла и без неё резался бы прямым углом.
  currencyBarClip: { borderRadius: tokens.radius.pill, overflow: 'hidden' },
  currencyBar: { flexDirection: 'row', backgroundColor: 'rgba(215,226,235,0.2)', borderRadius: tokens.radius.pill, padding: 1, gap: 2 },
  currencyTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: tokens.radius.pill },
  currencyTabText: { fontSize: 14, lineHeight: 16, fontFamily: 'Onest_500Medium', textTransform: 'uppercase', color: hexToRgba(tokens.text.primary, 0.5) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.xl,
  },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  section: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    letterSpacing: -0.2,
    marginTop: tokens.spacing.lg,
    marginBottom: tokens.spacing.md,
  },

  // площадка: обёртка с равными полями со всех сторон (16), внутри — свои строки
  platformInner: { paddingVertical: tokens.spacing.lg },
  // Тот же блок, но для стадии «picking»: табы фильтра теперь отдельно на
  // фоне экрана (см. tabBarRowOuter) — верхний паддинг тут только добирает
  // недостающее до чистых 16 над полем поиска (у searchRow уже есть свои 8
  // сверху), а не дублирует их поверх margin таб-бара.
  platformInnerPicking: { paddingTop: tokens.spacing.sm, paddingBottom: tokens.spacing.lg },

  tabBarRow: { paddingHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.md },
  tabBarRowOuter: { marginBottom: tokens.spacing.lg },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 8,
    backgroundColor: tokens.surface.tabOff,
  },
  tabChipText: { fontFamily: font.medium, fontSize: 13 },

  // Поиск ВНУТРИ плашки (карточки) — обычный бордер снизу, без своей подложки
  // и тени (та у него уже своя — у самой плашки). Пилюля с подложкой — только
  // для поиска, который лежит прямо на фоне экрана (см. «Площадки»).
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.surface.hairline,
  },
  searchInput: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, paddingVertical: tokens.spacing.sm },
  bankListWrap: { position: 'relative' },
  bankList: { maxHeight: 300, paddingHorizontal: tokens.spacing.lg },
  bankScrollTrack: {
    position: 'absolute', right: 2, top: 0, bottom: 0, width: 5,
    borderRadius: 2.5, backgroundColor: hexToRgba(tokens.text.tertiary, 0.18),
  },
  bankScrollThumb: {
    width: 5, borderRadius: 2.5, backgroundColor: tokens.accent.light,
  },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  bankName: { flex: 1, fontFamily: font.medium, fontSize: tokens.typography.body, color: tokens.text.primary },
  emptyHint: { fontFamily: font.regular, paddingVertical: tokens.spacing.lg, color: tokens.text.tertiary, textAlign: 'center' },

  // выбранная площадка — компактная строка (верт. паддинг = гориз., канон карточек)
  chosenRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg },
  chosenName: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.body, color: tokens.text.primary },
  changeText: { fontFamily: font.semibold, fontSize: tokens.typography.caption, color: tokens.accent.base },

  // создание новой площадки (каталог/своя) — визуал как в форме «Новая площадка»
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.md },
  backLinkText: { fontFamily: font.medium, fontSize: 13, color: tokens.text.tertiary },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: tokens.surface.tabOff,
    borderRadius: 20,
    padding: 3,
    marginHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.lg,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.chip,
    paddingVertical: 9,
    borderRadius: 17,
  },
  modeChipActive: { backgroundColor: tokens.accent.base },
  modeText: { fontFamily: font.medium, fontSize: 14, color: tokens.accent.base },
  modeTextActive: { fontFamily: font.semibold, color: tokens.text.inverse },

  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BANK_GRID_GAP,
    paddingHorizontal: BANK_GRID_GAP,
    paddingTop: BANK_GRID_GAP,
    marginTop: tokens.spacing.sm,
  },
  bankEmpty: { fontFamily: font.regular, fontSize: 14, color: tokens.text.tertiary, paddingVertical: tokens.spacing.lg, width: '100%', textAlign: 'center' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.lg },
  logoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customFields: { paddingHorizontal: tokens.spacing.lg },
  logoActions: { gap: 8 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.chip,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: tokens.spacing.tight,
    borderRadius: 16,
    backgroundColor: tokens.accent.soft,
  },
  uploadText: { fontFamily: font.medium, fontSize: 14, color: tokens.accent.base },
  removePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.chip, paddingHorizontal: 4 },
  removePhotoText: { fontFamily: font.regular, fontSize: 13, color: tokens.text.tertiary },

  confirmBtn: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.md,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: tokens.text.tertiary },
  confirmBtnText: { color: tokens.text.inverse, fontFamily: font.semibold, fontSize: 15 },

  // продукт
  productRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: 10 },
  productIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.accent.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  productIconActive: { backgroundColor: tokens.accent.base },
  productName: { fontFamily: font.semibold, fontSize: tokens.typography.body, color: tokens.text.primary },
  productSub: { fontFamily: font.regular, fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  radioOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#D8DFE9', marginRight: 1 },
  newProductRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: tokens.surface.hairline },
  newPlatformBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: tokens.accent.base,
  },
  newProductText: { fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.accent.base },

  // тип — цветные чипы во всю ширину экрана (как на экране «Инструмент»)
  typeChipsWrap: { marginHorizontal: -tokens.spacing.screenH },
  typeChips: { flexDirection: 'row', gap: 8, paddingHorizontal: tokens.spacing.screenH },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.chip,
    paddingHorizontal: 14,
    paddingVertical: tokens.spacing.tight,
    borderRadius: 20,
    backgroundColor: tokens.surface.tabOff,
  },
  typeChipText: { fontFamily: font.medium, fontSize: 14 },
  typeHint: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: tokens.text.tertiary, marginTop: 8 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.sm,
  },
  toggleLabel: { fontSize: tokens.typography.body, color: tokens.text.primary },
  freeCapitalHint: {
    fontFamily: font.regular,
    fontSize: tokens.typography.hint,
    color: tokens.text.tertiary,
    marginTop: -6,
    marginBottom: tokens.spacing.sm,
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
  },
  saveBtn: {
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: tokens.text.tertiary },
  saveText: { color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '700' },
});
