import { useCallback, useMemo } from 'react';
import type { CurrencyCode } from '@/domain/types';
import type { AppData, RateSnapshot } from '@/storage/types';
import { fetchCbrRates, fetchCbrHistory } from '@/rates/cbr';
import { fetchKeyRateHistory, mergeKeyRateHistory, EARLIEST_DATE } from '@/rates/keyRate';
import { KEY_RATE_HISTORY } from '@/domain/keyRateHistory';
import type { Persist } from './persist';

/** Добавляет срез курсов за сегодня в историю (дедуп по дню, последние 90). */
export function appendSnapshot(history: RateSnapshot[], rates: AppData['rates']): RateSnapshot[] {
  const date = new Date().toISOString().slice(0, 10);
  const filtered = history.filter((s) => s.date !== date);
  return [...filtered, { date, rates: { ...rates } }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);
}

export interface RatesActions {
  setManualRate: (code: CurrencyCode, value: number | undefined) => Promise<void>;
  refreshRates: () => Promise<void>;
  backfillRateHistory: () => Promise<void>;
  resetRateHistory: () => Promise<void>;
  refreshKeyRate: () => Promise<void>;
}

// `data` здесь нужен только на ЧТЕНИЕ (с какой даты тянуть историю ключевой
// ставки) — все записи идут через апдейтер, от свежего состояния.
export function useRatesActions(data: AppData, persist: Persist): RatesActions {
  const setManualRate = useCallback(
    async (code: CurrencyCode, value: number | undefined) => {
      await persist((prev) => {
        const manualRates = { ...prev.manualRates };
        if (value === undefined) delete manualRates[code];
        else manualRates[code] = value;
        return { ...prev, manualRates };
      });
    },
    [persist],
  );

  const refreshRates = useCallback(async () => {
    const fetched = await fetchCbrRates();
    await persist((prev) => {
      const rates = { ...prev.rates, ...fetched };
      return {
        ...prev,
        rates,
        ratesUpdatedAt: new Date().toISOString(),
        ratesHistory: appendSnapshot(prev.ratesHistory, rates),
      };
    });
  }, [persist]);

  const backfillRateHistory = useCallback(async () => {
    const hist = await fetchCbrHistory();
    await persist((prev) => {
      const byDate = new Map<string, RateSnapshot>();
      for (const s of prev.ratesHistory) byDate.set(s.date, s);
      for (const s of hist) byDate.set(s.date, s);
      const merged = [...byDate.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-90);
      return { ...prev, ratesHistory: merged };
    });
  }, [persist]);

  /**
   * Полный пересбор истории курсов с нуля — выбрасывает всё старое (в т.ч.
   * записи, задвоенные старым багом бэкфилла, когда архивный запрос на «сегодня»
   * перетирал живое значение), тянет архив заново (уже без «сегодня» в диапазоне)
   * и добавляет актуальный курс на сегодня отдельным live-запросом.
   */
  const resetRateHistory = useCallback(async () => {
    const hist = await fetchCbrHistory();
    const fetched = await fetchCbrRates();
    await persist((prev) => {
      const rates = { ...prev.rates, ...fetched };
      const withToday = appendSnapshot(hist, rates);
      return {
        ...prev,
        rates,
        ratesUpdatedAt: new Date().toISOString(),
        ratesHistory: withToday.slice(-90),
      };
    });
  }, [persist]);

  const refreshKeyRate = useCallback(async () => {
    const stored = data.keyRateHistory.length > 0 ? data.keyRateHistory : KEY_RATE_HISTORY;
    const fromDate = stored[0]?.date ?? EARLIEST_DATE;
    const fetched = await fetchKeyRateHistory(fromDate);
    await persist((prev) => {
      const base = prev.keyRateHistory.length > 0 ? prev.keyRateHistory : KEY_RATE_HISTORY;
      const merged = mergeKeyRateHistory(base, fetched);
      return {
        ...prev,
        keyRateHistory: merged,
        params: { ...prev.params, keyRate: merged[0].rate },
      };
    });
  }, [data.keyRateHistory, persist]);

  return useMemo(
    () => ({ setManualRate, refreshRates, backfillRateHistory, resetRateHistory, refreshKeyRate }),
    [setManualRate, refreshRates, backfillRateHistory, resetRateHistory, refreshKeyRate],
  );
}
