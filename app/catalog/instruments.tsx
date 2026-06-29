import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { useData } from '@/state/DataContext';
import { tokens } from '@/theme';

function typeLabel(typeId: string): string {
  return typeId === 'deposit' ? 'Вклад' : typeId === 'savings' ? 'Накопительный счёт' : 'ЦФА';
}

export default function InstrumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useData();

  const orgs = data.organizations.filter((o) => !o.archived);

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.sm,
          paddingHorizontal: tokens.spacing.screenH,
          paddingBottom: insets.bottom + tokens.spacing.xxl,
        }}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color={tokens.text.primary} />
          </Pressable>
          <Text style={styles.title}>Инструменты</Text>
          <Pressable onPress={() => router.push('/catalog/instrument')} hitSlop={12}>
            <MaterialIcons name="add" size={26} color={tokens.accent.base} />
          </Pressable>
        </View>

        {data.instruments.length === 0 ? (
          <Card style={styles.empty}>
            <MaterialIcons name="savings" size={36} color={tokens.accent.base} />
            <Text style={styles.emptyTitle}>Нет инструментов</Text>
            <Text style={styles.emptyHint}>Добавьте шаблон продукта — вклад, накопительный счёт.</Text>
          </Card>
        ) : (
          orgs.map((o) => {
            const items = data.instruments.filter((i) => i.organizationId === o.id);
            if (items.length === 0) return null;
            return (
              <View key={o.id} style={{ marginBottom: tokens.spacing.lg }}>
                <View style={styles.groupHeader}>
                  <View style={[styles.dot, { backgroundColor: o.color }]} />
                  <Text style={styles.groupName}>{o.name}</Text>
                </View>
                <Card padded={false}>
                  <View style={{ paddingHorizontal: tokens.spacing.lg }}>
                    {items.map((it, i) => (
                      <View key={it.id}>
                        {i > 0 && <View style={styles.divider} />}
                        <Pressable
                          style={styles.row}
                          onPress={() => router.push(`/catalog/instrument?id=${it.id}`)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.name}>{it.name}</Text>
                            <Text style={styles.sub}>{typeLabel(it.typeId)}</Text>
                          </View>
                          <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </Card>
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  title: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.sm },
  dot: { width: 16, height: 16, borderRadius: 5 },
  groupName: { fontSize: tokens.typography.label, fontWeight: '600', color: tokens.text.secondary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.md },
  name: { fontSize: tokens.typography.body, fontWeight: '500', color: tokens.text.primary },
  sub: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.sm },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center' },
});
