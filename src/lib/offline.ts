/**
 * Offline queue using IndexedDB via idb-keyval.
 * Stores photos taken while offline, processes them when back online.
 */
import { get, set, del, keys } from 'idb-keyval';

export interface QueuedItem {
  id: string;
  timestamp: number;
  type: 'photo' | 'barcode' | 'text';
  data: string; // base64 image data, barcode string, or search text
  status: 'queued' | 'processing' | 'complete' | 'error';
  result?: unknown;
  error?: string;
}

const QUEUE_PREFIX = 'qf_queue_';

export async function addToQueue(item: Omit<QueuedItem, 'id' | 'timestamp' | 'status'>): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const queuedItem: QueuedItem = {
    ...item,
    id,
    timestamp: Date.now(),
    status: 'queued',
  };
  await set(`${QUEUE_PREFIX}${id}`, queuedItem);
  return id;
}

export async function getQueue(): Promise<QueuedItem[]> {
  const allKeys = await keys();
  const queueKeys = allKeys.filter((k) => String(k).startsWith(QUEUE_PREFIX));
  const items: QueuedItem[] = [];

  for (const key of queueKeys) {
    const item = await get<QueuedItem>(key);
    if (item) items.push(item);
  }

  return items.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateQueueItem(id: string, updates: Partial<QueuedItem>): Promise<void> {
  const item = await get<QueuedItem>(`${QUEUE_PREFIX}${id}`);
  if (!item) return;
  await set(`${QUEUE_PREFIX}${id}`, { ...item, ...updates });
}

export async function removeFromQueue(id: string): Promise<void> {
  await del(`${QUEUE_PREFIX}${id}`);
}

export async function clearQueue(): Promise<void> {
  const allKeys = await keys();
  const queueKeys = allKeys.filter((k) => String(k).startsWith(QUEUE_PREFIX));
  for (const key of queueKeys) {
    await del(key);
  }
}

export function isOnline(): boolean {
  return navigator.onLine;
}
