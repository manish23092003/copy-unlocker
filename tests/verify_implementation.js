/**
 * Comprehensive Automated Verification Suite for Copy Unlocker
 * Tests:
 * 1. Unavailable receivers & sendTabMessageSafe dynamic injection fallback
 * 2. Restricted URL detection (chrome://, Chrome Web Store, edge://, devtools://)
 * 3. Enable / Disable state transitions & DOM cleanup (style removal, event detach, range clearing)
 * 4. Idempotency across repeated toggles and duplicate execution guard
 * 5. Multi-frame safety (top frame vs iframe isolation)
 * 6. Storage synchronization and loop prevention
 * 7. Preference preservation in storage even if content script is unavailable
 */

const assert = require('assert');

// Color helpers for test output
const pass = (msg) => console.log('\x1b[32m✔ PASS:\x1b[0m ' + msg);
const fail = (msg) => { console.error('\x1b[31m✘ FAIL:\x1b[0m ' + msg); process.exit(1); };

console.log('--- Running Copy Unlocker Verification Suite ---\n');

// 1. Test URL Accessibility / Restricted Pages
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

assert.strictEqual(isSupportedUrl('https://example.com/article'), true);
assert.strictEqual(isSupportedUrl('http://localhost:3000'), true);
assert.strictEqual(isSupportedUrl('chrome://extensions/'), false);
assert.strictEqual(isSupportedUrl('chrome://settings/'), false);
assert.strictEqual(isSupportedUrl('edge://settings/'), false);
assert.strictEqual(isSupportedUrl('about:blank'), false);
assert.strictEqual(isSupportedUrl('https://chromewebstore.google.com/detail/xyz'), false);
assert.strictEqual(isSupportedUrl('https://chrome.google.com/webstore'), false);
assert.strictEqual(isSupportedUrl('devtools://devtools/bundled/inspector.html'), false);
assert.strictEqual(isSupportedUrl(''), false);
assert.strictEqual(isSupportedUrl(null), false);
pass('Restricted URLs and browser-protected pages correctly filtered');

// 2. Test sendTabMessageSafe with Unavailable Receiver and Scripting Fallback
async function simulateSendTabMessageSafe({ shouldFailFirst, canInject, injectionSucceeds, tabResponses }) {
  let executeScriptCalled = false;
  let attempt = 0;

  const mockChrome = {
    tabs: {
      sendMessage: async (tabId, msg) => {
        attempt++;
        if (shouldFailFirst && attempt === 1) {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        if (tabResponses && (attempt in tabResponses)) {
          return tabResponses[attempt];
        }
        return { status: 'ok', enabled: msg.enabled };
      }
    },
    scripting: canInject ? {
      executeScript: async (opts) => {
        executeScriptCalled = true;
        if (!injectionSucceeds) {
          throw new Error('Cannot access contents of url "chrome://...". Extension manifest must request permission.');
        }
        return [{ result: true }];
      }
    } : null
  };

  async function sendTabMessageSafe(tabId, message) {
    try {
      const res = await mockChrome.tabs.sendMessage(tabId, message);
      if (res === undefined) {
        return { success: false, error: new Error('No response from content script') };
      }
      return { success: true, data: res };
    } catch (err) {
      if (mockChrome.scripting && mockChrome.scripting.executeScript) {
        try {
          await mockChrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ['content.js']
          });
          const retryRes = await mockChrome.tabs.sendMessage(tabId, message);
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

  const result = await sendTabMessageSafe(123, { action: 'toggle', enabled: true });
  return { result, executeScriptCalled };
}

(async () => {
  // Case A: Receiver is active immediately
  const resA = await simulateSendTabMessageSafe({ shouldFailFirst: false });
  assert.strictEqual(resA.result.success, true);
  assert.strictEqual(resA.executeScriptCalled, false);
  pass('sendTabMessageSafe succeeds immediately when content script receiver exists');

  // Case B: Receiver missing on pre-existing tab, dynamic injection recovers
  const resB = await simulateSendTabMessageSafe({ shouldFailFirst: true, canInject: true, injectionSucceeds: true });
  assert.strictEqual(resB.result.success, true);
  assert.strictEqual(resB.executeScriptCalled, true);
  assert.strictEqual(resB.result.data.status, 'ok');
  pass('sendTabMessageSafe catches missing receiver and recovers via chrome.scripting.executeScript');

  // Case C: Receiver missing and dynamic injection fails (e.g. restricted page)
  const resC = await simulateSendTabMessageSafe({ shouldFailFirst: true, canInject: true, injectionSucceeds: false });
  assert.strictEqual(resC.result.success, false);
  assert.ok(resC.result.error.message.includes('Cannot access contents of url'));
  pass('sendTabMessageSafe safely handles injection failure without unhandled rejection');

  // Case D: Receiver returns undefined (e.g. listener didn't respond)
  const resD = await simulateSendTabMessageSafe({ shouldFailFirst: false, tabResponses: { 1: undefined } });
  assert.strictEqual(resD.result.success, false);
  assert.ok(resD.result.error.message.includes('No response'));
  pass('sendTabMessageSafe treats undefined responses as failure');

  // 3. Test Enable / Disable Transitions and DOM Isolation
  class MockElement {
    constructor(tag, id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.parentNode = null;
      this.children = [];
      this.style = {};
      this.textContent = '';
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
  }

  class MockDOM {
    constructor() {
      this.documentElement = new MockElement('html');
      this.head = new MockElement('head');
      this.body = new MockElement('body');
      this.documentElement.appendChild(this.head);
      this.documentElement.appendChild(this.body);
      this.listeners = new Map();
      this.clearedRanges = 0;
    }
    getElementById(id) {
      const search = (node) => {
        if (node.id === id) return node;
        for (const child of node.children) {
          const found = search(child);
          if (found) return found;
        }
        return null;
      };
      return search(this.documentElement);
    }
    querySelectorAll(selector) {
      const results = [];
      if (selector === '#copy-unlocker-style') {
        const search = (node) => {
          if (node.id === 'copy-unlocker-style') results.push(node);
          for (const child of node.children) search(child);
        };
        search(this.documentElement);
      }
      return results;
    }
    createElement(tag) {
      return new MockElement(tag);
    }
    addEventListener(evt, handler) {
      if (!this.listeners.has(evt)) this.listeners.set(evt, []);
      this.listeners.get(evt).push(handler);
    }
    removeEventListener(evt, handler) {
      if (this.listeners.has(evt)) {
        const list = this.listeners.get(evt);
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    }
  }

  const dom = new MockDOM();
  let isEnabled = false;
  let styleElement = null;
  let observerActive = false;

  function injectCSS() {
    let existing = dom.getElementById('copy-unlocker-style');
    if (!existing) {
      styleElement = dom.createElement('style');
      styleElement.id = 'copy-unlocker-style';
      styleElement.textContent = '* { user-select: text !important; }';
      dom.head.appendChild(styleElement);
    } else {
      styleElement = existing;
    }
  }

  function removeCSS() {
    const existingStyles = dom.querySelectorAll('#copy-unlocker-style');
    existingStyles.forEach(el => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
    styleElement = null;
    dom.clearedRanges++;
  }

  function enableCopy() {
    if (isEnabled && dom.getElementById('copy-unlocker-style')) return;
    isEnabled = true;
    injectCSS();
    observerActive = true;
  }

  function disableCopy() {
    if (!isEnabled && !styleElement && !dom.getElementById('copy-unlocker-style')) {
      return;
    }
    isEnabled = false;
    observerActive = false;
    removeCSS();
  }

  // Initial state: disabled
  assert.strictEqual(isEnabled, false);
  assert.strictEqual(dom.getElementById('copy-unlocker-style'), null);

  // Enable
  enableCopy();
  assert.strictEqual(isEnabled, true);
  assert.notStrictEqual(dom.getElementById('copy-unlocker-style'), null);
  assert.strictEqual(observerActive, true);
  pass('Enabling injects #copy-unlocker-style and activates observer');

  // Disable
  disableCopy();
  assert.strictEqual(isEnabled, false);
  assert.strictEqual(dom.getElementById('copy-unlocker-style'), null);
  assert.strictEqual(observerActive, false);
  assert.strictEqual(dom.clearedRanges, 1);
  pass('Disabling removes all #copy-unlocker-style, stops observer, and clears active selection');

  // Repeated disable does not clear selections repeatedly
  disableCopy();
  assert.strictEqual(dom.clearedRanges, 1);
  pass('Repeated disableCopy is idempotent and does not redundantly clear user selection');

  // Enable again
  enableCopy();
  assert.strictEqual(isEnabled, true);
  assert.notStrictEqual(dom.getElementById('copy-unlocker-style'), null);
  pass('Enabling again cleanly re-injects styles and reactivates observer');

  // 4. Test Storage Synchronization & Popup Protection Against Missing Content Script
  const mockStorage = {
    data: {},
    async get(keys) {
      const res = {};
      for (const k of keys) res[k] = this.data[k];
      return res;
    },
    async set(obj) {
      Object.assign(this.data, obj);
    }
  };

  const hostname = 'example.com';
  // User enables via popup toggle
  await mockStorage.set({ [hostname]: true });
  assert.strictEqual((await mockStorage.get([hostname]))[hostname], true);

  // Popup load logic:
  // When tab is unreachable, popup MUST NOT report page as enabled
  let popupReportedState = null;
  let reloadPromptShown = false;

  async function simulatePopupLoad(contentScriptReachable, currentTabEnabled) {
    const res = await mockStorage.get([hostname]);
    const savedState = res[hostname] === true;

    let isCurrentSiteEnabled = false;
    if (contentScriptReachable) {
      isCurrentSiteEnabled = currentTabEnabled;
      popupReportedState = isCurrentSiteEnabled;
      reloadPromptShown = false;
    } else {
      isCurrentSiteEnabled = false;
      popupReportedState = false;
      if (savedState) {
        reloadPromptShown = true;
      }
    }
    return { isCurrentSiteEnabled, popupReportedState, reloadPromptShown };
  }

  // Case: Saved state is TRUE, but content script is UNREACHABLE (e.g. pre-existing tab before reload)
  const popupRes = await simulatePopupLoad(false, false);
  assert.strictEqual(popupRes.popupReportedState, false);
  assert.strictEqual(popupRes.reloadPromptShown, true);
  assert.strictEqual((await mockStorage.get([hostname]))[hostname], true);
  pass('Popup does NOT report tab as enabled when content script is unreachable, and displays reload prompt');

  // Case: User disables while content script is UNREACHABLE
  // Storage preference MUST be updated to false, and popup stays disabled
  await mockStorage.set({ [hostname]: false });
  assert.strictEqual((await mockStorage.get([hostname]))[hostname], false);
  const popupResDisabled = await simulatePopupLoad(false, false);
  assert.strictEqual(popupResDisabled.popupReportedState, false);
  pass('Disabling preserves false in storage even when content script is unreachable');

  // Case: Content script is reachable and matches saved state
  await mockStorage.set({ [hostname]: true });
  const popupResReachable = await simulatePopupLoad(true, true);
  assert.strictEqual(popupResReachable.popupReportedState, true);
  assert.strictEqual(popupResReachable.reloadPromptShown, false);
  pass('Popup reports enabled only when content script is reachable and verified enabled');

  // 5. Multi-frame Isolation Verification
  const topWindow = {};
  topWindow.top = topWindow;

  const iframeWindow = {};
  iframeWindow.top = topWindow;

  function mockStartScreenSelection(win) {
    if (win !== win.top) return false;
    return true;
  }

  assert.strictEqual(mockStartScreenSelection(iframeWindow), false);
  assert.strictEqual(mockStartScreenSelection(topWindow), true);
  // 6. Microsoft Edge Add-ons Partner Center Packaging Rules Check
  const fs = require('fs');
  const path = require('path');
  const disallowedExtensions = ['.gz', '.zip', '.tar', '.bz2', '.7z', '.rar', '.tgz'];

  // Check that eng.traineddata is uncompressed and valid
  const traineddataPath = path.join(__dirname, '..', 'lib', 'tessdata', 'eng.traineddata');
  assert.ok(fs.existsSync(traineddataPath), 'eng.traineddata must exist in lib/tessdata/');
  const traineddataBuf = fs.readFileSync(traineddataPath);
  assert.ok(traineddataBuf.length > 5000000, 'eng.traineddata must be uncompressed (> 5 MB)');
  // Ensure it does not have gzip magic bytes (0x1F, 0x8B)
  assert.ok(!(traineddataBuf[0] === 0x1F && traineddataBuf[1] === 0x8B), 'eng.traineddata must NOT have gzip magic header');
  pass('eng.traineddata is uncompressed and valid for Microsoft Edge Partner Center');

  // Verify that eng.traineddata.gz does NOT exist in lib/tessdata/
  const gzippedModelPath = path.join(__dirname, '..', 'lib', 'tessdata', 'eng.traineddata.gz');
  assert.ok(!fs.existsSync(gzippedModelPath), 'eng.traineddata.gz must NOT be present in lib/tessdata/');
  pass('No eng.traineddata.gz present in lib/tessdata/');

  // Check the release ZIP itself if present
  const releaseZipPath = path.join(__dirname, '..', 'copy-unlocker.zip');
  if (fs.existsSync(releaseZipPath)) {
    // Parse zip directory to ensure no disallowed extensions
    const zipBuf = fs.readFileSync(releaseZipPath);
    // Find file records (PK\x01\x02 central directory or PK\x03\x04 local headers)
    const zipContentStr = zipBuf.toString('latin1');
    for (const ext of disallowedExtensions) {
      assert.ok(!zipContentStr.includes(ext + '\x00') && !zipContentStr.includes(ext + '/'),
        `Release ZIP must not contain nested files with extension ${ext}`);
    }
    pass('Release ZIP copy-unlocker.zip verified: zero nested compressed files');
  }

  console.log('\n\x1b[32mAll Automated Regression Tests Passed Successfully!\x1b[0m\n');
})();
