import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Scan {
  id: string;
  created_at: string;
  input_type: 'barcode' | 'photo' | 'text';
  query_text: string | null;
  barcode: string | null;
  photo_url: string | null;
  product_name: string | null;
  product_details: Record<string, unknown>;
  avg_sold_price: number | null;
  low_price: number | null;
  high_price: number | null;
  num_comps: number;
  comps: SoldComp[];
  purchase_price: number | null;
  estimated_shipping: number | null;
  ebay_fees: number | null;
  packaging_cost: number | null;
  net_profit: number | null;
  status: 'queued' | 'processing' | 'complete' | 'error';
  error_message: string | null;
  notes: string | null;
}

export interface SoldComp {
  title: string;
  price: number;
  date: string;
  condition: string;
  url: string;
  image_url?: string;
}

export interface Settings {
  ebay_final_value_fee: number;
  payment_processing_fee: number;
  payment_fixed_fee: number;
  default_packaging_cost: number;
  default_shipping_estimate: number;
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value');

  if (error) throw error;

  const settings: Record<string, number> = {};
  for (const row of data ?? []) {
    settings[row.key] = parseFloat(String(row.value));
  }

  return {
    ebay_final_value_fee: settings.ebay_final_value_fee ?? 0.1325,
    payment_processing_fee: settings.payment_processing_fee ?? 0.0299,
    payment_fixed_fee: settings.payment_fixed_fee ?? 0.49,
    default_packaging_cost: settings.default_packaging_cost ?? 2.0,
    default_shipping_estimate: settings.default_shipping_estimate ?? 8.0,
  };
}

export async function updateSetting(key: string, value: number): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw error;
}

export async function saveScan(scan: Omit<Scan, 'id' | 'created_at'>): Promise<Scan> {
  const { data, error } = await supabase
    .from('scans')
    .insert(scan)
    .select()
    .single();

  if (error) throw error;
  return data as Scan;
}

export async function getScans(limit = 50, offset = 0): Promise<Scan[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as Scan[];
}

export async function deleteScan(id: string): Promise<void> {
  const { error } = await supabase.from('scans').delete().eq('id', id);
  if (error) throw error;
}
