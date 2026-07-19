import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { TextField, NumberField, DateField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { appAlert } from '@/lib/dialog';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';
import type { Goal } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function GoalFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, addGoal, updateGoal, deleteGoal } = useData();

  const editing = data.goals.find((g) => g.id === id);

  const [title, setTitle] = useState(editing?.title ?? '');
  const [targetAmount, setTargetAmount] = useState<number | undefined>(editing?.targetAmount);
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayIso());

  const canSave = title.trim().length > 0 && !!targetAmount && targetAmount > 0 && !!startDate;

  const onSave = async () => {
    if (!canSave || !targetAmount) return;
    tapBuzz();
    const goal: Goal = {
      id: editing?.id ?? uid('goal-'),
      title: title.trim(),
      targetAmount,
      currency: editing?.currency ?? data.settings.defaultCurrency,
      startDate,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      status: editing?.status ?? 'active',
      comment: editing?.comment,
    };
    try {
      if (editing) await updateGoal(goal);
      else await addGoal(goal);
      successBuzz();
      router.back();
    } catch {
      warnBuzz();
    }
  };

  const onDelete = () => {
    if (!editing) return;
    appAlert('Удалить цель?', 'Действие необратимо. Начисленный на неё доход при этом никуда не денется — он никогда не был отдельной суммой, просто прогноз.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteGoal(editing.id);
          router.back();
        },
      },
    ]);
  };

  const onArchive = async () => {
    if (!editing) return;
    tapBuzz();
    await updateGoal({ ...editing, status: editing.status === 'active' ? 'archived' : 'active' });
    router.back();
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.spacing.screenTop,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + 100,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <MaterialIcons name="close" size={26} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Цель' : 'Новая цель'}</Text>
          {editing ? (
            <Pressable onPress={onDelete} hitSlop={12}>
              <MaterialIcons name="delete-outline" size={24} color={tokens.semantic.negative} />
            </Pressable>
          ) : (
            <View style={{ width: 26 }} />
          )}
        </View>

        <Card>
          <TextField label="Название" value={title} onChangeText={setTitle} placeholder="Например, «Подушка безопасности»" autoFocus={!editing} />
          <NumberField
            label="Сумма"
            value={targetAmount}
            onChange={setTargetAmount}
            placeholder="0"
            suffix={editing?.currency ?? data.settings.defaultCurrency}
          />
          <DateField
            label="Считать доход с"
            value={startDate}
            onChange={setStartDate}
            hint="Можно задним числом — если до этой даты активов ещё не было, прогресс начнёт копиться только с их появления."
          />
        </Card>

        {editing ? (
          <Pressable style={styles.archiveRow} onPress={onArchive}>
            <MaterialIcons name={editing.status === 'active' ? 'archive' : 'unarchive'} size={20} color={tokens.text.secondary} />
            <Text style={styles.archiveText}>{editing.status === 'active' ? 'В архив' : 'Вернуть из архива'}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.footnote}>
          Цель — прогнозная надстройка, не отдельный кошелёк: деньги между активами никуда физически не переносятся. Если целей несколько, доход заполняет их по очереди — сначала самую старую, потом следующую.
        </Text>
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
  headerTitle: { fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },
  archiveRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.chip,
    marginTop: tokens.spacing.lg, paddingVertical: tokens.spacing.md,
  },
  archiveText: { fontFamily: font.medium, fontSize: tokens.typography.label, color: tokens.text.secondary },
  footnote: {
    fontFamily: font.regular,
    fontSize: tokens.typography.hint,
    color: hexToRgba(tokens.text.primary, 0.4),
    lineHeight: 18,
    marginTop: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.tight,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tokens.spacing.screenH,
    paddingTop: tokens.spacing.md,
    backgroundColor: hexToRgba('#F5F7FF', 0.85),
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
  saveText: { color: tokens.text.inverse, fontSize: tokens.typography.body, fontWeight: '700' },
});
