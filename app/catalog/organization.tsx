import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { TextField, SelectField, ColorField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import type { Organization } from '@/domain/types';
import { tokens } from '@/theme';
import { uid } from '@/utils/id';

const BRAND_COLORS = [
  '#EF3124', '#FF5C00', '#F2A900', '#21A038', '#10B3A3',
  '#3E63DD', '#0A2896', '#9A6DD7', '#E5478B', '#5A6472',
];

const TYPE_OPTIONS = [
  { label: 'Банк', value: 'Банк' },
  { label: 'Платформа ЦФА', value: 'Платформа ЦФА' },
  { label: 'Брокер', value: 'Брокер' },
  { label: 'Другое', value: 'Другое' },
];

export default function OrganizationFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, addOrganization, updateOrganization } = useData();

  const editing = data.organizations.find((o) => o.id === id);
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState(editing?.type ?? 'Банк');
  const [color, setColor] = useState(editing?.color ?? BRAND_COLORS[4]);

  const canSave = name.trim().length > 0;

  const onSave = async () => {
    if (!canSave) return;
    const org: Organization = {
      id: editing?.id ?? uid('org-'),
      name: name.trim(),
      type,
      color,
      archived: editing?.archived,
      isDemo: editing?.isDemo,
    };
    if (editing) await updateOrganization(org);
    else await addOrganization(org);
    router.back();
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.sm,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 100,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <MaterialIcons name="close" size={26} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Организация' : 'Новая организация'}</Text>
          <View style={{ width: 26 }} />
        </View>

        <Card>
          <TextField
            label="Название"
            value={name}
            onChangeText={setName}
            placeholder="Альфа-Банк, Т-Банк…"
            autoFocus={!editing}
          />
          <SelectField
            label="Тип"
            value={type}
            options={TYPE_OPTIONS}
            onChange={setType}
          />
          <ColorField label="Цвет бренда" value={color} onChange={setColor} colors={BRAND_COLORS} />
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + tokens.spacing.md }]}>
        <Pressable style={[styles.saveBtn, !canSave && styles.disabled]} disabled={!canSave} onPress={onSave}>
          <Text style={styles.saveText}>Сохранить</Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  headerTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tokens.spacing.screenH,
    paddingTop: tokens.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: 1,
    borderTopColor: tokens.surface.hairline,
  },
  saveBtn: {
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  disabled: { backgroundColor: tokens.text.tertiary },
  saveText: { color: '#FFFFFF', fontSize: tokens.typography.body, fontWeight: '700' },
});
