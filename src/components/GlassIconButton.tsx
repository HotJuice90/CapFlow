import React from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useBlurTarget } from '@/lib/blurTarget';
import { tokens, hexToRgba } from '@/theme';

/**
 * Круглая кнопка со «стеклом» — тем же, что у таб-бара: живой блюр на
 * Android 12+ плюс градиентная тонировка поверх (сверху плотнее, снизу легче).
 * Без тонировки блюр отдаёт сырые цвета того, что под ним, и стекло выглядит
 * серым, а не белым.
 *
 * Цель блюра — тот же корень экрана, что у бара. Кнопка живёт ВНУТРИ этого
 * корня, и это нормально: BlurView не рисует сам себя в момент захвата.
 * Но захват идёт каждый кадр, а под кнопкой живёт анимированное поле —
 * если появится джанк, первым делом смотреть сюда.
 */
const CAN_BLUR = Platform.OS === 'android' && Number(Platform.Version) >= 31;
const TINT = [hexToRgba(tokens.surface.white, 0.6), hexToRgba(tokens.surface.white, 0.48)] as const;

export function GlassIconButton({
  children,
  onPress,
  size = 44,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { ref: blurTarget, revision } = useBlurTarget();
  const blurred = CAN_BLUR && blurTarget != null;
  const shape = [styles.base, { width: size, height: size, borderRadius: size / 2 }, style];

  return (
    <Pressable onPress={onPress} hitSlop={8}>
      {blurred ? (
        <BlurView
          key={revision}
          blurTarget={blurTarget ?? undefined}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={70}
          tint="light"
          style={[shape, styles.clip]}
        >
          <LinearGradient
            colors={TINT}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {children}
        </BlurView>
      ) : (
        <View style={[shape, { backgroundColor: hexToRgba(tokens.surface.white, 0.85) }]}>{children}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.surface.glassBorder,
  },
  clip: { overflow: 'hidden' },
});
