import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appAlert } from '@/lib/dialog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { useData } from '@/state/DataContext';
import { buildAssetViews } from '@/state/selectors';
import { tokens } from '@/theme';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import { formatDateShort, pluralDays } from '@/format/date';
import { t } from '@/i18n';

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

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.sm,
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
            hitSlop={12}
          >
            <MaterialIcons name="edit" size={16} color={tokens.accent.base} />
            <Text style={styles.editText}>Изменить</Text>
          </Pressable>
        </View>

        <Text style={styles.name}>{instrument.name}</Text>
        <Text style={styles.subtitle}>
          {asset.title ? `↳ ${asset.title} · ` : ''}
          {organization.name}
        </Text>

        {/* Hero */}
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>{t.asset.incomePerDay}</Text>
              <Text style={styles.heroMetric}>
                +{formatMoney(derived.incomePerDay, { currency: cur, kopecks: 'hide' })}
              </Text>
            </View>
            <View style={styles.badge}>
              {isTerm && derived.daysRemaining !== undefined ? (
                <>
                  <Text style={styles.badgeLabel}>{t.asset.remaining}</Text>
                  <Text style={styles.badgeValue}>
                    {derived.daysRemaining} {pluralDays(derived.daysRemaining)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.badgeLabel}>{t.asset.payout}</Text>
                  <Text style={styles.badgeValue}>{t.common.perMonth}</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.heroParams}>
            <View style={styles.heroParam}>
              <Text style={styles.cellLabel}>{t.asset.rate}</Text>
              <Text style={styles.cellValue}>
                {formatPercent(asset.rate)}{' '}
                <Text style={styles.premium}>
                  {formatPercentSigned(derived.premiumToKeyRate)} {t.asset.toKeyRate}
                </Text>
              </Text>
            </View>
            <View style={styles.heroParam}>
              <Text style={styles.cellLabel}>{t.asset.amount}</Text>
              <Text style={styles.cellValue}>{formatMoney(asset.amount, { currency: cur })}</Text>
            </View>
          </View>
        </Card>

        {/* Финансовый результат */}
        <Text style={styles.sectionTitle}>{t.asset.financialResult}</Text>
        <Card>
          <StatRow label={t.asset.accrued} value={formatMoney(derived.accrued, { currency: cur })} />
          <Divider />
          <StatRow label={t.asset.tax} value={formatMoney(derived.tax, { currency: cur })} />
          <Divider />
          <StatRow
            label={t.asset.net}
            value={formatMoney(derived.net, { currency: cur })}
            accent
          />
          {derived.finalAmount !== undefined && (
            <>
              <Divider />
              <StatRow
                label={t.asset.finalAmount}
                value={formatMoney(derived.finalAmount, { currency: cur })}
              />
            </>
          )}
        </Card>

        {/* Второй блок — зависит от поведения */}
        <Text style={styles.sectionTitle}>
          {isTerm ? t.asset.endDate : t.asset.forecast}
        </Text>
        <Card>
          {isTerm && asset.endDate ? (
            <>
              <StatRow label={t.asset.endDate} value={formatDateShort(asset.endDate)} />
              <Divider />
              <StatRow
                label={t.asset.earnedSoFar}
                value={formatMoney(derived.earnedSoFar, { currency: cur })}
              />
              <Divider />
              <StatRow
                label={t.asset.remainingToEarn}
                value={formatMoney(derived.remainingToEarn ?? 0, { currency: cur })}
              />
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round((derived.termProgress ?? 0) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {t.asset.termProgress}: {Math.round((derived.termProgress ?? 0) * 100)}%
                </Text>
              </View>
            </>
          ) : (
            <>
              <StatRow
                label={t.asset.forecastMonth}
                value={formatMoney(derived.forecastNextMonth ?? 0, { currency: cur, kopecks: 'hide' })}
              />
              <Divider />
              <StatRow
                label={t.asset.forecastYear}
                value={formatMoney(derived.forecastNextYear ?? 0, { currency: cur, kopecks: 'hide' })}
              />
            </>
          )}
        </Card>

        {/* Действия */}
        <Text style={styles.sectionTitle}>Действия</Text>
        <Card padded={false}>
          <View style={{ paddingHorizontal: tokens.spacing.lg }}>
            <ActionRow icon="content-copy" label="Дублировать" onPress={onDuplicate} />
            <Divider />
            {isTerm ? (
              <>
                <ActionRow
                  icon="autorenew"
                  label="Продлить"
                  onPress={() => router.push(`/asset/form?id=${asset.id}`)}
                />
                <Divider />
              </>
            ) : null}
            <ActionRow icon="check-circle" label="Закрыть" onPress={onClose} />
            <Divider />
            <ActionRow icon="archive" label="Архивировать" onPress={onArchive} />
            <Divider />
            <ActionRow icon="delete-outline" label="Удалить" danger onPress={onDelete} />
          </View>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? tokens.semantic.negative : tokens.text.primary;
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <MaterialIcons name={icon} size={22} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statAccent]}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: tokens.text.secondary },
  back: { marginBottom: tokens.spacing.md, width: 32 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.md,
  },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { fontSize: tokens.typography.label, color: tokens.accent.base, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  actionLabel: { fontSize: tokens.typography.body, fontWeight: '500' },
  name: { fontSize: tokens.typography.display, fontWeight: '600', color: tokens.text.primary },
  subtitle: {
    fontSize: tokens.typography.label,
    color: tokens.text.secondary,
    marginTop: 4,
    marginBottom: tokens.spacing.lg,
  },
  hero: { marginBottom: tokens.spacing.xl },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLeft: { flex: 1 },
  heroLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary, fontWeight: '500' },
  heroMetric: {
    fontSize: tokens.typography.metricLg,
    fontWeight: '800',
    color: tokens.text.primary,
    marginTop: tokens.spacing.xs,
  },
  badge: {
    backgroundColor: tokens.accent.soft,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    alignItems: 'flex-end',
  },
  badgeLabel: { fontSize: tokens.typography.micro, color: tokens.text.secondary },
  badgeValue: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.accent.deep },
  heroParams: {
    flexDirection: 'row',
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
    gap: tokens.spacing.lg,
  },
  heroParam: { flex: 1 },
  cellLabel: { fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  cellValue: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
    color: tokens.text.primary,
    marginTop: 2,
  },
  premium: { fontSize: tokens.typography.caption, color: tokens.accent.base, fontWeight: '600' },
  sectionTitle: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginBottom: tokens.spacing.md,
    marginTop: tokens.spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  statLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  statValue: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  statAccent: { color: tokens.accent.base, fontWeight: '700' },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  progressWrap: { marginTop: tokens.spacing.md },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.surface.neutral,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: tokens.accent.base },
  progressText: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 6 },
});
