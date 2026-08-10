import { useState, useMemo, type FormEvent } from 'react';
import { FuelLog, AppSettings } from '../types';
import { formatIDR } from '../utils/export';
import { fetchJarakRecords } from '../lib/supabaseClient';
import { useToast } from './ToastContainer';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import {
  Plus, Trash2, Edit3, Calendar, Fuel, X, ArrowUpDown, AlertCircle, Sparkles,
  TrendingUp, Droplets, DollarSign, Gauge, Clock, Satellite, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FuelLogsProps {
  logs: FuelLog[];
  onAddLog: (log: Omit<FuelLog, 'id'>) => void;
  onEditLog: (id: string, updatedLog: Partial<FuelLog>) => void;
  onDeleteLog: (id: string) => void;
  settings: AppSettings;
}

// ─── Animation Variants ──────────────────────────────────────────────────────
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const gpsIndicator = <Satellite className="w-2.5 h-2.5 text-cyan-500 shrink-0" />;

const getEfficiencyBadge = (eff: number | undefined) => {
  if (!eff) return (
    <span 
      className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-full font-semibold"
      title="Sistem membutuhkan minimal 2 catatan pengisian BBM atau data jarak harian untuk menghitung efisiensi (km/L)"
    >
      BBM Pertama / Data Awal
    </span>
  );
  if (eff > 45) return (
    <span className="text-[11px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 border border-emerald-200/60 dark:border-emerald-900/30">
      <Sparkles className="w-3 h-3" /> Sangat Irit ({eff.toFixed(1)} km/L)
      <span className="inline-flex items-center gap-1 text-[9px] text-emerald-500/70 dark:text-emerald-400/60 ml-0.5 border-l border-emerald-200/50 dark:border-emerald-800/30 pl-2">
        {gpsIndicator} GPS
      </span>
    </span>
  );
  if (eff > 35) return (
    <span className="text-[11px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 border border-amber-200/60 dark:border-amber-900/30">
      Normal ({eff.toFixed(1)} km/L)
      <span className="inline-flex items-center gap-1 text-[9px] text-amber-500/70 dark:text-amber-400/60 ml-0.5 border-l border-amber-200/50 dark:border-amber-800/30 pl-2">
        {gpsIndicator} GPS
      </span>
    </span>
  );
  return (
    <span className="text-[11px] bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 border border-rose-200/60 dark:border-rose-900/30">
      Boros ({eff.toFixed(1)} km/L)
      <span className="inline-flex items-center gap-1 text-[9px] text-rose-500/70 dark:text-rose-400/60 ml-0.5 border-l border-rose-200/50 dark:border-rose-800/30 pl-2">
        {gpsIndicator} GPS
      </span>
    </span>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────
// Komponen utama untuk mengelola pencatatan riwayat pembelian BBM kendaraan.
// Menghitung dan melacak efisiensi konsumsi bahan bakar (km/L) berdasarkan data perjalanan.
export default function FuelLogs({ logs, onAddLog, onEditLog, onDeleteLog, settings }: FuelLogsProps) {
  const { showToast, showConfirm } = useToast();

  // State lokal untuk manajemen modal form (Tambah/Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [effCalculating, setEffCalculating] = useState(false); // Status kalkulasi efisiensi
  
  // State lokal untuk urutan
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  // State untuk paginasi
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setCost('');
    setFormError(null);
    setEditingId(null);
    setIsFormOpen(false);
    setEffCalculating(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (log: FuelLog) => {
    setEditingId(log.id);
    setDate(log.date);
    setCost(log.cost);
    setFormError(null);
    setIsFormOpen(true);
  };

  const calculateEfficiencyFromJarak = async (
    currentDate: string,
    currentLiters: number
  ): Promise<number | undefined> => {
    // Find previous fuel log chronologically (excluding the log currently being edited)
    const sortedLogs = [...logs]
      .filter(l => l.id !== editingId)
      .sort((a, b) => a.date.localeCompare(b.date));

    let prevLog: FuelLog | null = null;
    for (let i = sortedLogs.length - 1; i >= 0; i--) {
      if (sortedLogs[i].date <= currentDate) {
        prevLog = sortedLogs[i];
        break;
      }
    }

    // Fetch jarak records from Supabase / local DB
    const { records, error } = await fetchJarakRecords();
    let totalKm = 0;

    if (!error && records && records.length > 0) {
      if (prevLog) {
        const startDate = prevLog.date;
        const endDate = currentDate;
        totalKm = records
          .filter(r => r.date >= startDate && r.date <= endDate)
          .reduce((sum, r) => sum + r.total_km, 0);
      } else {
        // First fuel log ever: sum all jarak records recorded up to currentDate
        totalKm = records
          .filter(r => r.date <= currentDate)
          .reduce((sum, r) => sum + r.total_km, 0);
      }
    }

    // Fallback if no jarak table records exist: use odometer mileage difference if available
    if (totalKm <= 0 && prevLog && prevLog.mileage > 0) {
      const currentMileages = logs
        .filter(l => l.id === editingId)
        .map(l => l.mileage)
        .filter(m => typeof m === 'number' && isFinite(m) && m > prevLog!.mileage);
      if (currentMileages.length > 0) {
        totalKm = Math.max(...currentMileages) - prevLog.mileage;
      }
    }

    if (totalKm > 0 && currentLiters > 0) {
      const result = Number((totalKm / currentLiters).toFixed(2));
      return isFinite(result) && !isNaN(result) ? result : undefined;
    }
    return undefined;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cNumInput = Number(cost);
    if (!cost || cNumInput <= 0) {
      setFormError('Biaya pembelian bbm (Rp) harus lebih besar dari 0.');
      return;
    }

    // Support both thousands input (e.g. 20 -> 20.000) and full Rupiah (e.g. 20000 -> 20.000)
    const actualCost = cNumInput < 1000 ? cNumInput * 1000 : cNumInput;

    const rawFuelPrice = settings?.fuelPricePerLiter || 10000;
    const actualPricePerLiter = rawFuelPrice < 1000 ? rawFuelPrice * 1000 : rawFuelPrice;

    const calculatedLiters = Number((actualCost / actualPricePerLiter).toFixed(2));
    const lNum = calculatedLiters > 0 ? calculatedLiters : 0.01;

    // Calculate efficiency using jarak table
    setEffCalculating(true);
    const rawEfficiency = await calculateEfficiencyFromJarak(date, lNum);
    const efficiency = (rawEfficiency !== undefined && isFinite(rawEfficiency) && !isNaN(rawEfficiency)) ? rawEfficiency : undefined;
    setEffCalculating(false);

    // Set mileage to max existing valid mileage (or 0 if none)
    const validMileages = logs.map(l => l.mileage).filter(m => typeof m === 'number' && isFinite(m) && m >= 0);
    const mNum = validMileages.length > 0 ? Math.max(...validMileages) : 0;

    const logData = { date, mileage: mNum, liters: lNum, cost: actualCost, fuel_type: 'Pertalite', notes: '', efficiency };
    if (editingId) {
      onEditLog(editingId, logData);
      showToast('Catatan pembelian BBM berhasil diperbarui.', 'success', 'BBM Disimpan');
    } else {
      onAddLog(logData);
      showToast('Catatan pembelian BBM baru berhasil ditambahkan!', 'success', 'BBM Ditambah');
    }
    resetForm();
    setIsFormOpen(false);
  };

  // Sorting
  const sortedLogs = [...logs].sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? tB - tA : tA - tB;
  });

  // Paginasi
  const totalPages = Math.ceil(sortedLogs.length / ITEMS_PER_PAGE);
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages || 1);
  const paginatedLogs = sortedLogs.slice((validCurrentPage - 1) * ITEMS_PER_PAGE, validCurrentPage * ITEMS_PER_PAGE);

  // Stats
  const totalFuelCost = logs.reduce((s, l) => s + l.cost, 0);
  const totalLiters = logs.reduce((s, l) => s + l.liters, 0);
  const logsWithEff = logs.filter(l => l.efficiency && l.efficiency > 0);
  const avgEff = logsWithEff.length > 0
    ? logsWithEff.reduce((s, l) => s + (l.efficiency || 0), 0) / logsWithEff.length
    : 0;

  // Chart Data & Tooltip Style
  const chartTooltipStyle = {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderRadius: '12px',
    color: '#f8fafc',
    fontSize: '12px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
  };

  const efficiencyChartData = [...logs]
    .filter(l => l.efficiency && l.efficiency > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(l => ({
      date: new Date(l.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      'Efisiensi (km/L)': Number((l.efficiency || 0).toFixed(1)),
      'Rata-rata': Number(avgEff.toFixed(1)),
    }));

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5 md:space-y-6 px-0 md:px-1">
      {/* ════════════════════ 1. HERO HEADER ════════════════════ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 dark:from-slate-900 dark:via-emerald-950 dark:to-slate-900 text-white shadow-2xl shadow-emerald-600/20 dark:shadow-black/40">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        <div className="relative z-10 p-5 md:p-7 lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl ring-1 ring-white/20">
                <Fuel className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-display">
                  Pencatatan BBM
                </h1>
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.93 }}
                  id="btn-add-fuel-log"
                  onClick={handleOpenAdd}
                  title="Catat BBM"
                  className="p-1.5 md:p-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl transition-all cursor-pointer border border-white/15 shadow-md flex items-center justify-center shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </div>

          {/* Mini stats row */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Droplets, label: 'Total Liter', value: `${totalLiters.toFixed(1)} L` },
              { icon: DollarSign, label: 'Total Biaya', value: formatIDR(totalFuelCost) },
              { icon: TrendingUp, label: 'Rata-rata Efisiensi', value: avgEff > 0 ? `${avgEff.toFixed(1)} km/L` : '-', sub: avgEff > 0 ? 'via GPS' : '' },
              { icon: Gauge, label: 'Total Pencatatan', value: `${logs.length}x isi` },
            ].map((item, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <div className="flex items-center gap-2 text-emerald-200/70 text-[11px] font-medium tracking-wider mb-1">
                  <item.icon className="w-3 h-3" />
                  {item.label}
                </div>
                <span className="text-sm md:text-base font-bold flex items-center gap-1">
                  {item.value}
                  {item.sub && (
                    <span className="inline-flex items-center gap-0.5 text-[8px] font-medium text-emerald-300/80 dark:text-emerald-400/60">
                      <Satellite className="w-2.5 h-2.5" />
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ════════════════════ 1.5. RECHARTS EFFICIENCY TREND CHART ════════════════════ */}
      <motion.div variants={fadeUp} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-base font-display">
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              Efisiensi BBM (km/L)
            </h3>
          </div>
          {avgEff > 0 && (
            <span className="self-start sm:self-auto text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
              Rata-rata: {avgEff.toFixed(1)} km/L
            </span>
          )}
        </div>

        <div className="h-64 w-full pt-2">
          {efficiencyChartData.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/30">
              <Fuel className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Belum Ada Data Efisiensi</p>
              <p className="text-xs text-slate-400 mt-1 text-center max-w-sm">
                Catat minimal 2 pengisian BBM untuk menampilkan grafik tren efisiensi
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={efficiencyChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" strokeOpacity={0.6} />
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" strokeOpacity={0.3} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ fontWeight: 'bold', color: '#cbd5e1', marginBottom: 6 }}
                  itemStyle={{ padding: '2px 0' }}
                />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="Efisiensi (km/L)"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ fill: '#10b981', r: 4, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="Rata-rata"
                  stroke="#f43f5e"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* ════════════════════ 2. FILTERS BAR ════════════════════ */}
      <motion.div variants={fadeUp} className="flex justify-end gap-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          id="fuel-sort-toggle"
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl py-2.5 px-3 text-sm shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
        >
          <ArrowUpDown className="w-4 h-4 text-emerald-500" />
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {sortOrder === 'desc' ? 'Terbaru' : 'Terlama'}
        </motion.button>
      </motion.div>

      {/* ════════════════════ 3. FORM MODAL ════════════════════ */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              id="fuel-form-modal"
              className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-800/80 dark:to-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                    <Fuel className="w-4 h-4" />
                  </div>
                  {editingId ? 'Edit Catatan BBM' : 'Catat BBM'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    id="btn-submit-fuel-header"
                    type="submit"
                    form="fuel-form"
                    className="p-1.5 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40 rounded-lg transition-colors cursor-pointer"
                    title={editingId ? 'Simpan Perubahan' : 'Simpan Catatan'}
                  >
                    <Save className="w-5 h-5" />
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    id="close-fuel-form"
                    onClick={resetForm}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>

              <form id="fuel-form" onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <AnimatePresence>
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-sm flex gap-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-wider text-slate-400 mb-1.5">
                      Tanggal Pembelian
                    </label>
                    <input
                      id="fuel-date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full py-2.5 px-3.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold tracking-wider text-slate-400 mb-1.5">
                      Biaya Pembelian (Rp)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold text-sm">Rp</span>
                      <input
                        id="fuel-cost"
                        type="number"
                        required
                        placeholder="Contoh: 20 (20 ribu) atau 20000"
                        value={cost}
                        onChange={(e) => setCost(e.target.value ? Number(e.target.value) : '')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-sm font-semibold transition-all"
                      />
                    </div>
                    {cost && Number(cost) > 0 && (() => {
                      const rawC = Number(cost);
                      const actC = rawC < 1000 ? rawC * 1000 : rawC;
                      const rawP = settings?.fuelPricePerLiter || 10000;
                      const actP = rawP < 1000 ? rawP * 1000 : rawP;
                      const calculatedLiters = (actC / actP).toFixed(2);
                      return (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-2 font-medium flex items-center gap-1.5"
                        >
                          <Droplets className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Sama dengan <b>Rp {actC.toLocaleString('id-ID')}</b> &rarr; Otomatis <b>{calculatedLiters} Liter</b> Pertalite
                          </span>
                        </motion.p>
                      );
                    })()}
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════ 4. LOGS GRID ════════════════════ */}
      {sortedLogs.length === 0 ? (
        <motion.div variants={fadeUp} className="text-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm flex flex-col items-center justify-center">
          <div className="p-4 rounded-full bg-slate-50 dark:bg-slate-800/50 mb-4">
            <Fuel className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="font-bold text-base text-slate-500 dark:text-slate-400">Belum Ada Riwayat BBM</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">Catat BBM pertama Anda untuk mulai melacak konsumsi dan efisiensi.</p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleOpenAdd}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4 inline mr-1" /> Catat BBM
          </motion.button>
        </motion.div>
      ) : (
        <>
          {/* Summary Bar */}
          <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
            {[
              { icon: Droplets, label: 'Total Liter', value: `${totalLiters.toFixed(1)} L`, color: 'blue' },
              { icon: DollarSign, label: 'Total Biaya', value: formatIDR(totalFuelCost), color: 'emerald' },
              { icon: TrendingUp, label: 'Rata-rata Efisiensi', value: avgEff > 0 ? `${avgEff.toFixed(1)} km/L` : '-', color: 'amber' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                variants={scaleIn}
                className={`p-3 rounded-xl border text-center ${
                  stat.color === 'blue'
                    ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-100/60 dark:border-blue-900/30'
                    : stat.color === 'emerald'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100/60 dark:border-emerald-900/30'
                      : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-100/60 dark:border-amber-900/30'
                }`}
              >
                <stat.icon className={`w-4 h-4 mx-auto mb-1 ${
                  stat.color === 'blue' ? 'text-blue-500' : stat.color === 'emerald' ? 'text-emerald-500' : 'text-amber-500'
                }`} />
                <span className="block text-[10px] font-semibold tracking-wider text-slate-400">{stat.label}</span>
                <span className="text-sm md:text-base font-extrabold text-slate-800 dark:text-white">{stat.value}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Tabel Riwayat BBM */}
          <motion.div variants={fadeUp} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Tanggal</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Jenis BBM</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Volume (L)</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Jarak Tempuh</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Biaya</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Efisiensi / Info</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-4 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {log.fuel_type}
                      </td>
                      <td className="p-4 text-sm font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {log.liters.toLocaleString('id-ID')} L
                      </td>
                      <td className="p-4 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {log.efficiency && log.liters > 0
                          ? Math.round(log.efficiency * log.liters).toLocaleString('id-ID')
                          : log.mileage > 0
                          ? log.mileage.toLocaleString('id-ID')
                          : '-'} km
                      </td>
                      <td className="p-4 text-sm font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {formatIDR(log.cost)}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {getEfficiencyBadge(log.efficiency)}
                        {log.notes && (
                          <div className="text-[10px] text-slate-400 max-w-[150px] truncate mt-1 italic" title={log.notes}>
                            &ldquo;{log.notes}&rdquo;
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(log)}
                            className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/60 rounded-lg transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              showConfirm({
                                title: 'Hapus Catatan BBM',
                                message: 'Apakah Anda yakin ingin menghapus catatan pembelian BBM tanggal ' + (log.date || '') + '?',
                                confirmText: 'Ya, Hapus',
                                cancelText: 'Batal',
                                type: 'danger',
                                onConfirm: () => {
                                  onDeleteLog(log.id);
                                  showToast('Catatan BBM berhasil dihapus.', 'info', 'Dihapus');
                                }
                              });
                            }}
                            className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-900/30 dark:hover:bg-rose-900/60 rounded-lg transition-colors cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Halaman <span className="font-bold">{validCurrentPage}</span> dari <span className="font-bold">{totalPages}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={validCurrentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Sebelumnya
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={validCurrentPage === totalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
