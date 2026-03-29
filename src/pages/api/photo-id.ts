export const prerender = false;

import type { APIRoute } from 'astro';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: { message: string };
}

interface ProductIdentification {
  product_name: string;
  brand: string;
  model: string;
  condition_notes: string;
}

export const POST: APIRoute = async ({ request }) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': new URL(request.url).origin,
  };

  try {
    const body = await request.json();
    const { image } = body as { image?: string };

    if (!image || typeof image !== 'string' || image.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or empty image parameter (base64 encoded)' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = import.meta.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    // Detect mime type from data URL or default to jpeg
    let mimeType = 'image/jpeg';
    if (image.startsWith('data:')) {
      const match = image.match(/^data:(image\/\w+);/);
      if (match) mimeType = match[1];
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Identify this product for eBay resale. Return ONLY a JSON object with: product_name (string - the most searchable product name for eBay), brand (string), model (string), condition_notes (string - any visible condition issues). Be specific with model numbers.',
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API failed (${geminiResponse.status}): ${errorText}`);
    }

    const data: GeminiResponse = await geminiResponse.json();

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }

    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      throw new Error('Gemini returned no content');
    }

    // Parse JSON from Gemini response -- it may be wrapped in markdown code fences
    let jsonString = textContent.trim();
    const fenceMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonString = fenceMatch[1].trim();
    }

    let product: ProductIdentification;
    try {
      product = JSON.parse(jsonString);
    } catch {
      throw new Error(`Failed to parse Gemini response as JSON: ${textContent.slice(0, 200)}`);
    }

    return new Response(
      JSON.stringify({
        product_name: product.product_name ?? '',
        brand: product.brand ?? '',
        model: product.model ?? '',
        condition_notes: product.condition_notes ?? '',
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
