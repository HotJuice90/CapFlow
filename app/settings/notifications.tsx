import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { SubHeader } from '@/components/SubHeader';
import { tokens } from '@/theme';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + tokens.spacing.sm, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + 40 }}>
        <SubHeader title="Уведомления" />
        <Card style={styles.card}>
          <View style={styles.iconBox}>
            <MaterialIcons name="notifications-none" size={32} color={tokens.accent.base} />
          </View>
          <Text style={styles.title}>Скоро</Text>
          <Text style={styles.text}>Напоминания об окончании вкладов и важных событиях добавим после базового релиза.</Text>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  iconBox: { width: 64, height: 64, borderRadius: tokens.radius.lg, backgroundColor: tokens.accent.soft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  text: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg, lineHeight: 20 },
});
