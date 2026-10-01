import React, { useEffect, useMemo } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '@/state/DataContext';
import { payoutDetails, buildAssetViews } from '@/state/selectors';
import { getPayoutSheet } from '@/lib/payoutSheet';
import { OrgLogo } from '@/components/BankLogo';
import { actionBuzz, successBuzz } from '@/lib/haptics';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney } from '@/format';
import { formatDateShort } from '@/format/date';

/**
 * Выплата процентов: что набежало за период и что с этим делать.
 *
 * Банк в этот день причисляет проценты к тому же счёту, и дальше они тоже
 * приносят доход — это и есть «оставить», поведение по умолчанию. Но у многих
 * счетов надбавка действует только до определённой суммы, и всё сверх работает
 * по базовой ставке: тогда проценты выгоднее забрать. Выбор и есть смысл
 * этого экрана.
 *
 * Налог показываем справочно: по накопительному счёту банк его не удерживает,
 * он уходит в общий годовой расчёт на главной и в необлагаемый лимит.
 */
export default function PayoutSheet() {
  const cfg = getPayoutSheet();
  const { data, recordPayout } = useData();

  useEffect(() => {
    if (!cfg) router.back();
  }, [cfg]);

  const details = useMemo(
    () => (cfg ? payoutDetails(data, cfg.assetId, cfg.date) : null),
    [cfg, data],
  );
  const view = useMemo(
    () => (cfg ? buildAssetViews(data).find((v) => v.asset.id === cfg.assetId) : undefined),
    [cfg, data],
  );

  if (!cfg || !details || !view) return null;

  const cur = details.currency;
  const money = (v: number) => formatMoney(v, { currency: cur, kopecks: 'hide' });
  const name = view.asset.title || view.instrument.name;

  const decide = async (action: 'keep' | 'wallet') => {
    if (details.locked) return;
    action === 'wallet' ? successBuzz() : actionBuzz();
    await recordPayout({
      assetId: details.assetId,
      date: details.date,
      action,
      amount: details.amount,
      currency: cur,
      comment: `Проценты: ${name}`,
    });
    router.back();
  };

  const chosen = details.record?.action;

  return (
    <View style={st.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={st.grabber} />

      <View style={st.head}>
        <OrgLogo
          color={view.organization.color}
          logo={view.organization.logo}
          imageUri={view.organization.customImageUri}
          size={26}
          variant="bare"
        />
        <Text style={st.title} numberOfLines={1}>{name}</Text>
      </View>
      <Text style={st.period}>
        Проценты с {formatDateShort(details.periodStart)} по {formatDateShort(details.date)}
      </Text>

      <Text style={st.amount} numberOfLines={1} adjustsFontSizeToFit>
        +{money(details.amount)}
      </Text>

      <View style={st.panel}>
        <Row label="Налог" value={money(details.tax)} muted />
        <Row label="Чистыми" value={money(details.net)} strong />
        <Text style={st.taxNote}>
          Банк налог не удерживает — он уже учтён в необлагаемом лимите на главной.
        </Text>
      </View>

      {details.locked ? (
        <View style={st.done}>
          <MaterialCommunityIcons name="check-circle-outline" size={18} color={tokens.semantic.positive} />
          <Text style={st.doneText}>Переложено в кошелёк — решение уже не изменить</Text>
        </View>
      ) : (
        <>
          <Choice
            icon="piggy-bank-outline"
            title="Оставить на счёте"
            subtitle="Проценты лягут в тело и дальше тоже будут приносить доход"
            active={chosen === 'keep'}
            onPress={() => decide('keep')}
          />
          <Choice
            icon="wallet-outline"
            title="Переложить в кошелёк"
            subtitle="Уйдут в свободный капитал — так делают, когда ставка работает только до лимита"
            active={false}
            onPress={() => decide('wallet')}
          />
          <Text style={st.hint}>
            {chosen === 'keep'
              ? 'Сейчас выбрано «оставить». Передумать можно, пока не переложил в кошелёк.'
              : 'Ничего не выбирать тоже можно — тогда проценты останутся на счёте.'}
          </Text>
        </>
      )}
    </View>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={[st.rowValue, muted && st.rowMuted, strong && st.rowStrong]}>{value}</Text>
    </View>
  );
}

function Choice({
  icon, title, subtitle, active, onPress,
}: {
  icon: string; title: string; subtitle: string; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [st.choice, active && st.choiceActive, pressed && st.choicePressed]}
      onPress={onPress}
    >
      <View style={[st.choiceIcon, active && st.choiceIconActive]}>
        <MaterialCommunityIcons name={icon as never} size={20} color={active ? tokens.text.inverse : tokens.accent.base} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.choiceTitle}>{title}</Text>
        <Text style={st.choiceSub}>{subtitle}</Text>
      </View>
      {active ? (
        <MaterialCommunityIcons name="check" size={18} color={tokens.accent.base} />
      ) : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 24 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },

  head: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  title: { flexShrink: 1, fontFamily: font.semibold, fontSize: 20, lineHeight: 22, letterSpacing: -0.2, color: tokens.text.primary },
  period: { fontSize: tokens.typography.label, lineHeight: 17, color: tokens.text.tertiary, marginTop: 4 },
  amount: { fontSize: 34, lineHeight: 38, fontFamily: font.semibold, color: tokens.semantic.positive, letterSpacing: -0.7, marginTop: tokens.spacing.md },

  panel: {
    backgroundColor: hexToRgba(tokens.accent.base, 0.05),
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 14,
    marginTop: tokens.spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  rowLabel: { fontSize: 15, lineHeight: 17, color: tokens.text.secondary },
  rowValue: { fontSize: 15, lineHeight: 17, fontWeight: '500', color: tokens.text.primary },
  rowMuted: { color: tokens.value.tax },
  rowStrong: { fontSize: 17, lineHeight: 19, fontWeight: '700' },
  taxNote: { fontSize: 12, lineHeight: 16, color: tokens.text.tertiary, marginTop: 8 },

  choice: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.surface.hairline,
    paddingHorizontal: tokens.spacing.lg, paddingVertical: 14,
    marginTop: tokens.spacing.md,
  },
  choiceActive: { borderColor: tokens.accent.base, backgroundColor: hexToRgba(tokens.accent.base, 0.06) },
  choicePressed: { opacity: 0.6 },
  choiceIcon: {
    width: 38, height: 38, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: hexToRgba(tokens.accent.base, 0.12),
  },
  choiceIconActive: { backgroundColor: tokens.accent.base },
  choiceTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 18, color: tokens.text.primary },
  choiceSub: { fontSize: 13, lineHeight: 16, color: tokens.text.tertiary, marginTop: 3 },

  done: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm,
    marginTop: tokens.spacing.lg,
  },
  doneText: { flexShrink: 1, fontSize: 14, lineHeight: 18, color: tokens.text.secondary },
  hint: { fontSize: 12, lineHeight: 16, color: tokens.text.tertiary, marginTop: tokens.spacing.md },
});
