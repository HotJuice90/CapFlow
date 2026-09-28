import React, { useMemo } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '@/state/DataContext';
import { analyticsSummary } from '@/state/selectors';
import { limitEta, limitEtaRow, limitEtaUntil } from '@/lib/taxLimit';
import { tokens, font, hexToRgba } from '@/theme';
import { formatMoney, formatPercent } from '@/format';

/**
 * Разбивка блока «Необлагаемый лимит» (тап по карточке на главной).
 *
 * Каждая плашка — отдельный смысл, со своей иконкой и оттенком: факт (что уже
 * использовано), прогноз (что будет, если темп сохранится), доход мимо лимита
 * (налог удержат за тебя) и справка. Раньше всё шло одним потоком, и прогнозная
 * строка стояла внутри фактического столбика — он не сходился с итогом.
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
  const etaRow = eta ? limitEtaRow(eta) : null;
  const overYear = s.selfAnnual - limit;
  const withheldLeft = Math.max(0, s.taxAccruedWithheld - s.taxPaidYear);
  const hasWithheld = s.taxAccruedWithheld > 0.5 || s.taxPaidYear > 0.5;
  const hasForecast = !!etaRow || overYear > 0.5;

  return (
    <View style={st.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={st.grabber} />
      <Text style={st.title}>Необлагаемый лимит</Text>
      <Text style={st.subtitle}>Лимит на процентный доход в {year} году</Text>

      {/* Факт. Герой тот же, что на карточке главной, — чтобы шит открывался
          «продолжением» числа, а не новой сущностью. */}
      <View style={[st.panel, { backgroundColor: hexToRgba(tokens.accent.base, 0.05) }]}>
        <Text style={st.heroLabel}>{over ? 'Сверх лимита' : 'Осталось без налога'}</Text>
        <Text style={[st.hero, over && { color: tokens.value.outflow }]} numberOfLines={1} adjustsFontSizeToFit>
          {money(over ? s.selfAccrued - limit : remainNow)}
        </Text>
        {eta && !over ? <Text style={st.heroHint}>{limitEtaUntil(eta)}</Text> : null}
        <View style={[st.sep, { backgroundColor: hexToRgba(tokens.accent.base, 0.12) }]} />
        <View style={st.cols}>
          <Col label="Использовано" value={money(s.selfAccrued)} />
          <View style={[st.colSep, { backgroundColor: hexToRgba(tokens.accent.base, 0.12) }]} />
          <Col label={`Лимит на ${year} год`} value={money(limit)} />
        </View>
      </View>

      {hasForecast ? (
        <Panel
          tint={tokens.semantic.warning}
          icon="calendar-month-outline"
          title="Прогноз на конец года"
        >
          {etaRow ? <Col label={etaRow.label} value={etaRow.value} small /> : null}
          {overYear > 0.5 ? (
            <>
              <View style={[st.colSep, { backgroundColor: hexToRgba(tokens.semantic.warning, 0.2) }]} />
              <Col label="~ сверх лимита за год" value={money(overYear)} />
              <View style={[st.colSep, { backgroundColor: hexToRgba(tokens.semantic.warning, 0.2) }]} />
              <Col
                label="~ налог в ФНС"
                value={money(s.taxYearSelf)}
                note={`по ставке ${formatPercent(data.params.taxRate)}`}
              />
            </>
          ) : null}
        </Panel>
      ) : null}

      {hasWithheld ? (
        <Panel
          tint={tokens.value.tax}
          icon="bank-outline"
          title="Налог удержит банк (не входит в лимит)"
        >
          <Col label="Уже удержано" value={money(s.taxPaidYear)} note={`Удержано с начала ${year} года.`} />
          <View style={[st.colSep, { backgroundColor: hexToRgba(tokens.value.tax, 0.18) }]} />
          <Col label="Ещё удержат" value={money(withheldLeft)} note="С того, что уже начислено, — при выводе." />
        </Panel>
      ) : null}

      <Panel tint={tokens.semantic.positive} icon="percent" title="Как это работает?" column>
        <Text style={st.note}>
          Лимит — 1 млн ₽ × максимальная ключевая ставка года, сейчас это {money(limit)}. С 1 января
          считается заново. Процентный доход сверх лимита облагается НДФЛ {formatPercent(data.params.taxRate)}:
          банк его не удерживает, ФНС пришлёт уведомление. Налог с дохода, который в лимит не входит,
          удерживают автоматически при выводе.
        </Text>
      </Panel>
    </View>
  );
}

/** Плашка со своим оттенком, иконкой и заголовком. */
function Panel({
  tint,
  icon,
  title,
  column,
  children,
}: {
  tint: string;
  icon: string;
  title: string;
  column?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[st.panel, { backgroundColor: hexToRgba(tint, 0.08) }]}>
      <View style={st.head}>
        <View style={[st.iconBox, { backgroundColor: hexToRgba(tint, 0.16) }]}>
          <MaterialCommunityIcons name={icon as never} size={16} color={tint} />
        </View>
        <Text style={st.headTitle} numberOfLines={2}>{title}</Text>
      </View>
      <View style={column ? undefined : st.cols}>{children}</View>
    </View>
  );
}

/** Колонка «подпись → значение (→ сноска)». */
function Col({
  label,
  value,
  note,
  small,
}: {
  label: string;
  value: string;
  note?: string;
  small?: boolean;
}) {
  return (
    <View style={st.col}>
      <Text style={st.colLabel} numberOfLines={2}>{label}</Text>
      <Text style={[st.colValue, small && st.colValueSmall]} numberOfLines={2}>{value}</Text>
      {note ? <Text style={st.colNote} numberOfLines={3}>{note}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  sheet: { backgroundColor: tokens.surface.white, paddingHorizontal: tokens.spacing.sheet, paddingTop: 8, paddingBottom: 28 },
  grabber: { width: 40, height: 4, borderRadius: tokens.radius.grabber, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 22, letterSpacing: -0.2, color: tokens.text.primary },
  subtitle: { fontSize: tokens.typography.label, lineHeight: 17, color: tokens.text.tertiary, marginTop: 4, marginBottom: tokens.spacing.lg },

  panel: { borderRadius: tokens.radius.lg, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg, marginBottom: tokens.spacing.tight },
  head: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
  iconBox: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flexShrink: 1, fontSize: tokens.typography.label, lineHeight: 17, fontWeight: '600', color: tokens.text.primary },

  heroLabel: { fontSize: tokens.typography.label, lineHeight: 17, color: tokens.text.secondary },
  hero: { fontSize: 30, lineHeight: 34, fontWeight: '700', color: tokens.text.primary, letterSpacing: -0.6, marginTop: 2 },
  heroHint: { fontSize: tokens.typography.caption, lineHeight: 16, color: tokens.value.forecast, marginTop: 2 },
  sep: { height: 1, marginVertical: tokens.spacing.md },

  cols: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  colSep: { width: 1, alignSelf: 'stretch', marginHorizontal: tokens.spacing.md },
  colLabel: { fontSize: tokens.typography.hint, lineHeight: 15, color: tokens.text.tertiary },
  colValue: { fontSize: 17, lineHeight: 21, fontWeight: '600', color: tokens.text.primary, marginTop: 3 },
  colValueSmall: { fontSize: 15, lineHeight: 19 },
  colNote: { fontSize: 12, lineHeight: 15, color: tokens.text.tertiary, marginTop: 4 },

  note: { fontSize: 13, lineHeight: 18, color: tokens.text.secondary },
});
