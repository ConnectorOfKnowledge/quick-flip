export const prerender = false;

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import type { SoldComp } from '../../lib/supabase';

// eBay Finding API – findCompletedItems returns only sold/completed listings.
// Uses the App ID directly as SECURITY-APPNAME (no OAuth token needed).

interface FindingItem {
  title: string[];
  sellingStatus: Array<{
    currentPrice: Array<{ __value__: string }>;
    sellingState: string[];
  }>;
  listingInfo: Array<{
    endTime: string[];
  }>;
  viewItemURL: string[];
  condition?: Array<{
    conditionDisplayName: string[];
  }>;
  galleryURL?: string[];
  shippingInfo?: Array<{
    shippingServiceCost?: Array<{ __value__: string }>;
  }>;
}

interface FindingResponse {
  findCompletedItemsResponse: Array<{
    ack: string[];
    searchResult: Array<{
      '@count': string;
      item?: FindingItem[];
    }>;
    errorMessage?: Array<{
      error: Array<{ message: string[] }>;
    }>;
  }>;
}

export const POST: APIRoute = async (context) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': new URL(context.request.url).origin,
  };

  try {
    const body = await context.request.json();
    const { query, barcode } = body as { query?: string; barcode?: string };

    const searchTerm = barcode || query;
    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or empty query/barcode parameter' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Access env: Cloudflare Workers env first, then import.meta.env fallback (dev)
    const appId = (cfEnv as any)?.EBAY_APP_ID || import.meta.env.EBAY_APP_ID;

    if (!appId) {
      throw new Error('eBay APP ID not configured');
    }

    // Build Finding API request for completed/sold items
    const params = new URLSearchParams({
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.13.0',
      'SECURITY-APPNAME': appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': '',
      'keywords': searchTerm.trim(),
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'sortOrder': 'EndTimeSoonest',
      'paginationInput.entriesPerPage': '20',
    });

    const searchResponse = await fetch(
      `https://svcs.ebay.com/services/search/FindingService/v1?${params}`
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      throw new Error(`eBay Finding API failed (${searchResponse.status}): ${errorText}`);
    }

    const data: FindingResponse = await searchResponse.json();
    const response = data.findCompletedItemsResponse?.[0];

    if (!response || response.ack?.[0] === 'Failure') {
      const errMsg = response?.errorMessage?.[0]?.error?.[0]?.message?.[0] ?? 'Unknown eBay error';
      throw new Error(`eBay Finding API error: ${errMsg}`);
    }

    const items = response.searchResult?.[0]?.item ?? [];

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

    // Extract comps from sold items
    const comps: SoldComp[] = [];
    const prices: number[] = [];
    const shippingCosts: number[] = [];

    for (const item of items) {
      const priceStr = item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__;
      const price = priceStr ? parseFloat(priceStr) : 0;
      if (price <= 0) continue;

      prices.push(price);

      comps.push({
        title: item.title?.[0] ?? '',
        price,
        date: item.listingInfo?.[0]?.endTime?.[0] ?? '',
        condition: item.condition?.[0]?.conditionDisplayName?.[0] ?? 'Unknown',
        url: item.viewItemURL?.[0] ?? '',
        image_url: item.galleryURL?.[0],
      });

      // Collect shipping costs for estimation
      const shippingStr = item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__;
      if (shippingStr) {
        const shippingVal = parseFloat(shippingStr);
        if (shippingVal > 0) {
          shippingCosts.push(shippingVal);
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
