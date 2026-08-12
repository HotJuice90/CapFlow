import Constants from 'expo-constants';
import { RELEASES_API } from './config';

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  apkUrl?: string;
  /** размер .apk в байтах — показываем в UI, чтобы не качать 100 МБ вслепую */
  apkSize?: number;
  pageUrl: string;
  notes?: string;
  publishedAt?: string;
}

function parseVer(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVer(latest);
  const b = parseVer(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export function currentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

/** Проверяет последний релиз на GitHub и сравнивает с текущей версией приложения. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = currentVersion();
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  const json = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
    body?: string;
    published_at?: string;
    assets?: GithubAsset[];
  };

  const latest = String(json.tag_name ?? '0.0.0').replace(/^v/i, '');
  const apk = (json.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.apk'));

  return {
    available: isNewer(latest, current),
    current,
    latest,
    apkUrl: apk?.browser_download_url,
    apkSize: apk?.size,
    pageUrl: json.html_url ?? RELEASES_API,
    notes: json.body || undefined,
    publishedAt: json.published_at,
  };
}
