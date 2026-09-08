/**
 * Данные → характер поведения hero-поля (не диаграмма!).
 *
 * Правило из спеки: цифры управляют температурой, плотностью и амплитудой,
 * но пользователь не должен уметь «прочитать» по полю конкретные суммы.
 * Поэтому здесь всё сглажено smoothstep'ами и загнано в узкий диапазон —
 * между обычным и хорошим днём разница ощущается, а не считывается.
 */

export interface HeroState {
  /** 0..1 — живость: амплитуда варпа, плотность массы, альфа. */
  intensity: number;
  /** 0..1 — сдвиг палитры в мятно-зелёный. */
  warmth: number;
  /** Подпись под суммой. */
  label: string;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * `cumulative` — накопительный ряд дохода из incomeSparkline (последние N дней).
 * Средний дневной берём как наклон ряда: для портфеля фикс-инструментов он
 * почти константа, и заметно расходится с сегодняшним только когда портфель
 * реально изменился — именно этот момент и должен «оживлять» поле.
 */
export function heroState(args: {
  incomePerDay: number;
  cumulative: number[];
  assetCount: number;
}): HeroState {
  const { incomePerDay, cumulative, assetCount } = args;
  const n = cumulative.length;
  const avg = n >= 2 ? (cumulative[n - 1] - cumulative[0]) / (n - 1) : incomePerDay;
  const ratio = avg > 0 ? incomePerDay / avg : 1;

  // Ширина портфеля даёт лёгкий постоянный вклад: пять работающих активов
  // ощущаются живее одного даже в самый обычный день.
  const breadth = Math.min(1, assetCount / 5);

  const above = smoothstep(0.98, 1.35, ratio);
  const below = 1 - smoothstep(0.72, 0.98, ratio);

  const intensity = Math.min(1, Math.max(0.18,
    0.42 + 0.34 * above - 0.18 * below + 0.12 * breadth,
  ));
  const warmth = Math.min(1, 0.10 + 0.90 * smoothstep(1.0, 1.4, ratio));

  const label = ratio >= 1.12 ? 'Выше среднего' : ratio <= 0.88 ? 'Спокойный день' : 'сегодня';
  return { intensity, warmth, label };
}
