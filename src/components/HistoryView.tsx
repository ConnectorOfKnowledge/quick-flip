import React, { useState, useEffect, useCallback } from 'react';
import type { Scan, Settings } from '../lib/supabase';
import { getScans, deleteScan } from '../lib/supabase';
import { formatCurrency } from '../lib/fees';
import Card from './ui/Card';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import ResultCard from './ResultCard';

interface HistoryViewProps {
  settings: Settings;
}

export default function HistoryView({ settings }: HistoryViewProps) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadScans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getScans();
      setScans(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteScan(id);
      setScans((prev) => prev.filter((s) => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  function profitColor(profit: number | null): string {
    if (profit == null) return 'text-qf-text-muted';
    if (profit > 10) return 'text-qf-accent';
    if (profit > 0) return 'text-qf-warn';
    return 'text-qf-danger';
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center py-16 gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-qf-text-muted">Loading history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card className="border-qf-danger/30 bg-qf-danger/5">
          <p className="text-sm text-qf-danger">{error}</p>
        </Card>
        <Button variant="secondary" onClick={loadScans} className="w-full">
          Retry
        </Button>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="text-4xl mb-3 text-qf-text-muted">$</div>
        <p className="text-qf-text font-semibold mb-1">No scans yet</p>
        <p className="text-sm text-qf-text-muted">
          Your saved scans will appear here. Head to the Scan tab to check your first item.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-qf-text">History</h2>
        <Button variant="ghost" size="sm" onClick={loadScans}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </Button>
      </div>

      {scans.map((scan) => {
        const isExpanded = expandedId === scan.id;
        const date = new Date(scan.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        return (
          <div key={scan.id}>
            <Card
              onClick={() => setExpandedId(isExpanded ? null : scan.id)}
              className="flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-qf-text truncate">
                  {scan.product_name || scan.query_text || 'Unknown'}
                </p>
                <p className="text-xs text-qf-text-muted mt-0.5">
                  {date} | Paid {scan.purchase_price != null ? formatCurrency(scan.purchase_price) : '--'}
                  {' '} / Sells {scan.avg_sold_price != null ? formatCurrency(scan.avg_sold_price) : '--'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-lg font-bold font-mono ${profitColor(scan.net_profit)}`}>
                  {scan.net_profit != null ? formatCurrency(scan.net_profit) : '--'}
                </p>
              </div>
            </Card>

            {isExpanded && (
              <div className="mt-2 space-y-2">
                <ResultCard
                  scan={scan}
                  settings={settings}
                  showSaveButton={false}
                  initialPurchasePrice={scan.purchase_price ?? undefined}
                />
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(scan.id)}
                  disabled={deletingId === scan.id}
                  className="w-full"
                >
                  {deletingId === scan.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
