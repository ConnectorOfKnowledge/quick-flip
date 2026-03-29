export const prerender = false;

import type { APIRoute } from 'astro';
import type { SoldComp } from '../../lib/supabase';

// Module-level token cache
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getEbayAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const appId = import.meta.env.EBAY_APP_ID;
  const certId = import.meta.env.EBAY_CERT_ID;

  if (!appId || !certId) {
    throw new Error('eBay API credentials not configured');
  }

  const credentials = btoa(`${appId}:${certId}`);

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`eBay OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Expire 60 seconds early to avoid edge cases
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;

  return cachedToken!;
}

interface BrowseSearchResponse {
  itemSummaries?: Array<{
    title: string;
    price?: { value: string; currency: string };
    condition?: string;
    itemEndDate?: string;
    itemWebUrl?: string;
    image?: { imageUrl: string };
    shippingOptions?: Array<{
      shippingCost?: { value: string; currency: string };
    }>;
  }>;
  total?: number;
  warnings?: unknown[];
}

export const POST: APIRoute = async ({ request }) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': new URL(request.url).origin,
  };

  try {
    const body = await request.json();
    const { query, barcode } = body as { query?: string; barcode?: string };

    const searchTerm = barcode || query;
    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or empty query/barcode parameter' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const token = await getEbayAccessToken();

    // Search eBay Browse API for completed/sold items
    const params = new URLSearchParams({
      q: searchTerm.trim(),
      filter: 'buyingOptions:{FIXED_PRICE|AUCTION},conditions:{NEW|LIKE_NEW|VERY_GOOD|GOOD|ACCEPTABLE|USED_EXCELLENT|USED_VERY_GOOD|USED_GOOD|USED_ACCEPTABLE}',
      sort: '-endDate',
      limit: '20',
    });

    const searchResponse = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      throw new Error(`eBay search failed (${searchResponse.status}): ${errorText}`);
    }

    const searchData: BrowseSearchResponse = await searchResponse.json();
    const items = searchData.itemSummaries ?? [];

    if (items.length === 0) {
      return new Response(
        JSON.stringify({
          product_name: searchTerm,
          avg_sold_price: 0,
          low_price: 0,
          high_price: 0,
          num_comps: 0,
          comps: [],
          estimated_shipping: 0,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Extract comps
    const comps: SoldComp[] = [];
    const prices: number[] = [];
    const shippingCosts: number[] = [];

    for (const item of items) {
      const price = item.price ? parseFloat(item.price.value) : 0;
      if (price <= 0) continue;

      prices.push(price);

      comps.push({
        title: item.title ?? '',
        price,
        date: item.itemEndDate ?? '',
        condition: item.condition ?? 'Unknown',
        url: item.itemWebUrl ?? '',
        image_url: item.image?.imageUrl,
      });

      // Collect shipping costs for estimation
      if (item.shippingOptions?.length) {
        const cost = item.shippingOptions[0].shippingCost;
        if (cost) {
          const shippingVal = parseFloat(cost.value);
          if (shippingVal > 0) {
            shippingCosts.push(shippingVal);
          }
        }
      }
    }

    if (prices.length === 0) {
      return new Response(
        JSON.stringify({
          product_name: searchTerm,
          avg_sold_price: 0,
          low_price: 0,
          high_price: 0,
          num_comps: 0,
          comps: [],
          estimated_shipping: 0,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const avgPrice = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
    const lowPrice = Math.min(...prices);
    const highPrice = Math.max(...prices);
    const estimatedShipping = shippingCosts.length > 0
      ? Math.round((shippingCosts.reduce((a, b) => a + b, 0) / shippingCosts.length) * 100) / 100
      : 0;

    // Use the first comp title as product name (usually most relevant)
    const productName = comps[0]?.title ?? searchTerm;

    return new Response(
      JSON.stringify({
        product_name: productName,
        avg_sold_price: avgPrice,
        low_price: lowPrice,
        high_price: highPrice,
        num_comps: comps.length,
        comps,
        estimated_shipping: estimatedShipping,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders }
    );
  }
};
