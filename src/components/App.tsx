import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../lib/supabase';
import { getSettings } from '../lib/supabase';
import { getQueue, isOnline } from '../lib/offline';
import ScanView from './ScanView';
import HistoryView from './HistoryView';
import SettingsView from './SettingsView';
import Badge from './ui/Badge';
import Spinner from './ui/Spinner';

type View = 'scan' | 'history' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('scan');
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsError, setSettingsError] = useState(false);

  // Load settings on mount
  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {
        setSettingsError(true);
        // Use defaults if Supabase is unreachable
        setSettings({
          ebay_final_value_fee: 0.1325,
          payment_processing_fee: 0.0299,
          payment_fixed_fee: 0.49,
          default_packaging_cost: 2.0,
          default_shipping_estimate: 8.0,
        });
      });
  }, []);

  // Track online status
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Track queue count
  const refreshQueueCount = useCallback(async () => {
    const queue = await getQueue();
    setQueueCount(queue.filter((i) => i.status !== 'complete').length);
  }, []);

  useEffect(() => {
    refreshQueueCount();
  }, [refreshQueueCount]);

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Offline banner */}
      {!online && (
        <div className="bg-qf-warn/15 border-b border-qf-warn/30 px-4 py-2 text-center">
          <p className="text-sm font-medium text-qf-warn">
            You're offline. Items will be queued for later.
          </p>
        </div>
      )}

      {/* Settings error banner */}
      {settingsError && (
        <div className="bg-qf-danger/10 border-b border-qf-danger/20 px-4 py-2 text-center">
          <p className="text-xs text-qf-danger">Using default settings (couldn't reach server)</p>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 px-4 pt-4 pb-24 max-w-lg mx-auto w-full">
        {view === 'scan' && (
          <ScanView
            settings={settings}
            queueCount={queueCount}
            onQueueChange={refreshQueueCount}
          />
        )}
        {view === 'history' && <HistoryView settings={settings} />}
        {view === 'settings' && (
          <SettingsView settings={settings} onSettingsChange={setSettings} />
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-qf-surface border-t border-qf-border">
        <div className="flex max-w-lg mx-auto">
          <NavTab
            active={view === 'scan'}
            onClick={() => setView('scan')}
            label="Scan"
            badge={queueCount > 0 ? queueCount : undefined}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 4V2m0 2a2 2 0 00-2 2v1a2 2 0 002 2h0a2 2 0 002-2V6a2 2 0 00-2-2zm0 10v2m0-2a2 2 0 012 2v1a2 2 0 01-2 2h0a2 2 0 01-2-2v-1a2 2 0 012-2zm10-10V2m0 2a2 2 0 00-2 2v1a2 2 0 002 2h0a2 2 0 002-2V6a2 2 0 00-2-2zm0 10v2m0-2a2 2 0 012 2v1a2 2 0 01-2 2h0a2 2 0 01-2-2v-1a2 2 0 012-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18" />
              </svg>
            }
          />
          <NavTab
            active={view === 'history'}
            onClick={() => setView('history')}
            label="History"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <NavTab
            active={view === 'settings'}
            onClick={() => setView('settings')}
            label="Settings"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
        </div>
      </nav>
    </div>
  );
}

interface NavTabProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

function NavTab({ active, onClick, label, icon, badge }: NavTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] relative
        transition-colors duration-150 cursor-pointer
        ${active ? 'text-qf-primary' : 'text-qf-text-muted'}
      `}
    >
      <div className="relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-2">
            <Badge variant="danger">{badge}</Badge>
          </span>
        )}
      </div>
      <span className="text-xs font-medium mt-1">{label}</span>
    </button>
  );
}
