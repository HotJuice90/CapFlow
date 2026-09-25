import type {
  Asset,
  CalcParams,
  CapitalizationMode,
  DerivedValues,
  FinancialInstrument,
  PayoutPeriod,
} from '@/domain/types';
import { calcAssetTax } from './tax';
import { addDays, clamp, dayIndex, daysInMonth, daysInYear, diffDays, parseLocal } from './dayCount';

/** Версия движка — пишется в Snapshot, чтобы история не «плыла» при смене формул. */
export const ENGINE_VERSION = '1.1.0';

export function periodsPerYear(period: PayoutPeriod | undefined): number {
  switch (period) {
    case 'daily': return 365;
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semiannual': return 2;
    case 'annual': return 1;
    default: return 12; // разумный дефолт для капитализации
  }
}

interface BalancePoint {
  date: string; // ISO 'YYYY-MM-DD'
  amount: number;
  /** см. BalanceAdjustment.isCorrection — точка открытия им никогда не бывает */
  isCorrection?: boolean;
}

interface RatePoint {
  date: string; // ISO 'YYYY-MM-DD'
  rate: number; // годовая ставка, %
}

/**
 * Точки изменения баланса (открытие + пополнения/снятия), отсортированные по дате.
 * Открытие — всегда первая точка, даже если корректировок нет.
 */
function balanceTimeline(asset: Asset): BalancePoint[] {
  const points: BalancePoint[] = [
    { date: asset.openDate, amount: asset.amount },
    ...(asset.balanceAdjustments ?? []).map((a) => ({ date: a.date, amount: a.amount, isCorrection: a.isCorrection })),
  ];
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Точки изменения СТАВКИ (открытие + история изменений) — тот же принцип, что
 * и у баланса, только банк меняет не сумму, а процент (актуально для НС).
 */
function rateTimeline(asset: Asset): RatePoint[] {
  const points: RatePoint[] = [
    { date: asset.openDate, rate: asset.rate },
    ...(asset.rateAdjustments ?? []).map((r) => ({ date: r.date, rate: r.rate })),
  ];
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Ставка, действующая на дату `at` (последняя точка ставки не позже `at`). */
/** То же, что rateAt, но по индексам дней — для горячего прохода walkAccrual. */
function rateAtIdx(timeline: { idx: number; rate: number }[], at: number): number {
  let cur = timeline[0].rate;
  for (const p of timeline) {
    if (p.idx <= at) cur = p.rate;
    else break;
  }
  return cur;
}

function rateAt(timeline: RatePoint[], at: string | Date): number {
  let cur = timeline[0].rate;
  for (const p of timeline) {
    if (diffDays(p.date, at) >= 0) cur = p.rate;
    else break;
  }
  return cur;
}

/**
 * Единый проход по ОБЪЕДИНЁННЫМ границам баланса, ставки и (при капитализации)
 * периодов капитализации — считает и текущее тело счёта, и накопленный доход
 * за один проход, посегментно.
 *
 * На дате явной корректировки баланса тело ПЕРЕЗАПИСЫВАЕТСЯ — это факт из банка,
 * он главнее любой модельной оценки роста. На дате смены только ставки (без
 * корректировки баланса) тело продолжает расти как считала модель — капитализация
 * не прерывается, просто дальше по новой ставке. Простой процент (не капитализация)
 * не растит тело вовсе — между сегментами меняется только применяемая ставка.
 *
 * Обычная корректировка (пополнение/снятие) — реальное движение денег: доход за
 * предыдущий отрезок всё равно считается по формуле (ставка × дни), просто на
 * старом теле. А вот `isCorrection` — это НЕ движение денег, а «модель разошлась
 * с фактом банка» (см. BalanceAdjustment.isCorrection): для такой точки доход за
 * ПРЕДЫДУЩИЙ отрезок берём как факт (новое тело минус старое), а не по формуле —
 * иначе «Начислено» продолжает копить доход, которого по факту не было.
 *
 * Периоды капитализации отсчитываются ФИКСИРОВАННЫМ шагом от даты открытия —
 * независимо от того, где внутри периода банк менял ставку. Если считать
 * «целые периоды» на каждом отрезке между чекпоинтами баланса/ставки отдельно
 * (как было раньше), то при частых изменениях ставки (обычное дело у
 * накопительных счетов) почти каждый отрезок короче одного периода — и
 * `Math.floor` на нём даёт 0 капитализированных периодов, доход молча
 * теряется. Поэтому проценты внутри периода копятся как простые (в `pending`,
 * на стартовом теле периода) и сворачиваются в тело ровно на границе периода —
 * так же, как это делает банк.
 */
/**
 * Тот же проход, но с ВЫБОРКОЙ в нескольких точках сразу (даты по возрастанию).
 *
 * Нужен там, где раньше считали «с нуля на каждый день»: история капитала и
 * прогресс целей звали calculate на каждый день периода, а каждый такой вызов
 * сам проходит всю жизнь актива от открытия — получается квадрат по дням. При
 * ежедневной капитализации на трёхлетнем счёте это десятки секунд.
 *
 * Разрезать сегмент лишней точкой безопасно: внутри сегмента ставка и тело
 * постоянны, доход копится линейно, а сворачивание в тело происходит только на
 * границах периодов капитализации — их набор от выборки не зависит.
 */
function walkAccrualAt(
  balance: BalancePoint[],
  rates: RatePoint[],
  mode: CapitalizationMode,
  payout: PayoutPeriod | undefined,
  samples: number[],
): { balanceNow: number; accrued: number }[] {
  const lastIdx = samples[samples.length - 1];
  const bal = balance.map((p) => ({ idx: dayIndex(p.date), amount: p.amount, isCorrection: p.isCorrection }));
  const rts = rates.map((p) => ({ idx: dayIndex(p.date), rate: p.rate }));

  const balanceAt = new Map(bal.map((p) => [p.idx, p.amount]));
  const correctionAt = new Set(bal.filter((p) => p.isCorrection).map((p) => p.idx));

  const boundarySet = new Set<number>();
  if (mode === 'capitalize') {
    const periodDays = 365 / periodsPerYear(payout);
    const openIdx = bal[0].idx;
    for (let k = 1; ; k++) {
      const d = openIdx + Math.round(k * periodDays);
      if (d > lastIdx) break; // граница за пределами последней выборки — дальше не нужны
      boundarySet.add(d);
      if (k > 100_000) break; // защита от зацикливания на аномальных данных
    }
  }

  const checkpoints = [
    ...new Set([...bal.map((p) => p.idx), ...rts.map((p) => p.idx), ...boundarySet, ...samples]),
  ].sort((a, b) => a - b);

  let principal = bal[0].amount;
  let pending = 0; // накоплено внутри текущего периода капитализации, ещё не в теле
  let accrued = 0;

  const out: { balanceNow: number; accrued: number }[] = [];
  let sampleAt = 0;
  const flushSamples = (upTo: number) => {
    while (sampleAt < samples.length && samples[sampleAt] <= upTo) {
      out.push({ balanceNow: principal + pending, accrued });
      sampleAt++;
    }
  };

  for (let i = 0; i < checkpoints.length; i++) {
    const date = checkpoints[i];
    if (date > lastIdx) continue; // граница ещё не наступила — не учитываем вовсе
    const explicitAmount = balanceAt.get(date);
    if (explicitAmount !== undefined) {
      // Факт из банка перекрывает и не свёрнутые в тело проценты модели.
      principal = explicitAmount;
      pending = 0;
    }
    // Состояние на саму точку фиксируем ДО начисления за следующий отрезок:
    // на дату X доход накоплен по X, а не по X включительно вперёд.
    flushSamples(date);

    const daysToLast = lastIdx - date;
    if (daysToLast <= 0) continue; // граница ровно на последней выборке — сегмент нулевой длины
    const next = checkpoints[i + 1];
    const daysToNext = next !== undefined ? next - date : Infinity;
    const segmentDays = Math.min(daysToLast, daysToNext);
    if (segmentDays <= 0) continue;
    const segmentEndsAtNext = segmentDays === daysToNext && next !== undefined;

    // Отрезок упирается ровно в следующую точку-ИСПРАВЛЕНИЕ (не в «сейчас» раньше
    // срока) — заменяем модельный доход на фактическую разницу тела.
    const nextAmount = next !== undefined ? balanceAt.get(next) : undefined;
    if (nextAmount !== undefined && segmentEndsAtNext && correctionAt.has(next)) {
      accrued += nextAmount - (principal + pending);
      principal = nextAmount;
      pending = 0;
      continue;
    }

    const r = rateAtIdx(rts, date);
    if (mode === 'capitalize') {
      const growth = principal * (r / 100) * (segmentDays / 365);
      pending += growth;
      accrued += growth;
      // Отрезок ровно упирается в границу периода капитализации — сворачиваем.
      if (segmentEndsAtNext && boundarySet.has(next)) {
        principal += pending;
        pending = 0;
      }
    } else {
      accrued += principal * (r / 100) * (segmentDays / 365);
    }
  }

  flushSamples(lastIdx);
  return out;
}

function walkAccrual(
  balance: BalancePoint[],
  rates: RatePoint[],
  mode: CapitalizationMode,
  payout: PayoutPeriod | undefined,
  now: string | Date,
): { balanceNow: number; accrued: number } {
  return walkAccrualAt(balance, rates, mode, payout, [dayIndex(now)])[0];
}

/** Точка истории актива: то же, что даёт calculate, но только «деньги». */
export interface AccrualPoint {
  balanceNow: number;
  accrued: number;
  currentValue: number;
}

/**
 * Значения актива СРАЗУ на список дат (по возрастанию) — за один-два прохода
 * вместо вызова calculate на каждую дату.
 *
 * Считает ровно то же, что calculate: у срочного актива начисление
 * останавливается на дате окончания, у бессрочного идёт дальше; currentValue
 * при капитализации это тело, без неё — тело плюс начисленное рядом.
 *
 * Даты РАНЬШЕ открытия допустимы и дают нулевой доход с телом на открытии —
 * вызывающий код такие дни обычно отбрасывает сам.
 */
export function accrualSeries(
  asset: Asset,
  instrument: FinancialInstrument,
  dates: (string | Date)[],
): AccrualPoint[] {
  if (dates.length === 0) return [];
  const mode: CapitalizationMode = asset.capitalization ?? instrument.capitalization ?? 'none';
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const timeline = balanceTimeline(asset);
  const rates = rateTimeline(asset);

  const idx = dates.map((d) => dayIndex(d));
  const balancePts = walkAccrualAt(timeline, rates, mode, payout, idx);

  const endIdx = asset.endDate ? dayIndex(asset.endDate) : undefined;
  const needsClamp = endIdx !== undefined && idx[idx.length - 1] > endIdx;
  const accrualPts = needsClamp
    ? walkAccrualAt(timeline, rates, mode, payout, idx.map((i) => Math.min(i, endIdx)))
    : balancePts;

  return idx.map((_, k) => {
    const balanceNow = balancePts[k].balanceNow;
    const accrued = accrualPts[k].accrued;
    return { balanceNow, accrued, currentValue: mode === 'capitalize' ? balanceNow : balanceNow + accrued };
  });
}

/**
 * Главная функция движка. Возвращает производные значения для актива.
 * `now` — текущий момент (по умолчанию устройство).
 */
export function calculate(
  asset: Asset,
  instrument: FinancialInstrument,
  params: CalcParams,
  now: string | Date = new Date(),
  /** сколько необлагаемого лимита уже занято другими активами портфеля (см. buildAssetViews) */
  limitAlreadyUsed = 0,
): DerivedValues {
  const mode: CapitalizationMode =
    asset.capitalization ?? instrument.capitalization ?? 'none';
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const timeline = balanceTimeline(asset);
  const rates = rateTimeline(asset);
  // Ставка «на сейчас» — из истории изменений, а не открытия: банк мог поменять
  // ставку на счёте, дальнейший прогноз должен идти уже по актуальной.
  const currentRate = rateAt(rates, now);
  const effectiveRate = currentRate / 100;

  const { balanceNow, accrued: accruedToNow } = walkAccrual(timeline, rates, mode, payout, now);
  // Актив, который ещё не открылся, НЕ приносит дохода. Без этой проверки
  // опечатка в дате открытия (или запись «на будущее») молча добавляла в
  // «Сегодня принесёт» доход по несуществующему вкладу — при том, что
  // incomeRunRateOn такие активы пропускает, и «сегодня» со «средним»
  // начинали считаться по разным наборам активов.
  const started = diffDays(asset.openDate, now) >= 0;
  const incomePerDay = started ? (balanceNow * effectiveRate) / daysInYear(now) : 0;
  // Прогноз вперёд (месяц/год) — от ТЕКУЩЕГО баланса, а не от суммы открытия:
  // при капитализации проценты уже легли на баланс и сами приносят доход.
  const annualRunRate = started ? balanceNow * effectiveRate : 0;
  // Месяц — по факту дней в ТЕКУЩЕМ календарном месяце (как считают банки:
  // прогноз «за июль» = дневной доход × 31, а не среднемесячное /12).
  const incomePerMonth = incomePerDay * daysInMonth(now);
  const premiumToKeyRate = currentRate - params.keyRate;

  // Налог на месяц: считаем эффективную (после общего лимита) годовую ставку
  // налога и переносим её на месячный доход — та же логика, что и «доход».
  const annualTax = calcAssetTax(annualRunRate, params, limitAlreadyUsed, asset.taxWithheldByBank);
  const effectiveTaxRate = annualRunRate > 0 ? annualTax / annualRunRate : 0;
  const monthlyTax = incomePerMonth * effectiveTaxRate;
  const monthlyNet = incomePerMonth - monthlyTax;

  if (instrument.behavior === 'term' && asset.endDate) {
    const termDays = Math.max(0, diffDays(asset.openDate, asset.endDate));
    const elapsedDays = clamp(diffDays(asset.openDate, now), 0, termDays);
    const daysRemaining = Math.max(0, diffDays(now, asset.endDate));
    const termProgress = termDays > 0 ? elapsedDays / termDays : 0;

    // Простой процент (по умолчанию): доход линеен по дням, по текущей ставке.
    const incomeTotalTerm = asset.amount * effectiveRate * (termDays / 365);
    // «Уже заработано» — посегментно, чтобы честно учитывать пополнения/снятия И смену ставки.
    const accrualNow = diffDays(asset.openDate, now) > termDays ? asset.endDate : now;
    const { accrued: earnedSoFar } = walkAccrual(timeline, rates, mode, payout, accrualNow);
    const remainingToEarn = Math.max(0, incomeTotalTerm - earnedSoFar);

    // Налог считается на доход всего срока (проценты по вкладу облагаются в год выплаты).
    const tax = calcAssetTax(incomeTotalTerm, params, limitAlreadyUsed, asset.taxWithheldByBank);
    const net = incomeTotalTerm - tax;
    const finalAmount = asset.amount + net;

    return {
      balanceNow,
      // При капитализации начисленное уже в теле; при простом % — лежит рядом.
      currentValue: mode === 'capitalize' ? balanceNow : balanceNow + earnedSoFar,
      incomePerDay,
      incomePerMonth,
      incomeTotalTerm,
      accrued: earnedSoFar,
      tax,
      net,
      monthlyTax,
      monthlyNet,
      finalAmount,
      earnedSoFar,
      remainingToEarn,
      daysRemaining,
      termProgress,
      currentRate,
      premiumToKeyRate,
    };
  }

  // Бессрочный (накопительный счёт): нет срока/прогресса. Тот же `now`, что и
  // для balanceNow выше — accrued уже посчитан в том же проходе, второй раз не считаем.
  const earnedSoFar = accruedToNow;
  const tax = calcAssetTax(earnedSoFar, params, limitAlreadyUsed, asset.taxWithheldByBank);
  const net = earnedSoFar - tax;

  return {
    balanceNow,
    // При капитализации начисленное уже в теле; при простом % — лежит рядом.
    currentValue: mode === 'capitalize' ? balanceNow : balanceNow + earnedSoFar,
    incomePerDay,
    incomePerMonth,
    accrued: earnedSoFar,
    tax,
    net,
    monthlyTax,
    monthlyNet,
    earnedSoFar,
    currentRate,
    premiumToKeyRate,
    // Прогноз «если ничего не менять»
    forecastNextMonth: incomePerMonth,
    forecastNextYear: annualRunRate,
  };
}
