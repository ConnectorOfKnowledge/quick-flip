import { useState, useMemo } from 'react';
import type { Scan, SoldComp, Settings } from '../lib/supabase';
import { calculateProfit, formatCurrency } from '../lib/fees';
import Card from './ui/Card';
import Button from './ui/Button';

interface ResultCardProps {
  scan: Scan;
  settings: Settings;
  onSave?: (scan: Scan, purchasePrice: number) => void | Promise<void>;
  showSaveButton?: boolean;
  initialPurchasePrice?: number;
}

export default function ResultCard({
  scan,
  settings,
  onSave,
  showSaveButton = true,
  initialPurchasePrice,
}: ResultCardProps) {
  const [purchasePrice, setPurchasePrice] = useState<string>(
    initialPurchasePrice != null ? String(initialPurchasePrice) : scan.purchase_price != null ? String(scan.purchase_price) : ''
  );
  const [showFees, setShowFees] = useState(false);
  const [showComps, setShowComps] = useState(false);
  const [saving, setSaving] = useState(false);

  const purchaseNum = parseFloat(purchasePrice) || 0;
  const salePrice = scan.avg_sold_price ?? 0;

  const breakdown = useMemo(
    () => calculateProfit(salePrice, purchaseNum, settings),
    [salePrice, purchaseNum, settings]
  );

  const profitColor =
    breakdown.netProfit > 10 ? 'text-qf-accent' :
    breakdown.netProfit > 0 ? 'text-qf-warn' :
    'text-qf-danger';

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(scan, purchaseNum);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      {/* Product name */}
      <h2 className="text-xl font-semibold text-qf-text leading-tight">
        {scan.product_name || scan.query_text || 'Unknown Product'}
      </h2>

      {/* Purchase price input */}
      <div>
        <label htmlFor="purchase-price" className="text-sm text-qf-text-muted font-medium block mb-1">
          What's the store asking?
        </label>
        <input
          id="purchase-price"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-qf-border bg-qf-surface text-2xl font-bold font-mono text-qf-text focus:outline-none focus:ring-2 focus:ring-qf-primary/30 focus:border-qf-primary min-h-[52px]"
        />
      </div>

      {/* Profit summary */}
      {purchaseNum > 0 && (
        <div className="text-center py-3">
          <p className="text-sm text-qf-text-muted mb-1">Estimated Net Profit</p>
          <p className={`text-3xl font-bold font-mono ${profitColor}`}>
            {formatCurrency(breakdown.netProfit)}
          </p>
          <p className="text-sm text-qf-text-muted mt-1">
            {breakdown.profitMargin.toFixed(1)}% margin on {formatCurrency(salePrice)} avg sale
          </p>
        </div>
      )}

      {/* Shipping note */}
      <p className="text-sm text-qf-text-muted">
        Buyer pays ~{formatCurrency(breakdown.estimatedShipping)} shipping
      </p>

      {/* Fee breakdown toggle */}
      <button
        type="button"
        onClick={() => setShowFees(!showFees)}
        className="flex items-center gap-2 text-sm font-medium text-qf-primary w-full min-h-[44px] cursor-pointer"
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${showFees ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Fee Breakdown
      </button>
      {showFees && (
        <div className="bg-qf-surface-alt rounded-lg p-3 space-y-2 text-sm">
          <FeeRow label="eBay Final Value Fee" amount={breakdown.ebayFinalValueFee} />
          <FeeRow label="Payment Processing" amount={breakdown.paymentProcessingFee} />
          <FeeRow label="Payment Fixed Fee" amount={breakdown.paymentFixedFee} />
          <FeeRow label="Packaging Cost" amount={breakdown.packagingCost} />
          <div className="border-t border-qf-border pt-2 mt-2 font-semibold flex justify-between">
            <span>Total Fees</span>
            <span className="font-mono">{formatCurrency(breakdown.totalFees)}</span>
          </div>
        </div>
      )}

      {/* Comps summary */}
      {scan.num_comps > 0 && (
        <>
          <p className="text-sm text-qf-text-muted">
            Based on {scan.num_comps} sold listing{scan.num_comps !== 1 ? 's' : ''}:{' '}
            avg {formatCurrency(salePrice)}
            {scan.low_price != null && scan.high_price != null && (
              <> (range {formatCurrency(scan.low_price)} - {formatCurrency(scan.high_price)})</>
            )}
          </p>

          {/* View comps toggle */}
          {scan.comps && scan.comps.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowComps(!showComps)}
                className="flex items-center gap-2 text-sm font-medium text-qf-primary w-full min-h-[44px] cursor-pointer"
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${showComps ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                View Comps ({scan.comps.length})
              </button>
              {showComps && (
                <div className="space-y-2">
                  {scan.comps.map((comp, i) => (
                    <CompRow key={i} comp={comp} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Save button */}
      {showSaveButton && onSave && (
        <Button
          onClick={handleSave}
          disabled={saving || purchaseNum <= 0}
          className="w-full"
        >
          {saving ? 'Saving...' : 'Save to History'}
        </Button>
      )}
    </Card>
  );
}

function FeeRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-qf-text-muted">{label}</span>
      <span className="font-mono">{formatCurrency(amount)}</span>
    </div>
  );
}

function CompRow({ comp }: { comp: SoldComp }) {
  const date = new Date(comp.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <a
      href={comp.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 p-3 bg-qf-surface-alt rounded-lg min-h-[44px] hover:bg-qf-border/50 transition-colors duration-150"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-qf-text truncate">{comp.title}</p>
        <p className="text-xs text-qf-text-muted">{comp.condition} - {date}</p>
      </div>
      <span className="text-base font-bold font-mono text-qf-text whitespace-nowrap">
        {formatCurrency(comp.price)}
      </span>
    </a>
  );
}
