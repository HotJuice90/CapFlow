import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { tokens } from '@/theme';

export default function OrganizationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useData();
  const orgs = data.organizations.filter((o) => !o.archived);

  const instrCount = (orgId: string) =>
    data.instruments.filter((i) => i.organizationId === orgId).length;

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
          <Text style={styles.title}>Организации</Text>
          <Pressable onPress={() => router.push('/catalog/organization')} hitSlop={12}>
            <MaterialIcons name="add" size={26} color={tokens.accent.base} />
          </Pressable>
        </View>

        {orgs.length === 0 ? (
          <Card style={styles.empty}>
            <MaterialIcons name="account-balance" size={36} color={tokens.accent.base} />
            <Text style={styles.emptyTitle}>Нет организаций</Text>
            <Text style={styles.emptyHint}>Добавьте банк или платформу, в которых храните капитал.</Text>
          </Card>
        ) : (
          <Card padded={false}>
            <View style={{ paddingHorizontal: tokens.spacing.lg }}>
              {orgs.map((o, i) => (
                <View key={o.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <Pressable
                    style={styles.row}
                    onPress={() => router.push(`/catalog/organization?id=${o.id}`)}
                  >
                    <OrgLogo color={o.color} logo={o.logo} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{o.name}</Text>
                      <Text style={styles.sub}>
                        {o.type} · {instrCount(o.id)} инстр.
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Card>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  dot: { width: 36, height: 36, borderRadius: tokens.radius.sm },
  logoBox: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: tokens.typography.body, fontWeight: '500', color: tokens.text.primary },
  sub: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.sm },
  emptyTitle: { fontSize: tokens.typography.title, fontWeight: '600', color: tokens.text.primary },
  emptyHint: { fontSize: tokens.typography.label, color: tokens.text.secondary, textAlign: 'center' },
});
