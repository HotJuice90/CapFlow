import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { TextField, NumberField, DateField, Segmented } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { buildAssetViews } from '@/state/selectors';
import { appAlert } from '@/lib/dialog';
import type { BalanceAdjustment, CurrencyCode } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { formatDateShort } from '@/format/date';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Direction = 'topup' | 'withdraw';

interface TimelinePoint {
  /** undefined — это точка открытия, не корректировка; свайп-действия для неё скрыты */
  id?: string;
  date: string;
  amount: number;
  comment?: string;
}

export default function BalanceAdjustScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, updateAsset } = useData();

  const view = useMemo(
    () => buildAssetViews(data).find((v) => v.asset.id === id),
    [data, id],
  );

  const [direction, setDirection] = useState<Direction>('topup');
  const [delta, setDelta] = useState<number | undefined>(undefined);
  const [date, setDate] = useState<string>(todayIso());
  const [comment, setComment] = useState('');

  const timeline = useMemo<TimelinePoint[]>(() => {
    if (!view) return [];
    const points: TimelinePoint[] = [
      { date: view.asset.openDate, amount: view.asset.amount },
      ...(view.asset.balanceAdjustments ?? []).map((a) => ({ id: a.id, date: a.date, amount: a.amount, comment: a.comment })),
    ];
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [view]);

  if (!view) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <Text style={styles.muted}>Актив не найден</Text>
        </View>
      </ScreenBackground>
    );
  }

  const { asset, derived } = view;
  const cur = asset.currency;
  const currentBalance = derived.balanceNow;
  const newBalance = direction === 'topup'
    ? currentBalance + (delta ?? 0)
    : currentBalance - (delta ?? 0);

  const canSave = delta !== undefined && delta > 0 && newBalance >= 0 && !!date;

  const onSave = async () => {
    if (!canSave || delta === undefined) return;
    if (newBalance < 0) { warnBuzz(); return; }
    const adjustment: BalanceAdjustment = {
      id: uid('badj-'),
      date,
      amount: newBalance,
      comment: comment.trim() || undefined,
    };
    await updateAsset({
      ...asset,
      balanceAdjustments: [...(asset.balanceAdjustments ?? []), adjustment],
    });
    successBuzz();
    router.back();
  };

  const onEditAdjustment = async (adjId: string, amount: number) => {
    await updateAsset({
      ...asset,
      balanceAdjustments: (asset.balanceAdjustments ?? []).map((a) => (a.id === adjId ? { ...a, amount } : a)),
    });
    successBuzz();
  };

  const onDeleteAdjustment = (adjId: string) => {
    appAlert('Удалить операцию?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await updateAsset({
            ...asset,
            balanceAdjustments: (asset.balanceAdjustments ?? []).filter((a) => a.id !== adjId),
          });
          successBuzz();
        },
      },
    ]);
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
          <Text style={styles.headerTitle}>Изменить баланс</Text>
          <View style={{ width: 26 }} />
        </View>

        <Card style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Сейчас на счёте</Text>
          <Text style={styles.balanceValue}>{formatMoney(currentBalance, { currency: cur })}</Text>
        </Card>

        <Card>
          <Segmented
            label="Операция"
            value={direction}
            options={[
              { label: 'Пополнение', value: 'topup' },
              { label: 'Снятие', value: 'withdraw' },
            ]}
            onChange={(v) => { tapBuzz(); setDirection(v); }}
          />
          <NumberField
            label={direction === 'topup' ? 'Сумма пополнения' : 'Сумма снятия'}
            value={delta}
            onChange={setDelta}
            placeholder="0"
          />
          <DateField label="Дата" value={date} onChange={setDate} />
          <TextField
            label="Комментарий (необязательно)"
            value={comment}
            onChangeText={setComment}
            placeholder="Например: отпуск"
          />
        </Card>

        <Text style={styles.section}>История</Text>
        <Text style={styles.hint}>Смахните запись влево — удалить, вправо — изменить сумму</Text>
        <Card style={styles.softCard} padded={false}>
          {timeline.map((point, i) => (
            <HistoryRow
              key={point.id ?? point.date}
              point={point}
              prevAmount={i > 0 ? timeline[i - 1].amount : undefined}
              isLast={i === timeline.length - 1}
              currency={cur}
              onEdit={onEditAdjustment}
              onDelete={onDeleteAdjustment}
            />
          ))}
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

function HistoryRow({
  point,
  prevAmount,
  isLast,
  currency,
  onEdit,
  onDelete,
}: {
  point: TimelinePoint;
  prevAmount: number | undefined;
  isLast: boolean;
  currency: CurrencyCode;
  onEdit: (id: string, amount: number) => void;
  onDelete: (id: string) => void;
}) {
  const isFirst = prevAmount === undefined;
  const delta = prevAmount !== undefined ? point.amount - prevAmount : undefined;
  const isUp = delta !== undefined && delta >= 0;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(Math.round(point.amount)));
  const swipeRef = useRef<Swipeable>(null);

  const startEdit = () => {
    swipeRef.current?.close();
    setEditValue(String(Math.round(point.amount)));
    setEditing(true);
  };

  const saveEdit = () => {
    const n = parseFloat(editValue);
    if (Number.isFinite(n) && n >= 0 && point.id) onEdit(point.id, n);
    setEditing(false);
  };

  const row = editing ? (
    <View style={[styles.histRow, !isLast && styles.rowDivider]}>
      <View style={[styles.histIcon, styles.histIconOpen]}>
        <MaterialCommunityIcons name="pencil-outline" size={16} color={tokens.accent.base} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.histDate}>{formatDateShort(point.date)}</Text>
        <TextInput
          style={styles.editInput}
          value={editValue}
          onChangeText={(v) => setEditValue(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
          keyboardType="numeric"
          autoFocus
        />
      </View>
      <View style={styles.editActions}>
        <Pressable onPress={() => setEditing(false)} hitSlop={8} style={styles.editBtnCancel}>
          <MaterialIcons name="close" size={18} color={tokens.text.secondary} />
        </Pressable>
        <Pressable onPress={saveEdit} hitSlop={8} style={styles.editBtnSave}>
          <MaterialIcons name="check" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={[styles.histRow, !isLast && styles.rowDivider]}>
      <View
        style={[
          styles.histIcon,
          isFirst ? styles.histIconOpen : isUp ? styles.histIconUp : styles.histIconDown,
        ]}
      >
        <MaterialCommunityIcons
          name={isFirst ? 'flag-outline' : isUp ? 'arrow-up' : 'arrow-down'}
          size={16}
          color={isFirst ? tokens.accent.base : isUp ? tokens.semantic.positive : tokens.semantic.negative}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.histDate}>{formatDateShort(point.date)}</Text>
        <Text style={styles.histSub} numberOfLines={1}>
          {isFirst ? 'Открытие' : point.comment || (isUp ? 'Пополнение' : 'Снятие')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {delta !== undefined ? (
          <Text style={[styles.histDelta, isUp ? styles.histDeltaUp : styles.histDeltaDown]}>
            {isUp ? '+' : '−'}{formatMoney(Math.abs(delta), { currency, abbreviateMillions: true })}
          </Text>
        ) : null}
        <Text style={styles.histBalance}>{formatMoney(point.amount, { currency, kopecks: 'hide' })}</Text>
      </View>
    </View>
  );

  if (!point.id || editing) return row;

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      // Довели свайп до конца — действие сразу (редактирование инлайн, удаление с подтверждением).
      onSwipeableWillOpen={(direction) => {
        if (direction === 'left') startEdit();
        else { swipeRef.current?.close(); onDelete(point.id as string); }
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
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: tokens.text.tertiary, fontSize: tokens.typography.body },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  headerTitle: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary },

  balanceCard: {
    marginBottom: tokens.spacing.lg,
    alignItems: 'center',
  },
  balanceLabel: { fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  balanceValue: {
    fontFamily: font.semibold,
    fontSize: tokens.typography.title,
    color: tokens.text.primary,
    marginTop: 4,
  },

  section: {
    fontFamily: font.semibold,
    fontSize: tokens.typography.label,
    color: tokens.text.secondary,
    marginTop: tokens.spacing.xl,
    marginBottom: 4,
  },
  hint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginBottom: tokens.spacing.sm },
  softCard: { paddingHorizontal: tokens.spacing.lg },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, backgroundColor: tokens.surface.white },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#EAF2F9' },
  histIcon: {
    width: 32, height: 32, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.surface.neutral,
  },
  histIconOpen: { backgroundColor: tokens.accent.soft },
  histIconUp: { backgroundColor: hexToRgba(tokens.semantic.positive, 0.12) },
  histIconDown: { backgroundColor: hexToRgba(tokens.semantic.negative, 0.12) },
  histDate: { fontFamily: font.medium, fontSize: tokens.typography.label, color: tokens.text.primary },
  histSub: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  histDelta: { fontFamily: font.semibold, fontSize: tokens.typography.label },
  histDeltaUp: { color: tokens.semantic.positive },
  histDeltaDown: { color: tokens.semantic.negative },
  histBalance: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },

  editInput: {
    fontFamily: font.medium,
    fontSize: tokens.typography.label,
    color: tokens.text.primary,
    marginTop: 2,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: tokens.accent.base,
  },
  editActions: { flexDirection: 'row', gap: 8 },
  editBtnCancel: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.surface.neutral,
  },
  editBtnSave: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.semantic.positive,
  },

  swipeHint: { width: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface.white },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

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
