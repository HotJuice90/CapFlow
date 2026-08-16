import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tapBuzz } from '@/lib/haptics';
import { useData } from '@/state/DataContext';
import { tokens, hexToRgba } from '@/theme';
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

// dimezisBlurView крашит на этом устройстве (Android 16 / HyperOS 3) — настоящий
// блюр отложен. Полупрозрачная плашка без BlurView — стабильно, визуально близко.
const THEME = {
  light: {
    bg: hexToRgba(tokens.surface.white, 0.92),
    border: tokens.surface.glassBorder,
    active: tokens.accent.base,
    inactive: tokens.text.secondary,
  },
  dark: {
    bg: 'rgba(34,42,68,0.92)',
    border: hexToRgba(tokens.text.inverse, 0.14),
    active: tokens.accent.light,
    inactive: hexToRgba(tokens.text.inverse, 0.5),
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
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 6 }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: c.bg, borderColor: c.border }]}>
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
            <Pressable key={route.key} onPress={onPress} hitSlop={10} style={styles.item}>
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
            </Pressable>
          );
        })}
      </View>
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
  item: { alignItems: 'center', justifyContent: 'center' },
  // Размер задан явно: обе иконки лежат absolute-слоями друг на друге, и без
  // этого у бокса не осталось бы собственной высоты.
  iconBox: { width: 24, height: 24 },
  iconLayer: { position: 'absolute', top: 0, left: 0 },
});
