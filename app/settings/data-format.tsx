import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { SettingsRow } from '@/components/SettingsRow';
import { useData } from '@/state/DataContext';
import { tokens, font } from '@/theme';
import { formatMoney } from '@/format';

/** Тестовые суммы для превью — подобраны так, чтобы каждая наглядно показывала
 *  именно тот эффект, который переключает соответствующая настройка. */
const PREVIEW_MILLIONS = 2_384_750;
const PREVIEW_KOPECKS = 84_750.5;

/** Тумблеры тут лежат прямо на фоне экрана (без белой карточки) — обычный OFF-цвет
 *  трека (surface.neutral) на нём сливается. Берём подложку неактивных чипов
 *  из каталога инструментов (app/catalog/instruments.tsx) — она уже рассчитана
 *  на контраст с этим же фоном. */
const TOGGLE_OFF_COLOR = 'rgba(215,226,235,0.5)';

export default function DataFormatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateSettings } = useData();
  const cur = data.settings.defaultCurrency;

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: 80, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Формат данных</Text>
        </View>

        <SettingsRow
          icon="short-text"
          color="#3E63DD"
          label="Сокращать миллионы"
          toggle={{
            value: data.settings.abbreviateMillions,
            onChange: (v) => updateSettings({ abbreviateMillions: v }),
            offColor: TOGGLE_OFF_COLOR,
          }}
        />
        <View style={styles.preview}>
          <Text style={styles.previewValue}>{formatMoney(PREVIEW_MILLIONS, { currency: cur })}</Text>
          <Text style={styles.previewHint}>Пример: как будет показана крупная сумма</Text>
        </View>

        <View style={{ marginTop: tokens.spacing.lg }}>
          <SettingsRow
            icon="paid"
            color="#21A038"
            label="Показывать копейки"
            toggle={{
              value: data.settings.kopecks !== 'hide',
              onChange: (v) => updateSettings({ kopecks: v ? 'auto' : 'hide' }),
              offColor: TOGGLE_OFF_COLOR,
            }}
          />
        </View>
        <View style={styles.preview}>
          <Text style={styles.previewValue}>{formatMoney(PREVIEW_KOPECKS, { currency: cur })}</Text>
          <Text style={styles.previewHint}>Пример: как будет показана сумма с копейками</Text>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.xl },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: 24, color: '#212121', letterSpacing: -0.24 },

  preview: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(249,250,255,0.55)',
  },
  previewValue: { fontFamily: font.semibold, fontSize: 20, color: '#212121', letterSpacing: -0.4 },
  previewHint: { fontFamily: font.regular, fontSize: 12, color: 'rgba(33,33,33,0.4)', marginTop: 4 },
});
