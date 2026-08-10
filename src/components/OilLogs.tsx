import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { OilLog, AppSettings, Jarak } from '../types';
import { formatIDR } from '../utils/export';
import { fetchJarakRecords } from '../lib/supabaseClient';
import { getSyncItem, getDBItem } from '../lib/dbStorage';
import { useToast } from './ToastContainer';
import {
  Plus, Trash2, Edit3, Calendar, Wrench, Star, X, ArrowUpDown, AlertCircle,
  Droplets, Gauge, DollarSign, Clock, Shield, Award, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OilLogsProps {
  logs: OilLog[];
  onAddLog: (log: Omit<OilLog, 'id'>) => void;
  onEditLog: (id: string, updatedLog: Partial<OilLog>) => void;
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

// ─── Component ───────────────────────────────────────────────────────────────
// Komponen utama untuk mengelola pencatatan riwayat ganti oli kendaraan.
// Mendukung penambahan, pengeditan, penghapusan, pencarian, dan filter data oli.
export default function OilLogs({ logs, onAddLog, onEditLog, onDeleteLog, settings }: OilLogsProps) {
  const { showToast, showConfirm } = useToast();

  // State lokal untuk manajemen modal form (Tambah/Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);
  
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
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (log: OilLog) => {
    setEditingId(log.id);
    setDate(log.date);
    setCost(log.cost);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cNumInput = Number(cost);
    if (cost === '' || isNaN(cNumInput) || cNumInput < 0) {
      setFormError('Biaya ganti oli tidak boleh bernilai negatif.');
      return;
    }

    // Support both thousands input (e.g. 50 -> 50.000) and full Rupiah (e.g. 50000 -> 50.000)
    const actualCost = (cNumInput > 0 && cNumInput < 1000) ? cNumInput * 1000 : cNumInput;

    let mNum = 0;
    if (editingId) {
      const existing = logs.find(l => l.id === editingId);
      mNum = existing ? existing.mileage : 0;
    } else {
      mNum = logs.length > 0 ? Math.max(...logs.map(l => l.mileage)) : 0;
    }
    const logData = { date, mileage: mNum, cost: actualCost, oil_brand: 'Yamalube', oil_type: 'Yamalube Standard', notes: '', rating: 5 };
    if (editingId) {
      onEditLog(editingId, logData);
      showToast('Catatan ganti oli berhasil diperbarui.', 'success', 'Oli Disimpan');
    } else {
      onAddLog(logData);
      showToast('Catatan ganti oli baru berhasil ditambahkan!', 'success', 'Oli Ditambah');
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

  // Jarak tempuh records from local DB (IndexedDB) & Supabase
  const [jarakRecords, setJarakRecords] = useState<Jarak[]>(() => {
    return getSyncItem<Jarak[]>('oil_tracker_jarak', []);
  });

  useEffect(() => {
    getDBItem<Jarak[]>('oil_tracker_jarak', []).then(cached => {
      if (cached && cached.length > 0) setJarakRecords(cached);
    });
    fetchJarakRecords().then(({ records }) => {
      if (records && records.length > 0) {
        setJarakRecords(records);
      }
    });
  }, []);

  // Stats
  const totalOilCost = logs.reduce((s, l) => s + l.cost, 0);

  // Total jarak sejak ganti oli terakhir (atau total jarak tempuh jika belum pernah ganti oli)
  const distanceSinceLastOil = useMemo(() => {
    if (logs.length === 0) {
      return jarakRecords.reduce((sum, r) => sum + Number(r.total_km || 0), 0);
    }

    const sortedByDate = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestOil = sortedByDate[0];
    const latestOilDateStr = latestOil.date.includes('T') ? latestOil.date.split('T')[0] : latestOil.date;

    const sumJarak = jarakRecords
      .filter(r => {
        const rDateStr = r.date.includes('T') ? r.date.split('T')[0] : r.date;
        return rDateStr >= latestOilDateStr;
      })
      .reduce((sum, r) => sum + Number(r.total_km || 0), 0);

    return sumJarak;
  }, [logs, jarakRecords]);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5 md:space-y-6 px-0 md:px-1">
      {/* ════════════════════ 1. HERO HEADER ════════════════════ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 text-white shadow-2xl shadow-indigo-600/20 dark:shadow-black/40">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        <div className="relative z-10 p-5 md:p-7 lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl ring-1 ring-white/20">
                <Wrench className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-display">
                  Ganti Oli
                </h1>
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.93 }}
                  id="btn-add-oil-log"
                  onClick={handleOpenAdd}
                  title="Catat Ganti Oli"
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
              { icon: Droplets, label: 'Total Servis', value: `${logs.length}x ganti` },
              { icon: DollarSign, label: 'Total Biaya', value: formatIDR(totalOilCost) },
              { icon: Shield, label: 'Merek Populer', value: logs.length > 0 ? logs[0].oil_brand : '-' },
              { icon: Gauge, label: 'Jarak Terakhir', value: `${distanceSinceLastOil.toLocaleString('id-ID')} km` },
            ].map((item, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <div className="flex items-center gap-2 text-indigo-200/70 text-[11px] font-medium tracking-wider mb-1">
                  <item.icon className="w-3 h-3" />
                  {item.label}
                </div>
                <span className="text-sm md:text-base font-bold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ════════════════════ 2. FILTERS BAR ════════════════════ */}
      <motion.div variants={fadeUp} className="flex justify-end gap-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          id="oil-sort-toggle"
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl py-2.5 px-3 text-sm shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
        >
          <ArrowUpDown className="w-4 h-4 text-indigo-500" />
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
              id="oil-form-modal"
              className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-slate-800/80 dark:to-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    <Wrench className="w-4 h-4" />
                  </div>
                  {editingId ? 'Edit Catatan Ganti Oli' : 'Catat Ganti Oli'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    id="btn-submit-oil-header"
                    type="submit"
                    form="oil-form"
                    className="p-1.5 text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/40 rounded-lg transition-colors cursor-pointer"
                    title={editingId ? 'Simpan Perubahan' : 'Simpan Catatan'}
                  >
                    <Save className="w-5 h-5" />
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    id="close-oil-form"
                    onClick={resetForm}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>

              <form id="oil-form" onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
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
                      Tanggal Ganti
                    </label>
                    <input
                      id="oil-date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full py-2.5 px-3.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold tracking-wider text-slate-400 mb-1.5">
                      Biaya Ganti Oli (Rp)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold text-sm">Rp</span>
                      <input
                        id="oil-cost"
                        type="number"
                        required
                        placeholder="Contoh: 50 (50 ribu) atau 50000"
                        value={cost}
                        onChange={(e) => setCost(e.target.value ? Number(e.target.value) : '')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold transition-all"
                      />
                    </div>
                    {cost !== '' && Number(cost) >= 0 && (() => {
                      const rawC = Number(cost);
                      const actC = (rawC > 0 && rawC < 1000) ? rawC * 1000 : rawC;
                      return (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-[12px] text-indigo-600 dark:text-indigo-400 mt-2 font-medium flex items-center gap-1.5"
                        >
                          <Wrench className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Sama dengan <b>Rp {actC.toLocaleString('id-ID')}</b>
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
            <Wrench className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="font-bold text-base text-slate-500 dark:text-slate-400">Belum Ada Riwayat Ganti Oli</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">Catat penggantian oli pertama Anda untuk mulai melacak riwayat perawatan.</p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleOpenAdd}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4 inline mr-1" /> Catat Ganti Oli
          </motion.button>
        </motion.div>
      ) : (
        <>
          {/* Summary Bar */}
          <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
            {[
              { icon: DollarSign, label: 'Total Biaya Oli', value: formatIDR(totalOilCost), color: 'indigo' },
              { icon: Gauge, label: 'Jarak Terakhir', value: `${distanceSinceLastOil.toLocaleString('id-ID')} km`, color: 'violet' },
              { icon: Award, label: 'Total Servis', value: `${logs.length}x`, color: 'indigo' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                variants={scaleIn}
                className={`p-3 rounded-xl border text-center ${
                  stat.color === 'indigo'
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-100/60 dark:border-indigo-900/30'
                    : 'bg-violet-50/60 dark:bg-violet-950/20 border-violet-100/60 dark:border-violet-900/30'
                }`}
              >
                <stat.icon className={`w-4 h-4 mx-auto mb-1 ${
                  stat.color === 'indigo' ? 'text-indigo-500' : 'text-violet-500'
                }`} />
                <span className="block text-[10px] font-semibold tracking-wider text-slate-400">{stat.label}</span>
                <span className="text-sm md:text-base font-extrabold text-slate-800 dark:text-white">{stat.value}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Tabel Riwayat Ganti Oli */}
          <motion.div variants={fadeUp} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Tanggal</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Merek / Tipe</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Jarak Tempuh</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Biaya</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Performa</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Catatan</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">{log.oil_brand}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{log.oil_type}</div>
                      </td>
                      <td className="p-4 text-sm font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {log.mileage.toLocaleString('id-ID')} km
                      </td>
                      <td className="p-4 text-sm font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {formatIDR(log.cost)}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="flex items-center gap-0.5 text-amber-500 font-bold text-sm">
                          {log.rating || 5} <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                        </span>
                      </td>
                      <td className="p-4">
                        {log.notes ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400 max-w-[150px] truncate italic" title={log.notes}>
                            &ldquo;{log.notes}&rdquo;
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(log)}
                            className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/60 rounded-lg transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              showConfirm({
                                title: 'Hapus Catatan Oli',
                                message: 'Apakah Anda yakin ingin menghapus catatan ganti oli tanggal ' + (log.date || '') + '?',
                                confirmText: 'Ya, Hapus',
                                cancelText: 'Batal',
                                type: 'danger',
                                onConfirm: () => {
                                  onDeleteLog(log.id);
                                  showToast('Catatan ganti oli berhasil dihapus.', 'info', 'Dihapus');
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
