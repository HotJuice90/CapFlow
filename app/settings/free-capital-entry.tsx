import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NumberField, DateField, TextField, Segmented } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';
import { tokens, font } from '@/theme';
import { CURRENCY_SYMBOL } from '@/format';

type Direction = 'in' | 'out';

/** Шит редактирования одной записи ленты свободных денег — дата/сумма/коммент,
 *  плюс удаление. Добавление новой записи остаётся инлайн на самом экране. */
export default function FreeCapitalEntrySheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, updateFreeCapitalEntry, deleteFreeCapitalEntry } = useData();

  const entry = useMemo(() => data.freeCapitalEntries.find((e) => e.id === id), [data.freeCapitalEntries, id]);

  const [direction, setDirection] = useState<Direction>(entry && entry.amount < 0 ? 'out' : 'in');
  const [amount, setAmount] = useState<number | undefined>(entry ? Math.abs(entry.amount) : undefined);
  const [date, setDate] = useState<string>(entry?.date ?? '');
  const [comment, setComment] = useState(entry?.comment ?? '');

  if (!entry) return null;
  const symbol = CURRENCY_SYMBOL[entry.currency];

  const canSave = amount !== undefined && amount > 0 && !!date;

  const onSave = async () => {
    if (!canSave || amount === undefined) return;
    await updateFreeCapitalEntry({
      ...entry,
      date,
      amount: direction === 'in' ? amount : -amount,
      comment: comment.trim() || undefined,
    });
    successBuzz();
    router.back();
  };

  const onDelete = () => {
    appAlert('Удалить запись?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteFreeCapitalEntry(entry.id);
          successBuzz();
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>Изменить запись</Text>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          suffix={symbol}
          grouped
        />
        <DateField label="Дата" value={date} onChange={setDate} />
        <TextField
          label="Комментарий (необязательно)"
          value={comment}
          onChangeText={setComment}
          placeholder="Например: зарплата"
        />
      </ScrollView>

      <Pressable style={[s.saveBtn, !canSave && s.disabled]} disabled={!canSave} onPress={onSave}>
        <Text style={s.saveText}>Сохранить</Text>
      </Pressable>
      <Pressable style={s.deleteBtn} onPress={() => { warnBuzz(); onDelete(); }}>
        <Text style={s.deleteText}>Удалить запись</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 20 },
  scroll: { flex: 1 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: tokens.text.primary, marginBottom: 12 },

  saveBtn: {
    marginTop: tokens.spacing.lg,
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  disabled: { backgroundColor: tokens.text.tertiary },
  saveText: { color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '700' },

  deleteBtn: { alignItems: 'center', paddingVertical: tokens.spacing.md },
  deleteText: { color: tokens.semantic.negative, fontFamily: font.medium, fontSize: tokens.typography.label },
});
