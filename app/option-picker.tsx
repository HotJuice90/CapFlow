import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
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
        {cfg.options.map((o) => (
          <TouchableOpacity key={o.value} style={s.row} activeOpacity={0.6} onPress={() => choose(o.value)}>
            {o.color ? (
              <OrgLogo color={o.color} logo={o.logo} size={40} radius={14} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={s.label} numberOfLines={1}>{o.label}</Text>
              {o.subtitle ? <Text style={s.sub} numberOfLines={1}>{o.subtitle}</Text> : null}
            </View>
            {cfg.current === o.value && <MaterialIcons name="check" size={20} color={tokens.accent.base} />}
          </TouchableOpacity>
        ))}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  label: { fontFamily: font.semibold, fontSize: 16, color: '#212121' },
  sub: { fontFamily: font.regular, fontSize: 13, color: tokens.text.secondary, marginTop: 2 },
  empty: { fontFamily: font.regular, paddingVertical: 24, color: tokens.text.tertiary, textAlign: 'center' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EAF2F9' },
  createText: { fontFamily: font.semibold, fontSize: 15, color: tokens.accent.base },
});
