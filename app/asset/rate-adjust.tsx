import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { openedSide } from '@/lib/swipe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { TextField, NumberField, DateField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { findAssetView } from '@/state/selectors';
import { appAlert } from '@/lib/dialog';
import type { RateAdjustment } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatPercent } from '@/format';
import { formatDateShort } from '@/format/date';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TimelinePoint {
  /** undefined — это точка открытия, не корректировка; свайп-действия для неё скрыты */
  id?: string;
  date: string;
  rate: number;
  comment?: string;
}

export default function RateAdjustSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, updateAsset } = useData();

  const view = useMemo(() => findAssetView(data, id), [data, id]);

  const [newRate, setNewRate] = useState<number | undefined>(undefined);
  const [date, setDate] = useState<string>(todayIso());
  const [comment, setComment] = useState('');

  const timeline = useMemo<TimelinePoint[]>(() => {
    if (!view) return [];
    const points: TimelinePoint[] = [
      { date: view.asset.openDate, rate: view.asset.rate },
      ...(view.asset.rateAdjustments ?? []).map((r) => ({ id: r.id, date: r.date, rate: r.rate, comment: r.comment })),
    ];
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [view]);

  if (!view) return null;

  const { asset, derived } = view;
  const currentRate = derived.currentRate;

  const canSave = newRate !== undefined && newRate > 0 && newRate !== currentRate && !!date;

  const onSave = async () => {
    if (!canSave || newRate === undefined) return;
    const adjustment: RateAdjustment = {
      id: uid('radj-'),
      date,
      rate: newRate,
      comment: comment.trim() || undefined,
    };
    await updateAsset({
      ...asset,
      rateAdjustments: [...(asset.rateAdjustments ?? []), adjustment],
    });
    successBuzz();
    router.back();
  };

  const onEditAdjustment = async (adjId: string, rate: number) => {
    await updateAsset({
      ...asset,
      rateAdjustments: (asset.rateAdjustments ?? []).map((r) => (r.id === adjId ? { ...r, rate } : r)),
    });
    successBuzz();
  };

  const onDeleteAdjustment = (adjId: string) => {
    appAlert('Удалить изменение ставки?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await updateAsset({
            ...asset,
            rateAdjustments: (asset.rateAdjustments ?? []).filter((r) => r.id !== adjId),
          });
          successBuzz();
        },
      },
    ]);
  };

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>Изменить ставку</Text>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.balanceBox}>
          <Text style={s.balanceLabel}>Текущая ставка</Text>
          <Text style={s.balanceValue}>{formatPercent(currentRate)}</Text>
        </View>

        <NumberField
          label="Новая ставка"
          value={newRate}
          onChange={setNewRate}
          suffix="%"
          placeholder={String(currentRate)}
        />
        <DateField label="Дата" value={date} onChange={setDate} />
        <TextField
          label="Комментарий (необязательно)"
          value={comment}
          onChangeText={setComment}
          placeholder="Например: снизили ставку по акции"
        />

        <Text style={s.section}>История</Text>
        <Text style={s.hint}>Смахните запись влево — удалить, вправо — изменить ставку</Text>
        {timeline.map((point, i) => (
          <HistoryRow
            key={point.id ?? point.date}
            point={point}
            prevRate={i > 0 ? timeline[i - 1].rate : undefined}
            isLast={i === timeline.length - 1}
            onEdit={onEditAdjustment}
            onDelete={onDeleteAdjustment}
          />
        ))}
      </ScrollView>

      <Pressable style={[s.saveBtn, !canSave && s.disabled]} disabled={!canSave} onPress={onSave}>
        <Text style={s.saveText}>Сохранить</Text>
      </Pressable>
    </View>
  );
}

function HistoryRow({
  point,
  prevRate,
  isLast,
  onEdit,
  onDelete,
}: {
  point: TimelinePoint;
  prevRate: number | undefined;
  isLast: boolean;
  onEdit: (id: string, rate: number) => void;
  onDelete: (id: string) => void;
}) {
  const isFirst = prevRate === undefined;
  const delta = prevRate !== undefined ? point.rate - prevRate : undefined;
  const isUp = delta !== undefined && delta >= 0;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(point.rate));
  const swipeRef = useRef<SwipeableMethods>(null);

  const startEdit = () => {
    swipeRef.current?.close();
    setEditValue(String(point.rate));
    setEditing(true);
  };

  const saveEdit = () => {
    const n = parseFloat(editValue.replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && point.id) onEdit(point.id, n);
    setEditing(false);
  };

  const row = editing ? (
    <View style={[s.histRow, !isLast && s.rowDivider]}>
      <View style={[s.histIcon, s.histIconOpen]}>
        <MaterialCommunityIcons name="pencil-outline" size={16} color={tokens.accent.base} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.histDate}>{formatDateShort(point.date)}</Text>
        <TextInput
          style={s.editInput}
          value={editValue}
          onChangeText={(v) => setEditValue(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
          keyboardType="numeric"
          autoFocus
        />
      </View>
      <View style={s.editActions}>
        <Pressable onPress={() => setEditing(false)} hitSlop={8} style={s.editBtnCancel}>
          <MaterialIcons name="close" size={18} color={tokens.text.secondary} />
        </Pressable>
        <Pressable onPress={saveEdit} hitSlop={8} style={s.editBtnSave}>
          <MaterialIcons name="check" size={18} color={tokens.text.inverse} />
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={[s.histRow, !isLast && s.rowDivider]}>
      <View
        style={[
          s.histIcon,
          isFirst ? s.histIconOpen : isUp ? s.histIconUp : s.histIconDown,
        ]}
      >
        <MaterialCommunityIcons
          name={isFirst ? 'flag-outline' : isUp ? 'trending-up' : 'trending-down'}
          size={16}
          color={isFirst ? tokens.accent.base : isUp ? tokens.semantic.positive : tokens.semantic.negative}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.histDate}>{formatDateShort(point.date)}</Text>
        <Text style={s.histSub} numberOfLines={1}>
          {isFirst ? 'Открытие' : point.comment || 'Изменение ставки'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {delta !== undefined ? (
          <Text style={[s.histDelta, isUp ? s.histDeltaUp : s.histDeltaDown]}>
            {isUp ? '+' : '−'}{formatPercent(Math.abs(delta))}
          </Text>
        ) : null}
        <Text style={s.histBalance}>{formatPercent(point.rate)}</Text>
      </View>
    </View>
  );

  if (!point.id || editing) return row;

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      friction={1.7}
      leftThreshold={72}
      rightThreshold={72}
      onSwipeableWillOpen={(drag) => {
        const side = openedSide(drag);
        if (side === 'left') { tapBuzz(); startEdit(); }
        else { warnBuzz(); swipeRef.current?.close(); onDelete(point.id as string); }
      }}
      renderLeftActions={() => (
        <View style={s.swipeHint}>
          <View style={[s.swipeHintBox, { backgroundColor: hexToRgba(tokens.accent.base, 0.14) }]}>
            <MaterialCommunityIcons name="pencil-outline" size={20} color={tokens.accent.base} />
          </View>
        </View>
      )}
      renderRightActions={() => (
        <View style={s.swipeHint}>
          <View style={[s.swipeHintBox, { backgroundColor: hexToRgba(tokens.semantic.negative, 0.14) }]}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={tokens.semantic.negative} />
          </View>
        </View>
      )}
    >
      {row}
    </Swipeable>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 20 },
  scroll: { flex: 1 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: tokens.text.primary, marginBottom: 12 },

  balanceBox: {
    alignItems: 'center',
    backgroundColor: tokens.surface.neutral,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  balanceLabel: { fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  balanceValue: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary, marginTop: 4 },

  section: {
    fontFamily: font.semibold,
    fontSize: tokens.typography.label,
    color: tokens.text.secondary,
    marginTop: tokens.spacing.lg,
    marginBottom: 4,
  },
  hint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginBottom: tokens.spacing.sm },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, backgroundColor: tokens.surface.white },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: tokens.surface.hairline },
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

  swipeHint: { width: 88, alignItems: 'center', justifyContent: 'center' },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  saveBtn: {
    marginTop: tokens.spacing.lg,
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  disabled: { backgroundColor: tokens.text.tertiary },
  saveText: { color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '700' },
});
