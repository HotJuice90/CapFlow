import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { tapBuzz, warnBuzz } from '@/lib/haptics';
import { ORG_TYPES, type Organization } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';

export const ALL = 'Все';
export type Filter = typeof ALL | (typeof ORG_TYPES)[number];
export const FILTERS: Filter[] = [ALL, ...ORG_TYPES];

export const FILTER_ICON: Record<Filter, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Все: 'view-grid-outline',
  Банк: 'bank-outline',
  Агрегатор: 'compare-horizontal',
  'Платформа ЦФА': 'chart-line',
  Брокер: 'briefcase-outline',
  Другое: 'dots-horizontal-circle-outline',
};
export const FILTER_COLOR: Record<Filter, string> = {
  Все: tokens.accent.base,
  Банк: '#3E63DD',
  Агрегатор: '#10B3A3',
  'Платформа ЦФА': '#9A6DD7',
  Брокер: '#C98A2C',
  Другое: '#5A6472',
};

export default function OrganizationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, deleteOrganization } = useData();
  const [activeFilter, setActiveFilter] = useState<Filter>(ALL);
  const [query, setQuery] = useState('');

  const orgs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.organizations.filter(
      (o) => !o.archived && (activeFilter === ALL || o.type === activeFilter) && (!q || o.name.toLowerCase().includes(q)),
    );
  }, [data.organizations, activeFilter, query]);

  const handleDelete = (org: Organization) => {
    const count = data.instruments.filter((i) => i.organizationId === org.id).length;
    if (count > 0) {
      appAlert('Нельзя удалить', `У «${org.name}» ${count} инструмент(ов). Сначала удалите или перенесите их.`);
      return;
    }
    appAlert('Удалить площадку?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void deleteOrganization(org.id) },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 80,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + tokens.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Площадки</Text>
          </View>
          <Pressable onPress={() => router.push('/catalog/organization')} hitSlop={12} style={styles.addBtn}>
            <MaterialIcons name="add" size={22} color={tokens.accent.base} />
          </Pressable>
        </View>

        <View style={styles.tabWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
            {FILTERS.map((t) => {
              const active = t === activeFilter;
              const color = FILTER_COLOR[t];
              return (
                <Pressable
                  key={t}
                  style={[styles.tabChip, active && { backgroundColor: color }]}
                  onPress={() => setActiveFilter(t)}
                >
                  <MaterialCommunityIcons name={FILTER_ICON[t]} size={16} color={active ? '#FFFFFF' : color} />
                  <Text style={[styles.tabChipText, active ? { color: '#FFFFFF', fontFamily: font.semibold } : { color }]}>
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={20} color={tokens.text.tertiary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск по названию"
            placeholderTextColor={tokens.text.tertiary}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={tokens.text.tertiary} />
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Мои площадки</Text>

        {orgs.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="account-balance" size={32} color={tokens.text.tertiary} />
            <Text style={styles.emptyTitle}>Ничего не нашлось</Text>
            <Text style={styles.emptyHint}>
              {activeFilter === ALL ? 'Добавьте площадку кнопкой «+» сверху.' : 'Добавьте площадку этого типа кнопкой «+» сверху.'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {orgs.map((o) => (
              <OrgRow
                key={o.id}
                org={o}
                onEdit={() => router.push(`/catalog/organization?id=${o.id}`)}
                onDelete={() => handleDelete(o)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function OrgRow({
  org,
  onEdit,
  onDelete,
}: {
  org: Organization;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const typeIcon = (FILTER_ICON as Record<string, keyof typeof MaterialCommunityIcons.glyphMap>)[org.type] ?? 'view-grid-outline';
  const typeColor = (FILTER_COLOR as Record<string, string>)[org.type] ?? tokens.accent.base;

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      // Зона до срабатывания широкая (тянуть дальше) — трение среднее, чтобы
      // само движение не было ни неощутимо лёгким, ни тяжёлым. Хаптика в
      // момент срабатывания — понятная отдача о том, что действие произошло.
      friction={1.7}
      leftThreshold={72}
      rightThreshold={72}
      // Довели свайп до конца — действие сразу: вправо — редактировать, влево — удалить.
      onSwipeableWillOpen={(direction) => {
        swipeRef.current?.close();
        if (direction === 'left') { tapBuzz(); onEdit(); }
        else { warnBuzz(); onDelete(); }
      }}
      renderLeftActions={() => (
        <View style={styles.swipeHint}>
          <View style={[styles.swipeHintBox, { backgroundColor: hexToRgba(tokens.accent.base, 0.14) }]}>
            <MaterialCommunityIcons name="pencil-outline" size={20} color={tokens.accent.base} />
          </View>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.swipeHint}>
          <View style={[styles.swipeHintBox, { backgroundColor: hexToRgba(tokens.semantic.negative, 0.14) }]}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={tokens.semantic.negative} />
          </View>
        </View>
      )}
    >
      {/* Тап по строке ничего не делает — редактирование и удаление только свайпом,
          чтобы не дублировать одно и то же действие двумя разными жестами. */}
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <OrgLogo color={org.color} logo={org.logo} imageUri={org.customImageUri} size={46} radius={16} bordered={false} fallbackIcon={typeIcon} />
          <Text style={styles.rowName} numberOfLines={1}>{org.name}</Text>
        </View>
        <View style={[styles.typeChip, { backgroundColor: hexToRgba(typeColor, 0.05) }]}>
          <MaterialCommunityIcons name={typeIcon} size={13} color={hexToRgba(typeColor, 0.65)} />
          <Text style={[styles.typeChipLabel, { color: hexToRgba(typeColor, 0.65) }]} numberOfLines={1}>{org.type}</Text>
        </View>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xl,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, flex: 1 },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: 24, color: '#212121', letterSpacing: -0.24 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Скролл бleedит до настоящего края экрана (минус горизонтальный паддинг
  // страницы компенсирован тут же), а не обрывается по внутреннему отступу.
  tabWrap: { marginHorizontal: -tokens.spacing.screenH, marginBottom: tokens.spacing.md },
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: tokens.spacing.screenH },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(215,226,235,0.5)',
  },
  tabChipText: { fontFamily: font.medium, fontSize: 13 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(249,250,255,0.55)',
    marginTop: 5,
    marginBottom: tokens.spacing.md,
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: '#212121' },

  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: tokens.typography.title,
    color: '#212121',
    letterSpacing: -0.2,
    marginTop: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
  },

  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 11,
    backgroundColor: tokens.surface.white,
    ...boxShadow('0px 3px 8px rgba(74,85,104,0.04)'),
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { flex: 1, fontFamily: font.medium, fontSize: 16, color: '#212121' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: tokens.radius.pill },
  typeChipLabel: { fontFamily: font.medium, fontSize: 12 },

  swipeHint: { width: 88, alignItems: 'center', justifyContent: 'center' },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.sm },
  emptyTitle: { fontFamily: font.semibold, fontSize: 16, color: '#212121' },
  emptyHint: { fontFamily: font.regular, fontSize: 13, color: tokens.text.secondary, textAlign: 'center', paddingHorizontal: tokens.spacing.xl },
});
