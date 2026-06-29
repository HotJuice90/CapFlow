import React from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { SubHeader } from '@/components/SubHeader';
import { NumberField } from '@/components/form/fields';
import { useData } from '@/state/DataContext';
import { tokens } from '@/theme';

export default function TaxScreen() {
  const insets = useSafeAreaInsets();
  const { data, updateParams } = useData();
  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + tokens.spacing.sm, paddingHorizontal: tokens.spacing.screenH, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <SubHeader title="Налоговые параметры" />
        <Card>
          <NumberField
            label="Ставка налога (НДФЛ)"
            value={data.params.taxRate}
            onChange={(v) => void updateParams({ taxRate: v ?? 0 })}
            suffix="%"
          />
          <NumberField
            label="Необлагаемый лимит в год"
            value={data.params.taxFreeLimit}
            onChange={(v) => void updateParams({ taxFreeLimit: v ?? 0 })}
            suffix="₽"
            hint="Доход сверх лимита облагается налогом. По НК ≈ 1 млн × макс. ключевая ставка года."
          />
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}
