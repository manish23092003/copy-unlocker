// Initialize context menus on install or update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    // Context menu for images
    chrome.contextMenus.create({
      id: 'copy-unlocker-extract-image',
      title: 'Extract Text with Copy Unlocker',
      contexts: ['image']
    });

    // Context menu for page/selection
    chrome.contextMenus.create({
      id: 'copy-unlocker-extract-screen',
      title: 'Capture Screen Region',
      contexts: ['page', 'selection']
    });
  });
});

// Helper: Check if tab is accessible for content scripts and captures
function isTabAccessible(urlStr) {
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

// Offscreen document management
let creatingOffscreenPromise = null;

async function hasOffscreenDocument() {
  if ('getContexts' in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });
    return Boolean(contexts.length);
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS', 'BLOBS'],
    justification: 'Run local Tesseract OCR engine for text extraction'
  });

  try {
    await creatingOffscreenPromise;
  } finally {
    creatingOffscreenPromise = null;
  }
}

// Track jobs: jobId -> tabId
const activeJobs = new Map();

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id || !isTabAccessible(tab.url)) {
    return;
  }

  if (info.menuItemId === 'copy-unlocker-extract-image') {
    const imageUrl = info.srcUrl;
    if (!imageUrl) return;

    await sendTabMessageSafe(tab.id, {
      action: 'startImageOcr',
      imageUrl: imageUrl
    });
  } else if (info.menuItemId === 'copy-unlocker-extract-screen') {
    await sendTabMessageSafe(tab.id, {
      action: 'startScreenSelection'
    });
  }
});

// Keyboard command handler
chrome.commands.onCommand.addListener(async (command) => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  if (!tab || !tab.id || !tab.url) return;

  if (command === 'toggle-copy-unlocker') {
    if (!isTabAccessible(tab.url)) return;
    const url = new URL(tab.url);
    const hostname = url.hostname;
    const result = await chrome.storage.local.get([hostname]);
    const currentState = result[hostname] === true;
    const newState = !currentState;

    await chrome.storage.local.set({ [hostname]: newState });

    await sendTabMessageSafe(tab.id, {
      action: 'toggle',
      enabled: newState,
      hostname: hostname
    });
  } else if (command === 'extract-screen-ocr') {
    if (!isTabAccessible(tab.url)) return;
    await sendTabMessageSafe(tab.id, {
      action: 'startScreenSelection'
    });
  }
});

// Internal message routing between Content Script, Popup, and Offscreen Document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Capture screen region and run OCR
  if (request.action === 'captureAndOcr') {
    handleCaptureAndOcr(request, sender, sendResponse);
    return true; // asynchronous response
  }

  // Run OCR on an image URL
  if (request.action === 'performImageOcr') {
    handleImageOcr(request, sender, sendResponse);
    return true;
  }

  // Cancel in-flight OCR job
  if (request.action === 'cancelOcr') {
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'cancelOcr',
        jobId: request.jobId
      });
    });
    sendResponse({ ok: true });
    return true;
  }

  // Trigger screen selection from popup
  if (request.action === 'triggerScreenOcrFromPopup') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab || !tab.id) {
        sendResponse({ success: false, error: 'No active tab found.' });
        return;
      }
      if (!isTabAccessible(tab.url)) {
        sendResponse({
          success: false,
          error: 'Screen OCR cannot run on browser-internal pages (chrome://) or the Chrome Web Store.'
        });
        return;
      }
      const res = await sendTabMessageSafe(tab.id, { action: 'startScreenSelection' });
      if (res.success) {
        sendResponse({ success: true });
      } else {
        sendResponse({
          success: false,
          error: 'Could not connect to current page. Please refresh the page and try again.'
        });
      }
    });
    return true;
  }

  // Forward OCR progress and results from Offscreen back to origin tab or popup
  if (request.action === 'ocrProgress' || request.action === 'ocrSuccess' || 
      request.action === 'ocrError' || request.action === 'ocrCancelled') {
    const targetTabId = activeJobs.get(request.jobId);
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, request).catch(() => {});
    }
    // Also forward to popup in case popup initiated it
    chrome.runtime.sendMessage({ ...request, isBroadcast: true }).catch(() => {});

    if (request.action === 'ocrSuccess' || request.action === 'ocrError' || request.action === 'ocrCancelled') {
      activeJobs.delete(request.jobId);
    }
  }
});

async function handleCaptureAndOcr(request, sender, sendResponse) {
  try {
    const tab = sender.tab;
    if (!tab || !tab.id) {
      throw new Error('No valid sender tab for screen capture.');
    }

    // Capture visible tab as PNG
    const dataUri = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!dataUri) {
      throw new Error('Failed to capture screen image. Please check tab visibility.');
    }

    const jobId = 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    activeJobs.set(jobId, tab.id);

    await ensureOffscreenDocument();

    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'performOcr',
      jobId: jobId,
      imageUri: dataUri,
      crop: request.crop,
      lang: request.lang || 'eng'
    });

    sendResponse({ success: true, jobId });
  } catch (err) {
    sendResponse({ success: false, error: err.message || 'Capture failed.' });
  }
}

async function handleImageOcr(request, sender, sendResponse) {
  try {
    const tabId = (sender && sender.tab) ? sender.tab.id : request.tabId;
    const jobId = 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    
    if (tabId) {
      activeJobs.set(jobId, tabId);
    }

    await ensureOffscreenDocument();

    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'performOcr',
      jobId: jobId,
      imageUri: request.imageUri,
      crop: null,
      lang: request.lang || 'eng'
    });

    sendResponse({ success: true, jobId });
  } catch (err) {
    sendResponse({ success: false, error: err.message || 'Image OCR failed.' });
  }
}
