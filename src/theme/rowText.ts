import type { TextStyle } from 'react-native';
import { tokens } from './tokens';

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
  title: {
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: -0.15, // −1%, как у ScreenTitle (34 → −0.34)
    fontWeight: '500',
    color: tokens.text.primary,
  },
  subtitle: {
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    color: tokens.text.tertiary,
    marginTop: 4,
  },
};
