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
  it('размечает старые снятия: проценты с хвостом — процентами, ровные — телом', () => {
    const data = {
      ...emptyAppData(),
      instruments: [{
        id: 'i', organizationId: 'o', name: 'Доходный', typeId: 'savings',
        behavior: 'perpetual', capitalization: 'none', payoutPeriod: 'monthly',
      }],
      assets: [{
        id: 'a', instrumentId: 'i', amount: 1_000_000, currency: 'RUB', rate: 12.75,
        openDate: '2026-08-11', status: 'active', payoutsSince: '2026-09-28',
        balanceAdjustments: [
          { id: 'w1', date: '2026-09-01', amount: 992_664 },
          { id: 'w2', date: '2026-09-15', amount: 892_664 },
        ],
      }],
    } as unknown as AppData;
    const adj = migrate(data).assets[0].balanceAdjustments!;
    expect(adj.map((a) => a.kind)).toEqual(['interest', 'body']);
    // ровные 100 000 из тела отложены от нового, неурезанного тела
    expect(adj[1].amount).toBeCloseTo(900_000, 2);
  });

  it('разметка не повторяется на следующей загрузке', () => {
    const once = migrate({
      ...emptyAppData(),
      instruments: [{ id: 'i', organizationId: 'o', name: 'x', typeId: 'savings', behavior: 'perpetual', capitalization: 'none', payoutPeriod: 'monthly' }],
      assets: [{ id: 'a', instrumentId: 'i', amount: 1_000_000, currency: 'RUB', rate: 12.75, openDate: '2026-08-11', status: 'active', balanceAdjustments: [{ id: 'w1', date: '2026-09-01', amount: 992_664 }] }],
    } as unknown as AppData);
    expect(migrate(once).assets[0]).toBe(once.assets[0]);
  });
});
