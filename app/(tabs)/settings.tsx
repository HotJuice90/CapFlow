import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { UpdateSection } from '@/components/UpdateSection';
import { useData } from '@/state/DataContext';
import { tokens } from '@/theme';
import { formatPercent, formatMoney } from '@/format';
import { t } from '@/i18n';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, hasDemo, deleteDemoData, reseedDemo } = useData();

  const confirmDelete = () => {
    Alert.alert(t.settings.deleteDemo, t.settings.deleteDemoHint, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.delete, style: 'destructive', onPress: () => void deleteDemoData() },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.lg,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>{t.settings.title}</Text>

        {/* Расчёты */}
        <Text style={styles.sectionTitle}>{t.settings.calculations}</Text>
        <Card>
          <Row label={t.settings.keyRate} value={formatPercent(data.params.keyRate)} />
          <Divider />
          <Row label={t.settings.taxRate} value={formatPercent(data.params.taxRate)} />
          <Divider />
          <Row
            label={t.settings.taxFreeLimit}
            value={formatMoney(data.params.taxFreeLimit, { currency: data.settings.defaultCurrency })}
          />
          <Divider />
          <Row label={t.settings.defaultCurrency} value={data.settings.defaultCurrency} />
        </Card>

        {/* Данные */}
        <Text style={styles.sectionTitle}>{t.settings.data}</Text>
        <Card padded={false} style={{ marginBottom: tokens.spacing.md }}>
          <View style={{ paddingHorizontal: tokens.spacing.lg }}>
            <Pressable style={styles.navRow} onPress={() => router.push('/catalog/organizations')}>
              <MaterialIcons name="account-balance" size={22} color={tokens.accent.base} />
              <Text style={styles.navLabel}>Организации</Text>
              <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
            </Pressable>
            <Divider />
            <Pressable style={styles.navRow} onPress={() => router.push('/catalog/instruments')}>
              <MaterialIcons name="savings" size={22} color={tokens.accent.base} />
              <Text style={styles.navLabel}>Финансовые инструменты</Text>
              <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
            </Pressable>
          </View>
        </Card>
        <Card>
          {hasDemo ? (
            <>
              <View style={styles.demoBadgeRow}>
                <View style={styles.demoBadge}>
                  <MaterialIcons name="science" size={14} color={tokens.semantic.warning} />
                  <Text style={styles.demoBadgeText}>{t.settings.demoBadge}</Text>
                </View>
              </View>
              <Pressable style={styles.dangerBtn} onPress={confirmDelete}>
                <MaterialIcons name="delete-outline" size={20} color={tokens.semantic.negative} />
                <Text style={styles.dangerText}>{t.settings.deleteDemo}</Text>
              </Pressable>
              <Text style={styles.hint}>{t.settings.deleteDemoHint}</Text>
            </>
          ) : (
            <Pressable style={styles.neutralBtn} onPress={() => void reseedDemo()}>
              <MaterialIcons name="refresh" size={20} color={tokens.accent.base} />
              <Text style={styles.neutralText}>{t.settings.reseedDemo}</Text>
            </Pressable>
          )}
        </Card>

        {/* Приложение / обновления */}
        <UpdateSection />
      </ScrollView>
    </ScreenBackground>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screenTitle: {
    fontSize: tokens.typography.display,
    fontWeight: '600',
    color: tokens.text.primary,
    marginBottom: tokens.spacing.lg,
  },
  sectionTitle: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  rowLabel: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  rowValue: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  navLabel: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, fontWeight: '500' },
  demoBadgeRow: { flexDirection: 'row', marginBottom: tokens.spacing.md },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7E6',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 4,
    borderRadius: tokens.radius.xs,
  },
  demoBadgeText: { fontSize: tokens.typography.caption, color: tokens.semantic.warning, fontWeight: '600' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  dangerText: { fontSize: tokens.typography.body, color: tokens.semantic.negative, fontWeight: '600' },
  hint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 4 },
  neutralBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  neutralText: { fontSize: tokens.typography.body, color: tokens.accent.base, fontWeight: '600' },
});
