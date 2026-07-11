import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { tokens, font } from '@/theme';
import { CURRENCY_SYMBOL } from '@/format';

/**
 * Ручной ввод «весь капитал, включая ещё не размещённый» — временное решение
 * для карточки «Можно разместить» в аналитике, до появления отдельной
 * сущности для свободного капитала (решение пока не принято, какой именно).
 */
export default function CapitalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateSettings } = useData();
  const symbol = CURRENCY_SYMBOL[data.settings.defaultCurrency];

  const [text, setText] = useState(data.settings.manualTotalCapital ? String(data.settings.manualTotalCapital) : '');

  const onChangeText = (t: string) => {
    const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
    setText(norm);
    const n = parseFloat(norm);
    void updateSettings({ manualTotalCapital: Number.isFinite(n) && n > 0 ? n : undefined });
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: 80, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Капитал вне активов</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowLabel}>Весь капитал</Text>
            <Text style={styles.rowHint}>Включая ещё не размещённые деньги</Text>
          </View>
          <View style={styles.valueWrap}>
            <TextInput
              style={styles.valueInput}
              value={text}
              keyboardType="numeric"
              selectTextOnFocus
              onChangeText={onChangeText}
              textAlign="right"
              placeholder="0"
              placeholderTextColor={tokens.text.tertiary}
            />
            <Text style={styles.suffix}>{symbol}</Text>
          </View>
        </View>

        <Text style={styles.footnote}>
          Разница между этим числом и суммой уже заведённых активов показывается
          в аналитике как «Можно разместить». Не задано — карточка не показывается.
        </Text>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.xl },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: 24, color: '#212121', letterSpacing: -0.24 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(249,250,255,0.55)',
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowLabel: { fontFamily: font.medium, fontSize: 16, color: '#212121' },
  rowHint: { fontFamily: font.regular, fontSize: 12, color: 'rgba(33,33,33,0.4)', marginTop: 2 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  valueInput: { fontFamily: font.semibold, fontSize: 18, color: '#212121', minWidth: 60, padding: 0 },
  suffix: { fontFamily: font.regular, fontSize: 16, color: tokens.text.tertiary },

  footnote: {
    fontFamily: font.regular,
    fontSize: 12,
    color: 'rgba(33,33,33,0.4)',
    lineHeight: 18,
    marginTop: tokens.spacing.lg,
    paddingHorizontal: 10,
  },
});
