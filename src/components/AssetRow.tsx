import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { AssetView } from '@/domain/types';
import { tokens, tintToWhite } from '@/theme';
import { formatMoney, formatPercent } from '@/format';
import { pluralDays } from '@/format/date';
import { BankLogo, hasBankLogo } from '@/components/BankLogo';
import { t } from '@/i18n';

const ICON_BY_TYPE = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  dfa: 'chart-line',
} as const;

/** Строка списка активов: иконка-бокс (цвет организации) + название + доход/день. */
export function AssetRow({ view }: { view: AssetView }) {
  const router = useRouter();
  const { asset, instrument, organization, derived } = view;
  const iconName = ICON_BY_TYPE[instrument.typeId] ?? 'bank-outline';

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => router.push(`/asset/${asset.id}`)}
    >
      {hasBankLogo(organization.logo) ? (
        <View style={[styles.iconBox, { backgroundColor: tintToWhite(organization.color, 0.88) }]}>
          <BankLogo bankId={organization.logo} size={30} />
        </View>
      ) : (
        <View style={[styles.iconBox, { backgroundColor: organization.color }]}>
          <MaterialCommunityIcons name={iconName} size={22} color="#FFFFFF" />
        </View>
      )}

      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {instrument.name}
        </Text>
        {asset.title ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            ↳ {asset.title}
          </Text>
        ) : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {organization.name} · {formatPercent(asset.rate)}
          </Text>
        )}
      </View>

      <View style={styles.right}>
        <Text style={styles.income}>
          +{formatMoney(derived.incomePerDay, { currency: asset.currency, kopecks: 'hide' })}
        </Text>
        {derived.daysRemaining !== undefined ? (
          <Text style={styles.meta}>
            {derived.daysRemaining} {pluralDays(derived.daysRemaining)}
          </Text>
        ) : (
          <Text style={styles.meta}>{t.common.perDay}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
  },
  pressed: { opacity: 0.6 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F9FAFB',
  },
  middle: { flex: 1, marginLeft: tokens.spacing.md },
  name: {
    fontSize: tokens.typography.body,
    fontWeight: '500',
    color: tokens.text.primary,
  },
  subtitle: {
    fontSize: tokens.typography.caption,
    color: tokens.text.secondary,
    marginTop: 2,
  },
  right: { alignItems: 'flex-end' },
  income: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
    color: tokens.accent.base,
  },
  meta: {
    fontSize: tokens.typography.micro,
    color: tokens.text.tertiary,
    marginTop: 2,
  },
});
