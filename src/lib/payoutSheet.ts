import { router } from 'expo-router';

/** Что открываем в шите выплаты — актив и дата начисления. */
export interface PayoutSheetConfig {
  assetId: string;
  date: string;
}

// Мостик между экраном и formSheet-роутом — тот же паттерн, что у actionSheet.
let config: PayoutSheetConfig | null = null;

export function openPayoutSheet(cfg: PayoutSheetConfig) {
  config = cfg;
  // Приведение — типизированные маршруты генерирует `expo start`, а мы
  // собираемся без Metro. Сам маршрут настоящий — app/payout.tsx.
  router.push('/payout' as never);
}

export function getPayoutSheet(): PayoutSheetConfig | null {
  return config;
}
