import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { TextField, NumberField, DateField, Segmented } from '@/components/form/fields';
import { boxShadow } from '@/theme/shadow';
import { useData } from '@/state/DataContext';
import { freeCapitalBalance } from '@/state/selectors';
import { appAlert } from '@/lib/dialog';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';
import type { FreeCapitalEntry } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { formatDateShort } from '@/format/date';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Direction = 'in' | 'out';

/**
 * Лента свободных денег вне активов — заменяет старый хак с одним вручную
 * перепечатываемым числом (`settings.manualTotalCapital`). Баланс = сумма
 * записей (см. `freeCapitalBalance` в selectors), не разница с общим тоталом.
 */
export default function CapitalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, addFreeCapitalEntry, deleteFreeCapitalEntry } = useData();
  const cur = data.settings.defaultCurrency;

  const balance = freeCapitalBalance(data);
  const entries = useMemo(
    () => [...data.freeCapitalEntries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [data.freeCapitalEntries],
  );

  const [direction, setDirection] = useState<Direction>('in');
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState<string>(todayIso());
  const [comment, setComment] = useState('');

  const canSave = amount !== undefined && amount > 0 && !!date;

  const onAdd = async () => {
    if (!canSave || amount === undefined) return;
    const entry: FreeCapitalEntry = {
      id: uid('fce-'),
      date,
      amount: direction === 'in' ? amount : -amount,
      currency: cur,
      comment: comment.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    await addFreeCapitalEntry(entry);
    successBuzz();
    setAmount(undefined);
    setComment('');
  };

  const onDelete = (id: string) => {
    appAlert('Удалить запись?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteFreeCapitalEntry(id);
          successBuzz();
        },
      },
    ]);
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: tokens.spacing.screenTop, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + tokens.spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Капитал вне активов</Text>
        </View>

        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Свободные деньги</Text>
          <Text style={styles.balanceValue}>{formatMoney(balance, { currency: cur, kopecks: 'hide' })}</Text>
        </View>

        <Segmented
          label="Операция"
          value={direction}
          options={[
            { label: 'Пополнение', value: 'in' },
            { label: 'Списание', value: 'out' },
          ]}
          onChange={(v) => { tapBuzz(); setDirection(v); }}
        />
        <NumberField
          label={direction === 'in' ? 'Сумма пополнения' : 'Сумма списания'}
          value={amount}
          onChange={setAmount}
          placeholder="0"
          suffix={cur}
          grouped
        />
        <DateField label="Дата" value={date} onChange={setDate} />
        <TextField
          label="Комментарий (необязательно)"
          value={comment}
          onChangeText={setComment}
          placeholder="Например: зарплата"
        />
        <Pressable style={[styles.addBtn, !canSave && styles.addBtnDisabled]} disabled={!canSave} onPress={onAdd}>
          <MaterialIcons name="add" size={18} color={tokens.text.inverse} />
          <Text style={styles.addBtnText}>Добавить</Text>
        </Pressable>

        {entries.length > 0 ? (
          <>
            <Text style={styles.section}>История</Text>
            <Text style={styles.hint}>Смахните запись влево — удалить</Text>
            {entries.map((e, i) => (
              <EntryRow key={e.id} entry={e} isLast={i === entries.length - 1} onDelete={onDelete} />
            ))}
          </>
        ) : (
          <Text style={styles.emptyHint}>Записей пока нет — добавь первую движением выше.</Text>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function EntryRow({ entry, isLast, onDelete }: { entry: FreeCapitalEntry; isLast: boolean; onDelete: (id: string) => void }) {
  const swipeRef = useRef<Swipeable>(null);
  const isUp = entry.amount >= 0;

  const row = (
    <View style={[styles.histRow, !isLast && styles.rowDivider]}>
      <View style={[styles.histIcon, isUp ? styles.histIconUp : styles.histIconDown]}>
        <MaterialCommunityIcons name={isUp ? 'arrow-up' : 'arrow-down'} size={16} color={isUp ? tokens.semantic.positive : tokens.semantic.negative} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.histDate}>{formatDateShort(entry.date)}</Text>
        <Text style={styles.histSub} numberOfLines={1}>{entry.comment || (isUp ? 'Пополнение' : 'Списание')}</Text>
      </View>
      <Text style={[styles.histDelta, isUp ? styles.histDeltaUp : styles.histDeltaDown]}>
        {isUp ? '+' : '−'}{formatMoney(Math.abs(entry.amount), { currency: entry.currency, kopecks: 'hide' })}
      </Text>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      friction={1.7}
      leftThreshold={72}
      onSwipeableWillOpen={() => { warnBuzz(); swipeRef.current?.close(); onDelete(entry.id); }}
      renderLeftActions={() => (
        <View style={styles.swipeHint}>
          <View style={styles.swipeHintBox}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={tokens.semantic.negative} />
          </View>
        </View>
      )}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.xl },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },

  balanceBox: {
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: tokens.spacing.lg,
    marginBottom: tokens.spacing.lg,
    backgroundColor: tokens.surface.rowTint,
    ...boxShadow(tokens.shadow.subtle),
  },
  balanceLabel: { fontFamily: font.medium, fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  balanceValue: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary, marginTop: 4 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: tokens.accent.base, borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.md, marginTop: tokens.spacing.sm,
  },
  addBtnDisabled: { backgroundColor: tokens.text.tertiary },
  addBtnText: { color: tokens.text.inverse, fontFamily: font.semibold, fontSize: tokens.typography.label },

  section: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary, marginTop: 40, marginBottom: 14, paddingLeft: 8 },
  hint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: -8, marginBottom: tokens.spacing.sm, paddingLeft: 8 },
  emptyHint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: tokens.spacing.lg, textAlign: 'center' },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, backgroundColor: 'transparent' },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
  histIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface.neutral },
  histIconUp: { backgroundColor: hexToRgba(tokens.semantic.positive, 0.12) },
  histIconDown: { backgroundColor: hexToRgba(tokens.semantic.negative, 0.12) },
  histDate: { fontFamily: font.medium, fontSize: tokens.typography.label, color: tokens.text.primary },
  histSub: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  histDelta: { fontFamily: font.semibold, fontSize: tokens.typography.label },
  histDeltaUp: { color: tokens.semantic.positive },
  histDeltaDown: { color: tokens.semantic.negative },

  swipeHint: { width: 64, alignItems: 'center', justifyContent: 'center' },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(tokens.semantic.negative, 0.14) },
});
