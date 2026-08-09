import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { ServiceLog, AppSettings } from '../types';
import { formatIDR } from '../utils/export';
import { getDBItem, setDBItem } from '../lib/dbStorage';
import {
  Wrench, Plus, Trash2, Edit3, Calendar, Search, Gauge, DollarSign,
  ListFilter, Shield, Tag, Package, FileText, X, AlertCircle,
  ArrowUpDown, Check, Sparkles, ChevronRight, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ServiceLogsProps {
  logs: ServiceLog[];
  onAddLog: (log: Omit<ServiceLog, 'id'>) => void;
  onEditLog: (id: string, updatedLog: Partial<ServiceLog>) => void;
  onDeleteLog: (id: string) => void;
  settings: AppSettings;
}

// ─── Preset Quick Options ───────────────────────────────────────────────────
const PRESET_PARTS = [
  'Ban Depan',
  'Ban Belakang',
  'Gir Set',
  'Rantai',
  'Kampas Rem Depan',
  'Kampas Rem Belakang',
  'Aki / Battery',
  'Busi',
  'Filter Udara',
  'V-Belt',
  'Roller CVT',
  'Oli Gardan',
  'Minyak Rem',
  'Kabel Kopling/Gas',
  'Lampu / Kelistrikan',
];

const PRESET_SERVICE_TYPES = [
  'Servis Rutin',
  'Ganti Sparepart',
  'Tune Up & CVT',
  'Ganti Ban',
  'Ganti Gir Set',
  'Kelistrikan & Aki',
  'Perbaikan Mesin',
  'Lainnya'
];

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

export default function ServiceLogs({
  logs,
  onAddLog,
  onEditLog,
  onDeleteLog,
  settings
}: ServiceLogsProps) {
  // Modal Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Master Spare Parts Local Table State
  const [presetParts, setPresetParts] = useState<string[]>(PRESET_PARTS);
  const [masterPartSearch, setMasterPartSearch] = useState('');
  const [masterViewMode, setMasterViewMode] = useState<'chips' | 'table'>('chips');

  useEffect(() => {
    getDBItem<string[]>('oil_tracker_preset_parts', PRESET_PARTS).then(saved => {
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setPresetParts(saved);
      }
    });
  }, []);

  const handleAddMasterPart = (partName: string) => {
    const trimmed = partName.trim();
    if (!trimmed) return;
    if (!presetParts.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...presetParts, trimmed];
      setPresetParts(updated);
      setDBItem('oil_tracker_preset_parts', updated);
    }
  };

  const handleDeleteMasterPart = (partToDelete: string) => {
    const updated = presetParts.filter(p => p !== partToDelete);
    setPresetParts(updated);
    setDBItem('oil_tracker_preset_parts', updated);
  };

  const handleResetMasterParts = () => {
    setPresetParts(PRESET_PARTS);
    setDBItem('oil_tracker_preset_parts', PRESET_PARTS);
    setMasterPartSearch('');
  };

  const filteredMasterParts = useMemo(() => {
    if (!masterPartSearch.trim()) return presetParts;
    const q = masterPartSearch.toLowerCase();
    return presetParts.filter(p => p.toLowerCase().includes(q));
  }, [presetParts, masterPartSearch]);

  // Form Fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | ''>('');
  const [serviceType, setServiceType] = useState('Servis Rutin');
  const [description, setDescription] = useState('');
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [customPartInput, setCustomPartInput] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Delete Confirmation State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setCost('');
    setServiceType('Servis Rutin');
    setDescription('');
    setSelectedParts([]);
    setCustomPartInput('');
    setNotes('');
    setFormError(null);
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (log: ServiceLog) => {
    setEditingId(log.id);
    setDate(log.date);
    setCost(log.cost);
    setServiceType(log.service_type || 'Servis Rutin');
    setDescription(log.description || '');
    setSelectedParts(log.parts_changed || []);
    setNotes(log.notes || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleTogglePart = (partName: string) => {
    setSelectedParts(prev =>
      prev.includes(partName)
        ? prev.filter(p => p !== partName)
        : [...prev, partName]
    );
  };

  const handleRemovePart = (indexToRemove: number) => {
    setSelectedParts(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddCustomPart = () => {
    const trimmed = customPartInput.trim();
    if (trimmed) {
      if (!selectedParts.includes(trimmed)) {
        setSelectedParts(prev => [...prev, trimmed]);
      }
      handleAddMasterPart(trimmed);
      setCustomPartInput('');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const costNum = Number(cost);

    if (cost === '' || isNaN(costNum) || costNum < 0) {
      setFormError('Total biaya servis tidak boleh bernilai negatif.');
      return;
    }

    // Thousands shortcut support (e.g. 150 -> 150,000 IDR)
    const actualCost = (costNum > 0 && costNum < 1000) ? costNum * 1000 : costNum;

    const existingLog = editingId ? logs.find(l => l.id === editingId) : null;
    const mileageVal = existingLog ? existingLog.mileage : 0;

    const logData: Omit<ServiceLog, 'id'> = {
      date,
      mileage: mileageVal,
      cost: actualCost,
      service_type: serviceType,
      description: description.trim() || serviceType,
      parts_changed: selectedParts,
      notes: notes.trim() || undefined
    };

    if (editingId) {
      onEditLog(editingId, logData);
    } else {
      onAddLog(logData);
    }

    resetForm();
    setIsFormOpen(false);
  };

  // Filter & Search Logic
  const filteredLogs = logs.filter(log => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      (log.service_type || '').toLowerCase().includes(query) ||
      (log.description || '').toLowerCase().includes(query) ||
      (log.notes || '').toLowerCase().includes(query) ||
      (log.parts_changed || []).some(part => part.toLowerCase().includes(query));

    const matchesType = typeFilter === 'All' || log.service_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? tB - tA : tA - tB;
  });

  // Group logs by month
  const groupedLogs = useMemo(() => {
    const groups: { [key: string]: { label: string; logs: ServiceLog[]; totalCost: number } } = {};
    const groupOrder: string[] = [];

    for (const log of sortedLogs) {
      let label = 'Lainnya';
      let key = 'other';
      if (log.date) {
        const dateObj = new Date(log.date.includes('T') ? log.date : `${log.date}T00:00:00`);
        if (!isNaN(dateObj.getTime())) {
          const monthName = dateObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
          label = monthName.charAt(0).toUpperCase() + monthName.slice(1);
          const y = dateObj.getFullYear();
          const m = String(dateObj.getMonth() + 1).padStart(2, '0');
          key = `${y}-${m}`;
        }
      }

      if (!groups[key]) {
        groups[key] = { label, logs: [], totalCost: 0 };
        groupOrder.push(key);
      }
      groups[key].logs.push(log);
      groups[key].totalCost += Number(log.cost || 0);
    }

    return groupOrder.map(k => ({
      key: k,
      label: groups[k].label,
      logs: groups[k].logs,
      totalCost: groups[k].totalCost,
    }));
  }, [sortedLogs]);

  // Calculate Statistics
  const totalServiceCost = logs.reduce((acc, l) => acc + (l.cost || 0), 0);
  const totalServiceCount = logs.length;
  const latestService = logs.length > 0 ? [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;

  // Flatten all unique parts changed
  const allPartsChanged = Array.from(new Set(logs.flatMap(l => l.parts_changed || [])));

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5 md:space-y-6 px-0 md:px-1">
      {/* ════════════════════ 1. HERO HEADER ════════════════════ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-amber-600 via-amber-700 to-orange-800 dark:from-slate-900 dark:via-amber-950 dark:to-slate-900 text-white shadow-2xl shadow-amber-600/20 dark:shadow-black/40">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        <div className="relative z-10 p-5 md:p-7 lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl ring-1 ring-white/20">
                <Wrench className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-display">
                  Servis & Spare Part
                </h1>
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.93 }}
                  id="btn-add-service-log"
                  onClick={handleOpenAdd}
                  title="Catat Servis Baru"
                  className="p-1.5 md:p-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl transition-all cursor-pointer border border-white/15 shadow-md flex items-center justify-center shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </div>

          {/* Mini Stats Summary Bar */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Wrench, label: 'Total Servis', value: `${totalServiceCount}x Pengerjaan` },
              { icon: DollarSign, label: 'Total Biaya Servis', value: formatIDR(totalServiceCost) },
              { icon: Package, label: 'Spare Part Diganti', value: `${allPartsChanged.length} Jenis` },
              { icon: Calendar, label: 'Servis Terakhir', value: latestService ? new Date(latestService.date.includes('T') ? latestService.date : `${latestService.date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-' },
            ].map((item, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <div className="flex items-center gap-2 text-amber-100/70 text-[11px] font-medium tracking-wider mb-1">
                  <item.icon className="w-3 h-3" />
                  {item.label}
                </div>
                <span className="text-sm md:text-base font-bold truncate block">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ════════════════════ 2. FILTERS & SEARCH BAR ════════════════════ */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Search Input */}
        <div className="relative md:col-span-2">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="service-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari sparepart (ban, gir set, kampas), atau jenis servis..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 text-sm transition-all shadow-xs"
          />
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2 shadow-xs">
          <ListFilter className="w-4 h-4 text-amber-500 shrink-0" />
          <select
            id="service-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 dark:text-white text-sm focus:outline-hidden"
          >
            <option value="All">Semua Kategori Servis</option>
            {PRESET_SERVICE_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Sort Order Toggle */}
        <button
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-all shadow-xs cursor-pointer"
        >
          <ArrowUpDown className="w-4 h-4 text-amber-500" />
          <span>{sortOrder === 'desc' ? 'Terbaru Dahulu' : 'Terlama Dahulu'}</span>
        </button>
      </motion.div>

      {/* ════════════════════ 3. LOGS LIST / CARDS ════════════════════ */}
      <motion.div variants={fadeUp} className="space-y-3">
        {sortedLogs.length === 0 ? (
          <div className="p-8 md:p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Wrench className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-white text-base">
              Belum ada riwayat servis
            </h3>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1 max-w-sm mx-auto">
              Klik tombol 'Catat Servis Baru' di atas untuk mencatat pengerjaan servis, ganti ban, gir set, atau sparepart motor Anda.
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Catat Servis
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedLogs.map((group) => (
              <div key={group.key} className="space-y-3">
                {/* Month Section Header */}
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-xs md:text-sm tracking-wide">
                      {group.label}
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40">
                      {group.logs.length} Servis
                    </span>
                  </div>

                  <div className="text-right flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">Subtotal:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                      {formatIDR(group.totalCost)}
                    </span>
                  </div>
                </div>

                {/* Grid for this Month */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {group.logs.map((log) => (
                    <motion.div
                      key={log.id}
                      variants={scaleIn}
                      className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-4 shadow-xs hover:shadow-md transition-all space-y-3"
                    >
                      {/* Card Header: Category & Date */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40">
                              {log.service_type || 'Servis Motor'}
                            </span>
                          </div>
                          <h3 className="font-bold text-slate-800 dark:text-white text-sm md:text-base mt-1.5 leading-snug">
                            {log.description}
                          </h3>
                        </div>

                        {/* Actions: Edit & Delete */}
                        <div className="flex items-center gap-1.5 shrink-0 opacity-90 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(log)}
                            className="px-2.5 py-1.5 sm:p-1.5 rounded-xl text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200/80 dark:border-amber-800/60 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Edit Log Servis"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold sm:hidden">Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(log.id)}
                            className="px-2.5 py-1.5 sm:p-1.5 rounded-xl text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200/80 dark:border-rose-800/60 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Hapus Log Servis"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold sm:hidden">Hapus</span>
                          </button>
                        </div>
                      </div>

                      {/* Spare Part Tags */}
                      {log.parts_changed && log.parts_changed.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {log.parts_changed.map((part, pIdx) => (
                            <span
                              key={pIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                            >
                              <Tag className="w-2.5 h-2.5 text-amber-500" />
                              {part}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Notes if available */}
                      {log.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 italic">
                          "{log.notes}"
                        </p>
                      )}

                      {/* Card Footer: Date & Cost */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 font-medium">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>

                        <span className="font-extrabold text-amber-600 dark:text-amber-400 text-sm">
                          {formatIDR(log.cost)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ════════════════════ 4. MODAL FORM (ADD / EDIT) ════════════════════ */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-2xl p-6 max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white font-display">
                      {editingId ? 'Edit Servis' : 'Catat Servis'}
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    id="btn-submit-service-header"
                    type="submit"
                    form="service-form"
                    className="p-1.5 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40 rounded-lg transition-colors cursor-pointer"
                    title={editingId ? 'Simpan Perubahan' : 'Simpan Log Servis'}
                  >
                    <Save className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setIsFormOpen(false)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Form Content (Scrollable) */}
              <form id="service-form" onSubmit={handleSubmit} className="overflow-y-auto py-4 space-y-4 flex-1 pr-1">
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Kategori Servis */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Kategori Pengerjaan
                  </label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                  >
                    {PRESET_SERVICE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Tanggal */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" /> Tanggal Servis
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                  />
                </div>

                {/* Deskripsi Singkat */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Rincian Servis / Pengerjaan
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Contoh: Ganti ban depan IRC & stel rantai"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
                  />
                </div>

                {/* Spare Part / Onderdil Diganti (Master Data Add/Delete Manager) */}
                <div className="space-y-3 p-3.5 md:p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700/60 pb-2.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-amber-500" />
                      <span>Kelola Master Data Spare Part / Onderdil</span>
                    </label>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {/* View Mode Toggle: Chips vs Table */}
                      <div className="flex items-center gap-0.5 bg-slate-200/80 dark:bg-slate-700/80 p-0.5 rounded-lg text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setMasterViewMode('chips')}
                          className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                            masterViewMode === 'chips'
                              ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          Chips
                        </button>
                        <button
                          type="button"
                          onClick={() => setMasterViewMode('table')}
                          className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                            masterViewMode === 'table'
                              ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          Tabel
                        </button>
                      </div>

                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-100/70 dark:bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-200/50 dark:border-amber-900/40">
                        {presetParts.length} Item
                      </span>
                      <button
                        type="button"
                        onClick={handleResetMasterParts}
                        title="Kembalikan daftar master data ke preset bawaan"
                        className="text-[10px] text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 underline font-medium cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Active Selected Spare Parts for Current Record */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-amber-500" /> Spare Part Dipilih ({selectedParts.length}):
                      </span>
                    </div>
                    {selectedParts.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 p-2 bg-amber-500/10 dark:bg-amber-950/40 rounded-xl border border-amber-200/70 dark:border-amber-900/50 min-h-[38px] items-center">
                        {selectedParts.map((partName, idx) => (
                          <span
                            key={`selected-${partName}-${idx}`}
                            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-bold bg-amber-600 text-white shadow-2xs"
                          >
                            <Check className="w-3 h-3 shrink-0" />
                            <span>{partName}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePart(idx)}
                              title={`Hapus ${partName} dari catatan ini`}
                              className="p-0.5 hover:bg-amber-700 rounded-md text-amber-100 hover:text-white transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 italic p-2 bg-white dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-700/80 text-center">
                        Belum ada spare part dipilih. Klik item di bawah untuk memilih.
                      </div>
                    )}
                  </div>

                  {/* Input field to add NEW item to master data list */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={customPartInput}
                        onChange={(e) => setCustomPartInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomPart();
                          }
                        }}
                        placeholder="Ketik spare part baru (cth: Kampas Rem, Busi, Ban, dll)..."
                        className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                      />
                      {customPartInput && (
                        <button
                          type="button"
                          onClick={() => setCustomPartInput('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomPart}
                      disabled={!customPartInput.trim()}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1 shrink-0 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> + Tambah Ke Master
                    </button>
                  </div>

                  {/* Search Bar for Master Items */}
                  {presetParts.length > 6 && (
                    <div className="px-2.5 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={masterPartSearch}
                        onChange={(e) => setMasterPartSearch(e.target.value)}
                        placeholder="Cari dalam master data spare part..."
                        className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden font-medium"
                      />
                      {masterPartSearch && (
                        <button
                          type="button"
                          onClick={() => setMasterPartSearch('')}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Master Data DISPLAY MODE: CHIPS vs TABLE */}
                  {masterViewMode === 'chips' ? (
                    /* CHIPS MODE WITH DIRECT DELETE BUTTON ON EACH CHIP */
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        <span>Pilihan Cepat (Klik teks untuk Pilih, Klik [x] untuk Hapus Master):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        {filteredMasterParts.length === 0 ? (
                          <div className="w-full text-center py-4 text-xs text-slate-400 italic">
                            Tidak ada spare part ditemukan.
                          </div>
                        ) : (
                          filteredMasterParts.map((partName) => {
                            const isSelected = selectedParts.includes(partName);
                            return (
                              <div
                                key={partName}
                                className={`inline-flex items-center rounded-xl text-xs font-bold transition-all border shadow-2xs group ${
                                  isSelected
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200/90 dark:border-slate-700'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleTogglePart(partName)}
                                  className="pl-2.5 pr-2 py-1.5 flex items-center gap-1.5 cursor-pointer select-none"
                                >
                                  {isSelected ? (
                                    <Check className="w-3.5 h-3.5 shrink-0 stroke-[3]" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                  )}
                                  <span>{partName}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMasterPart(partName);
                                  }}
                                  title={`Hapus "${partName}" dari Master Data`}
                                  className={`pr-2 pl-1.5 py-1.5 transition-colors cursor-pointer border-l ${
                                    isSelected
                                      ? 'hover:bg-rose-700 text-amber-100 hover:text-white border-amber-500/50'
                                      : 'hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    /* TABEL MODE WITH CHECKBOX AND TRASH ICON */
                    <div className="border border-slate-200/90 dark:border-slate-700/80 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                        {filteredMasterParts.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 italic">
                            Tabel master spare part kosong.
                          </div>
                        ) : (
                          filteredMasterParts.map((partName, idx) => {
                            const isSelected = selectedParts.includes(partName);
                            return (
                              <div
                                key={`${partName}-${idx}`}
                                className={`flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                                  isSelected
                                    ? 'bg-amber-500/10 dark:bg-amber-950/40'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                              >
                                <div
                                  onClick={() => handleTogglePart(partName)}
                                  className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0 pr-2 select-none"
                                >
                                  <div
                                    className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected
                                        ? 'bg-amber-600 border-amber-600 text-white'
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <span className={`truncate font-medium ${isSelected ? 'text-amber-800 dark:text-amber-300 font-bold' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {partName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePart(partName)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                                      isSelected
                                        ? 'bg-amber-600 text-white shadow-2xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-950/80 hover:text-amber-800 dark:hover:text-amber-300 border border-slate-200/80 dark:border-slate-700/80'
                                    }`}
                                  >
                                    {isSelected ? (
                                      <>
                                        <Check className="w-3 h-3" /> Dipilih
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-3 h-3" /> Pilih
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMasterPart(partName)}
                                    title={`Hapus "${partName}" dari tabel master`}
                                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Total Biaya (Jasa + Sparepart) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-amber-500" /> Total Biaya (Rp)
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Ketik 150 untuk 150.000</span>
                  </label>
                  <input
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Contoh: 180000"
                    required
                    min="0"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
                  />
                  {typeof cost === 'number' && cost > 0 && (
                    <p className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
                      Total: {formatIDR(cost > 0 && cost < 1000 ? cost * 1000 : cost)}
                    </p>
                  )}
                </div>

                {/* Catatan Tambahan / Garansi */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-amber-500" /> Catatan / Garansi (Opsional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Catatan tambahan, garansi toko, atau instruksi servis berikutnya..."
                    rows={2}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden resize-none"
                  />
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ════════════════════ 5. DELETE CONFIRMATION DIALOG ════════════════════ */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-display">
                  Hapus Catatan Servis?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Data servis ini akan dihapus secara permanen dari perangkat Anda.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    if (deletingId) onDeleteLog(deletingId);
                    setDeletingId(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-rose-600/20"
                >
                  Ya, Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
