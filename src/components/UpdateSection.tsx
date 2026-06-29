import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from './Card';
import { tokens } from '@/theme';
import { checkForUpdate, type UpdateInfo } from '@/update/checkUpdate';
import { UPDATE_ENABLED } from '@/update/config';

type Status = 'idle' | 'checking' | 'done' | 'error';

export function UpdateSection() {
  const current = Constants.expoConfig?.version ?? '—';
  const [status, setStatus] = useState<Status>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  const check = async () => {
    setStatus('checking');
    setInfo(null);
    try {
      const res = await checkForUpdate();
      setInfo(res);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  const download = () => {
    if (info?.apkUrl) void Linking.openURL(info.apkUrl);
    else if (info?.pageUrl) void Linking.openURL(info.pageUrl);
  };

  return (
    <>
      <Text style={styles.section}>Приложение</Text>
      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>Версия</Text>
          <Text style={styles.value}>{current}</Text>
        </View>

        {!UPDATE_ENABLED ? (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Обновления</Text>
              <Text style={styles.muted}>Не настроены</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.divider} />
            <Pressable style={styles.checkBtn} onPress={check} disabled={status === 'checking'}>
              {status === 'checking' ? (
                <ActivityIndicator size="small" color={tokens.accent.base} />
              ) : (
                <MaterialIcons name="system-update" size={20} color={tokens.accent.base} />
              )}
              <Text style={styles.checkText}>
                {status === 'checking' ? 'Проверяю…' : 'Проверить обновления'}
              </Text>
            </Pressable>

            {status === 'done' && info ? (
              info.available ? (
                <View style={styles.result}>
                  <Text style={styles.available}>Доступна версия {info.latest}</Text>
                  {info.notes ? <Text style={styles.notes} numberOfLines={3}>{info.notes}</Text> : null}
                  <Pressable style={styles.downloadBtn} onPress={download}>
                    <MaterialIcons name="download" size={20} color="#FFFFFF" />
                    <Text style={styles.downloadText}>Скачать обновление</Text>
                  </Pressable>
                  <Text style={styles.hint}>Откроется в браузере — скачайте и установите APK.</Text>
                </View>
              ) : (
                <Text style={styles.upToDate}>Установлена последняя версия</Text>
              )
            ) : null}

            {status === 'error' ? (
              <Text style={styles.error}>Не удалось проверить. Проверьте интернет и попробуйте позже.</Text>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: tokens.spacing.sm },
  label: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  value: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  muted: { fontSize: tokens.typography.label, color: tokens.text.tertiary },
  divider: { height: 1, backgroundColor: tokens.surface.hairline },
  checkBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  checkText: { fontSize: tokens.typography.body, color: tokens.accent.base, fontWeight: '600' },
  result: { marginTop: tokens.spacing.sm },
  available: { fontSize: tokens.typography.body, fontWeight: '700', color: tokens.text.primary },
  notes: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 4 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.md,
    marginTop: tokens.spacing.md,
  },
  downloadText: { color: '#FFFFFF', fontWeight: '700', fontSize: tokens.typography.label },
  hint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: tokens.spacing.sm, textAlign: 'center' },
  upToDate: { fontSize: tokens.typography.label, color: tokens.semantic.positive, fontWeight: '600', marginTop: tokens.spacing.sm },
  error: { fontSize: tokens.typography.label, color: tokens.semantic.negative, marginTop: tokens.spacing.sm },
});
