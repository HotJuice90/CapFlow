import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssetView } from '@/domain/types';
import { tokens, hexToRgba } from '@/theme';
import { formatMoney, formatPercent } from '@/format';
import { pluralDays } from '@/format/date';
import { OrgLogo } from '@/components/BankLogo';
import { t } from '@/i18n';

const ICON_BY_TYPE = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
} as const;

/** Строка списка активов: иконка-бокс (цвет организации) + название + доход/день. */
export function AssetRow({ view }: { view: AssetView }) {
  const router = useRouter();
  const { asset, instrument, organization, derived } = view;
  const iconName = ICON_BY_TYPE[instrument.typeId] ?? 'bank-outline';
  // Срок вышел, но актив ещё не закрыт/архивирован руками — нужно решение
  // (продлить/архив/закрыть), см. app/asset/[id].tsx.
  const isMatured = instrument.behavior === 'term' && (derived.termProgress ?? 0) >= 1;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => router.push(`/asset/${asset.id}`)}
    >
      <OrgLogo
        color={organization.color}
        logo={organization.logo}
        imageUri={organization.customImageUri}
        size={44}
        radius={tokens.radius.sm}
        fallbackIcon={iconName}
      />

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
            {organization.name} · {formatPercent(derived.currentRate)}
          </Text>
        )}
      </View>

      <View style={styles.right}>
        <Text style={styles.income}>
          +{formatMoney(derived.incomePerDay, { currency: asset.currency, kopecks: 'hide' })}
        </Text>
        {isMatured ? (
          <View style={styles.maturedBadge}>
            <Text style={styles.maturedBadgeText}>Истёк срок</Text>
          </View>
        ) : derived.daysRemaining !== undefined ? (
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
  maturedBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(tokens.semantic.warning, 0.14),
  },
  maturedBadgeText: {
    fontSize: tokens.typography.micro,
    fontWeight: '700',
    color: tokens.semantic.warning,
  },
});
