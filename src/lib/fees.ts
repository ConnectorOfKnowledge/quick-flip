import type { Settings } from './supabase';

export interface ProfitBreakdown {
  salePrice: number;
  purchasePrice: number;
  ebayFinalValueFee: number;
  paymentProcessingFee: number;
  paymentFixedFee: number;
  packagingCost: number;
  totalFees: number;
  netProfit: number;
  profitMargin: number; // percentage
  estimatedShipping: number; // shown but not deducted (buyer pays)
}

/**
 * Calculate profit breakdown for a potential flip.
 * Shipping is shown for reference but NOT deducted -- buyer pays shipping.
 */
export function calculateProfit(
  salePrice: number,
  purchasePrice: number,
  settings: Settings
): ProfitBreakdown {
  const ebayFinalValueFee = salePrice * settings.ebay_final_value_fee;
  const paymentProcessingFee = salePrice * settings.payment_processing_fee;
  const paymentFixedFee = settings.payment_fixed_fee;
  const packagingCost = settings.default_packaging_cost;

  const totalFees = ebayFinalValueFee + paymentProcessingFee + paymentFixedFee + packagingCost;
  const netProfit = salePrice - purchasePrice - totalFees;
  const profitMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  return {
    salePrice,
    purchasePrice,
    ebayFinalValueFee: round(ebayFinalValueFee),
    paymentProcessingFee: round(paymentProcessingFee),
    paymentFixedFee: round(paymentFixedFee),
    packagingCost: round(packagingCost),
    totalFees: round(totalFees),
    netProfit: round(netProfit),
    profitMargin: round(profitMargin),
    estimatedShipping: settings.default_shipping_estimate,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
