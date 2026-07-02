import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { TextField, SelectField, ColorField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import type { Organization } from '@/domain/types';
import { BANKS } from '@/domain/banks';
import { tokens, font } from '@/theme';
import { boxShadow } from '@/theme/shadow';
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
  const [query, setQuery] = useState('');

  const canSave = name.trim().length > 0;

  const filteredBanks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BANKS;
    return BANKS.filter((b) => b.name.toLowerCase().includes(q));
  }, [query]);

  const pickBank = (bank: { id: string; name: string; color: string }) => {
    tapBuzz();
    if (logo === bank.id) {
      // повторный тап — снять выбор
      setLogo(undefined);
      return;
    }
    setLogo(bank.id);
    setColor(bank.color);
    setName(bank.name);
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

        {/* Поиск по предустановленным банкам: лого + название одной строкой */}
        <Card style={styles.softCard} padded={false}>
          <View style={styles.searchRow}>
            <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск банка"
              placeholderTextColor={tokens.text.tertiary}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <MaterialIcons name="close" size={18} color={tokens.text.tertiary} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={styles.bankList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {filteredBanks.map((bank, i) => {
              const selected = logo === bank.id;
              return (
                <Pressable
                  key={bank.id}
                  onPress={() => pickBank(bank)}
                  style={({ pressed }) => [
                    styles.bankRow,
                    i < filteredBanks.length - 1 && styles.bankRowDivider,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <OrgLogo color={bank.color} logo={bank.id} size={40} radius={14} variant={selected ? 'solid' : 'tint'} />
                  <Text style={styles.bankName} numberOfLines={1}>{bank.name}</Text>
                  {selected ? <MaterialIcons name="check" size={20} color={tokens.accent.base} /> : null}
                </Pressable>
              );
            })}
            {filteredBanks.length === 0 ? (
              <Text style={styles.bankEmpty}>Не нашли — заполните вручную ниже</Text>
            ) : null}
          </ScrollView>
        </Card>

        <Text style={styles.section}>Или вручную</Text>
        <Card style={styles.softCard}>
          <TextField
            label="Название"
            value={name}
            onChangeText={setName}
            placeholder="Например: Мой банк"
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
  softCard: boxShadow('0px 6px 18px rgba(48,69,62,0.05)'),
  section: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: '#212121',
    letterSpacing: -0.2,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#EAF2F9',
  },
  searchInput: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, paddingVertical: tokens.spacing.sm },
  bankList: { maxHeight: 320, paddingHorizontal: tokens.spacing.lg },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: 10 },
  bankRowDivider: { borderBottomWidth: 1, borderBottomColor: '#EAF2F9' },
  bankName: { flex: 1, fontFamily: font.medium, fontSize: tokens.typography.body, color: '#212121' },
  bankEmpty: { fontFamily: font.regular, paddingVertical: tokens.spacing.xl, color: tokens.text.tertiary, textAlign: 'center' },
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
