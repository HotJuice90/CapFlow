import React from 'react';
import { View, Pressable, StyleSheet, Text, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBlurTarget } from '@/lib/blurTarget';
import { tapBuzz } from '@/lib/haptics';
import { useData } from '@/state/DataContext';
import { tokens, font, hexToRgba } from '@/theme';
import { t } from '@/i18n';
import HomeIcon from '../../assets/nav/home.svg';
import HomeActiveIcon from '../../assets/nav/home-active.svg';
import CalendarIcon from '../../assets/nav/calendar.svg';
import CalendarActiveIcon from '../../assets/nav/calendar-active.svg';
import ConverterIcon from '../../assets/nav/converter.svg';
import ConverterActiveIcon from '../../assets/nav/converter-active.svg';
import AnalyticsIcon from '../../assets/nav/analytics.svg';
import AnalyticsActiveIcon from '../../assets/nav/analytics-active.svg';
import SettingsIcon from '../../assets/nav/settings.svg';
import SettingsActiveIcon from '../../assets/nav/settings-active.svg';

// Имя роута (файл в app/(tabs)) → пара иконок: [неактивная outline, активная filled]
const ICONS: Record<string, [React.FC<any>, React.FC<any>]> = {
  index: [HomeIcon, HomeActiveIcon],
  calendar: [CalendarIcon, CalendarActiveIcon],
  converter: [ConverterIcon, ConverterActiveIcon],
  analytics: [AnalyticsIcon, AnalyticsActiveIcon],
  settings: [SettingsIcon, SettingsActiveIcon],
};

// Подписи берём из тех же строк, что и заголовки экранов, — под иконкой должно
// стоять ровно то слово, которое человек увидит, открыв таб.
const LABELS: Record<string, string> = {
  index: t.tabs.home,
  calendar: t.tabs.calendar,
  converter: t.tabs.converter,
  analytics: t.tabs.analytics,
  settings: t.tabs.settings,
};

/**
 * Живой блюр — только на Android 12+ (API 31): там `dimezisBlurViewSdk31Plus`
 * идёт через системный RenderEffect. Старый `dimezisBlurView` крашил на
 * устройстве (Android 16 / HyperOS 3), и блюр из-за этого был отложен — новый
 * метод работает по другому пути и требует явной цели (`blurTarget`).
 *
 * Ниже API 31 метод и сам откатился бы на плоскую заливку, но ветку держим
 * явной: так на старых устройствах остаётся ровно прежний вид бара, а не то,
 * что решит библиотека.
 *
 * `bg` — плотная заливка для фолбэка, `tintGradient` — тонировка ПОВЕРХ блюра.
 * Тонировка обязательна и именно градиентная (сверху плотнее, снизу легче):
 * сам по себе блюр отдаёт сырые цвета того, что под ним, и стекло выглядит
 * серым и грязным, а не белым. Плоская заливка эту работу делает хуже —
 * стекло получается мутным пятном без ощущения объёма.
 */
const CAN_BLUR = Platform.OS === 'android' && Number(Platform.Version) >= 31;
const BLUR_INTENSITY = 75;

const THEME = {
  light: {
    bg: hexToRgba(tokens.surface.white, 0.92),
    tintGradient: [hexToRgba(tokens.surface.white, 0.6), hexToRgba(tokens.surface.white, 0.48)] as const,
    tint: 'light' as const,
    border: tokens.surface.glassBorder,
    active: tokens.accent.base,
    inactive: tokens.text.secondary,
  },
  dark: {
    bg: 'rgba(34,42,68,0.92)',
    // У тёмного вилка узкая: на 0.55 сквозь него пробивался светлый фон и бар
    // уходил в серо-синюю муть, на 0.88 блюра уже не видно вовсе — глухая
    // плашка. Держим между, ближе к прозрачному, а читаемость добираем не
    // плотностью, а контрастом иконок и рамки.
    tintGradient: ['rgba(30,37,62,0.7)', 'rgba(30,37,62,0.58)'] as const,
    tint: 'dark' as const,
    border: hexToRgba(tokens.text.inverse, 0.18),
    active: tokens.accent.light,
    inactive: hexToRgba(tokens.text.inverse, 0.66),
  },
};

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

/** Плавающий навбар: кастомные иконки (filled/outline по состоянию), без подписей. */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { data } = useData();
  const c = THEME[data.settings.navBar ?? 'light'];
  const labeled = data.settings.navLabels ?? false;
  // Цель блюра — контент сфокусированного экрана (см. BlurTargetRoot). Пока её
  // нет (первый кадр, экран вне (tabs)), рисуем обычную плашку: блюрить нечего.
  const { ref: blurTarget, revision } = useBlurTarget();
  const blurred = CAN_BLUR && blurTarget != null;

  const items = (
    <>
        {state.routes.map((route, i) => {
          const pair = ICONS[route.name];
          if (!pair) return null;
          const focused = state.index === i;
          const [IdleIcon, ActiveIcon] = pair;
          const onPress = () => {
            tapBuzz();
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              hitSlop={10}
              style={[styles.item, labeled && styles.itemLabeled]}
            >
              {/* Обе иконки смонтированы ВСЕГДА, переключается только
                  прозрачность. Раньше рендерилась одна из пары — а это два
                  разных типа компонента, поэтому смена таба размонтировала
                  старую иконку и монтировала новую: создание дерева нативных
                  вью react-native-svg плюс разбор путей выпадали на тот же
                  кадр, что и переход между экранами, и активная иконка
                  появлялась с задержкой в несколько кадров (выглядело как
                  ленивая подгрузка). Сейчас монтировать при переключении
                  нечего — обе уже на экране. */}
              <View style={styles.iconBox}>
                <View style={[styles.iconLayer, { opacity: focused ? 0 : 1 }]}>
                  <IdleIcon width={24} height={24} color={c.inactive} />
                </View>
                <View style={[styles.iconLayer, { opacity: focused ? 1 : 0 }]}>
                  <ActiveIcon width={24} height={24} color={c.active} />
                </View>
              </View>
              {/* Цвет подписи повторяет состояние иконки: серая подпись под
                  активной иконкой читалась бы как два разных состояния одной
                  кнопки. */}
              {labeled ? (
                <Text numberOfLines={1} style={[styles.label, { color: focused ? c.active : c.inactive }]}>
                  {LABELS[route.name]}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
    </>
  );

  const shape = [styles.bar, labeled && styles.barLabeled, { borderColor: c.border }];

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 6 }]} pointerEvents="box-none">
      {blurred ? (
        // key по revision: при смене экрана меняется и цель, а BlurView
        // подхватывает её только при пересоздании.
        <BlurView
          key={revision}
          blurTarget={blurTarget ?? undefined}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={BLUR_INTENSITY}
          tint={c.tint}
          style={[shape, styles.barBlur]}
        >
          <LinearGradient
            colors={c.tintGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {items}
        </BlurView>
      ) : (
        <View style={[shape, { backgroundColor: c.bg }]}>{items}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 28,
    paddingVertical: 18,
    boxShadow: '0px 8px 24px rgba(48,69,62,0.16)',
  },
  // Блюр рисуется прямоугольником на всю вью и без обрезки вылезал бы за
  // скругление пилюли углами. Фолбэк-ветке это не нужно — там просто заливка.
  barBlur: { overflow: 'hidden' },
  // Бар с подписями ВЫШЕ, а не ужат: выкупать место у паддинга — значит поджать
  // иконки сильнее, чем без подписей, хотя контента стало больше. Вертикальный
  // паддинг чуть меньше базовых 18 (подпись сама по себе создаёт нижнее поле,
  // и при равном паддинге бар выглядел бы донным-тяжёлым), но итоговая высота
  // растёт: 14 + 24 + 6 + 12 + 14 = 70 против 18 + 24 + 18 = 60.
  //
  // Боковины остаются круглыми при любой высоте: `radius.pill` = 999, то есть
  // скругление всегда по половине высоты, а не фиксированные пиксели.
  barLabeled: { paddingVertical: 14, paddingHorizontal: 8 },
  item: { alignItems: 'center', justifyContent: 'center' },
  // Ширину не задаём: пять подписей делят строку равными долями, а «Календарь»
  // с «Аналитикой» длиннее остальных — фиксированная ширина срезала бы их.
  itemLabeled: { flex: 1, gap: 6 },
  label: {
    fontSize: 10, lineHeight: 12, fontFamily: font.medium, letterSpacing: -0.1,
  },
  // Размер задан явно: обе иконки лежат absolute-слоями друг на друге, и без
  // этого у бокса не осталось бы собственной высоты.
  iconBox: { width: 24, height: 24 },
  iconLayer: { position: 'absolute', top: 0, left: 0 },
});
