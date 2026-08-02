import { OilLog, FuelLog, ServiceLog } from '../types';

/**
 * Helper to format currency in Indonesian Rupiah
 */
export function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Exports data to CSV format and triggers a download
 */
export function exportToCSV(
  oilLogs: OilLog[],
  fuelLogs: FuelLog[],
  type: 'oil' | 'fuel' | 'service' | 'all',
  serviceLogs?: ServiceLog[]
) {
  const BOM = '\uFEFF'; // Excel UTF-8 BOM

  if (type === 'oil' || type === 'all') {
    let csvContent = 'No,Tanggal,Jarak (km),Merek Oli,Tipe Oli,Biaya (Rp),Rating Performa (1-5),Catatan\n';
    
    oilLogs.forEach((log, index) => {
      const row = [
        index + 1,
        log.date,
        log.mileage,
        `"${log.oil_brand.replace(/"/g, '""')}"`,
        `"${log.oil_type.replace(/"/g, '""')}"`,
        log.cost,
        log.rating || 5,
        `"${(log.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
      csvContent += row + '\n';
    });

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Riwayat_Ganti_Oli_Motor_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (type === 'fuel' || type === 'all') {
    let csvContent = 'No,Tanggal,Jarak (km),Jumlah (Liter),Biaya (Rp),Jenis BBM,Efisiensi (km/L),Catatan\n';
    
    fuelLogs.forEach((log, index) => {
      const row = [
        index + 1,
        log.date,
        log.mileage,
        log.liters,
        log.cost,
        `"${log.fuel_type.replace(/"/g, '""')}"`,
        log.efficiency ? log.efficiency.toFixed(2) : '-',
        `"${(log.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
      csvContent += row + '\n';
    });

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Riwayat_Konsumsi_BBM_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if ((type === 'service' || type === 'all') && serviceLogs && serviceLogs.length > 0) {
    let csvContent = 'No,Tanggal,Jarak (km),Kategori,Rincian Pengerjaan,Spare Part Diganti,Biaya (Rp),Catatan\n';

    serviceLogs.forEach((log, index) => {
      const parts = (log.parts_changed || []).join('; ');
      const row = [
        index + 1,
        log.date,
        log.mileage,
        `"${(log.service_type || '').replace(/"/g, '""')}"`,
        `"${(log.description || '').replace(/"/g, '""')}"`,
        `"${parts.replace(/"/g, '""')}"`,
        log.cost,
        `"${(log.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
      csvContent += row + '\n';
    });

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Riwayat_Servis_Sparepart_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Triggers a print layout of the logs which can be saved directly as PDF by the user
 */
export function exportToPDF(oilLogs: OilLog[], fuelLogs: FuelLog[], serviceLogs: ServiceLog[] = []) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up diblokir! Harap izinkan pop-up untuk mencetak laporan PDF.');
    return;
  }

  // Calculate quick stats
  const totalOilCost = oilLogs.reduce((sum, log) => sum + log.cost, 0);
  const totalFuelCost = fuelLogs.reduce((sum, log) => sum + log.cost, 0);
  const totalServiceCost = serviceLogs.reduce((sum, log) => sum + log.cost, 0);
  const grandTotalCost = totalOilCost + totalFuelCost + totalServiceCost;

  // Average fuel efficiency
  const logsWithEfficiency = fuelLogs.filter(log => log.efficiency && log.efficiency > 0);
  const avgEfficiency = logsWithEfficiency.length > 0
    ? (logsWithEfficiency.reduce((sum, log) => sum + (log.efficiency || 0), 0) / logsWithEfficiency.length).toFixed(2)
    : '-';

  const maxMileage = Math.max(
    oilLogs.length > 0 ? oilLogs[0].mileage : 0,
    fuelLogs.length > 0 ? fuelLogs[0].mileage : 0,
    serviceLogs.length > 0 ? serviceLogs[0].mileage : 0
  );

  const formattedDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Laporan Performa & Perawatan Motor</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 24px;
          background-color: #ffffff;
          font-size: 14px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 3px double #cbd5e1;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .title-area h1 {
          margin: 0;
          font-size: 24px;
          color: #0f172a;
          letter-spacing: -0.5px;
        }
        .title-area p {
          margin: 4px 0 0 0;
          color: #64748b;
          font-size: 13px;
        }
        .meta-area {
          text-align: right;
          font-size: 12px;
          color: #475569;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;
          background-color: #f8fafc;
        }
        .stat-label {
          font-size: 11px;
          color: #64748b;
          text-transform: capitalize;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .stat-value {
          font-size: 18px;
          font-weight: bold;
          color: #0f172a;
        }
        h2 {
          font-size: 16px;
          border-left: 4px solid #d97706;
          padding-left: 8px;
          margin: 24px 0 12px 0;
          color: #0f172a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        th {
          background-color: #f1f5f9;
          color: #475569;
          font-weight: 600;
          text-align: left;
          padding: 8px 12px;
          font-size: 11px;
          text-transform: capitalize;
          border-bottom: 2px solid #cbd5e1;
        }
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
        }
        .rating-stars {
          color: #eab308;
          font-weight: bold;
        }
        .badge {
          display: inline-block;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: bold;
          margin-right: 4px;
          margin-bottom: 2px;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
        }
        @media print {
          body { padding: 0; }
          button { display: none; }
          .no-print { display: none; }
        }
        .btn-print {
          background-color: #d97706;
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 16px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <span style="font-weight: 500; color: #334155;">Laporan Cetak Siap. Silakan klik tombol di samping untuk mencetak atau simpan ke PDF.</span>
        <button onclick="window.print()" class="btn-print">
          🖨️ Cetak / Simpan PDF
        </button>
      </div>

      <div class="header">
        <div class="title-area">
          <h1>Laporan Perawatan, Servis & BBM Motor</h1>
          <p>Dokumentasi Performa & Riwayat Sparepart Kendaraan</p>
        </div>
        <div class="meta-area">
          <div>Dicetak pada:</div>
          <div style="font-weight: 600; color: #0f172a; margin-top: 2px;">${formattedDate}</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Odometer Terakhir</div>
          <div class="stat-value">${maxMileage.toLocaleString('id-ID')} km</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Biaya Servis & Sparepart</div>
          <div class="stat-value">${formatIDR(totalServiceCost)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Biaya Oli & BBM</div>
          <div class="stat-value">${formatIDR(totalOilCost + totalFuelCost)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Seluruh Pengeluaran</div>
          <div class="stat-value" style="color: #d97706">${formatIDR(grandTotalCost)}</div>
        </div>
      </div>

      <h2>Riwayat Servis & Pergantian Sparepart</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 12%">Tanggal</th>
            <th style="width: 13%">Odometer</th>
            <th style="width: 20%">Kategori & Pengerjaan</th>
            <th style="width: 25%">Sparepart Diganti</th>
            <th style="width: 13%">Biaya</th>
            <th style="width: 12%">Catatan</th>
          </tr>
        </thead>
        <tbody>
          ${serviceLogs.length === 0
            ? '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">Belum ada data servis & pergantian sparepart</td></tr>'
            : serviceLogs.map((log, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>${log.mileage.toLocaleString('id-ID')} km</td>
                  <td><strong>${log.service_type}</strong><br><span style="font-size:11px; color:#475569">${log.description}</span></td>
                  <td>${(log.parts_changed && log.parts_changed.length > 0) ? log.parts_changed.map(p => `<span class="badge">${p}</span>`).join('') : '-'}</td>
                  <td style="font-weight: bold; color: #d97706">${formatIDR(log.cost)}</td>
                  <td><span style="font-style: italic; color: #64748b">${log.notes || '-'}</span></td>
                </tr>
              `).join('')
          }
        </tbody>
      </table>

      <h2>Riwayat Penggantian Oli Motor</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 15%">Tanggal</th>
            <th style="width: 15%">Jarak Tempuh</th>
            <th style="width: 25%">Merek & Tipe Oli</th>
            <th style="width: 15%">Biaya</th>
            <th style="width: 10%">Rating</th>
            <th style="width: 15%">Catatan</th>
          </tr>
        </thead>
        <tbody>
          ${oilLogs.length === 0 
            ? '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">Belum ada data penggantian oli</td></tr>'
            : oilLogs.map((log, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>${log.mileage.toLocaleString('id-ID')} km</td>
                  <td><strong>${log.oil_brand}</strong><br><span style="font-size:10px; color:#64748b">${log.oil_type}</span></td>
                  <td>${formatIDR(log.cost)}</td>
                  <td class="rating-stars">${'★'.repeat(log.rating || 5)}${'☆'.repeat(5 - (log.rating || 5))}</td>
                  <td style="font-style: italic; color: #475569">${log.notes || '-'}</td>
                </tr>
              `).join('')
          }
        </tbody>
      </table>

      <h2>Riwayat Pembelian & Konsumsi BBM</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 15%">Tanggal</th>
            <th style="width: 15%">Jarak Tempuh</th>
            <th style="width: 15%">Jenis BBM</th>
            <th style="width: 15%">Pembelian</th>
            <th style="width: 15%">Biaya</th>
            <th style="width: 10%">Efisiensi</th>
            <th style="width: 10%">Catatan</th>
          </tr>
        </thead>
        <tbody>
          ${fuelLogs.length === 0 
            ? '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">Belum ada data pembelian BBM</td></tr>'
            : fuelLogs.map((log, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>${log.mileage.toLocaleString('id-ID')} km</td>
                  <td><strong>${log.fuel_type}</strong></td>
                  <td>${log.liters.toLocaleString('id-ID')} Liter</td>
                  <td>${formatIDR(log.cost)}</td>
                  <td style="font-weight: bold; color: ${log.efficiency && log.efficiency > 15 ? '#16a34a' : '#d97706'}">
                    ${log.efficiency ? `${log.efficiency.toFixed(1)} km/L` : '-'}
                  </td>
                  <td style="font-style: italic; color: #475569">${log.notes || '-'}</td>
                </tr>
              `).join('')
          }
        </tbody>
      </table>

      <div class="footer">
        <p>Laporan ini dibuat secara otomatis oleh Aplikasi <b>Motor.ku — Jurnal Oli, BBM & Servis</b>.</p>
        <p>Sistem Pelacakan Mandiri & Management Perawatan Kendaraan.</p>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

