import React from 'react';
import { Tabs } from 'expo-router';
import { t } from '@/i18n';
import { TabBar } from '@/components/TabBar';

/**
 * Нижняя навигация — кастомный плавающий навбар по макету Figma (node 229-4651).
 * Иконки и раскладка живут в src/components/TabBar.tsx.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabs.home }} />
      <Tabs.Screen name="calendar" options={{ title: t.tabs.calendar }} />
      <Tabs.Screen name="converter" options={{ title: t.tabs.converter }} />
      <Tabs.Screen name="analytics" options={{ title: t.tabs.analytics }} />
      <Tabs.Screen name="settings" options={{ title: t.tabs.settings }} />
    </Tabs>
  );
}
