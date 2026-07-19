import { useCallback, useMemo } from 'react';
import type { CurrencyCode } from '@/domain/types';
import type { AppData, RateSnapshot } from '@/storage/types';
import { fetchCbrRates, fetchCbrHistory } from '@/rates/cbr';
import { fetchKeyRateHistory, mergeKeyRateHistory, EARLIEST_DATE } from '@/rates/keyRate';
import { KEY_RATE_HISTORY } from '@/domain/keyRateHistory';

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

export function useRatesActions(data: AppData, persist: (next: AppData) => Promise<void>): RatesActions {
  const setManualRate = useCallback(
    async (code: CurrencyCode, value: number | undefined) => {
      const manualRates = { ...data.manualRates };
      if (value === undefined) delete manualRates[code];
      else manualRates[code] = value;
      await persist({ ...data, manualRates });
    },
    [data, persist],
  );

  const refreshRates = useCallback(async () => {
    const fetched = await fetchCbrRates();
    const rates = { ...data.rates, ...fetched };
    await persist({
      ...data,
      rates,
      ratesUpdatedAt: new Date().toISOString(),
      ratesHistory: appendSnapshot(data.ratesHistory, rates),
    });
  }, [data, persist]);

  const backfillRateHistory = useCallback(async () => {
    const hist = await fetchCbrHistory();
    const byDate = new Map<string, RateSnapshot>();
    for (const s of data.ratesHistory) byDate.set(s.date, s);
    for (const s of hist) byDate.set(s.date, s);
    const merged = [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90);
    await persist({ ...data, ratesHistory: merged });
  }, [data, persist]);

  /**
   * Полный пересбор истории курсов с нуля — выбрасывает всё старое (в т.ч.
   * записи, задвоенные старым багом бэкфилла, когда архивный запрос на «сегодня»
   * перетирал живое значение), тянет архив заново (уже без «сегодня» в диапазоне)
   * и добавляет актуальный курс на сегодня отдельным live-запросом.
   */
  const resetRateHistory = useCallback(async () => {
    const hist = await fetchCbrHistory();
    const fetched = await fetchCbrRates();
    const rates = { ...data.rates, ...fetched };
    const withToday = appendSnapshot(hist, rates);
    await persist({
      ...data,
      rates,
      ratesUpdatedAt: new Date().toISOString(),
      ratesHistory: withToday.slice(-90),
    });
  }, [data, persist]);

  const refreshKeyRate = useCallback(async () => {
    const stored = data.keyRateHistory.length > 0 ? data.keyRateHistory : KEY_RATE_HISTORY;
    const fromDate = stored[0]?.date ?? EARLIEST_DATE;
    const fetched = await fetchKeyRateHistory(fromDate);
    const merged = mergeKeyRateHistory(stored, fetched);
    await persist({
      ...data,
      keyRateHistory: merged,
      params: { ...data.params, keyRate: merged[0].rate },
    });
  }, [data, persist]);

  return useMemo(
    () => ({ setManualRate, refreshRates, backfillRateHistory, resetRateHistory, refreshKeyRate }),
    [setManualRate, refreshRates, backfillRateHistory, resetRateHistory, refreshKeyRate],
  );
}
