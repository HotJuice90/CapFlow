import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { NumberField, SelectField } from '@/components/form/fields';
import { RatesSection } from '@/components/RatesSection';
import { UpdateSection } from '@/components/UpdateSection';
import { useData } from '@/state/DataContext';
import type { CurrencyCode } from '@/domain/types';
import { tokens } from '@/theme';
import { exportData, importData } from '@/backup/backup';
import { t } from '@/i18n';

const CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'CNY'];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, hasDemo, deleteDemoData, reseedDemo, updateParams, updateSettings, replaceAll } = useData();

  const confirmDelete = () => {
    Alert.alert(t.settings.deleteDemo, t.settings.deleteDemoHint, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.delete, style: 'destructive', onPress: () => void deleteDemoData() },
    ]);
  };

  const doExport = async () => {
    try {
      const ok = await exportData(data);
      if (!ok) Alert.alert('Экспорт', 'Шеринг файлов недоступен на этом устройстве.');
    } catch {
      Alert.alert('Ошибка', 'Не удалось экспортировать данные.');
    }
  };

  const doImport = () => {
    Alert.alert(
      'Импорт из файла',
      'Текущие данные будут заменены содержимым выбранного файла. Продолжить?',
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: 'Выбрать файл',
          onPress: async () => {
            try {
              const incoming = await importData();
              if (incoming) {
                await replaceAll(incoming);
                Alert.alert('Готово', 'Данные импортированы.');
              }
            } catch (e) {
              Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось импортировать.');
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.lg,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 90,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>{t.settings.title}</Text>

        {/* Расчёты — редактируемые */}
        <Text style={styles.sectionTitle}>{t.settings.calculations}</Text>
        <Card>
          <NumberField
            label={t.settings.keyRate}
            value={data.params.keyRate}
            onChange={(v) => void updateParams({ keyRate: v ?? 0 })}
            suffix="%"
            hint="ЦБ пока без открытого JSON — задаётся вручную"
          />
          <NumberField
            label={t.settings.taxRate}
            value={data.params.taxRate}
            onChange={(v) => void updateParams({ taxRate: v ?? 0 })}
            suffix="%"
          />
          <NumberField
            label={t.settings.taxFreeLimit}
            value={data.params.taxFreeLimit}
            onChange={(v) => void updateParams({ taxFreeLimit: v ?? 0 })}
            suffix="₽"
          />
          <SelectField
            label={t.settings.defaultCurrency}
            value={data.settings.defaultCurrency}
            options={CURRENCIES.map((c) => ({ label: c, value: c }))}
            onChange={(v) => void updateSettings({ defaultCurrency: v as CurrencyCode })}
          />
        </Card>

        {/* Данные */}
        <Text style={styles.sectionTitle}>{t.settings.data}</Text>
        <Card padded={false} style={{ marginBottom: tokens.spacing.md }}>
          <View style={{ paddingHorizontal: tokens.spacing.lg }}>
            <NavRow icon="account-balance" label="Организации" onPress={() => router.push('/catalog/organizations')} chevron />
            <Divider />
            <NavRow icon="savings" label="Финансовые инструменты" onPress={() => router.push('/catalog/instruments')} chevron />
            <Divider />
            <NavRow icon="ios-share" label="Экспорт в файл (JSON)" onPress={doExport} />
            <Divider />
            <NavRow icon="file-download" label="Импорт из файла" onPress={doImport} />
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

        {/* Курсы валют */}
        <RatesSection />

        {/* Приложение / обновления */}
        <UpdateSection />
      </ScrollView>
    </ScreenBackground>
  );
}

function NavRow({
  icon,
  label,
  onPress,
  chevron,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  chevron?: boolean;
}) {
  return (
    <Pressable style={styles.navRow} onPress={onPress}>
      <MaterialIcons name={icon} size={22} color={tokens.accent.base} />
      <Text style={styles.navLabel}>{label}</Text>
      {chevron ? <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} /> : null}
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: tokens.typography.display, fontWeight: '600', color: tokens.text.primary, marginBottom: tokens.spacing.lg },
  sectionTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  navLabel: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, fontWeight: '500' },
  demoBadgeRow: { flexDirection: 'row', marginBottom: tokens.spacing.md },
  demoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF7E6', paddingHorizontal: tokens.spacing.md, paddingVertical: 4, borderRadius: tokens.radius.xs },
  demoBadgeText: { fontSize: tokens.typography.caption, color: tokens.semantic.warning, fontWeight: '600' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  dangerText: { fontSize: tokens.typography.body, color: tokens.semantic.negative, fontWeight: '600' },
  hint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 4 },
  neutralBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  neutralText: { fontSize: tokens.typography.body, color: tokens.accent.base, fontWeight: '600' },
});
