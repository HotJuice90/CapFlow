import { heroState } from './heroState';

const base = {
  incomePerDay: 1000,
  daily: Array(30).fill(1000),
  assetCount: 4,
  workingCapital: 1_000_000,
  freeCapital: 0,
  premiumToKeyRate: 0,
};

describe('heroState', () => {
  it('половина капитала вне активов — капитал дремлет', () => {
    expect(heroState({ ...base, freeCapital: 1_200_000 }).label).toBe('Капитал дремлет');
  });

  it('заметная часть денег не в деле — ждут дела', () => {
    expect(heroState({ ...base, freeCapital: 400_000 }).label).toBe('Деньги ждут дела');
  });

  it('всё в работе, но ставка ниже ключевой — работает ровно', () => {
    expect(heroState({ ...base, premiumToKeyRate: -3 }).label).toBe('Работает ровно');
  });

  it('всё в работе на уровне ключевой — хороший темп', () => {
    expect(heroState(base).label).toBe('Хороший темп');
  });

  it('всё в работе с заметной премией — на полном ходу', () => {
    expect(heroState({ ...base, premiumToKeyRate: 4 }).label).toBe('На полном ходу');
  });

  it('эпитет не скачет от разового всплеска дохода', () => {
    const spike = heroState({ ...base, incomePerDay: 2000 });
    expect(spike.label).toBe(heroState(base).label);
    // ...но поле от него оживает
    expect(spike.intensity).toBeGreaterThan(heroState(base).intensity);
  });

  it('пустой портфель не роняет расчёт', () => {
    const e = heroState({ ...base, daily: [], workingCapital: 0, incomePerDay: 0 });
    expect(e.label).toBe('Капитал дремлет');
    expect(e.intensity).toBeGreaterThanOrEqual(0.18);
  });
});
