import { router } from 'expo-router';

// Мостик между экраном и formSheet-роутом — тот же паттерн, что у payoutSheet:
// передаём не объект, а имя площадки, чтобы шит брал запись из того же
// источника (`BANK_TIMING`) и не держал копию данных.
let name = '';

export function openBankTimingSheet(next: string) {
  name = next;
  // Приведение — типизированные маршруты генерирует `expo start`, а мы
  // собираемся без Metro. Сам маршрут настоящий — app/bank-timing-detail.tsx.
  router.push('/bank-timing-detail' as never);
}

export function getBankTimingSheet(): string {
  return name;
}
