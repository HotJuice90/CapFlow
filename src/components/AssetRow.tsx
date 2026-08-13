import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssetView } from '@/domain/types';
import { TYPE_LABEL, PAYOUT_LABEL } from '@/domain/labels';
import { tokens, font, hexToRgba } from '@/theme';
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
 * под ними пилюли с деталями (ставка, тип, период выплат, остаток срока).
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
 * Пилюли — та же идиома, что в календаре (`app/(tabs)/calendar.tsx` → pillRow):
 * детали, которые полезно видеть, но которые не должны спорить за внимание с
 * суммой. Обёрнуты во flexWrap, а НЕ в горизонтальный ScrollView как в
 * календаре: вложенный горизонтальный скролл внутри вертикального списка
 * отбирает жест и мешает скроллить экран.
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
  const invested = derived.currentValue - derived.earnedSoFar;

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

      <View style={styles.pillRow}>
        <View style={[styles.pill, styles.pillRate]}>
          <Text style={[styles.pillText, styles.pillRateText]}>{formatPercent(derived.currentRate)}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{TYPE_LABEL[instrument.typeId] ?? instrument.typeId}</Text>
        </View>
        {payout ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{PAYOUT_LABEL[payout] ?? payout}</Text>
          </View>
        ) : null}
        {/* Срок — не такая же характеристика, как тип или период выплат: он
            тикает и требует решения, когда кончится. Поэтому свой цвет и правый
            край, чтобы не терялся в ряду однотипных серых пилюль. */}
        {isMatured ? (
          <View style={[styles.pill, styles.pillWarn, styles.pillEnd]}>
            <Text style={[styles.pillText, styles.pillWarnText]}>Истёк срок</Text>
          </View>
        ) : derived.daysRemaining !== undefined ? (
          <View style={[styles.pill, styles.pillTerm, styles.pillEnd]}>
            <Text style={[styles.pillText, styles.pillTermText]}>
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
  // Название мельче суммы и обычным весом — иначе два «главных» элемента в
  // строке спорят друг с другом и иерархии не возникает.
  name: {
    fontSize: tokens.typography.label,
    lineHeight: tokens.typography.label + 3,
    fontWeight: '500',
    color: tokens.text.primary,
  },
  subtitle: {
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    color: tokens.text.secondary,
    marginTop: 2,
  },

  right: { alignItems: 'flex-end' },
  // Единственный тяжёлый элемент строки — он и есть якорь для взгляда.
  amount: {
    fontFamily: font.semibold,
    fontSize: 19,
    lineHeight: 21,
    letterSpacing: -0.3,
    color: tokens.text.primary,
  },
  income: {
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    color: tokens.semantic.positive,
    marginTop: 2,
  },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  pill: {
    backgroundColor: '#F9FAFF',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.tight,
    paddingVertical: 5,
  },
  // Светло-серый, а не почти-чёрный: пилюли — это детали, они не должны
  // конкурировать по контрасту ни с названием, ни с суммой.
  pillText: { fontSize: 11, lineHeight: 13, fontWeight: '500', color: tokens.text.tertiary },
  pillRate: { backgroundColor: hexToRgba(tokens.accent.base, 0.1), paddingHorizontal: 8 },
  pillRateText: { color: tokens.accent.base },
  // marginLeft:auto прижимает к правому краю ряда; при переносе строки уедет
  // вправо на своей строке — тоже корректно.
  pillEnd: { marginLeft: 'auto' },
  // Фиолетовый tokens.category.dfa — он уже живёт в приложении (аналитика,
  // «исправление» в шите баланса), так что палитра не расширяется.
  pillTerm: { backgroundColor: hexToRgba(tokens.category.dfa, 0.12) },
  pillTermText: { color: tokens.category.dfa },
  pillWarn: { backgroundColor: hexToRgba(tokens.semantic.warning, 0.14) },
  pillWarnText: { color: tokens.semantic.warning },
});
