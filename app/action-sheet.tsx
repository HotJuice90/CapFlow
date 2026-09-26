import React, { useEffect } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActionSheet, runSheetAction } from '@/lib/actionSheet';
import { tapBuzz } from '@/lib/haptics';
import { tokens, font, hexToRgba } from '@/theme';

/**
 * Меню действий — шит в стиле остальных (option-picker, currency-picker):
 * свой грабер, иконка в мягкой подложке, название и короткое пояснение, что
 * именно произойдёт. Разрушительные пункты — красным и последними.
 */
export default function ActionSheet() {
  const cfg = getActionSheet();

  // Конфиг потерян (например, перезагрузка в dev) — просто закрываемся.
  useEffect(() => {
    if (!cfg) router.back();
  }, [cfg]);

  if (!cfg) return null;

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>{cfg.title}</Text>

      {cfg.actions.map((a, i) => {
        const tint = a.danger ? tokens.semantic.negative : tokens.accent.base;
        return (
          <Pressable
            key={a.key}
            style={({ pressed }) => [s.row, i < cfg.actions.length - 1 && s.rowDivider, pressed && s.rowPressed]}
            onPress={() => { tapBuzz(); runSheetAction(a.key); }}
          >
            <View style={[s.iconBox, { backgroundColor: hexToRgba(tint, 0.12) }]}>
              <MaterialCommunityIcons name={a.icon as never} size={20} color={tint} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.label, a.danger && { color: tokens.semantic.negative }]}>{a.label}</Text>
              {a.subtitle ? <Text style={s.subtitle} numberOfLines={1}>{a.subtitle}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 24 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 22, letterSpacing: -0.2, color: tokens.text.primary, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: tokens.radius.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  rowPressed: { opacity: 0.6 },
  iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.semibold, fontSize: 16, lineHeight: 18, color: tokens.text.primary },
  subtitle: { fontFamily: font.regular, fontSize: 13, lineHeight: 15, color: tokens.text.tertiary, marginTop: 3 },
});
