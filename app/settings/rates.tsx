import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { RatesSection } from '@/components/RatesSection';
import { SpinIcon } from '@/components/SpinIcon';
import { RefreshIcon } from '@/components/RefreshIcon';
import { useData } from '@/state/DataContext';
import { tokens, font, hexToRgba } from '@/theme';

export default function RatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshRates } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
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
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: tokens.spacing.screenTop, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Валюты и курсы</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push('/settings/manual-rates')} hitSlop={12} style={styles.refreshBtn}>
              <MaterialIcons name="edit" size={20} color={tokens.accent.base} />
            </Pressable>
            <Pressable onPress={onRefresh} hitSlop={12} style={styles.refreshBtn} disabled={refreshing}>
              <SpinIcon spinning={refreshing}>
                <RefreshIcon size={20} color={tokens.accent.base} />
              </SpinIcon>
            </Pressable>
          </View>
        </View>

        <RatesSection />
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 30,
    backgroundColor: hexToRgba(tokens.surface.white, 0.5),
    borderWidth: 1,
    borderColor: hexToRgba(tokens.surface.white, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
