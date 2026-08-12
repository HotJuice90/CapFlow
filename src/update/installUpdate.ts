import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

/**
 * Скачивание APK внутрь приложения + передача системному установщику.
 *
 * Почему так, а не `Linking.openURL(apkUrl)` (как было раньше): браузер уводил
 * из приложения, ронял ссылку в «Загрузки», а дальше пользователь сам искал
 * файл и тыкал по нему. Здесь весь путь внутри: прогресс виден, файл кладётся
 * в кэш, установщик открывается сам.
 *
 * Ключевой момент Android: установщику НЕЛЬЗЯ передать `file://` URI — с API 24
 * это FileUriExposedException. Нужен `content://` через FileProvider, его даёт
 * `FileSystem.getContentUriAsync` (у expo-file-system свой провайдер в манифесте,
 * ничего дописывать не надо). Флаг 1 = FLAG_GRANT_READ_URI_PERMISSION, без него
 * установщик не прочитает файл.
 *
 * Разрешение `REQUEST_INSTALL_PACKAGES` в манифесте нужно, чтобы система вообще
 * предложила «разрешить установку из этого источника» — без него молча ничего
 * не происходит.
 */

const APK_NAME = 'capflow-update.apk';

function apkPath(): string {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('Нет доступа к кэшу — некуда скачивать');
  return `${dir}${APK_NAME}`;
}

/** Подчищаем прошлый скачанный APK — иначе в кэше висит 100 МБ мусора. */
export async function clearDownloadedApk(): Promise<void> {
  try {
    await FileSystem.deleteAsync(apkPath(), { idempotent: true });
  } catch {
    // не критично: файл мог быть уже удалён системой при нехватке места
  }
}

export interface DownloadHandle {
  /** Промис завершения — резолвится локальным `file://` путём. */
  done: Promise<string>;
  cancel: () => Promise<void>;
}

/**
 * Качает APK с прогрессом (0..1). Прогресс приходит только при активном
 * приложении — в фоне колбэк молчит до возврата на экран (ограничение
 * expo-file-system), поэтому UI не должен трактовать «прогресс не растёт»
 * как ошибку.
 */
export function downloadApk(url: string, onProgress: (ratio: number) => void): DownloadHandle {
  const target = apkPath();
  const task = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    // totalBytesExpectedToWrite бывает -1, если сервер не отдал Content-Length
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress(Math.min(1, p.totalBytesWritten / p.totalBytesExpectedToWrite));
    }
  });

  const done = (async () => {
    // Старый файл мешает: resumable дописал бы в него хвост нового релиза.
    await clearDownloadedApk();
    const res = await task.downloadAsync();
    if (!res?.uri) throw new Error('Скачивание прервалось');
    return res.uri;
  })();

  return { done, cancel: () => task.cancelAsync() };
}

/** Отдаёт скачанный APK системному установщику. */
export async function installApk(fileUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}
