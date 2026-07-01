import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Card } from '@/components/Card';
import { OrgLogo } from '@/components/BankLogo';
import { useData } from '@/state/DataContext';
import { tokens } from '@/theme';

function norm(s: string): string {
  return s.toLowerCase().trim();
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data } = useData();
  const [q, setQ] = useState('');

  const query = norm(q);

  const orgById = useMemo(() => new Map(data.organizations.map((o) => [o.id, o])), [data.organizations]);

  const assets = useMemo(() => {
    if (!query) return [];
    return data.assets
      .filter((a) => a.status === 'active')
      .map((a) => {
        const instr = data.instruments.find((i) => i.id === a.instrumentId);
        const org = instr ? orgById.get(instr.organizationId) : undefined;
        return { a, instr, org };
      })
      .filter(({ a, instr, org }) =>
        [instr?.name, a.title, org?.name].some((s) => s && norm(s).includes(query)),
      );
  }, [query, data.assets, data.instruments, orgById]);

  const orgs = useMemo(
    () => (query ? data.organizations.filter((o) => !o.archived && norm(o.name).includes(query)) : []),
    [query, data.organizations],
  );
  const instruments = useMemo(
    () => (query ? data.instruments.filter((i) => norm(i.name).includes(query)) : []),
    [query, data.instruments],
  );

  const nothing = query.length > 0 && assets.length === 0 && orgs.length === 0 && instruments.length === 0;

  return (
    <ScreenBackground>
      <View style={{ paddingTop: insets.top + tokens.spacing.sm, paddingHorizontal: tokens.spacing.screenH, flex: 1 }}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={22} color={tokens.text.tertiary} />
          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            placeholder="Активы, организации, инструменты"
            placeholderTextColor={tokens.text.tertiary}
            autoFocus
            returnKeyType="search"
          />
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.cancel}>Отмена</Text>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {nothing ? <Text style={styles.empty}>Ничего не найдено</Text> : null}

          {assets.length > 0 ? (
            <>
              <Text style={styles.group}>Активы</Text>
              <Card padded={false}>
                <View style={styles.list}>
                  {assets.map(({ a, instr, org }, i) => (
                    <View key={a.id}>
                      {i > 0 && <View style={styles.sep} />}
                      <Pressable style={styles.row} onPress={() => router.push(`/asset/${a.id}`)}>
                        <OrgLogo color={org?.color ?? tokens.accent.base} logo={org?.logo} size={32} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{instr?.name ?? 'Актив'}</Text>
                          <Text style={styles.rowSub} numberOfLines={1}>{a.title ?? org?.name ?? ''}</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          ) : null}

          {orgs.length > 0 ? (
            <>
              <Text style={styles.group}>Организации</Text>
              <Card padded={false}>
                <View style={styles.list}>
                  {orgs.map((o, i) => (
                    <View key={o.id}>
                      {i > 0 && <View style={styles.sep} />}
                      <Pressable style={styles.row} onPress={() => router.push(`/catalog/organization?id=${o.id}`)}>
                        <OrgLogo color={o.color} logo={o.logo} size={32} />
                        <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>{o.name}</Text>
                        <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          ) : null}

          {instruments.length > 0 ? (
            <>
              <Text style={styles.group}>Инструменты</Text>
              <Card padded={false}>
                <View style={styles.list}>
                  {instruments.map((it, i) => (
                    <View key={it.id}>
                      {i > 0 && <View style={styles.sep} />}
                      <Pressable style={styles.row} onPress={() => router.push(`/catalog/instrument?id=${it.id}`)}>
                        <MaterialIcons name="savings" size={20} color={tokens.accent.base} />
                        <Text style={[styles.rowTitle, { flex: 1, marginLeft: tokens.spacing.sm }]} numberOfLines={1}>{it.name}</Text>
                        <MaterialIcons name="chevron-right" size={22} color={tokens.text.tertiary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          ) : null}
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.surface.white,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    marginBottom: tokens.spacing.lg,
  },
  input: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary, padding: 0 },
  cancel: { fontSize: tokens.typography.label, color: tokens.accent.base, fontWeight: '600' },
  empty: { textAlign: 'center', color: tokens.text.tertiary, marginTop: tokens.spacing.xxl },
  group: { fontSize: tokens.typography.label, fontWeight: '600', color: tokens.text.secondary, marginBottom: tokens.spacing.sm, marginTop: tokens.spacing.md },
  list: { paddingHorizontal: tokens.spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  dot: { width: 32, height: 32, borderRadius: tokens.radius.sm },
  rowTitle: { fontSize: tokens.typography.body, fontWeight: '500', color: tokens.text.primary },
  rowSub: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 2 },
  sep: { height: 1, backgroundColor: tokens.surface.hairline },
});
