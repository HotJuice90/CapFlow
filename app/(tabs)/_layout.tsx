import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/theme';
import { t } from '@/i18n';

/**
 * Нижняя навигация. Пока стандартный таб-бар с фирменными цветами;
 * плавающий «стеклянный» бар с вырезом под CTA — отдельный шаг после запуска.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.accent.base,
        tabBarInactiveTintColor: tokens.text.tertiary,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          height: 66,
          borderRadius: 22,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: 'rgba(255,255,255,0.97)',
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.7)',
          elevation: 8,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t.tabs.calendar,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="event" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="converter"
        options={{
          title: t.tabs.converter,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="swap-horiz" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t.tabs.analytics,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="insights" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
