import React, { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appAlert } from '@/lib/dialog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { buildAssetViews } from '@/state/selectors';
import { findBank } from '@/domain/banks';
import type { CurrencyCode } from '@/domain/types';
import { tokens } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import { formatDateShort, pluralDays } from '@/format/date';
import { t } from '@/i18n';

const TYPE_LABEL: Record<string, string> = {
  deposit: 'Вклад',
  savings: 'Накопительный счёт',
  dfa: 'ЦФА',
};

const PAYOUT_LABEL: Record<string, string> = {
  daily: 'Ежедневно',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  semiannual: 'Раз в полгода',
  annual: 'Ежегодно',
  end: 'В конце срока',
};

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, duplicateAsset, setAssetStatus, deleteAsset } = useData();

  const view = useMemo(
    () => buildAssetViews(data).find((v) => v.asset.id === id),
    [data, id],
  );

  const onDuplicate = async () => {
    if (!id) return;
    const newId = await duplicateAsset(id);
    if (newId) router.replace(`/asset/${newId}`);
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
          <OrgLogo color={organization.color} logo={organization.logo} size={44} radius={16} variant="solid" />
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
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>{isTerm ? 'Сумма вклада' : 'На счёте'}</Text>
              <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(asset.amount, { currency: cur, kopecks: 'hide' })}
              </Text>
            </View>
            <View style={styles.rateBadge}>
              <Text style={styles.rateValue}>{formatPercent(asset.rate)}</Text>
              <Text style={styles.ratePremium}>
                {formatPercentSigned(derived.premiumToKeyRate)} {t.asset.toKeyRate}
              </Text>
            </View>
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
        </Card>

        {/* Финансовый результат — один собранный блок с иконками */}
        <Card style={styles.finCard}>
          <Text style={styles.finTitle}>{t.asset.financialResult}</Text>
          <View style={styles.finRow}>
            <FinCol
              icon="trending-up"
              iconColor="#586692"
              iconBg="#EEF0FB"
              label={t.asset.accrued}
              value={formatMoney(derived.accrued, { currency: cur, kopecks: 'hide' })}
              sub="доход по вкладу"
            />
            <View style={styles.finSep} />
            <FinCol
              icon="percent"
              iconColor="#C11818"
              iconBg="#FCEEEE"
              label={t.asset.tax}
              value={formatMoney(derived.tax, { currency: cur, kopecks: 'hide' })}
              sub={derived.accrued > 0 ? `${formatPercent((derived.tax / derived.accrued) * 100)} от дохода` : 'пока нет дохода'}
            />
            <View style={styles.finSep} />
            <FinCol
              icon="account-balance-wallet"
              iconColor="#009933"
              iconBg="#EAF6EE"
              label={t.asset.net}
              value={formatMoney(derived.net, { currency: cur, kopecks: 'hide' })}
              valueColor="#009933"
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
                <OrgLogo color={organization.color} logo={organization.logo} size={36} radius={12} />
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

        {/* Действия — в самом низу, иконки одного сета (MCI outline) */}
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

const SOFT_SHADOW = '0px 6px 18px rgba(48,69,62,0.05)';

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
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: tokens.surface.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 24, lineHeight: 26, fontWeight: '600', color: '#212121', letterSpacing: -0.48 },
  subtitle: { fontSize: 14, lineHeight: 14, color: tokens.text.tertiary, marginTop: 6, letterSpacing: -0.28 },

  pillRow: { flexDirection: 'row', gap: 2, marginTop: 12, marginBottom: tokens.spacing.lg },
  pill: { backgroundColor: '#F9FAFF', borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 11, fontWeight: '500', color: 'rgba(33,33,33,0.8)' },

  softShadow: boxShadow(SOFT_SHADOW),

  hero: { marginBottom: tokens.spacing.xl, ...boxShadow(SOFT_SHADOW) },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: tokens.spacing.md },
  heroLabel: { fontSize: 12, lineHeight: 12, color: 'rgba(33,33,33,0.3)', letterSpacing: -0.24 },
  heroAmount: { fontSize: 32, lineHeight: 34, fontWeight: '600', color: '#212121', letterSpacing: -0.64, marginTop: 8 },
  rateBadge: { alignItems: 'flex-end', backgroundColor: '#F9FAFF', borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  rateValue: { fontSize: 20, lineHeight: 20, fontWeight: '700', color: '#586692' },
  ratePremium: { fontSize: 11, lineHeight: 11, color: 'rgba(33,33,33,0.4)', marginTop: 4 },

  progressWrap: { marginTop: tokens.spacing.lg },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#F0F3FA', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  progressMetaText: { fontSize: 12, color: 'rgba(33,33,33,0.4)', letterSpacing: -0.24 },
  progressMetaPct: { fontSize: 12, fontWeight: '600', color: '#586692' },

  heroIncomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#EAF2F9',
  },
  heroIncomeLabel: { fontSize: 14, color: tokens.text.tertiary, letterSpacing: -0.28 },
  heroIncomeValue: { fontSize: 17, fontWeight: '600', color: '#009933', letterSpacing: -0.17 },

  finCard: { marginBottom: tokens.spacing.lg, ...boxShadow(SOFT_SHADOW) },
  finTitle: { fontSize: 18, lineHeight: 18, fontWeight: '600', color: '#212121', letterSpacing: -0.36, marginBottom: tokens.spacing.lg },
  finRow: { flexDirection: 'row', alignItems: 'stretch' },
  finCol: { flex: 1 },
  finSep: { width: 1, backgroundColor: '#EAF2F9', marginHorizontal: 10 },
  finColHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  finIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  finColLabel: { fontSize: 12, color: 'rgba(33,33,33,0.5)', letterSpacing: -0.24, flexShrink: 1 },
  finColValue: { fontSize: 17, lineHeight: 17, fontWeight: '600', color: '#212121', letterSpacing: -0.34, marginTop: 10 },
  finColSub: { fontSize: 11, lineHeight: 11, color: 'rgba(33,33,33,0.3)', letterSpacing: -0.22, marginTop: 5 },

  finTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.lg,
    backgroundColor: '#EAF6EE',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  finTotalLabel: { fontSize: 12, lineHeight: 12, color: 'rgba(33,33,33,0.4)', letterSpacing: -0.24 },
  finTotalValue: { fontSize: 20, lineHeight: 22, fontWeight: '700', color: '#009933', letterSpacing: -0.4, marginTop: 6 },
  finTotalChip: { backgroundColor: '#FFFFFF', borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  finTotalChipText: { fontSize: 11, fontWeight: '500', color: '#009933' },

  forecastHint: { fontSize: 12, lineHeight: 12, color: 'rgba(33,33,33,0.3)', letterSpacing: -0.24, marginTop: -10, marginBottom: tokens.spacing.lg },
  forecastValue: { fontSize: 16, lineHeight: 16, fontWeight: '600', color: '#009933', letterSpacing: -0.32, marginTop: 8 },

  bankCard: boxShadow(SOFT_SHADOW),
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  bankName: { fontSize: 15, lineHeight: 15, fontWeight: '600', color: '#212121', letterSpacing: -0.3 },
  bankHint: { fontSize: 12, lineHeight: 12, color: 'rgba(33,33,33,0.3)', letterSpacing: -0.24, marginTop: 4 },
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
  actionIconDanger: { backgroundColor: '#FCEEEE' },
  actionItemLabel: { fontSize: 11, fontWeight: '500', color: 'rgba(33,33,33,0.8)' },
});
