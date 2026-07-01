import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appAlert } from '@/lib/dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { SubHeader } from '@/components/SubHeader';
import { useData } from '@/state/DataContext';
import { tokens } from '@/theme';
import { t } from '@/i18n';

export default function DemoScreen() {
  const insets = useSafeAreaInsets();
  const { hasDemo, deleteDemoData, reseedDemo } = useData();

  const confirmDelete = () => {
    appAlert(t.settings.deleteDemo, t.settings.deleteDemoHint, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.delete, style: 'destructive', onPress: () => void deleteDemoData() },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + tokens.spacing.sm, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + 40 }}>
        <SubHeader title="Тестовые данные" />
        <Card>
          {hasDemo ? (
            <>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <MaterialIcons name="science" size={14} color={tokens.semantic.warning} />
                  <Text style={styles.badgeText}>{t.settings.demoBadge}</Text>
                </View>
              </View>
              <Pressable style={styles.danger} onPress={confirmDelete}>
                <MaterialIcons name="delete-outline" size={20} color={tokens.semantic.negative} />
                <Text style={styles.dangerText}>{t.settings.deleteDemo}</Text>
              </Pressable>
              <Text style={styles.hint}>{t.settings.deleteDemoHint}</Text>
            </>
          ) : (
            <Pressable style={styles.neutral} onPress={() => void reseedDemo()}>
              <MaterialIcons name="refresh" size={20} color={tokens.accent.base} />
              <Text style={styles.neutralText}>{t.settings.reseedDemo}</Text>
            </Pressable>
          )}
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', marginBottom: tokens.spacing.md },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF7E6', paddingHorizontal: tokens.spacing.md, paddingVertical: 4, borderRadius: tokens.radius.xs },
  badgeText: { fontSize: tokens.typography.caption, color: tokens.semantic.warning, fontWeight: '600' },
  danger: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  dangerText: { fontSize: tokens.typography.body, color: tokens.semantic.negative, fontWeight: '600' },
  hint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 4 },
  neutral: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  neutralText: { fontSize: tokens.typography.body, color: tokens.accent.base, fontWeight: '600' },
});
