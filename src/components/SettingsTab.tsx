import React, { useState, useRef } from 'react';
import { AppSettings, SyncStatus, OilLog, FuelLog } from '../types';
import { testSupabaseConnection, SUPABASE_SQL_SCRIPT, getSupabaseClient } from '../lib/supabaseClient';
import { setDBItem } from '../lib/dbStorage';
import { sendTelegramNotification } from '../utils/telegram';
import { useToast } from './ToastContainer';
import {
  Settings, Database, Send, Calendar, Milestone, Moon, Sun, Eye, EyeOff,
  Clipboard, Check, ShieldCheck, HelpCircle, LogIn, LogOut, RefreshCw, AlertTriangle,
  Download, Upload, Save
} from 'lucide-react';

interface SettingsTabProps {
  settings: AppSettings;
  syncStatus: SyncStatus;
  user: any;
  oilLogs: OilLog[];
  fuelLogs: FuelLog[];
  onUpdateSettings: (newSettings: AppSettings) => void;
  onTriggerSync: () => Promise<void>;
  onOpenAuth: () => void;
  onLogout: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
// Tab Pengaturan untuk mengelola interval ganti oli, koneksi cloud Supabase, dan bot Telegram.
export default function SettingsTab({
  settings,
  syncStatus,
  user,
  oilLogs,
  fuelLogs,
  onUpdateSettings,
  onTriggerSync,
  onOpenAuth,
  onLogout
}: SettingsTabProps) {
  const { showToast } = useToast();

  // Local form state untuk sinkronisasi Database Supabase
  const [supabaseUrl, setSupabaseUrl] = useState(settings.supabase.url);
  const [supabaseKey, setSupabaseKey] = useState(settings.supabase.anonKey);
  const [showKey, setShowKey] = useState(false);
  const [dbConnecting, setDbConnecting] = useState(false);
  const [dbMessage, setDbMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auth local state untuk autentikasi Supabase
  const [authEmail, setAuthEmail] = useState(settings.supabase.email || '');
  const [authPassword, setAuthPassword] = useState(settings.supabase.password || '');

  // Local form state untuk Notifikasi Telegram Bot
  const [tgToken, setTgToken] = useState(settings.telegram.botToken);
  const [tgChatId, setTgChatId] = useState(settings.telegram.chatId);
  const [tgEnabled, setTgEnabled] = useState(settings.telegram.enabled);
  const [tgDays, setTgDays] = useState(settings.telegram.notifyOnDaysBefore);
  const [tgKm, setTgKm] = useState(settings.telegram.notifyOnKmBefore);
  const [showTgToken, setShowTgToken] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgMessage, setTgMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Local form state untuk Interval (Jarak/Hari)
  const [intervalKm, setIntervalKm] = useState(settings.oilChangeIntervalKm);
  const [intervalDays, setIntervalDays] = useState(settings.oilChangeIntervalDays);
  const [fuelPrice, setFuelPrice] = useState(settings.fuelPricePerLiter || 10);

  // App auto update state
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const handleCheckAppUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          try {
            await reg.update();
          } catch (e) {
            console.warn('[SW] Service worker update skipped:', e);
          }
        }
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        setUpdateStatus('Memuat ulang untuk mengambil versi terbaru...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        return;
      }
      setUpdateStatus('Memuat ulang halaman...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch {
      setUpdateStatus('Cache dibersihkan. Memuat ulang halaman...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const [copiedSql, setCopiedSql] = useState(false);

  // Handle Save General Intervals
  const handleSaveIntervals = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      oilChangeIntervalKm: Number(intervalKm),
      oilChangeIntervalDays: Number(intervalDays),
      fuelPricePerLiter: Number(fuelPrice)
    });
    showToast('Pengaturan interval ganti oli & harga BBM berhasil disimpan!', 'success', 'Pengaturan Tersimpan');
  };

  // Handle Test & Connect Supabase
  const handleConnectSupabase = async () => {
    setDbMessage(null);
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setDbMessage({ type: 'error', text: 'URL dan Anon Key Supabase wajib diisi.' });
      return;
    }

    setDbConnecting(true);
    const result = await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim());

    if (result.success) {
      setDbMessage({ type: 'success', text: result.message });

      // Update global settings
      onUpdateSettings({
        ...settings,
        supabase: {
          url: supabaseUrl.trim(),
          anonKey: supabaseKey.trim(),
          email: authEmail.trim(),
          password: authPassword.trim(),
          connected: true
        }
      });
      // Save to IndexedDB storage immediately so Supabase client loads it
      await setDBItem('supabase_url', supabaseUrl.trim());
      await setDBItem('supabase_anon_key', supabaseKey.trim());
      await setDBItem('supabase_email', authEmail.trim());
      await setDBItem('supabase_password', authPassword.trim());

      // Attempt login if email and password are provided
      if (authEmail.trim() && authPassword.trim()) {
        const client = getSupabaseClient(supabaseUrl.trim(), supabaseKey.trim());
        if (client) {
          try {
            const { error: signInError } = await client.auth.signInWithPassword({
              email: authEmail.trim(),
              password: authPassword.trim(),
            });
            if (signInError) {
              if (signInError.message.toLowerCase().includes('invalid login credentials') || signInError.message.toLowerCase().includes('invalid credentials')) {
                const { data: signUpData, error: signUpError } = await client.auth.signUp({
                  email: authEmail.trim(),
                  password: authPassword.trim(),
                });
                if (signUpError) {
                  setDbMessage({ type: 'error', text: `Tersambung ke Supabase, tetapi gagal masuk/daftar: ${signUpError.message}` });
                } else if (signUpData.user) {
                  setDbMessage({ type: 'success', text: 'Berhasil mendaftar akun baru dan terhubung ke Supabase!' });
                  setTimeout(() => onTriggerSync(), 500);
                }
              } else {
                setDbMessage({ type: 'error', text: `Tersambung ke Supabase, tetapi gagal login: ${signInError.message}` });
              }
            } else {
              setDbMessage({ type: 'success', text: 'Berhasil terhubung ke Supabase dan masuk akun!' });
              setTimeout(() => onTriggerSync(), 500);
            }
          } catch (err: any) {
            console.error(err);
            setDbMessage({ type: 'error', text: `Gagal login: ${err.message}` });
          }
        }
      } else {
        setTimeout(() => onTriggerSync(), 500);
      }
    } else {
      setDbMessage({ type: 'error', text: result.message });
    }
    setDbConnecting(false);
  };

  // Ref for Supabase Config JSON file import input
  const supabaseFileInputRef = useRef<HTMLInputElement>(null);

  // Export Supabase JSON settings to Download folder
  const handleExportSupabaseConfig = () => {
    try {
      const configData = {
        app: 'Motor.ku Tracker',
        type: 'supabase_config',
        exportedAt: new Date().toISOString(),
        supabase: {
          url: supabaseUrl.trim(),
          anonKey: supabaseKey.trim(),
          email: authEmail.trim(),
          password: authPassword.trim()
        }
      };

      const jsonString = JSON.stringify(configData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;

      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.download = `supabase_config_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();

      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
      showToast('Konfigurasi Supabase berhasil diekspor ke folder Download!', 'success', 'Ekspor Supabase');
    } catch (error) {
      console.error('Gagal mengekspor konfigurasi Supabase:', error);
      showToast('Gagal membuat file JSON Supabase.', 'error', 'Error Ekspor');
    }
  };

  // Import Supabase JSON settings from local file
  const handleImportSupabaseConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        const config = parsed.supabase || parsed.settings?.supabase || parsed;

        const importedUrl = config.url || config.supabaseUrl || '';
        const importedKey = config.anonKey || config.supabaseKey || config.key || '';
        const importedEmail = config.email || config.authEmail || '';
        const importedPassword = config.password || config.authPassword || '';

        if (!importedUrl && !importedKey) {
          showToast('File JSON tidak berisi konfigurasi Supabase yang valid.', 'error', 'Format Tidak Valid');
          return;
        }

        setSupabaseUrl(importedUrl);
        setSupabaseKey(importedKey);
        setAuthEmail(importedEmail);
        setAuthPassword(importedPassword);

        // Update settings in state & storage
        onUpdateSettings({
          ...settings,
          supabase: {
            url: importedUrl,
            anonKey: importedKey,
            email: importedEmail,
            password: importedPassword,
            connected: settings.supabase.connected
          }
        });

        await setDBItem('supabase_url', importedUrl);
        await setDBItem('supabase_anon_key', importedKey);
        await setDBItem('supabase_email', importedEmail);
        await setDBItem('supabase_password', importedPassword);

        showToast('Konfigurasi Supabase berhasil diimpor dari file JSON!', 'success', 'Impor Supabase');
      } catch (err) {
        console.error('Gagal membaca file JSON Supabase:', err);
        showToast('File JSON rusak atau format tidak sesuai.', 'error', 'Gagal Impor');
      } finally {
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  // Handle Save Telegram Configurations
  const handleSaveTelegram = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      telegram: {
        ...settings.telegram,
        botToken: tgToken.trim(),
        chatId: tgChatId.trim(),
        enabled: tgEnabled,
        notifyOnDaysBefore: Number(tgDays),
        notifyOnKmBefore: Number(tgKm)
      }
    });
    showToast('Pengaturan notifikasi Telegram berhasil disimpan!', 'success', 'Telegram Config');
  };

  // Handle Test Telegram Alert
  const handleTestTelegram = async () => {
    setTgMessage(null);
    if (!tgToken.trim() || !tgChatId.trim()) {
      setTgMessage({ type: 'error', text: 'Token Bot dan Chat ID diperlukan untuk melakukan uji coba.' });
      return;
    }

    setTgTesting(true);
    const text = '<b>🔔 UJI COBA NOTIFIKASI TELEGRAM 🔔</b>\n\nHalo! Koneksi Telegram Bot Anda berhasil terhubung dengan Aplikasi <b>Oil & Fuel Tracker Motor</b>.\n\nSistem siap mengirimkan pengingat jadwal ganti oli otomatis secara real-time!';
    const result = await sendTelegramNotification(tgToken.trim(), tgChatId.trim(), text);
    setTgTesting(false);

    if (result.success) {
      setTgMessage({ type: 'success', text: 'Notifikasi uji coba berhasil terkirim! Silakan periksa Telegram Anda.' });
    } else {
      setTgMessage({ type: 'error', text: result.message });
    }
  };

  // Copy SQL script to clipboard
  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Download all logs as backup JSON file
  const handleDownloadBackup = () => {
    try {
      const backupData = {
        app: 'Motor.ku Tracker',
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        data: {
          oilLogs,
          fuelLogs,
          settings
        }
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;

      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.download = `motorku_backup_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();

      // Cleanup
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
      showToast('File cadangan data berhasil diunduh!', 'success', 'Backup JSON');
    } catch (error) {
      console.error('Gagal mengunduh cadangan:', error);
      showToast('Gagal membuat file cadangan.', 'error', 'Error Backup');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. Header & General Controls */}

      {/* 2. Oil Intervals Configurations (user limit setting) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-50 dark:border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-500" /> Ganti Oli
          </h3>
          <div className="flex items-center gap-1">
            <button
              id="btn-download-backup"
              type="button"
              onClick={handleDownloadBackup}
              className="p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Download Backup JSON"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              id="btn-sync-now"
              type="button"
              onClick={onTriggerSync}
              disabled={syncStatus.isSyncing || !settings.supabase.connected || !user}
              className={`p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${syncStatus.isSyncing ? 'animate-spin text-indigo-500' : ''}`}
              title="Sinkronisasi Cloud"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              id="btn-save-intervals"
              type="button"
              onClick={handleSaveIntervals}
              className="p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors cursor-pointer"
              title="Simpan Pengaturan"
            >
              <Save className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form className="grid grid-cols-3 gap-2 sm:gap-6">
          <div>
            <label className="block text-[10px] sm:text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1.5 truncate">
              Jarak (Km)
            </label>
            <div className="relative">
              <input
                id="set-interval-km"
                type="number"
                required
                value={intervalKm}
                onChange={(e) => setIntervalKm(Number(e.target.value))}
                placeholder="2000"
                className="w-full py-2 sm:py-2.5 pl-2 sm:pl-3 pr-7 sm:pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-semibold"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-4 text-[10px] sm:text-sm font-bold text-slate-400 pointer-events-none">
                KM
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] sm:text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1.5 truncate">
              Waktu (Hari)
            </label>
            <div className="relative">
              <input
                id="set-interval-days"
                type="number"
                required
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                placeholder="90"
                className="w-full py-2 sm:py-2.5 pl-2 sm:pl-3 pr-8 sm:pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-semibold"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-4 text-[10px] sm:text-sm font-bold text-slate-400 pointer-events-none">
                Hari
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] sm:text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1.5 truncate">
              Harga BBM/L
            </label>
            <div className="relative">
              <input
                id="set-fuel-price"
                type="number"
                required
                value={fuelPrice}
                onChange={(e) => setFuelPrice(Number(e.target.value))}
                placeholder="10000"
                className="w-full py-2 sm:py-2.5 pl-2 sm:pl-3 pr-7 sm:pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-semibold"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-4 text-[10px] sm:text-[12px] font-bold text-slate-400 pointer-events-none">
                Rp
              </span>
            </div>
          </div>
        </form>
      </div>

      {/* 3. Supabase Cloud Sync Configuration */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs space-y-6">
        <h3 className="text-base font-bold flex items-center justify-between gap-2 border-b border-slate-50 dark:border-slate-800 pb-3">
          <span className={`flex items-center gap-2 ${settings.supabase.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
            <Database className={`w-5 h-5 ${settings.supabase.connected ? 'text-emerald-500 dark:text-emerald-400' : 'text-indigo-500'}`} /> Supabase
          </span>
          <div className="flex items-center gap-1">
            <input
              type="file"
              ref={supabaseFileInputRef}
              accept=".json"
              onChange={handleImportSupabaseConfig}
              className="hidden"
            />
            <button
              id="btn-import-supabase-json"
              type="button"
              onClick={() => supabaseFileInputRef.current?.click()}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors cursor-pointer"
              title="Impor seting Supabase"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button
              id="btn-export-supabase-json"
              type="button"
              onClick={handleExportSupabaseConfig}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors cursor-pointer"
              title="Ekspor seting Supabase"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              id="btn-test-supabase"
              type="button"
              onClick={handleConnectSupabase}
              disabled={dbConnecting}
              className={`p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50`}
              title="Simpan & Hubungkan Database"
            >
              {dbConnecting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            </button>
          </div>
        </h3>

      {/* Credentials Inputs */}
      <div className="space-y-4 pt-1">
        <div>
          <label className="block text-[13px] font-bold tracking-widest text-slate-400 mb-2">
            Supabase Project URL
          </label>
          <input
            id="input-supabase-url"
            type="text"
            placeholder="https://your-project.supabase.co"
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
            className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-sm font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold tracking-widest text-slate-400 mb-2">
            Supabase Anon / Public API Key
          </label>
          <div className="relative">
            <input
              id="input-supabase-key"
              type={showKey ? 'text' : 'password'}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              className="w-full py-3 pl-4 pr-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-sm font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
            />
            <button
              id="toggle-supabase-key-visibility"
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-bold tracking-widest text-slate-400 mb-2">
            Email Auth
          </label>
          <input
            id="input-supabase-email"
            type="email"
            placeholder="haris443@gmail.com"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-sm font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
          />
        </div>

        <div>
          <label className="block text-[13px] font-bold tracking-widest text-slate-400 mb-2">
            Password Auth
          </label>
          <input
            id="input-supabase-password"
            type="password"
            placeholder="••••••••"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-sm font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
          />
        </div>

        {dbMessage && dbMessage.type === 'error' && (
          <div className="p-3 rounded-xl text-sm flex gap-2 border bg-rose-50 dark:bg-rose-950/30 border-rose-150 dark:border-rose-900/40 text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{dbMessage.text}</span>
          </div>
        )}


      </div>
    </div>

      {/* 4. Telegram Alert Configurations */ }
  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
    <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3">
      <Send className="w-5 h-5 text-indigo-500" /> Notifikasi (Telegram Bot API)
    </h3>

    <form onSubmit={handleSaveTelegram} className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850">
        <div>
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
            Aktifkan Pengingat Telegram
          </label>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            id="toggle-telegram"
            type="checkbox"
            checked={tgEnabled}
            onChange={(e) => setTgEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1">
            Telegram Bot Token
          </label>
          <div className="relative">
            <input
              id="input-telegram-token"
              type={showTgToken ? 'text' : 'password'}
              required={tgEnabled}
              placeholder="1234567890:ABCdefGhIJKlmNoPQRsT..."
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              disabled={!tgEnabled}
              className="w-full py-2.5 pl-3 pr-10 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm disabled:opacity-50"
            />
            <button
              id="toggle-telegram-token-visibility"
              type="button"
              onClick={() => setShowTgToken(!showTgToken)}
              disabled={!tgEnabled}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              {showTgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1">
            Telegram Chat ID Pengguna
          </label>
          <input
            id="input-telegram-chatid"
            type="text"
            required={tgEnabled}
            placeholder="Contoh: 987654321"
            value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)}
            disabled={!tgEnabled}
            className="w-full py-2.5 px-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm disabled:opacity-50"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1">
            Kirim Peringatan Hari Sebelum Ganti Oli
          </label>
          <div className="relative">
            <input
              id="input-telegram-days-before"
              type="number"
              required={tgEnabled}
              value={tgDays}
              onChange={(e) => setTgDays(Number(e.target.value))}
              disabled={!tgEnabled}
              className="w-full py-2.5 pl-3 pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm disabled:opacity-50 font-bold"
            />
            <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-[12px] font-bold text-slate-400 pointer-events-none capitalize">
              Hari
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1">
            Kirim Peringatan Jarak Sebelum Ganti Oli (km)
          </label>
          <div className="relative">
            <input
              id="input-telegram-km-before"
              type="number"
              required={tgEnabled}
              value={tgKm}
              onChange={(e) => setTgKm(Number(e.target.value))}
              disabled={!tgEnabled}
              className="w-full py-2.5 pl-3 pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm disabled:opacity-50 font-bold"
            />
            <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-[12px] font-bold text-slate-400 pointer-events-none capitalize">
              KM
            </span>
          </div>
        </div>
      </div>

      {tgMessage && (
        <div className={`p-3 rounded-xl text-sm flex gap-2 border ${tgMessage.type === 'success'
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-150 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
          : 'bg-rose-50 dark:bg-rose-950/30 border-rose-150 dark:border-rose-900/40 text-rose-800 dark:text-rose-300'
          }`}>
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{tgMessage.text}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between gap-3 pt-3 border-t border-slate-50 dark:border-slate-850">
        {/* Instruction tooltip */}
        <div className="text-[12px] text-slate-400 max-w-md flex items-center gap-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-850">
          <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>Cari <b>@BotFather</b> di Telegram untuk membuat bot Anda. Dapatkan Token, lalu kirim pesan apa saja ke <b>@userinfobot</b> untuk mengetahui Chat ID Anda.</span>
        </div>

        <div className="flex gap-2 self-end">
          <button
            id="btn-test-telegram"
            type="button"
            onClick={handleTestTelegram}
            disabled={tgTesting || !tgEnabled}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {tgTesting ? 'Mengirim Uji Coba...' : 'Tes Notifikasi'}
          </button>
          <button
            id="btn-save-telegram"
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer"
          >
            Simpan
          </button>
        </div>
      </div>
    </form>
  </div>


</div>
  );
}
