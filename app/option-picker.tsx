import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { OrgLogo } from '@/components/BankLogo';
import { getPickerConfig, pickOptionValue, pickCreateNew } from '@/lib/optionPicker';
import { tapBuzz } from '@/lib/haptics';
import { tokens, font } from '@/theme';

/** Универсальный шит выбора (организация, инструмент, период …) — стиль как currency-picker. */
export default function OptionPickerSheet() {
  const cfg = getPickerConfig();

  // Конфиг потерян (например, перезагрузка в dev) — просто закрываемся.
  useEffect(() => {
    if (!cfg) router.back();
  }, [cfg]);
  if (!cfg) return null;

  const choose = (value: string) => {
    tapBuzz();
    pickOptionValue(value);
    router.back();
  };

  const createNew = () => {
    tapBuzz();
    router.back();
    // даём шиту закрыться, затем открываем экран создания
    setTimeout(() => pickCreateNew(), 80);
  };

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>{cfg.title}</Text>
      <ScrollView style={s.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {cfg.options.map((o, i) => {
          const active = cfg.current === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              style={[s.row, i < cfg.options.length - 1 && !active && s.rowDivider, active && s.rowActive]}
              activeOpacity={0.6}
              onPress={() => choose(o.value)}
            >
              {o.color ? (
                <OrgLogo color={o.color} logo={o.logo} size={40} radius={14} />
              ) : o.icon ? (
                <View style={[s.iconBox, active && s.iconBoxActive]}>
                  <MaterialCommunityIcons
                    name={o.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                    size={19}
                    color={active ? '#FFFFFF' : tokens.accent.base}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[s.label, active && s.labelActive]} numberOfLines={1}>{o.label}</Text>
                {o.subtitle ? <Text style={s.sub} numberOfLines={1}>{o.subtitle}</Text> : null}
              </View>
              {active ? (
                <MaterialIcons name="check-circle" size={22} color={tokens.accent.base} />
              ) : o.icon ? (
                <View style={s.radioOff} />
              ) : null}
            </TouchableOpacity>
          );
        })}
        {cfg.options.length === 0 ? (
          <Text style={s.empty}>Пока пусто — создайте первую запись</Text>
        ) : null}
      </ScrollView>
      {cfg.onCreateNew ? (
        <TouchableOpacity style={s.createRow} activeOpacity={0.6} onPress={createNew}>
          <MaterialIcons name="add" size={20} color={tokens.accent.base} />
          <Text style={s.createText}>{cfg.createLabel ?? 'Создать новую'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: '#212121', marginBottom: 10 },
  list: { maxHeight: 460 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderRadius: tokens.radius.sm, paddingHorizontal: 4 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#EAF2F9' },
  rowActive: { backgroundColor: tokens.accent.soft },
  iconBox: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.accent.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBoxActive: { backgroundColor: tokens.accent.base },
  radioOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#D8DFE9', marginRight: 1 },
  label: { fontFamily: font.semibold, fontSize: 16, color: '#212121' },
  labelActive: { color: tokens.accent.base },
  sub: { fontFamily: font.regular, fontSize: 13, color: tokens.text.secondary, marginTop: 2 },
  empty: { fontFamily: font.regular, paddingVertical: 24, color: tokens.text.tertiary, textAlign: 'center' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EAF2F9' },
  createText: { fontFamily: font.semibold, fontSize: 15, color: tokens.accent.base },
});
