import type { Asset, CalcParams, FinancialInstrument } from '@/domain/types';
import { calculate } from './engine';
import { diffDays, daysInYear, isLeapYear } from './dayCount';

const params: CalcParams = { taxRate: 13, taxFreeLimit: 210_000, keyRate: 16 };

const depositInstrument: FinancialInstrument = {
  id: 'i1',
  organizationId: 'o1',
  name: 'Тест-Вклад',
  typeId: 'deposit',
  behavior: 'term',
  capitalization: 'none',
};

const savingsInstrument: FinancialInstrument = {
  id: 'i2',
  organizationId: 'o1',
  name: 'Тест-Накопительный',
  typeId: 'savings',
  behavior: 'perpetual',
  capitalization: 'none',
};

describe('dayCount', () => {
  test('diffDays считает целые дни', () => {
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(diffDays('2026-07-02', '2027-01-01')).toBe(183);
  });

  test('високосность', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(daysInYear('2024-03-01')).toBe(366);
    expect(daysInYear('2026-03-01')).toBe(365);
  });
});

describe('вклад (срочный, простой процент)', () => {
  const asset: Asset = {
    id: 'a1',
    instrumentId: 'i1',
    amount: 1_000_000,
    currency: 'RUB',
    rate: 18,
    openDate: '2026-01-01',
    endDate: '2027-01-01',
    status: 'active',
  };

  test('доход в день ≈ сумма × ставка / дней в году', () => {
    const d = calculate(asset, depositInstrument, params, '2026-07-02');
    expect(d.incomePerDay).toBeCloseTo((1_000_000 * 0.18) / 365, 4);
  });

  test('доход за весь срок = 180 000', () => {
    const d = calculate(asset, depositInstrument, params, '2026-07-02');
    expect(d.incomeTotalTerm).toBeCloseTo(180_000, 2);
  });

  test('уже заработано пропорционально сроку', () => {
    const d = calculate(asset, depositInstrument, params, '2026-07-02');
    expect(d.earnedSoFar).toBeCloseTo(1_000_000 * 0.18 * (182 / 365), 2);
  });

  test('осталось дней и прогресс срока', () => {
    const d = calculate(asset, depositInstrument, params, '2026-07-02');
    expect(d.daysRemaining).toBe(183);
    expect(d.termProgress).toBeCloseTo(182 / 365, 4);
  });

  test('налог: доход 180k < лимит 210k → налог 0, чистыми = начислено', () => {
    const d = calculate(asset, depositInstrument, params, '2026-07-02');
    expect(d.tax).toBe(0);
    expect(d.net).toBeCloseTo(180_000, 2);
  });

  test('премия к ключевой ставке', () => {
    const d = calculate(asset, depositInstrument, params, '2026-07-02');
    expect(d.premiumToKeyRate).toBeCloseTo(2, 6);
  });
});

describe('налог сверх лимита', () => {
  const big: Asset = {
    id: 'a2',
    instrumentId: 'i1',
    amount: 5_000_000,
    currency: 'RUB',
    rate: 18,
    openDate: '2026-01-01',
    endDate: '2027-01-01',
    status: 'active',
  };

  test('доход 900k, налог 13% от (900k − 210k) = 89 700', () => {
    const d = calculate(big, depositInstrument, params, '2026-06-01');
    expect(d.incomeTotalTerm).toBeCloseTo(900_000, 2);
    expect(d.tax).toBeCloseTo((900_000 - 210_000) * 0.13, 2);
  });
});

describe('лимит, уже занятый другими активами портфеля', () => {
  const asset: Asset = {
    id: 'a4',
    instrumentId: 'i1',
    amount: 1_000_000,
    currency: 'RUB',
    rate: 18,
    openDate: '2026-01-01',
    endDate: '2027-01-01',
    status: 'active',
  };

  test('доход 180k сам по себе < лимита, но лимит уже занят другим активом → налог не 0', () => {
    const d = calculate(asset, depositInstrument, params, '2026-07-02', 210_000);
    expect(d.tax).toBeCloseTo(180_000 * 0.13, 2);
  });
});

describe('накопительный счёт (бессрочный)', () => {
  const asset: Asset = {
    id: 'a3',
    instrumentId: 'i2',
    amount: 500_000,
    currency: 'RUB',
    rate: 16,
    openDate: '2026-01-01',
    status: 'active',
  };

  test('нет срока, есть прогноз', () => {
    const d = calculate(asset, savingsInstrument, params, '2026-07-01');
    expect(d.daysRemaining).toBeUndefined();
    expect(d.termProgress).toBeUndefined();
    expect(d.forecastNextYear).toBeCloseTo(500_000 * 0.16, 2);
    // Месяц — по факту дней в июле (31), как считают банки, а не /12.
    expect(d.forecastNextMonth).toBeCloseTo(((500_000 * 0.16) / 365) * 31, 2);
  });

  test('с ежедневной капитализацией прогноз считается от подросшего баланса, не от суммы открытия', () => {
    const capitalizing: Asset = { ...asset, capitalization: 'capitalize', payoutPeriod: 'daily' };
    const d = calculate(capitalizing, savingsInstrument, params, '2026-07-01');
    const elapsedDays = 181; // 01.01 → 01.07
    const expectedBalance = 500_000 * Math.pow(1 + 0.16 / 365, elapsedDays);
    expect(d.forecastNextYear).toBeCloseTo(expectedBalance * 0.16, 2);
    expect(d.forecastNextYear).toBeGreaterThan(500_000 * 0.16);
  });
});

describe('корректировки баланса (пополнения/снятия)', () => {
  const asset: Asset = {
    id: 'a4',
    instrumentId: 'i2',
    amount: 500_000,
    currency: 'RUB',
    rate: 12,
    openDate: '2026-01-01',
    status: 'active',
    balanceAdjustments: [{ id: 'b1', date: '2026-04-01', amount: 800_000 }],
  };

  test('простой процент: заработанное считается по сегментам, каждый — от своего баланса', () => {
    const d = calculate(asset, savingsInstrument, params, '2026-07-01');
    const seg1Days = diffDays('2026-01-01', '2026-04-01'); // 90
    const seg2Days = diffDays('2026-04-01', '2026-07-01'); // 91
    const expected =
      500_000 * 0.12 * (seg1Days / 365) +
      800_000 * 0.12 * (seg2Days / 365);
    expect(d.earnedSoFar).toBeCloseTo(expected, 2);
  });

  test('до даты корректировки баланс — старый, после — новый (без «эха» из будущего)', () => {
    const before = calculate(asset, savingsInstrument, params, '2026-02-01');
    expect(before.earnedSoFar).toBeCloseTo(500_000 * 0.12 * (diffDays('2026-01-01', '2026-02-01') / 365), 2);
  });

  test('капитализация после пополнения считается от НОВОГО баланса на дату корректировки, не от суммы открытия', () => {
    const capitalizing: Asset = {
      ...asset,
      capitalization: 'capitalize',
      payoutPeriod: 'daily',
    };
    const d = calculate(capitalizing, savingsInstrument, params, '2026-07-01');
    const daysSinceAdjustment = diffDays('2026-04-01', '2026-07-01'); // 91
    const expectedBalance = 800_000 * Math.pow(1 + 0.12 / 365, daysSinceAdjustment);
    expect(d.forecastNextYear).toBeCloseTo(expectedBalance * 0.12, 2);
    // Контроль: это НЕ то же самое, что если бы 500k капитализировались с открытия все 181 день.
    const naive = 500_000 * Math.pow(1 + 0.12 / 365, diffDays('2026-01-01', '2026-07-01'));
    expect(d.forecastNextYear).not.toBeCloseTo(naive * 0.12, 2);
  });
});

describe('currentValue — честная «стоимость сейчас» без двойного счёта', () => {
  const base: Asset = {
    id: 'a7',
    instrumentId: 'i2',
    amount: 1_000_000,
    currency: 'RUB',
    rate: 12,
    openDate: '2026-01-01',
    status: 'active',
  };

  test('простой %: стоимость = тело + начисленное (проценты лежат рядом с телом)', () => {
    const d = calculate(base, savingsInstrument, params, '2026-07-01');
    expect(d.currentValue).toBeCloseTo(d.balanceNow + d.accrued, 6);
    expect(d.balanceNow).toBe(1_000_000); // тело при простом % не растёт само
  });

  test('капитализация: стоимость = тело (начисленное уже в нём, не считаем дважды)', () => {
    const capitalizing: Asset = { ...base, capitalization: 'capitalize', payoutPeriod: 'daily' };
    const d = calculate(capitalizing, savingsInstrument, params, '2026-07-01');
    expect(d.currentValue).toBeCloseTo(d.balanceNow, 6);
    expect(d.balanceNow).toBeGreaterThan(1_000_000);
  });
});

describe('исправление баланса под факт банка (isCorrection)', () => {
  // Кейс МТС: модель за 90 дней насчитала бы сильно больше, чем банк реально
  // начислил (ставка/капитализация в модели разошлись с реальностью) — юзер
  // ставит isCorrection, и «заработано» должно взять факт, а не формулу.
  const asset: Asset = {
    id: 'a6',
    instrumentId: 'i2',
    amount: 3_000_000,
    currency: 'RUB',
    rate: 15,
    openDate: '2026-01-01',
    capitalization: 'capitalize',
    payoutPeriod: 'daily',
    status: 'active',
    balanceAdjustments: [{ id: 'b1', date: '2026-04-01', amount: 3_008_322, isCorrection: true }],
  };

  test('заработано за отрезок до исправления = факт (новое тело − старое), а не модельная формула', () => {
    const d = calculate(asset, savingsInstrument, params, '2026-04-01');
    expect(d.earnedSoFar).toBeCloseTo(8_322, 2);
    // Контроль: по модели (капитализация 15% за 90 дней) вышло бы в разы больше.
    const modelGrowth = 3_000_000 * (Math.pow(1 + 0.15 / 365, 90) - 1);
    expect(d.earnedSoFar).not.toBeCloseTo(modelGrowth, 0);
  });

  test('тело после исправления = ровно исправленная сумма, дальше растёт от нее', () => {
    const d = calculate(asset, savingsInstrument, params, '2026-04-02');
    const oneDayGrowth = 3_008_322 * (Math.pow(1 + 0.15 / 365, 1) - 1);
    expect(d.balanceNow).toBeCloseTo(3_008_322 + oneDayGrowth, 2);
    expect(d.earnedSoFar).toBeCloseTo(8_322 + oneDayGrowth, 2);
  });

  test('без флага isCorrection та же цифра трактуется как реальное пополнение — доход считается по формуле (регрессия)', () => {
    const notCorrection: Asset = {
      ...asset,
      balanceAdjustments: [{ id: 'b1', date: '2026-04-01', amount: 3_008_322 }],
    };
    const d = calculate(notCorrection, savingsInstrument, params, '2026-04-01');
    const modelGrowth = 3_000_000 * (Math.pow(1 + 0.15 / 365, 90) - 1);
    expect(d.earnedSoFar).toBeCloseTo(modelGrowth, 2);
  });
});

describe('изменения ставки (rateAdjustments)', () => {
  const asset: Asset = {
    id: 'a5',
    instrumentId: 'i2',
    amount: 500_000,
    currency: 'RUB',
    rate: 12,
    openDate: '2026-01-01',
    status: 'active',
    rateAdjustments: [{ id: 'r1', date: '2026-04-01', rate: 15 }],
  };

  test('простой процент: заработанное считается по сегментам, каждый — по своей ставке', () => {
    const d = calculate(asset, savingsInstrument, params, '2026-07-01');
    const seg1Days = diffDays('2026-01-01', '2026-04-01'); // 90
    const seg2Days = diffDays('2026-04-01', '2026-07-01'); // 91
    const expected = 500_000 * 0.12 * (seg1Days / 365) + 500_000 * 0.15 * (seg2Days / 365);
    expect(d.earnedSoFar).toBeCloseTo(expected, 2);
  });

  test('до даты смены ставки — считается по старой (без «эха» из будущего)', () => {
    const before = calculate(asset, savingsInstrument, params, '2026-02-01');
    expect(before.earnedSoFar).toBeCloseTo(500_000 * 0.12 * (diffDays('2026-01-01', '2026-02-01') / 365), 2);
    expect(before.currentRate).toBe(12);
  });

  test('прогноз вперёд считается по НОВОЙ (актуальной) ставке', () => {
    const d = calculate(asset, savingsInstrument, params, '2026-07-01');
    expect(d.currentRate).toBe(15);
    expect(d.forecastNextYear).toBeCloseTo(500_000 * 0.15, 2);
    expect(d.premiumToKeyRate).toBeCloseTo(15 - 16, 6);
  });

  test('капитализация продолжает расти через смену ставки, не сбрасывается', () => {
    const capitalizing: Asset = { ...asset, capitalization: 'capitalize', payoutPeriod: 'daily' };
    const d = calculate(capitalizing, savingsInstrument, params, '2026-07-01');
    const seg1Days = diffDays('2026-01-01', '2026-04-01');
    const afterSeg1 = 500_000 * Math.pow(1 + 0.12 / 365, seg1Days);
    const seg2Days = diffDays('2026-04-01', '2026-07-01');
    const expectedBalance = afterSeg1 * Math.pow(1 + 0.15 / 365, seg2Days);
    expect(d.balanceNow).toBeCloseTo(expectedBalance, 2);
    expect(d.forecastNextYear).toBeCloseTo(expectedBalance * 0.15, 2);
  });

  test('баланс и ставка меняются в разные даты — сегменты режутся по обеим границам сразу', () => {
    const both: Asset = {
      ...asset,
      balanceAdjustments: [{ id: 'b1', date: '2026-05-01', amount: 900_000 }],
    };
    const d = calculate(both, savingsInstrument, params, '2026-07-01');
    const seg1Days = diffDays('2026-01-01', '2026-04-01'); // ставка 12, баланс 500k
    const seg2Days = diffDays('2026-04-01', '2026-05-01'); // ставка сменилась на 15, баланс ещё 500k
    const seg3Days = diffDays('2026-05-01', '2026-07-01'); // ставка 15, баланс уже 900k
    const expected =
      500_000 * 0.12 * (seg1Days / 365) +
      500_000 * 0.15 * (seg2Days / 365) +
      900_000 * 0.15 * (seg3Days / 365);
    expect(d.earnedSoFar).toBeCloseTo(expected, 2);
  });
});
