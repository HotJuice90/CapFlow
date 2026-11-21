import type { TextStyle } from 'react-native';
import { font, tokens } from './tokens';

/**
 * Главная сумма блока и подпись над ней — ОДНА роль на всех карточках-блоках
 * (цель, ликвидность, налог). Сюда не относятся hero экрана и сумма в строке
 * актива (у неё свой стиль в AssetRow).
 *
 * Раньше у каждого блока были свои числа: сумма 22 / 24 / 26, подпись 12 / 14 /
 * 14 разного цвета и веса. Рядом на одном экране это читалось как три разных
 * уровня важности, хотя роль одна. Как и rowText, держим в одном месте, чтобы
 * копии в StyleSheet экранов не расходились снова.
 *
 * lineHeight = fontSize + 2 — правило Onest из CLAUDE.md.
 */
export const blockText: { label: TextStyle; value: TextStyle } = {
  label: {
    fontSize: tokens.typography.caption,
    lineHeight: tokens.typography.caption + 2,
    fontFamily: font.medium,
    color: tokens.text.tertiary,
  },
  value: {
    fontSize: tokens.typography.header,
    lineHeight: tokens.typography.header + 2,
    fontFamily: font.semibold,
    letterSpacing: -0.24, // −1%
    color: tokens.text.primary,
    marginTop: 6,
  },
};
