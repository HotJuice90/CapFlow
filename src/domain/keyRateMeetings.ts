/**
 * График заседаний Совета директоров Банка России по ключевой ставке
 * (cbr.ru/dkp/cal_mp/). Только даты: решение может и не менять ставку, и
 * тогда в истории ставки такого заседания не видно вовсе — а человеку важно,
 * что ЦБ собирался и ставку СОХРАНИЛ, а не что «данные с июля».
 *
 * Список бэйзлайновый и обновляется РУКАМИ: машиночитаемого фида у графика нет,
 * ЦБ публикует его на год вперёд отдельной страницей. Когда появится расписание
 * на 2027-й — дописать сюда; пока оно не дописано, строка «следующее заседание»
 * просто не показывается (см. nextMeeting), а не врёт.
 *
 * Актуально на 26.09.2026.
 */
export const KEY_RATE_MEETINGS: string[] = [
  '2026-02-13',
  '2026-03-20',
  '2026-04-24',
  '2026-06-19',
  '2026-07-24',
  '2026-09-11',
  '2026-10-23',
  '2026-12-18',
];

function todayIso(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Последнее СОСТОЯВШЕЕСЯ заседание, или undefined — если график ещё не начался. */
export function lastMeeting(now: Date = new Date(), meetings = KEY_RATE_MEETINGS): string | undefined {
  const today = todayIso(now);
  let best: string | undefined;
  for (const d of meetings) {
    if (d <= today && (!best || d > best)) best = d;
  }
  return best;
}

/** Ближайшее предстоящее заседание, или undefined — если график кончился. */
export function nextMeeting(now: Date = new Date(), meetings = KEY_RATE_MEETINGS): string | undefined {
  const today = todayIso(now);
  let best: string | undefined;
  for (const d of meetings) {
    if (d > today && (!best || d < best)) best = d;
  }
  return best;
}

/**
 * Что сделало последнее заседание со ставкой. Решение вступает в силу не в день
 * заседания, а через несколько дней — поэтому «изменили» определяем по тому,
 * появилась ли в истории точка НЕ РАНЬШЕ даты заседания, а не по совпадению дат.
 */
export function meetingOutcome(
  meeting: string | undefined,
  changeDates: string[],
): 'kept' | 'changed' | 'unknown' {
  if (!meeting) return 'unknown';
  return changeDates.some((d) => d >= meeting) ? 'changed' : 'kept';
}
