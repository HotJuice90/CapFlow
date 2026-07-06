import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { tokens, font } from '@/theme';

export default function TaxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateParams } = useData();

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: 80, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Налоговые параметры</Text>
          </View>
        </View>

        <View style={styles.list}>
          <TaxRow
            label="Ставка налога"
            hint="НДФЛ на доход от вкладов"
            value={data.params.taxRate}
            suffix="%"
            onChange={(v) => void updateParams({ taxRate: v })}
          />
          <TaxRow
            label="Необлагаемый лимит"
            hint="Доход сверх лимита — в год"
            value={data.params.taxFreeLimit}
            suffix="₽"
            onChange={(v) => void updateParams({ taxFreeLimit: v })}
          />
        </View>

        <Text style={styles.footnote}>
          Доход сверх лимита облагается налогом. По Налоговому кодексу лимит ≈ 1 млн ₽ × максимальная ключевая ставка года.
        </Text>
      </ScrollView>
    </ScreenBackground>
  );
}

function TaxRow({
  label,
  hint,
  value,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <View style={styles.valueWrap}>
        <TextInput
          style={styles.valueInput}
          value={text}
          keyboardType="numeric"
          selectTextOnFocus
          onChangeText={(t) => {
            const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
            setText(norm);
            const n = parseFloat(norm);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          textAlign="right"
          placeholder="0"
          placeholderTextColor={tokens.text.tertiary}
        />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, flex: 1 },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: 24, color: '#212121', letterSpacing: -0.24 },

  list: { gap: 8 },
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
  valueInput: { fontFamily: font.semibold, fontSize: 18, color: '#212121', minWidth: 50, padding: 0 },
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
