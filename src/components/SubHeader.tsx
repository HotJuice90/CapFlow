import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/theme';

/** Шапка под-экрана: назад + заголовок. */
export function SubHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.lg },
  back: { width: 32 },
  title: { flex: 1, fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  spacer: { width: 32 },
});
