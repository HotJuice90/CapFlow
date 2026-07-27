import React, { useMemo, useRef, useState } from 'react';
import { Dimensions, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { appAlert } from '@/lib/dialog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { SkylineBars } from '@/components/SkylineBars';
import { useData } from '@/state/DataContext';
import { assetValueSeries, assetTimeline, findAssetView, type AssetTimelineEntry } from '@/state/selectors';
import { findBank } from '@/domain/banks';
import type { CurrencyCode } from '@/domain/types';
import { tokens, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import { formatDateShort, pluralDays } from '@/format/date';
import { diffDays } from '@/calc';
import { tapBuzz, warnBuzz } from '@/lib/haptics';
import { t } from '@/i18n';

const TYPE_LABEL: Record<string, string> = {
  deposit: 'Вклад',
  savings: 'Накопительный счёт',
  bond: 'Облигации',
  dfa: 'ЦФА',
};

// Иконка по типу инструмента — та же пара, что и в AssetRow/TypeCardsRow.
const ICON_BY_TYPE: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
};

const PAYOUT_LABEL: Record<string, string> = {
  daily: 'Ежедневно',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  semiannual: 'Раз в полгода',
  annual: 'Ежегодно',
  end: 'В конце срока',
};

const HERO_GRAPH_WIDTH = Dimensions.get('window').width - tokens.spacing.screenH * 2 - tokens.spacing.lg * 2;

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, setAssetStatus, deleteAsset, updateAsset } = useData();

  const view = useMemo(
    () => findAssetView(data, id),
    [data, id],
  );
  // Мало и широко — скайлайн должен выглядеть слитными холмами, а не частоколом
  // тонких полосок (много точек на узкой ширине давало «тот же график, другой цвет»).
  const valueSeries = useMemo(() => assetValueSeries(data, id, 18), [data, id]);
  const timeline = useMemo(() => (view ? assetTimeline(view.asset) : []), [view]);
  // Реально удержанный банком налог при снятиях — факт, не оценка (см. BalanceAdjustment.taxWithheld).
  const taxPaidTotal = useMemo(
    () => (view?.asset.balanceAdjustments ?? []).reduce((sum, a) => sum + (a.taxWithheld ?? 0), 0),
    [view],
  );
  // Прогноз «сколько ещё отдать, если снять всё сейчас» — derived.tax уже честно
  // считает: активы с taxWithheldByBank не делят лимит с остальными (см. calcAssetTax
  // и buildAssetViews), поэтому тут просто вычитаем то, что уже реально уплачено.
  const projectedTaxRemaining = useMemo(
    () => (view ? Math.max(0, view.derived.tax - taxPaidTotal) : 0),
    [view, taxPaidTotal],
  );
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const onDuplicate = () => {
    if (!id) return;
    appAlert('Дублировать актив?', 'Откроется копия с этими же параметрами — поменяйте что нужно перед сохранением.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Дублировать', onPress: () => router.push(`/asset/form?duplicateFrom=${id}`) },
    ]);
  };
  const onClose = () => {
    if (!id) return;
    appAlert('Закрыть актив?', 'Перейдёт в историю и перестанет участвовать в текущем капитале.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Закрыть', onPress: async () => { await setAssetStatus(id, 'closed'); router.back(); } },
    ]);
  };
  const onArchive = () => {
    if (!id) return;
    appAlert('В архив?', 'Архивные записи не участвуют в расчётах.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'В архив', onPress: async () => { await setAssetStatus(id, 'archived'); router.back(); } },
    ]);
  };
  const onDelete = () => {
    if (!id) return;
    appAlert('Удалить актив?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => { await deleteAsset(id); router.back(); } },
    ]);
  };
  const onDeleteBalanceEntry = (entryId: string) => {
    if (!view) return;
    appAlert('Удалить операцию?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await updateAsset({
            ...view.asset,
            balanceAdjustments: (view.asset.balanceAdjustments ?? []).filter((a) => a.id !== entryId),
          });
        },
      },
    ]);
  };
  const onDeleteRateEntry = (entryId: string) => {
    if (!view) return;
    appAlert('Удалить изменение ставки?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await updateAsset({
            ...view.asset,
            rateAdjustments: (view.asset.rateAdjustments ?? []).filter((r) => r.id !== entryId),
          });
        },
      },
    ]);
  };

  if (!view) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <Text style={styles.muted}>Актив не найден</Text>
        </View>
      </ScreenBackground>
    );
  }

  const { asset, instrument, organization, derived } = view;
  const cur = asset.currency;
  const isTerm = instrument.behavior === 'term';
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const progress = Math.round((derived.termProgress ?? 0) * 100);
  const bankUrl = findBank(organization.logo)?.url;
  // Накопительные счета — всегда живые деньги; срочные — только если явно разрешено пополнение/снятие.
  const canAdjustBalance = !isTerm || instrument.allowTopUp || instrument.allowPartialWithdraw;

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.xl,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + tokens.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
          </Pressable>
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push(`/asset/form?id=${asset.id}`)}
            hitSlop={8}
          >
            <MaterialIcons name="edit" size={20} color={tokens.text.secondary} />
          </Pressable>
        </View>

        {/* Название с иконкой банка */}
        <View style={styles.titleRow}>
          <OrgLogo
            color={organization.color}
            logo={organization.logo}
            imageUri={organization.customImageUri}
            size={44}
            radius={16}
            variant="solid"
            fallbackIcon={ICON_BY_TYPE[instrument.typeId]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{instrument.name}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {organization.name}{asset.title ? ` · ${asset.title}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          <View style={styles.pill}><Text style={styles.pillText}>{TYPE_LABEL[instrument.typeId] ?? instrument.typeId}</Text></View>
          {payout ? (
            <View style={styles.pill}><Text style={styles.pillText}>{PAYOUT_LABEL[payout] ?? payout}</Text></View>
          ) : null}
          {cur !== 'RUB' ? (
            <View style={styles.pill}><Text style={styles.pillText}>{cur}</Text></View>
          ) : null}
        </View>

        {/* Hero: сумма + ставка, прогресс срока — здесь же */}
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <Pressable
              style={{ flex: 1 }}
              disabled={!canAdjustBalance}
              onPress={() => router.push(`/asset/balance-adjust?id=${asset.id}`)}
            >
              <Text style={styles.heroLabel}>{isTerm ? 'Сумма вклада' : 'На счёте'}</Text>
              <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(isTerm ? asset.amount : derived.currentValue, { currency: cur, kopecks: 'hide' })}
              </Text>
            </Pressable>
            <Pressable style={styles.rateBadge} onPress={() => router.push(`/asset/rate-adjust?id=${asset.id}`)}>
              <Text style={styles.rateValue}>{formatPercent(derived.currentRate)}</Text>
              <View style={styles.ratePremiumRow}>
                <MaterialCommunityIcons
                  name={derived.premiumToKeyRate >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={11}
                  color={derived.premiumToKeyRate >= 0 ? tokens.semantic.positive : tokens.semantic.negative}
                />
                <Text style={styles.ratePremium}>
                  {formatPercentSigned(derived.premiumToKeyRate)} {t.asset.toKeyRate}
                </Text>
              </View>
            </Pressable>
          </View>

          {isTerm && asset.endDate ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: organization.color }]} />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.progressMetaText}>
                  {derived.daysRemaining !== undefined
                    ? `Осталось ${derived.daysRemaining} ${pluralDays(derived.daysRemaining)} · до ${formatDateShort(asset.endDate)}`
                    : `До ${formatDateShort(asset.endDate)}`}
                </Text>
                <Text style={styles.progressMetaPct}>{progress}%</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.heroIncomeRow}>
            <Text style={styles.heroIncomeLabel}>{t.asset.incomePerDay}</Text>
            <Text style={styles.heroIncomeValue}>
              +{formatMoney(derived.incomePerDay, { currency: cur })}
            </Text>
          </View>

          {valueSeries.length >= 2 ? (
            <View style={styles.heroGraphWrap}>
              <SkylineBars data={valueSeries} width={HERO_GRAPH_WIDTH} height={56} color={tokens.accent.base} gap={0} />
            </View>
          ) : null}
        </Card>

        {/* Доход за всё время — с даты открытия по сегодня (или до закрытия срочного) */}
        <Card style={styles.finCard}>
          <Text style={styles.finTitle}>Доход за всё время</Text>
          <Text style={styles.lifetimeValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(derived.earnedSoFar, { currency: cur, kopecks: 'hide' })}
          </Text>
          <Text style={styles.lifetimeMeta}>
            с {formatDateShort(asset.openDate)} · {Math.max(0, diffDays(asset.openDate, new Date()))} {pluralDays(Math.max(0, diffDays(asset.openDate, new Date())))}
          </Text>

          <View style={styles.taxLifetimeDivider} />
          <View style={styles.taxLifetimeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.taxLifetimeLabel}>Уже выплатил</Text>
              <Text style={styles.taxLifetimeValue}>{formatMoney(taxPaidTotal, { currency: cur, kopecks: 'hide' })}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.taxLifetimeLabel}>К доплате при снятии</Text>
              <Text style={[styles.taxLifetimeValue, styles.taxLifetimeValueWarn]}>{formatMoney(projectedTaxRemaining, { currency: cur, kopecks: 'hide' })}</Text>
            </View>
          </View>
        </Card>

        {isTerm && progress >= 100 ? (
          <View style={styles.maturedBanner}>
            <View style={styles.maturedBannerTop}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={tokens.semantic.warning} />
              <Text style={styles.maturedBannerTitle}>Срок истёк — что дальше?</Text>
            </View>
            <View style={styles.maturedBannerActions}>
              <Pressable style={styles.maturedActionBtn} onPress={() => router.push(`/asset/form?id=${asset.id}`)}>
                <MaterialCommunityIcons name="autorenew" size={16} color={tokens.accent.base} />
                <Text style={styles.maturedActionText}>Продлить</Text>
              </Pressable>
              <Pressable style={styles.maturedActionBtn} onPress={onArchive}>
                <MaterialCommunityIcons name="archive-outline" size={16} color={tokens.text.secondary} />
                <Text style={[styles.maturedActionText, { color: tokens.text.secondary }]}>В архив</Text>
              </Pressable>
              <Pressable style={styles.maturedActionBtn} onPress={onClose}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={tokens.text.secondary} />
                <Text style={[styles.maturedActionText, { color: tokens.text.secondary }]}>Закрыть</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Финансовый результат — один собранный блок с иконками */}
        <Card style={styles.finCard}>
          <Text style={styles.finTitle}>{t.asset.financialResult}</Text>
          <View style={styles.finRow}>
            <FinCol
              icon="trending-up"
              iconColor="#586692"
              iconBg={tokens.accent.soft}
              label={t.asset.accrued}
              value={formatMoney(derived.incomePerMonth, { currency: cur, kopecks: 'hide' })}
              sub="если ничего не менять"
            />
            <View style={styles.finSep} />
            <FinCol
              icon="percent"
              iconColor="#C11818"
              iconBg={hexToRgba(tokens.semantic.negative, 0.12)}
              label={t.asset.tax}
              value={formatMoney(derived.monthlyTax, { currency: cur, kopecks: 'hide' })}
              sub={derived.incomePerMonth > 0 ? `${formatPercent((derived.monthlyTax / derived.incomePerMonth) * 100)} от дохода` : 'нет дохода'}
            />
            <View style={styles.finSep} />
            <FinCol
              icon="account-balance-wallet"
              iconColor={tokens.semantic.positive}
              iconBg={hexToRgba(tokens.semantic.positive, 0.12)}
              label={t.asset.net}
              value={formatMoney(derived.monthlyNet, { currency: cur, kopecks: 'hide' })}
              valueColor={tokens.semantic.positive}
              sub="после налога"
            />
          </View>

          {isTerm && derived.finalAmount !== undefined ? (
            <View style={styles.finTotal}>
              <View style={{ flex: 1 }}>
                <Text style={styles.finTotalLabel}>Итоговая сумма к получению</Text>
                <Text style={styles.finTotalValue}>{formatMoney(derived.finalAmount, { currency: cur, kopecks: 'hide' })}</Text>
              </View>
              <View style={styles.finTotalChip}>
                <Text style={styles.finTotalChipText}>
                  ещё +{formatMoney(derived.remainingToEarn ?? 0, { currency: cur, kopecks: 'hide' })}
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        {/* История — сумма и ставка меняются независимо, но на карточке
            актива удобнее видеть одной лентой, а не в 2 разных экранах.
            Дата открытия — тоже событие истории, поэтому виджет есть всегда. */}
        <Card style={[styles.finCard, styles.historyCard]} padded={false}>
          <View style={styles.historyHeader}>
            <Text style={[styles.finTitle, { marginBottom: 0 }]}>История</Text>
          </View>
          {(historyExpanded ? timeline : timeline.slice(0, 5)).map((entry, i, arr) => (
            <TimelineRow
              key={entry.id ?? entry.type}
              entry={entry}
              isLast={i === arr.length - 1}
              currency={cur}
              onEdit={() => {
                if (entry.type === 'balance') router.push(`/asset/balance-adjust?id=${asset.id}`);
                else if (entry.type === 'rate') router.push(`/asset/rate-adjust?id=${asset.id}`);
              }}
              onDelete={() => {
                if (!entry.id) return;
                if (entry.type === 'balance') onDeleteBalanceEntry(entry.id);
                else if (entry.type === 'rate') onDeleteRateEntry(entry.id);
              }}
            />
          ))}
          {timeline.length > 5 ? (
            <Pressable style={styles.historyMore} onPress={() => setHistoryExpanded((v) => !v)} hitSlop={8}>
              <Text style={styles.historyMoreText}>
                {historyExpanded ? 'Свернуть' : `Показать ещё ${timeline.length - 5}`}
              </Text>
              <MaterialIcons
                name={historyExpanded ? 'expand-less' : 'expand-more'}
                size={18}
                color={tokens.accent.base}
              />
            </Pressable>
          ) : null}
        </Card>

        {/* Накопительный: сколько будет, если не снимать */}
        {!isTerm ? (
          <Card style={styles.finCard}>
            <Text style={styles.finTitle}>Если ничего не менять</Text>
            <Text style={styles.forecastHint}>Ваш счёт будет приносить</Text>
            <View style={styles.finRow}>
              <ForecastCol label="Ещё 1 месяц" value={derived.forecastNextMonth ?? 0} cur={cur} />
              <View style={styles.finSep} />
              <ForecastCol label="Ещё 6 месяцев" value={(derived.forecastNextYear ?? 0) / 2} cur={cur} />
              <View style={styles.finSep} />
              <ForecastCol label="Ещё 12 месяцев" value={derived.forecastNextYear ?? 0} cur={cur} />
            </View>
          </Card>
        ) : null}

        {/* Переход в приложение/на сайт банка */}
        {bankUrl ? (
          <Pressable onPress={() => Linking.openURL(bankUrl).catch(() => {})} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Card style={styles.bankCard}>
              <View style={styles.bankRow}>
                <OrgLogo
                  color={organization.color}
                  logo={organization.logo}
                  imageUri={organization.customImageUri}
                  size={36}
                  radius={12}
                  fallbackIcon={ICON_BY_TYPE[instrument.typeId]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bankName} numberOfLines={1}>{organization.name}</Text>
                  <Text style={styles.bankHint} numberOfLines={1}>Приложение банка</Text>
                </View>
                <View style={styles.bankOpen}>
                  <Text style={styles.bankOpenText}>Открыть</Text>
                  <MaterialIcons name="chevron-right" size={16} color={tokens.accent.base} />
                </View>
              </View>
            </Card>
          </Pressable>
        ) : null}

        {/* Действия — в самом низу, иконки одного сета (MCI outline).
            Баланс/ставка правятся через виджет «История» выше (свайп) или
            тапом по сумме/ставке в шапке — отдельные кнопки тут избыточны. */}
        <View style={styles.actionsRow}>
          <ActionItem icon="content-copy" label="Дублировать" onPress={onDuplicate} />
          {isTerm ? (
            <ActionItem icon="autorenew" label="Продлить" onPress={() => router.push(`/asset/form?id=${asset.id}`)} />
          ) : null}
          <ActionItem icon="check-circle-outline" label="Закрыть" onPress={onClose} />
          <ActionItem icon="archive-outline" label="В архив" onPress={onArchive} />
          <ActionItem icon="trash-can-outline" label="Удалить" danger onPress={onDelete} />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

function FinCol({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
  sub: string;
}) {
  return (
    <View style={styles.finCol}>
      <View style={styles.finColHead}>
        <View style={[styles.finIcon, { backgroundColor: iconBg }]}>
          <MaterialIcons name={icon} size={13} color={iconColor} />
        </View>
        <Text style={styles.finColLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.finColValue, valueColor ? { color: valueColor } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.finColSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

function ForecastCol({ label, value, cur }: { label: string; value: number; cur: CurrencyCode }) {
  return (
    <View style={styles.finCol}>
      <Text style={styles.finColLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.forecastValue} numberOfLines={1} adjustsFontSizeToFit>
        ≈ +{formatMoney(value, { currency: cur, kopecks: 'hide' })}
      </Text>
    </View>
  );
}

function TimelineRow({
  entry,
  isLast,
  currency,
  onEdit,
  onDelete,
}: {
  entry: AssetTimelineEntry;
  isLast: boolean;
  currency: CurrencyCode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const isBalance = entry.type === 'balance';
  const isRate = entry.type === 'rate';
  const isUp = isBalance ? (entry.amountDelta ?? 0) >= 0 : (entry.rateDelta ?? 0) >= 0;

  const icon = entry.type === 'open' ? 'flag-outline' : entry.isCorrection ? 'wrench-outline' : isBalance ? (isUp ? 'arrow-up' : 'arrow-down') : isUp ? 'trending-up' : 'trending-down';
  const iconStyle = entry.type === 'open' ? styles.histIconOpen : entry.isCorrection ? styles.histIconCorrection : isUp ? styles.histIconUp : styles.histIconDown;
  const iconColor = entry.type === 'open' ? tokens.accent.base : entry.isCorrection ? tokens.category.dfa : isUp ? tokens.semantic.positive : tokens.semantic.negative;

  const sub = (entry.type === 'open'
    ? 'Открытие'
    : entry.isCorrection
      ? (entry.comment || 'Исправление под факт банка')
      : entry.comment || (isBalance ? (isUp ? 'Пополнение' : 'Снятие') : 'Изменение ставки'))
    + (entry.taxWithheld ? ` · налог ${formatMoney(entry.taxWithheld, { currency, kopecks: 'hide' })}` : '');

  const row = (
    <View style={[styles.histRow, !isLast && styles.rowDivider]}>
      <View style={[styles.histIcon, iconStyle]}>
        <MaterialCommunityIcons name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.histDate}>{formatDateShort(entry.date)}</Text>
        <Text style={styles.histSub} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {entry.type === 'open' ? (
          <Text style={styles.histBalance}>
            {formatMoney(entry.amount ?? 0, { currency })} · {formatPercent(entry.rate ?? 0)}
          </Text>
        ) : isBalance ? (
          <>
            <Text style={[styles.histDelta, isUp ? styles.histDeltaUp : styles.histDeltaDown]}>
              {isUp ? '+' : '−'}{formatMoney(Math.abs(entry.amountDelta ?? 0), { currency })}
            </Text>
            <Text style={styles.histBalance}>{formatMoney(entry.amount ?? 0, { currency, kopecks: 'hide' })}</Text>
          </>
        ) : (
          <>
            <Text style={[styles.histDelta, isUp ? styles.histDeltaUp : styles.histDeltaDown]}>
              {isUp ? '+' : '−'}{formatPercent(Math.abs(entry.rateDelta ?? 0))}
            </Text>
            <Text style={styles.histBalance}>{formatPercent(entry.rate ?? 0)}</Text>
          </>
        )}
      </View>
    </View>
  );

  if (entry.type === 'open') return row;
  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      friction={1.7}
      leftThreshold={72}
      rightThreshold={72}
      onSwipeableWillOpen={(direction) => {
        swipeRef.current?.close();
        if (direction === 'left') { tapBuzz(); onEdit(); }
        else { warnBuzz(); onDelete(); }
      }}
      renderLeftActions={() => (
        <View style={styles.swipeHint}>
          <View style={[styles.swipeHintBox, { backgroundColor: hexToRgba(tokens.accent.base, 0.14) }]}>
            <MaterialCommunityIcons name="pencil-outline" size={20} color={tokens.accent.base} />
          </View>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.swipeHint}>
          <View style={[styles.swipeHintBox, { backgroundColor: hexToRgba(tokens.semantic.negative, 0.14) }]}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={tokens.semantic.negative} />
          </View>
        </View>
      )}
    >
      {row}
    </Swipeable>
  );
}

function ActionItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? tokens.semantic.negative : '#586692';
  return (
    <Pressable style={({ pressed }) => [styles.actionItem, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <View style={[styles.actionIcon, danger && styles.actionIconDanger]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.actionItemLabel, danger && { color: tokens.semantic.negative }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const SOFT_SHADOW = tokens.shadow.subtle;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: tokens.text.secondary },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  editBtn: {
    width: 44, height: 44, borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(tokens.surface.white, 0.85), borderWidth: 1, borderColor: tokens.surface.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: tokens.typography.header, lineHeight: 26, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.48 },
  subtitle: { fontSize: 14, lineHeight: 14, color: tokens.text.tertiary, marginTop: tokens.spacing.chip, letterSpacing: -0.28 },

  pillRow: { flexDirection: 'row', gap: 2, marginTop: 12, marginBottom: tokens.spacing.lg },
  pill: { backgroundColor: '#F9FAFF', borderRadius: tokens.radius.pill, paddingHorizontal: tokens.spacing.tight, paddingVertical: 6 },
  pillText: { fontSize: 11, fontWeight: '500', color: hexToRgba(tokens.text.primary, 0.8) },

  softShadow: boxShadow(SOFT_SHADOW),

  hero: { marginBottom: tokens.spacing.xl, ...boxShadow(SOFT_SHADOW) },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: tokens.spacing.md },
  heroLabel: { fontSize: tokens.typography.hint, lineHeight: 12, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.24 },
  heroAmount: { fontSize: 32, lineHeight: 34, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.64, marginTop: 8 },
  rateBadge: { alignItems: 'flex-end', backgroundColor: '#F9FAFF', borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  rateValue: { fontSize: 20, lineHeight: 20, fontWeight: '700', color: '#586692' },
  ratePremiumRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  ratePremium: { fontSize: 11, lineHeight: 11, color: hexToRgba(tokens.text.primary, 0.4) },

  progressWrap: { marginTop: tokens.spacing.lg },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: tokens.accent.soft, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  progressMetaText: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), letterSpacing: -0.24 },
  progressMetaPct: { fontSize: tokens.typography.hint, fontWeight: '600', color: '#586692' },

  heroIncomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
  },
  heroIncomeLabel: { fontSize: 14, color: tokens.text.tertiary, letterSpacing: -0.28 },
  heroIncomeValue: { fontSize: 17, fontWeight: '600', color: tokens.semantic.positive, letterSpacing: -0.17 },
  heroGraphWrap: { marginTop: tokens.spacing.lg },

  maturedBanner: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    marginBottom: tokens.spacing.lg,
    backgroundColor: hexToRgba(tokens.semantic.warning, 0.1),
  },
  maturedBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  maturedBannerTitle: { fontSize: tokens.typography.labelLg, fontWeight: '700', color: tokens.text.primary },
  maturedBannerActions: { flexDirection: 'row', gap: 8, marginTop: tokens.spacing.md },
  maturedActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.chip,
    paddingVertical: tokens.spacing.tight,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.surface.white,
  },
  maturedActionText: { fontSize: 13, fontWeight: '600', color: tokens.accent.base },

  finCard: { marginBottom: tokens.spacing.lg, ...boxShadow(SOFT_SHADOW) },
  finTitle: { fontSize: 18, lineHeight: 18, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.36, marginBottom: tokens.spacing.lg },

  lifetimeValue: { fontSize: 26, lineHeight: 28, fontWeight: '700', color: tokens.semantic.positive, letterSpacing: -0.52 },
  lifetimeMeta: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), letterSpacing: -0.24, marginTop: 6 },

  taxLifetimeDivider: { height: 1, backgroundColor: tokens.surface.hairline, marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.md },
  taxLifetimeRow: { flexDirection: 'row' },
  taxLifetimeLabel: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), letterSpacing: -0.24 },
  taxLifetimeValue: { fontSize: 16, fontWeight: '700', color: tokens.text.primary, letterSpacing: -0.32, marginTop: 4 },
  taxLifetimeValueWarn: { color: tokens.semantic.warning },
  finRow: { flexDirection: 'row', alignItems: 'stretch' },
  finCol: { flex: 1 },
  finSep: { width: 1, backgroundColor: tokens.surface.hairline, marginHorizontal: 10 },
  finColHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  finIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  finColLabel: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.5), letterSpacing: -0.24, flexShrink: 1 },
  finColValue: { fontSize: 17, lineHeight: 17, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.34, marginTop: 10 },
  finColSub: { fontSize: 11, lineHeight: 11, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.22, marginTop: 5 },

  finTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.lg,
    backgroundColor: hexToRgba(tokens.semantic.positive, 0.12),
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  finTotalLabel: { fontSize: tokens.typography.hint, lineHeight: 12, color: hexToRgba(tokens.text.primary, 0.4), letterSpacing: -0.24 },
  finTotalValue: { fontSize: 20, lineHeight: 22, fontWeight: '700', color: tokens.semantic.positive, letterSpacing: -0.4, marginTop: 6 },
  finTotalChip: { backgroundColor: tokens.surface.white, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.spacing.tight, paddingVertical: 6 },
  finTotalChipText: { fontSize: 11, fontWeight: '500', color: tokens.semantic.positive },

  historyCard: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.sm },
  historyHeader: { paddingTop: tokens.spacing.lg, paddingBottom: tokens.spacing.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, backgroundColor: tokens.surface.white },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  histIcon: {
    width: 32, height: 32, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.surface.neutral,
  },
  histIconOpen: { backgroundColor: tokens.accent.soft },
  histIconUp: { backgroundColor: hexToRgba(tokens.semantic.positive, 0.12) },
  histIconDown: { backgroundColor: hexToRgba(tokens.semantic.negative, 0.12) },
  histIconCorrection: { backgroundColor: hexToRgba(tokens.category.dfa, 0.14) },
  histDate: { fontSize: 14, fontWeight: '500', color: tokens.text.primary },
  histSub: { fontSize: tokens.typography.hint, color: tokens.text.tertiary, marginTop: 2 },
  histDelta: { fontSize: 14, fontWeight: '700' },
  histDeltaUp: { color: tokens.semantic.positive },
  histDeltaDown: { color: tokens.semantic.negative },
  histBalance: { fontSize: tokens.typography.hint, color: tokens.text.tertiary, marginTop: 2 },

  historyMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: tokens.spacing.md,
  },
  swipeHint: { width: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface.white },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historyMoreText: { fontSize: 13, fontWeight: '600', color: tokens.accent.base },

  forecastHint: { fontSize: tokens.typography.hint, lineHeight: 12, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.24, marginTop: -10, marginBottom: tokens.spacing.lg },
  forecastValue: { fontSize: 16, lineHeight: 16, fontWeight: '600', color: tokens.semantic.positive, letterSpacing: -0.32, marginTop: 8 },

  bankCard: boxShadow(SOFT_SHADOW),
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  bankName: { fontSize: tokens.typography.labelLg, lineHeight: 15, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.3 },
  bankHint: { fontSize: tokens.typography.hint, lineHeight: 12, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.24, marginTop: 4 },
  bankOpen: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bankOpenText: { fontSize: 14, fontWeight: '600', color: tokens.accent.base },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.xl, paddingHorizontal: 4 },
  actionItem: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: tokens.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...boxShadow(SOFT_SHADOW),
  },
  actionIconDanger: { backgroundColor: hexToRgba(tokens.semantic.negative, 0.12) },
  actionItemLabel: { fontSize: 11, fontWeight: '500', color: hexToRgba(tokens.text.primary, 0.8) },
});
