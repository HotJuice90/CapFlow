import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Toggle } from '@/components/Toggle';
import { tokens } from '@/theme';

/** Строка списка настроек: цветная иконка + название + значение/свитч + шеврон. */
export function SettingsRow({
  icon,
  color = tokens.accent.base,
  label,
  value,
  onPress,
  chevron = true,
  danger,
  toggle,
  badge,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  color?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  /** Строка-свитч вместо значения+шеврона — тап по всей строке тоже переключает. */
  toggle?: { value: boolean; onChange: (v: boolean) => void; offColor?: string };
  /** Точка-нотификация справа от названия (например «доступно обновление»). */
  badge?: boolean;
}) {
  const tint = danger ? tokens.semantic.negative : color;
  const rowOnPress = toggle ? () => toggle.onChange(!toggle.value) : onPress;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && rowOnPress && styles.pressed]} onPress={rowOnPress} disabled={!rowOnPress}>
      <View style={[styles.iconBox, { backgroundColor: `${tint}1A` }]}>
        <MaterialIcons name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.label, danger && { color: tokens.semantic.negative }, badge && styles.labelBadged]} numberOfLines={1}>{label}</Text>
      {badge ? (
        <>
          <View style={styles.badge} />
          <View style={styles.spacer} />
        </>
      ) : null}
      {toggle ? (
        <Toggle value={toggle.value} onChange={toggle.onChange} interactive={false} offColor={toggle.offColor} />
      ) : (
        <>
          {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}
          {chevron && onPress ? <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} style={styles.chev} /> : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.md, gap: tokens.spacing.md },
  pressed: { opacity: 0.6 },
  iconBox: { width: 34, height: 34, borderRadius: tokens.radius.sm, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, fontWeight: '500' },
  // С точкой название не должно РАСТЯГИВАТЬСЯ (иначе точка уезжает к шеврону),
  // но сжиматься обязано — длинный label иначе выдавит значение за край.
  labelBadged: { flexGrow: 0, flexShrink: 1, marginRight: -6 },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.semantic.negative },
  spacer: { flex: 1, marginLeft: -tokens.spacing.md },
  value: { fontSize: tokens.typography.label, color: tokens.text.secondary, fontWeight: '500', maxWidth: 140 },
  chev: { marginLeft: 2 },
});
