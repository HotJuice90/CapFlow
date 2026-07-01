import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appAlert } from '@/lib/dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Card } from '@/components/Card';
import { SettingsRow } from '@/components/SettingsRow';
import { openCurrencyPicker } from '@/lib/currencyPicker';
import { useData } from '@/state/DataContext';
import type { CurrencyCode } from '@/domain/types';
import { tokens } from '@/theme';
import { CURRENCY_SYMBOL, formatPercent } from '@/format';
import { exportData, importData } from '@/backup/backup';
import { t } from '@/i18n';
import Constants from 'expo-constants';

const CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'KZT', 'BYN', 'CNY', 'INR', 'AED', 'BRL', 'ARS'];
const CUR_NAME: Record<CurrencyCode, string> = {
  RUB: 'Российский рубль', USD: 'Доллар США', EUR: 'Евро', TRY: 'Турецкая лира', KZT: 'Казахстанский тенге',
  BYN: 'Белорусский рубль', CNY: 'Китайский юань', INR: 'Индийская рупия', AED: 'Дирхам ОАЭ',
  BRL: 'Бразильский реал', ARS: 'Аргентинское песо',
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, updateSettings, replaceAll } = useData();
  const version = Constants.expoConfig?.version ?? '—';

  const openCurrency = () => {
    openCurrencyPicker((code) => { void updateSettings({ defaultCurrency: code }); }, data.settings.defaultCurrency);
  };

  const doExport = async () => {
    try {
      const ok = await exportData(data);
      if (!ok) appAlert('Экспорт', 'Шеринг файлов недоступен на этом устройстве.');
    } catch {
      appAlert('Ошибка', 'Не удалось экспортировать данные.');
    }
  };

  const doImport = () => {
    appAlert('Импорт из файла', 'Текущие данные будут заменены содержимым выбранного файла. Продолжить?', [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: 'Выбрать файл',
        onPress: async () => {
          try {
            const incoming = await importData();
            if (incoming) {
              await replaceAll(incoming);
              appAlert('Готово', 'Данные импортированы.');
            }
          } catch (e) {
            appAlert('Ошибка', e instanceof Error ? e.message : 'Не удалось импортировать.');
          }
        },
      },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: 80, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenTitle>{t.settings.title}</ScreenTitle>

        <Group title="Данные">
          <SettingsRow icon="account-balance" color="#9A6DD7" label="Организации" onPress={() => router.push('/catalog/organizations')} />
          <Divider />
          <SettingsRow icon="layers" color="#21A038" label="Фин. инструменты" onPress={() => router.push('/catalog/instruments')} />
          <Divider />
          <SettingsRow icon="currency-exchange" color="#F2A900" label="Валюты и курсы" value="ЦБ РФ" onPress={() => router.push('/settings/rates')} />
          <Divider />
          <SettingsRow icon="notifications-none" color="#7C4DD6" label="Уведомления" onPress={() => router.push('/settings/notifications')} />
        </Group>

        <Group title="Расчёты">
          <SettingsRow icon="account-balance" color="#3E63DD" label="Ключевая ставка ЦБ" value={formatPercent(data.params.keyRate)} onPress={() => router.push('/settings/key-rate')} />
          <Divider />
          <SettingsRow icon="payments" color="#21A038" label="Валюта по умолчанию" value={data.settings.defaultCurrency} onPress={openCurrency} />
          <Divider />
          <SettingsRow icon="description" color="#FF5C00" label="Налоговые параметры" onPress={() => router.push('/settings/tax')} />
        </Group>

        <Group title="Приложение">
          <SettingsRow icon="save-alt" color="#3E63DD" label="Экспорт данных" chevron={false} onPress={doExport} />
          <Divider />
          <SettingsRow icon="file-upload" color="#3E63DD" label="Импорт данных" chevron={false} onPress={doImport} />
          <Divider />
          <SettingsRow icon="science" color="#F2A900" label="Тестовые данные" onPress={() => router.push('/settings/demo')} />
          <Divider />
          <SettingsRow
            icon="dark-mode"
            color="#2C3654"
            label="Тёмный навбар"
            value={data.settings.navBar === 'dark' ? 'Вкл' : 'Выкл'}
            onPress={() => updateSettings({ navBar: data.settings.navBar === 'dark' ? 'light' : 'dark' })}
          />
          <Divider />
          <SettingsRow icon="palette" color="#62709C" label="Тема" value="Светлая" chevron={false} />
        </Group>

        <Group title="Справка">
          <SettingsRow icon="info-outline" color="#62709C" label="О приложении" value={version} onPress={() => router.push('/settings/about')} />
        </Group>
      </ScrollView>
    </ScreenBackground>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.group}>{title}</Text>
      <Card padded={false} style={{ marginBottom: tokens.spacing.lg }}>
        <View style={{ paddingHorizontal: tokens.spacing.lg }}>{children}</View>
      </Card>
    </>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  group: { fontSize: tokens.typography.caption, fontWeight: '700', color: tokens.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: tokens.spacing.md, marginBottom: tokens.spacing.sm, marginLeft: tokens.spacing.xs },
  divider: { height: 1, backgroundColor: tokens.surface.hairline, marginLeft: 46 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,28,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: tokens.surface.white, borderTopLeftRadius: tokens.radius.xl, borderTopRightRadius: tokens.radius.xl, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl },
  sheetTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginBottom: tokens.spacing.md },
  sheetList: { maxHeight: 440 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md, borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  optSym: { width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.surface.neutral, alignItems: 'center', justifyContent: 'center' },
  optSymText: { fontSize: tokens.typography.body, fontWeight: '700', color: tokens.text.primary },
  optCode: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  optName: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 1 },
});
