import type { TextStyle } from 'react-native';
import { tokens } from './tokens';
import { textRole } from './textRoles';

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
  label: textRole.blockLabel,
  value: { ...textRole.blockValue, color: tokens.text.primary, marginTop: 6 },
};
