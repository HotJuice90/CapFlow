import { router } from 'expo-router';

/** Одна выплата: актив и дата начисления. */
export interface PayoutSheetItem {
  assetId: string;
  date: string;
}

// Мостик между экраном и formSheet-роутом — тот же паттерн, что у actionSheet.
// Список, а не одна выплата: счета обычно платят первого числа все разом, и
// решать по каждому приходится в один заход.
let items: PayoutSheetItem[] = [];

export function openPayoutSheet(next: PayoutSheetItem[]) {
  items = next;
  // Приведение — типизированные маршруты генерирует `expo start`, а мы
  // собираемся без Metro. Сам маршрут настоящий — app/payout.tsx.
  router.push('/payout' as never);
}

export function getPayoutSheet(): PayoutSheetItem[] {
  return items;
}
