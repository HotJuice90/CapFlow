/**
 * Реестр банков из нашего SVG-набора (id → название + фирменный цвет).
 * id совпадает с именем файла в assets/banks/<id>.svg (+ <id>-w.svg для белого варианта).
 * Используется при выборе организации: подставляет имя, цвет и лого автоматически.
 */
export const BANKS: { id: string; name: string; color: string; url: string }[] = [
  { id: 'alfa',        name: 'Альфа-Банк',  color: '#EF3124', url: 'https://alfabank.ru' },
  { id: 'sber',        name: 'Сбербанк',    color: '#21A038', url: 'https://www.sberbank.ru' },
  { id: 'tbank',       name: 'Т-Банк',      color: '#1D1D1B', url: 'https://www.tbank.ru' },
  { id: 'vtb',         name: 'ВТБ',         color: '#0A2896', url: 'https://www.vtb.ru' },
  { id: 'gazprombank', name: 'Газпромбанк', color: '#0F60A8', url: 'https://www.gazprombank.ru' },
  { id: 'ozon',        name: 'OZON Банк',   color: '#005BFF', url: 'https://finance.ozon.ru' },
  { id: 'wb',          name: 'WB Кошелёк',  color: '#A73AFD', url: 'https://www.wildberries.ru' },
  { id: 'mts',         name: 'МТС Банк',    color: '#E30611', url: 'https://www.mtsbank.ru' },
  { id: 'otp',         name: 'ОТП Банк',    color: '#6BBE45', url: 'https://www.otpbank.ru' },
  { id: 'sovcombank',  name: 'Совкомбанк',  color: '#E2231A', url: 'https://sovcombank.ru' },
  { id: 'yandex',      name: 'Яндекс',      color: '#FC3F1D', url: 'https://bank.yandex.ru' },
];

export function findBank(id?: string) {
  return id ? BANKS.find((b) => b.id === id) : undefined;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s-]/g, '');
}

/** Находит банк по точному совпадению названия (без учёта пробелов/дефисов/регистра). */
export function findBankByName(name: string) {
  const n = normalizeName(name);
  return BANKS.find((b) => normalizeName(b.name) === n);
}
