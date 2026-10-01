import React, { useEffect, useMemo } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '@/state/DataContext';
import { payoutDetails, buildAssetViews, type PayoutDetails } from '@/state/selectors';
import { getPayoutSheet } from '@/lib/payoutSheet';
import { OrgLogo } from '@/components/BankLogo';
import { actionBuzz, successBuzz } from '@/lib/haptics';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { formatDateShort } from '@/format/date';
import type { AssetView } from '@/domain/types';

/**
 * Выплата процентов: что набежало за период и что с этим делать.
 *
 * Банк в этот день причисляет проценты к тому же счёту, и дальше они тоже
 * приносят доход — это и есть «оставить», поведение по умолчанию. Но у многих
 * счетов надбавка действует только до определённой суммы, и всё сверх работает
 * по базовой ставке: тогда проценты выгоднее забрать.
 *
 * Выплат за день может быть несколько — решаем по каждой отдельно, но в один
 * заход: разводить это по разным экранам значит заставить человека вернуться.
 *
 * Налог показываем справочно: по накопительному счёту банк его не удерживает,
 * он уходит в общий годовой расчёт на главной и в необлагаемый лимит.
 */
export default function PayoutSheet() {
  const items = getPayoutSheet();
  const { data, recordPayout } = useData();

  useEffect(() => {
    if (items.length === 0) router.back();
  }, [items.length]);

  const views = useMemo(() => buildAssetViews(data), [data]);
  const rows = useMemo(
    () =>
      items
        .map((it) => ({
          details: payoutDetails(data, it.assetId, it.date),
          view: views.find((v) => v.asset.id === it.assetId),
        }))
        .filter((r): r is { details: PayoutDetails; view: AssetView } => !!r.details && !!r.view),
    [items, data, views],
  );

  if (rows.length === 0) return null;

  const cur = data.settings.defaultCurrency;
  const total = rows.reduce((sum, r) => sum + r.details.amount, 0);
  const many = rows.length > 1;
  const date = rows[0].details.date;

  const decide = async (r: { details: PayoutDetails; view: AssetView }, action: 'keep' | 'wallet') => {
    if (r.details.locked) return;
    action === 'wallet' ? successBuzz() : actionBuzz();
    await recordPayout({
      assetId: r.details.assetId,
      date: r.details.date,
      action,
      amount: r.details.amount,
      currency: r.details.currency,
      comment: `Проценты: ${r.view.asset.title || r.view.instrument.name}`,
    });
    // Пока решены не все — шит оставляем открытым: человек пришёл разобрать
    // выплаты этого дня целиком.
    if (rows.every((x) => x === r || x.details.record)) router.back();
  };

  return (
    <View style={st.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={st.grabber} />

      <Text style={st.title}>Выплата процентов</Text>
      <Text style={st.period}>
        {many ? `${rows.length} ${pluralAccounts(rows.length)} · ` : ''}
        {formatDateShort(date)}
      </Text>
      {many ? (
        <Text style={st.total} numberOfLines={1} adjustsFontSizeToFit>
          +{formatMoney(total, { currency: cur, kopecks: 'hide' })}
        </Text>
      ) : null}

      {rows.map((r) => (
        <PayoutBlock key={r.details.assetId} row={r} compact={many} onDecide={decide} />
      ))}

      <Text style={st.hint}>
        Ничего не выбирать тоже можно — тогда проценты останутся на счёте. Передумать получится,
        пока не переложил в кошелёк.
      </Text>
    </View>
  );
}

function pluralAccounts(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'счёт';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'счёта';
  return 'счетов';
}

function PayoutBlock({
  row, compact, onDecide,
}: {
  row: { details: PayoutDetails; view: AssetView };
  compact: boolean;
  onDecide: (r: { details: PayoutDetails; view: AssetView }, action: 'keep' | 'wallet') => void;
}) {
  const { details, view } = row;
  const money = (v: number) => formatMoney(v, { currency: details.currency, kopecks: 'hide' });
  const name = view.asset.title || view.instrument.name;
  const chosen = details.record?.action;

  return (
    <View style={[st.block, compact && st.blockCompact]}>
      <View style={st.head}>
        <OrgLogo
          color={view.organization.color}
          logo={view.organization.logo}
          imageUri={view.organization.customImageUri}
          size={26}
          variant="bare"
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{name}</Text>
          <Text style={st.sub} numberOfLines={1}>
            с {formatDateShort(details.periodStart)} · налог {money(details.tax)}
          </Text>
        </View>
        <Text style={st.amount} numberOfLines={1}>+{money(details.amount)}</Text>
      </View>

      {details.locked ? (
        <View style={st.done}>
          <MaterialCommunityIcons name="check-circle-outline" size={18} color={tokens.semantic.positive} />
          <Text style={st.doneText}>Переложено в кошелёк</Text>
        </View>
      ) : (
        <View style={st.choices}>
          <ChoiceButton
            icon="piggy-bank-outline"
            label="Оставить"
            active={chosen === 'keep'}
            onPress={() => onDecide(row, 'keep')}
          />
          <ChoiceButton
            icon="wallet-outline"
            label="В кошелёк"
            active={false}
            onPress={() => onDecide(row, 'wallet')}
          />
        </View>
      )}
    </View>
  );
}

function ChoiceButton({
  icon, label, active, onPress,
}: {
  icon: string; label: string; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [st.choice, active && st.choiceActive, pressed && st.choicePressed]}
      onPress={onPress}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={18}
        color={active ? tokens.text.inverse : tokens.accent.base}
      />
      <Text style={[st.choiceText, active && st.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 24 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },

  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 22, letterSpacing: -0.2, color: tokens.text.primary },
  period: { fontSize: tokens.typography.label, lineHeight: 17, color: tokens.text.tertiary, marginTop: 4 },
  total: { fontSize: 32, lineHeight: 36, fontFamily: font.semibold, color: tokens.semantic.positive, letterSpacing: -0.6, marginTop: tokens.spacing.sm },

  block: {
    backgroundColor: hexToRgba(tokens.accent.base, 0.05),
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 14,
    marginTop: tokens.spacing.md,
  },
  blockCompact: { marginTop: tokens.spacing.tight },
  head: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  name: { fontFamily: font.semibold, fontSize: 16, lineHeight: 18, color: tokens.text.primary },
  sub: { fontSize: 12, lineHeight: 16, color: tokens.text.tertiary, marginTop: 2 },
  amount: { fontSize: 18, lineHeight: 22, fontFamily: font.semibold, color: tokens.semantic.positive },

  choices: { flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.md },
  choice: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.surface.white,
    borderWidth: 1, borderColor: hexToRgba(tokens.accent.base, 0.25),
    paddingVertical: tokens.spacing.tight,
  },
  choiceActive: { backgroundColor: tokens.accent.base, borderColor: tokens.accent.base },
  choicePressed: { opacity: 0.6 },
  choiceText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 16, color: tokens.accent.base },
  choiceTextActive: { color: tokens.text.inverse },

  done: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginTop: tokens.spacing.md },
  doneText: { flexShrink: 1, fontSize: 14, lineHeight: 18, color: tokens.text.secondary },

  hint: { fontSize: 12, lineHeight: 16, color: tokens.text.tertiary, marginTop: tokens.spacing.lg },
});
