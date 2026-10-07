document.addEventListener('DOMContentLoaded', async () => {
  const statusText = document.getElementById('status-text');
  const hostnameEl = document.getElementById('hostname');
  const toggleBtn = document.getElementById('toggle-btn');
  const errorMsg = document.getElementById('error-message');

  let currentTab = null;
  let currentHostname = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab || !tab.url) {
      throw new Error("Unable to access current tab.");
    }

    const url = new URL(tab.url);
    currentHostname = url.hostname;
    
    // Check for protected pages
    if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.hostname === 'chrome.google.com') {
      showError("This page cannot be modified by Chrome extensions.");
      hostnameEl.textContent = currentHostname || url.protocol;
      return;
    }

    hostnameEl.textContent = currentHostname;

    // Load state from storage
    const result = await chrome.storage.local.get([currentHostname]);
    const isEnabled = result[currentHostname] === true;

    updateUI(isEnabled);

    toggleBtn.addEventListener('click', async () => {
      const newState = !toggleBtn.classList.contains('disable-btn');
      
      // Save to storage
      await chrome.storage.local.set({ [currentHostname]: newState });
      
      // Update UI
      updateUI(newState);
      
      // Notify content script
      try {
        await chrome.tabs.sendMessage(currentTab.id, { 
          action: 'toggle', 
          enabled: newState,
          hostname: currentHostname
        });
      } catch (err) {
        console.warn("Content script not reachable, maybe reload page?", err);
      }
    });

  } catch (err) {
    showError(err.message || "An error occurred.");
  }

  function updateUI(isEnabled) {
    toggleBtn.disabled = false;
    if (isEnabled) {
      statusText.textContent = "Copy is currently enabled";
      statusText.style.color = "#15803d"; // green
      toggleBtn.textContent = "Disable Copy";
      toggleBtn.className = "disable-btn";
    } else {
      statusText.textContent = "Copy is currently disabled";
      statusText.style.color = "#4b5563"; // gray
      toggleBtn.textContent = "Enable Copy";
      toggleBtn.className = "enable-btn";
    }
  }

  function showError(msg) {
    statusText.textContent = "Unavailable";
    statusText.style.color = "#b91c1c";
    toggleBtn.disabled = true;
    toggleBtn.textContent = "Enable Copy";
    toggleBtn.className = "enable-btn";
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }
});
