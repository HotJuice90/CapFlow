import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Sparkline } from './Sparkline';
import { tokens, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatPercentSigned } from '@/format';

// Цвета тёмного hero — 1в1 из Figma, не токены приложения: главная будет
// переверстана заново, палитра ещё не окончательное решение бренда.
const HERO_POSITIVE_BRIGHT = '#3DDC97';
const HERO = {
  gradient: ['#2C3654', '#3A466B', '#222A44'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
  glow: hexToRgba(HERO_POSITIVE_BRIGHT, 0.16),
  innerCard: hexToRgba(tokens.surface.white, 0.07),
  innerBorder: hexToRgba(tokens.surface.white, 0.10),
  labelText: hexToRgba(tokens.text.inverse, 0.62),
  positiveBright: HERO_POSITIVE_BRIGHT,
};

export function HomeIncomeHero({
  dayValue,
  monthValue,
  capitalValue,
  capitalDeltaPct,
  avgRate,
  topInstrument,
  spark,
}: {
  dayValue: string;
  monthValue: string;
  capitalValue: string;
  capitalDeltaPct?: number;
  avgRate: string;
  topInstrument?: {
    name: string;
    org: string;
    value: string;
  };
  spark: number[];
}) {
  const hasDelta = typeof capitalDeltaPct === 'number' && isFinite(capitalDeltaPct);
  const positive = (capitalDeltaPct ?? 0) >= 0;

  return (
    <View style={[styles.shadow, boxShadow(tokens.shadow.floating)]}>
      <LinearGradient colors={HERO.gradient} start={HERO.start} end={HERO.end} style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.label}>Сегодня принесёт</Text>
            <Text style={styles.dayValue} numberOfLines={1} adjustsFontSizeToFit>
              +{dayValue}
            </Text>
          </View>

          <View style={styles.monthPanel}>
            <MaterialCommunityIcons name="calendar-month" size={18} color={tokens.text.inverse} />
            <Text style={styles.panelLabel}>В месяц</Text>
            <Text style={styles.panelValue} numberOfLines={1} adjustsFontSizeToFit>
              +{monthValue}
            </Text>
          </View>
        </View>

        {spark.length >= 2 ? (
          <View style={styles.sparkWrap}>
            <Sparkline data={spark} width={SPARK_W} height={42} color={HERO.positiveBright} />
          </View>
        ) : null}

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricLabelRow}>
              <MaterialCommunityIcons name="wallet-outline" size={16} color={tokens.text.inverse} />
              <Text style={styles.metricLabel}>Капитал в работе</Text>
            </View>
            <View style={styles.metricValueRow}>
              <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
                {capitalValue}
              </Text>
              {hasDelta ? (
                <View style={[styles.deltaPill, { backgroundColor: positive ? hexToRgba(HERO.positiveBright, 0.18) : hexToRgba(tokens.semantic.negative, 0.18) }]}>
                  <MaterialCommunityIcons
                    name={positive ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={positive ? HERO.positiveBright : '#FF8A8E'}
                  />
                  <Text style={[styles.deltaText, { color: positive ? HERO.positiveBright : '#FF8A8E' }]}>
                    {formatPercentSigned(capitalDeltaPct as number)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.rateCard}>
            <View style={styles.metricLabelRow}>
              <MaterialCommunityIcons name="percent-outline" size={16} color={tokens.text.inverse} />
              <Text style={styles.metricLabel}>Средняя ставка</Text>
            </View>
            <Text style={styles.rateValue} numberOfLines={1} adjustsFontSizeToFit>
              {avgRate}
            </Text>
          </View>
        </View>

        {topInstrument ? (
          <View style={styles.leaderRow}>
            <View style={styles.leaderIcon}>
              <MaterialCommunityIcons name="star-four-points" size={15} color={HERO.positiveBright} />
            </View>
            <View style={styles.leaderText}>
              <Text style={styles.leaderLabel}>Лидер дохода</Text>
              <Text style={styles.leaderName} numberOfLines={1}>
                {topInstrument.name}
              </Text>
              <Text style={styles.leaderOrg} numberOfLines={1}>
                {topInstrument.org}
              </Text>
            </View>
            <Text style={styles.leaderValue} numberOfLines={1} adjustsFontSizeToFit>
              +{topInstrument.value}/д
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const SPARK_W = 358 - tokens.spacing.xl * 2;

const styles = StyleSheet.create({
  shadow: { borderRadius: tokens.radius.xl, marginBottom: tokens.spacing.md },
  card: { borderRadius: tokens.radius.xl, padding: tokens.spacing.xl, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  headerText: { flex: 1, minWidth: 0 },
  label: { color: HERO.labelText, fontSize: tokens.typography.label, fontWeight: '500' },
  dayValue: { color: tokens.text.inverse, fontSize: tokens.typography.metricLg, fontWeight: '800', marginTop: tokens.spacing.xs },
  monthPanel: {
    width: 112,
    backgroundColor: HERO.innerCard,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: HERO.innerBorder,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  panelLabel: { color: HERO.labelText, fontSize: tokens.typography.micro, marginTop: tokens.spacing.xs },
  panelValue: { color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '800', marginTop: 1 },
  sparkWrap: { marginTop: tokens.spacing.md, opacity: 0.92 },
  metricsRow: { flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.lg },
  metricCard: {
    flex: 1.25,
    minWidth: 0,
    backgroundColor: HERO.innerCard,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: HERO.innerBorder,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  rateCard: {
    flex: 0.75,
    minWidth: 0,
    backgroundColor: HERO.innerCard,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: HERO.innerBorder,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  metricLabel: { flex: 1, color: HERO.labelText, fontSize: tokens.typography.micro },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginTop: tokens.spacing.xs },
  metricValue: { flex: 1, color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '800' },
  rateValue: { color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '800', marginTop: tokens.spacing.xs },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: tokens.radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  deltaText: { fontSize: tokens.typography.micro, fontWeight: '700' },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: HERO.innerBorder,
  },
  leaderIcon: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    backgroundColor: hexToRgba(HERO.positiveBright, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderText: { flex: 1, minWidth: 0 },
  leaderLabel: { color: HERO.labelText, fontSize: tokens.typography.micro },
  leaderName: { color: tokens.text.inverse, fontSize: tokens.typography.caption, fontWeight: '700', marginTop: 1 },
  leaderOrg: { color: HERO.labelText, fontSize: tokens.typography.micro, marginTop: 1 },
  leaderValue: { maxWidth: 96, color: HERO.positiveBright, fontSize: tokens.typography.caption, fontWeight: '800' },
});
