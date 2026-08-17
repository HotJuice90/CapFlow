/**
 * Мост «экран → таб-бар» для живого блюра.
 *
 * Настоящий RenderEffect-блюр на Android работает только связкой
 * `BlurTargetView` (оборачивает КОНТЕНТ экрана) + `blurTarget` (проп бара):
 * бар должен знать, что именно размывать. Значит нужен канал от экрана к бару.
 *
 * Именно `useSyncExternalStore`, а НЕ обычная module-level переменная: бар не
 * узнает об изменении ссылки и продолжит держать старое (пустое) значение,
 * пока его не перерендерит что-то постороннее. Симптом — «блюр появляется
 * только со второго тапа по бару». Здесь `setBlurTarget` будит подписчиков.
 *
 * Токен-владелец нужен на переходах: уходящий экран не должен своим cleanup'ом
 * стереть цель уже пришедшего.
 */
import { useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import type { View } from 'react-native';

type TargetRef = RefObject<View | null> | null;
type Snapshot = Readonly<{ ref: TargetRef; revision: number }>;

let snapshot: Snapshot = Object.freeze({ ref: null, revision: 0 });
let owner: symbol | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Регистрирует экран источником блюра, возвращает токен владения. */
export function setBlurTarget(ref: Exclude<TargetRef, null>): symbol {
  const next = Symbol('blur-target');
  owner = next;
  snapshot = Object.freeze({ ref, revision: snapshot.revision + 1 });
  emit();
  return next;
}

export function clearBlurTarget(token: symbol): void {
  if (owner !== token) return;
  owner = null;
  snapshot = Object.freeze({ ref: null, revision: snapshot.revision + 1 });
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Snapshot {
  return snapshot;
}

export function useBlurTarget(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
