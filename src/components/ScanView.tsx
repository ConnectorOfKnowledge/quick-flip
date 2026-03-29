import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import type { Scan, Settings } from '../lib/supabase';
import { saveScan } from '../lib/supabase';
import { calculateProfit } from '../lib/fees';
import { addToQueue, getQueue, isOnline } from '../lib/offline';
import Button from './ui/Button';
import Input from './ui/Input';
import Card from './ui/Card';
import Spinner from './ui/Spinner';
import ResultCard from './ResultCard';

interface ScanViewProps {
  settings: Settings;
  queueCount: number;
  onQueueChange: () => void;
}

export default function ScanView({ settings, queueCount, onQueueChange }: ScanViewProps) {
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Scan | null>(null);
  const [saved, setSaved] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'barcode' | 'photo'>('barcode');
  const [processingQueue, setProcessingQueue] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function startCamera(mode: 'barcode' | 'photo') {
    setCameraMode(mode);
    setShowCamera(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      if (mode === 'barcode') {
        startBarcodeDetection(stream);
      }
    } catch {
      setError('Could not access camera. Please check permissions.');
      stopCamera();
    }
  }

  async function startBarcodeDetection(stream: MediaStream) {
    if (!('BarcodeDetector' in window)) {
      setError('Barcode scanning not supported on this device. Use text search instead.');
      stopCamera();
      return;
    }

    const detector = new (window as any).BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
    });

    const video = videoRef.current;
    if (!video) return;

    const scanInterval = setInterval(async () => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          clearInterval(scanInterval);
          stopCamera();
          handleBarcodeScan(barcodes[0].rawValue);
        }
      } catch {
        // detection frame failed, continue scanning
      }
    }, 250);

    // Clean up when stream ends
    stream.getTracks()[0].addEventListener('ended', () => clearInterval(scanInterval));
  }

  async function handleBarcodeScan(barcode: string) {
    if (!isOnline()) {
      await addToQueue({ type: 'barcode', data: barcode });
      onQueueChange();
      setError(null);
      return;
    }
    await performSearch(barcode, 'barcode');
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError('Camera not ready yet. Wait a moment and try again.');
      return;
    }

    // Resize to max 1024px on longest side -- saves bandwidth and stays within API limits
    const maxDim = 1024;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    stopCamera();

    if (!isOnline()) {
      await addToQueue({ type: 'photo', data: dataUrl });
      onQueueChange();
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);

    try {
      const res = await fetch('/api/photo-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(errData.error || `Photo ID failed (${res.status})`);
      }
      const data = await res.json();
      if (!data.product_name) {
        throw new Error('Could not identify product. Try a clearer photo or text search.');
      }
      await performSearch(data.product_name, 'photo');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo identification failed. Try text search instead.');
    } finally {
      setLoading(false);
    }
  }

  async function handleTextSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchText.trim()) return;

    if (!isOnline()) {
      await addToQueue({ type: 'text', data: searchText.trim() });
      onQueueChange();
      setSearchText('');
      return;
    }
    await performSearch(searchText.trim(), 'text');
  }

  async function performSearch(query: string, inputType: 'barcode' | 'photo' | 'text') {
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);

    try {
      const res = await fetch('/api/ebay-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: inputType }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Search failed');
      }
      const scan: Scan = await res.json();
      setResult(scan);
      setSearchText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(scan: Scan, purchasePrice: number) {
    const breakdown = calculateProfit(scan.avg_sold_price ?? 0, purchasePrice, settings);
    await saveScan({
      input_type: scan.input_type,
      query_text: scan.query_text,
      barcode: scan.barcode,
      photo_url: scan.photo_url,
      product_name: scan.product_name,
      product_details: scan.product_details,
      avg_sold_price: scan.avg_sold_price,
      low_price: scan.low_price,
      high_price: scan.high_price,
      num_comps: scan.num_comps,
      comps: scan.comps,
      purchase_price: purchasePrice,
      estimated_shipping: settings.default_shipping_estimate,
      ebay_fees: breakdown.totalFees,
      packaging_cost: breakdown.packagingCost,
      net_profit: breakdown.netProfit,
      status: 'complete',
      error_message: null,
      notes: null,
    });
    setSaved(true);
  }

  async function processQueue() {
    setProcessingQueue(true);
    try {
      const queue = await getQueue();
      for (const item of queue) {
        if (item.status === 'complete') continue;
        try {
          if (item.type === 'photo') {
            const photoRes = await fetch('/api/photo-id', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: item.data }),
            });
            if (!photoRes.ok) throw new Error('Photo ID failed');
            const photoData = await photoRes.json();
            await performSearch(photoData.product_name, 'photo');
          } else {
            await performSearch(item.data, item.type);
          }
        } catch {
          // individual item failed, continue with rest
        }
      }
      onQueueChange();
    } finally {
      setProcessingQueue(false);
    }
  }

  // Camera overlay
  if (showCamera) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="relative flex-1">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="viewfinder-overlay absolute inset-0 pointer-events-none" />
          {cameraMode === 'barcode' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-32 border-2 border-white/60 rounded-lg" />
            </div>
          )}
        </div>
        <div className="bg-black/80 p-4 flex gap-3">
          <Button variant="ghost" onClick={stopCamera} className="flex-1 text-white">
            Cancel
          </Button>
          {cameraMode === 'photo' && (
            <Button onClick={capturePhoto} className="flex-1">
              Take Photo
            </Button>
          )}
        </div>
        {cameraMode === 'barcode' && (
          <p className="text-white/70 text-sm text-center pb-4 px-4">
            Point at barcode. Detection is automatic.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Input methods */}
      <Card>
        <div className="flex gap-2 mb-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => startCamera('barcode')}
            className="flex-1"
          >
            <svg className="w-5 h-5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h3v16H3V4zm5 0h1v16H8V4zm3 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h3v16h-3V4z" />
            </svg>
            Barcode
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => startCamera('photo')}
            className="flex-1"
          >
            <svg className="w-5 h-5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Photo
          </Button>
        </div>

        <form onSubmit={handleTextSearch} className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search by name, model, etc."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!searchText.trim() || loading} size="default">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </Button>
        </form>
      </Card>

      {/* Queue button */}
      {queueCount > 0 && isOnline() && (
        <Button
          variant="secondary"
          onClick={processQueue}
          disabled={processingQueue}
          className="w-full"
        >
          {processingQueue ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Processing Queue...
            </>
          ) : (
            <>
              Process Queue ({queueCount} item{queueCount !== 1 ? 's' : ''})
            </>
          )}
        </Button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-qf-text-muted">Searching sold listings...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-qf-danger/30 bg-qf-danger/5">
          <p className="text-sm text-qf-danger">{error}</p>
        </Card>
      )}

      {/* Result */}
      {result && !loading && (
        <>
          <ResultCard
            scan={result}
            settings={settings}
            onSave={handleSave}
            showSaveButton={!saved}
          />
          {saved && (
            <p className="text-center text-sm text-qf-accent font-medium">
              Saved to history
            </p>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-12 px-4">
          <p className="text-qf-text-muted text-sm">
            Scan a barcode, snap a photo, or search by name to check resale value.
          </p>
        </div>
      )}
    </div>
  );
}
