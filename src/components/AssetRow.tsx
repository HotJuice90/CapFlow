import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssetView } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercent } from '@/format';
import { pluralDays } from '@/format/date';
import { OrgLogo } from '@/components/BankLogo';

const ICON_BY_TYPE = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
} as const;

/**
 * Строка списка активов: шапка (лого + название + банк + бейдж срока), под ней
 * ряд подписанных метрик во всю ширину.
 *
 * Почему метрики отдельной строкой, а не справа от названия: суммы бывают
 * восьмизначными, и в правой колонке они отбирали ширину у названия — длинное
 * («Накопительный счёт Лояльный») обрезалось. Тут сумма ни с чем не конкурирует,
 * плюс каждое число подписано, так что «3 052 594» не спутать с доходом.
 * Раньше суммы в строке не было вообще — при том что это самая базовая цифра.
 *
 * Второй фикс: подзаголовок был `title` ЛИБО «банк · ставка», поэтому своё
 * название актива съедало и банк, и ставку. Теперь `title` идёт как название,
 * банк всегда под ним, а ставка живёт в метриках.
 */
export function AssetRow({ view }: { view: AssetView }) {
  const router = useRouter();
  const { asset, instrument, organization, derived } = view;
  const iconName = ICON_BY_TYPE[instrument.typeId] ?? 'bank-outline';
  // Срок вышел, но актив ещё не закрыт/архивирован руками — нужно решение
  // (продлить/архив/закрыть), см. app/asset/[id].tsx.
  const isMatured = instrument.behavior === 'term' && (derived.termProgress ?? 0) >= 1;
  const cur = asset.currency;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => router.push(`/asset/${asset.id}`)}
    >
      <View style={styles.head}>
        <OrgLogo
          color={organization.color}
          logo={organization.logo}
          imageUri={organization.customImageUri}
          size={44}
          radius={tokens.radius.sm}
          fallbackIcon={iconName}
        />
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>
            {asset.title || instrument.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {organization.name}
          </Text>
        </View>
        {isMatured ? (
          <View style={styles.maturedBadge}>
            <Text style={styles.maturedBadgeText}>Истёк срок</Text>
          </View>
        ) : derived.daysRemaining !== undefined ? (
          <View style={styles.termBadge}>
            <Text style={styles.termBadgeText}>
              {derived.daysRemaining} {pluralDays(derived.daysRemaining)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="На счёте" value={formatMoney(derived.currentValue, { currency: cur, kopecks: 'hide' })} />
        <Metric label="Ставка" value={formatPercent(derived.currentRate)} />
        <Metric
          label="В день"
          value={`+${formatMoney(derived.incomePerDay, { currency: cur, kopecks: 'hide' })}`}
          valueColor={tokens.semantic.positive}
          align="right"
        />
      </View>
    </Pressable>
  );
}

function Metric({
  label,
  value,
  valueColor,
  align = 'left',
}: {
  label: string;
  value: string;
  valueColor?: string;
  align?: 'left' | 'right';
}) {
  return (
    <View style={[styles.metric, align === 'right' && styles.metricRight]}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, !!valueColor && { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: tokens.spacing.md },
  pressed: { opacity: 0.6 },

  head: { flexDirection: 'row', alignItems: 'center' },
  headText: { flex: 1, marginLeft: tokens.spacing.md },
  name: {
    fontSize: tokens.typography.body,
    lineHeight: tokens.typography.body + 2,
    fontWeight: '500',
    color: tokens.text.primary,
  },
  subtitle: {
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    color: tokens.text.secondary,
    marginTop: 2,
  },

  // Метрики выровнены по левому краю карточки, а не по тексту шапки: три числа
  // в ряд и так читаются группой, а отступ под лого сузил бы их зря.
  metrics: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  metric: { flex: 1 },
  metricRight: { alignItems: 'flex-end' },
  metricLabel: {
    fontSize: tokens.typography.micro,
    lineHeight: tokens.typography.micro + 2,
    color: tokens.text.tertiary,
  },
  metricValue: {
    fontFamily: font.semibold,
    fontSize: tokens.typography.label,
    lineHeight: tokens.typography.label + 2,
    color: tokens.text.primary,
    marginTop: 3,
  },

  maturedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(tokens.semantic.warning, 0.14),
  },
  maturedBadgeText: {
    fontSize: tokens.typography.micro,
    fontWeight: '700',
    color: tokens.semantic.warning,
  },
  termBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.surface.neutral,
  },
  termBadgeText: {
    fontSize: tokens.typography.micro,
    color: tokens.text.secondary,
  },
});
