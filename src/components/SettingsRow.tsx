import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/theme';

/** Строка списка настроек: цветная иконка + название + значение + шеврон. */
export function SettingsRow({
  icon,
  color = tokens.accent.base,
  label,
  value,
  onPress,
  chevron = true,
  danger,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  color?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const tint = danger ? tokens.semantic.negative : color;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]} onPress={onPress} disabled={!onPress}>
      <View style={[styles.iconBox, { backgroundColor: `${tint}1A` }]}>
        <MaterialIcons name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.label, danger && { color: tokens.semantic.negative }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}
      {chevron && onPress ? <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} style={styles.chev} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.md, gap: tokens.spacing.md },
  pressed: { opacity: 0.6 },
  iconBox: { width: 34, height: 34, borderRadius: tokens.radius.sm, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, fontWeight: '500' },
  value: { fontSize: tokens.typography.label, color: tokens.text.secondary, fontWeight: '500', maxWidth: 140 },
  chev: { marginLeft: 2 },
});
