import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { openedSide } from '@/lib/swipe';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Segmented, groupWhileTyping } from '@/components/form/fields';
import { openDatePicker } from '@/lib/datePicker';
import { useData } from '@/state/DataContext';
import { freeCapitalBalance, portfolioSummary } from '@/state/selectors';
import { appAlert } from '@/lib/dialog';
import { tapBuzz, successBuzz, warnBuzz } from '@/lib/haptics';
import { uid } from '@/utils/id';
import type { FreeCapitalEntry } from '@/domain/types';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, CURRENCY_SYMBOL } from '@/format';
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

  // Доля в общем капитале — единственная полезная подпись к балансу: сама
  // сумма и так на виду, а вот «много это или мало» без неё не понять.
  const working = useMemo(() => portfolioSummary(data).workingCapital, [data]);
  const share = balance > 0 && working + balance > 0 ? balance / (working + balance) : 0;

  const [direction, setDirection] = useState<Direction>('in');
  // Текст суммы живёт ЗДЕСЬ, а не внутри поля: у общего NumberField своя
  // строка, и после «Добавить» число в состоянии сбрасывалось, а в поле
  // оставалось старое — кнопка гасла, а сумма продолжала висеть на экране.
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState<string>(todayIso());
  const [comment, setComment] = useState('');

  const amount = useMemo(() => {
    const n = parseFloat(amountText.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }, [amountText]);
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
    setAmountText('');
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
          <Text style={styles.headerTitle}>Свободные деньги</Text>
        </View>

        {/* Баланс — главное число экрана, поэтому без рамки: карточка вокруг
            одной цифры делала её «ещё одним полем», и экран разваливался на
            равнозначные коробки. */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Свободно</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatMoney(balance, { currency: cur, kopecks: 'hide' })}
          </Text>
          {share > 0 ? (
            <Text style={styles.heroSub}>{Math.round(share * 100)}% всего капитала · без ставки</Text>
          ) : null}
        </View>

        {/* Операция — одним блоком: тип, сумма, дата с комментарием и кнопка
            читаются как одно действие, а не как пять полей вразброс. */}
        <View style={styles.opCard}>
          <Segmented
            value={direction}
            options={[
              { label: 'Пополнение', value: 'in' },
              { label: 'Списание', value: 'out' },
            ]}
            onChange={(v) => { tapBuzz(); setDirection(v); }}
          />

          <View style={styles.amountRow}>
            <Text style={[styles.amountSign, direction === 'out' && styles.amountSignOut]}>
              {direction === 'in' ? '+' : '−'}
            </Text>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={(t) => setAmountText(groupWhileTyping(t.replace(',', '.').replace(/[^0-9.]/g, '')))}
              placeholder="0"
              placeholderTextColor={hexToRgba(tokens.text.primary, 0.25)}
              keyboardType="numeric"
            />
            <Text style={styles.amountCur}>{CURRENCY_SYMBOL[cur]}</Text>
          </View>

          <View style={styles.metaRow}>
            <Pressable
              style={styles.dateChip}
              onPress={() => openDatePicker({ title: 'Дата', value: date, maxDate: todayIso(), onPick: setDate })}
            >
              <MaterialIcons name="calendar-today" size={15} color={tokens.accent.base} />
              <Text style={styles.dateChipText}>{date === todayIso() ? 'Сегодня' : formatDateShort(date)}</Text>
            </Pressable>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Комментарий"
              placeholderTextColor={tokens.text.tertiary}
            />
          </View>

          <Pressable style={[styles.addBtn, !canSave && styles.addBtnDisabled]} disabled={!canSave} onPress={onAdd}>
            <MaterialIcons name="add" size={18} color={tokens.text.inverse} />
            <Text style={styles.addBtnText}>{direction === 'in' ? 'Пополнить' : 'Списать'}</Text>
          </Pressable>
        </View>

        {entries.length > 0 ? (
          <>
            <Text style={styles.section}>История</Text>
            <Text style={styles.hint}>Смахните влево — изменить, вправо — удалить</Text>
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} onDelete={onDelete} />
            ))}
          </>
        ) : (
          <Text style={styles.emptyHint}>Записей пока нет — добавь первую движением выше.</Text>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function EntryRow({ entry, onDelete }: { entry: FreeCapitalEntry; onDelete: (id: string) => void }) {
  const router = useRouter();
  const swipeRef = useRef<SwipeableMethods>(null);
  const isUp = entry.amount >= 0;

  const row = (
    <View style={styles.histRow}>
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
      overshootRight={false}
      friction={1.7}
      leftThreshold={72}
      rightThreshold={72}
      // Тот же паттерн, что и в catalog/instruments.tsx: влево — редактировать, вправо — удалить.
      onSwipeableWillOpen={(drag) => {
        const side = openedSide(drag);
        swipeRef.current?.close();
        if (side === 'left') {
          tapBuzz();
          router.push({ pathname: '/settings/free-capital-entry', params: { id: entry.id } });
        } else {
          warnBuzz();
          onDelete(entry.id);
        }
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
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.xl },
  backBtn: { width: 24 },
  headerTitle: { flex: 1, fontFamily: font.semibold, fontSize: tokens.typography.header, color: tokens.text.primary, letterSpacing: -0.24 },

  hero: { alignItems: 'center', paddingTop: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl },
  heroLabel: {
    fontFamily: font.medium,
    fontSize: tokens.typography.label,
    lineHeight: tokens.typography.label + 2,
    color: tokens.text.secondary,
  },
  heroValue: {
    fontFamily: font.semibold,
    fontSize: 40,
    lineHeight: 48,
    color: tokens.text.primary,
    letterSpacing: -0.8,
    marginTop: 6,
  },
  heroSub: {
    fontFamily: font.regular,
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    color: tokens.text.tertiary,
    marginTop: 6,
  },

  opCard: {
    backgroundColor: tokens.surface.white,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    boxShadow: tokens.shadow.card,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.surface.hairline,
  },
  amountSign: { fontFamily: font.semibold, fontSize: 30, color: tokens.semantic.positive, marginRight: 4 },
  amountSignOut: { color: tokens.semantic.negative },
  amountInput: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 30,
    color: tokens.text.primary,
    paddingVertical: 0,
  },
  amountCur: { fontFamily: font.medium, fontSize: 22, color: tokens.text.tertiary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginTop: tokens.spacing.md },
  dateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: tokens.accent.soft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    height: 40,
  },
  dateChipText: { fontFamily: font.medium, fontSize: tokens.typography.caption, color: tokens.accent.base },
  commentInput: {
    flex: 1,
    height: 40,
    backgroundColor: tokens.surface.neutral,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    fontSize: tokens.typography.caption,
    color: tokens.text.primary,
  },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: tokens.accent.base, borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.md, marginTop: tokens.spacing.lg,
  },
  addBtnDisabled: { backgroundColor: hexToRgba(tokens.accent.base, 0.35) },
  addBtnText: { color: tokens.text.inverse, fontFamily: font.semibold, fontSize: tokens.typography.label },

  section: { fontFamily: font.semibold, fontSize: tokens.typography.title, color: tokens.text.primary, marginTop: 40, marginBottom: 14, paddingLeft: 8 },
  hint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: -8, marginBottom: tokens.spacing.sm, paddingLeft: 8 },
  emptyHint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: tokens.spacing.lg, textAlign: 'center' },

  // Заливка '#F9FAFF' — тот же приём, что и плитки в аналитике/пилюли в календаре
  // и на карточке актива: близко к фону, но без прозрачности (не белая карточка).
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: 16, marginBottom: 8,
    backgroundColor: '#F9FAFF',
  },
  histIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface.white },
  histIconUp: { backgroundColor: hexToRgba(tokens.semantic.positive, 0.12) },
  histIconDown: { backgroundColor: hexToRgba(tokens.semantic.negative, 0.12) },
  histDate: { fontFamily: font.medium, fontSize: tokens.typography.label, color: tokens.text.primary },
  histSub: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: 2 },
  histDelta: { fontFamily: font.semibold, fontSize: tokens.typography.label },
  histDeltaUp: { color: tokens.semantic.positive },
  histDeltaDown: { color: tokens.semantic.negative },

  swipeHint: { width: 64, alignItems: 'center', justifyContent: 'center' },
  swipeHintBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
