import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { OilLog, FuelLog, ServiceLog, AppSettings, SyncStatus } from './types';
import { getSupabaseClient, syncWithSupabase } from './lib/supabaseClient';
import { initIndexedDB, getDBItem, setDBItem, removeDBItem } from './lib/dbStorage';
import { checkAndSendOilAlert } from './utils/telegram';
import { exportToCSV, exportToPDF } from './utils/export';
import { generateUUID } from './utils/uuid';
import { useToast } from './components/ToastContainer';
import Dashboard from './components/Dashboard';
import OilLogs from './components/OilLogs';
import FuelLogs from './components/FuelLogs';
import ServiceLogs from './components/ServiceLogs';
import SettingsTab from './components/SettingsTab';
import {
  Gauge, Droplets, Fuel, Wrench, Settings, Cloud, CloudOff, FileSpreadsheet, FileText, RefreshCw,
  Sun, Moon
} from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = {
  oilChangeIntervalKm: 2000,
  oilChangeIntervalDays: 90,
  fuelPricePerLiter: 10,
  telegram: {
    botToken: '',
    chatId: '',
    enabled: false,
    notifyOnDaysBefore: 7,
    notifyOnKmBefore: 200,
  },
  supabase: {
    url: 'https://pcoyvfhcniscynjkndlw.supabase.co',
    anonKey: 'sb_publishable_4HYaHZhOIECG56Eccpe4sA_xj-Ecy9n',
    connected: true,
  },
  theme: 'light'
};

export default function App() {
  const { showToast, showConfirm } = useToast();

  // 1. State Inti (Core States)
  // Menyimpan data riwayat oli, BBM, servis, pengaturan, status user, dan state UI
  const [oilLogs, setOilLogs] = useState<OilLog[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [serviceLogs, setServiceLogs] = useState<ServiceLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null);

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [darkMode, setDarkMode] = useState(false);

  // Status sinkronisasi ke cloud database (Supabase)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncedAt: null,
    pendingSyncCount: 0,
    isSyncing: false,
  });

  // ── Sync Infrastructure: refs prevent stale closures & enable debounced background sync ──
  const oilLogsRef = useRef(oilLogs);
  const fuelLogsRef = useRef(fuelLogs);
  const serviceLogsRef = useRef(serviceLogs);
  const settingsRef = useRef(settings);
  const userRef = useRef(user);
  const isOnlineRef = useRef(isOnline);
  const syncLockRef = useRef(false);
  const pendingSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SYNC_COOLDOWN_MS = 2000; // minimum ms between sync cycles

  const tabsList = [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge },
    { id: 'fuel', label: 'BBM', icon: Fuel },
    { id: 'oil', label: 'Oli', icon: Droplets },
    { id: 'service', label: 'Servis', icon: Wrench },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  // 2. Inisialisasi Data pada saat komponen dimuat (Mount)
  // Memuat pengaturan dan log yang tersimpan di IndexedDB (Offline-First)
  useEffect(() => {
    async function loadInitialData() {
      await initIndexedDB();

      // A. Memuat pengaturan lokal
      const cachedSettings = await getDBItem<AppSettings | null>('oil_tracker_settings', null);
      let loadedSettings = DEFAULT_SETTINGS;
      if (cachedSettings) {
        loadedSettings = { ...DEFAULT_SETTINGS, ...cachedSettings };
        setSettings(loadedSettings);
      }

      // B. Memuat Riwayat Oli, BBM, dan Servis
      const cachedOil = await getDBItem<OilLog[]>('oil_tracker_oil_logs', []);
      setOilLogs(cachedOil);

      const cachedFuel = await getDBItem<FuelLog[]>('oil_tracker_fuel_logs', []);
      setFuelLogs(cachedFuel);

      const cachedService = await getDBItem<ServiceLog[]>('oil_tracker_service_logs', []);
      setServiceLogs(cachedService);

      // Check oil status for toast notification
      if (cachedOil.length > 0) {
        const lastOil = cachedOil[0];
        const maxOilMileage = Math.max(...cachedOil.map(l => l.mileage));
        const maxFuelMileage = cachedFuel.length > 0 ? Math.max(...cachedFuel.map(l => l.mileage)) : 0;
        const currentMileage = Math.max(maxOilMileage, maxFuelMileage);

        const elapsedKm = currentMileage - lastOil.mileage;
        const remainingKm = Math.max(0, loadedSettings.oilChangeIntervalKm - elapsedKm);

        const lastDate = new Date(lastOil.date);
        const today = new Date();
        const elapsedMs = today.getTime() - lastDate.getTime();
        const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
        const remainingDays = Math.max(0, loadedSettings.oilChangeIntervalDays - elapsedDays);

        if (remainingKm <= loadedSettings.telegram.notifyOnKmBefore || remainingDays <= loadedSettings.telegram.notifyOnDaysBefore) {
          setTimeout(() => {
            const isOverdue = remainingKm <= 0 || remainingDays <= 0;
            if (isOverdue) {
              showToast('Batas ganti oli sudah terlampaui! Segera ganti oli motor Anda.', 'error', 'Peringatan Oli');
            } else {
              showToast(`Jadwal ganti oli sudah dekat! Tersisa ${remainingKm.toLocaleString('id-ID')} km / ${remainingDays} hari.`, 'warning', 'Peringatan Oli');
            }
          }, 500);
        }
      }

      // C. Konfigurasi Tema (Terang/Gelap)
      const themeVal = await getDBItem<string>('oil_tracker_theme', 'light');
      const isDark = loadedSettings.theme === 'dark' || themeVal === 'dark';
      setDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // D. Mengecek sesi pengguna di Supabase jika sudah login
      const client = getSupabaseClient();
      if (client) {
        const { data: { user: sbUser } } = await client.auth.getUser();
        if (sbUser) {
          setUser(sbUser);
        } else {
          // Auto-login using saved credentials if available
          const savedEmail = await getDBItem<string>('supabase_email', '');
          const savedPassword = await getDBItem<string>('supabase_password', '');

          if (savedEmail && savedPassword) {
            try {
              const { data: { user: signInUser }, error } = await client.auth.signInWithPassword({
                email: savedEmail,
                password: savedPassword,
              });
              if (signInUser && !error) {
                setUser(signInUser);
              } else {
                console.warn('Auto-login gagal:', error?.message);
              }
            } catch (err) {
              console.error('Auto-login exception:', err);
            }
          }
        }
      }
    }

    loadInitialData();

    const client = getSupabaseClient();
    if (client) {
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  // Keep refs in sync with state (used by sync to avoid stale closures)
  useEffect(() => { oilLogsRef.current = oilLogs; }, [oilLogs]);
  useEffect(() => { fuelLogsRef.current = fuelLogs; }, [fuelLogs]);
  useEffect(() => { serviceLogsRef.current = serviceLogs; }, [serviceLogs]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // Update pending sync count whenever logs change or deletions are queued
  useEffect(() => {
    getDBItem<string[]>('deleted_log_ids', []).then(deletedIds => {
      setSyncStatus(prev => ({
        ...prev,
        pendingSyncCount: Array.isArray(deletedIds) ? deletedIds.length : 0
      }));
    });
  }, [oilLogs, fuelLogs]);

  // 3. Listener Status Jaringan (Online/Offline)
  // Membantu untuk menunda atau mengaktifkan sinkronisasi Supabase secara otomatis
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 4. Pengecekan Peringatan Telegram
  // Akan diperiksa secara periodik atau setelah pembaruan log untuk mengirimkan notifikasi
  useEffect(() => {
    if (settings.telegram.enabled && oilLogs.length > 0) {
      const maxOilMileage = Math.max(...oilLogs.map(l => l.mileage));
      const maxFuelMileage = fuelLogs.length > 0 ? Math.max(...fuelLogs.map(l => l.mileage)) : 0;
      const currentMileage = Math.max(maxOilMileage, maxFuelMileage);

      const lastOil = oilLogs[0]; // sorted descending

      checkAndSendOilAlert(
        currentMileage,
        lastOil ? { date: lastOil.date, mileage: lastOil.mileage } : null,
        settings.telegram,
        settings.oilChangeIntervalKm,
        settings.oilChangeIntervalDays
      ).then((res) => {
        if (res.triggered) {
          console.log('Telegram Alert dispatched!', res.message);
          // Set lastNotifiedDate to prevent duplication today
          const todayStr = new Date().toISOString().split('T')[0];
          const updated = {
            ...settings,
            telegram: {
              ...settings.telegram,
              lastNotifiedDate: todayStr
            }
          };
          setSettings(updated);
          setDBItem('oil_tracker_settings', updated);
        }
      });
    }
  }, [oilLogs, fuelLogs, settings.telegram.enabled]);

  // 5. Global Actions
  const handleUpdateSettings = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await setDBItem('oil_tracker_settings', newSettings);

    // Also save credentials directly for client initialization helper
    if (newSettings.supabase.url && newSettings.supabase.anonKey) {
      await setDBItem('supabase_url', newSettings.supabase.url);
      await setDBItem('supabase_anon_key', newSettings.supabase.anonKey);
    }

    // Schedule a background sync after settings change
    scheduleBackgroundSync();
  }, []);

  const handleToggleDarkMode = useCallback(async () => {
    setDarkMode(prev => {
      const nextDark = !prev;
      if (nextDark) {
        document.documentElement.classList.add('dark');
        setDBItem('oil_tracker_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        setDBItem('oil_tracker_theme', 'light');
      }
      return nextDark;
    });
  }, []);

  // ── Core Sync Engine (uses refs so it never reads stale state) ──
  const runSync = useCallback(async (isInteractive: boolean = false) => {
    // Guard: prevent concurrent syncs
    if (syncLockRef.current) {
      if (isInteractive) {
        showToast('Sinkronisasi sedang berjalan, harap tunggu.', 'info', 'Sinkron Aktif');
      }
      return;
    }
    // Guard: must be online
    if (!isOnlineRef.current) {
      if (isInteractive) {
        showToast('Tidak ada koneksi internet. Sinkronisasi ditunda.', 'warning', 'Koneksi Terputus');
      }
      return;
    }
    // Guard: must have Supabase connected and user logged in
    if (!settingsRef.current.supabase.connected || !userRef.current) {
      return;
    }

    // Check cooldown to prevent rapid-fire syncs
    const now = Date.now();
    if (!isInteractive && now - (syncRefLastSyncTime) < SYNC_COOLDOWN_MS) {
      return; // within cooldown window, skip
    }

    syncLockRef.current = true;
    setSyncStatus(prev => ({ ...prev, isSyncing: true }));

    try {
      const result = await syncWithSupabase(
        oilLogsRef.current,
        fuelLogsRef.current,
        undefined,
        serviceLogsRef.current
      );

      if (result.success) {
        setOilLogs(result.syncedOilLogs);
        setFuelLogs(result.syncedFuelLogs);
        if (result.syncedServiceLogs) {
          setServiceLogs(result.syncedServiceLogs);
          await setDBItem('oil_tracker_service_logs', result.syncedServiceLogs);
        }
        if (result.syncedJarakRecords) {
          await setDBItem('oil_tracker_jarak', result.syncedJarakRecords);
        }

        await setDBItem('oil_tracker_oil_logs', result.syncedOilLogs);
        await setDBItem('oil_tracker_fuel_logs', result.syncedFuelLogs);

        setSyncStatus({
          lastSyncedAt: new Date().toISOString(),
          pendingSyncCount: 0,
          isSyncing: false
        });

        syncRefLastSyncTime = Date.now();

        if (isInteractive) {
          showToast('Sinkronisasi data cloud berhasil!', 'success', 'Sinkron Selesai');
        }
      } else {
        setSyncStatus(prev => ({ ...prev, isSyncing: false }));
        if (isInteractive) {
          showToast(result.message, 'error', 'Gagal Sinkron');
        }
      }
    } catch (e: any) {
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
      if (isInteractive) {
        showToast(`Gagal sinkronisasi: ${e.message || e}`, 'error', 'Gagal Sinkron');
      }
    } finally {
      syncLockRef.current = false;
    }
  }, [showToast]);

  // Track last sync time outside of React state for lightweight cooldown check
  let syncRefLastSyncTime = 0;

  // ── Debounced Background Sync ──
  // Schedules a sync after SYNC_COOLDOWN_MS. Each new call resets the timer,
  // so rapid add/edit/delete operations collapse into a single sync cycle.
  const scheduleBackgroundSync = useCallback(() => {
    if (pendingSyncTimerRef.current) {
      clearTimeout(pendingSyncTimerRef.current);
    }
    pendingSyncTimerRef.current = setTimeout(() => {
      pendingSyncTimerRef.current = null;
      runSync(false);
    }, SYNC_COOLDOWN_MS);
  }, [runSync]);

  // Public sync trigger — used by manual "Sinkron Sekarang" button
  const handleTriggerSync = useCallback(async (
    _customOilLogs?: OilLog[],
    _customFuelLogs?: FuelLog[],
    _customServiceLogs?: ServiceLog[],
    isInteractive: boolean = false
  ) => {
    await runSync(isInteractive);
  }, [runSync]);

  // Cleanup pending sync timer on unmount
  useEffect(() => {
    return () => {
      if (pendingSyncTimerRef.current) {
        clearTimeout(pendingSyncTimerRef.current);
      }
    };
  }, []);

  const handleLogout = async () => {
    showConfirm({
      title: 'Keluar dari Cloud',
      message: 'Apakah Anda yakin ingin keluar dari akun cloud Supabase?',
      confirmText: 'Ya, Keluar',
      cancelText: 'Batal',
      type: 'warning',
      onConfirm: async () => {
        const client = getSupabaseClient();
        if (client) {
          await client.auth.signOut();
          setUser(null);
          // Clean supabase keys from settings on logout to ensure safety
          const clearedSettings = {
            ...settings,
            supabase: { url: '', anonKey: '', connected: false }
          };
          setSettings(clearedSettings);
          await removeDBItem('supabase_url');
          await removeDBItem('supabase_anon_key');
          await setDBItem('oil_tracker_settings', clearedSettings);
          showToast('Anda telah keluar dari akun cloud.', 'info', 'Logout');
        }
      }
    });
  };

  // ── Log Handlers (fire-and-forget background sync via debounce) ──
  const handleAddOilLog = async (logData: Omit<OilLog, 'id'>) => {
    const newLog: OilLog = {
      ...logData,
      id: generateUUID(),
      user_id: userRef.current?.id,
      updated_at: new Date().toISOString()
    };
    const updated = [newLog, ...oilLogsRef.current];
    setOilLogs(updated);
    await setDBItem('oil_tracker_oil_logs', updated);
    scheduleBackgroundSync();
  };

  const handleEditOilLog = async (id: string, updatedData: Partial<OilLog>) => {
    const updated = oilLogsRef.current.map(log => {
      if (log.id === id) {
        return { ...log, ...updatedData, updated_at: new Date().toISOString() };
      }
      return log;
    });
    setOilLogs(updated);
    await setDBItem('oil_tracker_oil_logs', updated);
    scheduleBackgroundSync();
  };

  const handleDeleteOilLog = async (id: string) => {
    const updated = oilLogsRef.current.filter(log => log.id !== id);
    setOilLogs(updated);
    await setDBItem('oil_tracker_oil_logs', updated);
    const deletedIds: string[] = await getDBItem<string[]>('deleted_log_ids', []);
    deletedIds.push(id);
    await setDBItem('deleted_log_ids', deletedIds);
    scheduleBackgroundSync();
  };

  const handleAddFuelLog = async (logData: Omit<FuelLog, 'id'>) => {
    const newLog: FuelLog = {
      ...logData,
      id: generateUUID(),
      user_id: userRef.current?.id,
      updated_at: new Date().toISOString()
    };
    const updated = [newLog, ...fuelLogsRef.current];
    setFuelLogs(updated);
    await setDBItem('oil_tracker_fuel_logs', updated);
    scheduleBackgroundSync();
  };

  const handleEditFuelLog = async (id: string, updatedData: Partial<FuelLog>) => {
    const updated = fuelLogsRef.current.map(log => {
      if (log.id === id) {
        return { ...log, ...updatedData, updated_at: new Date().toISOString() };
      }
      return log;
    });
    setFuelLogs(updated);
    await setDBItem('oil_tracker_fuel_logs', updated);
    scheduleBackgroundSync();
  };

  const handleDeleteFuelLog = async (id: string) => {
    const updated = fuelLogsRef.current.filter(log => log.id !== id);
    setFuelLogs(updated);
    await setDBItem('oil_tracker_fuel_logs', updated);
    const deletedIds: string[] = await getDBItem<string[]>('deleted_log_ids', []);
    deletedIds.push(id);
    await setDBItem('deleted_log_ids', deletedIds);
    scheduleBackgroundSync();
  };

  const handleAddServiceLog = async (logData: Omit<ServiceLog, 'id'>) => {
    const newLog: ServiceLog = {
      ...logData,
      id: generateUUID(),
      user_id: userRef.current?.id,
      updated_at: new Date().toISOString()
    };
    const updated = [newLog, ...serviceLogsRef.current];
    setServiceLogs(updated);
    await setDBItem('oil_tracker_service_logs', updated);
    scheduleBackgroundSync();
  };

  const handleEditServiceLog = async (id: string, updatedData: Partial<ServiceLog>) => {
    const updated = serviceLogsRef.current.map(log => {
      if (log.id === id) {
        return { ...log, ...updatedData, updated_at: new Date().toISOString() };
      }
      return log;
    });
    setServiceLogs(updated);
    await setDBItem('oil_tracker_service_logs', updated);
    scheduleBackgroundSync();
  };

  const handleDeleteServiceLog = async (id: string) => {
    const updated = serviceLogsRef.current.filter(log => log.id !== id);
    setServiceLogs(updated);
    await setDBItem('oil_tracker_service_logs', updated);
    const deletedIds: string[] = await getDBItem<string[]>('deleted_log_ids', []);
    deletedIds.push(id);
    await setDBItem('deleted_log_ids', deletedIds);
    scheduleBackgroundSync();
  };

  // ── Auto-sync when coming online, user logs in, or Supabase connects ──
  useEffect(() => {
    if (isOnlineRef.current && userRef.current && settingsRef.current.supabase.connected) {
      // Small delay to let state settle after login/reconnect
      const t = setTimeout(() => runSync(false), 500);
      return () => clearTimeout(t);
    }
  }, [isOnline, user, settings.supabase.connected, runSync]);

  return (
    <div className="h-[100dvh] bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col md:flex-row overflow-hidden">

      {/* 1. Desktop Sidebar (md and larger) */}
      <aside className="hidden md:flex w-64 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col shrink-0 h-screen sticky top-0 justify-between select-none">
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Logo & Header */}
          <div className="p-6 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-none font-display">
                  Motor.ku
                </h1>
                <span className="text-[12px] text-slate-400 dark:text-slate-500 font-medium tracking-wide">Oil & Fuel Tracker</span>
              </div>
            </div>
            <button
              onClick={handleToggleDarkMode}
              className="p-2 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl cursor-pointer transition-all border border-slate-150 dark:border-slate-800 shadow-xs"
              title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Nav Tabs */}
          <nav className="p-4 space-y-1 flex-1">
            {tabsList.map((tab) => {
              const IconComponent = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-3 cursor-pointer ${isActive
                    ? 'bg-indigo-50/70 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/40 dark:border-indigo-900/20'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
                    }`}
                >
                  <div className={`w-1 h-4 rounded-full ${isActive ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-transparent'}`} />
                  <IconComponent className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sync Status Bottom Widget */}
        <div className="p-4 border-t border-slate-150 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-150 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-slate-450 dark:text-slate-500 capitalize tracking-wider">Cloud Sync</span>
              <div
                className={`w-2.5 h-2.5 rounded-full animate-pulse ${!isOnline
                  ? 'bg-rose-500'
                  : syncStatus.pendingSyncCount > 0
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                  }`}
                title={!isOnline ? 'Offline' : syncStatus.pendingSyncCount > 0 ? 'Tertunda sinkronisasi' : 'Sinkron'}
              />
            </div>

            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 truncate">
              {!isOnline
                ? 'Koneksi Offline'
                : syncStatus.pendingSyncCount > 0
                  ? `${syncStatus.pendingSyncCount} data belum disinkron`
                  : 'Data Terbaca Sinkron'}
            </p>

            {settings.supabase.connected && user && (
              <button
                onClick={() => handleTriggerSync(undefined, undefined, undefined, true)}
                disabled={syncStatus.isSyncing || !isOnline}
                className="mt-2.5 w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-lg text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                <span>{syncStatus.isSyncing ? 'Sinkronisasi...' : 'Sinkron Sekarang'}</span>
              </button>
            )}

            <div className="mt-2.5 w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-550 ${!isOnline
                  ? 'bg-rose-500 w-1/3'
                  : syncStatus.pendingSyncCount > 0
                    ? 'bg-amber-500 w-2/3'
                    : 'bg-emerald-500 w-full'
                  }`}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Main Area Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Mobile Header (md and smaller) */}
        <header className="sticky top-0 z-45 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 transition-colors md:hidden shrink-0 pt-[env(safe-area-inset-top)]">
          <div className="px-4 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div>
                <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white font-display leading-none">
                  Motor.ku
                </h1>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Jurnal BBM & Oli</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleToggleDarkMode}
                className="p-2 bg-slate-50 dark:bg-slate-800/60 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl cursor-pointer transition-all border border-slate-100 dark:border-slate-800/40"
                title="Ganti Tema"
              >
                {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Mobile Bottom Navigation Bar (App Tensi Style) */}
        <nav id="mobile-bottom-nav" className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-150 dark:border-slate-800/80 pb-safe-bottom z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.25)] flex items-center justify-around h-16 select-none">
          {tabsList.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-col items-center justify-center h-full relative cursor-pointer group transition-all"
              >
                <div className={`absolute inset-y-1.5 inset-x-2 rounded-2xl transition-all duration-300 -z-10 ${isActive
                  ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                  : 'bg-transparent group-hover:bg-slate-50 dark:group-hover:bg-slate-800/10'
                  }`} />

                <IconComponent className={`w-5 h-5 transition-all duration-300 ${isActive
                  ? 'text-indigo-600 dark:text-indigo-400 scale-110'
                  : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400'
                  }`} />

                <span className={`text-[11px] mt-1 font-bold tracking-wide transition-all duration-300 ${isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                  : 'text-slate-400 dark:text-slate-500'
                  }`}>
                  {tab.label}
                </span>

                {isActive && (
                  <span className="absolute bottom-1 w-1 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.6)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Desktop Header Row (md and larger) */}
        <header className="hidden md:flex h-20 border-b border-slate-150 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md items-center justify-between px-8 select-none shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
              {activeTab === 'dashboard' && 'Overview Performa'}
              {activeTab === 'oil' && 'Riwayat Oli'}
              {activeTab === 'fuel' && 'Pencatatan BBM'}
              {activeTab === 'service' && 'Riwayat Servis & Spare Part'}
              {activeTab === 'settings' && 'Pengaturan'}
            </h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
              {user ? `Terhubung: ${user.email}` : 'Mode Penyimpanan Lokal Aktif (Offline Ready)'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Online Badge */}
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-xl ${isOnline
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/60 dark:border-emerald-900/30'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-100/60 dark:border-rose-900/30'
                }`}
            >
              {isOnline ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </span>

            {/* Cloud trigger */}
            {user ? (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Hi, <b className="text-slate-800 dark:text-slate-200">{user.email.split('@')[0]}</b>
                </span>
              </div>
            ) : (
              <button
                id="btn-nav-cloud-connect"
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold rounded-xl shadow-md cursor-pointer transition-all"
              >
                <Cloud className="w-4 h-4" />
                <span>Hubungkan Cloud</span>
              </button>
            )}

            {/* Exports */}
            <div className="flex items-center border-l border-slate-200 dark:border-slate-800 pl-3 gap-1.5">
              <button
                id="btn-export-pdf"
                onClick={() => exportToPDF(oilLogs, fuelLogs, serviceLogs)}
                title="Cetak Laporan PDF"
                className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-rose-600 transition-all cursor-pointer"
              >
                <FileText className="w-4.5 h-4.5" />
              </button>
              <button
                id="btn-export-csv"
                onClick={() => exportToCSV(oilLogs, fuelLogs, 'all', serviceLogs)}
                title="Unduh Laporan CSV"
                className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-emerald-600 transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={handleToggleDarkMode}
              className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-indigo-600 transition-all cursor-pointer"
              title="Ganti Tema"
            >
              {darkMode ? <Sun className="w-4.5 h-4.5 text-amber-500" /> : <Moon className="w-4.5 h-4.5 text-slate-600" />}
            </button>
          </div>
        </header>

        {/* 3. Main Stage Container */}
        <main className="flex-1 p-6 sm:p-8 pb-16 md:pb-8 max-w-7xl w-full mx-auto space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <Dashboard
                  oilLogs={oilLogs}
                  fuelLogs={fuelLogs}
                  serviceLogs={serviceLogs}
                  settings={settings}
                  onNavigate={(tab) => {
                    setActiveTab(tab);
                    setTimeout(() => {
                      const btnId = tab === 'oil' ? 'btn-add-oil-log' : tab === 'fuel' ? 'btn-add-fuel-log' : 'btn-add-service-log';
                      document.getElementById(btnId)?.click();
                    }, 100);
                  }}
                />
              )}

              {activeTab === 'oil' && (
                <OilLogs
                  logs={oilLogs}
                  onAddLog={handleAddOilLog}
                  onEditLog={handleEditOilLog}
                  onDeleteLog={handleDeleteOilLog}
                />
              )}

              {activeTab === 'fuel' && (
                <FuelLogs
                  logs={fuelLogs}
                  onAddLog={handleAddFuelLog}
                  onEditLog={handleEditFuelLog}
                  onDeleteLog={handleDeleteFuelLog}
                  settings={settings}
                />
              )}

              {activeTab === 'service' && (
                <ServiceLogs
                  logs={serviceLogs}
                  onAddLog={handleAddServiceLog}
                  onEditLog={handleEditServiceLog}
                  onDeleteLog={handleDeleteServiceLog}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  settings={settings}
                  syncStatus={syncStatus}
                  user={user}
                  oilLogs={oilLogs}
                  fuelLogs={fuelLogs}
                  onUpdateSettings={handleUpdateSettings}
                  onTriggerSync={() => handleTriggerSync(undefined, undefined, undefined, true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* 4. Geometric Footer / Bottom Bar */}
        <footer className="h-12 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between px-6 sm:px-8 bg-white/20 dark:bg-slate-900/30 text-[12px] text-slate-400 dark:text-slate-500 capitalize tracking-widest font-mono font-semibold shrink-0 select-none">
        </footer>
      </div>
    </div>
  );
}
