let worker = null;
let currentWorkerLang = null;
let activeJobId = null;
let idleTimer = null;
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (!activeJobId && worker) {
      console.log('[Copy Unlocker OCR] Terminating idle worker to free memory.');
      try {
        await worker.terminate();
      } catch (err) {
        console.warn('Error terminating idle worker:', err);
      }
      worker = null;
      currentWorkerLang = null;
    }
  }, IDLE_TIMEOUT_MS);
}

async function initWorker(lang = 'eng', onProgress) {
  if (worker && currentWorkerLang === lang) {
    return worker;
  }

  if (worker) {
    try {
      await worker.terminate();
    } catch (e) {
      console.warn('Terminating previous worker failed:', e);
    }
    worker = null;
    currentWorkerLang = null;
  }

  const workerPath = chrome.runtime.getURL('lib/worker.min.js');
  const langPath = chrome.runtime.getURL('lib/tessdata');
  
  // Try SIMD core first, fall back to non-SIMD if needed
  let corePath = chrome.runtime.getURL('lib/tesseract-core-simd-lstm.wasm.js');

  try {
    worker = await Tesseract.createWorker(lang, 1, {
      workerPath: workerPath,
      corePath: corePath,
      langPath: langPath,
      gzip: false,
      workerBlobURL: false,
      logger: (m) => {
        if (onProgress) onProgress(m);
      }
    });
  } catch (simdErr) {
    console.warn('[Copy Unlocker OCR] SIMD core failed, attempting standard LSTM core:', simdErr);
    corePath = chrome.runtime.getURL('lib/tesseract-core-lstm.wasm.js');
    worker = await Tesseract.createWorker(lang, 1, {
      workerPath: workerPath,
      corePath: corePath,
      langPath: langPath,
      gzip: false,
      workerBlobURL: false,
      logger: (m) => {
        if (onProgress) onProgress(m);
      }
    });
  }

  currentWorkerLang = lang;
  return worker;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isDataUri = src && src.startsWith('data:');
    if (!isDataUri) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (!isDataUri) {
        reject(new Error('This image could not be accessed directly due to website cross-origin restrictions (CORS). Please right-click the image, choose "Save image as...", and then use "Extract from Image File" in Copy Unlocker.'));
      } else {
        reject(new Error('Failed to load image data. The format may be unsupported or corrupted.'));
      }
    };
    img.src = src;
  });
}

function cropImage(img, crop) {
  const canvas = document.createElement('canvas');
  
  // Calculate exact scale factor for width and height relative to captured pixels
  const scaleX = img.naturalWidth > 0 && crop.viewportWidth ? (img.naturalWidth / crop.viewportWidth) : (crop.dpr || 1);
  const scaleY = img.naturalHeight > 0 && crop.viewportHeight ? (img.naturalHeight / crop.viewportHeight) : (crop.dpr || 1);

  const sx = Math.max(0, Math.round(crop.x * scaleX));
  const sy = Math.max(0, Math.round(crop.y * scaleY));
  const sWidth = Math.min(img.naturalWidth - sx, Math.round(crop.width * scaleX));
  const sHeight = Math.min(img.naturalHeight - sy, Math.round(crop.height * scaleY));

  if (sWidth <= 0 || sHeight <= 0) {
    throw new Error('Selection region is empty or outside the visible screen area.');
  }

  canvas.width = sWidth;
  canvas.height = sHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

  // Compact thumbnail preview for UI
  const maxThumbWidth = 320;
  const maxThumbHeight = 160;
  let thumbW = sWidth;
  let thumbH = sHeight;

  if (thumbW > maxThumbWidth || thumbH > maxThumbHeight) {
    const ratio = Math.min(maxThumbWidth / thumbW, maxThumbHeight / thumbH);
    thumbW = Math.max(1, Math.round(thumbW * ratio));
    thumbH = Math.max(1, Math.round(thumbH * ratio));
  }

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d');
  thumbCtx.drawImage(canvas, 0, 0, thumbW, thumbH);

  return {
    canvas,
    previewUrl: thumbCanvas.toDataURL('image/png', 0.85)
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') return;

  if (request.action === 'performOcr') {
    handlePerformOcr(request);
    sendResponse({ received: true });
    return true;
  }

  if (request.action === 'cancelOcr') {
    handleCancelOcr(request.jobId);
    sendResponse({ cancelled: true });
    return true;
  }

  if (request.action === 'releaseWorker') {
    if (worker) {
      worker.terminate().catch(console.warn);
      worker = null;
      currentWorkerLang = null;
    }
    sendResponse({ released: true });
    return true;
  }
});

async function handleCancelOcr(jobId) {
  if (activeJobId && (!jobId || activeJobId === jobId)) {
    console.log('[Copy Unlocker OCR] Cancelling job:', activeJobId);
    activeJobId = null;
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        console.warn('Worker terminate error on cancel:', e);
      }
      worker = null;
      currentWorkerLang = null;
    }
    chrome.runtime.sendMessage({
      action: 'ocrCancelled',
      jobId: jobId
    }).catch(() => {});
  }
}

async function handlePerformOcr({ jobId, imageUri, crop, lang = 'eng' }) {
  activeJobId = jobId;
  resetIdleTimer();

  try {
    chrome.runtime.sendMessage({
      action: 'ocrProgress',
      jobId,
      status: 'loading_image',
      progress: 0.1,
      message: 'Loading image data...'
    }).catch(() => {});

    const img = await loadImage(imageUri);
    let target = img;
    let previewUrl = null;

    if (crop) {
      const cropped = cropImage(img, crop);
      target = cropped.canvas;
      previewUrl = cropped.previewUrl;
    } else {
      // Create thumbnail preview of full image
      const thumbCanvas = document.createElement('canvas');
      const maxThumbWidth = 320;
      const maxThumbHeight = 160;
      let thumbW = img.naturalWidth || 300;
      let thumbH = img.naturalHeight || 200;
      const ratio = Math.min(maxThumbWidth / thumbW, maxThumbHeight / thumbH, 1);
      thumbCanvas.width = Math.max(1, Math.round(thumbW * ratio));
      thumbCanvas.height = Math.max(1, Math.round(thumbH * ratio));
      const thumbCtx = thumbCanvas.getContext('2d');
      thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
      previewUrl = thumbCanvas.toDataURL('image/png', 0.85);
    }

    if (activeJobId !== jobId) return; // Cancelled

    chrome.runtime.sendMessage({
      action: 'ocrProgress',
      jobId,
      status: 'init_worker',
      progress: 0.25,
      message: 'Initializing local OCR engine...'
    }).catch(() => {});

    const tesseractWorker = await initWorker(lang, (m) => {
      if (activeJobId !== jobId) return;
      let pct = 0.3;
      let msg = 'Recognizing visible text...';
      if (m.status === 'recognizing text') {
        pct = 0.3 + (m.progress * 0.65);
        msg = `Recognizing text (${Math.round(m.progress * 100)}%)...`;
      } else if (m.status === 'loading tesseract core') {
        pct = 0.2;
        msg = 'Loading local OCR core...';
      } else if (m.status === 'loading language traineddata') {
        pct = 0.25;
        msg = 'Loading local language model...';
      }
      chrome.runtime.sendMessage({
        action: 'ocrProgress',
        jobId,
        status: m.status,
        progress: pct,
        message: msg
      }).catch(() => {});
    });

    if (activeJobId !== jobId) return; // Cancelled

    const ret = await tesseractWorker.recognize(target);

    if (activeJobId !== jobId) return; // Cancelled

    const rawText = ret && ret.data && ret.data.text ? ret.data.text : '';
    const cleanText = rawText.trim();
    const confidence = ret && ret.data ? ret.data.confidence : 0;

    activeJobId = null;
    resetIdleTimer();

    chrome.runtime.sendMessage({
      action: 'ocrSuccess',
      jobId,
      text: cleanText,
      confidence,
      previewUrl
    }).catch(() => {});

  } catch (err) {
    if (activeJobId === jobId) {
      activeJobId = null;
      resetIdleTimer();
      chrome.runtime.sendMessage({
        action: 'ocrError',
        jobId,
        error: err.message || 'An error occurred during text extraction.'
      }).catch(() => {});
    }
  }
}
