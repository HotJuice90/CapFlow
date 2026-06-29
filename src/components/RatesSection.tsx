import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from './Card';
import { NumberField } from './form/fields';
import { useData } from '@/state/DataContext';
import type { CurrencyCode } from '@/domain/types';
import { tokens } from '@/theme';
import { timeAgo } from '@/format/date';

const MANUAL: CurrencyCode[] = ['USD', 'EUR', 'TRY', 'CNY'];
const NAME: Record<string, string> = {
  USD: 'Доллар США',
  EUR: 'Евро',
  TRY: 'Турецкая лира',
  CNY: 'Китайский юань',
};

export function RatesSection() {
  const { data, updateRates, refreshRates } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshRates();
    } catch {
      // офлайн
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Text style={styles.section}>Курсы валют</Text>
      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>Источник</Text>
          <Text style={styles.value}>ЦБ РФ</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>Обновлено</Text>
          <Text style={styles.muted}>{timeAgo(data.ratesUpdatedAt)}</Text>
        </View>
        <View style={styles.divider} />
        <Pressable style={styles.refreshBtn} onPress={doRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={tokens.accent.base} />
          ) : (
            <MaterialIcons name="refresh" size={20} color={tokens.accent.base} />
          )}
          <Text style={styles.refreshText}>{refreshing ? 'Обновляю…' : 'Обновить с ЦБ'}</Text>
        </Pressable>

        <Text style={styles.manualHint}>Или задать вручную (₽ за 1 единицу):</Text>
        {MANUAL.map((c) => (
          <NumberField
            key={c}
            label={`${c} — ${NAME[c]}`}
            value={data.rates[c]}
            onChange={(v) => void updateRates({ [c]: v ?? 0 })}
            suffix="₽"
          />
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: tokens.spacing.sm },
  label: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  value: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  muted: { fontSize: tokens.typography.label, color: tokens.text.tertiary },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.md },
  refreshText: { fontSize: tokens.typography.body, color: tokens.accent.base, fontWeight: '600' },
  manualHint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: tokens.spacing.sm, marginBottom: tokens.spacing.md },
});
