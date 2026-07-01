import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { BankLogo } from '@/components/BankLogo';
import { TextField, SelectField, ColorField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import type { Organization } from '@/domain/types';
import { BANKS } from '@/domain/banks';
import { tokens, font, tintToWhite } from '@/theme';
import { tapBuzz, successBuzz } from '@/lib/haptics';
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
  const [logo, setLogo] = useState<string | undefined>(editing?.logo);

  const canSave = name.trim().length > 0;

  const pickBank = (bank: { id: string; name: string; color: string }) => {
    tapBuzz();
    if (logo === bank.id) {
      // повторный тап — снять выбор
      setLogo(undefined);
      return;
    }
    setLogo(bank.id);
    setColor(bank.color);
    if (!name.trim()) setName(bank.name);
  };

  const onSave = async () => {
    if (!canSave) return;
    const org: Organization = {
      id: editing?.id ?? uid('org-'),
      name: name.trim(),
      type,
      color,
      logo,
      archived: editing?.archived,
      isDemo: editing?.isDemo,
    };
    if (editing) await updateOrganization(org);
    else await addOrganization(org);
    successBuzz();
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

        <Text style={styles.pickerLabel}>Банк</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.banksRow}
          style={styles.banksScroll}
        >
          {BANKS.map((bank) => {
            const selected = logo === bank.id;
            return (
              <Pressable
                key={bank.id}
                onPress={() => pickBank(bank)}
                style={[
                  styles.bankChip,
                  { backgroundColor: tintToWhite(bank.color, 0.9) },
                  selected && { borderColor: bank.color, borderWidth: 2 },
                ]}
              >
                <BankLogo bankId={bank.id} size={34} />
              </Pressable>
            );
          })}
        </ScrollView>

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
  pickerLabel: { fontFamily: font.medium, fontSize: tokens.typography.label, color: tokens.text.secondary, marginBottom: tokens.spacing.sm, marginLeft: tokens.spacing.xs },
  banksScroll: { marginBottom: tokens.spacing.lg },
  banksRow: { gap: tokens.spacing.sm, paddingRight: tokens.spacing.lg },
  bankChip: {
    width: 56, height: 56, borderRadius: tokens.radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
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
