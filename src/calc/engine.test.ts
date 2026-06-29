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
    expect(d.forecastNextMonth).toBeCloseTo((500_000 * 0.16) / 12, 2);
  });
});
