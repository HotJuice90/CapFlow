import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GOAL_ICONS, type GoalIconName } from '@/domain/goalIcons';
import { pickGoalIconValue } from '@/lib/goalIconPicker';
import { tapBuzz } from '@/lib/haptics';
import { tokens, font, hexToRgba } from '@/theme';

export default function GoalIconPickerSheet() {
  const { current } = useLocalSearchParams<{ current?: string }>();
  const choose = (icon: GoalIconName) => { tapBuzz(); pickGoalIconValue(icon); router.back(); };

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>Иконка цели</Text>
      <ScrollView style={s.grid} contentContainerStyle={s.gridInner} showsVerticalScrollIndicator={false}>
        {GOAL_ICONS.map((icon) => {
          const active = icon === current;
          return (
            <Pressable
              key={icon}
              style={[s.cell, active && s.cellActive]}
              onPress={() => choose(icon)}
            >
              <MaterialCommunityIcons name={icon} size={24} color={active ? tokens.text.inverse : tokens.accent.base} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 20 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: tokens.text.primary, marginBottom: 14 },
  grid: { maxHeight: 360 },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 4 },
  cell: {
    width: 52, height: 52, borderRadius: tokens.radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: hexToRgba(tokens.accent.base, 0.1),
  },
  cellActive: { backgroundColor: tokens.accent.base },
});
