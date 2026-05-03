# eKinerja Chrome Extension

Chrome Extension untuk mengimport data progress harian dari file Excel ke **eKinerja BKN** (kinerja.bkn.go.id) secara otomatis.

## ✨ Fitur

- **Upload Excel** (.xlsx, .xls, .csv) dengan drag & drop
- **Flexible column mapping** — header kolom dikenali otomatis (Bahasa Indonesia & Inggris)
- **Preview data** sebelum import dalam tabel
- **Import otomatis** — mengisi form "Tambah Progress Harian" satu per satu
- **Progress tracking** dengan progress bar dan activity log
- **Template download** — template Excel siap pakai
- **Delay configurable** — atur jeda antar entry (default 3 detik)

## 📦 Instalasi

1. **Download/Clone** repository ini
   ```bash
   git clone https://github.com/achmadfzi/ekinerja-importer.git
   ```
2. Buka **Google Chrome** → ketik `chrome://extensions/` di address bar
3. Aktifkan **Developer mode** (toggle di kanan atas)
4. Klik **"Load unpacked"**
5. Pilih folder `ekinerja-importer`
6. Extension akan muncul di toolbar Chrome

## 📖 Cara Pakai

1. **Login** ke eKinerja → buka halaman **Progress Harian**
2. **Klik icon extension** di toolbar Chrome
3. **Upload file Excel** atau download template terlebih dahulu
4. **Preview data** — pastikan data sudah benar
5. **Klik "Mulai Import"** — extension otomatis mengisi form

## 📋 Format Excel

| Kolom | Deskripsi | Contoh |
|-------|-----------|--------|
| Rencana Aksi | Nama rencana aksi dari dropdown | Jumlah Perangkat daerah... |
| Tanggal | Tanggal kegiatan (YYYY-MM-DD) | 2026-05-03 |
| Jam Mulai | Jam mulai kegiatan (HH:MM) | 08:00 |
| Jam Selesai | Jam selesai kegiatan (HH:MM) | 16:00 |
| Kegiatan Harian | Deskripsi kegiatan | Melakukan koordinasi... |
| Realisasi | Jumlah realisasi (bilangan bulat) | 1 |
| Satuan | Satuan output | Dokumen |
| Bukti Dukung | Link Google Drive/Dropbox (opsional) | https://drive.google.com/... |

> **Tip:** Download template Excel dari extension untuk format yang benar.

## 🛠️ Tech Stack

- **Chrome Extension Manifest V3**
- **SheetJS (xlsx)** — parsing Excel files
- **Vanilla JS** — no framework dependencies
- **Vue-select** interaction — kompatibel dengan eKinerja SPA

## ⚠️ Disclaimer

Extension ini **tidak berafiliasi** dengan BKN (Badan Kepegawaian Negara). Gunakan dengan bijak dan bertanggung jawab. Pastikan data yang diimport sesuai dengan kinerja aktual Anda.

## 📄 Lisensi

MIT License
