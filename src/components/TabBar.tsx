import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tapBuzz } from '@/lib/haptics';
import { useData } from '@/state/DataContext';
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
    bg: 'rgba(255,255,255,0.92)',
    border: 'rgba(255,255,255,0.7)',
    active: '#62709C',
    inactive: '#667085',
  },
  dark: {
    bg: 'rgba(34,42,68,0.92)',
    border: 'rgba(255,255,255,0.14)',
    active: '#A8B6E2',
    inactive: 'rgba(255,255,255,0.5)',
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
          const Icon = focused ? pair[1] : pair[0];
          const onPress = () => {
            tapBuzz();
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable key={route.key} onPress={onPress} hitSlop={10} style={styles.item}>
              <Icon width={24} height={24} color={focused ? c.active : c.inactive} />
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
    borderRadius: 35,
    paddingHorizontal: 28,
    paddingVertical: 18,
    boxShadow: '0px 8px 24px rgba(48,69,62,0.16)',
  },
  item: { alignItems: 'center', justifyContent: 'center' },
});
