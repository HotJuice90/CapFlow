import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { AppData } from '@/storage/types';

/** Экспорт всех данных в JSON-файл и системный шеринг (сохранить в Файлы/Drive/отправить). */
export async function exportData(data: AppData): Promise<boolean> {
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `capflow-backup-${date}.json`;
  const uri = (FileSystem.cacheDirectory ?? '') + fileName;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(data, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Экспорт данных CapFlow',
      UTI: 'public.json',
    });
    return true;
  }
  return false;
}

/** Импорт: выбор JSON-файла → разбор → базовая валидация. Возвращает данные или null (отмена). */
export async function importData(): Promise<AppData | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled) return null;
  const file = res.assets?.[0];
  if (!file) return null;

  const content = await FileSystem.readAsStringAsync(file.uri);
  let parsed: AppData;
  try {
    parsed = JSON.parse(content) as AppData;
  } catch {
    throw new Error('Файл не является корректным JSON');
  }
  if (!parsed || !Array.isArray(parsed.assets) || !Array.isArray(parsed.organizations)) {
    throw new Error('Это не похоже на резервную копию CapFlow');
  }
  return parsed;
}
