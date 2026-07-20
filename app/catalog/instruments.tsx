import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { OrgLogo } from '@/components/BankLogo';
import { TabChip } from '@/components/TabChip';
import { FILTER_ICON } from './organizations';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { tapBuzz, warnBuzz } from '@/lib/haptics';
import type { FinancialInstrument, InstrumentTypeId, Organization } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';

type TabFilter = 'all' | InstrumentTypeId;

const TABS: { id: TabFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'deposit', label: 'Вклад' },
  { id: 'savings', label: 'НС' },
  { id: 'bond', label: 'Облигации' },
  { id: 'dfa', label: 'ЦФА' },
];

export const TYPE_ICON: Record<InstrumentTypeId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
};

export const PAYOUT_LABEL: Record<string, string> = {
  daily: 'Ежедневно',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  semiannual: 'Раз в полгода',
  annual: 'Ежегодно',
  end: 'В конце срока',
};

/** Комментарий пользователя — в приоритете. Иначе автоописание: у облигации/ЦФА
 *  «Простой %» показывать незачем — там это всегда так, не выбор, не информация. */
function instrumentSubtitle(it: FinancialInstrument): string | undefined {
  if (it.comment?.trim()) return it.comment.trim();
  const showCapitalization = it.typeId === 'deposit' || it.typeId === 'savings';
  const cap = showCapitalization ? (it.capitalization === 'capitalize' ? 'Капитализация' : 'Простой %') : null;
  const payout = it.payoutPeriod ? PAYOUT_LABEL[it.payoutPeriod] : null;
  if (cap && payout) return `${cap} · ${payout}`;
  return cap ?? payout ?? undefined;
}

const EMPTY_HINT: Record<InstrumentTypeId, string> = {
  deposit: 'Добавьте шаблон вклада — банк, ставка по умолчанию, период выплаты.',
  savings: 'Добавьте накопительный счёт — обычно с ежедневной капитализацией. Сюда же годятся фонды денежного рынка (LQDT и аналоги).',
  bond: 'Добавьте облигацию с фиксированным купоном — ОФЗ или корпоративную.',
  dfa: 'Добавьте цифровой финансовый актив.',
};

interface OrgGroup {
  org: Organization;
  items: FinancialInstrument[];
}

export default function InstrumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, deleteInstrument } = useData();
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const groups = useMemo<OrgGroup[]>(() => {
    const orgById = new Map(data.organizations.map((o) => [o.id, o]));
    const map = new Map<string, OrgGroup>();
    for (const it of data.instruments) {
      if (activeTab !== 'all' && it.typeId !== activeTab) continue;
      const org = orgById.get(it.organizationId);
      if (!org) continue;
      const g = map.get(org.id) ?? { org, items: [] };
      g.items.push(it);
      map.set(org.id, g);
    }
    return [...map.values()].sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [data.organizations, data.instruments, activeTab]);

  const handleDelete = (it: FinancialInstrument) => {
    const count = data.assets.filter((a) => a.instrumentId === it.id).length;
    if (count > 0) {
      appAlert('Нельзя удалить', `На «${it.name}» открыто ${count} актив(ов). Сначала закройте или перенесите их.`);
      return;
    }
    appAlert('Удалить инструмент?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void deleteInstrument(it.id) },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.spacing.screenTop,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + tokens.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Инструменты</Text>
          </View>
          <Pressable
            onPress={() => router.push({
              pathname: '/catalog/instrument',
              params: activeTab === 'all' ? {} : { type: activeTab },
            })}
            hitSlop={12}
            style={styles.addBtn}
          >
            <MaterialIcons name="add" size={22} color={tokens.accent.base} />
          </Pressable>
        </View>

        <View style={styles.tabWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <TabChip
                  key={tab.id}
                  active={active}
                  onPress={() => setActiveTab(tab.id)}
                  label={tab.label}
                  icon={(
                    <MaterialCommunityIcons
                      name={tab.id === 'all' ? 'view-grid-outline' : TYPE_ICON[tab.id]}
                      size={16}
                      color={active ? tokens.text.inverse : tab.id === 'all' ? tokens.accent.base : tokens.category[tab.id]}
                    />
                  )}
                  chipStyle={styles.tabChip}
                  bgOff={tokens.surface.tabOff}
                  bgOn={tokens.accent.light}
                  textStyle={styles.tabChipText}
                  textColorOff={hexToRgba(tokens.text.primary, 0.6)}
                  textColorOn={tokens.text.inverse}
                  activeFontFamily={font.semibold}
                />
              );
            })}
          </ScrollView>
        </View>

        {groups.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="layers" size={32} color={tokens.text.tertiary} />
            <Text style={styles.emptyTitle}>{activeTab === 'all' ? 'Нет инструментов' : 'Нет инструментов этого типа'}</Text>
            <Text style={styles.emptyHint}>
              {activeTab === 'all' ? 'Добавьте первый шаблон кнопкой «+» сверху.' : EMPTY_HINT[activeTab]}
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.org.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={styles.groupLeft}>
                  <OrgLogo
                    color={g.org.color}
                    logo={g.org.logo}
                    imageUri={g.org.customImageUri}
                    size={24}
                    variant="bare"
                    fallbackIcon={(FILTER_ICON as Record<string, keyof typeof MaterialCommunityIcons.glyphMap>)[g.org.type] ?? 'view-grid-outline'}
                  />
                  <Text style={styles.groupName}>{g.org.name}</Text>
                </View>
                <Text style={styles.groupCount}>{g.items.length} инстр.</Text>
              </View>
              <View style={styles.list}>
                {g.items.map((it) => (
                  <InstrumentRow
                    key={it.id}
                    instrument={it}
                    onOpen={() => router.push(`/catalog/instrument-detail?id=${it.id}`)}
                    onEdit={() => router.push(`/catalog/instrument?id=${it.id}`)}
                    onDelete={() => handleDelete(it)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function InstrumentRow({
  instrument,
  onOpen,
  onEdit,
  onDelete,
}: {
  instrument: FinancialInstrument;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const subtitle = instrumentSubtitle(instrument);

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
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
      <Pressable style={styles.row} onPress={onOpen}>
        <View style={[styles.typeIcon, { backgroundColor: hexToRgba(tokens.category[instrument.typeId] ?? tokens.accent.base, 0.06) }]}>
          <MaterialCommunityIcons
            name={TYPE_ICON[instrument.typeId]}
            size={22}
            color={tokens.category[instrument.typeId] ?? tokens.accent.base}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>{instrument.name}</Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </Pressable>
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
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 30,
    backgroundColor: hexToRgba(tokens.surface.white, 0.5),
    borderWidth: 1,
    borderColor: hexToRgba(tokens.surface.white, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Скролл бleedит до настоящего края экрана (минус горизонтальный паддинг
  // страницы компенсирован тут же), а не обрывается по внутреннему отступу.
  tabWrap: { marginHorizontal: -tokens.spacing.screenH, marginBottom: tokens.spacing.xl },
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: tokens.spacing.screenH },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.chip,
    paddingHorizontal: 14,
    paddingVertical: tokens.spacing.tight,
    borderRadius: 20,
    backgroundColor: tokens.surface.tabOff,
  },
  tabChipText: { fontFamily: font.medium, fontSize: 14, color: hexToRgba(tokens.text.primary, 0.6) },

  group: { marginBottom: 28 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: tokens.spacing.tight,
  },
  groupLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { fontFamily: font.semibold, fontSize: tokens.typography.labelLg, color: tokens.text.primary },
  groupCount: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.35) },

  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 69,
    borderRadius: 20,
    paddingHorizontal: 12,
    backgroundColor: tokens.surface.white,
    ...boxShadow(tokens.shadow.subtle),
  },
  typeIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontFamily: font.medium, fontSize: 16, color: tokens.text.primary },
  rowSubtitle: { fontFamily: font.regular, fontSize: tokens.typography.hint, color: hexToRgba(tokens.text.primary, 0.4), marginTop: 2 },

  swipeHint: { width: 88, alignItems: 'center', justifyContent: 'center' },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.sm },
  emptyTitle: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.primary },
  emptyHint: { fontFamily: font.regular, fontSize: 13, color: tokens.text.secondary, textAlign: 'center', paddingHorizontal: tokens.spacing.xl },
});
