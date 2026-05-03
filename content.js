/**
 * eKinerja Excel Importer - Content Script v3
 * Automates filling the "Tambah Progress Harian" form on kinerja.bkn.go.id
 *
 * DOM Structure (verified May 2026 via live inspection):
 * - Rencana Aksi: vue-select, input.vs__search, options: ul#vs2__listbox > li.vs__dropdown-option
 * - Tanggal: input.mx-input inside col with label "TANGGAL KEGIATAN"
 * - Jam Mulai: input.mx-input inside col with label "JAM MULAI KEGIATAN"
 * - Jam Selesai: input.mx-input inside col with label "JAM SELESAI KEGIATAN"
 * - Kegiatan Harian: input.form-control (NOT textarea)
 * - Sumber Data: input.form-control readonly value="ekinerja"
 * - Realisasi: input.form-control (number)
 * - Satuan: input#satuan.form-control
 * - Bukti Dukung: input.form-control
 * - OK: button.btn-primary
 * - Close: button.btn-light-secondary
 * - Tambah: button.btn-success
 */

(() => {
  'use strict';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function log(msg, data) {
    console.log(`[eKinerja Importer] ${msg}`, data !== undefined ? data : '');
  }

  /**
   * Set value on a Vue input element with proper event triggering
   */
  function setInputValue(element, value) {
    element.focus();

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * Find input element by walking DOWN from a label containing specific text.
   * Uses precise column-level scoping to avoid cross-matching between fields.
   */
  function findInputNearLabel(labelText) {
    const labels = document.querySelectorAll('label');
    for (const label of labels) {
      if (label.textContent.trim().toUpperCase().includes(labelText.toUpperCase())) {
        // Go to parent column/form-group — use specific Bootstrap col classes first
        const col = label.closest('[class*="col-"], .form-group');
        if (col) {
          // Find input inside this column (excluding readonly ones)
          const inputs = col.querySelectorAll('input.form-control:not([readonly]), input.mx-input, textarea');
          if (inputs.length > 0) return inputs[0];
        }

        // Fallback: look in the next sibling element
        let next = label.nextElementSibling;
        while (next) {
          const inp = next.querySelector('input, textarea') || (next.matches('input, textarea') ? next : null);
          if (inp && !inp.readOnly) return inp;
          next = next.nextElementSibling;
        }
      }
    }
    return null;
  }

  // ===== Step 1: Open Modal =====
  async function openAddModal() {
    log('Step 1: Opening modal...');

    if (!window.location.href.includes('kinerja.bkn.go.id')) {
      throw new Error('Bukan halaman eKinerja BKN');
    }

    const btn = document.querySelector('button.btn-success');
    if (btn && btn.textContent.trim().includes('Tambah Progress Harian')) {
      btn.click();
      await sleep(2000);
      log('Modal opened');
      return true;
    }

    // Fallback
    const allBtns = document.querySelectorAll('button');
    for (const b of allBtns) {
      if (b.textContent.trim().includes('Tambah Progress Harian')) {
        b.click();
        await sleep(2000);
        return true;
      }
    }

    throw new Error('Tombol "Tambah Progress Harian" tidak ditemukan');
  }

  // ===== Step 2: Select Rencana Aksi =====
  async function selectRencanaAksi(rencanaAksiText) {
    log('Step 2: Selecting Rencana Aksi:', rencanaAksiText.substring(0, 50));

    const searchInput = document.querySelector('input.vs__search');
    if (!searchInput) {
      throw new Error('Dropdown Rencana Aksi (vs__search) tidak ditemukan');
    }

    const toggle = searchInput.closest('.vs__dropdown-toggle');
    const combobox = document.querySelector('[role="combobox"]');

    // Try to open the dropdown — vue-select uses MOUSEDOWN (not click!)
    for (let attempt = 1; attempt <= 3; attempt++) {
      log(`Opening dropdown (attempt ${attempt})...`);

      // Method 1: mousedown on toggle (this is what vue-select listens to)
      if (toggle) {
        toggle.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, view: window
        }));
        await sleep(300);
      }

      // Method 2: Focus the search input (triggers onSearchFocus in vue-select)
      searchInput.focus();
      searchInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      await sleep(500);

      // Method 3: Click on the open-indicator (chevron arrow)
      const indicator = document.querySelector('.vs__open-indicator');
      if (indicator) {
        indicator.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, view: window
        }));
        await sleep(300);
      }

      // Check if dropdown opened
      const expanded = combobox?.getAttribute('aria-expanded');
      log(`aria-expanded = ${expanded}`);

      if (expanded === 'true') {
        log('Dropdown opened successfully');
        break;
      }

      await sleep(500);
    }

    // Wait for options to render
    await sleep(1500);

    // Find options
    let options = document.querySelectorAll('li.vs__dropdown-option');
    log(`Found ${options.length} vs__dropdown-option items`);

    if (options.length === 0) {
      // Try all possible selectors
      const selectors = [
        'ul.vs__dropdown-menu li',
        '[id*="listbox"] li',
        'li[id*="vs"]',
        'ul[role="listbox"] li',
        'li[role="option"]'
      ];
      for (const sel of selectors) {
        options = document.querySelectorAll(sel);
        if (options.length > 0) {
          log(`Found ${options.length} items with selector "${sel}"`);
          break;
        }
      }
    }

    // Debug: Log options or DOM state
    if (options.length > 0) {
      log('Available options:');
      options.forEach((opt, i) => log(`  [${i}] "${opt.textContent.trim().substring(0, 70)}"`));
    } else {
      log('WARNING: Still 0 options! Checking dropdown state:');
      const comboboxState = combobox?.getAttribute('aria-expanded');
      log('aria-expanded:', comboboxState);
      const listbox = document.querySelector('[id*="listbox"]');
      log('Listbox element:', listbox ? `found (${listbox.children.length} children)` : 'NOT found');
      const vsParent = searchInput.closest('.v-select') || searchInput.parentElement?.parentElement;
      if (vsParent) {
        log('Full vs parent HTML:', vsParent.outerHTML.substring(0, 800));
      }
    }

    // Match and click
    const target = rencanaAksiText.toLowerCase().trim();
    const targetWords = target.split(/\s+/).filter(w => w.length > 3);

    // Pass 1: Substring match
    for (const opt of options) {
      const optText = opt.textContent.trim().toLowerCase();
      if (optText.includes(target.substring(0, 25)) || target.includes(optText.substring(0, 25))) {
        log('Match (substring):', opt.textContent.trim().substring(0, 50));
        opt.click();
        await sleep(1000);
        return true;
      }
    }

    // Pass 2: Word match
    for (const opt of options) {
      const optText = opt.textContent.trim().toLowerCase();
      const matchCount = targetWords.filter(w => optText.includes(w)).length;
      if (matchCount >= 3 || (matchCount >= 2 && targetWords.length <= 4)) {
        log('Match (words):', opt.textContent.trim().substring(0, 50));
        opt.click();
        await sleep(1000);
        return true;
      }
    }

    // Pass 3: Fallback
    if (options.length > 0) {
      log('WARNING: No match, clicking first option');
      options[0].click();
      await sleep(1000);
      return true;
    }

    throw new Error(`Rencana Aksi "${rencanaAksiText.substring(0, 40)}..." tidak ditemukan di dropdown (0 options)`);
  }

  // ===== Step 3: Set Tanggal =====
  async function setTanggal(dateStr) {
    log('Step 3: Setting tanggal:', dateStr);

    // Find by label "TANGGAL KEGIATAN"
    const input = findInputNearLabel('TANGGAL KEGIATAN');
    if (input) {
      setInputValue(input, dateStr);
      await sleep(300);
      log('Tanggal set via label match');
      return true;
    }

    // Fallback: positional — mx-inputs inside modal, first one is date
    const modal = document.querySelector('.modal.show, .modal[style*="display: block"], [class*="modal"]');
    const mxInputs = (modal || document).querySelectorAll('input.mx-input');
    if (mxInputs.length >= 1) {
      setInputValue(mxInputs[0], dateStr);
      await sleep(300);
      log('Tanggal set by position (index 0)');
      return true;
    }

    throw new Error('Input tanggal tidak ditemukan');
  }

  // ===== Step 4 & 5: Set Jam =====
  async function setJamMulai(timeStr) {
    log('Step 4: Setting jam mulai:', timeStr);

    const input = findInputNearLabel('JAM MULAI KEGIATAN');
    if (input) {
      setInputValue(input, timeStr);
      await sleep(200);
      log('Jam mulai set via label match');
      return true;
    }

    // Fallback: positional (index 1)
    const modal = document.querySelector('.modal.show, .modal[style*="display: block"], [class*="modal"]');
    const mxInputs = (modal || document).querySelectorAll('input.mx-input');
    if (mxInputs.length >= 2) {
      setInputValue(mxInputs[1], timeStr);
      await sleep(200);
      log('Jam mulai set by position (index 1)');
      return true;
    }

    throw new Error('Input jam mulai tidak ditemukan');
  }

  async function setJamSelesai(timeStr) {
    log('Step 5: Setting jam selesai:', timeStr);

    const input = findInputNearLabel('JAM SELESAI KEGIATAN');
    if (input) {
      setInputValue(input, timeStr);
      await sleep(200);
      log('Jam selesai set via label match');
      return true;
    }

    // Fallback: positional (index 2)
    const modal = document.querySelector('.modal.show, .modal[style*="display: block"], [class*="modal"]');
    const mxInputs = (modal || document).querySelectorAll('input.mx-input');
    if (mxInputs.length >= 3) {
      setInputValue(mxInputs[2], timeStr);
      await sleep(200);
      log('Jam selesai set by position (index 2)');
      return true;
    }

    throw new Error('Input jam selesai tidak ditemukan');
  }

  // ===== Step 6: Set Kegiatan Harian =====
  async function setKegiatan(text) {
    log('Step 6: Setting kegiatan:', text.substring(0, 40));

    const input = findInputNearLabel('KEGIATAN HARIAN');
    if (input) {
      setInputValue(input, text);
      await sleep(300);
      log('Kegiatan set via label match');
      return true;
    }

    // Fallback: find all non-special form-control inputs
    const allInputs = document.querySelectorAll('input.form-control:not(.mx-input):not(.vs__search):not(#satuan):not([readonly])');
    for (const inp of allInputs) {
      // Skip inputs that already have values (like sumber data)
      if (inp.value && inp.value.length > 0) continue;
      const parent = inp.closest('[class*="col-"], .form-group');
      if (parent && parent.textContent.toUpperCase().includes('KEGIATAN')) {
        setInputValue(inp, text);
        await sleep(300);
        return true;
      }
    }

    throw new Error('Input kegiatan harian tidak ditemukan');
  }

  // ===== Step 7: Set Realisasi =====
  async function setRealisasi(value) {
    log('Step 7: Setting realisasi:', value);

    const input = findInputNearLabel('REALISASI');
    if (input && input.id !== 'satuan') {
      setInputValue(input, value);
      await sleep(200);
      log('Realisasi set via label match');
      return true;
    }

    // Fallback: find form-control inputs near REALISASI text
    const allInputs = document.querySelectorAll('input.form-control:not(.mx-input):not(.vs__search):not(#satuan):not([readonly])');
    for (const inp of allInputs) {
      const parent = inp.closest('[class*="col-"], .form-group, .row');
      if (parent && parent.textContent.toUpperCase().includes('REALISASI') && parent.textContent.toUpperCase().includes('BILANGAN BULAT')) {
        if (inp.id !== 'satuan') {
          setInputValue(inp, value);
          await sleep(200);
          log('Realisasi set via parent text match');
          return true;
        }
      }
    }

    console.warn('[eKinerja Importer] Input realisasi tidak ditemukan');
    return false;
  }

  // ===== Step 7.5: Set Satuan =====
  async function setSatuan(value) {
    if (!value) return true;

    log('Step 7.5: Setting satuan:', value);

    const satuanInput = document.getElementById('satuan');
    if (satuanInput) {
      if (!satuanInput.readOnly && !satuanInput.disabled) {
        setInputValue(satuanInput, value);
        await sleep(200);
        log('Satuan set');
        return true;
      } else {
        log('Satuan is readonly (auto-filled)');
        return true;
      }
    }

    console.warn('[eKinerja Importer] Input satuan tidak ditemukan');
    return false;
  }

  // ===== Step 8: Set Bukti Dukung =====
  async function setBuktiDukung(link) {
    if (!link) return true;

    log('Step 8: Setting bukti dukung:', link.substring(0, 40));

    const input = findInputNearLabel('BUKTI DUKUNG');
    if (input) {
      setInputValue(input, link);
      await sleep(200);
      log('Bukti dukung set via label match');
      return true;
    }

    // Fallback
    const allInputs = document.querySelectorAll('input.form-control:not(.mx-input):not(.vs__search):not(#satuan):not([readonly])');
    for (const inp of allInputs) {
      const parent = inp.closest('[class*="col-"], .form-group');
      if (parent) {
        const pt = parent.textContent.toUpperCase();
        if (pt.includes('BUKTI DUKUNG') || pt.includes('GOOGLE DRIVE')) {
          setInputValue(inp, link);
          await sleep(200);
          return true;
        }
      }
    }

    console.warn('[eKinerja Importer] Input bukti dukung tidak ditemukan');
    return false;
  }

  // ===== Step 9: Submit =====
  async function submitForm() {
    log('Step 9: Submitting form...');

    // Find button.btn-primary with text "OK"
    const primaryBtns = document.querySelectorAll('button.btn-primary');
    for (const btn of primaryBtns) {
      if (btn.textContent.trim() === 'OK') {
        btn.click();
        await sleep(2500);
        log('Submitted via OK button');
        return true;
      }
    }

    // Fallback
    const allBtns = document.querySelectorAll('button');
    for (const btn of allBtns) {
      const t = btn.textContent.trim();
      if (t === 'OK' || t === 'Simpan' || t === 'Submit') {
        btn.click();
        await sleep(2500);
        return true;
      }
    }

    throw new Error('Tombol OK tidak ditemukan');
  }

  // ===== Close Modal =====
  async function closeModal() {
    const closeBtn = document.querySelector('button.btn-light-secondary');
    if (closeBtn && closeBtn.textContent.trim() === 'Close') {
      closeBtn.click();
      await sleep(500);
      return;
    }
    const xBtn = document.querySelector('.modal .close, .btn-close, [aria-label="Close"]');
    if (xBtn) {
      xBtn.click();
      await sleep(500);
    }
  }

  // ===== Main Fill Function =====
  async function fillSingleEntry(data) {
    log('=== Starting fill entry ===');
    log('Data:', JSON.stringify(data).substring(0, 300));

    if (!window.location.href.includes('kinerja.bkn.go.id')) {
      return { success: false, error: 'Halaman bukan eKinerja BKN' };
    }

    try {
      await openAddModal();
      await sleep(1000);

      if (!window.location.href.includes('kinerja.bkn.go.id')) {
        return { success: false, error: 'Halaman ter-redirect' };
      }

      await selectRencanaAksi(data.rencana_aksi);
      await sleep(500);

      await setTanggal(data.tanggal);
      await setJamMulai(data.jam_mulai);
      await setJamSelesai(data.jam_selesai);
      await setKegiatan(data.kegiatan);
      await setRealisasi(data.realisasi);

      if (data.satuan) {
        await setSatuan(data.satuan);
      }

      await setBuktiDukung(data.bukti_dukung);
      await sleep(500);

      await submitForm();
      await sleep(2000);

      log('=== Entry filled successfully ===');
      return { success: true };
    } catch (error) {
      console.error('[eKinerja Importer] Error:', error);
      try { await closeModal(); } catch (e) { }
      await sleep(1000);
      return { success: false, error: error.message };
    }
  }

  // ===== Message Listener =====
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ status: 'pong', url: window.location.href });
      return false;
    }

    if (message.action === 'fillEntry') {
      log('fillEntry received');
      fillSingleEntry(message.data).then(result => {
        log('fillEntry result:', result);
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (message.action === 'getPageInfo') {
      sendResponse({
        url: window.location.href,
        title: document.title,
        hasAddButton: !!document.querySelector('button.btn-success')
      });
      return false;
    }
  });

  log('Content script v3 loaded on', window.location.href);
})();
