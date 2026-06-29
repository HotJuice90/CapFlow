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
  base: '#10B3A3', // фирменный бирюзовый CapFlow
  soft: '#E6F7F4', // подложка-плашка акцента
  deep: '#0A8A7E', // нажатые состояния
};

// --- Семантические цвета (цвет = смысл, не украшение) ---
const semantic = {
  positive: '#10B3A3',
  positiveBright: '#3DDC97', // яркий зелёный для крупных чисел на тёмном hero
  negative: '#E5484D',
  warning: '#F2A900',
  info: '#3E63DD',
};

// --- Тёмный hero (главный акцентный блок на главной) ---
const hero = {
  gradient: ['#0E2A2E', '#103A40', '#0A2540'] as const, // глубокий тёмно-бирюзовый → навигатор
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
  glow: 'rgba(61,220,151,0.16)', // зелёное свечение под графиком
  innerCard: 'rgba(255,255,255,0.07)', // под-карточки внутри hero
  innerBorder: 'rgba(255,255,255,0.10)',
  labelText: 'rgba(255,255,255,0.62)',
};

// --- Цвет на каждый ТИП инструмента (используется одинаково везде) ---
const category: Record<string, string> = {
  deposit: '#3E63DD', // Вклады — синий
  savings: '#10B3A3', // Накопительные — бирюзовый
  dfa: '#9A6DD7', // ЦФА — фиолетовый
  cash: '#F2A900', // Наличные/валюта — янтарь (после MVP)
};

// --- Текст ---
const text = {
  primary: '#1A2520', // не чистый чёрный
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
  hairline: '#EAEFF1', // тончайший разделитель
};

// --- Фон экрана: диагональный пастельный градиент (мята → лаванда → голубой) ---
const backgroundGradient = {
  colors: ['#EAF6F0', '#EDEBF7', '#E7F0F8'] as const,
  // направление ~168°, стопы смещены к краям (естественный свет, не полоса)
  start: { x: 0.1, y: 0 },
  end: { x: 0.9, y: 1 },
  locations: [0.03, 0.4, 0.99] as const,
};

// --- Тени: всегда тёплые зеленовато-серые, НИКОГДА чёрные (boxShadow в RN 0.85+) ---
const shadow = {
  card: '0px 4px 10px rgba(48,69,62,0.10)',
  cardSoft: '0px 2px 8px rgba(48,69,62,0.07)',
  floating: '0px 8px 24px rgba(48,69,62,0.14)',
};

// --- Скругления ---
const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};

// --- Отступы (воздух важнее симметрии) ---
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  screenH: 20, // горизонтальные поля экрана
};

// --- Типографика (одна семья, крупные числа — акцент) ---
const typography = {
  // размеры
  display: 34, // заголовки экранов
  metric: 32, // крупные числа-метрики
  metricLg: 40, // hero-метрика на карточке
  title: 20,
  body: 16,
  label: 14,
  caption: 13,
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

export const tokens = {
  accent,
  semantic,
  hero,
  category,
  text,
  surface,
  backgroundGradient,
  shadow,
  radius,
  spacing,
  typography,
};

export type Tokens = typeof tokens;
