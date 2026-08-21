import { get, set, del, keys } from 'idb-keyval';

/**
 * IndexedDB Local Storage Service
 * Provides robust offline storage backed by IndexedDB with automatic fallback & migration.
 */

// Memory cache for synchronous reads during initialization
const memoryCache: Record<string, any> = {};
let isMigrated = false;

// Preload known keys into memory cache from localStorage for instant initial render
const KNOWN_KEYS = [
  'oil_tracker_settings',
  'oil_tracker_oil_logs',
  'oil_tracker_fuel_logs',
  'oil_tracker_service_logs',
  'oil_tracker_jarak',
  'oil_tracker_theme',
  'supabase_url',
  'supabase_anon_key',
  'supabase_email',
  'supabase_password',
  'deleted_log_ids'
];

/**
 * Inisialisasi & Migrasi dari localStorage ke IndexedDB
 */
export async function initIndexedDB(): Promise<void> {
  if (isMigrated) return;
  try {
    // Check if IndexedDB is available (works offline, in PWA, and in private browsing)
    if (typeof indexedDB === 'undefined') {
      console.warn('[IndexedDB] Not available — using memory cache only.');
      isMigrated = true;
      return;
    }
    const dbKeys = await keys();
    for (const key of KNOWN_KEYS) {
      if (dbKeys.includes(key)) {
        const val = await get(key);
        if (val !== undefined) {
          memoryCache[key] = val;
        }
      } else {
        // Jika belum ada di IndexedDB, periksa localStorage
        const localVal = localStorage.getItem(key);
        if (localVal !== null) {
          try {
            const parsed = JSON.parse(localVal);
            await set(key, parsed);
            memoryCache[key] = parsed;
          } catch {
            await set(key, localVal);
            memoryCache[key] = localVal;
          }
        }
      }
    }
    isMigrated = true;
  } catch (err) {
    console.warn('[IndexedDB] Inisialisasi/Migrasi warn:', err);
    // Mark as migrated anyway so the app can still function from memory cache + localStorage
    isMigrated = true;
  }
}

/**
 * Mengambil data dari IndexedDB (Async)
 */
export async function getDBItem<T>(key: string, fallback: T): Promise<T> {
  try {
    const val = await get(key);
    if (val !== undefined) {
      memoryCache[key] = val;
      return val as T;
    }
    // Coba fallback dari localStorage
    const localVal = localStorage.getItem(key);
    if (localVal !== null) {
      try {
        const parsed = JSON.parse(localVal);
        await set(key, parsed);
        memoryCache[key] = parsed;
        return parsed as T;
      } catch {
        await set(key, localVal);
        memoryCache[key] = localVal;
        return localVal as unknown as T;
      }
    }
  } catch (err) {
    console.error(`[IndexedDB] Error membaca ${key}:`, err);
  }
  return memoryCache[key] !== undefined ? memoryCache[key] : fallback;
}

/**
 * Menyimpan data ke IndexedDB (Async)
 */
export async function setDBItem<T>(key: string, value: T): Promise<void> {
  memoryCache[key] = value;
  try {
    await set(key, value);
    // Tetap sinkronkan ke localStorage sebagai backup
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    console.error(`[IndexedDB] Error menyimpan ${key}:`, err);
  }
}

/**
 * Menghapus data dari IndexedDB
 */
export async function removeDBItem(key: string): Promise<void> {
  delete memoryCache[key];
  try {
    await del(key);
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`[IndexedDB] Error menghapus ${key}:`, err);
  }
}

/**
 * Pembacaan Synchronous dari Memory Cache / LocalStorage (untuk fallback cepat)
 */
export function getSyncItem<T>(key: string, fallback: T): T {
  if (memoryCache[key] !== undefined) {
    return memoryCache[key] as T;
  }
  const localVal = localStorage.getItem(key);
  if (localVal !== null) {
    try {
      return JSON.parse(localVal);
    } catch {
      return localVal as unknown as T;
    }
  }
  return fallback;
}
