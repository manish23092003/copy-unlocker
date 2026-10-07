# Copy Unlocker

> Chrome extension that restores normal text selection and copying on webpages that block common copy interactions.

A Chrome extension that restores normal text selection and copying on webpages where copy/selection has been disabled through common CSS or JavaScript restrictions.

## Features
- **Unblocks Copying:** Overrides aggressive CSS (`user-select: none`) that prevents text selection.
- **Bypasses JS Restrictions:** Intercepts event-based copy blocking (`copy`, `cut`, `paste`, `contextmenu`).
- **Site-Specific Toggles:** Remembers your preferences per website so you don't have to enable it repeatedly.
- **SPA Support:** Works seamlessly with Single Page Applications and dynamically loaded content.
- **Lightweight & Fast:** Runs in vanilla JavaScript with no bloated frameworks or heavy dependencies.

## How it works
Many websites disable text selection or right-clicking using CSS rules or JavaScript event listeners. When enabled, Copy Unlocker automatically injects a CSS override (`user-select: text !important`) to make the text selectable again. It also intercepts relevant events in the document's Capture phase, preventing the website's scripts from blocking your ability to copy or open the context menu.

## Installation
Currently, you can install the extension manually by loading it into Chrome.

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to: `chrome://extensions/`
3. Turn on **Developer mode** (toggle switch in the top right corner).
4. Click **Load unpacked** in the top left corner.
5. Select the `copy-unlocker` directory from your computer.

## How to use
1. Navigate to a webpage where copying is restricted.
2. Click the Copy Unlocker icon in your browser toolbar (you may want to pin it).
3. Click the **Enable Copy** button.
4. Select the desired text and press `Ctrl+C` (or right-click and Copy) normally.
5. To restore the website's original behavior, simply click **Disable Copy**.

### Keyboard Shortcut
You can quickly toggle Copy Unlocker for the active tab by pressing:
**`Alt+Shift+C`**

*(Note: If this conflicts with your OS or another extension, you can customize it at `chrome://extensions/shortcuts`)*

## Project structure
```text
copy-unlocker/
├── manifest.json       # Core extension configuration (Manifest V3)
├── popup.html          # UI layout for the extension popup
├── popup.css           # Styling for the popup
├── popup.js            # Popup interaction logic
├── content.js          # Script injected into webpages to lift restrictions
├── background.js       # Background worker for shortcut handling
├── icons/              # Extension icons
├── README.md           # Project documentation
└── LICENSE             # MIT License
```

## Privacy & Security
This extension is designed with your privacy in mind:
- **Runs entirely locally:** It operates solely within your browser.
- **Does not upload copied text:** Your clipboard data is never read by the extension itself, nor is it transmitted anywhere.
- **Does not collect browsing history:** No analytics, tracking, or data harvesting is included.
- **Does not use external APIs:** All functionality is self-contained.

## Limitations
- By overriding `contextmenu` events, this extension may inadvertently block custom right-click menus that a website *legitimately* provides. Since Copy Unlocker acts as a simple toggle, you can quickly disable it when you need to access those custom menus.
- It cannot override behavior on protected Chrome pages (e.g., `chrome://` URLs or the Chrome Web Store).

## Disclaimer
This extension is intended for legitimate accessibility, personal note-taking, and fair use. It does not bypass paywalls, authentication, or digital rights management (DRM) systems.

## License
This project is licensed under the [MIT License](LICENSE).
