import type { Asset, FinancialInstrument, Organization } from '@/domain/types';
import { emptyAppData } from '@/storage/types';
import { computeTaxYearRecord, buildAssetViews, isPastYearMatured, analyticsSummary, assetTimeline, incomeRunRateSeries, capitalHistorySeries, monthlyIncomeHistory } from './selectors';
import { calculate, diffDays } from '@/calc';

const depositInstrument: FinancialInstrument = {
  id: 'i0',
  organizationId: 'o1',
  name: 'Тест-Вклад',
  typeId: 'deposit',
  behavior: 'term',
  capitalization: 'none',
};

const savingsInstrument: FinancialInstrument = {
  id: 'i1',
  organizationId: 'o1',
  name: 'Тест-НС',
  typeId: 'savings',
  behavior: 'perpetual',
  capitalization: 'none',
};

describe('computeTaxYearRecord', () => {
  const asset: Asset = {
    id: 'a1',
    instrumentId: 'i1',
    amount: 5_000_000,
    currency: 'RUB',
    rate: 12,
    openDate: '2025-01-01',
    status: 'active',
  };

  const baseData = {
    ...emptyAppData(),
    instruments: [savingsInstrument],
    assets: [asset],
    keyRateHistory: [{ date: '2020-01-01', rate: 16 }],
  };

  const expectedIncome = 5_000_000 * 0.12 * (diffDays('2025-01-01', '2025-12-31') / 365);

  test('лимит года — по ключевой ставке (1 млн × ставка), а не из текущих настроек', () => {
    const rec = computeTaxYearRecord(baseData, 2025);
    expect(rec.year).toBe(2025);
    expect(rec.keyRateUsed).toBe(16);
    expect(rec.taxFreeLimit).toBeCloseTo(160_000, 2);
  });

  test('доход за год = заработанное между 1 января и 31 декабря', () => {
    const rec = computeTaxYearRecord(baseData, 2025);
    expect(rec.taxableIncome).toBeCloseTo(expectedIncome, 2);
  });

  test('без флага «удерживает банк» — весь налог сверх лимита нужно доплатить самому', () => {
    const rec = computeTaxYearRecord(baseData, 2025);
    const expectedTax = (expectedIncome - 160_000) * 0.13;
    expect(rec.taxDue).toBeCloseTo(expectedTax, 2);
    expect(rec.taxWithheld).toBeCloseTo(0, 2);
    expect(rec.taxToPaySelf).toBeCloseTo(expectedTax, 2);
  });

  test('с флагом «удерживает банк» — налог полностью в «удержано», а не «доплатить самому»', () => {
    const withheldData = { ...baseData, assets: [{ ...asset, taxWithheldByBank: true }] };
    const rec = computeTaxYearRecord(withheldData, 2025);
    expect(rec.taxWithheld).toBeCloseTo(rec.taxDue, 2);
    expect(rec.taxToPaySelf).toBeCloseTo(0, 2);
  });

  test('два актива, один с удержанием банком — лимит достаётся только группе «доплатить самому», «удержит банк» считается плоско', () => {
    const asset2: Asset = { ...asset, id: 'a2', amount: 5_000_000, taxWithheldByBank: true };
    const mixedData = { ...baseData, assets: [asset, asset2] };
    const rec = computeTaxYearRecord(mixedData, 2025);
    // «Удержит банк» — свой правовой режим, лимит НЕ достаётся: плоские 13% от всего дохода.
    expect(rec.taxWithheld).toBeCloseTo(expectedIncome * 0.13, 2);
    // «Доплатить самому» — обычный вклад, лимит применяется как всегда.
    expect(rec.taxToPaySelf).toBeCloseTo((expectedIncome - 160_000) * 0.13, 2);
    // При равных доходах групп «удержит банк» платит БОЛЬШЕ (льготы нет) — не поровну.
    expect(rec.taxWithheld).toBeGreaterThan(rec.taxToPaySelf);
    expect(rec.taxWithheld + rec.taxToPaySelf).toBeCloseTo(rec.taxDue, 6);
  });

  test('демо-активы не участвуют в годовой статистике', () => {
    const demoOnly = { ...baseData, assets: [{ ...asset, isDemo: true }] };
    const rec = computeTaxYearRecord(demoOnly, 2025);
    expect(rec.taxableIncome).toBe(0);
    expect(rec.taxDue).toBe(0);
  });
});

describe('assetTimeline — объединённая история баланса и ставки', () => {
  const asset: Asset = {
    id: 'a1', instrumentId: 'i1', amount: 1_000_000, currency: 'RUB', rate: 10,
    openDate: '2025-01-01', status: 'active',
    balanceAdjustments: [{ id: 'b1', date: '2025-03-01', amount: 1_200_000 }],
    rateAdjustments: [{ id: 'r1', date: '2025-02-01', rate: 11 }],
  };

  test('баланс и ставка сливаются в одну ленту, новые сверху', () => {
    const tl = assetTimeline(asset);
    expect(tl.map((e) => e.type)).toEqual(['balance', 'rate', 'open']);
  });

  test('дельта каждой записи — относительно предыдущей точки СВОЕГО типа, а не соседней по дате', () => {
    const tl = assetTimeline(asset);
    const balanceEntry = tl.find((e) => e.type === 'balance');
    const rateEntry = tl.find((e) => e.type === 'rate');
    expect(balanceEntry?.amountDelta).toBe(200_000); // 1 200 000 - 1 000 000 (открытие), не зависит от изменения ставки
    expect(rateEntry?.rateDelta).toBe(1); // 11 - 10 (открытие), не зависит от корректировки баланса
  });
});

describe('incomeRunRateSeries — темп дневного дохода', () => {
  const org: Organization = { id: 'o1', name: 'Тест-Банк', type: 'Банк', color: '#000000' };
  const asset: Asset = {
    id: 'a1',
    instrumentId: 'i1',
    amount: 1_000_000,
    currency: 'RUB',
    rate: 10,
    openDate: '2025-01-01',
    status: 'active',
    balanceAdjustments: [{ id: 'b1', date: '2025-06-15', amount: 2_000_000 }],
    rateAdjustments: [{ id: 'r1', date: '2025-06-20', rate: 20 }],
  };
  const data = {
    ...emptyAppData(),
    organizations: [org],
    instruments: [savingsInstrument],
    assets: [asset],
  };

  test('учитывает пополнение и изменение ставки внутри периода', () => {
    const series = incomeRunRateSeries(data, 31, new Date('2025-07-01'));
    expect(series).toHaveLength(31);
    expect(series[0]).toBeCloseTo((1_000_000 * 0.1) / 365, 4);
    expect(series[series.length - 1]).toBeCloseTo((2_000_000 * 0.2) / 365, 4);
    expect(series[series.length - 1]).toBeGreaterThan(series[0]);
  });
});

describe('analyticsSummary — разбивка налога года на «удержит банк» / «доплатить самому»', () => {
  const org: Organization = { id: 'o1', name: 'Тест-Банк', type: 'Банк', color: '#000000' };
  // Одинаковые по сумме и ставке активы — только одна из них с флагом
  // «удержит банк сам». У этой группы лимит не действует вообще (свой
  // правовой режим) — при равном доходе она платит БОЛЬШЕ, не поровну.
  const withheldAsset: Asset = {
    id: 'a1', instrumentId: 'i1', amount: 5_000_000, currency: 'RUB', rate: 12,
    openDate: '2020-01-01', status: 'active', taxWithheldByBank: true,
  };
  const selfAsset: Asset = { ...withheldAsset, id: 'a2', taxWithheldByBank: false };

  const data = {
    ...emptyAppData(),
    organizations: [org],
    instruments: [savingsInstrument],
    assets: [withheldAsset, selfAsset],
  };

  test('taxYearWithheld считается плоско (без лимита), taxYearSelf — с лимитом', () => {
    const s = analyticsSummary(data);
    const annual = 5_000_000 * 0.12; // одинаково у обоих активов
    expect(s.taxYearWithheld).toBeCloseTo(annual * 0.13, 2);
    expect(s.taxYearSelf).toBeCloseTo((annual - 160_000) * 0.13, 2);
    expect(s.taxYearWithheld).toBeGreaterThan(s.taxYearSelf);
    expect(s.taxYearWithheld + s.taxYearSelf).toBeCloseTo(s.taxYear, 6);
  });

  test('без единого актива с флагом — вся сумма года падает в «доплатить самому»', () => {
    const s = analyticsSummary({ ...data, assets: [{ ...selfAsset, id: 'a3' }] });
    expect(s.taxYearWithheld).toBeCloseTo(0, 6);
    expect(s.taxYearSelf).toBeCloseTo(s.taxYear, 6);
  });

  test('selfAccrued — только доход активов БЕЗ флага (лимит их не касается)', () => {
    const now = new Date('2025-07-01');
    const s = analyticsSummary(data, now);
    const daysSinceOpen = diffDays('2020-01-01', now);
    const expectedEach = 5_000_000 * 0.12 * (daysSinceOpen / 365);
    // accrued — сумма ОБОИХ активов, selfAccrued — только «доплатить самому».
    expect(s.accrued).toBeCloseTo(expectedEach * 2, 0);
    expect(s.selfAccrued).toBeCloseTo(expectedEach, 0);
  });

  test('taxPaidTotal — сумма реально удержанного налога по всем активам, включая закрытые', () => {
    const withTaxPaid: Asset = {
      ...withheldAsset,
      id: 'a4',
      status: 'closed',
      balanceAdjustments: [
        { id: 'b1', date: '2024-01-01', amount: 5_100_000, taxWithheld: 5_000 },
        { id: 'b2', date: '2024-06-01', amount: 5_200_000, taxWithheld: 3_000 },
      ],
    };
    const s = analyticsSummary({ ...data, assets: [withheldAsset, selfAsset, withTaxPaid] });
    // Закрытый актив не попадает в buildAssetViews, но taxPaidTotal — исторический факт по ВСЕМ активам.
    expect(s.taxPaidTotal).toBeCloseTo(8_000, 2);
  });
});

describe('isPastYearMatured / buildAssetViews — просроченный вклад прошлого года', () => {
  const org: Organization = { id: 'o1', name: 'Тест-Банк', type: 'Банк', color: '#000000' };
  const matured: Asset = {
    id: 'm1',
    instrumentId: 'i0',
    amount: 1_000_000,
    currency: 'RUB',
    rate: 12,
    openDate: '2025-01-01',
    endDate: '2025-06-01',
    status: 'active',
  };
  const dataWithMatured = {
    ...emptyAppData(),
    organizations: [org],
    instruments: [depositInstrument],
    assets: [matured],
  };

  test('срок вышел в ЭТОМ же году — остаётся видимым (просто просрочен)', () => {
    const sameYearNow = new Date('2025-08-01');
    expect(isPastYearMatured(matured, depositInstrument, sameYearNow)).toBe(false);
    expect(buildAssetViews(dataWithMatured, sameYearNow)).toHaveLength(1);
  });

  test('срок вышел в ПРОШЛОМ году — пропадает из текущих расчётов', () => {
    const nextYearNow = new Date('2026-01-15');
    expect(isPastYearMatured(matured, depositInstrument, nextYearNow)).toBe(true);
    expect(buildAssetViews(dataWithMatured, nextYearNow)).toHaveLength(0);
  });

  test('закрытый/архивный актив не считается «просроченным» — его и так не видно (обычный фильтр по статусу)', () => {
    const closed: Asset = { ...matured, status: 'closed' };
    expect(isPastYearMatured(closed, depositInstrument, new Date('2026-01-15'))).toBe(false);
  });

  test('срок ещё не наступил — не просрочен', () => {
    const future: Asset = { ...matured, endDate: '2099-01-01' };
    expect(isPastYearMatured(future, depositInstrument, new Date('2026-01-15'))).toBe(false);
  });
});

/**
 * Регрессия на реальный баг: часть денег переложили со старого счёта на новый
 * (ставка работала только до 1.5 млн), в приложении СУММУ старого актива
 * поправили в форме, а не снятием. `capitalHistorySeries` считает каждый день
 * от `asset.amount`, поэтому правка суммы переписывает всё прошлое актива:
 * старый «всегда» был меньше, новый добавляет свою сумму со своей даты — и на
 * графике вылезает скачок капитала на ровном месте, хотя деньги просто
 * переложили. Правильная запись того же события — BalanceAdjustment на дату
 * перевода, тогда история остаётся ровной.
 */
describe('capitalHistorySeries: перекладывание денег между активами', () => {
  const base = {
    ...emptyAppData(),
    instruments: [savingsInstrument],
    keyRateHistory: [{ date: '2020-01-01', rate: 16 }],
  };
  // Ставка 0 — убираем начисления, чтобы в серии остался чистый эффект тела.
  const old0: Asset = {
    id: 'old', instrumentId: 'i1', amount: 2_500_000, currency: 'RUB',
    rate: 0, openDate: '2026-06-01', status: 'active',
  };
  const fresh: Asset = {
    id: 'new', instrumentId: 'i1', amount: 1_000_000, currency: 'RUB',
    rate: 0, openDate: '2026-08-10', status: 'active',
  };
  const now = new Date('2026-08-12');

  test('НЕВЕРНО: сумму старого актива переписали задним числом — график даёт ложный скачок', () => {
    const wrong = { ...base, assets: [{ ...old0, amount: 1_500_000 }, fresh] };
    const series = capitalHistorySeries(wrong, 'month', now);
    expect(series[0]).toBeCloseTo(1_500_000, 2);
    expect(series[series.length - 1]).toBeCloseTo(2_500_000, 2);
  });

  test('ВЕРНО: то же событие как BalanceAdjustment на дату перевода — капитал ровный', () => {
    const right = {
      ...base,
      assets: [
        { ...old0, balanceAdjustments: [{ id: 'b1', date: '2026-08-10', amount: 1_500_000 }] },
        fresh,
      ],
    };
    const series = capitalHistorySeries(right, 'month', now);
    // 2.5 млн до перевода и 1.5 + 1.0 после — итог не меняется ни в один день.
    for (const v of series) expect(v).toBeCloseTo(2_500_000, 2);
  });
});

/**
 * Регрессия: снял ровно 100 000, а история показывала −99 359. Причина —
 * BalanceAdjustment.amount это абсолютный баланс, и наивная разница с
 * предыдущей записью впитывает набежавшие за эти дни проценты (на счёте с
 * ежедневной капитализацией — на каждой операции).
 */
describe('assetTimeline: дельта операции = движение денег, а не разница балансов', () => {
  const dailySavings: FinancialInstrument = {
    id: 'i9', organizationId: 'o1', name: 'Ежедневный доход', typeId: 'savings',
    behavior: 'perpetual', capitalization: 'capitalize', payoutPeriod: 'daily',
  };
  const params = emptyAppData().params;
  // 500к под 11.7% с ежедневной капитализацией: к 5 августа тело = 500 641.40,
  // поэтому снятие 100 000 записывается абсолютным балансом 400 641.40.
  const asset: Asset = {
    id: 'a9', instrumentId: 'i9', amount: 500_000, currency: 'RUB', rate: 11.7,
    openDate: '2026-08-01', status: 'active',
    capitalization: 'capitalize', payoutPeriod: 'daily',
    balanceAdjustments: [{ id: 'b1', date: '2026-08-05', amount: 400_641.40 }],
  };

  test('движение = 100 000, а не разница записанных балансов', () => {
    const entry = assetTimeline(asset, dailySavings, params).find((e) => e.id === 'b1');
    expect(entry?.amountDelta).toBeCloseTo(-100_000, 0);
  });

  test('без instrument/params остаётся наивная разница (обратная совместимость)', () => {
    const entry = assetTimeline(asset).find((e) => e.id === 'b1');
    expect(entry?.amountDelta).toBeCloseTo(-99_358.6, 1);
  });

  test('вторая операция считается от баланса с учётом первой, а не от её записи', () => {
    // Баланс на 11 августа берём у самого движка, а не константой: он зависит
    // от ставки и капитализации, и захардкоженное число тихо разъезжается.
    const afterFirst: Asset = { ...asset };
    const balanceOn11 = calculate(afterFirst, dailySavings, params, '2026-08-11', 0).balanceNow;
    const twoOps: Asset = {
      ...asset,
      balanceAdjustments: [
        { id: 'b1', date: '2026-08-05', amount: 400_641.40 },
        { id: 'b2', date: '2026-08-11', amount: balanceOn11 + 100_000 },
      ],
    };
    const entry = assetTimeline(twoOps, dailySavings, params).find((e) => e.id === 'b2');
    expect(entry?.amountDelta).toBeCloseTo(100_000, 6);
  });
});

describe('monthlyIncomeHistory — помесячный доход и налог', () => {
  const savings: FinancialInstrument = {
    id: 'im', organizationId: 'o1', name: 'НС', typeId: 'savings',
    behavior: 'perpetual', capitalization: 'none',
  };
  // 1 200 000 под 10% простых = 120 000/год, ровно 10 000 в месяц при 30/365.
  const asset: Asset = {
    id: 'am', instrumentId: 'im', amount: 1_200_000, currency: 'RUB', rate: 10,
    openDate: '2026-01-01', status: 'active',
  };
  const base = {
    ...emptyAppData(),
    instruments: [savings],
    assets: [asset],
    keyRateHistory: [{ date: '2020-01-01', rate: 16 }],
  };
  const now = new Date('2026-06-15');

  test('месяцы идут только до текущего, последний обрезан сегодняшним днём', () => {
    const r = monthlyIncomeHistory(base, 2026, now);
    expect(r.months.map((m) => m.month)).toEqual([0, 1, 2, 3, 4, 5]);
    // июнь — половина месяца, заметно меньше полного мая
    expect(r.months[5].earned).toBeLessThan(r.months[4].earned);
  });

  test('сумма месяцев равна итогу за период', () => {
    const r = monthlyIncomeHistory(base, 2026, now);
    expect(r.months.reduce((s, m) => s + m.earned, 0)).toBeCloseTo(r.totalEarned, 6);
  });

  test('плоский налог — ставка × доход, без лимита', () => {
    const r = monthlyIncomeHistory(base, 2026, now);
    for (const m of r.months) {
      expect(m.tax).toBeCloseTo(m.earned * (base.params.taxRate / 100), 6);
    }
  });

  /**
   * Лимит один на год, поэтому пока накопленный доход его не превысил, налога
   * нет вовсе — и только потом он начинает набегать. Именно этим taxWithLimit
   * отличается от плоского: помесячно они не совпадают, а по году сходятся.
   */
  test('налог с лимитом: ноль, пока лимит не выбран, дальше растёт', () => {
    const withLimit = { ...base, params: { ...base.params, taxFreeLimit: 25_000 } };
    const r = monthlyIncomeHistory(withLimit, 2026, now);
    expect(r.months[0].taxWithLimit).toBeCloseTo(0, 6);
    expect(r.months[1].taxWithLimit).toBeCloseTo(0, 6);
    expect(r.months[r.months.length - 1].taxWithLimit).toBeGreaterThan(0);
  });

  test('налог с лимитом за год = налог на доход сверх лимита', () => {
    const withLimit = { ...base, params: { ...base.params, taxFreeLimit: 25_000 } };
    const r = monthlyIncomeHistory(withLimit, 2026, now);
    const expected = Math.max(0, r.totalEarned - 25_000) * (withLimit.params.taxRate / 100);
    expect(r.totalTaxWithLimit).toBeCloseTo(expected, 6);
  });

  test('актив с удержанием банком лимит не делит — у него налог плоский', () => {
    const withLimit = {
      ...base,
      params: { ...base.params, taxFreeLimit: 25_000 },
      assets: [{ ...asset, taxWithheldByBank: true }],
    };
    const r = monthlyIncomeHistory(withLimit, 2026, now);
    expect(r.totalTaxWithLimit).toBeCloseTo(r.totalTax, 6);
  });
});
