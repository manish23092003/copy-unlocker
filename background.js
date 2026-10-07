chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-copy-unlocker') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) return;
    
    const url = new URL(tab.url);
    
    // Ignore protected pages
    if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.hostname === 'chrome.google.com') {
      return; 
    }
    
    const hostname = url.hostname;
    
    const result = await chrome.storage.local.get([hostname]);
    const currentState = result[hostname] === true;
    const newState = !currentState;
    
    // Save new state
    await chrome.storage.local.set({ [hostname]: newState });
    
    // Notify content script
    try {
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'toggle', 
        enabled: newState,
        hostname: hostname
      });
    } catch (err) {
      console.warn("Content script not reachable.", err);
    }
  }
});
