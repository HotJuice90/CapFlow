import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { OrgLogo } from '@/components/BankLogo';
import { getPickerConfig, pickOptionValue, pickCreateNew } from '@/lib/optionPicker';
import { tapBuzz } from '@/lib/haptics';
import { tokens, font, hexToRgba } from '@/theme';

const ALL = 'Все';

/** Универсальный шит выбора (организация, инструмент, период …) — стиль как currency-picker. */
export default function OptionPickerSheet() {
  const cfg = getPickerConfig();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(ALL);

  // Конфиг потерян (например, перезагрузка в dev) — просто закрываемся.
  useEffect(() => {
    if (!cfg) router.back();
  }, [cfg]);

  const filtered = useMemo(() => {
    if (!cfg) return [];
    const q = query.trim().toLowerCase();
    return cfg.options.filter(
      (o) =>
        (activeFilter === ALL || o.filterValue === activeFilter) &&
        (!q || o.label.toLowerCase().includes(q)),
    );
  }, [cfg, query, activeFilter]);

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

      {cfg.searchable ? (
        <View style={s.searchRow}>
          <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск"
            placeholderTextColor={tokens.text.tertiary}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={tokens.text.tertiary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {cfg.filters ? (
        <View style={s.filterWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterBar}>
            {[{ label: ALL, icon: 'view-grid-outline', color: tokens.accent.base }, ...cfg.filters].map((f) => {
              const active = f.label === activeFilter;
              return (
                <Pressable
                  key={f.label}
                  style={[s.filterChip, active && { backgroundColor: f.color }]}
                  onPress={() => setActiveFilter(f.label)}
                >
                  <MaterialCommunityIcons
                    name={f.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                    size={16}
                    color={active ? tokens.text.inverse : f.color}
                  />
                  <Text style={[s.filterChipText, active ? { color: tokens.text.inverse, fontFamily: font.semibold } : { color: f.color }]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView style={s.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {filtered.map((o, i) => {
          const active = cfg.current === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              style={[s.row, i < filtered.length - 1 && s.rowDivider]}
              activeOpacity={0.6}
              onPress={() => choose(o.value)}
            >
              {o.color ? (
                <OrgLogo color={o.color} logo={o.logo} imageUri={o.imageUri} size={40} radius={14} />
              ) : o.icon ? (
                <View
                  style={[
                    s.iconBox,
                    { backgroundColor: hexToRgba(o.iconColor ?? tokens.accent.base, 0.12) },
                    active && { backgroundColor: o.iconColor ?? tokens.accent.base },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={o.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                    size={19}
                    color={active ? tokens.text.inverse : (o.iconColor ?? tokens.accent.base)}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[s.label, active && s.labelActive]} numberOfLines={1}>{o.label}</Text>
                {o.subtitle ? <Text style={s.sub} numberOfLines={1}>{o.subtitle}</Text> : null}
              </View>
              {active ? (
                <MaterialIcons name="check" size={20} color={tokens.accent.base} />
              ) : o.icon ? (
                <View style={s.radioOff} />
              ) : null}
            </TouchableOpacity>
          );
        })}
        {filtered.length === 0 ? (
          <Text style={s.empty}>{cfg.options.length === 0 ? 'Пока пусто — создайте первую запись' : 'Ничего не нашлось'}</Text>
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
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: tokens.text.primary, marginBottom: 10 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.surface.neutral,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: tokens.text.primary },

  // Скролл бleedит до края шита (минус паддинг шита компенсирован тут же).
  filterWrap: { marginHorizontal: -20, marginBottom: 10 },
  filterBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: tokens.surface.tabOff,
  },
  filterChipText: { fontFamily: font.medium, fontSize: 13 },

  list: { maxHeight: 400 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderRadius: tokens.radius.sm, paddingHorizontal: 4 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  iconBox: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.accent.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#D8DFE9', marginRight: 1 },
  label: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.primary },
  labelActive: { color: tokens.accent.base },
  sub: { fontFamily: font.regular, fontSize: 13, color: tokens.text.secondary, marginTop: 2 },
  empty: { fontFamily: font.regular, paddingVertical: 24, color: tokens.text.tertiary, textAlign: 'center' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: tokens.surface.hairline },
  createText: { fontFamily: font.semibold, fontSize: 15, color: tokens.accent.base },
});
