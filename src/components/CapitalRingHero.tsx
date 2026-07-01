import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Donut, type DonutSegment } from './Donut';
import { Sparkline } from './Sparkline';
import { tokens } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatPercentSigned } from '@/format';

export interface HeroChip {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  delta?: string;
}

/**
 * Крупный якорный блок: большое число + кольцо состава портфеля + чипы метрик +
 * тонкий тренд снизу. Единый визуальный язык для «Главной» и «Аналитики» —
 * разные экраны просто передают разные метрики/группы.
 */
export function CapitalRingHero({
  label,
  bigValue,
  deltaPct,
  ringGroups,
  ringCenterLabel,
  ringCenterSub,
  chips,
  spark,
}: {
  label: string;
  bigValue: string;
  deltaPct?: number;
  ringGroups: DonutSegment[];
  ringCenterLabel?: string;
  ringCenterSub?: string;
  chips: HeroChip[];
  spark: number[];
}) {
  const hasDelta = typeof deltaPct === 'number' && isFinite(deltaPct);
  const positive = (deltaPct ?? 0) >= 0;

  return (
    <View style={[styles.shadow, boxShadow(tokens.shadow.floating)]}>
      <LinearGradient colors={tokens.hero.gradient} start={tokens.hero.start} end={tokens.hero.end} style={styles.card}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{label}</Text>
              {hasDelta ? (
                <View style={[styles.deltaPill, { backgroundColor: positive ? 'rgba(61,220,151,0.18)' : 'rgba(229,72,77,0.18)' }]}>
                  <MaterialCommunityIcons
                    name={positive ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={positive ? tokens.semantic.positiveBright : '#FF8A8E'}
                  />
                  <Text style={[styles.deltaText, { color: positive ? tokens.semantic.positiveBright : '#FF8A8E' }]}>
                    {formatPercentSigned(deltaPct as number)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.bigValue} numberOfLines={1} adjustsFontSizeToFit>{bigValue}</Text>
          </View>

          {ringGroups.length > 0 ? (
            <Donut
              segments={ringGroups}
              size={84}
              strokeWidth={11}
              centerLabel={ringCenterLabel}
              centerSub={ringCenterSub}
              centerLabelColor="#FFFFFF"
              centerSubColor={tokens.hero.labelText}
              trackColor="rgba(255,255,255,0.10)"
            />
          ) : null}
        </View>

        <View style={styles.chips}>
          {chips.map((chip, i) => (
            <View key={i} style={styles.chip}>
              <MaterialCommunityIcons name={chip.icon} size={17} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.chipLabel}>{chip.label}</Text>
                <Text style={styles.chipValue} numberOfLines={1}>
                  {chip.value}
                  {chip.delta ? <Text style={styles.chipDelta}> {chip.delta}</Text> : null}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {spark.length >= 2 ? (
          <View style={styles.sparkWrap}>
            <Sparkline data={spark} width={SPARK_W} height={36} color={tokens.semantic.positiveBright} />
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

// ширина спарклайна = карточка минус паддинги (см. spacing.xl*2)
const SPARK_W = 358 - tokens.spacing.xl * 2;

const styles = StyleSheet.create({
  shadow: { borderRadius: tokens.radius.xl, marginBottom: tokens.spacing.xl },
  card: { borderRadius: tokens.radius.xl, padding: tokens.spacing.xl, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  label: { color: tokens.hero.labelText, fontSize: tokens.typography.label, fontWeight: '500' },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: tokens.radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  deltaText: { fontSize: tokens.typography.micro, fontWeight: '700' },
  bigValue: { color: '#FFFFFF', fontSize: tokens.typography.metricLg, fontWeight: '800', marginTop: tokens.spacing.xs },
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
  sparkWrap: { marginTop: tokens.spacing.lg, opacity: 0.9 },
});
