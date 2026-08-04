import { useCallback, useMemo } from 'react';
import type { Asset, AssetStatus, FinancialInstrument, Organization, Snapshot } from '@/domain/types';
import type { AppData } from '@/storage/types';
import { calculate, ENGINE_VERSION } from '@/calc';
import { uid } from '@/utils/id';

export interface AssetActions {
  addAsset: (asset: Asset) => Promise<void>;
  /** Атомарное создание актива вместе с новыми организацией/инструментом (флоу
   * «Новый актив»): последовательные addOrganization+addInstrument+addAsset из
   * одного обработчика затирали бы друг друга — каждый persist от одного data. */
  createAssetBundle: (bundle: { organization?: Organization; instrument?: FinancialInstrument; asset: Asset }) => Promise<void>;
  updateAsset: (asset: Asset) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  /** `closedDate` (ISO 'YYYY-MM-DD') — фактический день закрытия, а не момент
   *  нажатия кнопки: именно он определяет, до какого дня актив жил на графике. */
  setAssetStatus: (id: string, status: AssetStatus, closedDate?: string) => Promise<void>;
}

export function useAssetActions(data: AppData, persist: (next: AppData) => Promise<void>): AssetActions {
  const addAsset = useCallback(
    async (asset: Asset) => {
      await persist({ ...data, assets: [...data.assets, asset] });
    },
    [data, persist],
  );

  const createAssetBundle = useCallback(
    async (bundle: { organization?: Organization; instrument?: FinancialInstrument; asset: Asset }) => {
      await persist({
        ...data,
        organizations: bundle.organization ? [...data.organizations, bundle.organization] : data.organizations,
        instruments: bundle.instrument ? [...data.instruments, bundle.instrument] : data.instruments,
        assets: [...data.assets, bundle.asset],
      });
    },
    [data, persist],
  );

  const updateAsset = useCallback(
    async (asset: Asset) => {
      await persist({
        ...data,
        assets: data.assets.map((a) => (a.id === asset.id ? asset : a)),
      });
    },
    [data, persist],
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      await persist({ ...data, assets: data.assets.filter((a) => a.id !== id) });
    },
    [data, persist],
  );

  const setAssetStatus = useCallback(
    async (id: string, status: AssetStatus, closedDate?: string) => {
      const asset = data.assets.find((a) => a.id === id);
      let snapshots = data.snapshots;
      // фиксируем Snapshot при закрытии/архивации активного актива (решение #8)
      if (asset && asset.status === 'active' && (status === 'closed' || status === 'archived')) {
        const instr = data.instruments.find((i) => i.id === asset.instrumentId);
        if (instr) {
          const snap: Snapshot = {
            id: uid('snap-'),
            assetId: id,
            createdAt: new Date().toISOString(),
            reason: status,
            excludeFromAnalytics: status === 'archived',
            engineVersion: ENGINE_VERSION,
            derived: calculate(asset, instr, data.params),
            assetSnapshot: { ...asset, status, closedDate },
          };
          snapshots = [...data.snapshots, snap];
        }
      }
      await persist({
        ...data,
        assets: data.assets.map((a) =>
          a.id === id
            // Возврат в active (восстановление из архива) — дату закрытия убираем,
            // иначе актив останется «мёртвым» на графике после восстановления.
            ? { ...a, status, closedDate: status === 'active' ? undefined : closedDate ?? a.closedDate }
            : a,
        ),
        snapshots,
      });
    },
    [data, persist],
  );

  return useMemo(
    () => ({ addAsset, createAssetBundle, updateAsset, deleteAsset, setAssetStatus }),
    [addAsset, createAssetBundle, updateAsset, deleteAsset, setAssetStatus],
  );
}
