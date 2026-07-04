import type { KeyRatePoint } from '@/domain/keyRateHistory';

/**
 * Ключевая ставка ЦБ РФ — официальный SOAP-веб-сервис cbr.ru (не JSON/REST,
 * но первоисточник, без ключей и авторизации). Метод отдаёт ставку на КАЖДЫЙ
 * день за период — тут схлопываем подряд идущие одинаковые дни в точки
 * изменений, как и в статичном src/domain/keyRateHistory.ts (это стартовый
 * фолбэк, пока не подтянута/сохранена реальная история).
 *
 * Прошлое не меняется — поэтому каждый раз тянем НЕ с 2013 года, а только
 * от последней уже сохранённой даты и мержим: почти всегда это пара строк.
 */
const SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';
// «Данные доступны с 17.09.2013» — так пишет сам cbr.ru на странице ключевой ставки.
export const EARLIEST_DATE = '2013-09-17';

function buildEnvelope(fromDate: string, toDate: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <KeyRateXML xmlns="http://web.cbr.ru/">
      <fromDate>${fromDate}</fromDate>
      <ToDate>${toDate}</ToDate>
    </KeyRateXML>
  </soap:Body>
</soap:Envelope>`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Тянет дневные ставки за [fromDate, сегодня] и схлопывает в точки изменений.
 * `fromDate` должен быть ≤ дате последней уже известной точки — иначе, если
 * ставка не менялась с более раннего момента, первый день окна ошибочно
 * определится как «дата изменения» (хотя изменение было раньше).
 */
export async function fetchKeyRateHistory(fromDate: string = EARLIEST_DATE): Promise<KeyRatePoint[]> {
  const res = await fetch(SOAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://web.cbr.ru/KeyRateXML',
    },
    body: buildEnvelope(fromDate, todayIso()),
  });
  if (!res.ok) throw new Error(`cbr.ru ответил ${res.status}`);
  const xml = await res.text();

  // Формат стабильный: <KR><DT>2026-07-03T00:00:00+03:00</DT><Rate>14.25</Rate></KR>,
  // сервис отдаёт от новых дат к старым.
  const rowRe = /<DT>(\d{4}-\d{2}-\d{2})T[^<]*<\/DT>\s*<Rate>([\d.]+)<\/Rate>/g;
  const daily: { date: string; rate: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(xml)) !== null) {
    daily.push({ date: m[1], rate: parseFloat(m[2]) });
  }
  if (daily.length === 0) throw new Error('Пустой ответ от cbr.ru');

  // Переворачиваем в хронологический порядок, чтобы точкой изменения считать
  // ПЕРВЫЙ день нового значения (а не последний день старого).
  const chronological = [...daily].reverse();
  const changePoints: KeyRatePoint[] = [];
  let prevRate: number | undefined;
  for (const { date, rate } of chronological) {
    if (rate !== prevRate) {
      changePoints.push({ date, rate });
      prevRate = rate;
    }
  }
  return changePoints.reverse(); // новые сверху — как в статичном списке
}

/** Объединяет сохранённую историю со свежевыгруженной — по дате, новые сверху. */
export function mergeKeyRateHistory(stored: KeyRatePoint[], fetched: KeyRatePoint[]): KeyRatePoint[] {
  const byDate = new Map(stored.map((p) => [p.date, p]));
  for (const p of fetched) byDate.set(p.date, p);
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}
