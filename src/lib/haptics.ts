import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Тактильный фидбэк, единый по приложению.
 * Android: системный калиброванный движок (как у жестов) — мягче и точнее, чем impactAsync.
 * iOS: ImpactFeedbackStyle.
 */

/** Лёгкий тик — для частых тапов (табы, выбор строки, swap). */
export function tapBuzz() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick).catch(() => {});
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
  }
}

/** Ощутимый отклик — подтверждение действия (сохранение, добавление). */
export function actionBuzz() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => {});
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
}

/** Успех — завершённая операция. */
export function successBuzz() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Предупреждение / ошибка / удаление. */
export function warnBuzz() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject).catch(() => {});
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}
