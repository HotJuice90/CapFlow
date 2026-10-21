import type { Asset, CalcParams, FinancialInstrument } from '@/domain/types';
import { calculate, classifyLegacyWithdrawals, guessWithdrawalKind, isRoundSum } from './engine';

const params: CalcParams = { taxRate: 13, taxFreeLimit: 210_000, keyRate: 16 };

/** Накопительный с ежемесячной выплатой без капитализации — как «Доходный» ГПБ. */
const monthly: FinancialInstrument = {
  id: 'i-m', organizationId: 'o1', name: 'Доходный', typeId: 'savings',
  behavior: 'perpetual', capitalization: 'none', payoutPeriod: 'monthly',
};

/** Накопительный с ежедневной капитализацией — как Ozon / МТС. */
const daily: FinancialInstrument = {
  id: 'i-d', organizationId: 'o2', name: 'Ежедневный', typeId: 'savings',
  behavior: 'perpetual', capitalization: 'capitalize', payoutPeriod: 'daily',
};

const base = (over: Partial<Asset>): Asset => ({
  id: 'a', instrumentId: 'i', amount: 1_000_000, currency: 'RUB', rate: 12.75,
  openDate: '2026-08-11', status: 'active', ...over,
});

/** Остаток так, как его записывала старая форма: тело модели минус введённая сумма. */
const oldStored = (asset: Asset, inst: FinancialInstrument, date: string, delta: number) =>
  calculate(asset, inst, params, date).balanceNow - delta;

describe('guessWithdrawalKind', () => {
  it('ровные тысячи — тело, даже если процентов хватает', () => {
    expect(isRoundSum(100_000)).toBe(true);
    expect(isRoundSum(99_999.9999)).toBe(true);
    expect(guessWithdrawalKind(100_000, 300_000)).toBe('body');
    expect(guessWithdrawalKind(5_000, 300_000)).toBe('body');
  });

  it('сумма с хвостом в пределах процентов — проценты', () => {
    expect(guessWithdrawalKind(7_336, 7_335.6)).toBe('interest');
    expect(guessWithdrawalKind(4_730, 4_800)).toBe('interest');
  });

  it('с хвостом, но больше процентов на счёте — тело: столько процентов нет', () => {
    expect(guessWithdrawalKind(15_500, 4_800)).toBe('body');
  });

  it('пополнение — всегда тело', () => {
    expect(guessWithdrawalKind(-7_336, 100_000)).toBe('body');
  });
});

describe('вывод процентов обычным снятием (старые записи)', () => {
  // 1 сентября банк выплатил проценты за август, человек их снял — тело в
  // банке осталось миллионом. Старая модель записала это как снятие из тела.
  const open = base({ payoutsSince: '2026-09-28' });
  const augInterest = 1_000_000 * 0.1275 * 21 / 365; // 11 → 31 августа
  const legacy = base({
    payoutsSince: '2026-09-28',
    balanceAdjustments: [{ id: 'w1', date: '2026-09-01', amount: oldStored(open, monthly, '2026-09-01', 7_336) }],
  });

  it('до разметки тело «худеет» на сумму процентов — это и есть баг', () => {
    expect(calculate(legacy, monthly, params, '2026-10-21').invested).toBeCloseTo(992_664, 0);
  });

  it('после разметки тело ровное, снятие помечено процентами', () => {
    const fixed = classifyLegacyWithdrawals(legacy, monthly);
    expect(fixed.balanceAdjustments![0].kind).toBe('interest');
    const d = calculate(fixed, monthly, params, '2026-10-21');
    expect(d.invested).toBeCloseTo(1_000_000, 2);
  });

  it('сентябрь считается от миллиона, а не от урезанного тела', () => {
    const fixed = classifyLegacyWithdrawals(legacy, monthly);
    const sep = calculate(fixed, monthly, params, '2026-10-01').accrued
      - calculate(fixed, monthly, params, '2026-09-01').accrued;
    expect(sep).toBeCloseTo(1_000_000 * 0.1275 * 30 / 365, 1);
    expect(augInterest).toBeGreaterThan(7_335); // в банке выплатили столько, сколько сняли
  });

  it('на счёте — тело плюс проценты текущего месяца, без «хвоста» августа', () => {
    const fixed = classifyLegacyWithdrawals(legacy, monthly);
    const d = calculate(fixed, monthly, params, '2026-09-21');
    expect(d.currentValue).toBeCloseTo(1_000_000 + 1_000_000 * 0.1275 * 20 / 365, 0);
  });

  it('пополнение после вывода процентов сохраняет свою величину', () => {
    const withTopUp = base({
      payoutsSince: '2026-09-28',
      balanceAdjustments: [
        legacy.balanceAdjustments![0],
        { id: 't1', date: '2026-09-10', amount: oldStored(legacy, monthly, '2026-09-10', -100_000) },
      ],
    });
    const fixed = classifyLegacyWithdrawals(withTopUp, monthly);
    expect(fixed.balanceAdjustments![1].kind).toBe('body');
    expect(calculate(fixed, monthly, params, '2026-09-20').invested).toBeCloseTo(1_100_000, 2);
  });

  it('разметка повторно ничего не меняет', () => {
    const once = classifyLegacyWithdrawals(legacy, monthly);
    expect(classifyLegacyWithdrawals(once, monthly)).toBe(once);
  });
});

describe('ежедневная капитализация', () => {
  const open = base({ amount: 500_000, rate: 11.5, openDate: '2026-08-01' });
  const open_ = (amount: number) => ({ ...open, amount });

  it('вывод всех процентов с хвостом — тело остаётся ровным', () => {
    const before = calculate(open, daily, params, '2026-09-01').balanceNow;
    const legacy = { ...open, balanceAdjustments: [{ id: 'w', date: '2026-09-01', amount: 500_000 }] };
    expect(before - 500_000).toBeGreaterThan(4_000); // это и были проценты
    const withTopUp = {
      ...legacy,
      balanceAdjustments: [
        ...legacy.balanceAdjustments,
        { id: 't', date: '2026-09-18', amount: oldStored(legacy, daily, '2026-09-18', -300_000) },
      ],
    };
    const fixed = classifyLegacyWithdrawals(withTopUp, daily);
    expect(fixed.balanceAdjustments!.map((a) => a.kind)).toEqual(['interest', 'body']);
    expect(calculate(fixed, daily, params, '2026-10-21').invested).toBeCloseTo(800_000, 0);
  });

  it('ровное снятие из тела остаётся снятием из тела', () => {
    const legacy = {
      ...open,
      amount: 2_000_000,
      balanceAdjustments: [{ id: 'w', date: '2026-10-01', amount: oldStored(open_(2_000_000), daily, '2026-10-01', 100_000) }],
    };
    const fixed = classifyLegacyWithdrawals(legacy, daily);
    expect(fixed.balanceAdjustments![0].kind).toBe('body');
    expect(calculate(fixed, daily, params, '2026-10-21').invested).toBeCloseTo(1_900_000, 0);
  });
});

describe('новые записи с явным типом', () => {
  it('снятие «процентами» на ежедневной капитализации не трогает тело', () => {
    const a = base({ amount: 2_000_000, openDate: '2026-08-01' });
    const before = calculate(a, daily, params, '2026-10-01').balanceNow;
    const withdrawn = { ...a, balanceAdjustments: [{ id: 'w', date: '2026-10-01', amount: before - 12_345.67, kind: 'interest' as const }] };
    const d = calculate(withdrawn, daily, params, '2026-10-01');
    expect(d.invested).toBeCloseTo(2_000_000, 0);
    expect(d.currentValue).toBeCloseTo(before - 12_345.67, 2);
  });

  it('снятие «из тела» уменьшает тело, как раньше', () => {
    const a = base({ amount: 2_000_000, openDate: '2026-08-01' });
    const before = calculate(a, daily, params, '2026-10-01').balanceNow;
    const withdrawn = { ...a, balanceAdjustments: [{ id: 'w', date: '2026-10-01', amount: before - 100_000, kind: 'body' as const }] };
    expect(calculate(withdrawn, daily, params, '2026-10-01').invested).toBeCloseTo(1_900_000, 0);
  });
});
