import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { SubHeader } from '@/components/SubHeader';
import { NumberField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { tokens } from '@/theme';

export default function KeyRateScreen() {
  const insets = useSafeAreaInsets();
  const { data, updateParams } = useData();
  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + tokens.spacing.sm, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <SubHeader title="Ключевая ставка ЦБ" />
        <Card>
          <NumberField
            label="Ключевая ставка"
            value={data.params.keyRate}
            onChange={(v) => void updateParams({ keyRate: v ?? 0 })}
            suffix="%"
            hint="Используется для премии к ключевой и необлагаемого лимита. У ЦБ нет открытого JSON для ключевой — задаётся вручную."
          />
        </Card>
        <View style={{ height: 1 }} />
      </ScrollView>
    </ScreenBackground>
  );
}
