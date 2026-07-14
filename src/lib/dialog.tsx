import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens, font } from '@/theme';

const ACCENT = tokens.accent.base;

type Btn = { text: string; style?: 'default' | 'cancel' | 'destructive'; color?: string; onPress?: () => void };
/** Чисто декоративная иконка-бейдж над заголовком — например, чтобы визуально
 *  отличить информационный алерт (см. InfoTap) от обычного диалога/подтверждения. */
type AlertIcon = keyof typeof MaterialIcons.glyphMap;
type Req = { title: string; message?: string; buttons: Btn[]; icon?: AlertIcon };

// Императивный API, совместимый с Alert.alert(title, message?, buttons?) + необязательная иконка.
let push: ((r: Req) => void) | null = null;
export function appAlert(title: string, message?: string, buttons?: Btn[], icon?: AlertIcon) {
  push?.({ title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }], icon });
}

// Хост рендерится один раз в корне (app/_layout) и показывает стилизованные окна.
export function AppDialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => { push = setReq; return () => { push = null; }; }, []);

  const close = (b?: Btn) => { setReq(null); b?.onPress?.(); };
  // тап мимо окна = как «Отмена» (если есть) или просто закрыть
  const onBackdrop = () => close(req?.buttons.find((b) => b.style === 'cancel'));
  const horizontal = !!req && req.buttons.length === 2;

  return (
    <Modal visible={!!req} transparent animationType="fade" statusBarTranslucent onRequestClose={onBackdrop}>
      <Pressable style={styles.backdrop} onPress={onBackdrop}>
        <Pressable style={styles.card} onPress={() => {}}>
          {req?.icon ? (
            <View style={styles.iconBadge}>
              <MaterialIcons name={req.icon} size={22} color={ACCENT} />
            </View>
          ) : null}
          {!!req?.title && <Text style={styles.title}>{req.title}</Text>}
          {!!req?.message && <Text style={styles.message}>{req.message}</Text>}
          <View style={[styles.btns, horizontal && styles.btnsRow]}>
            {req?.buttons.map((b, i) => {
              const cancel = b.style === 'cancel';
              const bg = b.color ?? (b.style === 'destructive' ? tokens.semantic.negative : ACCENT);
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  style={[styles.btn, horizontal && styles.btnFlex, cancel ? styles.btnCancel : { backgroundColor: bg }]}
                  onPress={() => close(b)}
                >
                  <Text style={[styles.btnTxt, cancel ? styles.btnCancelTxt : styles.btnSolidTxt]}>{b.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,14,30,0.6)', justifyContent: 'center', alignItems: 'center', padding: 36 },
  card: { width: '100%', maxWidth: 340, backgroundColor: tokens.surface.white, borderRadius: 26, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 18 },
  iconBadge: {
    alignSelf: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontFamily: font.semibold, fontSize: 19, letterSpacing: -0.2, color: tokens.text.primary, textAlign: 'center' },
  message: { fontFamily: font.regular, fontSize: 14, color: tokens.text.secondary, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  btns: { marginTop: 22, gap: 8 },
  btnsRow: { flexDirection: 'row' },
  btn: { paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnFlex: { flex: 1 },
  btnCancel: { backgroundColor: '#F1F5F9' },
  btnTxt: { fontFamily: font.semibold, fontSize: 16 },
  btnSolidTxt: { color: tokens.text.inverse },
  btnCancelTxt: { color: tokens.text.secondary },
});
