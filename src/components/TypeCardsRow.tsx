import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { tokens, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney } from '@/format';
import type { CurrencyCode } from '@/domain/types';
import type { TypeGroup } from '@/state/selectors';

const ICON_BY_TYPE: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  dfa: 'chart-line',
};

function pluralItems(typeId: string, n: number): string {
  const word =
    typeId === 'deposit' ? ['вклад', 'вклада', 'вкладов'] :
    typeId === 'savings' ? ['счёт', 'счёта', 'счетов'] :
    ['актив', 'актива', 'активов'];
  const abs = n % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} ${word[2]}`;
  if (last === 1) return `${n} ${word[0]}`;
  if (last >= 2 && last <= 4) return `${n} ${word[1]}`;
  return `${n} ${word[2]}`;
}

/** Горизонтальная лента ярких карточек — состав портфеля по типу инструмента. */
export function TypeCardsRow({
  groups,
  currency,
}: {
  groups: TypeGroup[];
  currency: CurrencyCode;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {groups.map((g) => (
        <View key={g.typeId} style={[styles.shadow, boxShadow(tokens.shadow.cardSoft)]}>
          <LinearGradient
            colors={[g.color, g.color]}
            style={styles.card}
          >
            {/* глянцевый блик по диагонали */}
            <LinearGradient
              colors={[hexToRgba('#FFFFFF', 0.24), hexToRgba('#FFFFFF', 0)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.9, y: 0.9 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name={ICON_BY_TYPE[g.typeId] ?? 'bank-outline'} size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.label} numberOfLines={1}>{g.label}</Text>
            <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(g.capital, { currency, abbreviateMillions: true })}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.count}>{pluralItems(g.typeId, g.count)}</Text>
              <View style={styles.sharePill}>
                <Text style={styles.shareText}>{Math.round(g.share * 100)}%</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      ))}
    </ScrollView>
  );
}

const CARD_W = 160;

const styles = StyleSheet.create({
  row: { gap: tokens.spacing.md, paddingBottom: 4 },
  shadow: { borderRadius: tokens.radius.lg },
  card: {
    width: CARD_W,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    overflow: 'hidden',
  },
  iconBox: {
    width: 34, height: 34, borderRadius: tokens.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing.md,
  },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: tokens.typography.caption, fontWeight: '600' },
  amount: { color: '#FFFFFF', fontSize: tokens.typography.title, fontWeight: '800', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: tokens.spacing.md },
  count: { color: 'rgba(255,255,255,0.75)', fontSize: tokens.typography.micro, flexShrink: 1 },
  sharePill: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  shareText: { color: '#FFFFFF', fontSize: tokens.typography.micro, fontWeight: '800' },
});
