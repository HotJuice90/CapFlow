import React, { useEffect } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from './Card';
import { tokens, hexToRgba } from '@/theme';
import { formatBytes } from '@/update/installUpdate';
import { useUpdateFlow } from '@/update/useUpdate';
import { currentVersion } from '@/update/checkUpdate';
import { UPDATE_ENABLED } from '@/update/config';
import { tapBuzz, successBuzz } from '@/lib/haptics';

export function UpdateSection() {
  const current = currentVersion();
  const { stage, info, progress, error, check, download, cancel, install } = useUpdateFlow();

  const onCheck = () => { tapBuzz(); void check(); };
  const onDownload = () => { tapBuzz(); void download(); };

  // Зашли на экран — проверяем сразу. Сюда приходят либо по красной точке в
  // настройках, либо специально «посмотреть обновления»: в обоих случаях лишний
  // тап по кнопке ничего не решает.
  useEffect(() => {
    if (UPDATE_ENABLED) void check();
  }, [check]);

  return (
    <>
      <Text style={styles.section}>Приложение</Text>
      <Card style={styles.card}>
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

            {stage === 'downloading' ? (
              <View style={styles.block}>
                <View style={styles.progressHead}>
                  <Text style={styles.progressLabel}>Скачиваю {info?.latest}</Text>
                  <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(2, progress * 100)}%` }]} />
                </View>
                <Pressable style={styles.cancelBtn} onPress={() => { tapBuzz(); void cancel(); }}>
                  <Text style={styles.cancelText}>Отменить</Text>
                </Pressable>
              </View>
            ) : stage === 'ready' ? (
              <View style={styles.block}>
                <View style={styles.readyRow}>
                  <MaterialIcons name="check-circle" size={20} color={tokens.semantic.positive} />
                  <Text style={styles.readyText}>Скачано — подтвердите установку</Text>
                </View>
                <Pressable style={styles.primaryBtn} onPress={() => { successBuzz(); void install(); }}>
                  <MaterialIcons name="install-mobile" size={20} color={tokens.text.inverse} />
                  <Text style={styles.primaryText}>Открыть установщик</Text>
                </Pressable>
                <Text style={styles.hint}>
                  Если система спросит разрешение — разрешите установку из этого источника. Данные не потеряются.
                </Text>
              </View>
            ) : (
              <>
                <Pressable style={styles.checkBtn} onPress={onCheck} disabled={stage === 'checking'}>
                  {stage === 'checking' ? (
                    <ActivityIndicator size="small" color={tokens.accent.base} />
                  ) : (
                    <MaterialIcons name="system-update" size={20} color={tokens.accent.base} />
                  )}
                  <Text style={styles.checkText}>
                    {stage === 'checking' ? 'Проверяю…' : 'Проверить обновления'}
                  </Text>
                </Pressable>

                {stage === 'available' && info ? (
                  <View style={styles.block}>
                    <View style={styles.availHead}>
                      <Text style={styles.available}>Версия {info.latest}</Text>
                      {info.apkSize ? <Text style={styles.size}>{formatBytes(info.apkSize)}</Text> : null}
                    </View>
                    {info.notes ? <Text style={styles.notes} numberOfLines={6}>{info.notes.trim()}</Text> : null}
                    <Pressable style={styles.primaryBtn} onPress={onDownload}>
                      <MaterialIcons name="download" size={20} color={tokens.text.inverse} />
                      <Text style={styles.primaryText}>Обновить</Text>
                    </Pressable>
                    <Pressable onPress={() => void Linking.openURL(info.pageUrl)} hitSlop={8}>
                      <Text style={styles.linkText}>Открыть страницу релиза</Text>
                    </Pressable>
                  </View>
                ) : null}

                {stage === 'uptodate' ? (
                  <Text style={styles.upToDate}>Установлена последняя версия</Text>
                ) : null}

                {stage === 'error' && error ? <Text style={styles.error}>{error}</Text> : null}
              </>
            )}
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
  card: { paddingVertical: tokens.spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: tokens.spacing.sm },
  label: { fontSize: tokens.typography.label, color: tokens.text.secondary },
  value: { fontSize: tokens.typography.body, fontWeight: '600', color: tokens.text.primary },
  muted: { fontSize: tokens.typography.label, color: tokens.text.tertiary },
  divider: { height: 1, backgroundColor: tokens.surface.hairline, marginVertical: tokens.spacing.xs },

  checkBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  checkText: { fontSize: tokens.typography.body, color: tokens.accent.base, fontWeight: '600' },

  block: { marginTop: tokens.spacing.sm },
  availHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  available: { fontSize: tokens.typography.body, fontWeight: '700', color: tokens.text.primary },
  size: { fontSize: tokens.typography.caption, color: tokens.text.tertiary },
  notes: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 6, lineHeight: 18 },

  progressHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: tokens.spacing.sm },
  progressLabel: { fontSize: tokens.typography.label, fontWeight: '600', color: tokens.text.primary },
  progressPct: { fontSize: tokens.typography.label, fontWeight: '700', color: tokens.accent.base },
  track: { height: 8, borderRadius: 4, backgroundColor: hexToRgba(tokens.accent.base, 0.12), overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: tokens.accent.base },
  cancelBtn: { alignSelf: 'center', paddingVertical: tokens.spacing.md },
  cancelText: { fontSize: tokens.typography.label, color: tokens.text.tertiary, fontWeight: '600' },

  readyRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  readyText: { fontSize: tokens.typography.label, color: tokens.text.primary, fontWeight: '600' },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.accent.base,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.md,
    marginTop: tokens.spacing.md,
  },
  primaryText: { color: tokens.text.inverse, fontWeight: '700', fontSize: tokens.typography.label },
  linkText: {
    fontSize: tokens.typography.caption,
    color: tokens.accent.base,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: tokens.spacing.md,
  },
  hint: { fontSize: tokens.typography.caption, color: tokens.text.tertiary, marginTop: tokens.spacing.sm, textAlign: 'center', lineHeight: 17 },
  upToDate: { fontSize: tokens.typography.label, color: tokens.semantic.positive, fontWeight: '600', marginTop: tokens.spacing.xs },
  error: { fontSize: tokens.typography.label, color: tokens.semantic.negative, marginTop: tokens.spacing.sm, lineHeight: 19 },
});
