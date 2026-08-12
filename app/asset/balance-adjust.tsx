import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { TextField, NumberField, DateField, Segmented } from '@/components/form/fields';
import { Toggle } from '@/components/Toggle';
import { useData } from '@/state/DataContext';
import { findAssetView } from '@/state/selectors';
import { appAlert } from '@/lib/dialog';
import { calcAssetTax } from '@/calc';
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
  isCorrection?: boolean;
  taxWithheld?: number;
}

export default function BalanceAdjustSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, updateAsset, addFreeCapitalEntry } = useData();

  const view = useMemo(() => findAssetView(data, id), [data, id]);

  const [direction, setDirection] = useState<Direction>('topup');
  const [delta, setDelta] = useState<number | undefined>(undefined);
  const [taxWithheld, setTaxWithheld] = useState<number | undefined>(undefined);
  const [isCorrection, setIsCorrection] = useState(false);
  const [correctedAmount, setCorrectedAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState<string>(todayIso());
  const [comment, setComment] = useState('');
  const [fundFromFree, setFundFromFree] = useState(false);

  // Баланс свободных денег именно в валюте актива — см. asset/form.tsx.
  const freeBalanceInCurrency = useMemo(
    () => data.freeCapitalEntries.filter((e) => e.currency === view?.asset.currency).reduce((sum, e) => sum + e.amount, 0),
    [data.freeCapitalEntries, view?.asset.currency],
  );

  const timeline = useMemo<TimelinePoint[]>(() => {
    if (!view) return [];
    const points: TimelinePoint[] = [
      { date: view.asset.openDate, amount: view.asset.amount },
      ...(view.asset.balanceAdjustments ?? []).map((a) => ({ id: a.id, date: a.date, amount: a.amount, comment: a.comment, isCorrection: a.isCorrection, taxWithheld: a.taxWithheld })),
    ];
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [view]);

  if (!view) return null;

  const { asset, derived } = view;
  const cur = asset.currency;
  // Для математики (пополнение/снятие меняет ТЕЛО) — чистое тело, как и было.
  const currentBalance = derived.balanceNow;
  // Для display/подсказки — честная сумма (тело + начисленное), как в шапке актива:
  // иначе тут висит заниженное число, не совпадающее с тем, что реально видит юзер в банке.
  const displayBalance = derived.currentValue;
  const newBalance = isCorrection
    ? (correctedAmount ?? displayBalance)
    : direction === 'topup'
      ? currentBalance + (delta ?? 0)
      : currentBalance - (delta ?? 0);

  // Подсказка по налогу на снятие: банк удерживает сам (флаг актива) — прикидываем
  // долю накопленного дохода, приходящуюся на снимаемую сумму, пропорционально
  // (та же методология, что и «удержит банк / доплатить самому» на главном экране).
  // Только placeholder — это оценка через нашу модель, не факт из банка.
  const profitShare =
    asset.taxWithheldByBank && direction === 'withdraw' && delta && displayBalance > 0
      ? (delta / displayBalance) * derived.accrued
      : undefined;
  const suggestedTax = profitShare !== undefined ? calcAssetTax(profitShare, data.params, 0, true) : undefined;

  const canSave = isCorrection
    ? correctedAmount !== undefined && correctedAmount >= 0 && !!date
    : delta !== undefined && delta > 0 && newBalance >= 0 && !!date;

  const onSave = async () => {
    if (!canSave) return;
    if (newBalance < 0) { warnBuzz(); return; }
    const adjustment: BalanceAdjustment = {
      id: uid('badj-'),
      date,
      amount: newBalance,
      comment: comment.trim() || undefined,
      isCorrection: isCorrection || undefined,
      taxWithheld: !isCorrection && direction === 'withdraw' ? taxWithheld : undefined,
    };
    await updateAsset({
      ...asset,
      balanceAdjustments: [...(asset.balanceAdjustments ?? []), adjustment],
    });
    // Связка с лентой свободных денег: пополнение списывает из кошелька, снятие
    // возвращает в него (за вычетом налога, если банк удержал сам — на руки
    // пришло именно столько). Исправления не трогают кошелёк: это не движение
    // денег, а правка модели под факт банка.
    if (!isCorrection && fundFromFree && delta) {
      const free = direction === 'topup' ? -delta : Math.max(0, delta - (taxWithheld ?? 0));
      if (free !== 0) {
        await addFreeCapitalEntry({
          id: uid('fce-'),
          date,
          amount: free,
          currency: cur,
          comment: comment.trim() || undefined,
          createdAt: new Date().toISOString(),
        });
      }
    }
    successBuzz();
    router.back();
  };

  const onEditAdjustment = async (adjId: string, amount: number, taxWithheld?: number) => {
    await updateAsset({
      ...asset,
      balanceAdjustments: (asset.balanceAdjustments ?? []).map((a) => (a.id === adjId ? { ...a, amount, taxWithheld } : a)),
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
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>Изменить баланс</Text>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.balanceBox}>
          <Text style={s.balanceLabel}>Сейчас на счёте</Text>
          <Text style={s.balanceValue}>{formatMoney(displayBalance, { currency: cur })}</Text>
        </View>

        <View style={s.correctionRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.correctionLabel}>Это исправление, не движение денег</Text>
            <Text style={s.correctionHint}>Модель разошлась с банком — укажи реальный баланс, доход за прошлый период пересчитается по факту</Text>
          </View>
          <Toggle value={isCorrection} onChange={(v) => { tapBuzz(); setIsCorrection(v); }} />
        </View>

        {isCorrection ? (
          <NumberField
            label="Реальный баланс по банку"
            value={correctedAmount}
            onChange={setCorrectedAmount}
            suffix={cur}
            placeholder={String(Math.round(displayBalance))}
          />
        ) : (
          <>
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
            {direction === 'withdraw' ? (
              <NumberField
                label="Из них налог (если банк удержал сам)"
                value={taxWithheld}
                onChange={setTaxWithheld}
                placeholder={suggestedTax !== undefined ? String(Math.round(suggestedTax)) : '0'}
              />
            ) : null}
            <View style={s.freeRow}>
              <Text style={s.freeLabel}>
                {direction === 'topup' ? 'Списать из свободных денег' : 'Зачислить в свободные деньги'}
              </Text>
              <Toggle value={fundFromFree} onChange={(v) => { tapBuzz(); setFundFromFree(v); }} />
            </View>
            {fundFromFree ? (
              <Text style={s.freeHint}>
                {direction === 'topup'
                  ? freeBalanceInCurrency > 0
                    ? `Доступно: ${formatMoney(freeBalanceInCurrency, { currency: cur })}`
                    : 'Нет свободных денег в этой валюте — баланс уйдёт в минус'
                  : `Зачислим ${formatMoney(Math.max(0, (delta ?? 0) - (taxWithheld ?? 0)), { currency: cur })}${taxWithheld ? ' — за вычетом налога' : ''}`}
              </Text>
            ) : null}
          </>
        )}
        <DateField label="Дата" value={date} onChange={setDate} />
        <TextField
          label="Комментарий (необязательно)"
          value={comment}
          onChangeText={setComment}
          placeholder="Например: отпуск"
        />

        <Text style={s.section}>История</Text>
        <Text style={s.hint}>Смахните запись влево — удалить, вправо — изменить сумму</Text>
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
      </ScrollView>

      <Pressable style={[s.saveBtn, !canSave && s.disabled]} disabled={!canSave} onPress={onSave}>
        <Text style={s.saveText}>Сохранить</Text>
      </Pressable>
    </View>
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
  onEdit: (id: string, amount: number, taxWithheld?: number) => void;
  onDelete: (id: string) => void;
}) {
  const isFirst = prevAmount === undefined;
  const delta = prevAmount !== undefined ? point.amount - prevAmount : undefined;
  const isUp = delta !== undefined && delta >= 0;
  const isWithdrawal = !isFirst && !point.isCorrection && !isUp;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(Math.round(point.amount)));
  const [editTax, setEditTax] = useState(point.taxWithheld ? String(Math.round(point.taxWithheld)) : '');
  const swipeRef = useRef<SwipeableMethods>(null);

  const startEdit = () => {
    swipeRef.current?.close();
    setEditValue(String(Math.round(point.amount)));
    setEditTax(point.taxWithheld ? String(Math.round(point.taxWithheld)) : '');
    setEditing(true);
  };

  const saveEdit = () => {
    const n = parseFloat(editValue);
    const tax = parseFloat(editTax);
    if (Number.isFinite(n) && n >= 0 && point.id) {
      onEdit(point.id, n, isWithdrawal && Number.isFinite(tax) && tax > 0 ? tax : undefined);
    }
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
        {isWithdrawal ? (
          <TextInput
            style={s.editInputTax}
            value={editTax}
            onChangeText={(v) => setEditTax(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            placeholder="Налог из них (необязательно)"
            placeholderTextColor={tokens.text.tertiary}
          />
        ) : null}
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
          isFirst ? s.histIconOpen : point.isCorrection ? s.histIconCorrection : isUp ? s.histIconUp : s.histIconDown,
        ]}
      >
        <MaterialCommunityIcons
          name={isFirst ? 'flag-outline' : point.isCorrection ? 'wrench-outline' : isUp ? 'arrow-up' : 'arrow-down'}
          size={16}
          color={isFirst ? tokens.accent.base : point.isCorrection ? tokens.category.dfa : isUp ? tokens.semantic.positive : tokens.semantic.negative}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.histDate}>{formatDateShort(point.date)}</Text>
        <Text style={s.histSub} numberOfLines={1}>
          {isFirst ? 'Открытие' : point.isCorrection ? (point.comment || 'Исправление под факт банка') : point.comment || (isUp ? 'Пополнение' : 'Снятие')}
          {point.taxWithheld ? ` · налог ${formatMoney(point.taxWithheld, { currency, kopecks: 'hide' })}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {delta !== undefined ? (
          <Text style={[s.histDelta, isUp ? s.histDeltaUp : s.histDeltaDown]}>
            {isUp ? '+' : '−'}{formatMoney(Math.abs(delta), { currency })}
          </Text>
        ) : null}
        <Text style={s.histBalance}>{formatMoney(point.amount, { currency, kopecks: 'hide' })}</Text>
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
      onSwipeableWillOpen={(direction) => {
        if (direction === 'left') { tapBuzz(); startEdit(); }
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
  // flex:1 — шит теперь фиксированной высоты (sheetAllowedDetents: [0.92], не
  // fitToContents), поэтому контент должен СКРОЛЛИТЬСЯ, а не просто помещаться.
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

  correctionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: hexToRgba(tokens.category.dfa, 0.08),
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
  },
  correctionLabel: { fontFamily: font.medium, fontSize: tokens.typography.caption, color: tokens.text.primary },
  correctionHint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 2 },

  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.sm,
  },
  freeLabel: { fontSize: tokens.typography.body, color: tokens.text.primary },
  freeHint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: -4, marginBottom: tokens.spacing.sm },

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
  histIconCorrection: { backgroundColor: hexToRgba(tokens.category.dfa, 0.14) },
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
  editInputTax: {
    fontFamily: font.regular,
    fontSize: tokens.typography.caption,
    color: tokens.text.secondary,
    marginTop: 4,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: tokens.surface.hairline,
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
