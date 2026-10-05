import { BANK_TIMING, brandOf, timingForOrg, timingsBy } from './bankTiming';

describe('bankTiming', () => {
  it('каждая площадка попала ровно в одну группу открытия', () => {
    const total = timingsBy('lastDay').length + timingsBy('firstDay').length + timingsBy('anyDay').length;
    expect(total).toBe(BANK_TIMING.length);
  });

  it('названия не дублируются — иначе шит откроет не ту запись', () => {
    const names = BANK_TIMING.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('лого подтягивается из реестра банков', () => {
    expect(BANK_TIMING.find((t) => t.name === 'Газпромбанк')?.bankId).toBe('gazprombank');
    expect(BANK_TIMING.find((t) => t.name === 'Сбербанк')?.bankId).toBe('sber');
    // Банка нет в нашем SVG-наборе — поле пустое, в карточке будет монограмма.
    expect(BANK_TIMING.find((t) => t.name === 'Хлынов')?.bankId).toBeUndefined();
  });

  it('продукт уходит во вторую строку, бренд остаётся названием', () => {
    const cashbox = BANK_TIMING.find((t) => t.name === 'МТС Банк «Кешбокс»')!;
    expect(brandOf(cashbox)).toBe('МТС Банк');
    expect(cashbox.product).toBe('Кешбокс');
    // Продукт из уточнения, а не из названия, тоже доезжает до карточки.
    expect(BANK_TIMING.find((t) => t.name === 'ТКБ')?.product).toBe('Выгодный');
  });

  it('лого берётся по бренду, если в названии есть продукт', () => {
    expect(BANK_TIMING.find((t) => t.name === 'МТС Банк «Кешбокс»')?.bankId).toBe('mts');
  });

  it('площадка находится по id лого, даже если названа иначе', () => {
    expect(timingForOrg({ name: 'ГПБ Инвестиции', logo: 'gazprombank' })?.name).toBe('Газпромбанк');
  });

  it('площадка находится по сокращённому названию', () => {
    expect(timingForOrg({ name: 'Сбер' })?.name).toBe('Сбербанк');
    expect(timingForOrg({ name: 'Альфа' })?.name).toBe('Альфа-Банк');
  });

  it('из нескольких совпадений берётся самое длинное', () => {
    // «Реалист» и «Реалист «Премиальный старт»» — РАЗНЫЕ группы открытия, и по
    // первому совпадению площадка с продуктом в названии ушла бы не туда.
    const plain = timingForOrg({ name: 'Реалист' });
    const product = timingForOrg({ name: 'Реалист Премиальный старт' });
    expect(plain?.openWhen).toBe('firstDay');
    expect(product?.name).toBe('Реалист «Премиальный старт»');
    expect(product?.openWhen).toBe('anyDay');
  });

  it('слишком короткое имя не цепляет случайный банк', () => {
    // «Т» — префикс «ТКБ», и префиксный поиск дал бы уверенный, но неверный ответ.
    expect(timingForOrg({ name: 'Т' })).toBeUndefined();
    expect(timingForOrg({ name: '' })).toBeUndefined();
  });

  it('незнакомая площадка не находится', () => {
    expect(timingForOrg({ name: 'Мой сейф под кроватью' })).toBeUndefined();
  });
});
