import type {
  Asset,
  FinancialInstrument,
  Organization,
} from '@/domain/types';

/**
 * Демо-портфель (решение #15). Все записи помечены isDemo — кнопка
 * «Удалить тестовые данные» в настройках чистит только их.
 *
 * Даты считаем относительно «сегодня», чтобы срез всегда выглядел живым
 * (вклады в разной стадии срока, накопительные счета).
 */

function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return iso(d);
}

export interface DemoData {
  organizations: Organization[];
  instruments: FinancialInstrument[];
  assets: Asset[];
}

export function buildDemoData(now: Date = new Date()): DemoData {
  const organizations: Organization[] = [
    { id: 'org-alfa', name: 'Альфа-Банк', type: 'Банк', color: '#EF3124', isDemo: true },
    { id: 'org-tbank', name: 'Т-Банк', type: 'Банк', color: '#FFDD2D', isDemo: true },
    { id: 'org-sber', name: 'Сбербанк', type: 'Банк', color: '#21A038', isDemo: true },
    { id: 'org-vtb', name: 'ВТБ', type: 'Банк', color: '#0A2896', isDemo: true },
  ];

  const instruments: FinancialInstrument[] = [
    {
      id: 'fi-alfa-max',
      organizationId: 'org-alfa',
      name: 'Альфа-Вклад Максимум',
      typeId: 'deposit',
      behavior: 'term',
      capitalization: 'none',
      payoutPeriod: 'end',
      isDemo: true,
    },
    {
      id: 'fi-tbank-save',
      organizationId: 'org-tbank',
      name: 'Накопительный счёт',
      typeId: 'savings',
      behavior: 'perpetual',
      capitalization: 'capitalize',
      payoutPeriod: 'monthly',
      isDemo: true,
    },
    {
      id: 'fi-sber-best',
      organizationId: 'org-sber',
      name: 'Лучший %',
      typeId: 'deposit',
      behavior: 'term',
      capitalization: 'none',
      payoutPeriod: 'monthly',
      isDemo: true,
    },
    {
      id: 'fi-vtb-new',
      organizationId: 'org-vtb',
      name: 'Новые деньги',
      typeId: 'deposit',
      behavior: 'term',
      capitalization: 'none',
      payoutPeriod: 'end',
      isDemo: true,
    },
  ];

  const assets: Asset[] = [
    {
      id: 'as-1',
      instrumentId: 'fi-alfa-max',
      title: 'Подушка безопасности',
      amount: 2_000_000,
      currency: 'RUB',
      rate: 18.5,
      openDate: shiftDays(now, -120),
      endDate: shiftDays(now, 60),
      status: 'active',
      isDemo: true,
    },
    {
      id: 'as-2',
      instrumentId: 'fi-tbank-save',
      amount: 850_000,
      currency: 'RUB',
      rate: 16,
      openDate: shiftDays(now, -200),
      status: 'active',
      isDemo: true,
    },
    {
      id: 'as-3',
      instrumentId: 'fi-sber-best',
      title: 'Отпуск 2027',
      amount: 1_200_000,
      currency: 'RUB',
      rate: 17,
      openDate: shiftDays(now, -30),
      endDate: shiftDays(now, 335),
      status: 'active',
      isDemo: true,
    },
    {
      id: 'as-4',
      instrumentId: 'fi-vtb-new',
      amount: 3_000_000,
      currency: 'RUB',
      rate: 19,
      openDate: shiftDays(now, -250),
      endDate: shiftDays(now, 8),
      status: 'active',
      isDemo: true,
    },
  ];

  return { organizations, instruments, assets };
}
