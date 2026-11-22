import type { TextStyle } from 'react-native';
import { font, tokens } from './tokens';

/**
 * Роли текста — ЕДИНСТВЕННОЕ место, где задаются размер, интерлиньяж, вес и
 * трекинг. Экран берёт роль, а не число: одна роль на разных экранах должна
 * выглядеть одинаково. Цвет у числа роль не задаёт — он по смыслу через
 * `tokens.value` (см. CLAUDE.md); у подписей цвет часть роли.
 *
 * Правила:
 *  - lineHeight = fontSize + 2 (Onest: ровно размер жмёт, без явного — нативный
 *    интерлиньяж больше 100%, и отступы перестают совпадать с Figma);
 *  - вес только 400/500/600; 700/800 — локальные исключения (логотип и т.п.);
 *  - трекинг −1% от размера у всего от 14 и крупнее.
 *
 * Размеры сдвинуты на шаг меньше, чем было в экранах (решение 22.11.2026: шрифты
 * были великоваты), кроме заголовков — screenTitle/subHeaderTitle/sectionTitle.
 */
function role(size: number, weight: '400' | '500' | '600', extra: TextStyle = {}): TextStyle {
  const family = weight === '600' ? font.semibold : weight === '500' ? font.medium : font.regular;
  return {
    fontSize: size,
    lineHeight: size + 2,
    fontFamily: family,
    ...(size >= 14 ? { letterSpacing: -size / 100 } : {}),
    ...extra,
  };
}

export const textRole = {
  // ── заголовки (размер не сдвигали) ──
  /** Заголовок корневого таба (`ScreenTitle`). */
  screenTitle: role(34, '600', { color: tokens.text.primary }),
  /** Заголовок суб-экрана «‹ Название». */
  subHeaderTitle: role(24, '600', { color: tokens.text.primary }),
  /** Заголовок секции на экране и заголовок шита. */
  sectionTitle: role(20, '600', { color: tokens.text.primary }),

  // ── числа ──
  /** Главное число корневого таба (капитал, аналитика). Hero главной — свой. */
  heroValue: role(40, '600'),
  /** Главное число суб-экрана или шита (карточка актива, разбивка налога). */
  heroValueSm: role(30, '600'),
  /** Главная сумма блока-карточки (цель, налог, ликвидность). */
  blockValue: role(22, '600'),
  /** Число в мини-плитке или ячейке. */
  statValue: role(17, '600'),
  /** Сумма в строке карточки актива — якорь строки. */
  rowAmount: role(17, '600'),
  /** Сумма во второстепенном списке (события, история, разбивки). */
  rowAmountSm: role(15, '600'),

  // ── тексты ──
  /** Заголовок внутри карточки. */
  cardTitle: role(17, '600', { color: tokens.text.primary }),
  /** Название в строке списка. */
  rowTitle: role(14, '500', { color: tokens.text.primary }),
  /** Подпись под названием в строке. */
  rowSubtitle: role(12, '400', { color: tokens.text.tertiary }),
  /** Подпись над суммой блока или плитки. */
  blockLabel: role(12, '500', { color: tokens.text.tertiary }),
  /** Сноска, пояснение. */
  hint: role(11, '400', { color: tokens.text.tertiary }),
  /** Метка на карточке: тип, срок, статус. */
  pill: role(11, '500'),
  /** Кликабельный чип, таб, переключатель сортировки. */
  chip: role(13, '500'),
  /** Текстовая ссылка («Все цели», «Календарь»). */
  link: role(13, '600', { color: tokens.accent.base }),
} satisfies Record<string, TextStyle>;

export type TextRole = keyof typeof textRole;
