import type { CurrencyCode } from '@/domain/types';
import type { RateSnapshot } from '@/storage/types';

/**
 * Курсы ЦБ РФ через cbr-xml-daily.ru (официальные курсы ЦБ, раз в сутки).
 * Возвращаем ₽ за 1 единицу валюты.
 */
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const WANTED: CurrencyCode[] = ['USD', 'EUR', 'TRY', 'KZT', 'BYN', 'CNY', 'INR', 'AED', 'BRL', 'ARS'];

interface CbrValute {
  Value: number;
  Nominal: number;
}

function parseValute(json: { Valute?: Record<string, CbrValute> }): Partial<Record<CurrencyCode, number>> {
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

export async function fetchCbrRates(): Promise<Partial<Record<CurrencyCode, number>>> {
  const res = await fetch(CBR_URL);
  if (!res.ok) throw new Error(`CBR ${res.status}`);
  return parseValute((await res.json()) as { Valute?: Record<string, CbrValute> });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** История курса с архива ЦБ: каждый день за последние 30 дней (месяц).
 *  По будням ЦБ публикует курс — выходные/праздники отсеются (fetch не пройдёт),
 *  поэтому остаются только реальные точки ЦБ, а пятница→понедельник просто соединяются.
 *
 *  «Сегодня» намеренно НЕ запрашиваем из архива: архивный эндпоинт на текущий день
 *  либо ещё не опубликован, либо задваивает вчерашний курс — а живое сегодняшнее
 *  значение уже надёжно приходит через fetchCbrRates()/appendSnapshot. Если бэкфилл
 *  всё же перетрёт его тем же архивным запросом, дневной бейдж истории курса
 *  внезапно покажет нулевую разницу (сегодня == вчера). */
export async function fetchCbrHistory(): Promise<RateSnapshot[]> {
  const today = new Date();
  const targets: { date: string; url: string }[] = [];
  // Чуть глубже месяца, чтобы захватить пятничный курс до начала окна (он же — курс на выходные).
  // i начинается с 1 — «сегодня» пропускаем (см. комментарий выше).
  for (let i = 1; i <= 35; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    targets.push({
      date: `${y}-${m}-${day}`,
      url: `https://www.cbr-xml-daily.ru/archive/${y}/${m}/${day}/daily_json.js`,
    });
  }

  const results = await Promise.allSettled(
    targets.map(async (target): Promise<RateSnapshot> => {
      const res = await fetch(target.url);
      if (!res.ok) throw new Error(`CBR archive ${res.status}`);
      return { date: target.date, rates: parseValute((await res.json()) as { Valute?: Record<string, CbrValute> }) };
    }),
  );

  const out: RateSnapshot[] = [];
  for (const r of results) if (r.status === 'fulfilled') out.push(r.value);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
