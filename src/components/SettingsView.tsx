import { useState, useEffect } from 'react';
import type { Settings } from '../lib/supabase';
import { updateSetting } from '../lib/supabase';
import Button from './ui/Button';
import Card from './ui/Card';
import Spinner from './ui/Spinner';

interface SettingsViewProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

interface FieldConfig {
  key: keyof Settings;
  label: string;
  suffix: string;
  step: string;
  defaultVal: number;
}

const FIELDS: FieldConfig[] = [
  { key: 'ebay_final_value_fee', label: 'eBay Final Value Fee', suffix: '%', step: '0.01', defaultVal: 0.1325 },
  { key: 'payment_processing_fee', label: 'Payment Processing Fee', suffix: '%', step: '0.01', defaultVal: 0.0299 },
  { key: 'payment_fixed_fee', label: 'Payment Fixed Fee', suffix: '$', step: '0.01', defaultVal: 0.49 },
  { key: 'default_packaging_cost', label: 'Default Packaging Cost', suffix: '$', step: '0.50', defaultVal: 2.0 },
  { key: 'default_shipping_estimate', label: 'Default Shipping Estimate', suffix: '$', step: '0.50', defaultVal: 8.0 },
];

const DEFAULTS: Settings = {
  ebay_final_value_fee: 0.1325,
  payment_processing_fee: 0.0299,
  payment_fixed_fee: 0.49,
  default_packaging_cost: 2.0,
  default_shipping_estimate: 8.0,
};

export default function SettingsView({ settings, onSettingsChange }: SettingsViewProps) {
  const [local, setLocal] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  function handleChange(key: keyof Settings, rawValue: string) {
    const val = parseFloat(rawValue);
    if (isNaN(val)) return;
    setLocal((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  function displayValue(key: keyof Settings, val: number): string {
    const field = FIELDS.find((f) => f.key === key);
    if (field?.suffix === '%') return (val * 100).toFixed(2);
    return val.toFixed(2);
  }

  function parseInput(key: keyof Settings, raw: string): number {
    const field = FIELDS.find((f) => f.key === key);
    const val = parseFloat(raw);
    if (isNaN(val)) return local[key];
    if (field?.suffix === '%') return val / 100;
    return val;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const field of FIELDS) {
        await updateSetting(field.key, local[field.key]);
      }
      onSettingsChange(local);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setLocal(DEFAULTS);
    setSaving(true);
    setError(null);
    try {
      for (const field of FIELDS) {
        await updateSetting(field.key, DEFAULTS[field.key]);
      }
      onSettingsChange(DEFAULTS);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-qf-text">Settings</h2>

      <Card className="space-y-5">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={field.key}
              className="text-sm text-qf-text-muted font-medium block mb-1"
            >
              {field.label}
            </label>
            <div className="relative">
              {field.suffix === '$' && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-qf-text-muted text-sm">$</span>
              )}
              <input
                id={field.key}
                type="number"
                inputMode="decimal"
                step={field.step}
                min="0"
                value={displayValue(field.key, local[field.key])}
                onChange={(e) => handleChange(field.key, String(parseInput(field.key, e.target.value)))}
                className={`w-full py-3 rounded-lg border border-qf-border bg-qf-surface text-qf-text font-mono focus:outline-none focus:ring-2 focus:ring-qf-primary/30 focus:border-qf-primary min-h-[44px] ${field.suffix === '$' ? 'pl-8 pr-3' : 'px-3'}`}
              />
              {field.suffix === '%' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-qf-text-muted text-sm">%</span>
              )}
            </div>
          </div>
        ))}
      </Card>

      {error && (
        <Card className="border-qf-danger/30 bg-qf-danger/5">
          <p className="text-sm text-qf-danger">{error}</p>
        </Card>
      )}

      {saved && !error && (
        <p className="text-center text-sm text-qf-accent font-medium">Settings saved</p>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? <Spinner size="sm" /> : 'Save Settings'}
        </Button>
        <Button variant="secondary" onClick={handleReset} disabled={saving}>
          Reset
        </Button>
      </div>
    </div>
  );
}
