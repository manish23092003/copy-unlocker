# Copy Unlocker

> Chrome extension that restores normal text selection and copying, and extracts visible text from images and screen regions via 100% local, private OCR.

A lightweight, privacy-first Manifest V3 Chrome extension that restores normal text selection and copying on webpages where copy/selection has been disabled, and enables one-click OCR text extraction from images and custom screen regions.

---

## Features

### 1. Website Copy Protection Restoration
- **Unblocks Copying:** Overrides aggressive CSS (`user-select: none`) that prevents text selection.
- **Bypasses JS Restrictions:** Intercepts event-based copy blocking (`copy`, `cut`, `paste`, `contextmenu`, `selectstart`, `dragstart`).
- **Site-Specific Toggles:** Remembers your preferences per website so you don't have to re-enable it repeatedly.
- **SPA Support:** Works seamlessly with Single Page Applications and dynamically loaded content via `MutationObserver`.

### 2. Optical Character Recognition (OCR) Text Extraction
- **Image OCR:** Right-click any image on a webpage and select **"Extract Text with Copy Unlocker"** to extract its text. Supports PNG, JPEG, and WebP formats.
- **Screen-Region OCR:** Drag a rectangle across any visible area of your screen (including canvas, protected PDFs, video frames, or styled text) to extract visible text directly.
- **Isolated In-Page Modal:** Displays an editable interface inside a Shadow DOM container, preventing target webpage CSS from interfering.
- **Rich Controls:** One-click **Copy Text** (with checkmark confirmation feedback), **Select All**, **Retry OCR**, **Clear**, and **Cancel**.
- **Popup OCR Workspace:** Drag & drop or pick an image file directly in the extension popup to extract text instantly.
- **100% Local & Private:** Powered by bundled Tesseract.js (WebAssembly & offline language data). **Zero external network requests**; no images or text ever leave your computer.

---

## How It Works

### Copy Restoration
Many websites disable text selection or right-clicking using CSS rules or JavaScript event listeners. When enabled, Copy Unlocker injects a CSS override (`user-select: text !important`) and intercepts copy-blocking events during the Capture phase, preventing host page scripts from suppressing selection or the context menu.

### Local OCR Engine (Manifest V3 Compatible)
Under Chrome Manifest V3, WebAssembly and worker execution are strictly prohibited from loading remotely hosted scripts. Copy Unlocker packages the complete Tesseract runtime and language model locally:
1. When you select a screen area, `chrome.tabs.captureVisibleTab` takes a snapshot of the visible viewport.
2. The snapshot is forwarded to an **Offscreen Document**, where an HTML5 `<canvas>` crops it according to your exact selection coordinates and device pixel ratio.
3. The local Tesseract engine processes the cropped image or right-clicked image locally, streaming progress (0–100%) back to the UI.
4. The extracted text is displayed in an editable textarea for review, editing, and copying.

---

## Installation

Currently, you can install the extension manually by loading it into Chrome:

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to: `chrome://extensions/`
3. Turn on **Developer mode** (toggle switch in the top right corner).
4. Click **Load unpacked** in the top left corner.
5. Select the `copy-unlocker` directory from your computer.

---

## How to Use

### Bypassing Copy Restrictions
1. Navigate to a webpage where copying or selecting is restricted.
2. Click the Copy Unlocker icon in your browser toolbar (pin it for quick access).
3. Click the **Enable Copy Unlocker** button (or press `Alt+Shift+C`).
4. Select the desired text and press `Ctrl+C` (or right-click and Copy) normally.

### Extracting Text from Screen Regions
1. Press **`Alt+Shift+V`** or click **"Capture Screen Region"** in the extension popup.
2. Click and drag a box around any visible screen content you wish to extract.
3. Release the mouse button. The OCR modal will appear, displaying live recognition progress.
4. Edit the extracted text as needed and click **Copy Text**.

### Extracting Text from Images
1. Right-click any image on a page.
2. Choose **"Extract Text with Copy Unlocker"** from the context menu.
3. The OCR dialog will open with the image thumbnail and extracted text.

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| **`Alt+Shift+C`** | Toggle Copy Unlocker for the active website |
| **`Alt+Shift+V`** | Launch Screen Region OCR selection |
| **`Escape`** | Cancel active screen selection or close OCR dialog |

*(Note: You can customize keyboard shortcuts at `chrome://extensions/shortcuts`)*

---

## Project Structure

```text
copy-unlocker/
├── manifest.json       # Core extension configuration (Manifest V3)
├── background.js       # Background service worker (shortcuts, menus, capture orchestration)
├── content.js          # Injected script (copy bypass, screen selection, Shadow DOM modal)
├── popup.html          # Extension popup UI layout
├── popup.css           # Styling for extension popup
├── popup.js            # Popup interaction logic
├── offscreen.html      # Offscreen document host for local OCR
├── offscreen.js        # Local Tesseract worker lifecycle, canvas cropping, and recognition
├── lib/                # 100% locally bundled OCR engine and model
│   ├── tesseract.min.js
│   ├── worker.min.js
│   ├── tesseract-core-lstm.wasm.js
│   ├── tesseract-core-lstm.wasm
│   ├── tesseract-core-simd-lstm.wasm.js
│   ├── tesseract-core-simd-lstm.wasm
│   └── tessdata/
│       └── eng.traineddata # Uncompressed offline language model (Edge & Chrome compliant)
├── icons/              # Extension icons (16, 32, 48, 128)
├── tests/              # Automated verification test suite
├── tools/              # Release packaging and asset generation utilities
├── README.md           # Documentation
└── LICENSE             # MIT License
```

---

## Privacy & Security

This extension adheres to strict privacy and security principles:
- **Zero External Network Calls:** Operates 100% offline. No analytics, tracking, or remote API calls.
- **No Remote Code Execution:** All WebAssembly and worker scripts are packaged locally, fully compliant with Chrome Web Store Manifest V3 guidelines.
- **Voluntary OCR Only:** OCR is never executed automatically in the background. It is triggered only upon an explicit user action (context menu click, shortcut, or screen drag).
- **Transient Memory Usage:** Captured screen regions and worker memory are held only for the duration of the recognition task; idle workers are terminated after inactivity to preserve system resources.

---

## Limitations

- **Browser-Internal Pages:** Like all Chrome extensions, Copy Unlocker cannot inject content scripts or capture screenshots on protected browser pages (e.g., `chrome://`, `chrome-extension://`, and the Chrome Web Store).
- **OCR Accuracy:** Recognition accuracy depends on image resolution, contrast, and font clarity. OCR captures visible rendered pixels and cannot reconstruct content that was obscured or outside the viewport.

---

## Testing & Packaging

### Run Automated Verification Suite
```bash
node tests/verify_implementation.js
```
Runs comprehensive automated checks covering:
- Restricted URL and browser-protected page filtering
- Tab messaging and dynamic scripting injection fallback
- Enable/disable state transitions and DOM style cleanup
- Multi-frame isolation and top-level guard
- Microsoft Edge Add-ons nested compression compliance

### Build Release ZIP
```bash
python tools/build_release_zip.py
```
Validates all required files and builds clean, unnested distribution ZIP packages ready for upload:
- `copy-unlocker.zip` (for Microsoft Edge Add-ons Partner Center)
- `copy-unlocker-v1.1.0.zip` (for Chrome Web Store Developer Dashboard)

---

## License

This project is licensed under the [MIT License](LICENSE).
