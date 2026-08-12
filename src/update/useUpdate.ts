import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkForUpdate, currentVersion, isNewer, type UpdateInfo } from './checkUpdate';
import { clearDownloadedApk, downloadApk, installApk, type DownloadHandle } from './installUpdate';
import { CHECK_INTERVAL_MS, STORAGE_CACHED, STORAGE_LAST_CHECK, UPDATE_ENABLED } from './config';

export type UpdateStage =
  | 'idle'
  | 'checking'
  | 'available'
  | 'uptodate'
  | 'downloading'
  | 'ready'
  | 'error';

/**
 * Тихая проверка при запуске — читает кэш, ходит в сеть не чаще
 * `CHECK_INTERVAL_MS`. Нужна, чтобы про обновление узнавать самому, а не
 * заходить руками в «О приложении» и жать кнопку.
 * Возвращает `undefined`, пока не выяснили, и `null`, если обновления нет.
 */
export function useUpdateBadge(): UpdateInfo | null | undefined {
  const [info, setInfo] = useState<UpdateInfo | null | undefined>(undefined);

  useEffect(() => {
    if (!UPDATE_ENABLED) { setInfo(null); return; }
    let alive = true;

    void (async () => {
      const [rawCached, rawLast] = await Promise.all([
        AsyncStorage.getItem(STORAGE_CACHED),
        AsyncStorage.getItem(STORAGE_LAST_CHECK),
      ]);

      // Кэш показываем сразу — точка не ждёт сети.
      const fromCache = rawCached ? (JSON.parse(rawCached) as UpdateInfo) : null;
      // Точку НЕ гасим по «пользователь посмотрел» — только когда версия
      // действительно установлена (сравниваем с текущей, а не с флагом): иначе
      // один заход в «О приложении» навсегда прячет напоминание.
      const fresh = (cand: UpdateInfo | null) =>
        cand && isNewer(cand.latest, currentVersion()) ? cand : null;
      if (alive && fromCache) setInfo(fresh(fromCache));

      const last = rawLast ? parseInt(rawLast, 10) : 0;
      if (Date.now() - last < CHECK_INTERVAL_MS) {
        if (alive && !fromCache) setInfo(null);
        return;
      }

      try {
        const res = await checkForUpdate();
        await AsyncStorage.multiSet([
          [STORAGE_CACHED, JSON.stringify(res)],
          [STORAGE_LAST_CHECK, String(Date.now())],
        ]);
        if (alive) setInfo(res.available ? fresh(res) : null);
      } catch {
        // Тихая проверка не должна ничего показывать при отсутствии сети.
        if (alive) setInfo(fromCache ? fresh(fromCache) : null);
      }
    })();

    return () => { alive = false; };
  }, []);

  return info;
}

/**
 * Полный цикл для экрана «О приложении»: проверить → скачать с прогрессом →
 * отдать установщику. Ошибку показываем текстом, а не алертом: пользователь
 * сам нажал кнопку и смотрит на неё.
 */
export function useUpdateFlow() {
  const [stage, setStage] = useState<UpdateStage>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const handle = useRef<DownloadHandle | null>(null);
  const localUri = useRef<string | null>(null);

  // Уходим с экрана посреди скачивания — отменяем и чистим кэш (иначе в нём
  // висит недокачанный APK на сотню мегабайт). Зависимостей нет намеренно:
  // эффект должен сработать РОВНО на размонтировании, а не на каждой смене
  // стадии — иначе он снёс бы файл сразу после успешного скачивания.
  useEffect(
    () => () => {
      const h = handle.current;
      if (h) { handle.current = null; void h.cancel().then(() => clearDownloadedApk()); }
    },
    [],
  );

  const check = useCallback(async () => {
    setStage('checking');
    setError(undefined);
    setInfo(null);
    try {
      const res = await checkForUpdate();
      await AsyncStorage.multiSet([
        [STORAGE_CACHED, JSON.stringify(res)],
        [STORAGE_LAST_CHECK, String(Date.now())],
      ]);
      setInfo(res);
      setStage(res.available ? 'available' : 'uptodate');
    } catch {
      setError('Не удалось проверить. Проверьте интернет и попробуйте позже.');
      setStage('error');
    }
  }, []);

  const download = useCallback(async () => {
    if (!info?.apkUrl) {
      setError('В релизе нет APK-файла — обновитесь вручную со страницы релиза.');
      setStage('error');
      return;
    }
    setStage('downloading');
    setProgress(0);
    setError(undefined);
    const h = downloadApk(info.apkUrl, setProgress);
    handle.current = h;
    try {
      localUri.current = await h.done;
      setStage('ready');
      // Сразу открываем установщик — лишний тап тут никому не нужен.
      await installApk(localUri.current);
    } catch {
      // Отмену пользователем за ошибку не считаем.
      if (handle.current === h) {
        setError('Скачивание не удалось. Проверьте интернет и место на устройстве.');
        setStage('error');
      }
    } finally {
      handle.current = null;
    }
  }, [info]);

  const cancel = useCallback(async () => {
    const h = handle.current;
    handle.current = null;
    await h?.cancel();
    await clearDownloadedApk();
    setStage(info?.available ? 'available' : 'idle');
    setProgress(0);
  }, [info]);

  /** Повторно открыть установщик, если пользователь случайно закрыл диалог. */
  const install = useCallback(async () => {
    if (localUri.current) await installApk(localUri.current);
  }, []);

  return { stage, info, progress, error, check, download, cancel, install };
}
