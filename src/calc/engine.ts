import type {
  Asset,
  BalanceAdjustment,
  CalcParams,
  CapitalizationMode,
  DerivedValues,
  FinancialInstrument,
  PayoutPeriod,
} from '@/domain/types';
import { calcAssetTax, DEPOSIT_TAX_EXEMPT_YEARS } from './tax';
import { addDays, clamp, dayIndex, daysInMonth, daysInYear, diffDays, parseLocal } from './dayCount';

/** Версия движка — пишется в Snapshot, чтобы история не «плыла» при смене формул. */
export const ENGINE_VERSION = '1.2.0';

/**
 * Годовой сегмент: кусок жизни срочного актива внутри одного календарного года.
 *
 * Нужен потому, что срок вклада больше не укладывается в год: вклад с 2026-07-01
 * по 2027-02-01 живёт в двух налоговых периодах, а налог считается по году. При
 * этом `incomeTotalTerm` остаётся «весь срок одной суммой» — его показывает
 * плитка «придёт …», где человек ждёт одно число.
 */
export interface YearSegment {
  year: number;
  /** Окно внутри года (ISO), `to` — исключающая граница: 1 января следующего
   *  года, у последнего сегмента — день после окончания. */
  from: string;
  to: string;
  /** Доход этого года ПО ВЫПЛАТАМ (налоговая база по НК): paidIncomeSeries на
   *  границах окна — та же база, что в computeTaxYearRecord и налоге календаря. */
  income: number;
  /** Год уже закончился — доход в нём ФАКТ, а не прогноз. */
  past: boolean;
  /** Год идёт сейчас — часть дохода факт, часть прогноз. */
  current: boolean;
  /** Налог этого года: доход сегмента сверх необлагаемого лимита ЭТОГО года.
   *  Заполняет calculate (yearSegments сам по себе параметров налога не знает). */
  tax?: number;
  /** Лимит года ещё не известен (год не начался) и взят по ТЕКУЩЕЙ ключевой
   *  ставке — UI подписывает «~ по текущей ставке». С началом года пересчитается. */
  limitByCurrentRate?: boolean;
}

/**
 * Налоговый контекст по годам для calculate — нужен только срочным с
 * переходом через год. Ключ — календарный год.
 *  - `limitUsedByYear`: сколько лимита года уже заняли другие активы портфеля;
 *  - `limitForYear`: необлагаемый лимит года (для прошедших — по истории ключевой).
 * Чего нет в контексте, движок досчитывает сам: текущий год — `params.taxFreeLimit`
 * и `limitAlreadyUsed`, будущий — 1 млн × `params.keyRate`, занято — 0.
 */
export interface TaxYearsContext {
  limitUsedByYear?: Record<number, number>;
  limitForYear?: Record<number, number>;
}

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
  /** см. BalanceAdjustment.kind */
  kind?: 'body' | 'interest';
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
    ...(asset.balanceAdjustments ?? []).map((a) => ({
      date: a.date, amount: a.amount, isCorrection: a.isCorrection, kind: a.kind,
    })),
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
/** Порог суммы и ставка сверх него (см. Asset.rateCapAmount). */
export interface RateTier {
  cap: number;
  rateAbove: number;
}

/** Порог из актива — только если задан целиком, иначе ступеньки нет. */
function tierOf(asset: Asset): RateTier | undefined {
  const cap = asset.rateCapAmount;
  const rateAbove = asset.rateAboveCap;
  if (cap === undefined || rateAbove === undefined || cap <= 0) return undefined;
  return { cap, rateAbove };
}

/**
 * Доход за ГОД на данное тело: до порога — основная ставка, сверх — своя.
 * Без порога это обычное «тело × ставка», поэтому вызывать можно везде.
 */
function annualYield(base: number, rate: number, tier?: RateTier): number {
  if (!tier || base <= tier.cap) return base * (rate / 100);
  return tier.cap * (rate / 100) + (base - tier.cap) * (tier.rateAbove / 100);
}

const PAYOUT_STEP_MONTHS: Partial<Record<string, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * Точка «реализации» выплаты: что происходит с накопленным в эту дату.
 *
 * `skip` — граница периода ДО даты включения правила: денег она не двигает, но
 * сдвигает базу, от которой считается следующая выплата. Без неё первая же
 * выплата после включения забрала бы весь хвост, накопленный за всю прошлую
 * жизнь актива, — а мы договорились прошлое не трогать.
 */
interface Realisation {
  idx: number;
  action: 'keep' | 'wallet' | 'skip';
  /** Факт из записи пользователя; нет — движок берёт накопленное с прошлой границы. */
  amount?: number;
}

function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO-дата из того, что приходит снаружи: строки или Date. */
function isoAny(d: string | Date): string {
  return typeof d === 'string' ? d : isoOf(d);
}

/**
 * Даты выплат процентов — от открытия до указанной даты включительно.
 *
 * У НАКОПИТЕЛЬНОГО счёта (бессрочного) расчётный период — календарный месяц, и
 * проценты приходят первого числа следующего: так написано в условиях банка, и
 * так это и работает — два счёта, открытые 1 и 11 августа, платят в один день.
 * Раньше период отсчитывался от даты открытия, и второй счёт ждал выплату
 * 11-го числа, то есть в день выплаты его просто не было видно.
 *
 * У СРОЧНОГО вклада период отсчитывается от даты открытия — там это годовщина
 * размещения, а не календарь.
 */
export function payoutBoundaryDates(
  asset: Asset,
  instrument: FinancialInstrument,
  untilIso: string,
): string[] {
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const step = payout ? PAYOUT_STEP_MONTHS[payout] : undefined;
  if (!step) return [];
  const open = parseLocal(asset.openDate);
  const out: string[] = [];
  const d = instrument.behavior === 'perpetual'
    // первое начисление — первое число месяца через период после открытия
    ? new Date(open.getFullYear(), open.getMonth() + step, 1)
    : (() => { const x = new Date(open); x.setMonth(x.getMonth() + step); return x; })();
  for (let k = 0; k < 2000; k++) {
    const iso = isoOf(d);
    if (iso > untilIso) break;
    out.push(iso);
    d.setMonth(d.getMonth() + step);
  }
  return out;
}

/**
 * Даты выплат и решение по каждой — до последней нужной даты.
 *
 * Капитализация сюда не попадает: там проценты и так сворачиваются в тело на
 * границах периодов, выбора нет.
 *
 * И только БЕССРОЧНЫЕ активы: у накопительного счёта банк причисляет проценты
 * к тому же счёту, поэтому «оставить» — это реальный выбор и разумное
 * умолчание. У срочного вклада выплата уходит на другой счёт или карту, там
 * оставлять нечего — поведение остаётся прежним.
 */
function buildRealisations(
  asset: Asset,
  instrument: FinancialInstrument,
  mode: CapitalizationMode,
  untilIso: string,
  lastIdx: number,
): Realisation[] {
  if (mode === 'capitalize' || instrument.behavior !== 'perpetual') return [];
  const since = asset.payoutsSince;
  const byDate = new Map((asset.payouts ?? []).map((p) => [p.date, p]));
  return payoutBoundaryDates(asset, instrument, untilIso)
    .map((iso) => ({ iso, idx: dayIndex(iso) }))
    .filter((p) => p.idx <= lastIdx)
    .map(({ iso, idx }) => {
      const active = !since || iso >= since;
      const rec = active ? byDate.get(iso) : undefined;
      return { idx, action: active ? rec?.action ?? 'keep' : 'skip', amount: rec?.amount } as Realisation;
    });
}

interface WalkState {
  balanceNow: number;
  accrued: number;
  realised: number;
  earnedInBody: number;
  /** Сколько процентов сейчас лежит на счёте и может быть выведено «процентами». */
  interestOnAccount: number;
}

function walkAccrualAt(
  balance: BalancePoint[],
  rates: RatePoint[],
  mode: CapitalizationMode,
  payout: PayoutPeriod | undefined,
  samples: number[],
  tier?: RateTier,
  realisations: Realisation[] = [],
): WalkState[] {
  const lastIdx = samples[samples.length - 1];
  const bal = balance.map((p) => ({ idx: dayIndex(p.date), amount: p.amount, isCorrection: p.isCorrection, kind: p.kind }));
  const rts = rates.map((p) => ({ idx: dayIndex(p.date), rate: p.rate }));

  const balanceAt = new Map(bal.map((p) => [p.idx, p.amount]));
  const kindAt = new Map(bal.map((p) => [p.idx, p.kind]));
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

  const realisationAt = new Map(realisations.map((r) => [r.idx, r]));
  const checkpoints = [
    ...new Set([
      ...bal.map((p) => p.idx), ...rts.map((p) => p.idx), ...boundarySet, ...samples,
      ...realisations.map((r) => r.idx),
    ]),
  ].sort((a, b) => a - b);

  let principal = bal[0].amount;
  let pending = 0; // накоплено внутри текущего периода капитализации, ещё не в теле
  let accrued = 0;
  let realised = 0;         // выплаты, по которым решение уже принято
  let earnedInBody = 0;     // проценты, осевшие в самом теле (капитализация или «оставить»)
  let boundaryAccrued = 0;  // уровень дохода на прошлой границе периода выплат
  // Проценты, которые банк уже выплатил НА СЧЁТ, но решение по ним не принято
  // (границы до включения правила выплат). Они лежат на счёте рядом с телом, и
  // снятие «процентами» забирает в первую очередь их.
  let paidOnAccount = 0;
  // При ежедневной выплате без капитализации на счёт уходит всё начисленное
  // сразу — отдельных границ там нет, и «выплачено» равно «начислено».
  const paidDaily = mode !== 'capitalize' && payout === 'daily';
  const paidPool = () =>
    mode === 'capitalize' ? 0 : paidDaily ? Math.max(0, accrued - realised) : paidOnAccount;

  const out: WalkState[] = [];
  let sampleAt = 0;
  const flushSamples = (upTo: number) => {
    while (sampleAt < samples.length && samples[sampleAt] <= upTo) {
      out.push({
        balanceNow: principal + pending,
        accrued,
        realised,
        earnedInBody,
        interestOnAccount: paidPool() + earnedInBody + pending,
      });
      sampleAt++;
    }
  };

  for (let i = 0; i < checkpoints.length; i++) {
    const date = checkpoints[i];
    if (date > lastIdx) continue; // граница ещё не наступила — не учитываем вовсе
    // Выплата: накопленное с прошлой выплаты либо ложится в тело («оставить»),
    // либо уходит из актива («в кошелёк»). В обоих случаях оно перестаёт
    // висеть сверху — иначе currentValue посчитает эти деньги дважды.
    //
    // Выплата идёт РАНЬШЕ операции того же дня: банк зачисляет проценты утром,
    // и снятие в день выплаты видит их уже на счёте. Иначе вывод ровно
    // выплаченных процентов 1-го числа не нашёл бы, откуда их взять.
    const real = realisationAt.get(date);
    if (real) {
      const amount = real.amount ?? Math.max(0, accrued - boundaryAccrued);
      boundaryAccrued = accrued;
      if (real.action === 'skip') {
        paidOnAccount += amount;
      } else {
        realised += amount;
        if (real.action === 'keep') {
          principal += amount;
          earnedInBody += amount;
        }
      }
    }
    const explicitAmount = balanceAt.get(date);
    if (explicitAmount !== undefined) {
      const delta = principal + pending - explicitAmount;
      if (kindAt.get(date) === 'interest' && delta > 0) {
        // Вывод процентов: тело не трогаем. Сначала забираем выплаченное на
        // счёт (оно не в теле), остаток — из процентов, осевших в теле.
        // Тот же допуск, что в guessWithdrawalKind: банк и модель расходятся на
        // копейки, и вывод ровно выплаченного не должен оставлять в теле
        // «−0,38 ₽» — тело 999 999,62 вместо миллиона читается как поломка.
        const pool = paidPool();
        const fromPaid = mode === 'capitalize' ? 0 : delta <= pool * 1.01 + 1 ? delta : pool;
        if (!paidDaily) paidOnAccount = Math.max(0, paidOnAccount - fromPaid);
        realised += fromPaid;
        const rest = delta - fromPaid;
        earnedInBody = Math.max(0, earnedInBody + pending - rest);
        principal = explicitAmount + fromPaid;
      } else {
        // Факт из банка перекрывает и не свёрнутые в тело проценты модели.
        principal = explicitAmount;
      }
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
      const growth = annualYield(principal, r, tier) * (segmentDays / 365);
      pending += growth;
      accrued += growth;
      // Отрезок ровно упирается в границу периода капитализации — сворачиваем.
      if (segmentEndsAtNext && boundarySet.has(next)) {
        principal += pending;
        earnedInBody += pending;
        pending = 0;
      }
    } else {
      accrued += annualYield(principal, r, tier) * (segmentDays / 365);
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
  tier?: RateTier,
  realisations: Realisation[] = [],
): WalkState {
  return walkAccrualAt(balance, rates, mode, payout, [dayIndex(now)], tier, realisations)[0];
}

/** Точка истории актива: то же, что даёт calculate, но только «деньги». */
export interface AccrualPoint {
  balanceNow: number;
  accrued: number;
  currentValue: number;
  /** Доход за день на эту дату. До дня открытия — 0, как и в calculate. */
  incomePerDay: number;
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
  const rateIdx = rates.map((p) => ({ idx: dayIndex(p.date), rate: p.rate }));
  const tier = tierOf(asset);
  const realisations = buildRealisations(asset, instrument, mode, isoAny(dates[dates.length - 1]), idx[idx.length - 1]);
  const balancePts = walkAccrualAt(timeline, rates, mode, payout, idx, tier, realisations);

  const endIdx = asset.endDate ? dayIndex(asset.endDate) : undefined;
  const needsClamp = endIdx !== undefined && idx[idx.length - 1] > endIdx;
  const accrualPts = needsClamp
    ? walkAccrualAt(timeline, rates, mode, payout, idx.map((i) => Math.min(i, endIdx)), tier, realisations)
    : balancePts;

  const openIdx = dayIndex(asset.openDate);
  return idx.map((sampleIdx, k) => {
    const balanceNow = balancePts[k].balanceNow;
    const accrued = accrualPts[k].accrued;
    const rate = rateAtIdx(rateIdx, sampleIdx);
    const started = sampleIdx >= openIdx;
    return {
      balanceNow,
      accrued,
      // Реализованное больше не висит сверху: оно либо уже в теле, либо ушло
      // в кошелёк. Без вычета эти деньги считались бы дважды.
      currentValue: mode === 'capitalize' ? balanceNow : balanceNow + accrued - accrualPts[k].realised,
      incomePerDay: started ? annualYield(balanceNow, rate, tier) / daysInYear(dates[k]) : 0,
    };
  });
}

/**
 * «Ровная» сумма — кратная тысяче, без копеек. Так пользователь двигает тело
 * (для визуальной чистоты), а проценты всегда приходят «с хвостом».
 * Полрубля допуска — на плавающую точку в восстановленной из остатков дельте.
 */
export function isRoundSum(x: number): boolean {
  return Math.abs(x - Math.round(x / 1000) * 1000) < 0.5;
}

/**
 * Угадать, что это за снятие. Ровная сумма — тело. С хвостом и не больше
 * процентов на счёте — вывод процентов. С хвостом, но больше процентов —
 * всё равно тело: столько процентов там просто нет.
 *
 * Запас 1% + рубль сверху — модель считает проценты на копейки иначе, чем
 * банк, а выведенная сумма взята из банка.
 */
export function guessWithdrawalKind(delta: number, interestOnAccount: number): 'body' | 'interest' {
  if (delta <= 0 || isRoundSum(delta)) return 'body';
  return delta <= interestOnAccount * 1.01 + 1 ? 'interest' : 'body';
}

/** Состояние актива на дату — с указанным набором операций. */
function stateWith(
  asset: Asset,
  instrument: FinancialInstrument,
  adjustments: BalanceAdjustment[],
  iso: string,
): WalkState {
  const a = { ...asset, balanceAdjustments: adjustments };
  const mode: CapitalizationMode = a.capitalization ?? instrument.capitalization ?? 'none';
  const payout = a.payoutPeriod ?? instrument.payoutPeriod;
  const idx = dayIndex(iso);
  const realisations = buildRealisations(a, instrument, mode, iso, idx);
  return walkAccrualAt(balanceTimeline(a), rateTimeline(a), mode, payout, [idx], tierOf(a), realisations)[0];
}

/**
 * Разметить старые операции по счёту: тело или проценты (см. BalanceAdjustment.kind).
 *
 * Тип нельзя просто дописать к записи. Операция хранится НОВЫМ ОСТАТКОМ, а
 * остаток у старой модели после вывода процентов занижен: она вычла проценты из
 * тела. Все более поздние записи посчитаны от этого заниженного тела. Если
 * поменять только смысл одной записи, тело вернётся на место, а следующая
 * операция «съест» разницу обратно.
 *
 * Поэтому каждую запись пересчитываем в новую систему отсчёта: берём движение
 * денег из старой модели (ровно то число, что пользователь видел в истории) и
 * откладываем его от остатка новой модели на ту же дату. Пополнения и снятия
 * сохраняют свою величину, меняется только то, от чего они отложены.
 *
 * Исправления под факт банка не трогаем — это факт остатка, а не движение.
 * Вызывается миграцией один раз: после неё у всех операций тип есть.
 */
export function classifyLegacyWithdrawals(asset: Asset, instrument: FinancialInstrument): Asset {
  const original = asset.balanceAdjustments ?? [];
  if (!original.some((a) => !a.isCorrection && !a.kind)) return asset;
  const sorted = [...original].sort((a, b) => a.date.localeCompare(b.date));
  const done: BalanceAdjustment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (a.isCorrection || a.kind) {
      done.push(a);
      continue;
    }
    const oldBefore = stateWith(asset, instrument, sorted.slice(0, i), a.date).balanceNow;
    const delta = oldBefore - a.amount; // > 0 — снятие
    const now = stateWith(asset, instrument, done, a.date);
    const kind = guessWithdrawalKind(delta, now.interestOnAccount);
    done.push({ ...a, amount: now.balanceNow - delta, kind });
  }
  return { ...asset, balanceAdjustments: done };
}

/**
 * Сколько процентов ВЫПЛАЧЕНО (капитализировано) к каждой дате — выплатами,
 * датированными СТРОГО раньше неё. Налоговая база по НК — по дате выплаты, а не
 * начисления: проценты за 31 декабря, выплаченные 1 января, — доход нового года;
 * у вклада с выплатой в конце срока весь доход — в год окончания.
 *
 * График выплат:
 *  - ежедневно — выплата d покрывает предыдущий день: выплачено к d = accrued(d − 1);
 *  - помесячно/поквартально/… — на границах payoutBoundaryDates: к d выплачено
 *    accrued последней границы раньше d;
 *  - окончание срока и закрытие (`closedAt`) — последняя выплата: всё начисленное;
 *  - бессрочный без графика выплат — считаем по начислению (выплату не знаем).
 *
 * Окно [from, to) по этой функции: paid(to) − paid(from). Для года — [1 янв, 1 янв
 * следующего), выплата 1 января уходит в новый год. Один проход accrualSeries.
 */
export function paidIncomeSeries(
  asset: Asset,
  instrument: FinancialInstrument,
  dates: (string | Date)[],
  closedAt?: string | Date,
): number[] {
  if (dates.length === 0) return [];
  const isos = dates.map(isoAny);
  const open = asset.openDate;
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const isTerm = instrument.behavior === 'term' && !!asset.endDate;
  const closedIso = closedAt ? isoAny(closedAt) : undefined;
  let finalIso = isTerm ? asset.endDate : undefined;
  if (closedIso && (!finalIso || closedIso < finalIso)) finalIso = closedIso;

  const maxIso = isos.reduce((m, x) => (x > m ? x : m), open);
  const step = payout ? PAYOUT_STEP_MONTHS[payout] : undefined;
  const boundaries = step
    ? payoutBoundaryDates(asset, instrument, finalIso && finalIso < maxIso ? finalIso : maxIso)
    : [];

  // До какой даты начисленное уже выплачено к дате d.
  const paidThrough = (d: string): string => {
    if (d <= open) return open;
    if (finalIso && d > finalIso) return finalIso;
    if (payout === 'daily') {
      const prev = addDays(d, -1);
      return prev > open ? prev : open;
    }
    if (step) {
      let last = open;
      for (const b of boundaries) {
        if (b < d) last = b;
        else break;
      }
      return last;
    }
    // Без графика: срочный платит только в конце, бессрочный — по начислению.
    return isTerm ? open : d;
  };

  const through = isos.map(paidThrough);
  const uniq = Array.from(new Set(through)).sort();
  const byIso = new Map<string, number>();
  accrualSeries(asset, instrument, uniq).forEach((pt, k) => byIso.set(uniq[k], pt.accrued));
  return through.map((t) => (t === open ? 0 : byIso.get(t) ?? 0));
}

/**
 * Разбивка срочного актива по календарным годам ВЫПЛАТ — см. YearSegment.
 *
 * Доход года — проценты, выплаченные в этом году (paidIncomeSeries), а не
 * начисленные: у вклада с выплатой в конце весь доход в году окончания, у
 * ежедневной выплаты проценты за 31.12 уходят в новый год. `dates.to` — дата
 * последней выплаты (окончание), ВКЛЮЧИТЕЛЬНО: выплата в этот день — доход её года.
 *
 * Отдаёт и годы с нулевой выплатой: вызывающий решает, показывать ли их.
 */
export function yearSegments(
  asset: Asset,
  instrument: FinancialInstrument,
  dates: { from: string | Date; to: string | Date },
  /** «Сегодня» для флагов past/current — тот же момент, от которого считает вызывающий. */
  now: string | Date = new Date(),
): YearSegment[] {
  const from = isoAny(dates.from);
  const last = isoAny(dates.to);
  if (!from || !last || from >= last) return [];

  const fromYear = parseInt(from.slice(0, 4), 10);
  const toYear = parseInt(last.slice(0, 4), 10);
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) return [];

  // Окна [from, to): конец — 1 января следующего года, у последнего — день
  // после последней выплаты. Так окна стыкуются без общих/потерянных суток.
  const lastExclusive = addDays(last, 1);
  const bounds: { year: number; from: string; to: string }[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const segFrom = y === fromYear ? from : `${y}-01-01`;
    const segTo = y === toYear ? lastExclusive : `${y + 1}-01-01`;
    if (segFrom < segTo) bounds.push({ year: y, from: segFrom, to: segTo });
  }

  const isoDates = Array.from(new Set(bounds.flatMap((b) => [b.from, b.to])));
  const paid = paidIncomeSeries(asset, instrument, isoDates);
  const byIso = new Map<string, number>();
  isoDates.forEach((d, k) => byIso.set(d, paid[k]));

  const thisYear = parseInt(isoAny(now).slice(0, 4), 10);
  return bounds.map((b) => ({
    year: b.year,
    from: b.from,
    to: b.to,
    income: Math.max(0, (byIso.get(b.to) ?? 0) - (byIso.get(b.from) ?? 0)),
    past: b.year < thisYear,
    current: b.year === thisYear,
  }));
}

/**
 * Налог одного годового сегмента. Лимит года: из контекста, иначе текущий год —
 * `params.taxFreeLimit`, будущий — 1 млн × текущая ключевая (оценка, помечается
 * `limitByCurrentRate`). Ручной лимит (`taxFreeLimitManual`) — один на все годы.
 * Годы полного освобождения процентов по вкладам (2021–2022) — без налога.
 */
function withSegmentTax(
  seg: YearSegment,
  params: CalcParams,
  asset: Asset,
  nowIso: string,
  limitAlreadyUsed: number,
  ctx: TaxYearsContext,
): YearSegment {
  const nowYear = parseInt(nowIso.slice(0, 4), 10);
  const future = seg.year > nowYear;
  if (!asset.taxWithheldByBank && DEPOSIT_TAX_EXEMPT_YEARS.has(seg.year)) {
    return { ...seg, tax: 0, limitByCurrentRate: false };
  }
  const fromCtx = ctx.limitForYear?.[seg.year];
  const limit = params.taxFreeLimitManual
    ? params.taxFreeLimit
    : fromCtx ?? (future ? (1_000_000 * params.keyRate) / 100 : params.taxFreeLimit);
  const used = ctx.limitUsedByYear?.[seg.year] ?? (seg.year === nowYear ? limitAlreadyUsed : 0);
  const tax = calcAssetTax(seg.income, { ...params, taxFreeLimit: limit }, used, asset.taxWithheldByBank);
  return { ...seg, tax, limitByCurrentRate: future && !params.taxFreeLimitManual && fromCtx === undefined };
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
  /** лимиты по годам — для срочного, срок которого выходит за год (см. TaxYearsContext) */
  taxYears: TaxYearsContext = {},
): DerivedValues {
  const mode: CapitalizationMode =
    asset.capitalization ?? instrument.capitalization ?? 'none';
  const payout = asset.payoutPeriod ?? instrument.payoutPeriod;
  const timeline = balanceTimeline(asset);
  const rates = rateTimeline(asset);
  // Ставка «на сейчас» — из истории изменений, а не открытия: банк мог поменять
  // ставку на счёте, дальнейший прогноз должен идти уже по актуальной.
  const currentRate = rateAt(rates, now);

  const tier = tierOf(asset);
  const realisations = buildRealisations(asset, instrument, mode, isoAny(now), dayIndex(now));
  const { balanceNow, accrued: accruedToNow, realised, earnedInBody } =
    walkAccrual(timeline, rates, mode, payout, now, tier, realisations);
  const invested = balanceNow - earnedInBody;
  // Актив, который ещё не открылся, НЕ приносит дохода. Без этой проверки
  // опечатка в дате открытия (или запись «на будущее») молча добавляла в
  // «Сегодня принесёт» доход по несуществующему вкладу — при том, что
  // incomeRunRateOn такие активы пропускает, и «сегодня» со «средним»
  // начинали считаться по разным наборам активов.
  const started = diffDays(asset.openDate, now) >= 0;
  // Срок вышел — деньги ЛЕЖАТ. Накопленное замирает на дате окончания (см.
  // accrualNow ниже), а дневной доход раньше продолжал капать как ни в чём не
  // бывало: вклад, закончившийся месяц назад, исправно добавлял себя в
  // «Сегодня принесёт». Это та же дыра, что и с ещё не открытым активом,
  // только на другом конце жизни.
  const ended = asset.endDate !== undefined && diffDays(now, asset.endDate) < 0;
  const earning = started && !ended;
  const incomePerDay = earning ? annualYield(balanceNow, currentRate, tier) / daysInYear(now) : 0;
  // Прогноз вперёд (месяц/год) — от ТЕКУЩЕГО баланса, а не от суммы открытия:
  // при капитализации проценты уже легли на баланс и сами приносят доход.
  const annualRunRate = earning ? annualYield(balanceNow, currentRate, tier) : 0;
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
    const incomeTotalTerm = annualYield(asset.amount, currentRate, tier) * (termDays / 365);
    // Налог — по годам ВЫПЛАТ, у каждого года свой доход и свой лимит. Если все
    // выплаты (включая финальную в день окончания) в одном году — быстрый путь
    // без лишнего прохода accrualSeries: calculate зовут и в циклах (календарь).
    const nowYear = parseInt(isoAny(now).slice(0, 4), 10);
    const openYear = parseInt(asset.openDate.slice(0, 4), 10);
    const endYear = parseInt(asset.endDate.slice(0, 4), 10);
    const taxed = endYear > openYear
      ? yearSegments(asset, instrument, { from: asset.openDate, to: asset.endDate }, now)
          .map((seg) => withSegmentTax(seg, params, asset, isoAny(now), limitAlreadyUsed, taxYears))
      : [withSegmentTax(
          {
            year: openYear, from: asset.openDate, to: addDays(asset.endDate, 1),
            income: incomeTotalTerm,
            past: openYear < nowYear,
            current: openYear === nowYear,
          },
          params, asset, isoAny(now), limitAlreadyUsed, taxYears,
        )];
    // Карточке разбивка нужна, только если выплаты реально в разных годах.
    const paidYears = taxed.filter((seg) => seg.income > 0);
    const yearSegmentsOut = paidYears.length > 1 ? paidYears : undefined;
    // «Уже заработано» — посегментно, чтобы честно учитывать пополнения/снятия И смену ставки.
    const accrualNow = diffDays(asset.openDate, now) > termDays ? asset.endDate : now;
    const { accrued: earnedSoFar } = walkAccrual(timeline, rates, mode, payout, accrualNow, tier, realisations);
    const remainingToEarn = Math.max(0, incomeTotalTerm - earnedSoFar);

    const tax = taxed.reduce((sum, seg) => sum + (seg.tax ?? 0), 0);
    // Налог «на месяц» у вклада через год — по средней эффективной ставке срока:
    // доход месяца облагается в год ВЫПЛАТЫ, а не в текущем, и лимит текущего
    // года к нему может не иметь отношения. В пределах года — как раньше.
    const paidTotal = taxed.reduce((sum, seg) => sum + seg.income, 0);
    const termMonthlyTax = endYear > openYear
      ? (paidTotal > 0 ? incomePerMonth * (tax / paidTotal) : 0)
      : monthlyTax;
    const net = incomeTotalTerm - tax;
    const finalAmount = asset.amount + net;

    return {
      balanceNow,
      // При капитализации начисленное уже в теле; при простом % — лежит рядом.
      // Реализованные выплаты вычитаем: они уже либо в теле, либо в кошельке.
      currentValue: mode === 'capitalize' ? balanceNow : balanceNow + earnedSoFar - realised,
      invested,
      incomePerDay,
      incomePerMonth,
      incomeTotalTerm,
      accrued: earnedSoFar,
      tax,
      net,
      monthlyTax: termMonthlyTax,
      monthlyNet: incomePerMonth - termMonthlyTax,
      finalAmount,
      earnedSoFar,
      remainingToEarn,
      daysRemaining,
      termProgress,
      currentRate,
      premiumToKeyRate,
      yearSegments: yearSegmentsOut,
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
    currentValue: mode === 'capitalize' ? balanceNow : balanceNow + earnedSoFar - realised,
    invested,
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
