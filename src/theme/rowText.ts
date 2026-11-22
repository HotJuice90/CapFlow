import type { TextStyle } from 'react-native';
import { textRole } from './textRoles';

/**
 * Типографика строки актива — ОДНА на главную и календарь.
 *
 * Держим здесь, а не копиями в двух экранах, потому что копии уже разъехались:
 * заголовок был 14/500 без трекинга на главной и 18/600 с −0.36 в календаре,
 * а банк отличался ещё и цветом (text.secondary против text.tertiary). Пока
 * значения лежат в двух StyleSheet, они расходятся тихо — экраны рядом никто
 * не открывает.
 *
 * lineHeight = fontSize + 2 — правило Onest из CLAUDE.md: ровно fontSize жмёт
 * тесно (в календаре так и было), а без явного lineHeight подставляется
 * нативный интерлиньяж шрифта, заметно больше 100%, и отступы перестают
 * совпадать с Figma.
 */
export const rowText: { title: TextStyle; subtitle: TextStyle } = {
  title: textRole.rowTitle,
  subtitle: { ...textRole.rowSubtitle, marginTop: 4 },
};
