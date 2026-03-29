export const prerender = false;

import type { APIRoute } from 'astro';

interface QueueItem {
  type: 'photo' | 'barcode' | 'text';
  data: string;
}

interface ResultItem {
  input_index: number;
  product_name: string;
  comps_summary: {
    avg_sold_price: number;
    low_price: number;
    high_price: number;
    num_comps: number;
  } | null;
  error?: string;
}

export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
  };

  try {
    const body = await request.json();
    const { items } = body as { items?: QueueItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or empty items array' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.type || !['photo', 'barcode', 'text'].includes(item.type)) {
        return new Response(
          JSON.stringify({ error: `Item ${i}: invalid type (must be photo, barcode, or text)` }),
          { status: 400, headers: corsHeaders }
        );
      }
      if (!item.data || typeof item.data !== 'string' || item.data.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: `Item ${i}: missing or empty data` }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    const results: ResultItem[] = [];

    // Process items sequentially to avoid rate limiting
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        let searchQuery: string;

        if (item.type === 'photo') {
          // First identify the product via photo-id
          const photoResponse = await fetch(`${origin}/api/photo-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: item.data }),
          });

          if (!photoResponse.ok) {
            const err = await photoResponse.json();
            throw new Error(err.error || `Photo ID failed (${photoResponse.status})`);
          }

          const photoResult = await photoResponse.json();
          searchQuery = photoResult.product_name;

          if (!searchQuery) {
            throw new Error('Could not identify product from photo');
          }
        } else {
          // barcode or text -- use data directly as search query
          searchQuery = item.data.trim();
        }

        // Search eBay for comps
        const searchResponse = await fetch(`${origin}/api/ebay-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            ...(item.type === 'barcode' ? { barcode: item.data.trim() } : {}),
          }),
        });

        if (!searchResponse.ok) {
          const err = await searchResponse.json();
          throw new Error(err.error || `eBay search failed (${searchResponse.status})`);
        }

        const searchResult = await searchResponse.json();

        results.push({
          input_index: i,
          product_name: searchResult.product_name ?? searchQuery,
          comps_summary: {
            avg_sold_price: searchResult.avg_sold_price,
            low_price: searchResult.low_price,
            high_price: searchResult.high_price,
            num_comps: searchResult.num_comps,
          },
        });
      } catch (err) {
        results.push({
          input_index: i,
          product_name: item.type === 'photo' ? '(unidentified)' : item.data.trim(),
          comps_summary: null,
          error: err instanceof Error ? err.message : 'Processing failed',
        });
      }
    }

    return new Response(
      JSON.stringify({ results }),
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
