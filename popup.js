/**
 * eKinerja Excel Importer - Popup Script
 * Handles Excel file parsing, preview, and communication with content script
 */

// ===== State =====
let parsedData = [];
let isImporting = false;
let currentTabId = null;

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const uploadArea = $('#uploadArea');
const fileInput = $('#fileInput');
const fileInfo = $('#fileInfo');
const fileName = $('#fileName');
const fileMeta = $('#fileMeta');
const removeFileBtn = $('#removeFile');
const downloadTemplateBtn = $('#downloadTemplate');
const previewSection = $('#previewSection');
const previewBody = $('#previewBody');
const rowCount = $('#rowCount');
const importSection = $('#importSection');
const startImportBtn = $('#startImport');
const stopImportBtn = $('#stopImport');
const delayInput = $('#delayInput');
const progressContainer = $('#progressContainer');
const progressText = $('#progressText');
const progressPercent = $('#progressPercent');
const progressFill = $('#progressFill');
const logContainer = $('#logContainer');
const logEntries = $('#logEntries');
const clearLogBtn = $('#clearLog');
const statusBadge = $('#statusBadge');
const connectionBar = $('#connectionBar');

// ===== Column Mappings =====
const COLUMN_ALIASES = {
  rencana_aksi: ['rencana aksi', 'rencana_aksi', 'rencanaaksi', 'aksi', 'plan', 'action plan'],
  tanggal: ['tanggal', 'tanggal kegiatan', 'date', 'tgl'],
  jam_mulai: ['jam mulai', 'jam_mulai', 'jammulai', 'mulai', 'start', 'start time', 'waktu mulai'],
  jam_selesai: ['jam selesai', 'jam_selesai', 'jamselesai', 'selesai', 'end', 'end time', 'waktu selesai'],
  kegiatan: ['kegiatan', 'kegiatan harian', 'aktivitas', 'activity', 'deskripsi', 'uraian', 'uraian kegiatan'],
  realisasi: ['realisasi', 'qty', 'jumlah', 'quantity', 'output', 'capaian'],
  satuan: ['satuan', 'unit', 'uom', 'satuan output'],
  bukti_dukung: ['bukti dukung', 'bukti_dukung', 'buktidukung', 'bukti', 'link', 'evidence', 'link bukti']
};

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', async () => {
  await checkConnection();
  setupEventListeners();
});

async function checkConnection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    
    if (tab.url && tab.url.includes('kinerja.bkn.go.id')) {
      // Try to ping content script (already auto-injected via manifest.json)
      try {
        const response = await chrome.tabs.sendMessage(currentTabId, { action: 'ping' });
        if (response && response.status === 'pong') {
          setConnectionStatus(true);
          return;
        }
      } catch (e) {
        console.log('Content script belum siap, mungkin halaman perlu di-refresh');
      }
    }
    setConnectionStatus(false);
  } catch (e) {
    setConnectionStatus(false);
  }
}

function setConnectionStatus(connected) {
  if (connected) {
    connectionBar.className = 'connection-bar';
    connectionBar.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span>Terhubung ke eKinerja</span>
    `;
  } else {
    connectionBar.className = 'connection-bar disconnected';
    connectionBar.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span>Buka halaman Progress Harian di eKinerja terlebih dahulu</span>
    `;
  }
}

// ===== Event Listeners =====
function setupEventListeners() {
  // Upload area click
  uploadArea.addEventListener('click', () => fileInput.click());
  
  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });
  
  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragging');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragging');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragging');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  
  // Remove file
  removeFileBtn.addEventListener('click', resetUpload);
  
  // Download template
  downloadTemplateBtn.addEventListener('click', downloadTemplate);
  
  // Start import
  startImportBtn.addEventListener('click', startImport);
  
  // Stop import
  stopImportBtn.addEventListener('click', stopImport);
  
  // Clear log
  clearLogBtn.addEventListener('click', () => {
    logEntries.innerHTML = '';
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'importProgress') {
      handleImportProgress(message);
    }
  });
}

// ===== File Handling =====
function handleFile(file) {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ];
  
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    addLog('Format file tidak didukung. Gunakan .xlsx, .xls, atau .csv', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
      
      if (rawData.length < 2) {
        addLog('File kosong atau hanya berisi header', 'error');
        return;
      }
      
      parsedData = parseExcelData(rawData);
      
      if (parsedData.length === 0) {
        addLog('Tidak ada data valid yang ditemukan. Periksa format kolom.', 'error');
        return;
      }
      
      // Show file info
      uploadArea.style.display = 'none';
      fileInfo.style.display = 'flex';
      fileName.textContent = file.name;
      fileMeta.textContent = `${parsedData.length} baris data • ${formatFileSize(file.size)}`;
      
      // Show preview
      showPreview();
      
      addLog(`File "${file.name}" berhasil dimuat: ${parsedData.length} baris data`, 'success');
    } catch (err) {
      addLog(`Error membaca file: ${err.message}`, 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseExcelData(rawData) {
  const headers = rawData[0].map(h => String(h).toLowerCase().trim());
  
  // Map headers to our columns
  const columnMap = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = headers.findIndex(h => aliases.some(a => h.includes(a)));
    if (index !== -1) {
      columnMap[key] = index;
    }
  }
  
  // Check required columns
  const required = ['rencana_aksi', 'tanggal', 'jam_mulai', 'jam_selesai', 'kegiatan'];
  const missing = required.filter(r => columnMap[r] === undefined);
  if (missing.length > 0) {
    addLog(`Kolom tidak ditemukan: ${missing.join(', ')}. Periksa header Excel.`, 'error');
    addLog(`Header yang terdeteksi: ${headers.join(', ')}`, 'warning');
    return [];
  }
  
  // Parse rows
  const rows = [];
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0 || !row[columnMap.rencana_aksi]) continue;
    
    const entry = {
      index: i,
      rencana_aksi: String(row[columnMap.rencana_aksi] || '').trim(),
      tanggal: formatDate(row[columnMap.tanggal]),
      jam_mulai: formatTime(row[columnMap.jam_mulai]),
      jam_selesai: formatTime(row[columnMap.jam_selesai]),
      kegiatan: String(row[columnMap.kegiatan] || '').trim(),
      realisasi: columnMap.realisasi !== undefined ? String(row[columnMap.realisasi] || '1').trim() : '1',
      satuan: columnMap.satuan !== undefined ? String(row[columnMap.satuan] || '').trim() : '',
      bukti_dukung: columnMap.bukti_dukung !== undefined ? String(row[columnMap.bukti_dukung] || '').trim() : '',
      status: 'pending'
    };
    
    rows.push(entry);
  }
  
  return rows;
}

function formatDate(value) {
  if (!value) return '';
  const str = String(value).trim();
  
  // Already in yyyy-mm-dd format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  
  // dd/mm/yyyy or dd-mm-yyyy
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  
  // Try Date object
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  
  return str;
}

function formatTime(value) {
  if (!value) return '';
  const str = String(value).trim();
  
  // HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  
  // HH:MM:SS format
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  
  // Decimal time (Excel stores time as fraction of day)
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  
  return str;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===== Preview =====
function showPreview() {
  previewSection.style.display = 'block';
  importSection.style.display = 'block';
  rowCount.textContent = `${parsedData.length} baris`;
  
  previewBody.innerHTML = '';
  parsedData.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.id = `row-${idx}`;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td title="${escapeHtml(row.rencana_aksi)}">${escapeHtml(truncate(row.rencana_aksi, 25))}</td>
      <td>${row.tanggal}</td>
      <td>${row.jam_mulai}</td>
      <td>${row.jam_selesai}</td>
      <td title="${escapeHtml(row.kegiatan)}">${escapeHtml(truncate(row.kegiatan, 25))}</td>
      <td>${row.realisasi}${row.satuan ? ' ' + row.satuan : ''}</td>
      <td title="${escapeHtml(row.bukti_dukung)}">${row.bukti_dukung ? '✓' : '-'}</td>
    `;
    previewBody.appendChild(tr);
  });
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Reset =====
function resetUpload() {
  parsedData = [];
  fileInput.value = '';
  uploadArea.style.display = 'block';
  fileInfo.style.display = 'none';
  previewSection.style.display = 'none';
  importSection.style.display = 'none';
  progressContainer.style.display = 'none';
  logContainer.style.display = 'none';
}

// ===== Template Download =====
function downloadTemplate() {
  const templateData = [
    ['Rencana Aksi', 'Tanggal', 'Jam Mulai', 'Jam Selesai', 'Kegiatan Harian', 'Realisasi', 'Satuan', 'Bukti Dukung'],
    ['Jumlah nama domain dan sub domain pemerintah daerah serta layanan SPBE yang dikelola', '2026-05-03', '08:00', '10:00', 'Melakukan pendataan domain dan subdomain', '1', 'Dokumen', 'https://drive.google.com/...'],
    ['Jumlah Perangkat daerah yang terhubung dan memanfaatkan akses internet', '2026-05-03', '10:00', '12:00', 'Koordinasi dengan perangkat daerah terkait akses internet', '1', 'Perangkat Daerah', ''],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(templateData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 50 },  // Rencana Aksi
    { wch: 12 },  // Tanggal
    { wch: 10 },  // Jam Mulai
    { wch: 10 },  // Jam Selesai
    { wch: 50 },  // Kegiatan Harian
    { wch: 10 },  // Realisasi
    { wch: 18 },  // Satuan
    { wch: 35 },  // Bukti Dukung
  ];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'template_ekinerja_harian.xlsx');
  
  addLog('Template Excel berhasil didownload', 'success');
}

// ===== Import Logic =====
async function startImport() {
  if (parsedData.length === 0) {
    addLog('Tidak ada data untuk diimport', 'error');
    return;
  }
  
  // Simple ping check without re-injecting scripts
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'ping' });
    if (!response || response.status !== 'pong') {
      addLog('Content script tidak merespons. Refresh halaman eKinerja dan coba lagi.', 'error');
      return;
    }
  } catch (e) {
    addLog('Tidak dapat terhubung ke halaman eKinerja. Pastikan Anda di halaman Progress Harian dan refresh halaman.', 'error');
    return;
  }
  
  isImporting = true;
  const delay = parseInt(delayInput.value) * 1000 || 3000;
  
  // Update UI
  startImportBtn.style.display = 'none';
  stopImportBtn.style.display = 'flex';
  progressContainer.style.display = 'block';
  logContainer.style.display = 'block';
  setStatus('importing', 'Mengimport...');
  
  addLog(`Memulai import ${parsedData.length} data dengan delay ${delay/1000}s`, 'info');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < parsedData.length; i++) {
    if (!isImporting) {
      addLog('Import dihentikan oleh user', 'warning');
      break;
    }
    
    const entry = parsedData[i];
    updateProgress(i, parsedData.length);
    highlightRow(i, 'processing');
    
    addLog(`[${i + 1}/${parsedData.length}] Mengisi: ${truncate(entry.kegiatan, 40)}`, 'info');
    
    try {
      const result = await chrome.tabs.sendMessage(currentTabId, {
        action: 'fillEntry',
        data: entry
      });
      
      if (result && result.success) {
        entry.status = 'success';
        successCount++;
        highlightRow(i, 'success');
        addLog(`[${i + 1}] ✓ Berhasil diinput`, 'success');
      } else {
        entry.status = 'error';
        errorCount++;
        highlightRow(i, 'error');
        addLog(`[${i + 1}] ✗ Gagal: ${result?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      entry.status = 'error';
      errorCount++;
      highlightRow(i, 'error');
      addLog(`[${i + 1}] ✗ Error: ${err.message}`, 'error');
    }
    
    // Wait between entries
    if (i < parsedData.length - 1 && isImporting) {
      addLog(`Menunggu ${delay/1000}s sebelum entry berikutnya...`, 'warning');
      await sleep(delay);
    }
  }
  
  // Complete
  updateProgress(parsedData.length, parsedData.length);
  isImporting = false;
  startImportBtn.style.display = 'flex';
  startImportBtn.textContent = 'Import Ulang';
  stopImportBtn.style.display = 'none';
  
  if (errorCount === 0) {
    setStatus('done', 'Selesai!');
    addLog(`🎉 Import selesai! ${successCount} data berhasil diinput.`, 'success');
  } else {
    setStatus('error', 'Selesai (ada error)');
    addLog(`Import selesai. Berhasil: ${successCount}, Gagal: ${errorCount}`, 'warning');
  }
}

function stopImport() {
  isImporting = false;
  stopImportBtn.style.display = 'none';
  startImportBtn.style.display = 'flex';
  startImportBtn.textContent = 'Lanjutkan Import';
  setStatus('ready', 'Dihentikan');
}

// ===== UI Helpers =====
function updateProgress(current, total) {
  const percent = Math.round((current / total) * 100);
  progressText.textContent = `${current} / ${total}`;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
}

function highlightRow(index, status) {
  const row = document.getElementById(`row-${index}`);
  if (row) {
    row.className = '';
    if (status) row.classList.add(`row-${status}`);
  }
}

function setStatus(state, text) {
  statusBadge.className = `status-badge ${state}`;
  statusBadge.querySelector('.status-text').textContent = text;
}

function addLog(message, type = '') {
  logContainer.style.display = 'block';
  const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">[${now}]</span> <span>${escapeHtml(message)}</span>`;
  logEntries.appendChild(entry);
  logEntries.scrollTop = logEntries.scrollHeight;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
