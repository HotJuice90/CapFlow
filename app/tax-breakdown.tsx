import React, { useMemo } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/state/DataContext';
import { analyticsSummary } from '@/state/selectors';
import { tokens, font } from '@/theme';
import { formatMoney } from '@/format';

/**
 * Разбивка налогового блока главной (по тапу на карточку). Сама карточка
 * держит одно число и бар — всё, из чего они складываются, живёт здесь,
 * столбиком «лимит − заработано − ~ ещё до конца года = остаток», по рефу
 * Robinhood «Available credit». Налог площадок — отдельной группой: он к
 * лимиту отношения не имеет, его удержат сами.
 */
export default function TaxBreakdown() {
  const { data } = useData();
  const s = useMemo(() => analyticsSummary(data), [data]);
  const cur = data.settings.defaultCurrency;
  const money = (v: number) => formatMoney(v, { currency: cur, kopecks: 'hide' });

  const year = new Date().getFullYear();
  const limit = data.params.taxFreeLimit;
  const ahead = Math.max(0, s.selfAnnual - s.selfAccrued);
  const remainNow = Math.max(0, limit - s.selfAccrued);
  const remainEnd = limit - s.selfAnnual;
  const over = s.selfAccrued > limit;
  const withheldLeft = Math.max(0, s.taxAccruedWithheld - s.taxPaidYear);
  const hasWithheld = s.taxAccruedWithheld > 0.5 || s.taxPaidYear > 0.5;

  return (
    <View style={st.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={st.grabber} />
      <Text style={st.title}>Налог за {year}</Text>

      <Row label="Необлагаемый лимит" value={money(limit)} />
      <Row label="Заработано по вкладам" value={`−${money(s.selfAccrued)}`} indent />
      {ahead > 0.5 ? (
        <Row label="~ ещё до 31 декабря" value={`−${money(ahead)}`} indent color={tokens.value.forecast} />
      ) : null}
      <View style={st.divider} />

      {over ? (
        <Row label="К доплате в ФНС сейчас" value={money(s.taxAccruedSelf)} strong color={tokens.value.outflow} />
      ) : (
        <Row label="Осталось без налога сейчас" value={money(remainNow)} strong />
      )}
      {ahead > 0.5 ? (
        remainEnd >= 0 ? (
          <Row label="~ останется к концу года" value={money(remainEnd)} color={tokens.value.forecast} />
        ) : (
          <Row label="~ к доплате за год" value={money(s.taxYearSelf)} color={tokens.value.forecast} />
        )
      ) : null}

      {hasWithheld ? (
        <>
          <Text style={st.group}>Не входит в лимит — налог удержат автоматически</Text>
          <Row label="Уже удержано" value={money(s.taxPaidYear)} />
          <Row label="Ещё удержат" value={money(withheldLeft)} color={tokens.value.tax} />
        </>
      ) : null}

      <Text style={st.note}>
        Лимит — 1 млн ₽ × максимальная ключевая ставка года. Налог сверх него с вкладов банк не
        удерживает: ФНС пришлёт уведомление, заплатить до 1 декабря {year + 1}. С продуктов, где
        налог удерживает площадка, делать ничего не нужно.
      </Text>
    </View>
  );
}

function Row({
  label,
  value,
  indent,
  strong,
  color,
}: {
  label: string;
  value: string;
  indent?: boolean;
  strong?: boolean;
  color?: string;
}) {
  return (
    <View style={[st.row, indent && st.rowIndent]}>
      <Text style={[st.label, strong && st.labelStrong]} numberOfLines={1}>{label}</Text>
      <Text style={[st.value, strong && st.valueStrong, color ? { color } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 24 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 22, letterSpacing: -0.2, color: tokens.text.primary, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 7 },
  rowIndent: { paddingLeft: 14 },
  label: { flexShrink: 1, fontSize: 15, lineHeight: 17, color: tokens.text.secondary },
  labelStrong: { fontWeight: '600', color: tokens.text.primary },
  value: { fontSize: 15, lineHeight: 17, fontWeight: '500', color: tokens.text.primary },
  valueStrong: { fontSize: 17, lineHeight: 19, fontWeight: '700' },
  divider: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: 8 },
  group: { fontFamily: font.semibold, fontSize: 15, lineHeight: 17, color: tokens.text.primary, marginTop: 20, marginBottom: 4 },
  note: { fontSize: 13, lineHeight: 18, color: tokens.text.tertiary, marginTop: 18 },
});
