import React, { useMemo } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/state/DataContext';
import { analyticsSummary } from '@/state/selectors';
import { limitEta, limitEtaWhen } from '@/lib/taxLimit';
import { tokens, font } from '@/theme';
import { formatMoney } from '@/format';

/**
 * Разбивка блока «Необлагаемый лимит» (тап по карточке на главной). Две
 * группы, каждая складывается сама по себе: ФАКТ (лимит − заработано =
 * осталось) и ПРОГНОЗ «если темп сохранится» (когда кончится → на сколько
 * превысим → сколько налога). Раньше прогнозная строка стояла внутри
 * фактического столбика, и он не сходился с итогом. Ниже — то, что в лимит
 * не входит: налог с него удерживают площадки.
 */
export default function TaxBreakdown() {
  const { data } = useData();
  const s = useMemo(() => analyticsSummary(data), [data]);
  const cur = data.settings.defaultCurrency;
  const money = (v: number) => formatMoney(v, { currency: cur, kopecks: 'hide' });

  const year = new Date().getFullYear();
  const limit = data.params.taxFreeLimit;
  const over = s.selfAccrued > limit;
  const remainNow = Math.max(0, limit - s.selfAccrued);
  const eta = limitEta(remainNow, s.selfIncomePerDay, over);
  const overYear = s.selfAnnual - limit;
  const withheldLeft = Math.max(0, s.taxAccruedWithheld - s.taxPaidYear);
  const hasWithheld = s.taxAccruedWithheld > 0.5 || s.taxPaidYear > 0.5;
  const hasForecast = !!eta || overYear > 0.5;

  return (
    <View style={st.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={st.grabber} />
      <Text style={st.title}>Необлагаемый лимит</Text>

      <Row label={`Лимит на ${year}`} value={money(limit)} />
      <Row label="Заработано по вкладам" value={`−${money(s.selfAccrued)}`} indent />
      <View style={st.divider} />
      {over ? (
        <>
          <Row label="Сверх лимита сейчас" value={money(s.selfAccrued - limit)} strong color={tokens.value.outflow} />
          <Row label={`Налог в ФНС до 1 дек ${year + 1}`} value={money(s.taxAccruedSelf)} />
        </>
      ) : (
        <Row label="Осталось сейчас" value={money(remainNow)} strong />
      )}

      {hasForecast ? (
        <>
          <Text style={st.group}>Если темп сохранится</Text>
          {eta ? <Row label="~ лимит кончится" value={limitEtaWhen(eta)} color={tokens.value.forecast} /> : null}
          {overYear > 0.5 ? (
            <>
              <Row label="~ сверх лимита за год" value={money(overYear)} color={tokens.value.forecast} />
              <Row label={`~ налог в ФНС до 1 дек ${year + 1}`} value={money(s.taxYearSelf)} color={tokens.value.forecast} />
            </>
          ) : null}
        </>
      ) : null}

      {hasWithheld ? (
        <>
          <Text style={st.group}>Не входит в лимит</Text>
          <Row label="Уже удержано" value={money(s.taxPaidYear)} />
          <Row label="Ещё удержат" value={money(withheldLeft)} color={tokens.value.forecast} />
        </>
      ) : null}

      <Text style={st.note}>
        Лимит — 1 млн ₽ × максимальная ключевая ставка года, с 1 января считается заново. Налог сверх
        него с вкладов банк не удерживает — ФНС пришлёт уведомление. С того, что в лимит не входит,
        налог удерживают при выводе, делать ничего не нужно.
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
