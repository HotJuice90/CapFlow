import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { TextField, SelectField, ColorField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { ORG_TYPES, type Organization } from '@/domain/types';
import { BANKS } from '@/domain/banks';
import { FILTER_ICON, FILTER_COLOR } from './organizations';
import { appAlert } from '@/lib/dialog';
import { tokens, font, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { tapBuzz, successBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';

const BRAND_COLORS = [
  '#EF3124', '#FF5C00', '#F2A900', '#21A038', '#10B3A3',
  '#3E63DD', '#0A2896', '#9A6DD7', '#E5478B', '#5A6472',
];

const TYPE_OPTIONS = ORG_TYPES.map((t) => ({ label: t, value: t, icon: FILTER_ICON[t], iconColor: FILTER_COLOR[t] }));

// Сетка каталога банков — 5 в ряд, во всю ширину, паддинг = гэп между иконками
// (симметрично со всех сторон), а не «сколько влезет» фиксированным размером тайла.
const BANK_GRID_COLUMNS = 5;
const BANK_GRID_GAP = 10;
function bankTileSize(screenW: number): number {
  const contentW = screenW - tokens.spacing.screenH * 2 - BANK_GRID_GAP * 2;
  return (contentW - BANK_GRID_GAP * (BANK_GRID_COLUMNS - 1)) / BANK_GRID_COLUMNS;
}

type Mode = 'catalog' | 'custom';

export default function OrganizationFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const bankTileW = bankTileSize(screenW);
  const { data, addOrganization, updateOrganization, deleteOrganization } = useData();

  const editing = data.organizations.find((o) => o.id === id);
  const instrumentCount = editing ? data.instruments.filter((i) => i.organizationId === editing.id).length : 0;

  // Каталог — сценарий по умолчанию для новой организации; для уже существующей
  // определяем по тому, что в ней сохранено (лого банка → каталог, иначе своя).
  const [mode, setMode] = useState<Mode>(editing ? (editing.logo ? 'catalog' : 'custom') : 'catalog');
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState(editing?.type ?? 'Банк');
  const [color, setColor] = useState(editing?.color ?? BRAND_COLORS[4]);
  const [logo, setLogo] = useState<string | undefined>(editing?.logo);
  const [customImageUri, setCustomImageUri] = useState<string | undefined>(editing?.customImageUri);
  // Тип берётся из самой записи каталога (сейчас там только банки — тип «Банк»
  // у всех; когда добавим туда агрегаторов/брокеров со своим type, подхватится само).
  const [catalogType, setCatalogType] = useState(editing?.logo ? editing.type : 'Банк');
  const [query, setQuery] = useState('');
  const chipIcon = (FILTER_ICON as Record<string, keyof typeof MaterialCommunityIcons.glyphMap>)[catalogType] ?? 'view-grid-outline';
  const chipColor = (FILTER_COLOR as Record<string, string>)[catalogType] ?? tokens.accent.base;

  const filteredBanks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BANKS;
    return BANKS.filter((b) => b.name.toLowerCase().includes(q));
  }, [query]);

  const applyBank = (bank: { id: string; name: string; color: string; type?: string }) => {
    tapBuzz();
    setLogo(bank.id);
    setColor(bank.color);
    setName(bank.name);
    setCatalogType(bank.type ?? 'Банк');
  };

  const pickBank = (bank: { id: string; name: string; color: string; type?: string }) => {
    // Площадка — стабильный идентификатор конкретного банка, а не слот, который
    // можно перекрасить в другой: не даём завести дубль и предупреждаем, если у
    // уже существующей площадки есть инструменты — их лого сменится задним числом.
    const duplicate = data.organizations.find((o) => !o.archived && o.logo === bank.id && o.id !== editing?.id);
    if (duplicate) {
      appAlert('Уже добавлено', `«${duplicate.name}» уже есть в списке площадок. Открыть её вместо создания новой?`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть', onPress: () => router.replace(`/catalog/organization?id=${duplicate.id}`) },
      ]);
      return;
    }
    if (editing && instrumentCount > 0 && bank.id !== editing.logo) {
      appAlert(
        'Сменить банк площадки?',
        `На этой площадке уже ${instrumentCount} инструмент(ов) — они останутся здесь, но лого и название площадки изменятся на «${bank.name}».`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Сменить', onPress: () => applyBank(bank) },
        ],
      );
      return;
    }
    applyBank(bank);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert('Нет доступа', 'Разреши доступ к галерее в настройках телефона, чтобы загрузить фото.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const dir = `${FileSystem.documentDirectory}org-logos/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const dest = `${dir}${uid('logo-')}.jpg`;
    await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
    tapBuzz();
    setCustomImageUri(dest);
  };

  const canSave = mode === 'catalog' ? !!logo : name.trim().length > 0;

  const onSave = () => {
    if (!canSave) return;
    appAlert('Сохранить площадку?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сохранить',
        onPress: async () => {
          const org: Organization = {
            id: editing?.id ?? uid('org-'),
            name: name.trim(),
            type: mode === 'catalog' ? catalogType : type,
            color,
            logo: mode === 'catalog' ? logo : undefined,
            customImageUri: mode === 'custom' ? customImageUri : undefined,
            archived: editing?.archived,
            isDemo: editing?.isDemo,
          };
          if (editing) await updateOrganization(org);
          else await addOrganization(org);
          successBuzz();
          router.back();
        },
      },
    ]);
  };

  const onDelete = () => {
    if (!editing) return;
    if (instrumentCount > 0) {
      appAlert('Нельзя удалить', `У этой площадки ${instrumentCount} инструмент(ов). Сначала удалите или перенесите их.`);
      return;
    }
    appAlert('Удалить площадку?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteOrganization(editing.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 80,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 100,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <MaterialIcons name="close" size={26} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Площадка' : 'Новая площадка'}</Text>
          {editing ? (
            <Pressable onPress={onDelete} hitSlop={12}>
              <MaterialIcons name="delete-outline" size={24} color={tokens.semantic.negative} />
            </Pressable>
          ) : (
            <View style={{ width: 26 }} />
          )}
        </View>

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeChip, mode === 'catalog' && styles.modeChipActive]}
            onPress={() => setMode('catalog')}
          >
            <MaterialCommunityIcons name="view-grid-outline" size={18} color={mode === 'catalog' ? '#FFFFFF' : tokens.accent.base} />
            <Text style={[styles.modeText, mode === 'catalog' && styles.modeTextActive]}>Из каталога</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, mode === 'custom' && styles.modeChipActive]}
            onPress={() => setMode('custom')}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={mode === 'custom' ? '#FFFFFF' : tokens.accent.base} />
            <Text style={[styles.modeText, mode === 'custom' && styles.modeTextActive]}>Своя</Text>
          </Pressable>
        </View>

        {mode === 'catalog' ? (
          <>
            <View style={styles.searchRow}>
              <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Поиск в каталоге"
                placeholderTextColor={tokens.text.tertiary}
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={tokens.text.tertiary} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.bankGrid}>
              {filteredBanks.map((bank) => {
                const selected = logo === bank.id;
                return (
                  <Pressable key={bank.id} style={{ width: bankTileW }} onPress={() => pickBank(bank)}>
                    <View>
                      <OrgLogo color={bank.color} logo={bank.id} size={bankTileW} radius={Math.round(bankTileW / 3.1)} variant={selected ? 'solid' : 'tint'} />
                      {selected ? (
                        <View style={styles.checkBadge}>
                          <MaterialIcons name="check" size={11} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {filteredBanks.length === 0 ? (
                <Text style={styles.bankEmpty}>Не нашли — переключитесь на «Свою»</Text>
              ) : null}
            </View>

            {logo ? (
              <View style={styles.selectedRow}>
                <View style={styles.selectedLeft}>
                  <OrgLogo color={color} logo={logo} size={46} radius={16} bordered={false} />
                  <Text style={styles.selectedName} numberOfLines={1}>{name}</Text>
                </View>
                <View style={[styles.typeChip, { backgroundColor: hexToRgba(chipColor, 0.05) }]}>
                  <MaterialCommunityIcons name={chipIcon} size={13} color={hexToRgba(chipColor, 0.65)} />
                  <Text style={[styles.typeChipLabel, { color: hexToRgba(chipColor, 0.65) }]} numberOfLines={1}>{catalogType}</Text>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.section}>Логотип</Text>
            <View style={styles.logoRow}>
              {customImageUri ? (
                <OrgLogo color={color} imageUri={customImageUri} size={72} radius={22} />
              ) : (
                <Pressable style={[styles.logoPlaceholder, { borderColor: color }]} onPress={pickImage}>
                  <MaterialCommunityIcons name="bank-outline" size={28} color={color} />
                </Pressable>
              )}
              <View style={styles.logoActions}>
                <Pressable style={styles.uploadBtn} onPress={pickImage}>
                  <MaterialIcons name="add-a-photo" size={16} color={tokens.accent.base} />
                  <Text style={styles.uploadText}>{customImageUri ? 'Заменить лого' : 'Загрузить лого'}</Text>
                </Pressable>
                {customImageUri ? (
                  <Pressable onPress={() => setCustomImageUri(undefined)} hitSlop={8} style={styles.removePhotoBtn}>
                    <MaterialIcons name="close" size={16} color={tokens.text.tertiary} />
                    <Text style={styles.removePhotoText}>Убрать лого</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Text style={styles.section}>Параметры</Text>
            <Card>
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
              <ColorField
                label="Цвет бренда"
                value={color}
                onChange={(c) => { setColor(c); setCustomImageUri(undefined); }}
                colors={BRAND_COLORS}
              />
            </Card>
          </>
        )}
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
    marginBottom: tokens.spacing.xl,
  },
  headerTitle: { fontFamily: font.semibold, fontSize: 24, color: '#212121', letterSpacing: -0.24 },

  modeRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(215,226,235,0.5)',
    borderRadius: 20,
    padding: 3,
    marginBottom: tokens.spacing.sm,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 17,
  },
  modeChipActive: { backgroundColor: tokens.accent.base },
  modeText: { fontFamily: font.medium, fontSize: 14, color: tokens.accent.base },
  modeTextActive: { fontFamily: font.semibold, color: '#FFFFFF' },

  section: {
    fontFamily: font.semibold,
    fontSize: 20,
    color: '#212121',
    letterSpacing: -0.2,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(249,250,255,0.55)',
    marginBottom: tokens.spacing.lg,
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: '#212121' },

  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BANK_GRID_GAP,
    paddingHorizontal: BANK_GRID_GAP,
    paddingTop: BANK_GRID_GAP,
    marginTop: tokens.spacing.sm,
  },
  checkBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.accent.base,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankEmpty: { fontFamily: font.regular, fontSize: 14, color: tokens.text.tertiary, paddingVertical: tokens.spacing.xl, width: '100%', textAlign: 'center' },

  // Точная копия карточки из списка «Площадки» — те же размеры, паддинги и шильдик типа.
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: tokens.spacing.xl,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 11,
    backgroundColor: tokens.surface.white,
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },
  selectedLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedName: { flex: 1, fontFamily: font.medium, fontSize: 16, color: '#212121' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: tokens.radius.pill },
  typeChipLabel: { fontFamily: font.medium, fontSize: 12 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoActions: { gap: 8 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: tokens.accent.soft,
  },
  uploadText: { fontFamily: font.medium, fontSize: 14, color: tokens.accent.base },
  removePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  removePhotoText: { fontFamily: font.regular, fontSize: 13, color: tokens.text.tertiary },

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
