/**
 * Данные → характер поведения hero-поля и подпись под суммой.
 *
 * Правило из спеки: цифры управляют температурой, плотностью и амплитудой,
 * но пользователь не должен уметь «прочитать» по полю конкретные суммы.
 * Поэтому всё сглажено smoothstep'ами и загнано в узкий диапазон — между
 * обычным и хорошим состоянием разница ощущается, а не считывается.
 */

import { tokens } from '@/theme';

export interface HeroState {
  /** 0..1 — живость: амплитуда варпа, плотность массы, альфа. */
  intensity: number;
  /** 0..1 — сдвиг палитры в мятно-зелёный. */
  warmth: number;
  /** Эпитет состояния капитала под суммой. */
  label: string;
  /** Цвет точки перед эпитетом — та же шкала, но видна боковым зрением. */
  tone: string;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Шкала эпитетов идёт по ЗАГРУЗКЕ капитала, а не по «сегодня против вчера».
 * У портфеля фикс-инструментов дневной доход почти константа: шкала на нём
 * месяцами показывала бы одно слово и оживала только в день, когда человек
 * сам что-то добавил. Загрузка же отвечает на вопрос, который к капиталу
 * действительно можно задать: все ли деньги в деле и под какую ставку.
 */
const EPITHETS: { upTo: number; label: string; tone: string }[] = [
  // Три тона на пять ступеней: точка — не индикатор с делениями, она лишь
  // отделяет «деньги простаивают» от «работают» и от «работают хорошо».
  { upTo: 0.18, label: 'Капитал дремлет', tone: tokens.text.tertiary },
  { upTo: 0.42, label: 'Деньги ждут дела', tone: tokens.text.tertiary },
  { upTo: 0.68, label: 'Работает ровно', tone: tokens.category.savings },
  { upTo: 0.88, label: 'Хороший темп', tone: tokens.semantic.positive },
  { upTo: Infinity, label: 'На полном ходу', tone: tokens.semantic.positive },
];

export function heroState(args: {
  /** Сегодняшний дневной доход (движок, как и число над подписью). */
  incomePerDay: number;
  /**
   * Дневной доход за последние N дней из incomeRunRateSeries.
   *
   * Важно, что ряд считает ТОТ ЖЕ движок: раньше сюда шёл накопительный ряд
   * incomeSparkline, а он берёт тело вклада на открытии (`asset.amount`) и не
   * знает про капитализацию, тогда как `incomePerDay` считается от текущего
   * баланса. У портфеля с капитализацией «сегодня» систематически обгоняло
   * «среднее», и подпись залипала на «выше среднего» навсегда.
   */
  daily: number[];
  assetCount: number;
  /** Деньги в активах. */
  workingCapital: number;
  /** Деньги вне активов (лента свободного капитала). */
  freeCapital: number;
  /** Средняя ставка минус ключевая, в процентных пунктах. */
  premiumToKeyRate: number;
}): HeroState {
  const { incomePerDay, daily, assetCount, workingCapital, freeCapital, premiumToKeyRate } = args;

  const avg = daily.length > 0 ? daily.reduce((s, v) => s + v, 0) / daily.length : incomePerDay;
  const ratio = avg > 0 ? incomePerDay / avg : 1;

  const total = workingCapital + freeCapital;
  const load = total > 0 ? workingCapital / total : 0;

  // Доля в работе весит больше ставки: деньги, лежащие мимо активов, — это
  // ноль процентов, и никакая премия к ключевой этого не компенсирует.
  // Порог 0.5 снизу не случаен: половина капитала вне дела — это уже «дремлет»,
  // а не «чуть недобрал».
  const loadScore = smoothstep(0.5, 1.0, load);
  // Ставка меряется премией к ключевой, а не абсолютом: 13% при ключевой 8 —
  // отличный темп, те же 13% при ключевой 18 — отставание.
  const rateScore = smoothstep(-2, 3, premiumToKeyRate);
  const vitality = 0.65 * loadScore + 0.35 * rateScore;

  // Краткий всплеск, когда портфель реально изменился (добавили/пополнили):
  // на характер поля влияет, на эпитет — нет, иначе слово скакало бы от
  // разовых действий, а оно описывает состояние.
  const boost = smoothstep(0.98, 1.35, ratio);
  // Ширина портфеля даёт лёгкий постоянный вклад: пять работающих активов
  // ощущаются живее одного даже в самый обычный день.
  const breadth = Math.min(1, assetCount / 5);

  const intensity = Math.min(1, Math.max(0.18, 0.22 + 0.55 * vitality + 0.16 * boost + 0.10 * breadth));
  const warmth = Math.min(1, Math.max(0, 0.08 + 0.72 * vitality + 0.20 * boost));
  const tier = EPITHETS.find((e) => vitality < e.upTo)!;

  return { intensity, warmth, label: tier.label, tone: tier.tone };
}
