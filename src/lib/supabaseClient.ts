import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OilLog, FuelLog, ServiceLog, Jarak } from '../types';
import { getDBItem, setDBItem, getSyncItem } from './dbStorage';

let supabaseInstance: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';

// Mengelola inisialisasi dan pengambilan instance dari Supabase Client
export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  // Try to load from provided args or IndexedDB/local storage
  const defaultUrl = 'https://pcoyvfhcniscynjkndlw.supabase.co';
  const defaultKey = 'sb_publishable_4HYaHZhOIECG56Eccpe4sA_xj-Ecy9n';

  const finalUrl = url || getSyncItem('supabase_url', defaultUrl);
  const finalKey = anonKey || getSyncItem('supabase_anon_key', defaultKey);

  if (!finalUrl || !finalKey) {
    supabaseInstance = null;
    return null;
  }

  // Reuse instance if credentials haven't changed
  if (supabaseInstance && currentUrl === finalUrl && currentKey === finalKey) {
    return supabaseInstance;
  }

  try {
    currentUrl = finalUrl;
    currentKey = finalKey;
    supabaseInstance = createClient(finalUrl, finalKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    });
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
}

// Check if credentials are valid by trying a basic auth or ping check
export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = createClient(url, anonKey);
    // Try to read a dummy request or just get auth state
    const { error } = await client.from('oil_logs').select('id').limit(1);
    
    // If the error is table not found, the connection itself is SUCCESSFUL (the client authenticated)
    // but the tables need to be created.
    if (error && error.code === 'PGRST116') {
      return { success: true, message: 'Koneksi berhasil! Namun tabel belum dibuat. Silakan jalankan script SQL di bawah.' };
    }
    if (error && error.code === '42P01') {
      return { success: true, message: 'Koneksi berhasil! Silakan buat tabel di Supabase menggunakan tab SQL di bawah.' };
    }
    if (error) {
      // If it's a CORS or network error or invalid API key
      return { success: false, message: `Koneksi gagal: ${error.message}` };
    }
    return { success: true, message: 'Koneksi berhasil dan tabel ditemukan!' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Koneksi gagal. Periksa URL dan API Key Anda.' };
  }
}

/**
 * Robust Sync Engine
 * Syncs oil logs and fuel logs.
 * Handles:
 * - Insert offline-created logs to remote
 * - Fetch remote-created logs to local
 * - Update existing logs based on `updated_at` timestamp
 * - Process deletions (stored in local 'deleted_ids' list)
 */
export async function syncWithSupabase(
  localOilLogs: OilLog[],
  localFuelLogs: FuelLog[],
  progressOrServiceLogs?: ((status: string) => void) | ServiceLog[],
  localServiceLogsArg: ServiceLog[] = []
): Promise<{
  syncedOilLogs: OilLog[];
  syncedFuelLogs: FuelLog[];
  syncedServiceLogs: ServiceLog[];
  syncedJarakRecords?: Jarak[];
  success: boolean;
  message: string;
}> {
  let progressFn: ((status: string) => void) | undefined;
  let localServiceLogs: ServiceLog[] = Array.isArray(localServiceLogsArg) ? localServiceLogsArg : [];

  if (typeof progressOrServiceLogs === 'function') {
    progressFn = progressOrServiceLogs;
  } else if (Array.isArray(progressOrServiceLogs)) {
    localServiceLogs = progressOrServiceLogs;
  }

  const reportProgress = (status: string) => {
    if (typeof progressFn === 'function') {
      try {
        progressFn(status);
      } catch {
        // ignore progress callback errors
      }
    }
  };

  const client = getSupabaseClient();
  if (!client) {
    return { syncedOilLogs: localOilLogs, syncedFuelLogs: localFuelLogs, syncedServiceLogs: localServiceLogs, success: false, message: 'Supabase belum dikonfigurasi.' };
  }

  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      return { syncedOilLogs: localOilLogs, syncedFuelLogs: localFuelLogs, syncedServiceLogs: localServiceLogs, success: false, message: 'Silakan login terlebih dahulu untuk sinkronisasi.' };
    }

    const userId = user.id;
    reportProgress('Sinkronisasi dimulai...');

    // 1. Process deletions
    let deletedIds: string[] = [];
    try {
      deletedIds = await getDBItem<string[]>('deleted_log_ids', []);
    } catch (e) {
      // ignore
    }
    if (deletedIds.length > 0) {
      reportProgress('Menghapus data yang didelete saat offline...');
      // Delete oil logs
      await client.from('oil_logs').delete().in('id', deletedIds).eq('user_id', userId);
      // Delete fuel logs
      await client.from('fuel_logs').delete().in('id', deletedIds).eq('user_id', userId);
      // Delete service logs
      await client.from('service_logs').delete().in('id', deletedIds).eq('user_id', userId);
      // Clear local deletion log
      await setDBItem('deleted_log_ids', []);
    }

    // 2. Sync Oil Logs
    reportProgress('Sinkronisasi riwayat ganti oli...');
    // Fetch remote oil logs
    const { data: remoteOilLogs, error: oilError } = await client
      .from('oil_logs')
      .select('*')
      .eq('user_id', userId);

    if (oilError) {
      if (oilError.code === '42P01') {
        throw new Error('Tabel oil_logs belum ada di Supabase. Silakan jalankan script SQL pada tab Pengaturan.');
      }
      throw new Error(oilError.message || 'Gagal mengambil data ganti oli dari Supabase.');
    }

    const safeRemoteOilLogs = Array.isArray(remoteOilLogs) ? remoteOilLogs : [];
    const safeLocalOilLogs = Array.isArray(localOilLogs) ? localOilLogs : [];

    const mergedOilLogs: OilLog[] = [...safeLocalOilLogs];
    const remoteOilMap = new Map<string, any>(safeRemoteOilLogs.map(item => [item.id, item]));

    // Check local vs remote
    for (const local of safeLocalOilLogs) {
      const remote = remoteOilMap.get(local.id);
      if (!remote) {
        // Exists locally but not remotely -> Upload to remote (upsert)
        const { error: insErr } = await client.from('oil_logs').upsert({
          id: local.id,
          user_id: userId,
          date: local.date || new Date().toISOString().split('T')[0],
          mileage: isFinite(local.mileage) && !isNaN(local.mileage) ? Math.round(Number(local.mileage)) : 0,
          cost: isFinite(local.cost) && !isNaN(local.cost) ? Number(local.cost) : 0,
          oil_brand: local.oil_brand || 'Standard',
          oil_type: local.oil_type || 'Synthetic',
          notes: local.notes || '',
          rating: isFinite(local.rating) && !isNaN(local.rating) ? Number(local.rating) : 5,
          updated_at: local.updated_at || new Date().toISOString()
        });
        if (insErr) {
          console.error('Gagal upload oli log:', insErr.message || insErr);
        } else {
          // Sync user_id back to local merged list so it's persisted properly
          const index = mergedOilLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedOilLogs[index].user_id = userId;
          }
        }
      } else {
        // Exists in both -> Compare timestamps
        const localTime = new Date(local.updated_at || 0).getTime();
        const remoteTime = new Date(remote.updated_at || 0).getTime();

        if (localTime > remoteTime) {
          // Local is newer -> Update remote
          await client.from('oil_logs').update({
            date: local.date || new Date().toISOString().split('T')[0],
            mileage: isFinite(local.mileage) && !isNaN(local.mileage) ? Math.round(Number(local.mileage)) : 0,
            cost: isFinite(local.cost) && !isNaN(local.cost) ? Number(local.cost) : 0,
            oil_brand: local.oil_brand || 'Standard',
            oil_type: local.oil_type || 'Synthetic',
            notes: local.notes || '',
            rating: isFinite(local.rating) && !isNaN(local.rating) ? Number(local.rating) : 5,
            updated_at: local.updated_at || new Date().toISOString()
          }).eq('id', local.id).eq('user_id', userId);
        } else if (remoteTime > localTime) {
          // Remote is newer -> Update local list
          const index = mergedOilLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedOilLogs[index] = {
              id: remote.id,
              user_id: remote.user_id,
              date: remote.date,
              mileage: remote.mileage,
              cost: remote.cost,
              oil_brand: remote.oil_brand,
              oil_type: remote.oil_type,
              notes: remote.notes,
              rating: remote.rating,
              created_at: remote.created_at,
              updated_at: remote.updated_at
            };
          }
        }
      }
    }

    // Add remote logs that are not present locally
    for (const remote of safeRemoteOilLogs) {
      const localExists = safeLocalOilLogs.some(l => l.id === remote.id);
      if (!localExists) {
        mergedOilLogs.push({
          id: remote.id,
          user_id: remote.user_id,
          date: remote.date,
          mileage: remote.mileage,
          cost: remote.cost,
          oil_brand: remote.oil_brand,
          oil_type: remote.oil_type,
          notes: remote.notes,
          rating: remote.rating,
          created_at: remote.created_at,
          updated_at: remote.updated_at
        });
      }
    }

    // 3. Sync Fuel Logs
    reportProgress('Sinkronisasi riwayat pembelian BBM...');
    // Fetch remote fuel logs
    const { data: remoteFuelLogs, error: fuelError } = await client
      .from('fuel_logs')
      .select('*')
      .eq('user_id', userId);

    if (fuelError) {
      if (fuelError.code === '42P01') {
        throw new Error('Tabel fuel_logs belum ada di Supabase. Silakan jalankan script SQL pada tab Pengaturan.');
      }
      throw new Error(fuelError.message || 'Gagal mengambil data BBM dari Supabase.');
    }

    const safeRemoteFuelLogs = Array.isArray(remoteFuelLogs) ? remoteFuelLogs : [];
    const safeLocalFuelLogs = Array.isArray(localFuelLogs) ? localFuelLogs : [];

    const mergedFuelLogs: FuelLog[] = [...safeLocalFuelLogs];
    const remoteFuelMap = new Map<string, any>(safeRemoteFuelLogs.map(item => [item.id, item]));

    for (const local of safeLocalFuelLogs) {
      const remote = remoteFuelMap.get(local.id);
      const safeEfficiency = (local.efficiency !== undefined && local.efficiency !== null && isFinite(local.efficiency) && !isNaN(local.efficiency))
        ? Number(local.efficiency)
        : null;
      
      const safeLiters = isFinite(local.liters) && !isNaN(local.liters) && Number(local.liters) > 0
        ? Number(local.liters)
        : 0.01;

      const safeMileage = isFinite(local.mileage) && !isNaN(local.mileage) ? Math.max(0, Math.round(Number(local.mileage))) : 0;
      const safeCost = isFinite(local.cost) && !isNaN(local.cost) ? Math.max(0, Number(local.cost)) : 0;

      if (!remote) {
        // Exists locally but not remotely -> Upload (upsert)
        const { error: insErr } = await client.from('fuel_logs').upsert({
          id: local.id,
          user_id: userId,
          date: local.date || new Date().toISOString().split('T')[0],
          mileage: safeMileage,
          liters: safeLiters,
          cost: safeCost,
          fuel_type: local.fuel_type || 'Pertalite',
          efficiency: safeEfficiency,
          notes: local.notes || '',
          updated_at: local.updated_at || new Date().toISOString()
        });
        if (insErr) {
          console.error('Gagal upload bbm log:', insErr.message || insErr);
        } else {
          // Sync user_id back to local merged list so it's persisted properly
          const index = mergedFuelLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedFuelLogs[index].user_id = userId;
            mergedFuelLogs[index].liters = safeLiters;
          }
        }
      } else {
        // Compare timestamps
        const localTime = new Date(local.updated_at || 0).getTime();
        const remoteTime = new Date(remote.updated_at || 0).getTime();

        if (localTime > remoteTime) {
          // Local is newer -> Update remote
          await client.from('fuel_logs').update({
            date: local.date || new Date().toISOString().split('T')[0],
            mileage: safeMileage,
            liters: safeLiters,
            cost: safeCost,
            fuel_type: local.fuel_type || 'Pertalite',
            efficiency: safeEfficiency,
            notes: local.notes || '',
            updated_at: local.updated_at || new Date().toISOString()
          }).eq('id', local.id).eq('user_id', userId);
        } else if (remoteTime > localTime) {
          // Remote is newer -> Update local
          const index = mergedFuelLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedFuelLogs[index] = {
              id: remote.id,
              user_id: remote.user_id,
              date: remote.date,
              mileage: remote.mileage,
              liters: remote.liters,
              cost: remote.cost,
              fuel_type: remote.fuel_type,
              efficiency: remote.efficiency,
              notes: remote.notes,
              created_at: remote.created_at,
              updated_at: remote.updated_at
            };
          }
        }
      }
    }

    // Add remote fuel logs not present locally
    for (const remote of safeRemoteFuelLogs) {
      const localExists = safeLocalFuelLogs.some(l => l.id === remote.id);
      if (!localExists) {
        mergedFuelLogs.push({
          id: remote.id,
          user_id: remote.user_id,
          date: remote.date,
          mileage: remote.mileage,
          liters: remote.liters,
          cost: remote.cost,
          fuel_type: remote.fuel_type,
          efficiency: remote.efficiency,
          notes: remote.notes,
          created_at: remote.created_at,
          updated_at: remote.updated_at
        });
      }
    }

    // 4. Sync Service Logs
    reportProgress('Sinkronisasi riwayat servis & sparepart...');
    const { data: remoteServiceLogs, error: serviceError } = await client
      .from('service_logs')
      .select('*')
      .eq('user_id', userId);

    if (serviceError) {
      console.warn(`Sinkronisasi servis diabaikan (tabel mungkin belum dibuat): ${serviceError.message}`);
    }

    const safeRemoteServiceLogs = Array.isArray(remoteServiceLogs) ? remoteServiceLogs : [];
    const safeLocalServiceLogs = Array.isArray(localServiceLogs) ? localServiceLogs : [];

    const mergedServiceLogs: ServiceLog[] = [...safeLocalServiceLogs];
    const remoteServiceMap = new Map<string, any>(safeRemoteServiceLogs.map(item => [item.id, item]));

    for (const local of safeLocalServiceLogs) {
      const remote = remoteServiceMap.get(local.id);
      if (!remote) {
        // Upsert to remote
        await client.from('service_logs').upsert({
          id: local.id,
          user_id: userId,
          date: local.date || new Date().toISOString().split('T')[0],
          mileage: isFinite(local.mileage) && !isNaN(local.mileage) ? Math.round(Number(local.mileage)) : 0,
          cost: isFinite(local.cost) && !isNaN(local.cost) ? Number(local.cost) : 0,
          service_type: local.service_type || 'Servis Motor',
          description: local.description || '',
          parts_changed: Array.isArray(local.parts_changed) ? local.parts_changed : [],
          notes: local.notes || '',
          updated_at: local.updated_at || new Date().toISOString()
        });
      } else {
        const localTime = new Date(local.updated_at || 0).getTime();
        const remoteTime = new Date(remote.updated_at || 0).getTime();

        if (localTime > remoteTime) {
          await client.from('service_logs').update({
            date: local.date || new Date().toISOString().split('T')[0],
            mileage: isFinite(local.mileage) && !isNaN(local.mileage) ? Math.round(Number(local.mileage)) : 0,
            cost: isFinite(local.cost) && !isNaN(local.cost) ? Number(local.cost) : 0,
            service_type: local.service_type || 'Servis Motor',
            description: local.description || '',
            parts_changed: Array.isArray(local.parts_changed) ? local.parts_changed : [],
            notes: local.notes || '',
            updated_at: local.updated_at || new Date().toISOString()
          }).eq('id', local.id).eq('user_id', userId);
        } else if (remoteTime > localTime) {
          const index = mergedServiceLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedServiceLogs[index] = {
              id: remote.id,
              user_id: remote.user_id,
              date: remote.date,
              mileage: remote.mileage,
              cost: remote.cost,
              service_type: remote.service_type,
              description: remote.description,
              parts_changed: remote.parts_changed || [],
              notes: remote.notes,
              created_at: remote.created_at,
              updated_at: remote.updated_at
            };
          }
        }
      }
    }

    for (const remote of safeRemoteServiceLogs) {
      const localExists = safeLocalServiceLogs.some(l => l.id === remote.id);
      if (!localExists) {
        mergedServiceLogs.push({
          id: remote.id,
          user_id: remote.user_id,
          date: remote.date,
          mileage: remote.mileage,
          cost: remote.cost,
          service_type: remote.service_type,
          description: remote.description,
          parts_changed: remote.parts_changed || [],
          notes: remote.notes,
          created_at: remote.created_at,
          updated_at: remote.updated_at
        });
      }
    }

    // Sort logs descending by date
    mergedOilLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    mergedFuelLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    mergedServiceLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 5. Sync Jarak Tempuh (total_km)
    reportProgress('Sinkronisasi data jarak tempuh (total_km)...');
    let localJarakRecords: Jarak[] = [];
    try {
      localJarakRecords = await getDBItem<Jarak[]>('oil_tracker_jarak', []);
    } catch (e) {}

    const { data: remoteJarakRecords, error: jarakError } = await client
      .from('jarak')
      .select('*')
      .eq('user_id', userId);

    if (jarakError) {
      console.warn(`Sinkronisasi jarak diabaikan: ${jarakError.message}`);
    }

    const safeRemoteJarak = Array.isArray(remoteJarakRecords) ? remoteJarakRecords : [];
    const safeLocalJarak = Array.isArray(localJarakRecords) ? localJarakRecords : [];

    const mergedJarakMap = new Map<string, Jarak>();

    for (const remote of safeRemoteJarak) {
      mergedJarakMap.set(remote.id || `${remote.date}_${remote.source}`, {
        id: remote.id,
        user_id: remote.user_id,
        date: remote.date,
        total_km: Number(remote.total_km || 0),
        source: remote.source || 'colota',
        created_at: remote.created_at,
        updated_at: remote.updated_at
      });
    }

    for (const local of safeLocalJarak) {
      const key = local.id || `${local.date}_${local.source}`;
      const remote = mergedJarakMap.get(key);
      if (!remote) {
        // Local only -> push to remote
        const { error: insErr } = await client.from('jarak').upsert({
          id: local.id || undefined,
          user_id: userId,
          date: local.date || new Date().toISOString().split('T')[0],
          total_km: Number(local.total_km || 0),
          source: local.source || 'colota',
          updated_at: local.updated_at || new Date().toISOString()
        });
        if (!insErr) {
          local.user_id = userId;
        }
        mergedJarakMap.set(key, local);
      } else {
        const localTime = new Date(local.updated_at || 0).getTime();
        const remoteTime = new Date(remote.updated_at || 0).getTime();
        if (localTime > remoteTime) {
          await client.from('jarak').update({
            date: local.date,
            total_km: Number(local.total_km || 0),
            source: local.source || 'colota',
            updated_at: local.updated_at || new Date().toISOString()
          }).eq('id', local.id).eq('user_id', userId);
          mergedJarakMap.set(key, local);
        }
      }
    }

    const mergedJarakList = Array.from(mergedJarakMap.values());
    mergedJarakList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Copy/save hasil jarak (total_km) ke local DB (IndexedDB)
    await setDBItem('oil_tracker_jarak', mergedJarakList);

    // Update settings in cloud if needed
    reportProgress('Sinkronisasi pengaturan...');
    const localSettings = await getDBItem('oil_tracker_settings', null);
    if (localSettings) {
      await client.from('user_settings').upsert({
        user_id: userId,
        settings: localSettings,
        updated_at: new Date().toISOString()
      });
    }

    return {
      syncedOilLogs: mergedOilLogs,
      syncedFuelLogs: mergedFuelLogs,
      syncedServiceLogs: mergedServiceLogs,
      syncedJarakRecords: mergedJarakList,
      success: true,
      message: 'Sinkronisasi berhasil!'
    };
  } catch (error: any) {
    console.error('Sync failed:', error);
    let errMsg = error?.message || String(error);
    if (errMsg.includes('Failed to fetch') || errMsg.includes('TypeError')) {
      errMsg = 'Koneksi ke Supabase terputus. Periksa koneksi internet atau URL/Anon Key Supabase Anda.';
    }
    return {
      syncedOilLogs: localOilLogs,
      syncedFuelLogs: localFuelLogs,
      syncedServiceLogs: localServiceLogs,
      success: false,
      message: `Sinkronisasi gagal: ${errMsg}`
    };
  }
}

// ============================================================
// Jarak Tempuh Harian — fetch records grouped for Dashboard
// ============================================================

/**
 * Fetch all jarak records for the logged-in user (to sum by month in the UI).
 * Copy/save the results to local DB (localStorage).
 */
export async function fetchJarakRecords(): Promise<{
  records: Jarak[];
  error: string | null;
}> {
  const client = getSupabaseClient();
  if (!client) {
    const records = await getDBItem<Jarak[]>('oil_tracker_jarak', []);
    return { records, error: records.length > 0 ? null : 'Supabase belum dikonfigurasi.' };
  }

  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      const records = await getDBItem<Jarak[]>('oil_tracker_jarak', []);
      return { records, error: records.length > 0 ? null : 'Silakan login terlebih dahulu.' };
    }

    const { data, error } = await client
      .from('jarak')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) {
      const records = await getDBItem<Jarak[]>('oil_tracker_jarak', []);
      return { records, error: records.length > 0 ? null : `Gagal mengambil jarak tempuh: ${error.message}` };
    }

    const records = (data || []) as Jarak[];
    // Copy/save hasil fungsi jarak (total_km) ke lokal DB (IndexedDB)
    await setDBItem('oil_tracker_jarak', records);

    return { records, error: null };
  } catch (err: any) {
    const records = await getDBItem<Jarak[]>('oil_tracker_jarak', []);
    return { records, error: err.message || 'Terjadi kesalahan.' };
  }
}

// SQL Script template to create ALL Supabase tables
export const SUPABASE_SQL_SCRIPT = `-- SCRIPT PEMBUATAN TABEL UNTUK APLIKASI MOTOR.KU TRACKER
-- Jalankan kode berikut di SQL Editor Supabase Anda:

-- ============================================================
-- 1. TABEL UTAMA: Riwayat Ganti Oli
-- ============================================================
CREATE TABLE IF NOT EXISTS oil_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  mileage INTEGER NOT NULL,
  cost NUMERIC NOT NULL,
  oil_brand TEXT NOT NULL,
  oil_type TEXT NOT NULL,
  notes TEXT,
  rating INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 2. TABEL UTAMA: Riwayat Pembelian BBM
-- ============================================================
CREATE TABLE IF NOT EXISTS fuel_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  mileage INTEGER NOT NULL,
  liters NUMERIC NOT NULL,
  cost NUMERIC NOT NULL,
  fuel_type TEXT NOT NULL,
  efficiency NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 3. TABEL UTAMA: Riwayat Servis & Sparepart
-- ============================================================
CREATE TABLE IF NOT EXISTS service_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  mileage INTEGER NOT NULL,
  cost NUMERIC NOT NULL,
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  parts_changed TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 4. TABEL UTAMA: Pengaturan Pengguna
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 5. TABEL: Jarak Tempuh Harian
-- ============================================================
CREATE TABLE IF NOT EXISTS jarak (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'colota',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, date, source)
);

CREATE INDEX IF NOT EXISTS idx_jarak_user_date
  ON jarak (user_id, date);

-- ============================================================
-- AKTIFKAN ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE oil_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarak ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BUAT POLICY UNTUK RLS
-- ============================================================
CREATE POLICY "Pengguna hanya bisa melihat data olinya sendiri"
  ON oil_logs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa melihat data bbmnya sendiri"
  ON fuel_logs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa melihat data servisnya sendiri"
  ON service_logs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa melihat pengaturannya sendiri"
  ON user_settings FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa melihat data jarak tempuhnya sendiri"
  ON jarak FOR ALL USING (auth.uid() = user_id);

`;
