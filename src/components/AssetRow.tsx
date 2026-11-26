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
 * тут — сумма (как в шапке карточки актива) + заработано с открытия, в
 * календаре — доход за день.
 *
 * 4. Детали одной мета-строкой через точку вместо пилюль («15,07% · Накопительный
 *    счёт · Ежедневно»): пробовали в 0.9.93 — читалось хуже, пилюли вернули.
 */
/**
 * Сумма в строке — ТА ЖЕ, что крупно в шапке карточки актива (`app/asset/[id].tsx`):
 * у срочного «Сумма вклада» (тело), у бессрочного «На счёте» (тело + проценты,
 * уже выплаченные на этот же счёт). Раньше строка показывала «вложено» и у
 * накопительного расходилась с карточкой: после вывода процентов и пополнения
 * до ровных 3 000 000 главная рисовала 2 939 253. Сортировка «по сумме» на
 * главной берёт это же число.
 */
export function rowAmount(view: AssetView): number {
  return view.instrument.behavior === 'term' ? view.derived.invested : view.derived.currentValue;
}

export function AssetRow({ view }: { view: AssetView }) {
  const router = useRouter();
  const { asset, instrument, organization, derived } = view;
  const iconName = ICON_BY_TYPE[instrument.typeId] ?? 'bank-outline';
  // Срок вышел, но актив ещё не закрыт/архивирован руками — нужно решение
  // (продлить/архив/закрыть), см. app/asset/[id].tsx.
  const isMatured = instrument.behavior === 'term' && (derived.termProgress ?? 0) >= 1;
  const cur = asset.currency;
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const invested = rowAmount(view);
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
            край, чтобы не терялся в ряду однотипных серых пилюль. За две недели
            до окончания — залит целиком: срок рядом. */}
        {isMatured ? (
          <View style={[styles.pill, styles.pillWarn, styles.pillEnd]}>
            <Text style={[styles.pillText, styles.pillWarnText]}>Истёк срок</Text>
          </View>
        ) : derived.daysRemaining !== undefined ? (
          <View style={[styles.pill, soon ? styles.pillSoon : styles.pillTerm, styles.pillEnd]}>
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

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 14 },
  pill: {
    backgroundColor: '#F9FAFF',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.tight,
    paddingVertical: 5,
  },
  // Светло-серый, а не почти-чёрный: пилюли — это детали, они не должны
  // конкурировать по контрасту ни с названием, ни с суммой.
  pillText: { ...textRole.pill, color: tokens.text.tertiary },
  pillRate: { backgroundColor: hexToRgba(tokens.accent.base, 0.1), paddingHorizontal: 8 },
  pillRateText: { color: tokens.accent.base },
  // marginLeft:auto прижимает к правому краю ряда; при переносе строки уедет
  // вправо на своей строке — тоже корректно.
  pillEnd: { marginLeft: 'auto' },
  // Фиолетовый tokens.category.dfa — он уже живёт в приложении (аналитика,
  // «исправление» в шите баланса), так что палитра не расширяется.
  pillTerm: { backgroundColor: hexToRgba(tokens.category.dfa, 0.12) },
  pillTermText: { color: tokens.category.dfa },
  pillSoon: { backgroundColor: tokens.category.dfa },
  pillSoonText: { color: tokens.text.inverse },
  pillWarn: { backgroundColor: hexToRgba(tokens.semantic.warning, 0.14) },
  pillWarnText: { color: tokens.semantic.warning },
});
