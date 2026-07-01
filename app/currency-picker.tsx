import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Flag } from '@/components/Flag';
import { pickCurrencyValue } from '@/lib/currencyPicker';
import { tapBuzz } from '@/lib/haptics';
import type { CurrencyCode } from '@/domain/types';
import { tokens, font } from '@/theme';

// Порядок строго как в макете Figma (node 255-2981)
const ALL_CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'TRY', 'KZT', 'BYN', 'CNY', 'INR', 'AED', 'BRL', 'ARS'];
const CURRENCY_NAME: Record<CurrencyCode, string> = {
  RUB: 'Российский рубль', USD: 'Доллар США', EUR: 'Евро', TRY: 'Турецкая лира', KZT: 'Казахстанский тенге',
  BYN: 'Белорусский рубль', CNY: 'Китайский юань', INR: 'Индийская рупия', AED: 'Дирхам ОАЭ',
  BRL: 'Бразильский реал', ARS: 'Аргентинское песо',
};

export default function CurrencyPickerSheet() {
  const { current } = useLocalSearchParams<{ current?: string }>();
  const choose = (c: CurrencyCode) => { tapBuzz(); pickCurrencyValue(c); router.back(); };

  return (
    <View style={s.sheet}>
      <StatusBar barStyle="dark-content" />
      <View style={s.grabber} />
      <Text style={s.title}>Выберите валюту</Text>
      <ScrollView style={s.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {ALL_CURRENCIES.map((c) => (
          <TouchableOpacity key={c} style={s.row} activeOpacity={0.6} onPress={() => choose(c)}>
            <Flag code={c} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.code}>{c}</Text>
              <Text style={s.name}>{CURRENCY_NAME[c]}</Text>
            </View>
            {current === c && <MaterialIcons name="check" size={20} color={tokens.accent.base} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E8EE', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2, color: '#212121', marginBottom: 10 },
  list: { maxHeight: 460 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  code: { fontFamily: font.semibold, fontSize: 16, color: '#212121' },
  name: { fontFamily: font.regular, fontSize: 13, color: tokens.text.secondary, marginTop: 2 },
});
