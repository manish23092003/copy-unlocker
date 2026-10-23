document.addEventListener('DOMContentLoaded', async () => {
  // Copy unlocker elements
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const hostnameEl = document.getElementById('hostname');
  const toggleBtn = document.getElementById('toggle-btn');
  const errorMsg = document.getElementById('error-message');

  // OCR elements
  const btnScreenOcr = document.getElementById('btn-screen-ocr');
  const btnImageOcr = document.getElementById('btn-image-ocr');
  const fileInput = document.getElementById('popup-file-input');
  const ocrError = document.getElementById('ocr-error');
  const workspace = document.getElementById('popup-ocr-workspace');
  const btnCloseWorkspace = document.getElementById('btn-close-workspace');
  const progressBox = document.getElementById('popup-progress-box');
  const progressStatus = document.getElementById('popup-progress-status');
  const progressPct = document.getElementById('popup-progress-pct');
  const progressBarFill = document.getElementById('popup-progress-bar-fill');
  const ocrTextarea = document.getElementById('popup-ocr-text');
  const btnCopy = document.getElementById('popup-btn-copy');
  const btnSelectAll = document.getElementById('popup-btn-select-all');
  const btnClear = document.getElementById('popup-btn-clear');

  let currentTab = null;
  let currentHostname = '';
  let activePopupJobId = null;
  let isCurrentSiteEnabled = false;

  // Helper: Verify if URL is eligible for content scripts
  function isSupportedUrl(urlStr) {
    if (!urlStr) return false;
    try {
      const url = new URL(urlStr);
      return !(
        url.protocol === 'chrome:' ||
        url.protocol === 'chrome-extension:' ||
        url.protocol === 'edge:' ||
        url.protocol === 'about:' ||
        url.protocol === 'data:' ||
        url.protocol === 'view-source:' ||
        url.protocol === 'devtools:' ||
        url.hostname === 'chrome.google.com' ||
        url.hostname === 'chromewebstore.google.com'
      );
    } catch (e) {
      return false;
    }
  }

  // Helper: Send message to tab with automatic dynamic injection fallback
  async function sendTabMessageSafe(tabId, message) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, message);
      if (res === undefined) {
        return { success: false, error: new Error('No response from content script') };
      }
      return { success: true, data: res };
    } catch (err) {
      // If content script is not yet injected on this tab, attempt dynamic injection via scripting API
      if (chrome.scripting && chrome.scripting.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ['content.js']
          });
          const retryRes = await chrome.tabs.sendMessage(tabId, message);
          if (retryRes === undefined) {
            return { success: false, error: new Error('No response after script injection') };
          }
          return { success: true, data: retryRes };
        } catch (injectErr) {
          return { success: false, error: injectErr || err };
        }
      }
      return { success: false, error: err };
    }
  }

  function updateUI(isEnabled) {
    toggleBtn.disabled = false;
    if (isEnabled) {
      statusText.textContent = "Enabled on this site";
      statusText.className = "status-text enabled";
      statusIndicator.className = "status-indicator active";
      toggleBtn.textContent = "Disable Copy Unlocker";
      toggleBtn.className = "toggle-btn disable-btn";
    } else {
      statusText.textContent = "Disabled on this site";
      statusText.className = "status-text disabled";
      statusIndicator.className = "status-indicator";
      toggleBtn.textContent = "Enable Copy Unlocker";
      toggleBtn.className = "toggle-btn enable-btn";
    }
  }

  function showProtectedPageWarning(msg) {
    statusText.textContent = "Unavailable on this page";
    statusText.className = "status-text disabled";
    if (statusIndicator) statusIndicator.className = "status-indicator";
    toggleBtn.disabled = true;
    toggleBtn.textContent = "Enable Copy Unlocker";
    toggleBtn.className = "toggle-btn enable-btn";
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');

    btnScreenOcr.disabled = true;
    btnScreenOcr.style.opacity = '0.5';
    btnScreenOcr.style.cursor = 'not-allowed';
    btnScreenOcr.title = "Screen OCR cannot run on browser-protected pages";
  }

  function showReloadPrompt(message) {
    errorMsg.innerHTML = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    
    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = 'Reload Tab';
    reloadBtn.className = 'btn-mini btn-mini-primary';
    reloadBtn.style.marginTop = '6px';
    reloadBtn.style.width = '100%';
    reloadBtn.style.display = 'block';
    reloadBtn.addEventListener('click', () => {
      chrome.tabs.reload(currentTab.id);
      window.close();
    });

    errorMsg.appendChild(textSpan);
    errorMsg.appendChild(reloadBtn);
    errorMsg.classList.remove('hidden');
  }

  function showError(msg) {
    statusText.textContent = "Error";
    statusText.className = "status-text disabled";
    if (statusIndicator) statusIndicator.className = "status-indicator";
    toggleBtn.disabled = true;
    toggleBtn.textContent = "Enable Copy Unlocker";
    toggleBtn.className = "toggle-btn enable-btn";
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab || !tab.url) {
      throw new Error("Unable to access current tab.");
    }

    const url = new URL(tab.url);
    currentHostname = url.hostname;
    hostnameEl.textContent = currentHostname || url.protocol;
    hostnameEl.title = tab.url;

    // Check for protected pages
    if (!isSupportedUrl(tab.url)) {
      showProtectedPageWarning("Browser-protected page. Copy Unlocker cannot modify browser settings or internal pages.");
      return;
    }

    // Load state from storage
    const result = await chrome.storage.local.get([currentHostname]);
    const savedState = result[currentHostname] === true;

    // Verify active state with content script
    const stateCheck = await sendTabMessageSafe(currentTab.id, { action: 'getState' });
    if (stateCheck.success && stateCheck.data && typeof stateCheck.data.enabled === 'boolean') {
      isCurrentSiteEnabled = stateCheck.data.enabled;
      // If content script is active but out of sync with saved preference, sync it
      if (savedState !== isCurrentSiteEnabled) {
        const syncRes = await sendTabMessageSafe(currentTab.id, {
          action: 'toggle',
          enabled: savedState,
          hostname: currentHostname
        });
        if (syncRes.success && syncRes.data && typeof syncRes.data.enabled === 'boolean') {
          isCurrentSiteEnabled = syncRes.data.enabled;
        }
      }
      updateUI(isCurrentSiteEnabled);
    } else {
      // Content script is NOT reachable or injection failed
      // Never report the page as enabled when the content script did not apply the change
      isCurrentSiteEnabled = false;
      updateUI(false);
      if (savedState) {
        showReloadPrompt("Copy Unlocker is enabled for this domain, but this tab needs to be reloaded to activate.");
      }
    }

    toggleBtn.addEventListener('click', async () => {
      errorMsg.classList.add('hidden');
      const newState = !isCurrentSiteEnabled;
      
      // 1. Always update per-site preference in storage immediately
      await chrome.storage.local.set({ [currentHostname]: newState });

      // 2. Deliver toggle command to content script
      const sendResult = await sendTabMessageSafe(currentTab.id, {
        action: 'toggle',
        enabled: newState,
        hostname: currentHostname
      });

      if (sendResult.success && sendResult.data && sendResult.data.status === 'ok') {
        isCurrentSiteEnabled = sendResult.data.enabled === true;
        updateUI(isCurrentSiteEnabled);
      } else {
        // Content script could not be contacted or failed
        isCurrentSiteEnabled = false;
        updateUI(false);
        if (newState) {
          showReloadPrompt("This page was opened before Copy Unlocker was updated. Please reload the tab to activate.");
        } else {
          showReloadPrompt("Preference saved as disabled. Please reload this tab to ensure all copy restrictions return.");
        }
      }
    });

    // Cross-context storage synchronization (e.g. if Alt+Shift+C shortcut toggles while popup is open)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && currentHostname && changes[currentHostname]) {
        const prefVal = changes[currentHostname].newValue === true;
        if (prefVal !== isCurrentSiteEnabled) {
          sendTabMessageSafe(currentTab.id, { action: 'getState' }).then(res => {
            if (res.success && res.data && typeof res.data.enabled === 'boolean') {
              isCurrentSiteEnabled = res.data.enabled;
              updateUI(isCurrentSiteEnabled);
            }
          }).catch(() => {});
        }
      }
    });

  } catch (err) {
    showError(err.message || "An error occurred.");
  }

  // --- Screen OCR from Popup ---
  btnScreenOcr.addEventListener('click', async () => {
    ocrError.classList.add('hidden');
    if (!currentTab || !isSupportedUrl(currentTab.url)) {
      ocrError.textContent = 'Screen OCR cannot run on browser-protected pages (chrome://) or the Chrome Web Store.';
      ocrError.classList.remove('hidden');
      return;
    }

    // Ensure content script is ready before closing popup
    const testPing = await sendTabMessageSafe(currentTab.id, { action: 'ping' });
    if (!testPing.success) {
      ocrError.innerHTML = '<span>Screen capture requires the tab to be reloaded.</span>';
      const reloadBtn = document.createElement('button');
      reloadBtn.textContent = 'Reload Tab';
      reloadBtn.className = 'btn-mini btn-mini-primary';
      reloadBtn.style.marginTop = '6px';
      reloadBtn.style.width = '100%';
      reloadBtn.style.display = 'block';
      reloadBtn.addEventListener('click', () => {
        chrome.tabs.reload(currentTab.id);
        window.close();
      });
      ocrError.appendChild(reloadBtn);
      ocrError.classList.remove('hidden');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'triggerScreenOcrFromPopup'
      });

      if (response && response.success) {
        window.close();
      } else {
        ocrError.textContent = (response && response.error) || 'Failed to start screen selection.';
        ocrError.classList.remove('hidden');
      }
    } catch (err) {
      ocrError.textContent = 'Could not initiate screen capture: ' + err.message;
      ocrError.classList.remove('hidden');
    }
  });

  // --- Image File OCR from Popup ---
  btnImageOcr.addEventListener('click', () => {
    ocrError.classList.add('hidden');
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp', 'image/bmp'].includes(file.type)) {
      ocrError.textContent = 'Unsupported image format. Please select a PNG, JPEG, WebP, or BMP file.';
      ocrError.classList.remove('hidden');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result;
      startLocalImageOcr(dataUri);
    };
    reader.onerror = () => {
      ocrError.textContent = 'Failed to read image file from disk.';
      ocrError.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  async function startLocalImageOcr(dataUri) {
    workspace.classList.remove('hidden');
    progressBox.classList.remove('hidden');
    progressStatus.textContent = 'Initializing engine...';
    progressPct.textContent = '0%';
    progressBarFill.style.width = '0%';
    ocrTextarea.value = '';
    ocrError.classList.add('hidden');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'performImageOcr',
        imageUri: dataUri,
        lang: 'eng'
      });

      if (response && response.success) {
        activePopupJobId = response.jobId;
      } else {
        progressBox.classList.add('hidden');
        ocrError.textContent = (response && response.error) || 'Failed to start OCR.';
        ocrError.classList.remove('hidden');
      }
    } catch (err) {
      progressBox.classList.add('hidden');
      ocrError.textContent = 'Error running OCR: ' + err.message;
      ocrError.classList.remove('hidden');
    }
  }

  // --- Runtime listener for popup OCR jobs ---
  chrome.runtime.onMessage.addListener((request) => {
    if (!activePopupJobId || request.jobId !== activePopupJobId) return;

    if (request.action === 'ocrProgress') {
      progressStatus.textContent = request.message || 'Recognizing text...';
      const pct = Math.min(100, Math.max(0, Math.round(request.progress * 100)));
      progressPct.textContent = `${pct}%`;
      progressBarFill.style.width = `${pct}%`;
    }

    if (request.action === 'ocrSuccess') {
      activePopupJobId = null;
      progressBox.classList.add('hidden');
      const text = (request.text || '').trim();
      ocrTextarea.value = text;
      
      if (!text) {
        ocrError.textContent = 'No readable text was detected in this image.';
        ocrError.classList.remove('hidden');
      } else {
        ocrTextarea.focus();
        btnCopy.focus();
      }
    }

    if (request.action === 'ocrError') {
      activePopupJobId = null;
      progressBox.classList.add('hidden');
      ocrError.textContent = request.error || 'Text recognition failed.';
      ocrError.classList.remove('hidden');
    }
  });

  // --- Workspace Actions ---
  btnCopy.addEventListener('click', async () => {
    const text = ocrTextarea.value;
    if (!text) {
      ocrError.textContent = 'No text available to copy.';
      ocrError.classList.remove('hidden');
      return;
    }

    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (e) {
        // Fallback
      }
    }

    if (!copied) {
      try {
        ocrTextarea.focus();
        ocrTextarea.select();
        copied = document.execCommand('copy');
      } catch (err) {
        copied = false;
      }
    }

    if (copied) {
      btnCopy.classList.add('copied');
      btnCopy.textContent = '✓ Copied!';
      setTimeout(() => {
        btnCopy.classList.remove('copied');
        btnCopy.textContent = 'Copy Text';
      }, 1800);
    } else {
      btnCopy.classList.add('failed');
      btnCopy.textContent = 'Copy failed';
      ocrError.textContent = 'Could not access clipboard. Please select the text manually and press Ctrl+C.';
      ocrError.classList.remove('hidden');
      setTimeout(() => {
        btnCopy.classList.remove('failed');
        btnCopy.textContent = 'Copy Text';
      }, 2200);
    }
  });

  btnSelectAll.addEventListener('click', () => {
    ocrTextarea.focus();
    ocrTextarea.select();
  });

  btnClear.addEventListener('click', () => {
    ocrTextarea.value = '';
    ocrTextarea.focus();
  });

  btnCloseWorkspace.addEventListener('click', () => {
    workspace.classList.add('hidden');
    ocrError.classList.add('hidden');
    if (activePopupJobId) {
      chrome.runtime.sendMessage({ action: 'cancelOcr', jobId: activePopupJobId }).catch(() => {});
      activePopupJobId = null;
    }
  });

  // Keyboard accessibility
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!workspace.classList.contains('hidden')) {
        workspace.classList.add('hidden');
      } else {
        window.close();
      }
    }
  });
});
