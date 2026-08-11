import { useState, useEffect, useRef } from 'react';
import { OilLog, FuelLog, AppSettings, Jarak, ServiceLog } from '../types';
import { formatIDR } from '../utils/export';
import { fetchJarakRecords } from '../lib/supabaseClient';
import { getDBItem, setDBItem } from '../lib/dbStorage';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Line, AreaChart, Area
} from 'recharts';
import {
  Gauge, Droplets, Fuel, TrendingUp, Coins, Activity,
  Timer, Flame,
  Battery, Wrench, Clock, Target, Milestone, Satellite,
  Filter, CalendarDays, Compass,
  ListFilter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  oilLogs: OilLog[];
  fuelLogs: FuelLog[];
  serviceLogs?: ServiceLog[];
  settings: AppSettings;
  onNavigate: (tab: string) => void;
}

// ─── Animated Counter Component ─────────────────────────────────────────────
function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  decimals = 0,
  duration = 1.5,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;

    const animate = (now: number) => {
      const elapsed = (now - start) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };

    ref.current = requestAnimationFrame(animate);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [value, duration]);

  return (
    <span>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}

// ─── Stagger Container ───────────────────────────────────────────────────────
const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getMonthYearKey = (dateStr: string) => {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
};

const getOilHealthColor = (pct: number) => {
  if (pct > 40) return { stroke: '#10b981', bg: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900/40', ring: 'ring-emerald-500/30' };
  if (pct > 15) return { stroke: '#f59e0b', bg: 'bg-amber-500', light: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-900/40', ring: 'ring-amber-500/30' };
  return { stroke: '#ef4444', bg: 'bg-rose-500', light: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-900/40', ring: 'ring-rose-500/30' };
};

// ─── Dashboard Component ─────────────────────────────────────────────────────
export default function Dashboard({ oilLogs, fuelLogs, serviceLogs = [], settings, onNavigate }: DashboardProps) {
  // ── Derived Data ──────────────────────────────────────────────────────────
  const maxOilMileage = oilLogs.length > 0 ? Math.max(...oilLogs.map(l => l.mileage)) : 0;
  const maxFuelMileage = fuelLogs.length > 0 ? Math.max(...fuelLogs.map(l => l.mileage)) : 0;
  const maxServiceMileage = serviceLogs.length > 0 ? Math.max(...serviceLogs.map(l => l.mileage)) : 0;
  const currentMileage = Math.max(maxOilMileage, maxFuelMileage, maxServiceMileage);
  const allMileages = [...oilLogs.map(l => l.mileage), ...fuelLogs.map(l => l.mileage), ...serviceLogs.map(l => l.mileage)].filter(m => m > 0);
  const minMileage = allMileages.length > 0 ? Math.min(...allMileages) : 0;

  const lastOilLog = oilLogs.length > 0 ? oilLogs[0] : null;
  let elapsedKm = 0, remainingKm = settings.oilChangeIntervalKm, oilLifeKmPercent = 100;
  let elapsedDays = 0, remainingDays = settings.oilChangeIntervalDays, oilLifeDaysPercent = 100;

  if (lastOilLog) {
    elapsedKm = currentMileage - lastOilLog.mileage;
    remainingKm = Math.max(0, settings.oilChangeIntervalKm - elapsedKm);
    oilLifeKmPercent = Math.max(0, Math.min(100, Math.round((remainingKm / settings.oilChangeIntervalKm) * 100)));
    const lastDate = new Date(lastOilLog.date);
    const today = new Date();
    const elapsedMs = today.getTime() - lastDate.getTime();
    elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
    remainingDays = Math.max(0, settings.oilChangeIntervalDays - elapsedDays);
    oilLifeDaysPercent = Math.max(0, Math.min(100, Math.round((remainingDays / settings.oilChangeIntervalDays) * 100)));
  }
  const oilLifePercent = lastOilLog ? Math.min(oilLifeKmPercent, oilLifeDaysPercent) : 0;
  const healthColor = getOilHealthColor(oilLifePercent);

  // BBM & Servis Analytics
  const totalFuelCost = fuelLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalLiters = fuelLogs.reduce((sum, l) => sum + l.liters, 0);
  const logsWithEfficiency = fuelLogs.filter(l => l.efficiency && l.efficiency > 0);
  const avgEfficiency = logsWithEfficiency.length > 0
    ? logsWithEfficiency.reduce((sum, l) => sum + (l.efficiency || 0), 0) / logsWithEfficiency.length : 0;
  const totalOilCost = oilLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalServiceCost = serviceLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalExpenses = totalFuelCost + totalOilCost + totalServiceCost;
  
  const today = new Date();

  // Current Month Data
  const currentMonthFuelCost = fuelLogs
    .filter(l => new Date(l.date).getMonth() === today.getMonth() && new Date(l.date).getFullYear() === today.getFullYear())
    .reduce((sum, l) => sum + l.cost, 0);
  const currentMonthServiceCost = serviceLogs
    .filter(l => new Date(l.date).getMonth() === today.getMonth() && new Date(l.date).getFullYear() === today.getFullYear())
    .reduce((sum, l) => sum + l.cost, 0);
  const currentMonthTotalCost = currentMonthFuelCost + currentMonthServiceCost;

  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthFuelCost = fuelLogs
    .filter(l => new Date(l.date).getMonth() === lastMonth.getMonth() && new Date(l.date).getFullYear() === lastMonth.getFullYear())
    .reduce((sum, l) => sum + l.cost, 0);

  // Monthly chart data
  const monthlyDataMap = new Map<string, { month: string; fuel: number; fuelLiters: number; oil: number; service: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = getMonthYearKey(d.toISOString());
    monthlyDataMap.set(key, { month: key, fuel: 0, fuelLiters: 0, oil: 0, service: 0 });
  }
  fuelLogs.forEach(log => {
    const key = getMonthYearKey(log.date);
    if (monthlyDataMap.has(key)) {
      monthlyDataMap.get(key)!.fuel += log.cost;
      monthlyDataMap.get(key)!.fuelLiters += (log.liters || 0);
    }
    else monthlyDataMap.set(key, { month: key, fuel: log.cost, fuelLiters: log.liters || 0, oil: 0, service: 0 });
  });
  oilLogs.forEach(log => {
    const key = getMonthYearKey(log.date);
    if (monthlyDataMap.has(key)) monthlyDataMap.get(key)!.oil += log.cost;
    else monthlyDataMap.set(key, { month: key, fuel: 0, fuelLiters: 0, oil: log.cost, service: 0 });
  });
  serviceLogs.forEach(log => {
    const key = getMonthYearKey(log.date);
    if (monthlyDataMap.has(key)) monthlyDataMap.get(key)!.service += log.cost;
    else monthlyDataMap.set(key, { month: key, fuel: 0, fuelLiters: 0, oil: 0, service: log.cost });
  });
  const sortedMonthlyData = Array.from(monthlyDataMap.values());

  // Mode Tampilan Grafik Efisiensi BBM
  type FuelMetricMode = 'km_l' | 'l_100km' | 'cost_km';
  const [fuelMetricMode, setFuelMetricMode] = useState<FuelMetricMode>('km_l');

  // Comprehensive Efficiency & Consumption trend per kilometer
  const efficiencyTrendData = [...fuelLogs]
    .filter(l => l.efficiency && l.efficiency > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12)
    .map(log => {
      const kmL = Number(log.efficiency?.toFixed(1)) || 0;
      const l100 = kmL > 0 ? Number((100 / kmL).toFixed(2)) : 0;
      const pricePerLiter = log.cost && log.liters && log.liters > 0 ? log.cost / log.liters : settings.fuelPricePerLiter || 10000;
      const costPerKm = kmL > 0 ? Math.round(pricePerLiter / kmL) : 0;

      return {
        date: new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDate: log.date,
        fuelType: log.fuel_type || 'BBM',
        mileage: log.mileage,
        liters: log.liters,
        cost: log.cost,
        'Efisiensi (km/L)': kmL,
        'Konsumsi (L/100km)': l100,
        'Biaya/km (Rp)': costPerKm,
        'Rata-rata km/L': Number(avgEfficiency.toFixed(1)),
        'Rata-rata L/100km': avgEfficiency > 0 ? Number((100 / avgEfficiency).toFixed(2)) : 0,
        'Rata-rata Biaya/km': avgEfficiency > 0 ? Math.round((settings.fuelPricePerLiter || 10000) / avgEfficiency) : 0
      };
    });

  // Chart style helpers
  const chartTooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(12px)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    padding: '10px 14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  // ── Jarak Tempuh (bulanan) ───────────────────────────────────────────────
  const [jarakData, setJarakData] = useState<Jarak[]>([]);
  const [jarakLoading, setJarakLoading] = useState(false);

  const loadJarak = async () => {
    // 1. Load from local DB (IndexedDB) immediately
    try {
      const cached = await getDBItem<Jarak[]>('oil_tracker_jarak', []);
      if (Array.isArray(cached) && cached.length > 0) {
        setJarakData(cached);
      }
    } catch { /* ignore */ }

    // 2. Fetch from Supabase (field total_km) and copy result to local DB
    setJarakLoading(true);
    try {
      const { records, error } = await fetchJarakRecords();
      if (!error && Array.isArray(records)) {
        setJarakData(records);
        await setDBItem('oil_tracker_jarak', records);
      }
    } catch { /* ignore */ }
    finally { setJarakLoading(false); }
  };

  useEffect(() => { loadJarak(); }, []);

  // Group jarak by month and sum total_km
  const jarakMonthMap = new Map<string, number>();
  for (const r of jarakData) {
    const key = getMonthYearKey(r.date);
    jarakMonthMap.set(key, (jarakMonthMap.get(key) || 0) + r.total_km);
  }
  const sortedJarakMonths = Array.from(jarakMonthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  const thisMonthKey = getMonthYearKey(new Date().toISOString());
  const thisMonthKm = jarakMonthMap.get(thisMonthKey) || 0;
  const totalKm = jarakData.reduce((sum, r) => sum + r.total_km, 0);

  // ── Filter Rentang Tanggal (Date Range Filter) ─────────────────────────────
  // Fitur ini memungkinkan pengguna untuk memfilter data biaya, oli, dan jarak tempuh 
  // berdasarkan rentang waktu tertentu, memberikan fleksibilitas analisis yang lebih baik.
  type TimeFilterMode = '7d' | 'month' | '30d' | '3m' | 'year' | 'all' | 'custom';
  const [timeFilterMode, setTimeFilterMode] = useState<TimeFilterMode>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // ── Ringkasan Kesehatan Motor Cepat (30 Hari Terakhir) ────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const serviceLogs30Days = serviceLogs.filter(l => new Date(l.date) >= thirtyDaysAgo);

  const distanceSinceLastOil = (() => {
    if (oilLogs.length === 0) {
      return jarakData.reduce((sum, r) => sum + Number(r.total_km || 0), 0);
    }

    const sortedOil = [...oilLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestOil = sortedOil[0];
    const latestOilDateStr = latestOil.date.includes('T') ? latestOil.date.split('T')[0] : latestOil.date;

    const sumJarak = jarakData
      .filter(r => {
        const rDateStr = r.date.includes('T') ? r.date.split('T')[0] : r.date;
        return rDateStr >= latestOilDateStr;
      })
      .reduce((sum, r) => sum + Number(r.total_km || 0), 0);

    const mileageDiff = Math.max(0, currentMileage - latestOil.mileage);

    return Math.max(mileageDiff, sumJarak);
  })();

  const getDateRangeBounds = () => {
    let start: Date | null = null;
    let end: Date | null = new Date();
    end.setHours(23, 59, 59, 999);

    if (timeFilterMode === '7d') {
      start = new Date();
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (timeFilterMode === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (timeFilterMode === '30d') {
      start = new Date();
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    } else if (timeFilterMode === '3m') {
      start = new Date();
      start.setDate(start.getDate() - 89);
      start.setHours(0, 0, 0, 0);
    } else if (timeFilterMode === 'year') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (timeFilterMode === 'all') {
      start = null;
      end = null;
    } else if (timeFilterMode === 'custom') {
      start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
      end = customEndDate ? new Date(`${customEndDate}T23:59:59`) : null;
    }

    return { start, end };
  };

  const { start: filterStartDate, end: filterEndDate } = getDateRangeBounds();

  const isDateInRange = (dateStr: string) => {
    if (!filterStartDate && !filterEndDate) return true;
    const d = new Date(dateStr);
    if (filterStartDate && d < filterStartDate) return false;
    if (filterEndDate && d > filterEndDate) return false;
    return true;
  };

  const filteredFuelLogs = fuelLogs.filter(l => isDateInRange(l.date));
  const filteredOilLogs = oilLogs.filter(l => isDateInRange(l.date));
  const filteredServiceLogs = serviceLogs.filter(l => isDateInRange(l.date));
  const filteredJarakData = jarakData.filter(r => isDateInRange(r.date));

  const filteredFuelCost = filteredFuelLogs.reduce((sum, l) => sum + l.cost, 0);
  const filteredFuelLiters = filteredFuelLogs.reduce((sum, l) => sum + l.liters, 0);
  const filteredOilCost = filteredOilLogs.reduce((sum, l) => sum + l.cost, 0);
  const filteredServiceCost = filteredServiceLogs.reduce((sum, l) => sum + l.cost, 0);
  const filteredTotalOperational = filteredFuelCost + filteredOilCost + filteredServiceCost;

  const filteredEffLogs = filteredFuelLogs.filter(l => l.efficiency && l.efficiency > 0);
  const filteredAvgEfficiency = filteredEffLogs.length > 0
    ? filteredEffLogs.reduce((sum, l) => sum + (l.efficiency || 0), 0) / filteredEffLogs.length
    : 0;

  const filteredJarakKm = filteredJarakData.reduce((sum, r) => sum + r.total_km, 0);

  const allLogsAsc = [...oilLogs, ...fuelLogs, ...serviceLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const rangeLogs = allLogsAsc.filter(l => isDateInRange(l.date));

  let filteredLogKm = 0;
  if (rangeLogs.length >= 2) {
    const maxMileageInRange = Math.max(...rangeLogs.map(l => l.mileage));
    const minMileageInRange = Math.min(...rangeLogs.map(l => l.mileage));
    filteredLogKm = Math.max(0, maxMileageInRange - minMileageInRange);
  } else if (rangeLogs.length === 1 && filterStartDate) {
    const priorLogs = allLogsAsc.filter(l => new Date(l.date) < filterStartDate);
    if (priorLogs.length > 0) {
      const lastPriorMileage = Math.max(...priorLogs.map(l => l.mileage));
      filteredLogKm = Math.max(0, rangeLogs[0].mileage - lastPriorMileage);
    }
  }

  const filteredTotalKm = Math.max(filteredJarakKm, filteredLogKm);

  const getPeriodLabel = () => {
    switch (timeFilterMode) {
      case '7d': return '7 Hari Terakhir (Mingguan)';
      case 'month': return `Bulan Ini (${currentMonthName})`;
      case '30d': return '30 Hari Terakhir';
      case '3m': return '3 Bulan Terakhir';
      case 'year': return `Tahun ${currentYear}`;
      case 'all': return 'Semua Periode';
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${new Date(customStartDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${new Date(customEndDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
        return 'Rentang Tanggal Kustom';
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-5 md:space-y-6 px-0 md:px-1"
    >
      {/* ═══════════════════════ 1. HERO HEADER ═══════════════════════ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 text-white shadow-2xl shadow-indigo-600/20 dark:shadow-black/40">
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-indigo-400/10 rounded-full blur-2xl pointer-events-none" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative z-10 p-5 md:p-7 lg:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl ring-1 ring-white/20">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-display">
                    Dashboard Motor
                  </h1>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:gap-2.5">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('fuel')}
                className="px-3.5 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-semibold rounded-xl text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-white/15 shadow-lg"
              >
                <Fuel className="w-4 h-4" /> BBM
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('oil')}
                className={`px-3.5 py-2.5 ${lastOilLog ? healthColor.bg + ' text-white hover:opacity-90' : 'bg-white/20 hover:bg-white/30 text-white'} backdrop-blur-sm font-semibold rounded-xl text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-white/15 shadow-lg`}
              >
                <Droplets className="w-4 h-4" /> Oli
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('service')}
                className="px-3.5 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-semibold rounded-xl text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-white/15 shadow-lg"
              >
                <Wrench className="w-4 h-4" /> Servis
              </motion.button>
            </div>
          </div>

          {/* Mini stats row */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Milestone, label: 'Total Jarak Bulan Ini', value: `${thisMonthKm.toLocaleString('id-ID')} km` },
              { icon: Target, label: 'Konsumsi BBM', value: avgEfficiency > 0 ? `${avgEfficiency.toFixed(1)} km/L` : '-' },
              { icon: Flame, label: 'Total BBM Bulan ini', value: formatIDR(currentMonthFuelCost) },
              { icon: Timer, label: 'Total BBM Bulan lalu', value: formatIDR(lastMonthFuelCost) },
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

      {/* ═══════════════════════ 1.5 KARTU RINGKASAN KESEHATAN MOTOR ═══════════════════════ */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-4">
        {/* Card 1: Jarak Tempuh Total Sejak Ganti Oli */}
        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => onNavigate('oil')}
          className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 md:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold capitalize tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-emerald-500" />
                Jarak Tempuh Sejak Ganti Oli
              </span>
              <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-display">
                {distanceSinceLastOil.toLocaleString('id-ID')} <span className="text-sm font-normal text-slate-500">km</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  {lastOilLog
                    ? `Terakhir ganti oli: ${new Date(lastOilLog.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'Belum ada riwayat ganti oli'
                  }
                </span>
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 shrink-0 group-hover:scale-110 transition-transform">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </motion.div>

        {/* Card 3: Total Pengeluaran Bulan Berjalan */}
        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 md:p-5 shadow-xs hover:shadow-md transition-all cursor-default group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-blue-600" />
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold capitalize tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-blue-500" />
                Total Pengeluaran Bulan Ini
              </span>
              <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-display">
                {formatIDR(currentMonthTotalCost)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>
                  {formatIDR(currentMonthFuelCost)} BBM • {formatIDR(currentMonthServiceCost)} Servis
                </span>
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 shrink-0 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ═══════════════════════ 2.5 FILTER RENTANG TANGGAL & RINGKASAN PERIODE ═══════════════════════ */}
      <motion.div variants={fadeUp} className="space-y-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 p-4 md:p-6 shadow-sm">
        {/* Header & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Ringkasan
              </h2>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/40 text-xs font-semibold self-start sm:self-auto">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{getPeriodLabel()}</span>
          </div>
        </div>

        {/* Quick Filter Preset Toolbar */}
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/60 px-3 py-2 shadow-xs">
          <ListFilter className="w-4 h-4 text-indigo-500 shrink-0" />
          <select
            value={timeFilterMode}
            onChange={(e) => setTimeFilterMode(e.target.value as TimeFilterMode)}
            className="flex-1 bg-transparent text-slate-800 dark:text-white text-sm focus:outline-hidden"
          >
            <option className="dark:bg-slate-800" value="30d">30 Hari</option>
            <option className="dark:bg-slate-800" value="7d">Mingguan (7 Hari)</option>
            <option className="dark:bg-slate-800" value="month">Bulan Ini</option>
            <option className="dark:bg-slate-800" value="3m">3 Bulan</option>
            <option className="dark:bg-slate-800" value="year">Tahun {currentYear}</option>
            <option className="dark:bg-slate-800" value="all">Semua</option>
            <option className="dark:bg-slate-800" value="custom">Kustom Tanggal</option>
          </select>
        </div>

        {/* Custom Date Range Picker */}
        <AnimatePresence>
          {timeFilterMode === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden pt-2"
            >
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Sampai
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary Metric Cards for Selected Filter Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 pt-1">
          {/* Card 1: Biaya BBM */}
          <motion.div
            variants={scaleIn}
            whileHover={{ y: -2 }}
            className="group relative overflow-hidden rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/50 p-4 shadow-2xs hover:shadow-sm transition-all"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600" />
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Fuel className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                {filteredFuelLogs.length}x Pengisian
              </span>
            </div>
            <span className="block text-[11px] font-semibold text-slate-400 dark:text-slate-400 tracking-wider mb-1">
              Biaya BBM
            </span>
            <div className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {formatIDR(filteredFuelCost)}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 truncate">
              {filteredFuelLiters > 0
                ? `${filteredFuelLiters.toFixed(1)} Liter terpakai`
                : 'Tidak ada pengisian di periode ini'}
            </p>
          </motion.div>

          {/* Card 2: Jarak Tempuh */}
          <motion.div
            variants={scaleIn}
            whileHover={{ y: -2 }}
            className="group relative overflow-hidden rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/50 p-4 shadow-2xs hover:shadow-sm transition-all"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-600" />
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Milestone className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                Jarak Tempuh
              </span>
            </div>
            <span className="block text-[11px] font-semibold text-slate-400 dark:text-slate-400 tracking-wider mb-1">
              Jarak Periode Ini
            </span>
            <div className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums flex items-baseline gap-1">
              <AnimatedCounter value={filteredTotalKm} decimals={filteredTotalKm % 1 !== 0 ? 1 : 0} />
              <span className="text-xs font-normal text-slate-400">km</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 truncate">
              {rangeLogs.length > 0
                ? `${rangeLogs.length} catatan dalam periode`
                : 'Belum ada catatan jarak'}
            </p>
          </motion.div>

          {/* Card 3: Total Operasional */}
          <motion.div
            variants={scaleIn}
            whileHover={{ y: -2 }}
            className="group relative overflow-hidden rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/50 p-4 shadow-2xs hover:shadow-sm transition-all"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Coins className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                Total Operasional
              </span>
            </div>
            <span className="block text-[11px] font-semibold text-slate-400 dark:text-slate-400 tracking-wider mb-1">
              Total Pengeluaran
            </span>
            <div className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {formatIDR(filteredTotalOperational)}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 truncate">
              BBM {formatIDR(filteredFuelCost)} • Oli {formatIDR(filteredOilCost)}
            </p>
          </motion.div>

          {/* Card 4: Rata-rata Efisiensi */}
          <motion.div
            variants={scaleIn}
            whileHover={{ y: -2 }}
            className="group relative overflow-hidden rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/50 p-4 shadow-2xs hover:shadow-sm transition-all"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-indigo-600" />
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-violet-700 dark:text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-md border border-violet-500/20">
                Efisiensi
              </span>
            </div>
            <span className="block text-[11px] font-semibold text-slate-400 dark:text-slate-400 tracking-wider mb-1">
              Rata-rata Konsumsi
            </span>
            <div className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {filteredAvgEfficiency > 0 ? `${filteredAvgEfficiency.toFixed(1)} km/L` : '—'}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 truncate">
              {filteredEffLogs.length > 0
                ? `${filteredEffLogs.length} log efisiensi terhitung`
                : 'Belum cukup log BBM'}
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* ═══════════════════════ 3. CORE METRICS ═══════════════════════ */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {[
          {
            icon: Milestone,
            label: 'Jarak Bulan Ini',
            value: jarakLoading ? 0 : thisMonthKm,
            suffix: ' km',
            color: 'from-cyan-500 to-blue-600',
            bgLight: 'bg-cyan-50 dark:bg-cyan-950/30',
            iconColor: 'text-cyan-600 dark:text-cyan-400',
            decimals: 1,
            sub: totalKm > 0
              ? `${sortedJarakMonths.length} bulan tercatat · Total ${totalKm.toFixed(1)} km`
              : !jarakLoading ? 'Belum ada data jarak tempuh' : 'Memuat...',
          },
          {
            icon: TrendingUp, label: 'Rata-rata Konsumsi', value: avgEfficiency, suffix: ' km/L',
            color: 'from-emerald-500 to-teal-600', bgLight: 'bg-emerald-50 dark:bg-emerald-950/30',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
            decimals: 1,
            sub: totalLiters > 0 ? `${totalLiters.toFixed(1)}L total terpakai` : null,
            gpsBadge: avgEfficiency > 0,
          },
          {
            icon: Coins, label: 'Total Pengeluaran', value: totalExpenses,
            prefixFn: () => 'Rp', bgLight: 'bg-rose-50 dark:bg-rose-950/30',
            iconColor: 'text-rose-600 dark:text-rose-400',
            color: 'from-rose-500 to-pink-600',
            formatCurrency: true,
            sub: `BBM ${formatIDR(totalFuelCost)} + Oli ${formatIDR(totalOilCost)}`,
          },
        ].map((metric, idx) => (
          <motion.div
            key={idx}
            variants={scaleIn}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300"
          >
            {/* Gradient accent bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${metric.color} opacity-60`} />

            <div className="p-4 md:p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${metric.bgLight} ${metric.iconColor} transition-transform duration-300 group-hover:scale-110`}>
                  <metric.icon className="w-5 h-5" />
                </div>
                {'prefixFn' in metric && metric.value > 0 && (
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg">
                    {metric.prefixFn()}
                  </span>
                )}
              </div>
              <span className="block text-xs font-medium text-slate-400 dark:text-slate-500 tracking-wider mb-1">
                {metric.label}
              </span>
              <div className="flex items-baseline gap-1 flex-wrap">
                {metric.value > 0 ? (
                  <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {metric.formatCurrency ? (
                      formatIDR(metric.value)
                    ) : (
                      <>
                        <AnimatedCounter value={metric.value} decimals={metric.decimals ?? 0} />
                        {metric.suffix && <span className="text-sm font-normal text-slate-400 ml-0.5">{metric.suffix}</span>}
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-xl md:text-2xl font-extrabold text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {metric.sub && (
                  <p className="text-[11px] text-slate-400 truncate">{metric.sub}</p>
                )}
                {'gpsBadge' in metric && metric.gpsBadge && (
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-medium text-emerald-500/60 dark:text-emerald-400/50 shrink-0">
                    <Satellite className="w-2.5 h-2.5" /> GPS
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════ 4. OIL HEALTH + EXPENSES ═══════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        {/* ── Oil Health Card ── */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm">
          {/* Header */}
          <div className="p-5 pb-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Battery className="w-4 h-4" />
                </div>
                Kesehatan Oli
              </h3>
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${healthColor.border} ${healthColor.light} ${healthColor.text}`}>
                {oilLifePercent}%
              </span>
            </div>
            <p className="text-xs text-slate-400">Berdasarkan jarak tempuh dan waktu</p>
          </div>

          {/* Animated Circular Gauge */}
          <div className="flex justify-center py-3">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="68" fill="none" stroke="#e2e8f0" strokeWidth="8" className="dark:stroke-slate-800" />
                <motion.circle
                  cx="80" cy="80" r="68"
                  fill="none"
                  stroke={healthColor.stroke}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 68}
                  initial={{ strokeDashoffset: 2 * Math.PI * 68 }}
                  animate={{
                    strokeDashoffset: 2 * Math.PI * 68 * (1 - oilLifePercent / 100),
                  }}
                  transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
                />
                {/* Glow filter */}
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  className="text-3xl font-extrabold text-slate-900 dark:text-white font-display"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {oilLifePercent}%
                </motion.span>
                <span className="text-[11px] text-slate-400 font-semibold tracking-widest mt-0.5">
                  Sisa Kualitas
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="px-5 pb-5 space-y-3.5">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Milestone className="w-3 h-3" /> Jarak
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lastOilLog
                    ? `${elapsedKm.toLocaleString('id-ID')} / ${settings.oilChangeIntervalKm.toLocaleString('id-ID')} km`
                    : '-'}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${healthColor.bg}`}
                  initial={{ width: '0%' }}
                  animate={{ width: `${oilLifeKmPercent}%` }}
                  transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lastOilLog ? `Sisa ${remainingKm.toLocaleString('id-ID')} km` : '—'}
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Waktu
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lastOilLog ? `${elapsedDays} / ${settings.oilChangeIntervalDays} hari` : '-'}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${healthColor.bg}`}
                  initial={{ width: '0%' }}
                  animate={{ width: `${oilLifeDaysPercent}%` }}
                  transition={{ duration: 0.8, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lastOilLog ? `Sisa ${remainingDays} hari` : '—'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Monthly Expenses Chart ── */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm lg:col-span-2">
          <div className="p-5 pb-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                  <Activity className="w-4 h-4" />
                </div>
                Pengeluaran Bulanan
              </h3>
            </div>
            <p className="text-xs text-slate-400">Biaya BBM dan servis oli per bulan</p>
          </div>

          <div className="h-64 md:h-72 w-full px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedMonthlyData} margin={{ top: 10, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" strokeOpacity={0.6} />
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  stroke="#cbd5e1"
                  className="dark:stroke-slate-800"
                  tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : `${v}`}
                />
                <Tooltip
                  formatter={(value) => [formatIDR(Number(value)), '']}
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ fontWeight: 'bold', color: '#cbd5e1', marginBottom: 6 }}
                  itemStyle={{ padding: '2px 0' }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
                />
                <Bar
                  dataKey="fuel"
                  name="Pembelian BBM"
                  fill="#3b82f6"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="oil"
                  name="Servis / Oli"
                  fill="#a78bfa"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════════ 6. FUEL EFFICIENCY & CONSUMPTION TREND ═══════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 mt-4 md:mt-5">
        {/* ── Fuel Efficiency & Consumption Trend Chart (2 columns) ── */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm lg:col-span-2">
          <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white">
                  Grafik Efisiensi BBM
                </h3>
              </div>
            </div>

            {/* Metric Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold self-start sm:self-auto">
              <button
                onClick={() => setFuelMetricMode('km_l')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  fuelMetricMode === 'km_l'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                km/L
              </button>
              <button
                onClick={() => setFuelMetricMode('l_100km')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  fuelMetricMode === 'l_100km'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                L/100km
              </button>
              <button
                onClick={() => setFuelMetricMode('cost_km')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  fuelMetricMode === 'cost_km'
                    ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Rp/km
              </button>
            </div>
          </div>

          <div className="p-4 pt-5">
            <div className="h-64 md:h-72 w-full">
              {efficiencyTrendData.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center px-6">
                  <div className="p-4 rounded-full bg-slate-50 dark:bg-slate-800/50 mb-3">
                    <Fuel className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Belum Ada Data Efisiensi</p>
                  <p className="text-xs text-slate-400 mt-1 text-center max-w-[240px]">
                    Catat minimal 2 pengisian BBM untuk memantau konsumsi per kilometer
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onNavigate('fuel')}
                    className="mt-3 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                  >
                    Isi BBM Sekarang
                  </motion.button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={efficiencyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorKmL" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorL100" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorCostKm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" strokeOpacity={0.6} />
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" strokeOpacity={0.3} />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      stroke="#cbd5e1"
                      className="dark:stroke-slate-800"
                      unit={fuelMetricMode === 'km_l' ? ' km/L' : fuelMetricMode === 'l_100km' ? ' L' : ' Rp'}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ fontWeight: 'bold', color: '#cbd5e1', marginBottom: 6 }}
                      formatter={(val: any, name: any) => [
                        fuelMetricMode === 'cost_km'
                          ? `Rp ${val} / km`
                          : fuelMetricMode === 'l_100km'
                            ? `${val} Liter / 100 km`
                            : `${val} km / Liter`,
                        name
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

                    {fuelMetricMode === 'km_l' && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="Efisiensi (km/L)"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorKmL)"
                          activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                          animationDuration={1000}
                        />
                        <Line
                          type="monotone"
                          dataKey="Rata-rata km/L"
                          stroke="#ef4444"
                          strokeDasharray="5 5"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </>
                    )}

                    {fuelMetricMode === 'l_100km' && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="Konsumsi (L/100km)"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorL100)"
                          activeDot={{ r: 6, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                          animationDuration={1000}
                        />
                        <Line
                          type="monotone"
                          dataKey="Rata-rata L/100km"
                          stroke="#ef4444"
                          strokeDasharray="5 5"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </>
                    )}

                    {fuelMetricMode === 'cost_km' && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="Biaya/km (Rp)"
                          stroke="#8b5cf6"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorCostKm)"
                          activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
                          animationDuration={1000}
                        />
                        <Line
                          type="monotone"
                          dataKey="Rata-rata Biaya/km"
                          stroke="#ef4444"
                          strokeDasharray="5 5"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Fuel Consumption Analytics & Anatomy (1 column) ── */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                  <Compass className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white">
                  Konsumsi BBM
                </h3>
              </div>
              {avgEfficiency > 0 && (
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  avgEfficiency >= 45
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40'
                    : avgEfficiency >= 35
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40'
                      : avgEfficiency >= 25
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40'
                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/40'
                }`}>
                  {avgEfficiency >= 45 ? '🌿 Sangat Hemat' : avgEfficiency >= 35 ? '🔵 Standard Irit' : avgEfficiency >= 25 ? '🟡 Cukup Boros' : '🔴 Perlu Tune-up'}
                </span>
              )}
            </div>

            {/* Matrix Items */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider block mb-1">
                  Konsumsi / 100 KM
                </span>
                <span className="text-base font-extrabold text-slate-800 dark:text-white tabular-nums">
                  {avgEfficiency > 0 ? `${(100 / avgEfficiency).toFixed(2)} L` : '—'}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">Liter per 100 km</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider block mb-1">
                  Biaya per KM
                </span>
                <span className="text-base font-extrabold text-slate-800 dark:text-white tabular-nums">
                  {avgEfficiency > 0 ? `Rp ${(settings.fuelPricePerLiter / avgEfficiency).toFixed(0)}` : '—'}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">Rupiah per kilometer</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider block mb-1">
                  Jarak / Tangki (4L)
                </span>
                <span className="text-base font-extrabold text-slate-800 dark:text-white tabular-nums">
                  {avgEfficiency > 0 ? `${(4 * avgEfficiency).toFixed(0)} km` : '—'}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">Jarak full-tank (est.)</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider block mb-1">
                  Est. Biaya 100 KM
                </span>
                <span className="text-base font-extrabold text-slate-800 dark:text-white tabular-nums">
                  {avgEfficiency > 0 ? formatIDR((100 / avgEfficiency) * (settings.fuelPricePerLiter || 10000)) : '—'}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">Estimasi touring 100km</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
