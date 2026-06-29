import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from './ScreenBackground';
import { tokens } from '@/theme';
import { t } from '@/i18n';

/** Заглушка экрана — в общем вайбе (не системный «нет данных»). */
export function Placeholder({
  title,
  icon,
}: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <ScreenBackground>
      <View style={styles.center}>
        <MaterialIcons name={icon} size={44} color={tokens.accent.base} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.soon}>{t.common.soon}</Text>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm },
  title: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  soon: { fontSize: tokens.typography.label, color: tokens.text.tertiary },
});
