import { migrate } from './migrate';
import { emptyAppData, type AppData } from './types';

const history = [
  { date: '2026-06-22', rate: 14.25 },
  { date: '2025-12-22', rate: 16 },
];

describe('migrate', () => {
  it('переживает сохранение без settings и params', () => {
    const broken = { ...emptyAppData(), assets: [], settings: undefined, params: undefined } as unknown as AppData;
    const next = migrate(broken);
    expect(next.settings.defaultCurrency).toBe('RUB');
    expect(next.params.taxRate).toBe(13);
  });

  it('переживает сохранение без массивов', () => {
    const broken = { schemaVersion: 1, settings: {}, params: {} } as unknown as AppData;
    const next = migrate(broken);
    expect(next.assets).toEqual([]);
    expect(next.organizations).toEqual([]);
    expect(next.instruments).toEqual([]);
  });

  it('подтягивает ключевую ставку из истории, а не оставляет сохранённую', () => {
    const stale = { ...emptyAppData(), keyRateHistory: history, params: { taxRate: 13, keyRate: 16, taxFreeLimit: 160_000 } };
    expect(migrate(stale).params.keyRate).toBe(14.25);
  });

  it('пересчитывает необлагаемый лимит, пока он не задан руками', () => {
    const data = { ...emptyAppData(), keyRateHistory: history, params: { taxRate: 13, keyRate: 16, taxFreeLimit: 999 } };
    expect(migrate(data).params.taxFreeLimit).toBe(160_000);
  });

  it('добирает отметку о сверке с ЦБ, если её не было', () => {
    const old = { ...emptyAppData(), keyRateUpdatedAt: undefined } as unknown as AppData;
    expect(migrate(old).keyRateUpdatedAt).toBeNull();
  });

  it('не затирает уже проставленную отметку о сверке', () => {
    const data = { ...emptyAppData(), keyRateUpdatedAt: '2026-09-20T10:00:00.000Z' };
    expect(migrate(data).keyRateUpdatedAt).toBe('2026-09-20T10:00:00.000Z');
  });

  it('правит налог в уже зафиксированной записи за 2022 год, не трогая доход', () => {
    const data = {
      ...emptyAppData(),
      taxYearRecords: [
        {
          id: 't22', year: 2022, createdAt: '2023-01-01T00:00:00.000Z',
          keyRateUsed: 20, taxFreeLimit: 200_000,
          taxableIncome: 500_000, taxDue: 39_000, taxWithheld: 0, taxToPaySelf: 39_000,
        },
        {
          id: 't23', year: 2023, createdAt: '2024-01-01T00:00:00.000Z',
          keyRateUsed: 15, taxFreeLimit: 150_000,
          taxableIncome: 500_000, taxDue: 45_500, taxWithheld: 0, taxToPaySelf: 45_500,
        },
      ],
    };
    const [r22, r23] = migrate(data).taxYearRecords;
    expect(r22.taxToPaySelf).toBe(0);
    expect(r22.taxDue).toBe(0);
    expect(r22.taxableIncome).toBe(500_000);
    expect(r23.taxToPaySelf).toBe(45_500);
  });

  it('НЕ трогает лимит, заданный руками', () => {
    const data = {
      ...emptyAppData(),
      keyRateHistory: history,
      params: { taxRate: 13, keyRate: 16, taxFreeLimit: 999, taxFreeLimitManual: true },
    };
    expect(migrate(data).params.taxFreeLimit).toBe(999);
  });
});
