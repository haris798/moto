# Motorku Tracker (MOTO-LOG) 🛵⛽

**Motorku Tracker** adalah aplikasi web modern untuk melacak riwayat perawatan motor, jadwal ganti oli, pengisian bahan bakar (BBM), serta menganalisis efisiensi konsumsi BBM kendaraan secara akurat dan real-time.

Aplikasi ini dirancang dengan pendekatan *Offline-First* serta mendukung sinkronisasi cloud melalui Supabase dan pengiriman notifikasi pengingat servis otomatis via Telegram Bot.

---

## 🌟 Fitur Utama

### 1. 📊 Dashboard Performa & Ringkasan Perawatan
- **Status Kesehatan Oli**: Indikator persentase kondisi oli berdasarkan sisa kilometer dan sisa hari.
- **Statistik Pengeluaran**: Ringkasan total biaya pengisian BBM dan ganti oli dalam rentang waktu yang dipilih.
- **Ringkasan Jarak Tempuh**: Estimasi penggunaan harian dan total jarak kendaraan.

### 2. 🛢️ Pencatatan Servis & Ganti Oli
- Pencatatan tanggal servis, jarak tempuh (km), merek & tipe oli, biaya, dan rating performa oli.
- Perhitungan otomatis tanggal dan kilometer untuk ganti oli berikutnya berdasarkan interval kustom.
- Dukungan kemudahan input nominal biaya (misal input `50` untuk 50.000 Rupiah).

### 3. ⛽ Log BBM & Analisis Efisiensi Konsumsi
- Pencatatan tanggal pembelian BBM, jenis bahan bakar (Pertalite, Pertamax, dll), volume (Liter), dan total biaya.
- Kalkulasi otomatis efisiensi konsumsi BBM dalam satuan **km/Liter**.
- Grafik interaktif tren efisiensi dan riwayat pembelian BBM.

### 4. 📲 Notifikasi Pengingat Telegram Bot
- Pengiriman peringatan otomatis langsung ke aplikasi Telegram ketika kendaraan mendekati interval ganti oli (berdasarkan kilometer atau sisa hari).
- Konfigurasi langsung via tab Pengaturan.

### 5. ☁️ Offline-First & Sinkronisasi Cloud (Supabase)
- **Offline-First**: Seluruh data tersimpan dengan aman di media penyimpanan lokal browser (`localStorage`) sehingga aplikasi dapat digunakan tanpa koneksi internet.
- **Supabase Cloud Sync**: Sinkronisasi data otomatis atau manual saat terhubung ke internet untuk pencadangan data antar perangkat.

### 6. 📄 Ekspor & Laporan
- Ekspor seluruh catatan riwayat ke format **CSV** (dapat dibuka di Microsoft Excel / Google Sheets).
- Cetak laporan riwayat perawatan dalam format dokumen **PDF**.

### 7. 🌗 Tema & Tampilan
- Antarmuka bersih, responsif, dan fleksibel untuk tampilan Desktop maupun Mobile.
- Dukungan **Mode Terang (Light Mode)** dan **Mode Gelap (Dark Mode)**.

---

## 🛠️ Teknologi & Library

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4, Lucide React (Ikon)
- **Animasi & Grafik**: Motion (`motion/react`), Recharts
- **Database & Auth**: Supabase JS Client (`@supabase/supabase-js`)
- **Utilitas**: Custom UUID, CSV & PDF Generator, Telegram Bot API Integration

---

## 🚀 Cara Menjalankan Proyek

### 1. Prasyarat
Pastikan Anda telah menginstal **Node.js** (versi 18 ke atas) di perangkat Anda.

### 2. Instalasi Dependency
```bash
npm install
```

### 3. Menjalankan Mode Pengembang (Development)
```bash
npm run dev
```
Aplikasi dapat diakses melalui peramban web di `http://localhost:3000`.

### 4. Melakukan Compiling / Build Produksi
```bash
npm run build
```

---

## 📁 Struktur Kode Utama

```
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx        # Overview status kendaraan & grafik
│   │   ├── OilLogs.tsx          # Manajemen riwayat ganti oli & form
│   │   ├── FuelLogs.tsx         # Manajemen riwayat BBM & efisiensi
│   │   └── SettingsTab.tsx      # Pengaturan Telegram, Cloud, & Interval
│   ├── lib/
│   │   └── supabaseClient.ts    # Klien & logika sinkronisasi Supabase
│   ├── utils/
│   │   ├── export.ts            # Logika ekspor file CSV & PDF
│   │   ├── telegram.ts          # Integrasi notifikasi Telegram Bot
│   │   └── uuid.ts              # Generator ID unik
│   ├── types.ts                 # Definisi tipe data & antarmuka TypeScript
│   ├── App.tsx                  # Komponen utama & manajer state aplikasi
│   └── main.tsx                 # Entry point Vite
├── package.json
└── metadata.json
```

---

## 📄 Lisensi

Proyek ini dibuat untuk manajemen dan pelacakan kendaraan pribadi secara independen dan efisien.
