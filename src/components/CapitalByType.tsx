import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { tokens } from '@/theme';
import { formatMoney } from '@/format';
import type { CurrencyCode } from '@/domain/types';
import type { TypeGroup } from '@/state/selectors';

function pluralItems(typeId: string, n: number): string {
  const word =
    typeId === 'deposit' ? ['вклад', 'вклада', 'вкладов'] :
    typeId === 'savings' ? ['счёт', 'счёта', 'счетов'] :
    ['актив', 'актива', 'активов'];
  const abs = n % 100;
  const last = abs % 10;
  let form: string;
  if (abs > 10 && abs < 20) form = word[2];
  else if (last === 1) form = word[0];
  else if (last >= 2 && last <= 4) form = word[1];
  else form = word[2];
  return `${n} ${form}`;
}

export function CapitalByType({
  groups,
  total,
  currency,
}: {
  groups: TypeGroup[];
  total: number;
  currency: CurrencyCode;
}) {
  return (
    <Card>
      {groups.map((g, i) => (
        <View key={g.typeId} style={i > 0 ? styles.rowGap : undefined}>
          <View style={styles.line}>
            <View style={[styles.dot, { backgroundColor: g.color }]} />
            <Text style={styles.label}>{g.label}</Text>
            <Text style={styles.amount}>{formatMoney(g.capital, { currency, abbreviateMillions: true })}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(4, Math.round(g.share * 100))}%`, backgroundColor: g.color }]} />
          </View>
          <View style={styles.meta}>
            <Text style={styles.count}>{pluralItems(g.typeId, g.count)}</Text>
            <Text style={styles.income}>
              +{formatMoney(g.incomePerMonth, { currency, kopecks: 'hide' })} / мес
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Всего</Text>
        <Text style={styles.totalValue}>{formatMoney(total, { currency, abbreviateMillions: true })}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rowGap: { marginTop: tokens.spacing.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 4 },
  label: { flex: 1, fontSize: tokens.typography.label, fontWeight: '500', color: tokens.text.primary },
  amount: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.text.primary },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: tokens.surface.neutral,
    overflow: 'hidden',
    marginTop: tokens.spacing.sm,
  },
  fill: { height: 7, borderRadius: 4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  count: { fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  income: { fontSize: tokens.typography.caption, color: tokens.accent.base, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
  },
  totalLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  totalValue: { fontSize: tokens.typography.title, fontWeight: '700', color: tokens.text.primary },
});
