# Motorku Tracker (MOTO-LOG) 🛵⛽

**Motorku Tracker** adalah aplikasi web modern (*Progressive Web App*) untuk mencatat, mengelola, dan menganalisis seluruh riwayat perawatan motor, pengisian bahan bakar (BBM), pergantian oli, serta biaya servis kendaraan secara akurat dan real-time.

Aplikasi ini dibangun dengan pendekatan **Offline-First** (IndexedDB / LocalStorage + PWA Service Worker) serta mendukung sinkronisasi cloud otomatis di latar belakang (*silent background sync*) menggunakan Supabase, notifikasi pengingat via Telegram Bot API, ekspor laporan (CSV & PDF), serta kemudahan instalasi di perangkat mobile (Android/iOS) via Capacitor.

---

## 🌟 Fitur Utama

### 1. 📊 Dashboard Performa & Ringkasan Perawatan
- **Status Kesehatan Oli**: Indikator visual persentase kondisi oli berdasarkan sisa kilometer dan sisa hari sebelum penggantian berikutnya.
- **Filter Periode Kustom**: Pilihan filter tanggal fleksibel (Mingguan 7 Hari, Bulan Ini, 30 Hari, 3 Bulan, Tahun Ini, Semua Data, atau tanggal kustom *Start & End Date*).
- **Ringkasan Operasional**: Kalkulasi otomatis total pengeluaran (BBM + Oli + Servis), total jarak tempuh, serta rata-rata efisiensi bahan bakar (km/Liter).
- **Grafik Interaktif**: Visualisasi tren pengeluaran bulanan dan perbandingan efisiensi BBM menggunakan grafik Recharts yang interaktif.

### 2. 🛢️ Manajemen Log Ganti Oli (Oil Logs)
- Pencatatan tanggal ganti oli, odometer (km), merek & tipe oli, total biaya, dan penilaian (rating) performa oli.
- Perhitungan otomatis estimasi tanggal dan kilometer ganti oli berikutnya berdasarkan interval kustom pengguna.
- Riwayat penggantian oli lengkap dengan filter dan pengurutan.

### 3. ⛽ Log BBM & Analisis Efisiensi Konsumsi (Fuel Logs)
- Pencatatan pengisian BBM: tanggal, jenis bahan bakar (Pertalite, Pertamax, Shell, dll), volume (Liter), total biaya, dan posisi odometer.
- Kalkulasi otomatis efisiensi konsumsi BBM dalam satuan **km/Liter** antar pengisian.
- Ringkasan statistik BBM: total konsumsi liter, total biaya BBM, dan jarak yang berhasil ditempuh.

### 4. 🛠️ Log Servis & Perbaikan (Service Logs)
- Pencatatan riwayat servis berkala, perbaikan sparepart, lokasi bengkel, deskripsi pekerjaan, dan rincian biaya servis.
- Membantu pemilik kendaraan melacak riwayat perbaikan komponen motor secara terperinci.

### 5. 📲 Notifikasi Pengingat via Telegram Bot
- Peringatan otomatis yang dikirim langsung ke obrolan Telegram pengguna saat jadwal ganti oli mendekati batas limit (baik batas sisa kilometer maupun sisa hari).
- Konfigurasi mudah langsung melalui menu Pengaturan (Bot Token & Chat ID).

### 6. ☁️ Offline-First & Silent Background Sync (Supabase)
- **Offline-First & PWA**: Data disimpan terlebih dahulu secara lokal di `IndexedDB` & `localStorage` via PWA Service Worker, sehingga aplikasi berfungsi 100% tanpa jaringan internet.
- **Silent Background Sync**: Sinkronisasi data ke Supabase Cloud berjalan secara latar belakang (*background sync*) tanpa mengganggu navigasi pengguna. Dukungan otentikasi pengguna via Supabase Auth.

### 7. 📄 Ekspor Data & Cetak Laporan
- **Ekspor CSV**: Mengunduh seluruh data riwayat (Oli, BBM, Servis) ke dalam format spreadsheet CSV.
- **Cetak Dokumen PDF**: Mengenerate laporan ringkas riwayat perawatan yang siap dicetak atau disimpan sebagai PDF.

### 8. 🌗 Tema & Antarmuka Modern
- Desain antarmuka bersih dan responsif berbasis **Tailwind CSS v4** & **Motion (Framer Motion)**.
- Dukungan **Mode Terang (Light Mode)** dan **Mode Gelap (Dark Mode)** dengan transisi halus.

---

## 🛠️ Teknologi & Dependensi

- **Frontend Core**: React 19, TypeScript, Vite
- **Styling & UI**: Tailwind CSS v4, Lucide React Icons
- **Animasi & Visualisasi**: Motion (`motion/react`), Recharts
- **Penyimpanan Local & Cloud**: IndexedDB (`idb-keyval`), Supabase JS Client (`@supabase/supabase-js`)
- **PWA & Native Support**: Web App Manifest, Service Worker, `@capacitor/core` & `@capacitor/cli`
- **Layanan Eksternal**: Telegram Bot API Integration, Google GenAI SDK (`@google/genai`)

---

## 📁 Struktur Proyek

```
moto/
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx        # Visualisasi grafik, status oli, & statistik utama
│   │   ├── OilLogs.tsx          # Form & daftar riwayat ganti oli
│   │   ├── FuelLogs.tsx         # Form & daftar riwayat pengisian BBM
│   │   ├── ServiceLogs.tsx      # Form & daftar riwayat servis kendaraan
│   │   ├── SettingsTab.tsx      # Pengaturan Telegram, Cloud Supabase, & interval
│   │   └── ToastContainer.tsx   # Sistem notifikasi toast & dialog konfirmasi UI
│   ├── lib/
│   │   ├── dbStorage.ts         # Wrapper penyimpanan IndexedDB (Offline-First)
│   │   └── supabaseClient.ts    # Klien Supabase & logika sinkronisasi background
│   ├── utils/
│   │   ├── export.ts            # Modul generator dokumen CSV & cetak PDF
│   │   ├── telegram.ts          # Integrasi notifikasi Telegram Bot API
│   │   └── uuid.ts              # Generator unik UUID v4
│   ├── types.ts                 # Antarmuka (interfaces) & definisi tipe TypeScript
│   ├── App.tsx                  # Komponen utama, pengatur state & navigasi
│   ├── index.css                # Konfigurasi Tailwind CSS & gaya global
│   └── main.tsx                 # Entry point aplikasi Vite
├── public/
│   ├── sw.js                    # Service Worker untuk PWA Offline caching
│   └── manifest.json            # Web App Manifest PWA
├── capacitor.config.json        # Konfigurasi Capacitor untuk build Android/iOS
├── vite.config.ts               # Konfigurasi bundler Vite
├── package.json                 # Manajemen paket & dependensi
└── README.md                    # Dokumentasi proyek
```

---

## 🚀 Cara Menjalankan Proyek

### 1. Prasyarat
Pastikan Anda telah memasang **Node.js** (versi 18 atau yang lebih baru) serta package manager **npm** / **bun**.

### 2. Instalasi Dependensi
Jalankan perintah berikut di terminal:
```bash
npm install
```

### 3. Menjalankan Mode Pengembang (Development)
Untuk menguji aplikasi secara lokal:
```bash
npm run dev
```
Buka peramban web dan akses alamat: `http://localhost:3000`.

### 4. Melakukan Type Checking & Linting
```bash
npm run lint
```

### 5. Melakukan Compiling / Build Produksi
Untuk menghasilkan berkas bundel siap rilis di folder `dist/`:
```bash
npm run build
```

---

## ⚙️ Konfigurasi Environment Variables (Opsional)

Buat berkas `.env` berdasar `.env.example` apabila Anda ingin mengonfigurasi kredensial Supabase secara default:

```env
VITE_SUPABASE_URL=https://proyek-anda.supabase.co
VITE_SUPABASE_ANON_KEY=anon-key-supabse-anda
```

---

## 📄 Lisensi

Proyek ini dikembangkan sebagai solusi manajemen dan pelacakan perawatan kendaraan pribadi yang independen, efisien, dan andal.


