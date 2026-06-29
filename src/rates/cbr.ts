import type { CurrencyCode } from '@/domain/types';

/**
 * Курсы ЦБ РФ. Берём готовый JSON (cbr-xml-daily.ru) — отражает официальные
 * курсы ЦБ, обновляется раз в сутки. Возвращаем ₽ за 1 единицу валюты.
 */
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

interface CbrValute {
  Value: number;
  Nominal: number;
}

const WANTED: CurrencyCode[] = ['USD', 'EUR', 'TRY', 'CNY'];

export async function fetchCbrRates(): Promise<Partial<Record<CurrencyCode, number>>> {
  const res = await fetch(CBR_URL);
  if (!res.ok) throw new Error(`CBR ${res.status}`);
  const json = (await res.json()) as { Valute?: Record<string, CbrValute> };
  const valute = json.Valute ?? {};

  const out: Partial<Record<CurrencyCode, number>> = { RUB: 1 };
  for (const code of WANTED) {
    const item = valute[code];
    if (item && item.Value > 0 && item.Nominal > 0) {
      out[code] = item.Value / item.Nominal;
    }
  }
  return out;
}
