import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssetView } from '@/domain/types';
import { TYPE_LABEL, PAYOUT_LABEL } from '@/domain/labels';
import { tokens, hexToRgba, rowText, textRole } from '@/theme';
import { formatMoney, formatPercent } from '@/format';
import { pluralDays } from '@/format/date';
import { OrgLogo } from '@/components/BankLogo';

const ICON_BY_TYPE = {
  deposit: 'bank-outline',
  savings: 'piggy-bank-outline',
  bond: 'certificate-outline',
  dfa: 'chart-line',
} as const;

/**
 * Строка списка активов: слева название и банк, справа сумма и доход в день,
 * под ними строка деталей (ставка · тип · выплаты) и пилюля срока.
 *
 * Композиция выстрадана итерациями, поэтому кратко о том, что НЕ работает:
 *
 * 1. Суммы в строке не было вообще — при том что это самая базовая цифра.
 * 2. Ряд подписанных метрик («На счёте / Ставка / В день») под шапкой: на одной
 *    карточке смотрится хорошо (образец — Финуслуги), но в списке из пяти строк
 *    это 15 повторяющихся ярлыков, и ни одно число не главное. Читается кашей.
 * 3. Название в одну строку с обрезкой: на левую колонку остаётся ~160px, а
 *    «Накопительный ежедневный плюс» просит ~218px. Поэтому numberOfLines={2} —
 *    высотой платят только длинные названия, короткие остаются компактными.
 *
 * Числа разведены по экранам, чтобы одно и то же не показывалось трижды:
 * тут — вложено + заработано с открытия, в календаре — доход за день,
 * в аналитике — сумма вместе с процентами (она же = вложено + заработано).
 *
 * 4. Детали пилюлями (ставка, тип, выплаты, срок): 3–4 одинаковых серых чипа на
 *    каждой карточке давали визуальный шум. Теперь детали — одной мета-строкой
 *    через точку, пилюлей только срок (22.11.2026, ТЗ главного экрана).
 */
export function AssetRow({ view }: { view: AssetView }) {
  const router = useRouter();
  const { asset, instrument, organization, derived } = view;
  const iconName = ICON_BY_TYPE[instrument.typeId] ?? 'bank-outline';
  // Срок вышел, но актив ещё не закрыт/архивирован руками — нужно решение
  // (продлить/архив/закрыть), см. app/asset/[id].tsx.
  const isMatured = instrument.behavior === 'term' && (derived.termProgress ?? 0) >= 1;
  const cur = asset.currency;
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  // Базовая сумма — свои деньги, без набежавших процентов. Работает одинаково
  // для обоих режимов: при капитализации balanceNow уже включает начисленное,
  // при простом проценте currentValue = balanceNow + earnedSoFar. Разложение
  // точное: базовая + заработано = currentValue, то есть ровно та сумма,
  // которую показывает аналитика.
  const invested = derived.invested;
  // Срок близко — пилюля заметнее: через две недели деньги потребуют решения.
  const soon = derived.daysRemaining !== undefined && derived.daysRemaining <= 14;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => router.push(`/asset/${asset.id}`)}
    >
      <View style={styles.top}>
        <OrgLogo
          color={organization.color}
          logo={organization.logo}
          imageUri={organization.customImageUri}
          size={44}
          radius={16}
          variant="solid"
          fallbackIcon={iconName}
        />
        <View style={styles.middle}>
          <Text style={styles.name} numberOfLines={2}>
            {asset.title || instrument.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {organization.name}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.amount} numberOfLines={1}>
            {formatMoney(invested, { currency: cur, kopecks: 'hide' })}
          </Text>
          <Text style={styles.income} numberOfLines={1}>
            +{formatMoney(derived.earnedSoFar, { currency: cur, kopecks: 'hide' })}
          </Text>
        </View>
      </View>

      {/* Детали — одной спокойной строкой через точку, а не 3–4 одинаковыми
          серыми пилюлями: пилюли читались шумом и спорили с суммой. Ставка
          чуть темнее — это единственная деталь, которую сравнивают глазами.
          Пилюлей остался только срок: он тикает и требует решения. */}
      <View style={styles.metaRow}>
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={styles.metaRate}>{formatPercent(derived.currentRate)}</Text>
          {' · '}{TYPE_LABEL[instrument.typeId] ?? instrument.typeId}
          {payout ? ` · ${PAYOUT_LABEL[payout] ?? payout}` : ''}
        </Text>
        {isMatured ? (
          <View style={[styles.pill, styles.pillWarn]}>
            <Text style={[styles.pillText, styles.pillWarnText]}>Истёк срок</Text>
          </View>
        ) : derived.daysRemaining !== undefined ? (
          <View style={[styles.pill, soon ? styles.pillSoon : styles.pillTerm]}>
            <Text style={[styles.pillText, soon ? styles.pillSoonText : styles.pillTermText]}>
              {derived.daysRemaining} {pluralDays(derived.daysRemaining)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Карточки независимые (каждый актив — своя Card в index.tsx), поэтому свой
  // вертикальный паддинг строке не нужен: его даёт карточка.
  row: {},
  pressed: { opacity: 0.6 },

  // flex-start, а не center: у длинного названия слева три текстовые строки, и
  // сумма должна стоять на уровне названия, а не съезжать к середине блока.
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  middle: { flex: 1, marginLeft: tokens.spacing.md, marginRight: tokens.spacing.sm },
  // Общая типографика строки актива (см. src/theme/rowText.ts) — те же значения
  // в календаре. Название мельче суммы и обычным весом, иначе два «главных»
  // элемента в строке спорят друг с другом и иерархии не возникает.
  name: rowText.title,
  subtitle: rowText.subtitle,

  right: { alignItems: 'flex-end' },
  // Единственный тяжёлый элемент строки — он и есть якорь для взгляда.
  amount: { ...textRole.rowAmount, color: tokens.text.primary },
  // Заработано — факт, единственное зелёное (tokens.value.earned).
  income: { ...textRole.rowSubtitle, color: tokens.value.earned, marginTop: 2 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginTop: 12 },
  meta: { ...textRole.rowSubtitle, flex: 1, minWidth: 0 },
  metaRate: { fontFamily: textRole.rowTitle.fontFamily, color: tokens.text.secondary },
  pill: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.tight,
    paddingVertical: 5,
  },
  pillText: textRole.pill,
  // Фиолетовый tokens.category.dfa — он уже живёт в приложении (аналитика,
  // «исправление» в шите баланса), так что палитра не расширяется.
  pillTerm: { backgroundColor: hexToRgba(tokens.category.dfa, 0.12) },
  pillTermText: { color: tokens.category.dfa },
  // Две недели и меньше — тот же цвет, но насыщеннее: срок рядом.
  pillSoon: { backgroundColor: tokens.category.dfa },
  pillSoonText: { color: tokens.text.inverse },
  pillWarn: { backgroundColor: hexToRgba(tokens.semantic.warning, 0.14) },
  pillWarnText: { color: tokens.semantic.warning },
});
