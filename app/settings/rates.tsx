import React from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenBackground } from '@/components/ScreenBackground';
import { SubHeader } from '@/components/SubHeader';
import { RatesSection } from '@/components/RatesSection';
import { tokens } from '@/theme';

export default function RatesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + tokens.spacing.sm, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <SubHeader title="Валюты и курсы" />
        <RatesSection />
      </ScrollView>
    </ScreenBackground>
  );
}
