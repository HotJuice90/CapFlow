import { currentKeyRate, maxKeyRateForYear, taxFreeLimitForYear } from './keyRate';

const history = [
  { date: '2026-06-22', rate: 14.25 },
  { date: '2026-04-27', rate: 14.5 },
  { date: '2026-03-23', rate: 15 },
  { date: '2026-02-16', rate: 15.5 },
  { date: '2025-12-22', rate: 16 },
  { date: '2025-10-27', rate: 16.5 },
];

describe('currentKeyRate', () => {
  it('берёт последнюю вступившую в силу, а не первую в списке', () => {
    expect(currentKeyRate(history, new Date(2026, 8, 26))).toBe(14.25);
  });

  it('не берёт точку, которая ещё не вступила в силу', () => {
    const announced = [{ date: '2026-12-01', rate: 13 }, ...history];
    expect(currentKeyRate(announced, new Date(2026, 8, 26))).toBe(14.25);
  });

  it('на дату до начала истории — 0', () => {
    expect(currentKeyRate(history, new Date(2020, 0, 1))).toBe(0);
  });
});

describe('taxFreeLimitForYear', () => {
  it('2026: максимум на 1-е число — 16% (январь), лимит 160 000', () => {
    expect(maxKeyRateForYear(history, 2026)).toBe(16);
    expect(taxFreeLimitForYear(history, 2026)).toBe(160_000);
  });

  it('2027: ставка весь год держится на последней известной', () => {
    expect(taxFreeLimitForYear(history, 2027)).toBe(142_500);
  });

  it('снижение внутри года не опускает лимит ниже максимума', () => {
    // На 1 января 2026 действовали 16% — они и задают лимит, хотя к июню 14,25%.
    expect(taxFreeLimitForYear(history, 2026)).toBeGreaterThan(taxFreeLimitForYear(history, 2027));
  });
});
