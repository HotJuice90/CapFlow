import type { Asset, FinancialInstrument, Organization } from '@/domain/types';
import { emptyAppData } from '@/storage/types';
import { computeTaxYearRecord, buildAssetViews, isPastYearMatured, analyticsSummary, assetTimeline, incomeRunRateSeries } from './selectors';
import { diffDays } from '@/calc';

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
