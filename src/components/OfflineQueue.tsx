import { useState, useEffect, useCallback } from 'react';
import { getQueue, removeFromQueue, updateQueueItem, isOnline } from '../lib/offline';
import type { QueuedItem } from '../lib/offline';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Spinner from './ui/Spinner';

interface OfflineQueueProps {
  onQueueChange: () => void;
  onProcessComplete?: () => void;
}

export default function OfflineQueue({ onQueueChange, onProcessComplete }: OfflineQueueProps) {
  const [items, setItems] = useState<QueuedItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const queue = await getQueue();
    setItems(queue);
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function handleRemove(id: string) {
    await removeFromQueue(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    onQueueChange();
  }

  async function processAll() {
    if (!isOnline()) return;
    setProcessing(true);

    for (const item of items) {
      if (item.status === 'complete') continue;
      setProcessingId(item.id);
      await updateQueueItem(item.id, { status: 'processing' });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'processing' } : i))
      );

      try {
        let query = item.data;

        if (item.type === 'photo') {
          const photoRes = await fetch('/api/photo-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: item.data }),
          });
          if (!photoRes.ok) throw new Error('Photo ID failed');
          const photoData = await photoRes.json();
          query = photoData.product_name;
        }

        const res = await fetch('/api/ebay-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, type: item.type }),
        });
        if (!res.ok) throw new Error('Search failed');
        const result = await res.json();

        await updateQueueItem(item.id, { status: 'complete', result });
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'complete' } : i))
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Processing failed';
        await updateQueueItem(item.id, { status: 'error', error: errorMsg });
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: 'error', error: errorMsg } : i
          )
        );
      }
    }

    setProcessingId(null);
    setProcessing(false);
    onQueueChange();
    onProcessComplete?.();
  }

  const statusBadge = (status: QueuedItem['status']) => {
    switch (status) {
      case 'queued':
        return <Badge>Queued</Badge>;
      case 'processing':
        return <Badge variant="warn">Processing</Badge>;
      case 'complete':
        return <Badge variant="success">Done</Badge>;
      case 'error':
        return <Badge variant="danger">Error</Badge>;
    }
  };

  const typeLabel = (type: QueuedItem['type']) => {
    switch (type) {
      case 'barcode': return 'Barcode';
      case 'photo': return 'Photo';
      case 'text': return 'Text search';
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-sm text-qf-text-muted">No items in queue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-qf-text">Offline Queue</h3>
        <Button
          size="sm"
          onClick={processAll}
          disabled={processing || !isOnline()}
        >
          {processing ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Processing...
            </>
          ) : (
            `Process All (${items.length})`
          )}
        </Button>
      </div>

      {items.map((item) => (
        <Card key={item.id} className="flex items-center gap-3">
          {/* Thumbnail for photos, icon for others */}
          <div className="w-12 h-12 rounded-lg bg-qf-surface-alt flex items-center justify-center shrink-0 overflow-hidden">
            {item.type === 'photo' ? (
              <img
                src={item.data}
                alt="Queued photo"
                className="w-full h-full object-cover"
              />
            ) : item.type === 'barcode' ? (
              <svg className="w-6 h-6 text-qf-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h3v16H3V4zm5 0h1v16H8V4zm3 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h3v16h-3V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-qf-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-qf-text truncate">
              {item.type === 'photo' ? 'Photo capture' : item.data}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-qf-text-muted">{typeLabel(item.type)}</span>
              {statusBadge(item.status)}
            </div>
            {item.error && (
              <p className="text-xs text-qf-danger mt-1">{item.error}</p>
            )}
          </div>

          {processingId === item.id ? (
            <Spinner size="sm" />
          ) : (
            <button
              type="button"
              onClick={() => handleRemove(item.id)}
              className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-qf-text-muted hover:text-qf-danger hover:bg-qf-danger/10 transition-colors duration-150 cursor-pointer"
              aria-label="Remove from queue"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}
