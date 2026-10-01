import { useCallback, useMemo } from 'react';
import type { Asset, AssetStatus, CurrencyCode, FinancialInstrument, Organization, Snapshot } from '@/domain/types';
import { calculate, ENGINE_VERSION } from '@/calc';
import { uid } from '@/utils/id';
import type { Persist } from './persist';

export interface AssetActions {
  addAsset: (asset: Asset) => Promise<void>;
  /** Создание актива вместе с новыми организацией/инструментом (флоу «Новый
   * актив») одной записью. */
  createAssetBundle: (bundle: { organization?: Organization; instrument?: FinancialInstrument; asset: Asset }) => Promise<void>;
  updateAsset: (asset: Asset) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  /** `closedDate` (ISO 'YYYY-MM-DD') — фактический день закрытия, а не момент
   *  нажатия кнопки: именно он определяет, до какого дня актив жил на графике. */
  setAssetStatus: (id: string, status: AssetStatus, closedDate?: string) => Promise<void>;
  /**
   * Решение по выплате процентов. Запись у актива и (для «в кошелёк») приход в
   * свободный капитал пишутся ОДНИМ persist: это одно движение денег, и
   * половина его в данных — хуже, чем ничего.
   */
  recordPayout: (args: {
    assetId: string;
    date: string;
    action: 'keep' | 'wallet';
    amount: number;
    currency: CurrencyCode;
    comment: string;
  }) => Promise<void>;
}

export function useAssetActions(persist: Persist): AssetActions {
  const addAsset = useCallback(
    async (asset: Asset) => {
      await persist((prev) => ({ ...prev, assets: [...prev.assets, asset] }));
    },
    [persist],
  );

  const createAssetBundle = useCallback(
    async (bundle: { organization?: Organization; instrument?: FinancialInstrument; asset: Asset }) => {
      await persist((prev) => ({
        ...prev,
        organizations: bundle.organization ? [...prev.organizations, bundle.organization] : prev.organizations,
        instruments: bundle.instrument ? [...prev.instruments, bundle.instrument] : prev.instruments,
        assets: [...prev.assets, bundle.asset],
      }));
    },
    [persist],
  );

  const updateAsset = useCallback(
    async (asset: Asset) => {
      await persist((prev) => ({
        ...prev,
        assets: prev.assets.map((a) => (a.id === asset.id ? asset : a)),
      }));
    },
    [persist],
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      await persist((prev) => ({ ...prev, assets: prev.assets.filter((a) => a.id !== id) }));
    },
    [persist],
  );

  const setAssetStatus = useCallback(
    async (id: string, status: AssetStatus, closedDate?: string) => {
      await persist((prev) => {
        const asset = prev.assets.find((a) => a.id === id);
        let snapshots = prev.snapshots;
        // фиксируем Snapshot при закрытии/архивации активного актива (решение #8)
        if (asset && asset.status === 'active' && (status === 'closed' || status === 'archived')) {
          const instr = prev.instruments.find((i) => i.id === asset.instrumentId);
          if (instr) {
            const snap: Snapshot = {
              id: uid('snap-'),
              assetId: id,
              createdAt: new Date().toISOString(),
              reason: status,
              excludeFromAnalytics: status === 'archived',
              engineVersion: ENGINE_VERSION,
              derived: calculate(asset, instr, prev.params),
              assetSnapshot: { ...asset, status, closedDate },
            };
            snapshots = [...prev.snapshots, snap];
          }
        }
        return {
          ...prev,
          assets: prev.assets.map((a) =>
            a.id === id
              // Возврат в active (восстановление из архива) — дату закрытия убираем,
              // иначе актив останется «мёртвым» на графике после восстановления.
              ? { ...a, status, closedDate: status === 'active' ? undefined : closedDate ?? a.closedDate }
              : a,
          ),
          snapshots,
        };
      });
    },
    [persist],
  );

  const recordPayout = useCallback(
    async ({ assetId, date, action, amount, currency, comment }: {
      assetId: string; date: string; action: 'keep' | 'wallet';
      amount: number; currency: CurrencyCode; comment: string;
    }) => {
      await persist((prev) => {
        const assets = prev.assets.map((a) => {
          if (a.id !== assetId) return a;
          const rest = (a.payouts ?? []).filter((p) => p.date !== date);
          return {
            ...a,
            payouts: [
              ...rest,
              // Сумму храним только у «в кошелёк»: это факт движения денег, он
              // должен совпасть с записью в свободном капитале.
              { id: uid('po-'), date, action, ...(action === 'wallet' ? { amount } : {}) },
            ],
          };
        });
        const freeCapitalEntries = action === 'wallet'
          ? [...prev.freeCapitalEntries, {
              id: uid('fc-'),
              date,
              amount,
              currency,
              comment,
              createdAt: new Date().toISOString(),
            }]
          : prev.freeCapitalEntries;
        return { ...prev, assets, freeCapitalEntries };
      });
    },
    [persist],
  );

  return useMemo(
    () => ({ addAsset, createAssetBundle, updateAsset, deleteAsset, setAssetStatus, recordPayout }),
    [addAsset, createAssetBundle, updateAsset, deleteAsset, setAssetStatus, recordPayout],
  );
}
