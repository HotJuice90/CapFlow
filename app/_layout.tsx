import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { DataProvider } from '@/state/DataContext';
import { AppDialogHost } from '@/lib/dialog';
import { applyGlobalFont } from '@/theme/globalFont';
import { tokens } from '@/theme';

SplashScreen.preventAutoHideAsync();
applyGlobalFont();

/**
 * Маска над контентом под системной строкой статусов.
 * Контент при скролле уходит ПОД статус-бар, маска закрывает его прежде, чем он
 * встретится с системными иконками — иконки остаются читаемыми, кашу не видно.
 * Цвет = верхний стоп фонового градиента (#F2F4F9).
 */
function StatusBarMask() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: insets.top,
        backgroundColor: tokens.backgroundGradient.colors[0],
      }}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Onest_400Regular: require('../assets/fonts/Onest-Regular.ttf'),
    Onest_500Medium: require('../assets/fonts/Onest-Medium.ttf'),
    Onest_600SemiBold: require('../assets/fonts/Onest-SemiBold.ttf'),
    Onest_700Bold: require('../assets/fonts/Onest-Bold.ttf'),
    Onest_800ExtraBold: require('../assets/fonts/Onest-ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DataProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="asset/[id]" options={{ presentation: 'card' }} />
            {/* Нативный шит: затемнение от ОС просто проявляется (не едет со шитом),
                animation:"none" убирает лишний stack-fade поверх нативного слайда. */}
            <Stack.Screen
              name="currency-picker"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetCornerRadius: 24,
                sheetGrabberVisible: false,
                gestureEnabled: true,
                animation: 'none',
              }}
            />
            <Stack.Screen
              name="option-picker"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetCornerRadius: 24,
                sheetGrabberVisible: false,
                gestureEnabled: true,
                animation: 'none',
              }}
            />
          </Stack>
          <StatusBarMask />
          <AppDialogHost />
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
