/**
 * Дизайн-токены CapFlow.
 *
 * Светлый «стеклянный» финтех-вайб (по design_guide). Цвета НЕ копируем 1:1 из
 * прошлого проекта — берём вайб: воздух, пастель, мягкие тёплые тени, один
 * бирюзовый акцент. Все цвета идут через токены, чтобы позже добавить тёмную тему
 * без переписывания (см. решение #10).
 */

// --- Палитра акцента (один на весь интерфейс — «лучший результат / актив») ---
const accent = {
  base: '#62709C', // фирменный приглушённый сине-серый CapFlow
  soft: '#EDEFF6', // подложка-плашка акцента
  deep: '#4F5C84', // нажатые состояния
  light: '#A8B6E2', // светлый оттенок (кнопки/чипы/swap)
};

// --- Семантические цвета (цвет = смысл, не украшение) ---
const semantic = {
  positive: '#1FA971', // рост — зелёный (не бирюза)
  negative: '#E5484D',
  warning: '#F2A900',
  info: '#3E63DD',
};

// --- Цвет на каждый ТИП инструмента (используется одинаково везде) ---
const category: Record<string, string> = {
  deposit: '#3E63DD', // Вклады — синий
  savings: '#1C93B5', // Накопительные — бирюзово-голубой (не зелёный: занят ростом/доходом; не синий деп.)
  bond: '#C98A2C', // Облигации — золото
  dfa: '#9A6DD7', // ЦФА — фиолетовый
  cash: '#F2A900', // Наличные/валюта — янтарь (после MVP)
};

// --- Цвет на каждый ТИП площадки (та же логика, что у category — считывается с виджета) ---
const orgType: Record<string, string> = {
  Банк: '#3E63DD',
  Агрегатор: '#10B3A3',
  'Платформа ЦФА': '#9A6DD7',
  Брокер: '#C98A2C',
  Другое: '#5A6472',
};

// --- Текст ---
const text = {
  primary: '#212121', // не чистый чёрный
  secondary: '#667085', // приглушённый серо-синий
  tertiary: '#98A2B7',
  inverse: '#FFFFFF',
};

// --- Поверхности ---
const surface = {
  white: '#FFFFFF',
  glass: 'rgba(255,255,255,0.92)', // «стекло» — полупрозрачная плашка
  glassBorder: 'rgba(255,255,255,0.70)',
  neutral: '#F5F8F6', // нейтральная подложка чипов/иконбоксов
  hairline: '#EAF2F9', // тончайший разделитель
  rowTint: 'rgba(249,250,255,0.55)', // фон строк/плашек поверх карточек
  tabOff: 'rgba(215,226,235,0.5)', // фон табов/тоглов на градиентном фоне экрана
};

// --- Фон экрана: диагональный градиент 168° (светло-серый → голубой → белый) ---
const backgroundGradient = {
  colors: ['#F2F4F9', '#E0EDF4', '#F5F7FF'] as const,
  // linear-gradient(168deg, #F2F4F9 2.69%, #E0EDF4 56.51%, #F5F7FF 99.18%)
  start: { x: 0.15, y: 0 },
  end: { x: 0.85, y: 1 },
  locations: [0.0269, 0.5651, 0.9918] as const,
};

// --- Тени: всегда тёплые зеленовато-серые, НИКОГДА чёрные (boxShadow в RN 0.85+) ---
const shadow = {
  card: '0px 4px 10px rgba(48,69,62,0.10)',
  cardSoft: '0px 2px 8px rgba(48,69,62,0.07)',
  subtle: '0px 3px 8px rgba(48,69,62,0.05)', // самая лёгкая тень строк/плашек
  floating: '0px 8px 24px rgba(48,69,62,0.14)',
};

// --- Скругления ---
const radius = {
  grabber: 2, // ручка bottom-sheet
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pillSmall: 35, // pill для контролов высотой ~70px (визуально то же, что pill, но число другое)
  pill: 999,
};

// --- Отступы (воздух важнее симметрии) ---
const spacing = {
  xs: 4,
  chip: 6, // gap/паддинг чипов и мелких иконок
  sm: 8,
  tight: 10, // паддинг пилюль/строк — между sm и md
  md: 12,
  lg: 16,
  sheet: 20, // внешний паддинг bottom-sheet
  xl: 24,
  xxl: 32,
  screenH: 16, // горизонтальные поля экрана (канон по умолчанию)
  screenTop: 80, // паддинг-топ контейнера экрана (канон)
};

// --- Типографика (одна семья, крупные числа — акцент) ---
const typography = {
  // размеры
  display: 34, // заголовки корневых табов (ScreenTitle)
  header: 24, // заголовок суб-экрана («‹ Название»)
  metric: 32, // крупные числа-метрики
  metricLg: 40, // hero-метрика на карточке
  title: 20, // заголовки карточек/секций
  body: 16,
  labelLg: 15, // компактный текст: поисковые строки, названия, значения
  label: 14,
  caption: 13,
  hint: 12, // мелкие подписи-хинты
  micro: 11,
  // веса (имена начертаний пропишем при подключении шрифта)
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
} as const;

// --- Шрифт Onest: семантические имена → семейства из @expo-google-fonts/onest ---
export const font = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extrabold: 'Onest_800ExtraBold',
};

export const tokens = {
  accent,
  semantic,
  category,
  orgType,
  text,
  surface,
  backgroundGradient,
  shadow,
  radius,
  spacing,
  typography,
  font,
};

export type Tokens = typeof tokens;

// --- Утилиты цвета (перенос из прошлого проекта) ---

/** hex → rgba-строка с заданной прозрачностью. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Смешать цвет с белым. factor = доля белого (0.85 = светлый пастельный). */
export function tintToWhite(hex: string, factor = 0.85): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const nr = Math.round(r + (255 - r) * factor);
  const ng = Math.round(g + (255 - g) * factor);
  const nb = Math.round(b + (255 - b) * factor);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

/** Светлый ли цвет (для инверсии контента на светлых фонах). */
export function isLightColor(hex?: string, threshold = 0.82): boolean {
  if (!hex) return false;
  const c = hex.replace('#', '');
  const x = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c;
  if (x.length < 6) return false;
  const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > threshold;
}
