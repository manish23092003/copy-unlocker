(function() {
  if (window.copyUnlockerInitialized) return;
  window.copyUnlockerInitialized = true;

  let isEnabled = false;
  let styleElement = null;
  
  const eventsToIntercept = [
    'copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'
  ];
  
  const keyEvents = ['keydown', 'keypress', 'keyup'];

  const stopPropagationHandler = (e) => {
    // If user is interacting with our own OCR modal or selection overlay, do not intercept
    if (e.target) {
      if (e.target.id === 'copy-unlocker-ocr-host' || e.target.id === 'copy-unlocker-selection-overlay') {
        return;
      }
      if (e.target.closest && (e.target.closest('#copy-unlocker-ocr-host') || e.target.closest('#copy-unlocker-selection-overlay'))) {
        return;
      }
    }

    if (!isEnabled) return;
    
    if (keyEvents.includes(e.type)) {
      const isCopyCutPaste = (e.ctrlKey || e.metaKey) && 
        ['c', 'x', 'a', 'v', 'C', 'X', 'A', 'V'].includes(e.key);
      const targetTag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
      const isInput = targetTag === 'input' || targetTag === 'textarea' || e.target.isContentEditable;
      
      if (isCopyCutPaste && !isInput) {
        e.stopImmediatePropagation();
      }
      return;
    }

    e.stopImmediatePropagation();
  };

  function injectCSS() {
    let existing = document.getElementById('copy-unlocker-style');
    if (!existing) {
      styleElement = document.createElement('style');
      styleElement.id = 'copy-unlocker-style';
      styleElement.textContent = `
        * {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
        }
      `;
      const target = document.head || document.documentElement;
      if (target) {
        target.appendChild(styleElement);
      }
    } else {
      styleElement = existing;
    }
  }

  function removeCSS() {
    // 1. Remove all style elements matching id copy-unlocker-style anywhere in the document
    const existingStyles = document.querySelectorAll('#copy-unlocker-style');
    existingStyles.forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
    styleElement = null;

    // 2. Clear active text selections so text highlighted while enabled cannot still be copied
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        selection.removeAllRanges();
      }
    } catch (e) {
      // Ignore if getSelection is not available in frame
    }
  }

  function attachEvents() {
    eventsToIntercept.forEach(evt => {
      window.addEventListener(evt, stopPropagationHandler, true);
      document.addEventListener(evt, stopPropagationHandler, true);
    });
    keyEvents.forEach(evt => {
      window.addEventListener(evt, stopPropagationHandler, true);
      document.addEventListener(evt, stopPropagationHandler, true);
    });
  }

  function detachEvents() {
    eventsToIntercept.forEach(evt => {
      window.removeEventListener(evt, stopPropagationHandler, true);
      document.removeEventListener(evt, stopPropagationHandler, true);
    });
    keyEvents.forEach(evt => {
      window.removeEventListener(evt, stopPropagationHandler, true);
      document.removeEventListener(evt, stopPropagationHandler, true);
    });
  }

  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (!isEnabled) return;
      if (!document.getElementById('copy-unlocker-style')) {
        injectCSS();
      }
    });
    const target = document.documentElement || document.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function enableCopy() {
    if (isEnabled && document.getElementById('copy-unlocker-style')) return;
    isEnabled = true;
    injectCSS();
    attachEvents();
    startObserver();
  }

  function disableCopy() {
    if (!isEnabled && !styleElement && !document.getElementById('copy-unlocker-style')) {
      return;
    }
    isEnabled = false;
    stopObserver();
    removeCSS();
    detachEvents();
  }

  // Initial check on load
  const hostname = window.location.hostname;
  if (hostname) {
    chrome.storage.local.get([hostname], (result) => {
      if (result[hostname] === true) {
        enableCopy();
      } else {
        disableCopy();
      }
    });
  }

  // Cross-frame and live storage synchronization
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && hostname && changes[hostname]) {
      const shouldEnable = changes[hostname].newValue === true;
      if (shouldEnable) {
        enableCopy();
      } else {
        disableCopy();
      }
    }
  });

  // ==========================================
  // OCR & SCREEN REGION EXTRACTION SYSTEM
  // ==========================================
  let isSelectingRegion = false;
  let ocrModalHost = null;
  let currentOcrJobId = null;
  let lastOcrParams = null; // for Retry action
  let selectedLanguage = 'eng';

  // --- Screen Region Selection ---
  function startScreenSelection() {
    if (window !== window.top) return;
    if (isSelectingRegion) return;
    isSelectingRegion = true;

    const overlay = document.createElement('div');
    overlay.id = 'copy-unlocker-selection-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483640',
      cursor: 'crosshair',
      userSelect: 'none',
      webkitUserSelect: 'none',
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      overflow: 'hidden'
    });

    // Helper banner at top
    const banner = document.createElement('div');
    banner.textContent = 'Drag a rectangle around text to extract • Press ESC to cancel';
    Object.assign(banner.style, {
      position: 'absolute',
      top: '18px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '7px 16px',
      background: 'rgba(17, 24, 39, 0.94)',
      color: '#f9fafb',
      fontSize: '13px',
      fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      borderRadius: '20px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
      pointerEvents: 'none',
      letterSpacing: '0.2px'
    });
    overlay.appendChild(banner);

    // Box highlight element
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'absolute',
      display: 'none',
      border: '2px solid #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.08)',
      boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
      pointerEvents: 'none'
    });

    // Dimension badge
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      position: 'absolute',
      bottom: '-24px',
      right: '0',
      background: '#1d4ed8',
      color: '#ffffff',
      fontSize: '11px',
      fontWeight: '600',
      fontFamily: 'ui-monospace, monospace',
      padding: '2px 5px',
      borderRadius: '3px',
      whiteSpace: 'nowrap',
      display: 'none'
    });
    box.appendChild(badge);
    overlay.appendChild(box);

    let startX = 0;
    let startY = 0;
    let isMouseDown = false;

    function cleanupSelection() {
      isSelectingRegion = false;
      window.removeEventListener('keydown', onKeyDown, true);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanupSelection();
      }
    }

    overlay.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isMouseDown = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = '0px';
      box.style.height = '0px';
      box.style.display = 'block';
      badge.style.display = 'block';
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      badge.textContent = `${width} × ${height}`;
    });

    overlay.addEventListener('mouseup', async (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;

      const currentX = e.clientX;
      const currentY = e.clientY;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      cleanupSelection();

      // Ignore trivial accidental clicks (< 10px)
      if (width < 10 || height < 10) {
        return;
      }

      const crop = {
        x: left,
        y: top,
        width: width,
        height: height,
        dpr: window.devicePixelRatio || 1,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };

      lastOcrParams = { type: 'screen', crop };

      // Open OCR modal immediately in loading state
      const modal = getOrCreateOcrModal();
      if (modal) {
        modal.showLoading('Capturing screen region...');
      }

      // Notify background to capture tab and run OCR
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'captureAndOcr',
          crop: crop,
          lang: selectedLanguage
        });

        if (response && response.success) {
          currentOcrJobId = response.jobId;
        } else {
          modal.showError((response && response.error) || 'Screen capture failed. Please try again.');
        }
      } catch (err) {
        modal.showError('Unable to capture screen: ' + (err.message || 'Unknown error'));
      }
    });

    window.addEventListener('keydown', onKeyDown, true);
    (document.body || document.documentElement).appendChild(overlay);
  }

  // --- Image OCR Trigger ---
  function startImageOcr(imageUrl) {
    if (window !== window.top) return;
    if (!imageUrl) return;
    lastOcrParams = { type: 'image', imageUrl };

    const modal = getOrCreateOcrModal();
    if (!modal) return;
    modal.showLoading('Preparing image for text recognition...');

    chrome.runtime.sendMessage({
      action: 'performImageOcr',
      imageUri: imageUrl,
      lang: selectedLanguage
    }).then(response => {
      if (response && response.success) {
        currentOcrJobId = response.jobId;
      } else {
        modal.showError((response && response.error) || 'Failed to process image. It may be protected or restricted.');
      }
    }).catch(err => {
      modal.showError('Image OCR failed: ' + (err.message || 'Communication error'));
    });
  }

  // --- Isolated Shadow DOM OCR Modal ---
  function getOrCreateOcrModal() {
    if (window !== window.top) return null;
    if (ocrModalHost && document.getElementById('copy-unlocker-ocr-host')) {
      return ocrModalHost._controller;
    }

    if (ocrModalHost && ocrModalHost.parentNode) {
      ocrModalHost.parentNode.removeChild(ocrModalHost);
    }

    ocrModalHost = document.createElement('div');
    ocrModalHost.id = 'copy-unlocker-ocr-host';
    ocrModalHost.style.position = 'fixed';
    ocrModalHost.style.zIndex = '2147483647';
    ocrModalHost.style.inset = '0';
    ocrModalHost.style.pointerEvents = 'none';

    const shadow = ocrModalHost.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
        }
        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          pointer-events: auto;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.15s ease, visibility 0.15s ease;
        }
        .modal-backdrop.open {
          opacity: 1;
          visibility: visible;
        }
        .modal-card {
          background: #ffffff;
          width: 100%;
          max-width: 580px;
          border-radius: 10px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          max-height: 90vh;
          border: 1px solid #e2e8f0;
          animation: scaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes scaleIn {
          from { transform: scale(0.97); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        /* Header */
        .modal-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
        }
        .header-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .header-icon {
          width: 18px;
          height: 18px;
          fill: #2563eb;
        }
        .header-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .btn-close {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 20px;
          line-height: 1;
          padding: 2px 6px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.15s, color 0.15s;
        }
        .btn-close:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        /* Body */
        .modal-body {
          padding: 14px 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        /* Progress View */
        .progress-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }
        .progress-track {
          width: 100%;
          height: 6px;
          background: #e2e8f0;
          border-radius: 9999px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          width: 0%;
          background: #2563eb;
          border-radius: 9999px;
          transition: width 0.2s ease;
        }
        .btn-cancel-job {
          align-self: flex-end;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-size: 12px;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-cancel-job:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        /* Error Banner */
        .error-banner {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          padding: 9px 12px;
          border-radius: 6px;
          font-size: 12.5px;
          line-height: 1.4;
          display: none;
        }
        /* Preview bar */
        .preview-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          border-radius: 6px;
        }
        .preview-thumb {
          max-height: 44px;
          max-width: 80px;
          object-fit: contain;
          border-radius: 4px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
        }
        .preview-meta {
          font-size: 12px;
          color: #475569;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .preview-title {
          font-weight: 600;
          color: #0f172a;
        }
        /* Textarea Area */
        .editor-wrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .editor-label-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }
        .textarea-result {
          width: 100%;
          min-height: 150px;
          max-height: 300px;
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          line-height: 1.5;
          color: #0f172a;
          background: #ffffff;
          resize: vertical;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .textarea-result:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }
        /* Footer Controls */
        .modal-footer {
          padding: 10px 16px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .left-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .right-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background-color 0.15s, transform 0.05s, border-color 0.15s;
          user-select: none;
        }
        .btn:active {
          transform: scale(0.98);
        }
        .btn-primary {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
        }
        .btn-primary:hover {
          background: #1d4ed8;
        }
        .btn-primary.ready-highlight {
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35);
        }
        .btn-primary.copied {
          background: #16a34a !important;
          border-color: #16a34a !important;
        }
        .btn-primary.failed {
          background: #dc2626 !important;
          border-color: #dc2626 !important;
        }
        .btn-secondary {
          background: #ffffff;
          color: #334155;
          border-color: #cbd5e1;
        }
        .btn-secondary:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .lang-select {
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          color: #334155;
          outline: none;
          cursor: pointer;
        }
      </style>
      <div class="modal-backdrop" id="backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <div class="header-title-wrap">
              <svg class="header-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5v14h16V5H4zm14 12H6V7h12v10zM8 9h8v2H8zm0 4h5v2H8z"/>
              </svg>
              <span class="header-title" id="modal-title">Copy Unlocker • OCR Text Extraction</span>
            </div>
            <button class="btn-close" id="btn-close-x" aria-label="Close dialog">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Progress box -->
            <div class="progress-box" id="progress-box">
              <div class="progress-header">
                <span id="progress-status">Preparing OCR engine...</span>
                <span id="progress-percent">0%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" id="progress-fill"></div>
              </div>
              <button class="btn-cancel-job" id="btn-cancel-ocr">Cancel</button>
            </div>

            <!-- Error banner -->
            <div class="error-banner" id="error-banner"></div>

            <!-- Preview bar -->
            <div class="preview-bar" id="preview-bar" style="display: none;">
              <img class="preview-thumb" id="preview-thumb" alt="Captured source preview">
              <div class="preview-meta">
                <span class="preview-title" id="preview-title">Source Preview</span>
                <span id="preview-details">Local browser OCR processing</span>
              </div>
            </div>

            <!-- Editable textarea -->
            <div class="editor-wrap">
              <div class="editor-label-row">
                <span>Extracted Text (Editable)</span>
                <span id="text-stats">0 characters • 0 words</span>
              </div>
              <textarea class="textarea-result" id="ocr-textarea" placeholder="Extracted text will appear here. You can edit, copy, or select it freely." spellcheck="false"></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <div class="left-controls">
              <button class="btn btn-secondary" id="btn-retry" title="Re-run OCR on the same image or screen region">Retry OCR</button>
              <button class="btn btn-secondary" id="btn-clear" title="Clear current extracted text">Clear</button>
              <select class="lang-select" id="lang-select" title="Recognition Language">
                <option value="eng" selected>English (eng)</option>
              </select>
            </div>
            <div class="right-controls">
              <button class="btn btn-secondary" id="btn-select-all">Select All</button>
              <button class="btn btn-primary" id="btn-copy">
                <span id="copy-btn-text">Copy Text</span>
              </button>
              <button class="btn btn-secondary" id="btn-close">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(ocrModalHost);

    // DOM References
    const backdrop = shadow.getElementById('backdrop');
    const btnCloseX = shadow.getElementById('btn-close-x');
    const btnClose = shadow.getElementById('btn-close');
    const btnCancelOcr = shadow.getElementById('btn-cancel-ocr');
    const btnCopy = shadow.getElementById('btn-copy');
    const copyBtnText = shadow.getElementById('copy-btn-text');
    const btnSelectAll = shadow.getElementById('btn-select-all');
    const btnRetry = shadow.getElementById('btn-retry');
    const btnClear = shadow.getElementById('btn-clear');
    const langSelect = shadow.getElementById('lang-select');
    const textarea = shadow.getElementById('ocr-textarea');
    const progressBox = shadow.getElementById('progress-box');
    const progressStatus = shadow.getElementById('progress-status');
    const progressPercent = shadow.getElementById('progress-percent');
    const progressFill = shadow.getElementById('progress-fill');
    const errorBanner = shadow.getElementById('error-banner');
    const previewBar = shadow.getElementById('preview-bar');
    const previewThumb = shadow.getElementById('preview-thumb');
    const previewDetails = shadow.getElementById('preview-details');
    const textStats = shadow.getElementById('text-stats');

    function updateStats() {
      const val = textarea.value;
      const chars = val.length;
      const words = val.trim() ? val.trim().split(/\s+/).length : 0;
      textStats.textContent = `${chars} characters • ${words} words`;
    }

    textarea.addEventListener('input', updateStats);

    // Language selection
    langSelect.addEventListener('change', (e) => {
      selectedLanguage = e.target.value;
    });

    // Close logic
    function closeModal() {
      backdrop.classList.remove('open');
      if (currentOcrJobId) {
        chrome.runtime.sendMessage({ action: 'cancelOcr', jobId: currentOcrJobId }).catch(() => {});
        currentOcrJobId = null;
      }
    }

    btnCloseX.addEventListener('click', closeModal);
    btnClose.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Keyboard support: Escape closes modal
    shadow.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    });

    // Cancel OCR
    btnCancelOcr.addEventListener('click', () => {
      if (currentOcrJobId) {
        chrome.runtime.sendMessage({ action: 'cancelOcr', jobId: currentOcrJobId }).catch(() => {});
        currentOcrJobId = null;
      }
      progressBox.style.display = 'none';
      errorBanner.textContent = 'Text recognition was cancelled.';
      errorBanner.style.display = 'block';
    });

    // Copy Text with Accurate Verification
    btnCopy.addEventListener('click', async () => {
      const textToCopy = textarea.value;
      if (!textToCopy) {
        errorBanner.textContent = 'No text available to copy.';
        errorBanner.style.display = 'block';
        return;
      }

      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          copied = true;
        } catch (err) {
          console.warn('navigator.clipboard failed, attempting fallback...', err);
        }
      }

      if (!copied) {
        try {
          textarea.focus();
          textarea.select();
          copied = document.execCommand('copy');
        } catch (err) {
          copied = false;
        }
      }

      if (copied) {
        btnCopy.classList.remove('ready-highlight');
        btnCopy.classList.add('copied');
        copyBtnText.textContent = '✓ Copied!';
        setTimeout(() => {
          btnCopy.classList.remove('copied');
          copyBtnText.textContent = 'Copy Text';
        }, 1800);
      } else {
        btnCopy.classList.add('failed');
        copyBtnText.textContent = 'Copy failed';
        errorBanner.textContent = 'Clipboard access was blocked by browser permissions. Please press Ctrl+C to copy manually.';
        errorBanner.style.display = 'block';
        setTimeout(() => {
          btnCopy.classList.remove('failed');
          copyBtnText.textContent = 'Copy Text';
        }, 2200);
      }
    });

    // Select All
    btnSelectAll.addEventListener('click', () => {
      textarea.focus();
      textarea.select();
    });

    // Clear
    btnClear.addEventListener('click', () => {
      textarea.value = '';
      updateStats();
      textarea.focus();
      btnCopy.classList.remove('ready-highlight');
    });

    // Retry OCR
    btnRetry.addEventListener('click', () => {
      if (!lastOcrParams) return;
      controller.showLoading('Restarting OCR recognition...');
      if (lastOcrParams.type === 'screen') {
        chrome.runtime.sendMessage({
          action: 'captureAndOcr',
          crop: lastOcrParams.crop,
          lang: selectedLanguage
        }).then(res => {
          if (res && res.success) currentOcrJobId = res.jobId;
          else controller.showError((res && res.error) || 'Retry failed.');
        }).catch(err => controller.showError(err.message));
      } else if (lastOcrParams.type === 'image') {
        chrome.runtime.sendMessage({
          action: 'performImageOcr',
          imageUri: lastOcrParams.imageUrl,
          lang: selectedLanguage
        }).then(res => {
          if (res && res.success) currentOcrJobId = res.jobId;
          else controller.showError((res && res.error) || 'Retry failed.');
        }).catch(err => controller.showError(err.message));
      }
    });

    const controller = {
      showLoading(msg = 'Recognizing visible text...') {
        errorBanner.style.display = 'none';
        progressBox.style.display = 'flex';
        progressStatus.textContent = msg;
        progressPercent.textContent = '0%';
        progressFill.style.width = '0%';
        btnCopy.classList.remove('ready-highlight');
        backdrop.classList.add('open');
      },
      updateProgress(msg, progress) {
        progressBox.style.display = 'flex';
        if (msg) progressStatus.textContent = msg;
        const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
        progressPercent.textContent = `${pct}%`;
        progressFill.style.width = `${pct}%`;
      },
      setResult(text, confidence, previewUrl) {
        progressBox.style.display = 'none';
        errorBanner.style.display = 'none';
        const cleanText = (text || '').trim();
        textarea.value = cleanText;
        updateStats();

        if (previewUrl) {
          previewThumb.src = previewUrl;
          previewBar.style.display = 'flex';
          const confText = confidence > 0 ? `Confidence: ${Math.round(confidence)}%` : 'Local recognition complete';
          previewDetails.textContent = confText;
        }

        if (!cleanText) {
          errorBanner.textContent = 'No readable text was detected in the selected area. You can try selecting a clearer area or retry.';
          errorBanner.style.display = 'block';
          btnCopy.classList.remove('ready-highlight');
        } else {
          // Highlight "Copy Text" button prominently for fast one-click copying
          btnCopy.classList.add('ready-highlight');
          btnCopy.focus();
        }

        backdrop.classList.add('open');
      },
      showError(errorMsg) {
        progressBox.style.display = 'none';
        errorBanner.textContent = errorMsg || 'An error occurred during text extraction.';
        errorBanner.style.display = 'block';
        btnCopy.classList.remove('ready-highlight');
        backdrop.classList.add('open');
      }
    };

    ocrModalHost._controller = controller;
    return controller;
  }

  // --- Runtime Message Listener ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Lightweight presence ping
    if (request.action === 'ping') {
      sendResponse({ status: 'ok', enabled: isEnabled });
      return;
    }

    // Existing Copy Unlocker toggle
    if (request.action === 'toggle') {
      if (request.enabled) {
        enableCopy();
      } else {
        disableCopy();
      }
      sendResponse({ status: 'ok', enabled: isEnabled });
      return;
    }
    
    // Existing Copy Unlocker getState
    if (request.action === 'getState') {
      sendResponse({ enabled: isEnabled });
      return;
    }

    // Screen selection trigger
    if (request.action === 'startScreenSelection') {
      startScreenSelection();
      sendResponse({ started: true });
      return;
    }

    // Image OCR trigger
    if (request.action === 'startImageOcr') {
      startImageOcr(request.imageUrl);
      sendResponse({ started: true });
      return;
    }

    // OCR Progress update from background/offscreen
    if (request.action === 'ocrProgress') {
      if (currentOcrJobId && request.jobId === currentOcrJobId) {
        const modal = getOrCreateOcrModal();
        if (modal) modal.updateProgress(request.message, request.progress);
      }
      return;
    }

    // OCR Success
    if (request.action === 'ocrSuccess') {
      if (currentOcrJobId && request.jobId === currentOcrJobId) {
        currentOcrJobId = null;
        const modal = getOrCreateOcrModal();
        if (modal) modal.setResult(request.text, request.confidence, request.previewUrl);
      }
      return;
    }

    // OCR Error
    if (request.action === 'ocrError') {
      if (currentOcrJobId && request.jobId === currentOcrJobId) {
        currentOcrJobId = null;
        const modal = getOrCreateOcrModal();
        if (modal) modal.showError(request.error);
      }
      return;
    }

    // OCR Cancelled
    if (request.action === 'ocrCancelled') {
      if (currentOcrJobId && request.jobId === currentOcrJobId) {
        currentOcrJobId = null;
        const modal = getOrCreateOcrModal();
        if (modal) modal.showError('Extraction was cancelled.');
      }
      return;
    }
  });
})();
