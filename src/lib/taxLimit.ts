const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export interface LimitEta {
  /** При текущем темпе лимит в этом году не кончится (с 1 января он обнуляется). */
  beyondYear: boolean;
  /** Треть месяца: 0 — начало, 1 — середина, 2 — конец. */
  third: 0 | 1 | 2;
  month: number;
}

/**
 * Когда при текущем темпе кончится необлагаемый лимит. День в день это не
 * угадать (сроки вкладов, смена ставок), поэтому точность — треть месяца.
 * Дальше 31 декабря не считаем. Пробит или дохода нет — null.
 */
export function limitEta(remain: number, perDay: number, over: boolean, now: Date = new Date()): LimitEta | null {
  if (over || perDay <= 0 || remain <= 0) return null;
  const at = new Date(now.getTime() + (remain / perDay) * 86_400_000);
  if (at.getFullYear() > now.getFullYear()) return { beyondYear: true, third: 2, month: 11 };
  const d = at.getDate();
  return { beyondYear: false, third: d <= 10 ? 0 : d <= 20 ? 1 : 2, month: at.getMonth() };
}

/** Для карточки: «~ хватит до середины ноября». */
export function limitEtaUntil(eta: LimitEta): string {
  if (eta.beyondYear) return '~ хватит до конца года';
  return `~ хватит до ${['начала', 'середины', 'конца'][eta.third]} ${MONTHS_GEN[eta.month]}`;
}

/** Для строки шита «~ лимит кончится …»: «в середине ноября». */
export function limitEtaWhen(eta: LimitEta): string {
  if (eta.beyondYear) return 'не в этом году';
  return `в ${['начале', 'середине', 'конце'][eta.third]} ${MONTHS_GEN[eta.month]}`;
}
