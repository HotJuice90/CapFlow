import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Sparkline } from './Sparkline';
import { tokens } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercent, formatPercentSigned } from '@/format';
import type { CurrencyCode } from '@/domain/types';

export function HeroCard({
  incomePerDay,
  incomePerMonth,
  workingCapital,
  avgRate,
  premiumToKeyRate,
  spark,
  currency,
}: {
  incomePerDay: number;
  incomePerMonth: number;
  workingCapital: number;
  avgRate: number;
  premiumToKeyRate: number;
  spark: number[];
  currency: CurrencyCode;
}) {
  return (
    <View style={[styles.shadow, boxShadow(tokens.shadow.floating)]}>
      <LinearGradient
        colors={tokens.hero.gradient}
        start={tokens.hero.start}
        end={tokens.hero.end}
        style={styles.card}
      >
        <Text style={styles.label}>Доход в день</Text>

        <View style={styles.metricRow}>
          <View style={styles.metricLeft}>
            <Text style={styles.metric}>
              +{formatMoney(incomePerDay, { currency, kopecks: 'hide' })}
            </Text>
            <Text style={styles.sub}>
              за месяц +{formatMoney(incomePerMonth, { currency, kopecks: 'hide' })}
            </Text>
          </View>
          <Sparkline data={spark} width={120} height={56} color={tokens.semantic.positiveBright} />
        </View>

        <View style={styles.chips}>
          <View style={styles.chip}>
            <MaterialCommunityIcons name="layers-triple-outline" size={18} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.chipLabel}>Работает</Text>
              <Text style={styles.chipValue}>
                {formatMoney(workingCapital, { currency, abbreviateMillions: true })}
              </Text>
            </View>
          </View>
          <View style={styles.chip}>
            <MaterialCommunityIcons name="percent-outline" size={18} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.chipLabel}>Средняя ставка</Text>
              <Text style={styles.chipValue}>
                {formatPercent(avgRate)}{' '}
                <Text style={styles.chipDelta}>{formatPercentSigned(premiumToKeyRate)}</Text>
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: tokens.radius.xl, marginBottom: tokens.spacing.xl },
  card: { borderRadius: tokens.radius.xl, padding: tokens.spacing.xl, overflow: 'hidden' },
  label: { color: tokens.hero.labelText, fontSize: tokens.typography.label, fontWeight: '500' },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: tokens.spacing.xs,
  },
  metricLeft: { flex: 1 },
  metric: {
    color: tokens.semantic.positiveBright,
    fontSize: tokens.typography.metricLg,
    fontWeight: '800',
  },
  sub: { color: tokens.hero.labelText, fontSize: tokens.typography.caption, marginTop: 2 },
  chips: { flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.xl },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.hero.innerCard,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.hero.innerBorder,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  chipLabel: { color: tokens.hero.labelText, fontSize: tokens.typography.micro },
  chipValue: { color: '#FFFFFF', fontSize: tokens.typography.body, fontWeight: '700', marginTop: 1 },
  chipDelta: { color: tokens.semantic.positiveBright, fontSize: tokens.typography.caption, fontWeight: '600' },
});
