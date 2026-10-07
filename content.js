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
    if (styleElement) return;
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
    
    if (document.head || document.documentElement) {
      (document.head || document.documentElement).appendChild(styleElement);
    }
  }

  function removeCSS() {
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
    styleElement = null;
  }

  function attachEvents() {
    eventsToIntercept.forEach(evt => {
      document.addEventListener(evt, stopPropagationHandler, true);
    });
    keyEvents.forEach(evt => {
      document.addEventListener(evt, stopPropagationHandler, true);
    });
  }

  function detachEvents() {
    eventsToIntercept.forEach(evt => {
      document.removeEventListener(evt, stopPropagationHandler, true);
    });
    keyEvents.forEach(evt => {
      document.removeEventListener(evt, stopPropagationHandler, true);
    });
  }

  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!isEnabled) return;
      if (styleElement && !document.getElementById('copy-unlocker-style')) {
        if (document.head || document.documentElement) {
          (document.head || document.documentElement).appendChild(styleElement);
        }
      }
    });
    // Use body or documentElement
    const target = document.body || document.documentElement;
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
    isEnabled = true;
    injectCSS();
    attachEvents();
    startObserver();
  }

  function disableCopy() {
    isEnabled = false;
    removeCSS();
    detachEvents();
    stopObserver();
  }

  // Initial check on load
  const hostname = window.location.hostname;
  if (hostname) {
    chrome.storage.local.get([hostname], (result) => {
      if (result[hostname] === true) {
        enableCopy();
      }
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      if (request.enabled) {
        enableCopy();
      } else {
        disableCopy();
      }
      sendResponse({ status: 'ok' });
    }
    
    if (request.action === 'getState') {
      sendResponse({ enabled: isEnabled });
    }
  });
})();
