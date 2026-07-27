import React, { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { isPastYearMatured } from '@/state/selectors';
import type { Asset, FinancialInstrument, Organization, Snapshot } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { boxShadow } from '@/theme/shadow';
import { formatMoney, formatPercent } from '@/format';
import { tapBuzz, warnBuzz, successBuzz } from '@/lib/haptics';

// Иконка по типу инструмента — та же пара, что и в AssetRow/TypeCardsRow.
const ICON_BY_TYPE: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
};

interface ArchiveEntry {
  asset: Asset;
  instrument: FinancialInstrument;
  organization: Organization;
  /** Снимок на момент закрытия/архивации (решение #8) — фиксирует ставку и т.п.
   *  такими, какими они РЕАЛЬНО были в момент закрытия, а не открытия. */
  snapshot?: Snapshot;
  /** формально ещё active, но просрочен и «спрятан» с прошлого года (isPastYearMatured) —
   *  сюда попадает, чтобы не потеряться совсем: только так его можно найти и открыть. */
  isStale?: boolean;
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
    // На актив может быть несколько снимков (закрыт → восстановлен → закрыт
    // снова) — берём самый свежий по времени создания.
    const snapByAsset = new Map<string, Snapshot>();
    for (const s of data.snapshots) {
      const prev = snapByAsset.get(s.assetId);
      if (!prev || s.createdAt > prev.createdAt) snapByAsset.set(s.assetId, s);
    }
    return data.assets
      .map((asset): ArchiveEntry | null => {
        const instrument = instrById.get(asset.instrumentId);
        if (!instrument) return null;
        const isStale = asset.status === 'active' && isPastYearMatured(asset, instrument);
        if (asset.status === 'active' && !isStale) return null;
        const organization = orgById.get(instrument.organizationId);
        const snapshot = snapByAsset.get(asset.id);
        return organization ? { asset, instrument, organization, snapshot, isStale } : null;
      })
      .filter((e): e is ArchiveEntry => e !== null)
      .sort((a, b) => b.asset.openDate.localeCompare(a.asset.openDate));
  }, [data.assets, data.instruments, data.organizations, data.snapshots]);

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
          paddingTop: tokens.spacing.screenTop,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Архив</Text>
          </View>
        </View>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="archive-outline" size={32} color={tokens.text.tertiary} />
            <Text style={styles.emptyTitle}>Архив пуст</Text>
            <Text style={styles.emptyHint}>Закрытые и архивные активы будут здесь, с возможностью восстановления.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              Смахните запись влево — удалить навсегда, вправо — восстановить
              {entries.some((e) => e.isStale) ? '. Просроченные — нажмите, чтобы решить, что дальше' : ''}
            </Text>
            <View style={styles.list}>
              {entries.map((entry) => (
                <ArchiveRow
                  key={entry.asset.id}
                  entry={entry}
                  onRestore={onRestore}
                  onDelete={onDeleteForever}
                  onOpen={() => router.push(`/asset/${entry.asset.id}`)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function ArchiveRow({
  entry,
  onRestore,
  onDelete,
  onOpen,
}: {
  entry: ArchiveEntry;
  onRestore: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onOpen: () => void;
}) {
  const { asset, instrument, organization, snapshot, isStale } = entry;
  const swipeRef = useRef<SwipeableMethods>(null);
  const statusLabel = isStale ? 'Просрочен, ждёт решения' : asset.status === 'archived' ? 'В архиве' : 'Закрыт';
  // Ставка на момент закрытия (из снимка), а не на момент открытия — если она
  // менялась при жизни актива, тут должна остаться та, что реально действовала.
  // Для «зависших» (ещё active) снимка нет — берём как есть, у них ставка живая.
  const frozenRate = snapshot?.derived.currentRate ?? asset.rate;

  const row = (
    <Pressable style={styles.row} onPress={isStale ? onOpen : undefined} disabled={!isStale}>
      <OrgLogo
        color={organization.color}
        logo={organization.logo}
        imageUri={organization.customImageUri}
        size={44}
        radius={16}
        fallbackIcon={ICON_BY_TYPE[instrument.typeId] ?? 'bank-outline'}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{instrument.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {organization.name} · {formatPercent(frozenRate)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowAmount}>{formatMoney(asset.amount, { currency: asset.currency })}</Text>
        <View style={[styles.statusPill, isStale && styles.statusPillWarning]}>
          <Text style={[styles.statusPillText, isStale && styles.statusPillTextWarning]}>{statusLabel}</Text>
        </View>
      </View>
    </Pressable>
  );

  // «Зависшие» (просрочены, но формально ещё active) — восстанавливать нечего,
  // они и так активны; тут только удалить целиком, решение принимается тапом
  // по строке (открывает актив с баннером Продлить/Архив/Закрыть).
  if (isStale) {
    return (
      <Swipeable
        ref={swipeRef}
        overshootRight={false}
        friction={1.7}
        rightThreshold={72}
        onSwipeableWillOpen={() => {
          swipeRef.current?.close();
          warnBuzz();
          onDelete(asset.id, instrument.name);
        }}
        renderRightActions={() => <SwipeHint icon="trash-can-outline" color={tokens.semantic.negative} />}
      >
        {row}
      </Swipeable>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      friction={1.7}
      leftThreshold={72}
      rightThreshold={72}
      // Довели свайп до конца — сразу показываем подтверждение, без отдельного тапа по кнопке.
      onSwipeableWillOpen={(direction) => {
        swipeRef.current?.close();
        if (direction === 'left') { tapBuzz(); onRestore(asset.id, instrument.name); }
        else { warnBuzz(); onDelete(asset.id, instrument.name); }
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
    marginBottom: tokens.spacing.xl,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, flex: 1 },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },

  hint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginBottom: tokens.spacing.sm },

  // Каждая запись — своя карточка (как в «Площадках»), а не общий контейнер с
  // overflow:hidden — иначе панель свайпа обрезается/наезжает вместо чистого раскрытия.
  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
    backgroundColor: tokens.surface.white,
    ...boxShadow(tokens.shadow.subtle),
  },
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
  statusPillWarning: { backgroundColor: hexToRgba(tokens.semantic.warning, 0.14) },
  statusPillTextWarning: { color: tokens.semantic.warning },

  swipeHint: { width: 88, alignItems: 'center', justifyContent: 'center' },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.sm },
  emptyTitle: { fontFamily: font.semibold, fontSize: 16, color: tokens.text.primary },
  emptyHint: { fontFamily: font.regular, fontSize: 13, color: tokens.text.secondary, textAlign: 'center', paddingHorizontal: tokens.spacing.xl },
});
