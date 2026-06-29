import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { SubHeader } from '@/components/SubHeader';
import { UpdateSection } from '@/components/UpdateSection';
import { tokens } from '@/theme';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '—';
  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + tokens.spacing.sm, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + 40 }}
      >
        <SubHeader title="О приложении" />

        <Card style={styles.head}>
          <Text style={styles.name}>CapFlow</Text>
          <Text style={styles.ver}>Версия {version}</Text>
          <Text style={styles.desc}>Персональный центр управления капиталом. Вклады, накопительные счета, ЦФА, аналитика и календарь.</Text>
        </Card>

        <UpdateSection />

        <Pressable style={styles.repoRow} onPress={() => void Linking.openURL('https://github.com/HotJuice90/CapFlow')}>
          <MaterialIcons name="code" size={20} color={tokens.accent.base} />
          <Text style={styles.repoText}>Исходный код на GitHub</Text>
          <MaterialIcons name="open-in-new" size={18} color={tokens.text.tertiary} />
        </Pressable>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingVertical: tokens.spacing.xl },
  name: { fontSize: tokens.typography.metric, fontWeight: '800', color: tokens.text.primary },
  ver: { fontSize: tokens.typography.label, color: tokens.text.secondary, marginTop: 4 },
  desc: { fontSize: tokens.typography.caption, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.md, lineHeight: 18 },
  repoRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.lg, justifyContent: 'center', marginTop: tokens.spacing.md },
  repoText: { fontSize: tokens.typography.label, color: tokens.accent.base, fontWeight: '600' },
});
