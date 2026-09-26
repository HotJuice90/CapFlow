import React, { useMemo, useRef, useState } from 'react';
import { Dimensions, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TYPE_LABEL, PAYOUT_LABEL } from '@/domain/labels';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { openedSide } from '@/lib/swipe';
import { appAlert } from '@/lib/dialog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { SkylineBars } from '@/components/SkylineBars';
import { useData } from '@/state/DataContext';
import { assetClosedDate, assetOutcome, assetValueSeries, assetTimeline, findAssetView, type AssetTimelineEntry } from '@/state/selectors';
import { findBank } from '@/domain/banks';
import type { CurrencyCode } from '@/domain/types';
import { tokens, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import { formatDateShort, pluralDays } from '@/format/date';
import { calculate } from '@/calc';
import { uid } from '@/utils/id';
import { successBuzz, tapBuzz, warnBuzz } from '@/lib/haptics';
import { openDatePicker } from '@/lib/datePicker';
import { t } from '@/i18n';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Иконка по типу инструмента — та же пара, что и в AssetRow/TypeCardsRow.
const ICON_BY_TYPE: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
};

const HERO_GRAPH_WIDTH = Dimensions.get('window').width - tokens.spacing.screenH * 2 - tokens.spacing.lg * 2;

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, setAssetStatus, deleteAsset, updateAsset, addFreeCapitalEntry } = useData();

  const view = useMemo(
    () => findAssetView(data, id),
    [data, id],
  );
  // Мало и широко — скайлайн должен выглядеть слитными холмами, а не частоколом
  // тонких полосок (много точек на узкой ширине давало «тот же график, другой цвет»).
  const valueSeries = useMemo(() => assetValueSeries(data, id, 18), [data, id]);
  // instrument+params обязательны: без них дельты в истории считаются наивно и
  // впитывают набежавшие проценты (см. balanceMovement в selectors).
  const baseTimeline = useMemo(
    () => (view ? assetTimeline(view.asset, view.instrument, data.params) : []),
    [view, data.params],
  );
  // Закрытый и активный — два разных экрана по смыслу: у закрытого итог, у
  // активного — жизнь. «Архивный» статус из старых данных показываем как
  // закрытый: для человека это одно и то же действие.
  const isClosed = view ? view.asset.status !== 'active' : false;
  const closedIso = view ? assetClosedDate(data, view.asset) : undefined;
  // Все деньги по активу — из одного места (см. assetOutcome): раньше деталка,
  // архив и диалог закрытия считали их каждый по-своему и расходились.
  const outcome = useMemo(
    () => (view ? assetOutcome(view, data.params, closedIso ?? todayIso()) : undefined),
    [view, data.params, closedIso],
  );
  // Закрытие — такое же событие жизни актива, как открытие, и в истории его
  // не хватало. Сумма — та, что вернулась на счёт (см. assetOutcome).
  const timeline = useMemo<AssetTimelineEntry[]>(
    () =>
      isClosed && closedIso && outcome
        ? [{ type: 'close', date: closedIso, amount: outcome.payout }, ...baseTimeline]
        : baseTimeline,
    [isClosed, closedIso, outcome, baseTimeline],
  );
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const onDuplicate = () => {
    if (!id) return;
    appAlert('Дублировать актив?', 'Откроется копия с этими же параметрами — поменяйте что нужно перед сохранением.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Дублировать', onPress: () => router.push(`/asset/form?duplicateFrom=${id}`) },
    ]);
  };
  /**
   * Дату закрытия спрашиваем, а не берём момент нажатия: деньги могли уйти
   * раньше, чем ты дошёл до кнопки, и тогда история капитала завышается на
   * все дни между. Дефолт умный — у срочного вклада с прошедшим сроком это
   * дата окончания, иначе сегодня.
   */
  const askClosedDate = () => {
    if (!id || !view) return;
    const today = todayIso();
    const matured = view.asset.endDate && view.asset.endDate <= today ? view.asset.endDate : undefined;
    openDatePicker({
      title: 'Дата закрытия',
      value: matured ?? today,
      minDate: view.asset.openDate,
      maxDate: today,
      onPick: async (iso) => { await askReturnToFree(iso); },
    });
  };
  /**
   * Закрыли актив — деньги куда-то ушли. По умолчанию считаем, что вернулись
   * «в кошелёк» (свободные деньги), иначе капитал молча просаживается на всю
   * сумму и надо вручную догонять ленту в настройках. Сумму считаем НА ДАТУ
   * закрытия (не «сейчас»), и если налог держит банк — сразу за вычетом него,
   * потому что на руки пришло именно столько.
   */
  const askReturnToFree = async (closeIso: string) => {
    if (!id || !view) return;
    // Та же арифметика, что покажет потом «Итог» закрытого актива.
    const atClose = { ...view, derived: calculate(view.asset, view.instrument, data.params, closeIso, 0) };
    const payout = assetOutcome(atClose, data.params, closeIso).payout;
    const finish = async (toFree: boolean) => {
      await setAssetStatus(id, 'closed', closeIso);
      if (toFree && payout > 0) {
        await addFreeCapitalEntry({
          id: uid('fce-'),
          date: closeIso,
          amount: payout,
          currency: view.asset.currency,
          comment: `Закрытие: ${view.asset.title || view.instrument.name}`,
          createdAt: new Date().toISOString(),
        });
      }
      router.back();
    };
    if (payout <= 0) { await finish(false); return; }
    appAlert(
      'Вернуть деньги в свободные?',
      `${formatMoney(payout, { currency: view.asset.currency })} добавим в ленту свободных денег на ${formatDateShort(closeIso)}. Если вывел не себе, а сразу переложил — выбери «Не возвращать» и заведи новый актив.`,
      [
        { text: 'Не возвращать', onPress: () => { void finish(false); } },
        { text: 'Вернуть', onPress: () => { void finish(true); } },
      ],
    );
  };
  // «Закрыть» и «В архив» раньше были двумя кнопками, но для человека это
  // одно действие: всё закрытое и так уходит в архив. Остался один путь.
  const onClose = () => {
    if (!id) return;
    appAlert('Закрыть актив?', 'Уйдёт в архив и перестанет участвовать в текущем капитале.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Закрыть', onPress: askClosedDate },
    ]);
  };
  const onRestore = () => {
    if (!id) return;
    appAlert(
      'Вернуть в работу?',
      'Актив снова станет активным. Если при закрытии деньги ушли в свободные — ту запись в ленте удали вручную, иначе они посчитаются дважды.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Вернуть', onPress: async () => { await setAssetStatus(id, 'active'); successBuzz(); } },
      ],
    );
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

        {/* Название с иконкой банка. У закрытого лого приглушено — экран с
            первого взгляда должен читаться как «это уже история». */}
        <View style={styles.titleRow}>
          <View style={isClosed ? styles.logoMuted : undefined}>
          <OrgLogo
            color={organization.color}
            logo={organization.logo}
            imageUri={organization.customImageUri}
            size={44}
            radius={16}
            variant="solid"
            fallbackIcon={ICON_BY_TYPE[instrument.typeId]}
          />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{instrument.name}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {organization.name}{asset.title ? ` · ${asset.title}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          {isClosed ? (
            <View style={[styles.pill, styles.pillClosed]}>
              <MaterialCommunityIcons name="check" size={12} color={tokens.text.secondary} />
              <Text style={[styles.pillText, styles.pillClosedText]}>
                Закрыт{closedIso ? ` ${formatDateShort(closedIso)}` : ''}
              </Text>
            </View>
          ) : null}
          <View style={styles.pill}><Text style={styles.pillText}>{TYPE_LABEL[instrument.typeId] ?? instrument.typeId}</Text></View>
          {payout ? (
            <View style={styles.pill}><Text style={styles.pillText}>{PAYOUT_LABEL[payout] ?? payout}</Text></View>
          ) : null}
          {cur !== 'RUB' ? (
            <View style={styles.pill}><Text style={styles.pillText}>{cur}</Text></View>
          ) : null}
        </View>

        {/* Hero: сумма + ставка, прогресс срока — здесь же */}
        {!isClosed ? (
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
                    {/* «Осталось 0 дней» у вышедшего срока звучало как «сегодня последний день». */}
                    {progress >= 100
                      ? `Срок истёк ${formatDateShort(asset.endDate)}`
                      : derived.daysRemaining !== undefined
                        ? `Осталось ${derived.daysRemaining} ${pluralDays(derived.daysRemaining)} · до ${formatDateShort(asset.endDate)}`
                        : `До ${formatDateShort(asset.endDate)}`}
                  </Text>
                  <Text style={styles.progressMetaPct}>{progress}%</Text>
                </View>
              </View>
            ) : null}

            {valueSeries.length >= 2 ? (
              <View style={styles.heroGraphWrap}>
                {/* minSpanRatio: чтобы заполнить график, нужно изменение хотя бы
                    на 2% от баланса. Иначе счёт, выросший на 699 ₽ из миллиона,
                    рисовался лестницей до неба — ровно как счёт, с которого сняли
                    100 000, и рядом два актива читались наоборот. */}
                <SkylineBars data={valueSeries} width={HERO_GRAPH_WIDTH} height={56} color={tokens.accent.base} gap={0} minSpanRatio={0.02} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Плашка решения — только у ЖИВОГО актива с вышедшим сроком. У
            закрытого решение уже принято, спрашивать «что дальше» нечего. */}
        {!isClosed && isTerm && progress >= 100 ? (
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
              <Pressable style={styles.maturedActionBtn} onPress={onClose}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={tokens.accent.base} />
                <Text style={styles.maturedActionText}>Закрыть</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {outcome && !isClosed ? (
          // «Доход» — живой актив: сколько уже, сколько в день, чем кончится.
          // Прогнозы — со знаком «≈», налог — одной строкой с тем, КТО платит.
          <Card style={styles.finCard}>
            <Text style={styles.finTitle}>Доход</Text>
            <OutcomeRow
              label="Уже заработано"
              value={formatMoney(outcome.earned, { currency: cur, kopecks: 'hide' })}
              sub={`с ${formatDateShort(asset.openDate)} · ${outcome.days} ${pluralDays(outcome.days)}`}
              tone="positive"
            />
            {derived.incomePerDay > 0 ? (
              <OutcomeRow
                label="Сейчас в день"
                value={`+${formatMoney(derived.incomePerDay, { currency: cur })}`}
                tone="positive"
              />
            ) : null}
            <View style={styles.outcomeDivider} />
            {isTerm && outcome.termIncome !== undefined && outcome.atMaturity !== undefined ? (
              <>
                <OutcomeRow
                  label="За весь срок"
                  value={`+${formatMoney(outcome.termIncome, { currency: cur, kopecks: 'hide' })}`}
                  tone="positive"
                />
                <OutcomeRow
                  label={asset.endDate ? `Придёт ${formatDateShort(asset.endDate)}` : 'Придёт в конце срока'}
                  value={formatMoney(outcome.atMaturity, { currency: cur, kopecks: 'hide' })}
                  strong
                />
                <Text style={styles.taxNote}>
                  Налог ≈ {formatMoney(outcome.termTax ?? 0, { currency: cur, kopecks: 'hide' })} —{' '}
                  {outcome.withheld ? 'удержит площадка' : 'заплатить по уведомлению ФНС'}
                </Text>
              </>
            ) : (
              <>
                <OutcomeRow
                  label="За месяц"
                  value={`≈ +${formatMoney(derived.forecastNextMonth ?? 0, { currency: cur, kopecks: 'hide' })}`}
                  tone="positive"
                />
                <OutcomeRow
                  label="За год"
                  value={`≈ +${formatMoney(derived.forecastNextYear ?? 0, { currency: cur, kopecks: 'hide' })}`}
                  tone="positive"
                />
                <Text style={styles.taxNote}>
                  Налог с заработанного ≈ {formatMoney(Math.max(0, outcome.tax - outcome.taxPaid), { currency: cur, kopecks: 'hide' })} —{' '}
                  {outcome.withheld ? 'удержит площадка' : 'заплатить по уведомлению ФНС'}
                  {outcome.taxPaid > 0 ? ` · уже удержано ${formatMoney(outcome.taxPaid, { currency: cur, kopecks: 'hide' })}` : ''}
                </Text>
              </>
            )}
          </Card>
        ) : null}

        {outcome && isClosed ? (
          // «Итог» — закрытый актив: ни ставки к КС, ни дохода в день, ни
          // прогнозов. Только то, что уже произошло с деньгами.
          <Card style={styles.finCard}>
            <Text style={styles.finTitle}>Итог</Text>
            <OutcomeRow label="Вложено" value={formatMoney(outcome.invested, { currency: cur, kopecks: 'hide' })} />
            <OutcomeRow
              label="Заработано"
              value={`+${formatMoney(outcome.earned, { currency: cur, kopecks: 'hide' })}`}
              tone="positive"
            />
            <OutcomeRow
              label="Вернулось на счёт"
              value={formatMoney(outcome.payout, { currency: cur, kopecks: 'hide' })}
              strong
            />
            <Text style={styles.taxNote}>
              {outcome.withheld
                ? `Налог ${formatMoney(outcome.tax, { currency: cur, kopecks: 'hide' })} удержан площадкой`
                : `Налог ${formatMoney(outcome.tax, { currency: cur, kopecks: 'hide' })} — по уведомлению ФНС`}
            </Text>
            <View style={styles.outcomeDivider} />
            <Text style={styles.outcomeMeta}>
              {formatDateShort(asset.openDate)}
              {closedIso ? ` → ${formatDateShort(closedIso)}` : ''} · {outcome.days} {pluralDays(outcome.days)} · {formatPercent(derived.currentRate)}
            </Text>
          </Card>
        ) : null}

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
        {isClosed ? (
          <View style={styles.actionsRow}>
            <ActionItem icon="backup-restore" label="Вернуть" onPress={onRestore} />
            <ActionItem icon="content-copy" label="Дублировать" onPress={onDuplicate} />
            <ActionItem icon="trash-can-outline" label="Удалить" danger onPress={onDelete} />
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <ActionItem icon="content-copy" label="Дублировать" onPress={onDuplicate} />
            {isTerm ? (
              <ActionItem icon="autorenew" label="Продлить" onPress={() => router.push(`/asset/form?id=${asset.id}`)} />
            ) : null}
            <ActionItem icon="check-circle-outline" label="Закрыть" onPress={onClose} />
            <ActionItem icon="trash-can-outline" label="Удалить" danger onPress={onDelete} />
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

/** Строка «подпись — значение»: читается сверху вниз, без трёх колонок с
 *  обрезанными подписями («Доход за …», «если ничего не …»). */
function OutcomeRow({
  label,
  value,
  sub,
  tone,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive';
  strong?: boolean;
}) {
  return (
    <View style={styles.outcomeRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.outcomeLabel, strong && styles.outcomeLabelStrong]}>{label}</Text>
        {sub ? <Text style={styles.outcomeSub}>{sub}</Text> : null}
      </View>
      <Text
        style={[
          styles.outcomeValue,
          tone === 'positive' && styles.outcomeValuePositive,
          strong && styles.outcomeValueStrong,
        ]}
        numberOfLines={1}
      >
        {value}
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

  const isClose = entry.type === 'close';
  const icon = isClose ? 'check-circle-outline' : entry.type === 'open' ? 'flag-outline' : entry.isCorrection ? 'wrench-outline' : isBalance ? (isUp ? 'arrow-up' : 'arrow-down') : isUp ? 'trending-up' : 'trending-down';
  const iconStyle = isClose || entry.type === 'open' ? styles.histIconOpen : entry.isCorrection ? styles.histIconCorrection : isUp ? styles.histIconUp : styles.histIconDown;
  const iconColor = isClose || entry.type === 'open' ? tokens.accent.base : entry.isCorrection ? tokens.category.dfa : isUp ? tokens.semantic.positive : tokens.semantic.negative;

  const sub = (isClose
    ? 'Закрытие'
    : entry.type === 'open'
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
        {isClose ? (
          <Text style={styles.histBalance}>{formatMoney(entry.amount ?? 0, { currency, kopecks: 'hide' })}</Text>
        ) : entry.type === 'open' ? (
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

  // Открытие и закрытие — факты жизни актива, а не операции: не правятся свайпом.
  if (entry.type === 'open' || isClose) return row;
  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      friction={1.7}
      leftThreshold={72}
      rightThreshold={72}
      onSwipeableWillOpen={(drag) => {
        const side = openedSide(drag);
        swipeRef.current?.close();
        if (side === 'left') { tapBuzz(); onEdit(); }
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
  const color = danger ? tokens.semantic.negative : tokens.accent.base;
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
  pillClosed: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: hexToRgba(tokens.text.primary, 0.08) },
  pillClosedText: { color: tokens.text.secondary, fontWeight: '600' },
  logoMuted: { opacity: 0.55 },

  softShadow: boxShadow(SOFT_SHADOW),

  hero: { marginBottom: tokens.spacing.xl, ...boxShadow(SOFT_SHADOW) },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: tokens.spacing.md },
  heroLabel: { fontSize: tokens.typography.hint, lineHeight: 12, color: hexToRgba(tokens.text.primary, 0.3), letterSpacing: -0.24 },
  heroAmount: { fontSize: 32, lineHeight: 34, fontWeight: '600', color: tokens.text.primary, letterSpacing: -0.64, marginTop: 8 },
  rateBadge: { alignItems: 'flex-end', backgroundColor: '#F9FAFF', borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  rateValue: { fontSize: 20, lineHeight: 20, fontWeight: '700', color: tokens.accent.base },
  ratePremiumRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  ratePremium: { fontSize: 11, lineHeight: 11, color: hexToRgba(tokens.text.primary, 0.4) },

  progressWrap: { marginTop: tokens.spacing.lg },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: tokens.accent.soft, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  progressMetaText: { fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), letterSpacing: -0.24 },
  progressMetaPct: { fontSize: tokens.typography.hint, fontWeight: '600', color: tokens.accent.base },

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

  outcomeRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: 7 },
  outcomeLabel: { fontSize: 14, lineHeight: 16, color: tokens.text.secondary },
  outcomeLabelStrong: { color: tokens.text.primary, fontWeight: '600' },
  outcomeSub: { fontSize: tokens.typography.hint, lineHeight: 14, color: tokens.text.tertiary, marginTop: 2 },
  outcomeValue: { fontSize: 16, lineHeight: 18, fontWeight: '600', color: tokens.text.primary },
  outcomeValuePositive: { color: tokens.semantic.positive },
  outcomeValueStrong: { fontSize: 18, lineHeight: 20, fontWeight: '700' },
  outcomeDivider: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.sm },
  outcomeMeta: { fontSize: tokens.typography.hint, lineHeight: 15, color: tokens.text.tertiary },
  taxNote: { fontSize: tokens.typography.hint, lineHeight: 16, color: tokens.semantic.warning, marginTop: tokens.spacing.sm },

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
