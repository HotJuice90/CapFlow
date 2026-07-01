import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { tokens, font } from '@/theme';

const ACCENT = tokens.accent.base;

type Btn = { text: string; style?: 'default' | 'cancel' | 'destructive'; color?: string; onPress?: () => void };
type Req = { title: string; message?: string; buttons: Btn[] };

// Императивный API, совместимый с Alert.alert(title, message?, buttons?)
let push: ((r: Req) => void) | null = null;
export function appAlert(title: string, message?: string, buttons?: Btn[]) {
  push?.({ title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }] });
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
  card: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 26, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 18 },
  title: { fontFamily: font.semibold, fontSize: 19, letterSpacing: -0.2, color: '#212121', textAlign: 'center' },
  message: { fontFamily: font.regular, fontSize: 14, color: '#667085', textAlign: 'center', lineHeight: 20, marginTop: 8 },
  btns: { marginTop: 22, gap: 8 },
  btnsRow: { flexDirection: 'row' },
  btn: { paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnFlex: { flex: 1 },
  btnCancel: { backgroundColor: '#F1F5F9' },
  btnTxt: { fontFamily: font.semibold, fontSize: 16 },
  btnSolidTxt: { color: '#fff' },
  btnCancelTxt: { color: '#667085' },
});
