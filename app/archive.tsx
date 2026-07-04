import React, { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import type { Asset, FinancialInstrument, Organization } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercent } from '@/format';
import { successBuzz } from '@/lib/haptics';

interface ArchiveEntry {
  asset: Asset;
  instrument: FinancialInstrument;
  organization: Organization;
}

/** Подложка свайпа: не сплошная заливка, а компактная иконка на мягкой цветной плашке. */
function SwipeHint({ icon, color }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }) {
  return (
    <View style={styles.swipeHint}>
      <View style={[styles.swipeHintBox, { backgroundColor: hexToRgba(color, 0.14) }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
    </View>
  );
}

export default function ArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, setAssetStatus, deleteAsset } = useData();

  const entries = useMemo<ArchiveEntry[]>(() => {
    const instrById = new Map(data.instruments.map((i) => [i.id, i]));
    const orgById = new Map(data.organizations.map((o) => [o.id, o]));
    return data.assets
      .filter((a) => a.status !== 'active')
      .map((asset) => {
        const instrument = instrById.get(asset.instrumentId);
        const organization = instrument ? orgById.get(instrument.organizationId) : undefined;
        return instrument && organization ? { asset, instrument, organization } : null;
      })
      .filter((e): e is ArchiveEntry => e !== null)
      .sort((a, b) => b.asset.openDate.localeCompare(a.asset.openDate));
  }, [data.assets, data.instruments, data.organizations]);

  const onRestore = (id: string, name: string) => {
    appAlert(`Восстановить «${name}»?`, 'Актив вернётся в список и снова будет участвовать в расчётах.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Восстановить', onPress: async () => { await setAssetStatus(id, 'active'); successBuzz(); } },
    ]);
  };

  const onDeleteForever = (id: string, name: string) => {
    appAlert(`Удалить «${name}» навсегда?`, 'Действие необратимо, вернуть будет нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => { await deleteAsset(id); successBuzz(); } },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.sm,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Архив</Text>
          <View style={{ width: 20 }} />
        </View>

        {entries.length === 0 ? (
          <Card style={styles.empty}>
            <MaterialCommunityIcons name="archive-outline" size={40} color={tokens.accent.base} />
            <Text style={styles.emptyTitle}>Архив пуст</Text>
            <Text style={styles.emptyHint}>Закрытые и архивные активы будут здесь — с восстановлением в один свайп.</Text>
          </Card>
        ) : (
          <>
            <Text style={styles.hint}>Смахните запись влево — удалить навсегда, вправо — восстановить</Text>
            <Card style={styles.softCard} padded={false}>
              {entries.map((entry, i) => (
                <ArchiveRow
                  key={entry.asset.id}
                  entry={entry}
                  isLast={i === entries.length - 1}
                  onRestore={onRestore}
                  onDelete={onDeleteForever}
                />
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function ArchiveRow({
  entry,
  isLast,
  onRestore,
  onDelete,
}: {
  entry: ArchiveEntry;
  isLast: boolean;
  onRestore: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { asset, instrument, organization } = entry;
  const swipeRef = useRef<Swipeable>(null);
  const statusLabel = asset.status === 'archived' ? 'В архиве' : 'Закрыт';

  const row = (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <OrgLogo color={organization.color} logo={organization.logo} size={44} radius={16} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{instrument.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {organization.name} · {formatPercent(asset.rate)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowAmount}>{formatMoney(asset.amount, { currency: asset.currency, abbreviateMillions: true })}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{statusLabel}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      // Довели свайп до конца — сразу показываем подтверждение, без отдельного тапа по кнопке.
      onSwipeableWillOpen={(direction) => {
        swipeRef.current?.close();
        if (direction === 'left') onRestore(asset.id, instrument.name);
        else onDelete(asset.id, instrument.name);
      }}
      renderLeftActions={() => <SwipeHint icon="restore" color={tokens.semantic.positive} />}
      renderRightActions={() => <SwipeHint icon="trash-can-outline" color={tokens.semantic.negative} />}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  headerTitle: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary },

  hint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginBottom: tokens.spacing.sm },
  softCard: { paddingHorizontal: tokens.spacing.lg },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, backgroundColor: tokens.surface.white },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#EAF2F9' },
  rowName: { fontFamily: font.medium, fontSize: tokens.typography.body, color: tokens.text.primary },
  rowSub: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  rowAmount: { fontFamily: font.semibold, fontSize: tokens.typography.label, color: tokens.text.primary },
  statusPill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.surface.neutral,
  },
  statusPillText: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, fontWeight: '500' },

  swipeHint: { width: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface.white },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary, marginTop: tokens.spacing.md },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center', marginTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
});
